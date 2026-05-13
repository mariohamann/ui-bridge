import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type React from 'react';

const _require = createRequire(import.meta.url);

export interface DesignBridgeNextOptions {
  /**
   * Port the Design Bridge server listens on.
   * Resolution order: this option → DESIGN_BRIDGE_PORT env var → DB_PORT env var (legacy) → 7378.
   */
  port?: number;
}

/**
 * Server Component that injects the Design Bridge client panel.
 * Add this to your root layout:
 *
 * ```tsx
 * import { DesignBridgeScript } from '@design-bridge/next';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         {children}
 *         {process.env.NODE_ENV === 'development' && <DesignBridgeScript />}
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function DesignBridgeScript({ port }: { port?: number; } = {}): React.JSX.Element {
  // Use createElement to avoid requiring JSX transform in this package's build.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement, Fragment } = _require('react') as typeof import('react');
  const resolvedPort =
    port ?? parseInt(process.env.DESIGN_BRIDGE_PORT ?? process.env.DB_PORT ?? '7378', 10);
  const wsUrl = `ws://localhost:${resolvedPort}/design-bridge`;
  const clientUrl = `http://localhost:${resolvedPort}/design-bridge/client.js`;
  const inlineScript = `window.__DB_WS_URL__=${JSON.stringify(wsUrl)};`;
  return createElement(
    Fragment,
    null,
    createElement('script', { dangerouslySetInnerHTML: { __html: inlineScript }, key: 'db-init' }),
    createElement('script', { src: clientUrl, async: true, key: 'db-client' }),
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
  const serverEntry = _require.resolve('@design-bridge/server');
  const child = spawn(process.execPath, [serverEntry, '--root', rootDir], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DESIGN_BRIDGE_PORT: String(preferredPort) },
  });
  const ready = new Promise<number>((resolve, reject) => {
    const rl = createInterface({ input: child.stdout! });
    rl.on('line', (line) => {
      process.stdout.write(line + '\n');
      const match = line.match(/^DESIGN_BRIDGE_READY:(\d+)$/);
      if (match) {
        rl.close();
        resolve(parseInt(match[1], 10));
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`[design-bridge] server exited: ${code}`));
    });
  });
  return { child, ready };
}

/**
 * Design Bridge plugin for Next.js 15.3+ (Turbopack).
 *
 * Wraps your Next.js config with Design Bridge support. Spawns the Design
 * Bridge server. Add `<DesignBridgeScript />` to your root layout to inject
 * the client-side panel.
 *
 * Usage in next.config.ts:
 *
 * ```ts
 * import { withDesignBridge } from '@design-bridge/next';
 * export default withDesignBridge(nextConfig);
 * ```
 */
export function withDesignBridge(
  nextConfig: Record<string, unknown> = {},
  options: DesignBridgeNextOptions = {},
): Record<string, unknown> {
  const preferredPort =
    options.port ?? parseInt(process.env.DESIGN_BRIDGE_PORT ?? process.env.DB_PORT ?? '7378', 10);
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    // Spawn server eagerly (fire-and-forget; reuses existing if already running)
    getServerPort(preferredPort, process.cwd()).then((existing) => {
      if (existing !== null) {
        console.log(`[design-bridge] using existing server at http://localhost:${existing}`);
        return;
      }
      spawnServer(process.cwd(), preferredPort);
    });
  }

  return nextConfig;
}

export default withDesignBridge;
