/**
 * Root dev orchestrator — no extra dependencies required.
 *
 * 1. Starts esbuild in watch mode (packages/vite-plugin)
 * 2. Waits for the first successful build
 * 3. Starts the Vue/Tailwind demo Vite dev server
 * 4. Watches dist/node/index.js — restarts Vite whenever the plugin node bundle changes
 */

import { spawn } from 'node:child_process';
import { watch, rmSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PLUGIN_DIR = resolve(__dirname, 'packages/vite-plugin');
const CLIENT_DIR = resolve(__dirname, 'packages/client');
const COMPONENTS_DIR = resolve(__dirname, 'packages/components');
const DIST_NODE = resolve(PLUGIN_DIR, 'dist/node/index.js');
const COMPONENTS_DIST = resolve(COMPONENTS_DIR, 'dist');
const DEMO_DIR = resolve(__dirname, 'demos/vite-vue');

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
      try {
        proc.kill('SIGKILL');
      } catch {}
    }, 3000);
  });
}

// ── 1. Start esbuild watchers ─────────────────────────────────────────────────

// Delete dist so the "wait for first build" check below always waits for a fresh bundle.
rmSync(resolve(PLUGIN_DIR, 'dist'), { recursive: true, force: true });
rmSync(resolve(CLIENT_DIR, 'dist'), { recursive: true, force: true });
rmSync(COMPONENTS_DIST, { recursive: true, force: true });

const componentsBuilder = spawnInherited(
  'pnpm',
  ['exec', 'tsc', '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'],
  COMPONENTS_DIR,
);
const builder = spawnInherited('node', ['build.mjs', '--watch'], PLUGIN_DIR);
const clientBuilder = spawnInherited('node', ['build.mjs', '--watch'], CLIENT_DIR);

builder.on('error', (err) => {
  console.error('[dev] esbuild watcher failed to start:', err.message);
  process.exit(1);
});
clientBuilder.on('error', (err) => {
  console.error('[dev] client esbuild watcher failed to start:', err.message);
  process.exit(1);
});
componentsBuilder.on('error', (err) => {
  console.error('[dev] components tsc watcher failed to start:', err.message);
  process.exit(1);
});

// ── 2. Wait for plugin and client bundles ─────────────────────────────────────

const CLIENT_BUNDLE = resolve(CLIENT_DIR, 'dist/design-bridge.js');

console.log('[dev] waiting for initial plugin and client build…');

await new Promise((resolve) => {
  const iv = setInterval(() => {
    if (existsSync(DIST_NODE) && existsSync(CLIENT_BUNDLE)) {
      clearInterval(iv);
      resolve();
    }
  }, 200);
});

console.log('[dev] plugin and client built — starting demo Vite server…');

// ── 3. Start Vite dev server ──────────────────────────────────────────────────

let viteProc = spawnInherited('pnpm', ['dev'], DEMO_DIR);

// ── 4. Watch dist/node — restart Vite on plugin node bundle change ────────────

let restarting = false;

function watchAndRestart(dir) {
  watch(resolve(PLUGIN_DIR, dir), { recursive: false }, async (_event, filename) => {
    if (!filename?.endsWith('.js')) return;
    if (restarting) return;
    restarting = true;

    console.log(`[dev] plugin ${dir} bundle changed — restarting Vite…`);
    await kill(viteProc);
    viteProc = spawnInherited('pnpm', ['dev'], DEMO_DIR);
    viteProc.on('error', (err) => console.error('[dev] Vite failed:', err.message));

    setTimeout(() => {
      restarting = false;
    }, 1000);
  });
}

watchAndRestart('dist/node');
// Restart Vite when the browser client bundle changes (served by the standalone server)
watch(resolve(CLIENT_DIR, 'dist'), { recursive: false }, async (_event, filename) => {
  if (!filename?.endsWith('.js')) return;
  if (restarting) return;
  restarting = true;
  console.log('[dev] client bundle changed — restarting Vite…');
  await kill(viteProc);
  viteProc = spawnInherited('pnpm', ['dev'], DEMO_DIR);
  viteProc.on('error', (err) => console.error('[dev] Vite failed:', err.message));
  setTimeout(() => {
    restarting = false;
  }, 1000);
});

// ── Cleanup on exit ───────────────────────────────────────────────────────────

async function shutdown() {
  console.log('\n[dev] shutting down…');
  await Promise.all([kill(builder), kill(clientBuilder), kill(componentsBuilder), kill(viteProc)]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
