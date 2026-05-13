/**
 * Port auto-increment tests.
 *
 * Verifies that the server correctly finds a free port when the preferred port
 * is already occupied, emits the DESIGN_BRIDGE_READY:<port> signal on stdout,
 * and reports the actual port via GET /health.
 *
 * These tests manage their own server processes — they do NOT use the shared
 * webServer managed by playwright.config.ts (which runs on port 7379).
 * They use ports in the 7480 range to avoid any conflict.
 */

import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as createNetServer, type Server as NetServer } from 'node:net';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = resolve(__dirname, '../index.mjs');
const TEST_ROOT = resolve(__dirname, '../.test-root');
const _require = createRequire(import.meta.url);

// ── helpers ───────────────────────────────────────────────────────────────────

/** Occupy a port with a plain net.Server. Returns [server, release()]. */
function occupyPort(port: number): Promise<[NetServer, () => Promise<void>]> {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.once('error', reject);
    // Listen without a host so Node picks :: (same as httpServer.listen(port) in the server).
    srv.listen(port, () => {
      resolve([srv, () => new Promise<void>((res) => srv.close(() => res()))]);
    });
  });
}

/**
 * Spawn the Design Bridge server with the given preferred port.
 * Returns the child process and a promise that resolves with the port
 * extracted from the DESIGN_BRIDGE_READY:<port> stdout line.
 */
function spawnDesignBridgeServer(preferredPort: number): {
  child: ChildProcess;
  ready: Promise<number>;
} {
  const child = spawn(process.execPath, [SERVER_ENTRY, '--root', TEST_ROOT], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DESIGN_BRIDGE_PORT: String(preferredPort) },
  });

  const ready = new Promise<number>((resolve, reject) => {
    const rl = createInterface({ input: child.stdout! });
    rl.on('line', (line) => {
      const match = line.match(/^DESIGN_BRIDGE_READY:(\d+)$/);
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

/** Kill a child process and wait for it to exit. */
function kill(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    child.kill();
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

test('starts on preferred port when it is free', async () => {
  const PREFERRED = 7480;
  const { child, ready } = spawnDesignBridgeServer(PREFERRED);
  try {
    const actualPort = await ready;
    expect(actualPort).toBe(PREFERRED);

    const res = await fetch(`http://localhost:${actualPort}/health`);
    const body = (await res.json()) as { ok: boolean; port: number };
    expect(body.ok).toBe(true);
    expect(body.port).toBe(PREFERRED);
  } finally {
    await kill(child);
  }
});

test('auto-increments to the next free port when preferred is occupied', async () => {
  const PREFERRED = 7481;
  const [, release] = await occupyPort(PREFERRED);
  const { child, ready } = spawnDesignBridgeServer(PREFERRED);
  try {
    const actualPort = await ready;
    expect(actualPort).toBe(PREFERRED + 1);

    const res = await fetch(`http://localhost:${actualPort}/health`);
    const body = (await res.json()) as { ok: boolean; port: number };
    expect(body.ok).toBe(true);
    expect(body.port).toBe(PREFERRED + 1);
  } finally {
    await kill(child);
    await release();
  }
});

test('skips multiple occupied ports until a free one is found', async () => {
  const PREFERRED = 7482;
  const [, release1] = await occupyPort(PREFERRED);
  const [, release2] = await occupyPort(PREFERRED + 1);
  const { child, ready } = spawnDesignBridgeServer(PREFERRED);
  try {
    const actualPort = await ready;
    expect(actualPort).toBe(PREFERRED + 2);

    const res = await fetch(`http://localhost:${actualPort}/health`);
    const body = (await res.json()) as { ok: boolean; port: number };
    expect(body.port).toBe(PREFERRED + 2);
  } finally {
    await kill(child);
    await release1();
    await release2();
  }
});

test('/health always returns the actual bound port, not the preferred port', async () => {
  const PREFERRED = 7483;
  const [, release] = await occupyPort(PREFERRED);
  const { child, ready } = spawnDesignBridgeServer(PREFERRED);
  try {
    const actualPort = await ready;
    expect(actualPort).not.toBe(PREFERRED);

    const res = await fetch(`http://localhost:${actualPort}/health`);
    const body = (await res.json()) as { ok: boolean; port: number };
    expect(body.ok).toBe(true);
    expect(body.port).toBe(actualPort);
    expect(body.port).not.toBe(PREFERRED);
  } finally {
    await kill(child);
    await release();
  }
});
