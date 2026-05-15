/**
 * Comment Store — in-memory CRUD with per-file JSON persistence.
 *
 * Use createCommentStore(rootDir) to get a bound store instance.
 */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * @param {string} rootDir
 * @returns store API
 */
export function createCommentStore(rootDir) {
  const ANNOTATIONS_DIR = resolve(rootDir, '.design-bridge', 'comments');

  /** @type {Map<string, object>} */
  const comments = new Map();

  async function persist(ann) {
    const id = ann?.meta?.id;
    if (!id) return;
    try {
      await mkdir(ANNOTATIONS_DIR, { recursive: true });
      await writeFile(
        resolve(ANNOTATIONS_DIR, `${id}.json`),
        JSON.stringify(ann, null, 2),
        'utf-8',
      );
    } catch (e) {
      console.warn('[design-bridge] could not write comment file:', e);
    }
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
          console.warn(`[design-bridge] could not parse comment ${file}:`, e);
        }
      }
      if (comments.size > 0) console.log(`[design-bridge] loaded ${comments.size} comment(s)`);
    } catch {
      /* dir doesn't exist yet — that's fine */
    }
  }

  function upsert(ann) {
    const id = ann?.meta?.id;
    if (!id) return;
    comments.set(id, ann);
    persist(ann);
  }

  function del(id) {
    comments.delete(id);
    remove(id);
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

  return { load, upsert, del, clear, all, get, has };
}
