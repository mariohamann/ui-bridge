/**
 * Root isolation tests.
 *
 * Verifies that a running UI Bridge server correctly exposes its `root`
 * in GET /health, and that a client checking for root-match will NOT reuse
 * a server that belongs to a different project root.
 *
 * These tests manage their own server processes using ports in the 7490 range.
 */

import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = resolve(__dirname, '../index.mjs');

// ── helpers ───────────────────────────────────────────────────────────────────

async function makeRoot(name: string): Promise<string> {
  const dir = resolve(__dirname, `../.test-root-${name}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

function spawnServer(
  rootDir: string,
  preferredPort: number,
): { child: ChildProcess; ready: Promise<number> } {
  const child = spawn(process.execPath, [SERVER_ENTRY, '--root', rootDir], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, UI_BRIDGE_PORT: String(preferredPort) },
  });
  const ready = new Promise<number>((resolve, reject) => {
    const rl = createInterface({ input: child.stdout! });
    rl.on('line', (line) => {
      const match = line.match(/^UI_BRIDGE_READY:(\d+)$/);
      if (match) {
        rl.close();
        resolve(parseInt(match[1], 10));
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`server exited with code ${code}`));
    });
  });
  return { child, ready };
}

function kill(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', () => resolve());
    child.kill();
  });
}

/**
 * Mimics the root-aware getServerPort logic from the unplugin:
 * returns the port only if the running server's root matches expectedRoot.
 */
async function getServerPortIfRootMatches(
  port: number,
  expectedRoot: string,
): Promise<number | null> {
  try {
    const resp = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(600),
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as { port?: number; root?: string };
    if (body.root && body.root !== expectedRoot) return null;
    return body.port ?? port;
  } catch {
    return null;
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

test('GET /health exposes the root the server was started with', async () => {
  const root = await makeRoot('health-root');
  const PORT = 7490;
  const { child, ready } = spawnServer(root, PORT);
  try {
    const actualPort = await ready;
    const resp = await fetch(`http://localhost:${actualPort}/health`);
    const body = (await resp.json()) as { ok: boolean; port: number; root: string };
    expect(body.ok).toBe(true);
    expect(body.root).toBe(root);
  } finally {
    await kill(child);
    await rm(root, { recursive: true, force: true });
  }
});

test('root-aware check returns port when roots match', async () => {
  const root = await makeRoot('match-a');
  const PORT = 7491;
  const { child, ready } = spawnServer(root, PORT);
  try {
    await ready;
    const port = await getServerPortIfRootMatches(PORT, root);
    expect(port).toBe(PORT);
  } finally {
    await kill(child);
    await rm(root, { recursive: true, force: true });
  }
});

test('root-aware check returns null when roots differ (wrong project)', async () => {
  const rootA = await makeRoot('mismatch-a');
  const rootB = await makeRoot('mismatch-b');
  const PORT = 7492;
  // Server is started with rootA
  const { child, ready } = spawnServer(rootA, PORT);
  try {
    await ready;
    // Client expects rootB — should NOT reuse
    const port = await getServerPortIfRootMatches(PORT, rootB);
    expect(port).toBeNull();
  } finally {
    await kill(child);
    await rm(rootA, { recursive: true, force: true });
    await rm(rootB, { recursive: true, force: true });
  }
});

test('two projects on different ports each get their own isolated root', async () => {
  const rootA = await makeRoot('dual-a');
  const rootB = await makeRoot('dual-b');
  const PORT_A = 7493;
  const PORT_B = 7494;
  const serverA = spawnServer(rootA, PORT_A);
  const serverB = spawnServer(rootB, PORT_B);
  try {
    const [portA, portB] = await Promise.all([serverA.ready, serverB.ready]);

    const healthA = (await (await fetch(`http://localhost:${portA}/health`)).json()) as {
      root: string;
    };
    const healthB = (await (await fetch(`http://localhost:${portB}/health`)).json()) as {
      root: string;
    };

    expect(healthA.root).toBe(rootA);
    expect(healthB.root).toBe(rootB);
    expect(healthA.root).not.toBe(healthB.root);
  } finally {
    await kill(serverA.child);
    await kill(serverB.child);
    await rm(rootA, { recursive: true, force: true });
    await rm(rootB, { recursive: true, force: true });
  }
});
