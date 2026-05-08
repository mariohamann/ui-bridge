import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';
import type { ServerResponse } from 'node:http';

const clientBundlePath = fileURLToPath(new URL('../browser/client.js', import.meta.url));
const CLIENT_URL = '/__design-bridge/client.js';

const DB_PORT = parseInt(process.env.DB_PORT ?? '7378', 10);
const DB_WS_URL = `ws://localhost:${DB_PORT}/design-bridge`;

/** Minimal public interface for consumers who import PluginState. */
export interface PluginState {
  rootDir: string;
  serverPort: number;
}

async function isServerRunning(port: number): Promise<boolean> {
  try {
    const resp = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(600),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function spawnServer(rootDir: string): ChildProcess {
  const _req = createRequire(import.meta.url);
  const serverEntry = _req.resolve('@design-bridge/server');
  const child = spawn(process.execPath, [serverEntry, '--root', rootDir], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DB_PORT: String(DB_PORT) },
  });
  child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk));
  child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
  child.on('error', (e) => console.error('[design-bridge] server error:', e));
  return child;
}

export function designBridge(): Plugin {
  let rootDir = '';
  let child: ChildProcess | null = null;

  return {
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
      // Start the standalone server if it isn't already running
      isServerRunning(DB_PORT).then((running) => {
        if (running) {
          console.log(`[design-bridge] using existing server on :${DB_PORT}`);
        } else {
          console.log(`[design-bridge] spawning server on :${DB_PORT} (root: ${rootDir})`);
          child = spawnServer(rootDir);
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
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(content);
      });
    },

    transformIndexHtml: {
      order: 'pre',
      handler(_html, ctx) {
        if (!ctx.server) return;
        return [
          // Tell the browser client which WS URL to connect to
          {
            tag: 'script',
            attrs: { type: 'text/javascript' },
            children: `window.__DB_WS_URL__=${JSON.stringify(DB_WS_URL)};`,
            injectTo: 'head-prepend',
          },
          { tag: 'script', attrs: { src: CLIENT_URL }, injectTo: 'head' },
        ];
      },
    },
  };
}

