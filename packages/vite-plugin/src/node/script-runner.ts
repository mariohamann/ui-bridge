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
import type { TweakKnob } from '../shared/protocol.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScriptMeta {
  id: string;
  label: string;
  type: TweakKnob['type'];
  value: string | number | boolean;
  options?: Record<string, string>;
  min?: number;
  max?: number;
  step?: number;
  /** The annotation UUID this tweak is linked to. Written by the MCP agent. */
  annotationId?: string;
}

export interface TweakScript {
  meta: ScriptMeta;
  /** Original value from the .mjs file — restored on reset */
  defaultValue: string | number | boolean;
  scriptPath: string;
}

export interface TweakState {
  rootDir: string;
  scriptsDir: string;
  cacheDir: string;
  scripts: TweakScript[];
  broadcast: (msg: unknown) => void;
}

// ─── Script Discovery ─────────────────────────────────────────────────────────

export async function discoverScripts(scriptsDir: string): Promise<TweakScript[]> {
  let files: string[];
  try {
    files = await fg(`${scriptsDir}/*.mjs`, { onlyFiles: true, absolute: true });
  } catch {
    return [];
  }

  const scripts: TweakScript[] = [];
  for (const filePath of files.sort()) {
    try {
      const mod = await import(pathToFileURL(filePath).href + `?t=${Date.now()}`);
      const meta = mod.meta as ScriptMeta | undefined;
      if (!meta?.id || !meta?.label) {
        console.warn(`[design-bridge] ${filePath}: missing meta.id or meta.label — skipped`);
        continue;
      }
      scripts.push({ meta, defaultValue: meta.value, scriptPath: filePath });
    } catch (e) {
      console.warn(`[design-bridge] failed to load ${filePath}:`, e);
    }
  }
  return scripts;
}

export function buildSchema(scripts: TweakScript[]): TweakKnob[] {
  return scripts.map(({ meta }) => ({
    marker: meta.id,
    label: meta.label,
    type: meta.type,
    value: meta.value,
    options: meta.options,
    min: meta.min,
    max: meta.max,
    step: meta.step,
    annotationId: meta.annotationId,
  }));
}

// ─── Per-file Snapshot ────────────────────────────────────────────────────────
// Snapshots are keyed by absolute file path (base64url-encoded), stored as
// plain text files. Only the ORIGINAL content is ever snapshotted — subsequent
// writes are derived by replaying all tweaks on top of the original.

function fileSnapshotPath(cacheDir: string, absFilePath: string): string {
  const key = Buffer.from(absFilePath).toString('base64url');
  return resolve(cacheDir, `${key}.orig`);
}

async function ensureFileSnapshot(cacheDir: string, absFilePath: string): Promise<void> {
  const snapPath = fileSnapshotPath(cacheDir, absFilePath);
  try {
    await fs.access(snapPath);
    return; // already snapshotted
  } catch { /* fall through */ }
  await fs.mkdir(cacheDir, { recursive: true });
  const content = await fs.readFile(absFilePath, 'utf-8');
  await fs.writeFile(snapPath, content, 'utf-8');
}

async function readFileSnapshot(cacheDir: string, absFilePath: string): Promise<string | null> {
  try {
    return await fs.readFile(fileSnapshotPath(cacheDir, absFilePath), 'utf-8');
  } catch {
    return null;
  }
}

async function deleteFileSnapshot(cacheDir: string, absFilePath: string): Promise<void> {
  await fs.rm(fileSnapshotPath(cacheDir, absFilePath), { force: true });
}

// ─── Sandboxed Context ────────────────────────────────────────────────────────

interface SandboxCtx {
  _guardPath: (p: string) => string;
  readFile(p: string): Promise<string>;
  writeFile(p: string, c: string): Promise<void>;
  findFiles(p: string): Promise<string[]>;
  replaceInFile(p: string, find: string | RegExp, r: string): Promise<void>;
  console: { log: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void; };
}

function makeSandboxCtx(rootDir: string): SandboxCtx {
  function guardPath(filePath: string): string {
    const abs = isAbsolute(filePath) ? filePath : resolve(rootDir, filePath);
    const rel = relative(rootDir, abs);
    if (rel.startsWith('..')) {
      throw new Error(`[design-bridge] path "${filePath}" is outside project root — blocked`);
    }
    return abs;
  }

  return {
    _guardPath: guardPath,
    async readFile(filePath: string): Promise<string> {
      return fs.readFile(guardPath(filePath), 'utf-8');
    },
    async writeFile(filePath: string, content: string): Promise<void> {
      await fs.writeFile(guardPath(filePath), content, 'utf-8');
    },
    async findFiles(pattern: string): Promise<string[]> {
      const abs = isAbsolute(pattern) ? pattern : resolve(rootDir, pattern);
      if (!abs.startsWith(rootDir)) throw new Error(`[design-bridge] pattern outside project root — blocked`);
      return fg(abs, { onlyFiles: true, absolute: true });
    },
    async replaceInFile(filePath: string, find: string | RegExp, replacement: string): Promise<void> {
      const abs = guardPath(filePath);
      const content = await fs.readFile(abs, 'utf-8');
      const updated = content.replace(find instanceof RegExp ? find : new RegExp(find, 'g'), replacement);
      await fs.writeFile(abs, updated, 'utf-8');
    },
    console: {
      log: (...a: unknown[]) => console.log('[tweak]', ...a),
      warn: (...a: unknown[]) => console.warn('[tweak]', ...a),
      error: (...a: unknown[]) => console.error('[tweak]', ...a),
    },
  };
}

// ─── Dry Run ──────────────────────────────────────────────────────────────────

/** Run a script in dry-run mode and return the absolute paths it would write. */
async function dryRun(script: TweakScript, value: string | number | boolean, rootDir: string): Promise<string[]> {
  const touched: string[] = [];
  const base = makeSandboxCtx(rootDir);
  const dryCtx: SandboxCtx = {
    ...base,
    async writeFile(filePath: string): Promise<void> {
      touched.push(base._guardPath(filePath));
    },
    async replaceInFile(filePath: string): Promise<void> {
      touched.push(base._guardPath(filePath));
    },
  };

  try {
    const mod = await importScript(script.scriptPath);
    const applyFn = mod['apply'] as ((v: unknown, ctx: unknown) => Promise<void>) | undefined;
    if (typeof applyFn === 'function') await applyFn(value, dryCtx);
  } catch { /* ignore — readFile may throw in dry run */ }

  return [...new Set(touched)];
}

// ─── Script Import (with cache-busting) ──────────────────────────────────────

async function importScript(scriptPath: string): Promise<Record<string, unknown>> {
  return import(pathToFileURL(scriptPath).href + `?t=${Date.now()}`);
}

// ─── Replay Engine ────────────────────────────────────────────────────────────

/**
 * Collect all files any script will touch, ensure they are snapshotted,
 * restore each to its original, then replay all scripts in order.
 * This is called after any value change so every apply() always starts
 * from a known baseline (original + previous tweaks applied in sequence).
 */
async function replayAllTweaks(state: TweakState): Promise<void> {
  const { rootDir, cacheDir, scripts } = state;

  // Step 1: Find all files any active tweak would touch
  const allTouched = new Set<string>();
  for (const script of scripts) {
    const files = await dryRun(script, script.meta.value, rootDir);
    for (const f of files) allTouched.add(f);
  }

  if (allTouched.size === 0) return;

  // Step 2: Snapshot each file if not already done (only ever saves the original)
  for (const filePath of allTouched) {
    await ensureFileSnapshot(cacheDir, filePath);
  }

  // Step 3: Restore every touched file to its original content
  for (const filePath of allTouched) {
    const original = await readFileSnapshot(cacheDir, filePath);
    if (original !== null) await fs.writeFile(filePath, original, 'utf-8');
  }

  // Step 4: Apply all tweaks in sequence — each sees the file as left by the previous
  const ctx = makeSandboxCtx(rootDir);
  for (const script of scripts) {
    try {
      const mod = await importScript(script.scriptPath);
      const applyFn = mod['apply'] as ((v: unknown, ctx: unknown) => Promise<void>) | undefined;
      if (typeof applyFn === 'function') {
        await applyFn(script.meta.value, ctx);
      }
    } catch (e) {
      console.error(`[design-bridge] replay error in "${script.meta.id}":`, e);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

// ─── Selective Finalize & Dismiss ────────────────────────────────────────────────────

/**
 * Bake in the changes from `toFinalize` scripts as the new file baseline,
 * then replay `toKeep` scripts on top. Deletes finalized script files.
 */
export async function finalizeScripts(
  state: TweakState,
  toFinalize: TweakScript[],
  toKeep: TweakScript[],
): Promise<void> {
  if (toFinalize.length === 0) return;
  const { rootDir, cacheDir } = state;
  const allScripts = [...toFinalize, ...toKeep];

  // Step 1: Collect all touched files + ensure snapshots
  const allTouched = new Set<string>();
  for (const s of allScripts) {
    for (const f of await dryRun(s, s.meta.value, rootDir)) allTouched.add(f);
  }
  for (const filePath of allTouched) await ensureFileSnapshot(cacheDir, filePath);

  // Step 2: Restore all to originals
  for (const filePath of allTouched) {
    const orig = await readFileSnapshot(cacheDir, filePath);
    if (orig !== null) await fs.writeFile(filePath, orig, 'utf-8');
  }

  // Step 3: Apply only the finalized scripts — their state becomes the new permanent baseline
  const ctx = makeSandboxCtx(rootDir);
  for (const s of toFinalize) {
    try {
      const mod = await importScript(s.scriptPath);
      const applyFn = mod['apply'] as ((v: unknown, ctx: unknown) => Promise<void>) | undefined;
      if (typeof applyFn === 'function') await applyFn(s.meta.value, ctx);
    } catch (e) {
      console.error(`[design-bridge] finalize error in "${s.meta.id}":`, e);
    }
  }

  // Step 4: Update snapshots for finalized-script files (new baseline includes their changes)
  const finalizedFiles = new Set<string>();
  for (const s of toFinalize) {
    for (const f of await dryRun(s, s.meta.value, rootDir)) finalizedFiles.add(f);
  }
  for (const filePath of finalizedFiles) {
    await deleteFileSnapshot(cacheDir, filePath);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(fileSnapshotPath(cacheDir, filePath), content, 'utf-8');
    } catch { /* file might not exist */ }
  }

  // Step 5: Delete finalized script files from disk
  for (const s of toFinalize) await fs.rm(s.scriptPath, { force: true });

  // Step 6: Replay remaining scripts on top of the new baseline
  state.scripts = toKeep;
  if (toKeep.length > 0) {
    await replayAllTweaks(state);
  } else {
    // No remaining — clean up all snapshots for finalized files
    for (const filePath of finalizedFiles) {
      await deleteFileSnapshot(cacheDir, filePath);
    }
  }
}

/** Finalize all tweaks linked to the given annotationId. */
export async function finalizeForAnnotation(state: TweakState, annotationId: string): Promise<void> {
  const toFinalize = state.scripts.filter((s) => s.meta.annotationId === annotationId);
  const toKeep = state.scripts.filter((s) => s.meta.annotationId !== annotationId);
  await finalizeScripts(state, toFinalize, toKeep);
}

/** Finalize a single tweak by marker. */
export async function finalizeOneTweak(state: TweakState, marker: string): Promise<void> {
  const toFinalize = state.scripts.filter((s) => s.meta.id === marker);
  const toKeep = state.scripts.filter((s) => s.meta.id !== marker);
  await finalizeScripts(state, toFinalize, toKeep);
}

/** Revert a single tweak's file changes and remove it from the active set. */
export async function dismissTweak(state: TweakState, marker: string): Promise<void> {
  const idx = state.scripts.findIndex((s) => s.meta.id === marker);
  if (idx < 0) return;
  const [dismissed] = state.scripts.splice(idx, 1);
  const { rootDir, cacheDir } = state;

  const dismissedFiles = new Set(await dryRun(dismissed, dismissed.meta.value, rootDir));

  if (state.scripts.length > 0) {
    await replayAllTweaks(state);
    // Clean up snapshots for files only the dismissed script used
    const keepFiles = new Set<string>();
    for (const s of state.scripts) for (const f of await dryRun(s, s.meta.value, rootDir)) keepFiles.add(f);
    for (const filePath of dismissedFiles) {
      if (!keepFiles.has(filePath)) await deleteFileSnapshot(cacheDir, filePath);
    }
  } else {
    for (const filePath of dismissedFiles) {
      const orig = await readFileSnapshot(cacheDir, filePath);
      if (orig !== null) {
        await fs.writeFile(filePath, orig, 'utf-8');
        await deleteFileSnapshot(cacheDir, filePath);
      }
    }
  }

  await fs.rm(dismissed.scriptPath, { force: true });
}

export async function applyTweakChange(state: TweakState, id: string, value: string): Promise<void> {
  const script = state.scripts.find((s) => s.meta.id === id);
  if (!script) {
    console.warn(`[design-bridge] tweak "${id}" not found`);
    return;
  }
  script.meta.value = value;
  console.log(`[design-bridge] tweak "${id}" -> ${value}`);
  await replayAllTweaks(state);
}

export async function resetTweak(state: TweakState, id: string): Promise<void> {
  const script = state.scripts.find((s) => s.meta.id === id);
  if (!script) return;

  script.meta.value = script.defaultValue;

  // If any other tweak is still dirty, replay so their changes are preserved
  const anyDirty = state.scripts.some((s) => s.meta.value !== s.defaultValue);
  if (anyDirty) {
    await replayAllTweaks(state);
  } else {
    // Everything back to defaults — restore from snapshots and clean up
    const allTouched = new Set<string>();
    for (const s of state.scripts) {
      const files = await dryRun(s, s.defaultValue, state.rootDir);
      for (const f of files) allTouched.add(f);
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

export async function resetAllTweaks(state: TweakState): Promise<void> {
  // Collect touched files before resetting values (dry-run uses current values)
  const allTouched = new Set<string>();
  for (const script of state.scripts) {
    const files = await dryRun(script, script.meta.value, state.rootDir);
    for (const f of files) allTouched.add(f);
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
