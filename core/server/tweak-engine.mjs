/**
 * Tweak Engine — script discovery, sandbox context, snapshot system, replay.
 *
 * All functions are pure with respect to the server's HTTP/WS layer.
 * Use createTweakEngine(rootDir) to get a bound engine instance.
 */

import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { watch } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import fg from 'fast-glob';

/**
 * @param {string} rootDir  — project root (where tweaks/ lives)
 * @returns engine API
 */
export function createTweakEngine(rootDir) {
  const SCRIPTS_DIR = resolve(rootDir, '.design-bridge', 'tweaks');
  const CACHE_DIR = resolve(rootDir, '.design-bridge', '.cache');

  /** @type {Array<{ meta: object; defaultValue: any; scriptPath: string }>} */
  let scripts = [];

  // ── Snapshot helpers ──────────────────────────────────────────────────────

  function snapshotPath(absFilePath) {
    const key = Buffer.from(absFilePath).toString('base64url');
    return resolve(CACHE_DIR, `${key}.orig`);
  }

  async function ensureSnapshot(absFilePath) {
    const snap = snapshotPath(absFilePath);
    try {
      await access(snap);
      return;
    } catch {
      /* not yet snapshotted */
    }
    await mkdir(CACHE_DIR, { recursive: true });
    const content = await readFile(absFilePath, 'utf-8');
    await writeFile(snap, content, 'utf-8');
  }

  async function readSnapshot(absFilePath) {
    try {
      return await readFile(snapshotPath(absFilePath), 'utf-8');
    } catch {
      return null;
    }
  }

  async function deleteSnapshot(absFilePath) {
    await rm(snapshotPath(absFilePath), { force: true });
  }

  // ── Sandbox context (passed to each script's apply()) ─────────────────────

  function makeCtx() {
    function guard(filePath) {
      const abs = isAbsolute(filePath) ? filePath : resolve(rootDir, filePath);
      if (relative(rootDir, abs).startsWith('..')) {
        throw new Error(`[design-bridge] path "${filePath}" is outside project root — blocked`);
      }
      return abs;
    }
    return {
      async readFile(filePath) {
        return readFile(guard(filePath), 'utf-8');
      },
      async writeFile(filePath, content) {
        await writeFile(guard(filePath), content, 'utf-8');
      },
      async findFiles(pattern) {
        const abs = isAbsolute(pattern) ? pattern : resolve(rootDir, pattern);
        return fg(abs, { onlyFiles: true, absolute: true });
      },
      async replaceInFile(filePath, find, replacement) {
        const abs = guard(filePath);
        const content = await readFile(abs, 'utf-8');
        await writeFile(
          abs,
          content.replace(find instanceof RegExp ? find : new RegExp(find, 'g'), replacement),
          'utf-8',
        );
      },
      console: {
        log: (...a) => console.log('[tweak]', ...a),
        warn: (...a) => console.warn('[tweak]', ...a),
        error: (...a) => console.error('[tweak]', ...a),
      },
    };
  }

  // ── Dry run — discover which files a script would touch ───────────────────

  async function dryRun(script, value) {
    const touched = [];
    const base = makeCtx();
    function guard(p) {
      return isAbsolute(p) ? p : resolve(rootDir, p);
    }
    const dryCtx = {
      ...base,
      async writeFile(p) {
        touched.push(guard(p));
      },
      async replaceInFile(p) {
        touched.push(guard(p));
      },
    };
    try {
      const mod = await import(pathToFileURL(script.scriptPath).href + `?t=${Date.now()}`);
      if (typeof mod.apply === 'function') await mod.apply(value, dryCtx);
    } catch {
      /* ignore — readFile may throw in dry run */
    }
    return [...new Set(touched)];
  }

  // ── Replay engine ─────────────────────────────────────────────────────────

  async function replayAllTweaks() {
    const allTouched = new Set();
    for (const s of scripts) {
      for (const f of await dryRun(s, s.meta.value)) allTouched.add(f);
    }
    if (allTouched.size === 0) return;

    for (const f of allTouched) await ensureSnapshot(f);
    for (const f of allTouched) {
      const orig = await readSnapshot(f);
      if (orig !== null) await writeFile(f, orig, 'utf-8');
    }

    const ctx = makeCtx();
    for (const s of scripts) {
      try {
        const mod = await import(pathToFileURL(s.scriptPath).href + `?t=${Date.now()}`);
        if (typeof mod.apply === 'function') await mod.apply(s.meta.value, ctx);
      } catch (e) {
        console.error(`[design-bridge] replay error in "${s.meta.id}":`, e);
      }
    }
  }

  // ── Script operations ─────────────────────────────────────────────────────

  async function applyTweakChange(marker, value) {
    const script = scripts.find((s) => s.meta.id === marker);
    if (!script) {
      console.warn(`[design-bridge] tweak "${marker}" not found`);
      return;
    }
    script.meta.value = value;
    console.log(`[design-bridge] tweak "${marker}" → ${value}`);
    await replayAllTweaks();
  }

  async function resetTweak(marker) {
    const script = scripts.find((s) => s.meta.id === marker);
    if (!script) return;
    script.meta.value = script.defaultValue;
    const anyDirty = scripts.some((s) => s.meta.value !== s.defaultValue);
    if (anyDirty) {
      await replayAllTweaks();
    } else {
      const allTouched = new Set();
      for (const s of scripts) for (const f of await dryRun(s, s.defaultValue)) allTouched.add(f);
      for (const f of allTouched) {
        const orig = await readSnapshot(f);
        if (orig !== null) {
          await writeFile(f, orig, 'utf-8');
          await deleteSnapshot(f);
        }
      }
    }
  }

  async function resetAllTweaks() {
    const allTouched = new Set();
    for (const s of scripts) for (const f of await dryRun(s, s.meta.value)) allTouched.add(f);
    for (const s of scripts) s.meta.value = s.defaultValue;
    for (const f of allTouched) {
      const orig = await readSnapshot(f);
      if (orig !== null) {
        await writeFile(f, orig, 'utf-8');
        await deleteSnapshot(f);
      }
    }
  }

  /**
   * Finalize a subset of scripts (make their changes permanent), then replay the rest.
   * @param {typeof scripts} toFinalize
   * @param {typeof scripts} toKeep
   */
  async function finalizeScripts(toFinalize, toKeep) {
    if (toFinalize.length === 0) return;

    const allScripts = [...toFinalize, ...toKeep];

    const allTouched = new Set();
    for (const s of allScripts) for (const f of await dryRun(s, s.meta.value)) allTouched.add(f);
    for (const f of allTouched) await ensureSnapshot(f);

    for (const f of allTouched) {
      const orig = await readSnapshot(f);
      if (orig !== null) await writeFile(f, orig, 'utf-8');
    }

    const ctx = makeCtx();
    for (const s of toFinalize) {
      try {
        const mod = await import(pathToFileURL(s.scriptPath).href + `?t=${Date.now()}`);
        if (typeof mod.apply === 'function') await mod.apply(s.meta.value, ctx);
      } catch (e) {
        console.error(`[design-bridge] finalize error in "${s.meta.id}":`, e);
      }
    }

    const finalizedFiles = new Set();
    for (const s of toFinalize)
      for (const f of await dryRun(s, s.meta.value)) finalizedFiles.add(f);
    for (const f of finalizedFiles) {
      await deleteSnapshot(f);
      try {
        const content = await readFile(f, 'utf-8');
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(snapshotPath(f), content, 'utf-8');
      } catch {
        /* file might not exist */
      }
    }

    for (const s of toFinalize) await rm(s.scriptPath, { force: true });

    scripts = toKeep;
    if (toKeep.length > 0) {
      await replayAllTweaks();
    } else {
      for (const f of finalizedFiles) await deleteSnapshot(f);
    }
  }

  async function finalizeForAnnotation(annotationId) {
    const toFinalize = scripts.filter((s) => s.meta.annotationId === annotationId);
    const toKeep = scripts.filter((s) => s.meta.annotationId !== annotationId);
    await finalizeScripts(toFinalize, toKeep);
  }

  async function finalizeOneTweak(marker) {
    const toFinalize = scripts.filter((s) => s.meta.id === marker);
    const toKeep = scripts.filter((s) => s.meta.id !== marker);
    await finalizeScripts(toFinalize, toKeep);
  }

  async function dismissTweak(marker) {
    const idx = scripts.findIndex((s) => s.meta.id === marker);
    if (idx < 0) return;
    const [dismissed] = scripts.splice(idx, 1);

    const dismissedFiles = new Set(await dryRun(dismissed, dismissed.meta.value));

    if (scripts.length > 0) {
      await replayAllTweaks();
      const keepFiles = new Set();
      for (const s of scripts) for (const f of await dryRun(s, s.meta.value)) keepFiles.add(f);
      for (const f of dismissedFiles) {
        if (!keepFiles.has(f)) await deleteSnapshot(f);
      }
    } else {
      for (const f of dismissedFiles) {
        const orig = await readSnapshot(f);
        if (orig !== null) {
          await writeFile(f, orig, 'utf-8');
          await deleteSnapshot(f);
        }
      }
    }

    await rm(dismissed.scriptPath, { force: true });
  }

  // ── Script discovery & schema ─────────────────────────────────────────────

  async function discoverScripts() {
    try {
      const files = await fg(`${SCRIPTS_DIR}/*.mjs`, { onlyFiles: true, absolute: true });
      const result = [];
      for (const filePath of files.sort()) {
        try {
          const mod = await import(pathToFileURL(filePath).href + `?t=${Date.now()}`);
          const meta = mod.meta;
          if (!meta?.id || !meta?.label) {
            console.warn(`[design-bridge] ${filePath}: missing meta.id or meta.label — skipped`);
            continue;
          }
          result.push({ meta, defaultValue: meta.value, scriptPath: filePath });
        } catch (e) {
          console.warn(`[design-bridge] failed to load ${filePath}:`, e);
        }
      }
      return result;
    } catch {
      return [];
    }
  }

  function buildSchema() {
    return scripts.map(({ meta }) => ({
      marker: meta.id,
      label: meta.label,
      type: meta.type ?? 'string',
      value: meta.value,
      min: meta.min,
      max: meta.max,
      step: meta.step,
      options: meta.options,
      annotationId: meta.annotationId,
    }));
  }

  async function reloadScripts(onReloaded) {
    scripts = await discoverScripts();
    console.log(`[design-bridge] reloaded — ${scripts.length} tweak(s)`);
    onReloaded?.();
  }

  function watchScripts(onReloaded) {
    try {
      let debounce = null;
      watch(SCRIPTS_DIR, { recursive: false }, (event, filename) => {
        if (!filename?.endsWith('.mjs')) return;
        clearTimeout(debounce);
        debounce = setTimeout(() => reloadScripts(onReloaded), 100);
      });
    } catch {
      /* scripts dir doesn't exist yet — watcher will be absent until reloaded */
    }
  }

  async function discardAll() {
    await resetAllTweaks();
    try {
      await rm(SCRIPTS_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      await rm(CACHE_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    scripts = [];
  }

  async function finalizeAll() {
    try {
      await rm(SCRIPTS_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      await rm(CACHE_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    scripts = [];
  }

  return {
    getScripts: () => scripts,
    setScripts: (s) => {
      scripts = s;
    },
    buildSchema,
    discoverScripts: async () => {
      scripts = await discoverScripts();
      return scripts;
    },
    watchScripts,
    applyTweakChange,
    resetTweak,
    resetAllTweaks,
    finalizeAll,
    discardAll,
    finalizeForAnnotation,
    finalizeOneTweak,
    dismissTweak,
  };
}
