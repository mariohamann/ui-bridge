/**
 * Resolves the UI Bridge server base URL from the environment.
 *
 * Discovery order:
 *   1. UI_BRIDGE_URL  — full base URL (e.g. http://localhost:7378)
 *   2. UI_BRIDGE_PORT — port number, builds http://localhost:<port>
 *   3. Walk up cwd looking for .ui-bridge/.port
 *   4. Default: http://localhost:7378
 *
 * resolveRoot() returns the project root directory using the same walk-up logic.
 */

import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

export async function resolveBaseUrl(env = process.env, cwd = process.cwd()) {
  if (env.UI_BRIDGE_URL) return env.UI_BRIDGE_URL.replace(/\/$/, '');
  if (env.UI_BRIDGE_PORT) return `http://localhost:${env.UI_BRIDGE_PORT}`;

  const startDir = cwd;
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    try {
      const portFile = resolve(dir, '.ui-bridge', '.port');
      const port = (await readFile(portFile, 'utf-8')).trim();
      if (port) return `http://localhost:${port}`;
    } catch {
      // not found — keep walking up
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return 'http://localhost:7378';
}

/**
 * Resolves the project root directory — the directory that contains (or should
 * contain) the .ui-bridge/ folder.
 *
 * Discovery order:
 *   Walk up from cwd looking for an existing .ui-bridge/ directory
 */
export async function resolveRoot(env = process.env, cwd = process.cwd()) {
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
