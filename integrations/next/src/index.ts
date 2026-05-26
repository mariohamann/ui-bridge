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
export function UiBridgeScript({ port }: { port?: number; } = {}): React.JSX.Element {
  // Use createElement to avoid requiring JSX transform in this package's build.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement, Fragment } = _require('react') as typeof import('react');
  const resolvedPort =
    port ?? parseInt(process.env.UI_BRIDGE_PORT ?? process.env.UIB_PORT ?? '7378', 10);
  const wsUrl = `ws://localhost:${resolvedPort}/ui-bridge`;
  const clientUrl = `http://localhost:${resolvedPort}/ui-bridge/client.js`;
  const inlineScript = `window.__UIB_WS_URL__=${JSON.stringify(wsUrl)};`;
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
    const body = (await resp.json()) as { port?: number; root?: string; };
    if (body.root && body.root !== expectedRoot) return null;
    return body.port ?? port;
  } catch {
    return null;
  }
}

function spawnServer(
  rootDir: string,
  preferredPort: number,
): { child: ChildProcess; ready: Promise<number>; } {
  const serverEntry = _require.resolve('@ui-bridge/server');
  const child = spawn(process.execPath, [serverEntry, '--root', rootDir], {
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
    // Spawn server eagerly (fire-and-forget; reuses existing if already running)
    getServerPort(preferredPort, process.cwd()).then((existing) => {
      if (existing !== null) {
        console.log(`[ui-bridge] using existing server at http://localhost:${existing}`);
        return;
      }
      spawnServer(process.cwd(), preferredPort);
    });
  }

  return nextConfig;
}

export default withUiBridge;
