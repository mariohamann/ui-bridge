/**
 * Tweak Engine — comment-driven, action-based file transformation system.
 *
 * Architecture:
 *
 *   Comment (owns the knob + ordered actions[])
 *     └─ ContentEditAction  → loads .ui-bridge/scripts/{scriptId}.mjs
 *                             script: (content: string, value: unknown) => string
 *     └─ FileCreateAction   → writes .ui-bridge/files/{fileId} to path
 *     └─ FileDeleteAction   → deletes path (snapshot taken first)
 *
 * Snapshot / replay model:
 *   Before any action touches a file, its original content is snapshotted to
 *   .ui-bridge/.cache/. On replay every touched file is restored from its
 *   snapshot before actions run, so each run starts from the original state.
 *   Discard restores all snapshots and deletes scripts/files/cache artifacts.
 *   Finalize makes changes permanent and clears the snapshot.
 *
 * Use createTweakEngine(rootDir, getComments) to get a bound instance.
 * `getComments` is a callback that returns the current comment list —
 * the engine has no direct reference to the store.
 */

import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

// ─── Path constants ───────────────────────────────────────────────────────────

function dirs(rootDir) {
  const db = resolve(rootDir, '.ui-bridge');
  return {
    scripts: resolve(db, 'scripts'),
    files: resolve(db, 'files'),
    cache: resolve(db, '.cache'),
  };
}

// ─── Path guard ───────────────────────────────────────────────────────────────

function guardPath(rootDir, filePath) {
  const abs = isAbsolute(filePath) ? filePath : resolve(rootDir, filePath);
  if (relative(rootDir, abs).startsWith('..')) {
    throw new Error(`[ui-bridge] path "${filePath}" is outside project root — blocked`);
  }
  return abs;
}

// ─── ID validation ────────────────────────────────────────────────────────────

export function isValidId(id) {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(id);
}

// ─── Snapshot helpers ─────────────────────────────────────────────────────────

function snapshotKey(absPath) {
  return Buffer.from(absPath).toString('base64url');
}

async function ensureSnapshot(cacheDir, absPath) {
  const snap = resolve(cacheDir, `${snapshotKey(absPath)}.orig`);
  try {
    await access(snap);
    return; // already snapshotted
  } catch {
    /* first time */
  }
  await mkdir(cacheDir, { recursive: true });
  try {
    const content = await readFile(absPath, 'utf-8');
    await writeFile(snap, content, 'utf-8');
  } catch {
    // file doesn't exist yet (e.g. file-create target) — write a sentinel
    await writeFile(snap, '\x00', 'utf-8');
  }
}

async function readSnapshot(cacheDir, absPath) {
  try {
    const content = await readFile(resolve(cacheDir, `${snapshotKey(absPath)}.orig`), 'utf-8');
    return content === '\x00' ? null : content; // null = file didn't exist originally
  } catch {
    return undefined; // no snapshot at all
  }
}

async function deleteSnapshot(cacheDir, absPath) {
  await rm(resolve(cacheDir, `${snapshotKey(absPath)}.orig`), { force: true });
}

// ─── Script loader ────────────────────────────────────────────────────────────

async function loadTransformer(scriptsDir, scriptId) {
  const scriptPath = resolve(scriptsDir, `${scriptId}.mjs`);
  const mod = await import(pathToFileURL(scriptPath).href + `?t=${Date.now()}`);
  const fn = mod.default;
  if (typeof fn !== 'function') {
    throw new Error(
      `[ui-bridge] script "${scriptId}" must export a default function (content, value) => string`,
    );
  }
  return fn;
}

// ─── Action execution ─────────────────────────────────────────────────────────

function touchedByAction(rootDir, action) {
  if (action.type === 'content-edit') return [guardPath(rootDir, action.file)];
  if (action.type === 'file-create') return [guardPath(rootDir, action.path)];
  if (action.type === 'file-delete') return [guardPath(rootDir, action.path)];
  return [];
}

async function executeAction(rootDir, { scripts, files, cache }, action, value) {
  if (action.type === 'content-edit') {
    const abs = guardPath(rootDir, action.file);
    await ensureSnapshot(cache, abs);
    let transformer;
    try {
      transformer = await loadTransformer(scripts, action.scriptId);
    } catch (e) {
      console.error(`[ui-bridge] failed to load script "${action.scriptId}":`, e);
      return;
    }
    const current = await readFile(abs, 'utf-8');
    const transformed = transformer(current, value);
    if (typeof transformed !== 'string') {
      console.error(`[ui-bridge] script "${action.scriptId}" did not return a string — skipped`);
      return;
    }
    // Skip writing if the content is unchanged — avoids triggering a
    // spurious Vite HMR update (or full page reload) on every replay.
    if (transformed === current) return;
    await writeFile(abs, transformed, 'utf-8');
  }

  if (action.type === 'file-create') {
    const abs = guardPath(rootDir, action.path);
    await ensureSnapshot(cache, abs);
    const assetPath = resolve(files, action.fileId);
    const content = await readFile(assetPath, 'utf-8');
    await mkdir(resolve(abs, '..'), { recursive: true });
    await writeFile(abs, content, 'utf-8');
  }

  if (action.type === 'file-delete') {
    const abs = guardPath(rootDir, action.path);
    await ensureSnapshot(cache, abs);
    await rm(abs, { force: true });
  }
}

// ─── Engine factory ───────────────────────────────────────────────────────────

/**
 * @param {string} rootDir
 * @param {() => object[]} getComments  — returns current comment list from the store
 */
export function createTweakEngine(rootDir, getComments) {
  const { scripts: SCRIPTS_DIR, files: FILES_DIR, cache: CACHE_DIR } = dirs(rootDir);

  /**
   * In-memory map of comment id → current knob value (overridden by user).
   * @type {Map<string, unknown>}
   */
  const activeValues = new Map();

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Find the active (most recent pending) tweak entry from a thread.
   * @param {object} thread
   */
  function getActiveTweak(thread) {
    const entries = thread.comments ?? [];
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e.type === 'tweak' && e.tweakStatus === 'pending') return e;
    }
    return null;
  }

  /**
   * Returns a flat "tweakable view" for each thread that has an active pending tweak.
   * Shape: { id, knob, actions, createdAt }
   */
  function tweakableComments() {
    return getComments()
      .map((thread) => {
        const tweak = getActiveTweak(thread);
        if (!tweak) return null;
        return {
          id: thread.meta.id,
          knob: tweak.knob,
          actions: tweak.actions ?? [],
          createdAt: thread.meta.createdAt ?? 0,
        };
      })
      .filter(Boolean);
  }

  function currentValue(ann) {
    return activeValues.has(ann.id) ? activeValues.get(ann.id) : ann.knob.value;
  }

  function allTouchedFiles(comments) {
    const set = new Set();
    for (const ann of comments) {
      for (const action of ann.actions ?? []) {
        for (const f of touchedByAction(rootDir, action)) set.add(f);
      }
    }
    return set;
  }

  async function snapshotAll(files) {
    for (const f of files) await ensureSnapshot(CACHE_DIR, f);
  }

  async function restoreAll(files) {
    for (const f of files) {
      const snap = await readSnapshot(CACHE_DIR, f);
      if (snap === undefined) continue;
      if (snap === null) {
        await rm(f, { force: true });
      } else {
        await writeFile(f, snap, 'utf-8');
      }
    }
  }

  async function clearSnapshots(files) {
    for (const f of files) await deleteSnapshot(CACHE_DIR, f);
  }

  // ── Replay ───────────────────────────────────────────────────────────────

  /**
   * Restore all touched files from snapshot, then re-execute all active
   * comments in createdAt order.
   */
  async function replay() {
    const comments = tweakableComments();
    if (comments.length === 0) return;

    const touched = allTouchedFiles(comments);
    await snapshotAll(touched);
    await restoreAll(touched);

    const sorted = [...comments].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    for (const ann of sorted) {
      const value = currentValue(ann);
      for (const action of ann.actions ?? []) {
        try {
          await executeAction(
            rootDir,
            { scripts: SCRIPTS_DIR, files: FILES_DIR, cache: CACHE_DIR },
            action,
            value,
          );
        } catch (e) {
          console.error(`[ui-bridge] error executing action for comment "${ann.id}":`, e);
        }
      }
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  async function applyTweakChange(commentId, value) {
    activeValues.set(commentId, value);
    await replay();
  }

  async function resetTweak(commentId) {
    activeValues.delete(commentId);
    await replay();
  }

  async function resetAllTweaks() {
    activeValues.clear();
    const comments = tweakableComments();
    const touched = allTouchedFiles(comments);
    await restoreAll(touched);
    await clearSnapshots(touched);
  }

  async function finalizeComments(commentIds) {
    if (commentIds.length === 0) return;
    const idSet = new Set(commentIds);

    const all = tweakableComments();
    const toFinalize = all.filter((a) => idSet.has(a.id));
    const toKeep = all.filter((a) => !idSet.has(a.id));

    if (toFinalize.length === 0) return;

    // Full replay so all files are in their desired state
    const allTouched = allTouchedFiles(all);
    await snapshotAll(allTouched);
    await restoreAll(allTouched);

    const sorted = [...all].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    for (const ann of sorted) {
      const value = currentValue(ann);
      for (const action of ann.actions ?? []) {
        try {
          await executeAction(
            rootDir,
            { scripts: SCRIPTS_DIR, files: FILES_DIR, cache: CACHE_DIR },
            action,
            value,
          );
        } catch (e) {
          console.error(`[ui-bridge] finalize error for comment "${ann.id}":`, e);
        }
      }
    }

    // Clear snapshots for files only touched by finalized comments
    const keepTouched = allTouchedFiles(toKeep);
    const finalizeTouched = allTouchedFiles(toFinalize);
    for (const f of finalizeTouched) {
      if (!keepTouched.has(f)) await deleteSnapshot(CACHE_DIR, f);
    }

    // Delete artifacts, remove from active values
    for (const ann of toFinalize) {
      await deleteCommentArtifacts(ann);
      activeValues.delete(ann.id);
    }

    // Re-baseline snapshots for files shared with remaining tweaks
    if (toKeep.length > 0) {
      const newBaseTouched = allTouchedFiles(toKeep);
      for (const f of newBaseTouched) {
        if (finalizeTouched.has(f)) {
          await deleteSnapshot(CACHE_DIR, f);
          await ensureSnapshot(CACHE_DIR, f);
        }
      }
      await replay();
    }
  }

  async function finalizeForComment(commentId) {
    await finalizeComments([commentId]);
  }

  async function finalizeAll() {
    const all = tweakableComments();
    await finalizeComments(all.map((a) => a.id));
    try {
      await rm(CACHE_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  async function discardComment(commentId) {
    const comments = tweakableComments();
    const target = comments.find((a) => a.id === commentId);
    if (!target) return;

    const remaining = comments.filter((a) => a.id !== commentId);
    const touched = allTouchedFiles([target]);
    const keepTouched = allTouchedFiles(remaining);

    activeValues.delete(commentId);

    if (remaining.length > 0) {
      await replay();
      for (const f of touched) {
        if (!keepTouched.has(f)) await deleteSnapshot(CACHE_DIR, f);
      }
    } else {
      await restoreAll(touched);
      await clearSnapshots(touched);
    }

    await deleteCommentArtifacts(target);
  }

  async function discardAll() {
    const comments = tweakableComments();
    const touched = allTouchedFiles(comments);
    activeValues.clear();
    await restoreAll(touched);
    await clearSnapshots(touched);
    for (const ann of comments) await deleteCommentArtifacts(ann);
    try {
      await rm(CACHE_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  async function deleteCommentArtifacts(ann) {
    for (const action of ann.actions ?? []) {
      if (action.type === 'content-edit') {
        await rm(resolve(SCRIPTS_DIR, `${action.scriptId}.mjs`), { force: true });
      }
      if (action.type === 'file-create') {
        await rm(resolve(FILES_DIR, action.fileId), { force: true });
      }
    }
  }

  // ── Schema builder ───────────────────────────────────────────────────────

  function buildSchema() {
    return tweakableComments().map((ann) => ({
      marker: ann.id,
      commentId: ann.id,
      label: ann.knob.label,
      type: ann.knob.type ?? 'string',
      value: activeValues.has(ann.id) ? activeValues.get(ann.id) : ann.knob.value,
      min: ann.knob.min,
      max: ann.knob.max,
      step: ann.knob.step,
      options: ann.knob.options,
    }));
  }

  // ── Script / file asset CRUD (called from HTTP routes) ───────────────────

  async function writeScript(scriptId, code) {
    if (!isValidId(scriptId)) throw new Error(`invalid script id: "${scriptId}"`);
    await mkdir(SCRIPTS_DIR, { recursive: true });
    await writeFile(resolve(SCRIPTS_DIR, `${scriptId}.mjs`), code, 'utf-8');
  }

  async function readScript(scriptId) {
    if (!isValidId(scriptId)) throw new Error(`invalid script id: "${scriptId}"`);
    return readFile(resolve(SCRIPTS_DIR, `${scriptId}.mjs`), 'utf-8');
  }

  async function deleteScript(scriptId) {
    if (!isValidId(scriptId)) throw new Error(`invalid script id: "${scriptId}"`);
    await rm(resolve(SCRIPTS_DIR, `${scriptId}.mjs`), { force: true });
  }

  async function writeFileAsset(fileId, content) {
    if (!isValidId(fileId)) throw new Error(`invalid file id: "${fileId}"`);
    await mkdir(FILES_DIR, { recursive: true });
    await writeFile(resolve(FILES_DIR, fileId), content, 'utf-8');
  }

  async function deleteFileAsset(fileId) {
    if (!isValidId(fileId)) throw new Error(`invalid file id: "${fileId}"`);
    await rm(resolve(FILES_DIR, fileId), { force: true });
  }

  return {
    buildSchema,
    applyTweakChange,
    resetTweak,
    resetAllTweaks,
    finalizeForComment,
    finalizeAll,
    discardComment,
    discardAll,
    writeScript,
    readScript,
    deleteScript,
    writeFileAsset,
    deleteFileAsset,
  };
}
