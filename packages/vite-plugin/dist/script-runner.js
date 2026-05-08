/**
 * Design Bridge — Script Runner
 *
 * Discovers /tweaks/scripts/*.mjs, each of which exports:
 *   export const meta = { id, label, type, value, options? }
 *   export async function apply(value, ctx) { ... }
 *
 * Replay model:
 *   Every time any knob changes, the runner:
 *     1. Restores every touched file to its original (from per-file snapshot)
 *     2. Re-applies ALL active tweaks in sequence
 *
 *   This means each apply() always sees the original file content (with any
 *   previously-applied tweaks layered on top), so brittle or overlapping
 *   regexes always start from a known state.
 */
import { promises as fs } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import fg from 'fast-glob';
// ─── Script Discovery ─────────────────────────────────────────────────────────
export async function discoverScripts(scriptsDir) {
    let files;
    try {
        files = await fg(`${scriptsDir}/*.mjs`, { onlyFiles: true, absolute: true });
    }
    catch {
        return [];
    }
    const scripts = [];
    for (const filePath of files.sort()) {
        try {
            const mod = await import(pathToFileURL(filePath).href + `?t=${Date.now()}`);
            const meta = mod.meta;
            if (!meta?.id || !meta?.label) {
                console.warn(`[design-bridge] ${filePath}: missing meta.id or meta.label — skipped`);
                continue;
            }
            scripts.push({ meta, defaultValue: meta.value, scriptPath: filePath });
        }
        catch (e) {
            console.warn(`[design-bridge] failed to load ${filePath}:`, e);
        }
    }
    return scripts;
}
export function buildSchema(scripts) {
    return scripts.map(({ meta }) => ({
        marker: meta.id,
        label: meta.label,
        type: meta.type,
        value: meta.value,
        options: meta.options,
        min: meta.min,
        max: meta.max,
        step: meta.step,
    }));
}
// ─── Per-file Snapshot ────────────────────────────────────────────────────────
// Snapshots are keyed by absolute file path (base64url-encoded), stored as
// plain text files. Only the ORIGINAL content is ever snapshotted — subsequent
// writes are derived by replaying all tweaks on top of the original.
function fileSnapshotPath(cacheDir, absFilePath) {
    const key = Buffer.from(absFilePath).toString('base64url');
    return resolve(cacheDir, `${key}.orig`);
}
async function ensureFileSnapshot(cacheDir, absFilePath) {
    const snapPath = fileSnapshotPath(cacheDir, absFilePath);
    try {
        await fs.access(snapPath);
        return; // already snapshotted
    }
    catch { /* fall through */ }
    await fs.mkdir(cacheDir, { recursive: true });
    const content = await fs.readFile(absFilePath, 'utf-8');
    await fs.writeFile(snapPath, content, 'utf-8');
}
async function readFileSnapshot(cacheDir, absFilePath) {
    try {
        return await fs.readFile(fileSnapshotPath(cacheDir, absFilePath), 'utf-8');
    }
    catch {
        return null;
    }
}
async function deleteFileSnapshot(cacheDir, absFilePath) {
    await fs.rm(fileSnapshotPath(cacheDir, absFilePath), { force: true });
}
function makeSandboxCtx(rootDir) {
    function guardPath(filePath) {
        const abs = isAbsolute(filePath) ? filePath : resolve(rootDir, filePath);
        const rel = relative(rootDir, abs);
        if (rel.startsWith('..')) {
            throw new Error(`[design-bridge] path "${filePath}" is outside project root — blocked`);
        }
        return abs;
    }
    return {
        _guardPath: guardPath,
        async readFile(filePath) {
            return fs.readFile(guardPath(filePath), 'utf-8');
        },
        async writeFile(filePath, content) {
            await fs.writeFile(guardPath(filePath), content, 'utf-8');
        },
        async findFiles(pattern) {
            const abs = isAbsolute(pattern) ? pattern : resolve(rootDir, pattern);
            if (!abs.startsWith(rootDir))
                throw new Error(`[design-bridge] pattern outside project root — blocked`);
            return fg(abs, { onlyFiles: true, absolute: true });
        },
        async replaceInFile(filePath, find, replacement) {
            const abs = guardPath(filePath);
            const content = await fs.readFile(abs, 'utf-8');
            const updated = content.replace(find instanceof RegExp ? find : new RegExp(find, 'g'), replacement);
            await fs.writeFile(abs, updated, 'utf-8');
        },
        console: {
            log: (...a) => console.log('[tweak]', ...a),
            warn: (...a) => console.warn('[tweak]', ...a),
            error: (...a) => console.error('[tweak]', ...a),
        },
    };
}
// ─── Dry Run ──────────────────────────────────────────────────────────────────
/** Run a script in dry-run mode and return the absolute paths it would write. */
async function dryRun(script, value, rootDir) {
    const touched = [];
    const base = makeSandboxCtx(rootDir);
    const dryCtx = {
        ...base,
        async writeFile(filePath) {
            touched.push(base._guardPath(filePath));
        },
        async replaceInFile(filePath) {
            touched.push(base._guardPath(filePath));
        },
    };
    try {
        const mod = await importScript(script.scriptPath);
        const applyFn = mod['apply'];
        if (typeof applyFn === 'function')
            await applyFn(value, dryCtx);
    }
    catch { /* ignore — readFile may throw in dry run */ }
    return [...new Set(touched)];
}
// ─── Script Import (with cache-busting) ──────────────────────────────────────
async function importScript(scriptPath) {
    return import(pathToFileURL(scriptPath).href + `?t=${Date.now()}`);
}
// ─── Replay Engine ────────────────────────────────────────────────────────────
/**
 * Collect all files any script will touch, ensure they are snapshotted,
 * restore each to its original, then replay all scripts in order.
 * This is called after any value change so every apply() always starts
 * from a known baseline (original + previous tweaks applied in sequence).
 */
async function replayAllTweaks(state) {
    const { rootDir, cacheDir, scripts } = state;
    // Step 1: Find all files any active tweak would touch
    const allTouched = new Set();
    for (const script of scripts) {
        const files = await dryRun(script, script.meta.value, rootDir);
        for (const f of files)
            allTouched.add(f);
    }
    if (allTouched.size === 0)
        return;
    // Step 2: Snapshot each file if not already done (only ever saves the original)
    for (const filePath of allTouched) {
        await ensureFileSnapshot(cacheDir, filePath);
    }
    // Step 3: Restore every touched file to its original content
    for (const filePath of allTouched) {
        const original = await readFileSnapshot(cacheDir, filePath);
        if (original !== null)
            await fs.writeFile(filePath, original, 'utf-8');
    }
    // Step 4: Apply all tweaks in sequence — each sees the file as left by the previous
    const ctx = makeSandboxCtx(rootDir);
    for (const script of scripts) {
        try {
            const mod = await importScript(script.scriptPath);
            const applyFn = mod['apply'];
            if (typeof applyFn === 'function') {
                await applyFn(script.meta.value, ctx);
            }
        }
        catch (e) {
            console.error(`[design-bridge] replay error in "${script.meta.id}":`, e);
        }
    }
}
// ─── Public API ───────────────────────────────────────────────────────────────
export async function applyTweakChange(state, id, value) {
    const script = state.scripts.find((s) => s.meta.id === id);
    if (!script) {
        console.warn(`[design-bridge] tweak "${id}" not found`);
        return;
    }
    script.meta.value = value;
    console.log(`[design-bridge] tweak "${id}" -> ${value}`);
    await replayAllTweaks(state);
}
export async function resetTweak(state, id) {
    const script = state.scripts.find((s) => s.meta.id === id);
    if (!script)
        return;
    script.meta.value = script.defaultValue;
    // If any other tweak is still dirty, replay so their changes are preserved
    const anyDirty = state.scripts.some((s) => s.meta.value !== s.defaultValue);
    if (anyDirty) {
        await replayAllTweaks(state);
    }
    else {
        // Everything back to defaults — restore from snapshots and clean up
        const allTouched = new Set();
        for (const s of state.scripts) {
            const files = await dryRun(s, s.defaultValue, state.rootDir);
            for (const f of files)
                allTouched.add(f);
        }
        for (const filePath of allTouched) {
            const original = await readFileSnapshot(state.cacheDir, filePath);
            if (original !== null) {
                await fs.writeFile(filePath, original, 'utf-8');
                await deleteFileSnapshot(state.cacheDir, filePath);
            }
        }
    }
}
export async function resetAllTweaks(state) {
    // Collect touched files before resetting values (dry-run uses current values)
    const allTouched = new Set();
    for (const script of state.scripts) {
        const files = await dryRun(script, script.meta.value, state.rootDir);
        for (const f of files)
            allTouched.add(f);
    }
    // Reset all in-memory values
    for (const script of state.scripts) {
        script.meta.value = script.defaultValue;
    }
    // Restore files from snapshots and clean up
    for (const filePath of allTouched) {
        const original = await readFileSnapshot(state.cacheDir, filePath);
        if (original !== null) {
            await fs.writeFile(filePath, original, 'utf-8');
            await deleteFileSnapshot(state.cacheDir, filePath);
        }
    }
}
//# sourceMappingURL=script-runner.js.map