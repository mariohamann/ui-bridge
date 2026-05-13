/**
 * Per-demo dev orchestrator.
 *
 * Usage (from a demo's package.json dev script):
 *   node ../../scripts/dev-demo.mjs --integration=unplugin --server=vite --demo=demos/vite
 *
 * Arguments:
 *   --integration=<name>   One of: unplugin, next, astro, nuxt  (optional)
 *   --server=<cmd>         The demo server command, e.g. "vite" or "next dev --turbo"
 *   --demo=<path>          Path to demo dir relative to repo root
 */

import { spawn } from 'node:child_process';
import { watch, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Parse args ────────────────────────────────────────────────────────────────

function arg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((a) => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

const integration = arg('integration'); // e.g. "unplugin", "next", "astro", "nuxt"
const serverCmd = arg('server'); // e.g. "vite", "next dev --turbo"
const demoPath = arg('demo'); // e.g. "demos/vite"

if (!serverCmd || !demoPath) {
  console.error('[dev-demo] --server and --demo are required');
  process.exit(1);
}

const DEMO_DIR = resolve(ROOT, demoPath);
const PROTOCOL_DIR = resolve(ROOT, 'core/protocol');
const COMPONENTS_DIR = resolve(ROOT, 'core/components');
const CLIENT_DIR = resolve(ROOT, 'core/client');
const INTEGRATION_DIR = integration ? resolve(ROOT, 'integrations', integration) : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function spawnInherited(cmd, args, cwd) {
  return spawn(cmd, args, { cwd, stdio: 'inherit', shell: false });
}

function kill(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.exitCode !== null) return resolve();
    proc.once('exit', resolve);
    proc.kill('SIGTERM');
    setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {}
    }, 3000);
  });
}

// ── 1. Clean dist dirs ────────────────────────────────────────────────────────

rmSync(resolve(PROTOCOL_DIR, 'dist'), { recursive: true, force: true });
rmSync(resolve(COMPONENTS_DIR, 'dist'), { recursive: true, force: true });
rmSync(resolve(CLIENT_DIR, 'dist'), { recursive: true, force: true });
if (INTEGRATION_DIR) {
  rmSync(resolve(INTEGRATION_DIR, 'dist'), { recursive: true, force: true });
}

// ── 2. Start build watchers in dependency order ───────────────────────────────

// Step 1: protocol must be built before anything that imports it.
const PROTOCOL_OUT = resolve(PROTOCOL_DIR, 'dist/index.js');

const protocolBuilder = spawnInherited(
  'pnpm',
  ['exec', 'tsc', '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'],
  PROTOCOL_DIR,
);
protocolBuilder.on('error', (err) => {
  console.error(`[dev-demo] protocol watcher failed to start: ${err.message}`);
  process.exit(1);
});

console.log('[dev-demo] waiting for protocol build…');
await new Promise((res) => {
  const iv = setInterval(() => {
    if (existsSync(PROTOCOL_OUT)) {
      clearInterval(iv);
      res();
    }
  }, 200);
});

// Step 2: start everything else now that protocol is ready.
const componentsBuilder = spawnInherited(
  'pnpm',
  ['exec', 'tsc', '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'],
  COMPONENTS_DIR,
);

const clientBuilder = spawnInherited('node', ['build.mjs', '--watch'], CLIENT_DIR);

const integrationBuilder = INTEGRATION_DIR
  ? spawnInherited('node', ['build.mjs', '--watch'], INTEGRATION_DIR)
  : null;

for (const [label, proc] of [
  ['components', componentsBuilder],
  ['client', clientBuilder],
  ...(integrationBuilder ? [[`integration/${integration}`, integrationBuilder]] : []),
]) {
  proc.on('error', (err) => {
    console.error(`[dev-demo] ${label} watcher failed to start: ${err.message}`);
    process.exit(1);
  });
}

// ── 3. Wait for client + integration bundles ──────────────────────────────────

const CLIENT_BUNDLE = resolve(CLIENT_DIR, 'dist/design-bridge.js');
const INTEGRATION_OUT = INTEGRATION_DIR ? resolve(INTEGRATION_DIR, 'dist/index.js') : null;

const toWait = [CLIENT_BUNDLE, ...(INTEGRATION_OUT ? [INTEGRATION_OUT] : [])];

console.log('[dev-demo] waiting for client and integration builds…');

await new Promise((resolve) => {
  const iv = setInterval(() => {
    if (toWait.every((f) => existsSync(f))) {
      clearInterval(iv);
      resolve();
    }
  }, 200);
});

console.log('[dev-demo] all builds ready — starting demo server…');

// ── 4. Start demo server ──────────────────────────────────────────────────────

const [serverBin, ...serverArgs] = serverCmd.split(' ');

let serverProc = spawnInherited('pnpm', ['exec', serverBin, ...serverArgs], DEMO_DIR);

// ── 5. Watch bundles — restart server on change ───────────────────────────────

let restarting = false;

async function restartServer(reason) {
  if (restarting) return;
  restarting = true;
  console.log(`[dev-demo] ${reason} — restarting demo server…`);
  await kill(serverProc);
  serverProc = spawnInherited('pnpm', ['exec', serverBin, ...serverArgs], DEMO_DIR);
  serverProc.on('error', (err) => console.error('[dev-demo] server failed:', err.message));
  setTimeout(() => {
    restarting = false;
  }, 1000);
}

watch(resolve(CLIENT_DIR, 'dist'), { recursive: false }, (_event, filename) => {
  if (filename?.endsWith('.js')) restartServer('client bundle changed');
});

if (INTEGRATION_DIR) {
  watch(resolve(INTEGRATION_DIR, 'dist'), { recursive: false }, (_event, filename) => {
    if (filename?.endsWith('.js')) restartServer(`integration/${integration} bundle changed`);
  });
}

// ── Cleanup on exit ───────────────────────────────────────────────────────────

async function shutdown() {
  console.log('\n[dev-demo] shutting down…');
  await Promise.all([
    kill(protocolBuilder),
    kill(componentsBuilder),
    kill(clientBuilder),
    integrationBuilder ? kill(integrationBuilder) : Promise.resolve(),
    kill(serverProc),
  ]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
