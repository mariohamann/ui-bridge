/**
 * Comment Store — in-memory CRUD with per-file JSON persistence.
 *
 * Use createCommentStore(rootDir) to get a bound store instance.
 */

import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readStateFile } from './paths.mjs';

/**
 * @param {string} rootDir
 * @returns store API
 */
export function createCommentStore(rootDir) {
  const ANNOTATIONS_DIR = resolve(rootDir, '.ui-bridge', 'comments');
  const UI_BRIDGE_DIR = resolve(rootDir, '.ui-bridge');
  const READ_STATE_FILE = readStateFile(rootDir);

  /** @type {Map<string, object>} */
  const comments = new Map();

  /**
   * Per-user read state (comment id → lastReadAt). Kept in a separate file so
   * the comment JSON stays free of ephemeral UI state and external rewrites
   * (MCP, editor) cannot wipe it.
   * @type {Map<string, number>}
   */
  const readState = new Map();

  /**
   * Tracks pending self-writes per comment ID. The FS watcher should skip
   * reloads for writes the server itself made — the in-memory store and
   * broadcast are already up-to-date from store.upsert().
   * @type {Map<string, number>}
   */
  const selfWriteCount = new Map();

  /** Returns `ann` with meta.lastReadAt taken from the read state (or removed). */
  function withReadState(ann) {
    const id = ann?.meta?.id;
    const lastReadAt = id ? readState.get(id) : undefined;
    const meta = { ...ann.meta };
    if (typeof lastReadAt === 'number') meta.lastReadAt = lastReadAt;
    else delete meta.lastReadAt;
    return { ...ann, meta };
  }

  async function loadReadState() {
    try {
      const parsed = JSON.parse(await readFile(READ_STATE_FILE, 'utf-8'));
      for (const [id, ts] of Object.entries(parsed)) {
        if (typeof ts === 'number') readState.set(id, ts);
      }
    } catch {
      /* missing or invalid — start empty */
    }
  }

  async function persistReadState() {
    try {
      await mkdir(UI_BRIDGE_DIR, { recursive: true });
      const tmp = `${READ_STATE_FILE}.tmp`;
      await writeFile(tmp, JSON.stringify(Object.fromEntries(readState), null, 2), 'utf-8');
      await rename(tmp, READ_STATE_FILE);
    } catch (e) {
      console.warn('[ui-bridge] could not write read-state.json:', e);
    }
  }

  async function markRead(id, timestamp = Date.now()) {
    const ann = comments.get(id);
    if (!ann) return undefined;
    readState.set(id, timestamp);
    comments.set(id, withReadState(ann));
    await persistReadState();
    return comments.get(id);
  }

  async function persist(ann) {
    const id = ann?.meta?.id;
    if (!id) return;
    try {
      await mkdir(ANNOTATIONS_DIR, { recursive: true });
      const dest = resolve(ANNOTATIONS_DIR, `${id}.json`);
      const tmp = `${dest}.tmp`;
      const { lastReadAt: _lastReadAt, ...meta } = ann.meta;
      await writeFile(tmp, JSON.stringify({ ...ann, meta }, null, 2), 'utf-8');
      await rename(tmp, dest);
      // Mark AFTER rename so the flag is set before the FS-watcher callback fires.
      selfWriteCount.set(id, (selfWriteCount.get(id) ?? 0) + 1);
    } catch (e) {
      console.warn('[ui-bridge] could not write comment file:', e);
    }
  }

  /**
   * Returns true (and consumes one self-write token) when the FS event for
   * `id` was triggered by the server's own persist(). The watcher should
   * skip reload + broadcast in this case.
   */
  function consumeSelfWrite(id) {
    const n = selfWriteCount.get(id) ?? 0;
    if (n <= 0) return false;
    if (n === 1) selfWriteCount.delete(id);
    else selfWriteCount.set(id, n - 1);
    return true;
  }

  async function remove(id) {
    try {
      await rm(resolve(ANNOTATIONS_DIR, `${id}.json`), { force: true });
    } catch {
      /* ignore */
    }
  }

  async function load() {
    await loadReadState();
    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(ANNOTATIONS_DIR).catch(() => []);
      for (const file of files.filter((f) => f.endsWith('.json'))) {
        try {
          const raw = await readFile(resolve(ANNOTATIONS_DIR, file), 'utf-8');
          const ann = JSON.parse(raw);
          const id = ann?.meta?.id;
          if (id) comments.set(id, withReadState(ann));
        } catch (e) {
          console.warn(`[ui-bridge] could not parse comment ${file}:`, e);
        }
      }
      if (comments.size > 0) console.log(`[ui-bridge] loaded ${comments.size} comment(s)`);
      await backfillDisplayNumbers();
    } catch {
      /* dir doesn't exist yet — that's fine */
    }
  }

  /**
   * Assigns displayNumber to any loaded comment that doesn't have one yet
   * (e.g. created before this feature existed), oldest-first by createdAt.
   */
  async function backfillDisplayNumbers() {
    const missing = [...comments.values()]
      .filter((c) => typeof c.meta?.displayNumber !== 'number')
      .sort((a, b) => (a.meta?.createdAt ?? 0) - (b.meta?.createdAt ?? 0));
    for (const ann of missing) await upsert(ann);
  }

  /**
   * Persists `ann`, assigning the next available `meta.displayNumber` if it
   * doesn't already have one. This is the only place displayNumber is
   * assigned, so every comment gets one regardless of origin (browser or MCP).
   * Resolves to the (possibly augmented) comment.
   */
  async function upsert(ann) {
    const id = ann?.meta?.id;
    if (!id) return ann;
    if (typeof ann.meta.displayNumber !== 'number') {
      ann = { ...ann, meta: { ...ann.meta, displayNumber: nextDisplayNumber() } };
    }
    let readStateChanged = false;
    if (typeof ann.meta.lastReadAt === 'number' && readState.get(id) !== ann.meta.lastReadAt) {
      readState.set(id, ann.meta.lastReadAt);
      readStateChanged = true;
    }
    ann = withReadState(ann);
    comments.set(id, ann);
    await persist(ann);
    if (readStateChanged) await persistReadState();
    return ann;
  }

  async function del(id) {
    comments.delete(id);
    await remove(id);
    if (readState.delete(id)) await persistReadState();
  }

  async function clear() {
    for (const id of comments.keys()) await remove(id);
    comments.clear();
    readState.clear();
    await persistReadState();
  }

  function all() {
    return [...comments.values()];
  }

  function get(id) {
    return comments.get(id);
  }

  function getByDisplayNumber(n) {
    for (const c of comments.values()) {
      if (c.meta?.displayNumber === n) return c;
    }
    return undefined;
  }

  function nextDisplayNumber() {
    let max = 0;
    for (const c of comments.values()) {
      const n = c.meta?.displayNumber;
      if (typeof n === 'number' && n > max) max = n;
    }
    return max + 1;
  }

  function has(id) {
    return comments.has(id);
  }

  async function reload() {
    comments.clear();
    await load();
  }

  /**
   * Reload a single comment by id from disk.
   * Called by the FS watcher for external writes (e.g. MCP).
   * - File updated → merge into in-memory store.
   * - File deleted (ENOENT) → remove from in-memory store.
   * - File unreadable/partial → leave existing entry intact.
   */
  async function reloadOne(id) {
    try {
      const raw = await readFile(resolve(ANNOTATIONS_DIR, `${id}.json`), 'utf-8');
      const ann = JSON.parse(raw);
      if (ann?.meta?.id) comments.set(ann.meta.id, withReadState(ann));
    } catch (e) {
      if (e.code === 'ENOENT') {
        comments.delete(id);
      } else {
        console.warn(`[ui-bridge] could not parse comment ${id}.json:`, e);
      }
    }
  }

  return {
    load,
    reload,
    reloadOne,
    upsert,
    markRead,
    del,
    clear,
    all,
    get,
    getByDisplayNumber,
    nextDisplayNumber,
    has,
    consumeSelfWrite,
  };
}
