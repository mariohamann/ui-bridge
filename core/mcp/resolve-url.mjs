/**
 * Resolves the Design Bridge server base URL from the environment.
 *
 * Discovery order:
 *   1. DESIGN_BRIDGE_URL  — full base URL (e.g. http://localhost:7378)
 *   2. DESIGN_BRIDGE_PORT — port number, builds http://localhost:<port>
 *   3. Walk up from DESIGN_BRIDGE_ROOT (or cwd) looking for .design-bridge/.port
 *   4. Default: http://localhost:7378
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

export async function resolveBaseUrl(env = process.env, cwd = process.cwd()) {
  if (env.DESIGN_BRIDGE_URL) return env.DESIGN_BRIDGE_URL.replace(/\/$/, '');
  if (env.DESIGN_BRIDGE_PORT) return `http://localhost:${env.DESIGN_BRIDGE_PORT}`;

  const startDir = env.DESIGN_BRIDGE_ROOT ?? cwd;
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    try {
      const portFile = resolve(dir, '.design-bridge', '.port');
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
