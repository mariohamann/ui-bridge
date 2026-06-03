/**
 * Comment Store — in-memory CRUD with per-file JSON persistence.
 *
 * Use createCommentStore(rootDir) to get a bound store instance.
 */

import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * @param {string} rootDir
 * @returns store API
 */
export function createCommentStore(rootDir) {
  const ANNOTATIONS_DIR = resolve(rootDir, '.ui-bridge', 'comments');

  /** @type {Map<string, object>} */
  const comments = new Map();

  /**
   * Tracks pending self-writes per comment ID. The FS watcher should skip
   * reloads for writes the server itself made — the in-memory store and
   * broadcast are already up-to-date from store.upsert().
   * @type {Map<string, number>}
   */
  const selfWriteCount = new Map();

  async function persist(ann) {
    const id = ann?.meta?.id;
    if (!id) return;
    try {
      await mkdir(ANNOTATIONS_DIR, { recursive: true });
      const dest = resolve(ANNOTATIONS_DIR, `${id}.json`);
      const tmp = `${dest}.tmp`;
      await writeFile(tmp, JSON.stringify(ann, null, 2), 'utf-8');
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
    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(ANNOTATIONS_DIR).catch(() => []);
      for (const file of files.filter((f) => f.endsWith('.json'))) {
        try {
          const raw = await readFile(resolve(ANNOTATIONS_DIR, file), 'utf-8');
          const ann = JSON.parse(raw);
          const id = ann?.meta?.id;
          if (id) comments.set(id, ann);
        } catch (e) {
          console.warn(`[ui-bridge] could not parse comment ${file}:`, e);
        }
      }
      if (comments.size > 0) console.log(`[ui-bridge] loaded ${comments.size} comment(s)`);
    } catch {
      /* dir doesn't exist yet — that's fine */
    }
  }

  function upsert(ann) {
    const id = ann?.meta?.id;
    if (!id) return Promise.resolve();
    comments.set(id, ann);
    return persist(ann);
  }

  async function del(id) {
    comments.delete(id);
    await remove(id);
  }

  async function clear() {
    for (const id of comments.keys()) await remove(id);
    comments.clear();
  }

  function all() {
    return [...comments.values()];
  }

  function get(id) {
    return comments.get(id);
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
      if (ann?.meta?.id) comments.set(ann.meta.id, ann);
    } catch (e) {
      if (e.code === 'ENOENT') {
        comments.delete(id);
      } else {
        console.warn(`[ui-bridge] could not parse comment ${id}.json:`, e);
      }
    }
  }

  /**
   * Update the in-memory store only — no disk write.
   * Use for ephemeral UI state (e.g. lastReadAt) that should not cause
   * Vite HMR reloads or pollute the persisted JSON files.
   */
  function updateInMemory(ann) {
    const id = ann?.meta?.id;
    if (!id) return;
    comments.set(id, ann);
  }

  return {
    load,
    reload,
    reloadOne,
    upsert,
    updateInMemory,
    del,
    clear,
    all,
    get,
    has,
    consumeSelfWrite,
  };
}
