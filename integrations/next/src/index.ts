import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type React from 'react';

const _require = createRequire(import.meta.url);

export interface UiBridgeNextOptions {
  /**
   * Port the UI Bridge server listens on.
   * Resolution order: this option → UI_BRIDGE_PORT env var → UIB_PORT env var (legacy) → 7378.
   */
  port?: number;
  /**
   * Allow tweaks to modify files outside the project root directory.
   */
  allowOutsideRoot?: boolean;
}

/**
 * Server Component that injects the UI Bridge client panel.
 * Add this to your root layout:
 *
 * ```tsx
 * import { UiBridgeScript } from '@ui-bridge/next';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         {children}
 *         {process.env.NODE_ENV === 'development' && <UiBridgeScript />}
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export async function UiBridgeScript({ port }: { port?: number } = {}): Promise<React.JSX.Element> {
  // Use createElement to avoid requiring JSX transform in this package's build.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement, Fragment } = _require('react') as typeof import('react');
  // An explicit `port` prop is a deliberate override — honor it as-is.
  // Otherwise await the same resolution `withUiBridge()` kicked off, so this
  // never injects a stale/guessed port that the server didn't actually bind to.
  const resolvedPort =
    port ??
    (resolvedPortPromise
      ? await resolvedPortPromise
      : parseInt(process.env.UI_BRIDGE_PORT ?? process.env.UIB_PORT ?? '7378', 10));
  const wsUrl = `ws://localhost:${resolvedPort}/ui-bridge`;
  const clientUrl = `http://localhost:${resolvedPort}/ui-bridge/client.js`;
  const inlineScript =
    `window.__UIB_WS_URL__=${JSON.stringify(wsUrl)};` +
    `window.__UIB_EXPECTED_ROOT__=${JSON.stringify(process.cwd())};`;
  return createElement(
    Fragment,
    null,
    createElement('script', { dangerouslySetInnerHTML: { __html: inlineScript }, key: 'uib-init' }),
    createElement('script', { src: clientUrl, async: true, key: 'uib-client' }),
  );
}

async function getServerPort(port: number, expectedRoot: string): Promise<number | null> {
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

function spawnServer(
  rootDir: string,
  preferredPort: number,
  allowOutsideRoot?: boolean,
): { child: ChildProcess; ready: Promise<number> } {
  const serverEntry = _require.resolve('@ui-bridge/server');
  const serverArgs = [serverEntry, '--root', rootDir, '--parent-pid', String(process.pid)];
  if (allowOutsideRoot) serverArgs.push('--allow-outside-root');
  const child = spawn(process.execPath, serverArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, UI_BRIDGE_PORT: String(preferredPort) },
  });
  const ready = new Promise<number>((resolve, reject) => {
    const rl = createInterface({ input: child.stdout! });
    rl.on('line', (line) => {
      process.stdout.write(line + '\n');
      const match = line.match(/^UI_BRIDGE_READY:(\d+)$/);
      if (match) {
        rl.close();
        resolve(parseInt(match[1], 10));
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`[ui-bridge] server exited: ${code}`));
    });
  });
  return { child, ready };
}

// Shared between withUiBridge() (which kicks off the resolution) and
// UiBridgeScript() (which awaits it) — both run in the same Node process
// for `next dev`, so this module-level promise is the single source of
// truth for which port the server actually bound to.
let resolvedPortPromise: Promise<number> | null = null;
let spawnedChild: ChildProcess | null = null;

// Fast path for a clean shutdown (Ctrl+C, normal exit) — kills the spawned
// server immediately instead of waiting on its parent-liveness watchdog poll.
// The watchdog (--parent-pid, see core/server/index.mjs) remains the fallback
// for abrupt termination (SIGKILL, crash) where this handler never runs.
process.once('exit', () => {
  if (spawnedChild && !spawnedChild.killed) spawnedChild.kill();
});

function ensureServerStarted(preferredPort: number, allowOutsideRoot?: boolean): Promise<number> {
  if (resolvedPortPromise) return resolvedPortPromise;
  resolvedPortPromise = (async () => {
    const existingPort = await getServerPort(preferredPort, process.cwd());
    if (existingPort !== null) {
      console.log(`[ui-bridge] using existing server at http://localhost:${existingPort}`);
      return existingPort;
    }
    const { child, ready } = spawnServer(process.cwd(), preferredPort, allowOutsideRoot);
    spawnedChild = child;
    const resolvedPort = await ready;
    if (resolvedPort !== preferredPort) {
      // Informational only — the resolved port is used everywhere automatically,
      // and the root handshake guards against ever syncing to the wrong project.
      console.log(`[ui-bridge] port ${preferredPort} was in use, using ${resolvedPort} instead.`);
    }
    return resolvedPort;
  })();
  return resolvedPortPromise;
}

/**
 * UI Bridge plugin for Next.js 15.3+ (Turbopack).
 *
 * Wraps your Next.js config with UI Bridge support. Spawns the Design
 * Bridge server. Add `<UiBridgeScript />` to your root layout to inject
 * the client-side panel.
 *
 * Usage in next.config.ts:
 *
 * ```ts
 * import { withUiBridge } from '@ui-bridge/next';
 * export default withUiBridge(nextConfig);
 * ```
 */
export function withUiBridge(
  nextConfig: Record<string, unknown> = {},
  options: UiBridgeNextOptions = {},
): Record<string, unknown> {
  const preferredPort =
    options.port ?? parseInt(process.env.UI_BRIDGE_PORT ?? process.env.UIB_PORT ?? '7378', 10);
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    // Kicks off resolution eagerly (fire-and-forget; reuses existing server if
    // already running). UiBridgeScript() awaits the same promise later.
    ensureServerStarted(preferredPort, options.allowOutsideRoot);
  }

  return nextConfig;
}

export default withUiBridge;
