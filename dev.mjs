/**
 * Root dev orchestrator — no extra dependencies required.
 *
 * 1. Starts esbuild in watch mode (packages/vite-plugin)
 * 2. Waits for the first successful build
 * 3. Starts the Vue/Tailwind demo Vite dev server
 * 4. Watches dist/node/index.js — restarts Vite whenever the plugin node bundle changes
 */

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PLUGIN_DIR = resolve(__dirname, 'packages/vite-plugin');
const DIST_NODE = resolve(PLUGIN_DIR, 'dist/node/index.js');
const DEMO_DIR = resolve(__dirname, 'demos/vue-tailwind');

// ── helpers ──────────────────────────────────────────────────────────────────

function spawnInherited(cmd, args, cwd) {
  return spawn(cmd, args, { cwd, stdio: 'inherit', shell: false });
}

function kill(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.exitCode !== null) return resolve();
    proc.once('exit', resolve);
    proc.kill('SIGTERM');
    // Force-kill after 3 s if it hasn't exited
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
    }, 3000);
  });
}

// ── 1. Start esbuild watcher ─────────────────────────────────────────────────

const builder = spawnInherited('node', ['build.mjs', '--watch'], PLUGIN_DIR);

builder.on('error', (err) => {
  console.error('[dev] esbuild watcher failed to start:', err.message);
  process.exit(1);
});

// ── 2. Wait for first dist/node/index.js to appear ───────────────────────────

console.log('[dev] waiting for initial plugin build…');

await new Promise((resolve) => {
  if (existsSync(DIST_NODE)) return resolve();
  const iv = setInterval(() => {
    if (existsSync(DIST_NODE)) {
      clearInterval(iv);
      resolve();
    }
  }, 200);
});

console.log('[dev] plugin built — starting demo Vite server…');

// ── 3. Start Vite dev server ──────────────────────────────────────────────────

let viteProc = spawnInherited('pnpm', ['dev'], DEMO_DIR);

// ── 4. Watch dist/node — restart Vite on plugin node bundle change ────────────

let restarting = false;

watch(resolve(PLUGIN_DIR, 'dist/node'), { recursive: false }, async (_event, filename) => {
  if (!filename?.endsWith('.js')) return;
  if (restarting) return;
  restarting = true;

  console.log('[dev] plugin node bundle changed — restarting Vite…');
  await kill(viteProc);
  viteProc = spawnInherited('pnpm', ['dev'], DEMO_DIR);
  viteProc.on('error', (err) => console.error('[dev] Vite failed:', err.message));

  // Debounce: ignore rapid successive changes for 1 s
  setTimeout(() => { restarting = false; }, 1000);
});

// ── Cleanup on exit ───────────────────────────────────────────────────────────

async function shutdown() {
  console.log('\n[dev] shutting down…');
  await Promise.all([kill(builder), kill(viteProc)]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
