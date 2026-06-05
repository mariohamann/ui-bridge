/**
 * Preferences Store — merges defaults, plugin-supplied prefs, and the
 * user-overridden prefs persisted in .ui-bridge/preferences.json.
 *
 * Merge order (later wins):
 *   1. Hardcoded defaults
 *   2. Plugin-supplied preferences (passed via UI_BRIDGE_PREFERENCES env var)
 *   3. Persisted user preferences (.ui-bridge/preferences.json)
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/** @type {import('@ui-bridge/protocol').UserPreferences} */
const DEFAULTS = {
  knobVisibilityUI: 'non-approved',
  knobVisibilityBar: 'non-approved',
  routeMatching: { domain: false, path: true, params: false },
  commentBarPosition: 'top-left',
};

/**
 * @param {string} rootDir
 * @param {Partial<import('@ui-bridge/protocol').UserPreferences>} [pluginPrefs]
 */
export function createPreferencesStore(rootDir, pluginPrefs = {}) {
  const PREFS_DIR = resolve(rootDir, '.ui-bridge');
  const PREFS_FILE = resolve(PREFS_DIR, 'preferences.json');

  /** @type {import('@ui-bridge/protocol').UserPreferences} */
  let merged = deepMerge(DEFAULTS, pluginPrefs);

  async function load() {
    try {
      const raw = await readFile(PREFS_FILE, 'utf-8');
      const persisted = JSON.parse(raw);
      merged = deepMerge(merged, persisted);
    } catch {
      // file doesn't exist yet — use defaults + plugin prefs
    }
  }

  function get() {
    return merged;
  }

  /**
   * Merge a partial update, persist to disk, and return the new full prefs.
   * @param {Partial<import('@ui-bridge/protocol').UserPreferences>} patch
   */
  async function update(patch) {
    merged = deepMerge(merged, patch);
    try {
      await mkdir(PREFS_DIR, { recursive: true });
      const tmp = `${PREFS_FILE}.tmp`;
      await writeFile(tmp, JSON.stringify(merged, null, 2), 'utf-8');
      await rename(tmp, PREFS_FILE);
    } catch (e) {
      console.warn('[ui-bridge] could not write preferences.json:', e);
    }
    return merged;
  }

  return { load, get, update };
}

/**
 * Deep merge b into a (non-destructive — returns new object).
 * Only plain objects are merged recursively; primitives are overwritten.
 * @param {object} a
 * @param {object} b
 * @returns {object}
 */
function deepMerge(a, b) {
  const result = { ...a };
  for (const key of Object.keys(b)) {
    if (
      b[key] !== null &&
      typeof b[key] === 'object' &&
      !Array.isArray(b[key]) &&
      typeof a[key] === 'object' &&
      a[key] !== null
    ) {
      result[key] = deepMerge(a[key], b[key]);
    } else if (b[key] !== undefined) {
      result[key] = b[key];
    }
  }
  return result;
}
