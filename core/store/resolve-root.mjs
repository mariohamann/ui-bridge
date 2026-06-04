/**
 * Resolves the project root directory — the directory that contains (or should
 * contain) the .ui-bridge/ folder.
 *
 * Discovery: walk up from cwd looking for an existing .ui-bridge/ directory.
 */

import { stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

/**
 * @param {string} [cwd]
 * @returns {Promise<string>}
 */
export async function resolveRoot(cwd = process.cwd()) {
  let dir = cwd;
  for (let i = 0; i < 10; i++) {
    try {
      await stat(resolve(dir, '.ui-bridge'));
      return dir;
    } catch {
      // not found — keep walking up
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return cwd;
}
