/**
 * Annotation Store — in-memory CRUD with per-file JSON persistence.
 *
 * Use createAnnotationStore(rootDir) to get a bound store instance.
 */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * @param {string} rootDir
 * @returns store API
 */
export function createAnnotationStore(rootDir) {
  const ANNOTATIONS_DIR = resolve(rootDir, 'tweaks', 'annotations');

  /** @type {Map<string, object>} */
  const annotations = new Map();

  async function persist(ann) {
    try {
      await mkdir(ANNOTATIONS_DIR, { recursive: true });
      await writeFile(resolve(ANNOTATIONS_DIR, `${ann.id}.json`), JSON.stringify(ann, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[design-bridge] could not write annotation file:', e);
    }
  }

  async function remove(id) {
    try {
      await rm(resolve(ANNOTATIONS_DIR, `${id}.json`), { force: true });
    } catch { /* ignore */ }
  }

  async function load() {
    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(ANNOTATIONS_DIR).catch(() => []);
      for (const file of files.filter(f => f.endsWith('.json'))) {
        try {
          const raw = await readFile(resolve(ANNOTATIONS_DIR, file), 'utf-8');
          const ann = JSON.parse(raw);
          if (ann?.id) annotations.set(ann.id, ann);
        } catch (e) {
          console.warn(`[design-bridge] could not parse annotation ${file}:`, e);
        }
      }
      if (annotations.size > 0) console.log(`[design-bridge] loaded ${annotations.size} annotation(s)`);
    } catch { /* dir doesn't exist yet — that's fine */ }
  }

  function upsert(ann) {
    annotations.set(ann.id, ann);
    persist(ann);
  }

  function del(id) {
    annotations.delete(id);
    remove(id);
  }

  async function clear() {
    for (const id of annotations.keys()) await remove(id);
    annotations.clear();
  }

  function unlinkTweak(annotationId, marker) {
    const ann = annotations.get(annotationId);
    if (ann) {
      ann.linkedTweaks = (ann.linkedTweaks ?? []).filter(t => t.marker !== marker);
      ann.timestamp = Date.now();
      annotations.set(annotationId, ann);
      persist(ann);
    }
  }

  function all() {
    return [...annotations.values()];
  }

  function get(id) {
    return annotations.get(id);
  }

  function has(id) {
    return annotations.has(id);
  }

  return { load, upsert, del, clear, unlinkTweak, all, get, has };
}
