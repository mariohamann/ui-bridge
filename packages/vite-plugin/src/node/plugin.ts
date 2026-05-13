import { readFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import type { Plugin, PluginOption } from 'vite';
import type { ServerResponse } from 'node:http';
import { codeInspectorPlugin } from 'code-inspector-plugin';

const _require = createRequire(import.meta.url);
const clientBundlePath: string = _require.resolve('@design-bridge/client');
const CLIENT_URL = '/__design-bridge/client.js';

/** Options accepted by the designBridge() Vite plugin. */
export interface DesignBridgeOptions {
  /**
   * Port the Design Bridge server listens on.
   * Resolution order: this option → DESIGN_BRIDGE_PORT env var → DB_PORT env var (legacy) → 7378.
   */
  port?: number;
}

/** Minimal public interface for consumers who import PluginState. */
export interface PluginState {
  rootDir: string;
  serverPort: number;
}

/**
 * Ping the server's /health endpoint. Returns the actual port it's listening on,
 * or null if the server is not reachable (handles auto-incremented ports too).
 */
async function getServerPort(port: number): Promise<number | null> {
  try {
    const resp = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(600),
    });
    if (!resp.ok) return null;
    const body = await resp.json() as { port?: number; };
    return body.port ?? port;
  } catch {
    return null;
  }
}

/**
 * Spawn the server subprocess and resolve with the port it actually bound to.
 * The server emits a machine-readable "DESIGN_BRIDGE_READY:<port>" line on
 * stdout once it is listening — we use that rather than polling /health so
 * there is no race condition when the port was auto-incremented.
 */
function spawnServer(rootDir: string, preferredPort: number): { child: ChildProcess; ready: Promise<number>; } {
  const serverEntry = _require.resolve('@design-bridge/server');
  const child = spawn(process.execPath, [serverEntry, '--root', rootDir], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DESIGN_BRIDGE_PORT: String(preferredPort) },
  });

  const ready = new Promise<number>((resolve, reject) => {
    const rl = createInterface({ input: child.stdout! });
    rl.on('line', (line) => {
      // Forward all lines to Vite's stdout
      process.stdout.write(line + '\n');
      const match = line.match(/^DESIGN_BRIDGE_READY:(\d+)$/);
      if (match) {
        rl.close();
        resolve(parseInt(match[1], 10));
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
    child.on('error', (e) => {
      console.error('[design-bridge] server error:', e);
      reject(e);
    });
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`[design-bridge] server exited with code ${code}`));
    });
  });

  return { child, ready };
}

export function designBridge(options: DesignBridgeOptions = {}): PluginOption {
  const preferredPort =
    options.port ??
    parseInt(process.env.DESIGN_BRIDGE_PORT ?? process.env.DB_PORT ?? '7378', 10);

  // Will be updated to the actual port once the server confirms it's listening.
  // Defaults to preferredPort so transformIndexHtml has a value even before the
  // server responds (e.g. if an existing server is already running on that port).
  let resolvedPort = preferredPort;

  let rootDir = '';
  let child: ChildProcess | null = null;

  const bridgePlugin: Plugin = {
    name: 'design-bridge',

    config() {
      return {
        server: { watch: { ignored: ['**/tweaks/.cache/**'] } },
      };
    },

    async configResolved(config) {
      rootDir = config.root;
    },

    configureServer(server) {
      getServerPort(preferredPort).then(async (existingPort) => {
        if (existingPort !== null) {
          resolvedPort = existingPort;
          console.log(`[design-bridge] using existing server on :${resolvedPort}`);
        } else {
          const { child: c, ready } = spawnServer(rootDir, preferredPort);
          child = c;
          resolvedPort = await ready;
        }
      });

      // Stop the child when Vite's HTTP server closes
      server.httpServer?.once('close', () => {
        if (child && !child.killed) {
          child.kill();
          child = null;
        }
      });

      // Serve the pre-built browser bundle (bypasses Vite transform pipeline)
      server.middlewares.use(CLIENT_URL, (_req, res: ServerResponse) => {
        const content = readFileSync(clientBundlePath);
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(content);
      });
    },

    transformIndexHtml: {
      order: 'pre',
      handler(_html, ctx) {
        if (!ctx.server) return;
        const wsUrl = `ws://localhost:${resolvedPort}/design-bridge`;
        return [
          // Tell the browser client which WS URL to connect to
          {
            tag: 'script',
            attrs: { type: 'text/javascript' },
            children: `window.__DB_WS_URL__=${JSON.stringify(wsUrl)};`,
            injectTo: 'head-prepend',
          },
          { tag: 'script', attrs: { src: `${CLIENT_URL}?t=${Date.now()}` }, injectTo: 'head' },
        ];
      },
    },
  };

  return [
    // code-inspector stamps data-insp-path attributes onto Vue/React/Svelte
    // elements via its Vite transform — invaluable for agents and source jumping.
    // We override transformIndexHtml to a no-op so it never injects its own
    // <code-inspector-component> browser client; the Design Bridge inspector
    // handles all browser-side UI directly in client/src/browser/inspector.ts.
    {
      ...codeInspectorPlugin({ bundler: 'vite', behavior: { locate: false } }),
      transformIndexHtml: undefined,
      apply: 'serve',
    },
    bridgePlugin,
  ];
}

