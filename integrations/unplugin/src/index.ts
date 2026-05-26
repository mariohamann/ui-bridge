import { readFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { createUnplugin } from 'unplugin';
import { codeInspectorPlugin } from 'code-inspector-plugin';

const _require = createRequire(import.meta.url);

/** Options accepted by the uiBridge() plugin. */
export interface UiBridgeOptions {
  /**
   * Port the UI Bridge server listens on.
   * Resolution order: this option → UI_BRIDGE_PORT env var → UIB_PORT env var (legacy) → 7378.
   */
  port?: number;
}

/**
 * Ping the server's /health endpoint. Returns { port, root } if reachable and root matches,
 * or null if unreachable or the running server belongs to a different project root.
 */
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

/**
 * Spawn the server subprocess and resolve with the port it actually bound to.
 */
function spawnServer(
  rootDir: string,
  preferredPort: number,
): { child: ChildProcess; ready: Promise<number> } {
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
    child.on('error', (e) => {
      console.error('[ui-bridge] server error:', e);
      reject(e);
    });
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`[ui-bridge] server exited with code ${code}`));
    });
  });

  return { child, ready };
}

/**
 * Build the injection HTML for a given WS port.
 * For webpack/rspack the client bundle is served by the ui-bridge server itself.
 */
function buildInjectionHtml(resolvedPort: number): string {
  const wsUrl = `ws://localhost:${resolvedPort}/ui-bridge`;
  const clientUrl = `http://localhost:${resolvedPort}/ui-bridge/client.js`;
  return (
    `<script>window.__UIB_WS_URL__=${JSON.stringify(wsUrl)};</script>` +
    `<script src="${clientUrl}"></script>`
  );
}

// ── unplugin factory ──────────────────────────────────────────────────────────

const unpluginFactory = createUnplugin((options: UiBridgeOptions = {}) => {
  const preferredPort =
    options.port ?? parseInt(process.env.UI_BRIDGE_PORT ?? process.env.UIB_PORT ?? '7378', 10);

  let resolvedPort = preferredPort;
  let rootDir = '';
  let child: ChildProcess | null = null;
  let serverReady = false;

  async function ensureServer() {
    if (serverReady) return;
    const existingPort = await getServerPort(preferredPort, rootDir);
    if (existingPort !== null) {
      resolvedPort = existingPort;
      console.log(`[ui-bridge] using existing server at http://localhost:${resolvedPort}`);
    } else {
      const { child: c, ready } = spawnServer(rootDir, preferredPort);
      child = c;
      resolvedPort = await ready;
    }
    serverReady = true;
  }

  return {
    name: 'ui-bridge',

    // ── vite-specific hooks ─────────────────────────────────────────────────
    vite: {
      config() {
        return { server: { watch: { ignored: ['**/.ui-bridge/.cache/**'] } } };
      },

      async configResolved(config: { root: string }) {
        rootDir = config.root;
      },

      configureServer(server: {
        httpServer: { once: (event: string, cb: () => void) => void } | null;
        middlewares: {
          use: (
            path: string,
            handler: (
              req: unknown,
              res: {
                writeHead: (code: number, headers: Record<string, string>) => void;
                end: (data: Buffer) => void;
              },
            ) => void,
          ) => void;
        };
        watcher: {
          add: (path: string) => void;
          on: (event: string, cb: (file: string) => void) => void;
        };
        ws: { send: (payload: { type: string }) => void };
      }) {
        const CLIENT_URL = '/__ui-bridge/client.js';
        const clientBundlePath: string = _require.resolve('@ui-bridge/client');

        ensureServer();

        server.httpServer?.once('close', () => {
          if (child && !child.killed) {
            child.kill();
            child = null;
          }
        });

        // Watch the client bundle for changes (triggered by esbuild rebuilds)
        // and send a full-page reload so the browser picks up the new bundle.
        server.watcher.add(clientBundlePath);
        server.watcher.on('change', (file) => {
          if (file === clientBundlePath) {
            server.ws.send({ type: 'full-reload' });
          }
        });

        server.middlewares.use(CLIENT_URL, (_req, res) => {
          const content = readFileSync(clientBundlePath);
          res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(content);
        });
      },

      transformIndexHtml: {
        order: 'pre' as const,
        handler(_html: string, ctx: { server?: unknown }) {
          if (!ctx.server) return;
          const wsUrl = `ws://localhost:${resolvedPort}/ui-bridge`;
          const CLIENT_URL = '/__ui-bridge/client.js';
          return [
            {
              tag: 'script',
              attrs: { type: 'text/javascript' },
              children: `window.__UIB_WS_URL__=${JSON.stringify(wsUrl)};`,
              injectTo: 'head-prepend',
            },
            { tag: 'script', attrs: { src: `${CLIENT_URL}?t=${Date.now()}` }, injectTo: 'head' },
          ];
        },
      },
    },

    // ── webpack/rspack hooks ────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webpack(compiler: any) {
      setupCompilerHooks(compiler);
    },

    // unplugin calls plugin.rspack(compiler) for rspack — must be defined
    // separately (it does NOT fall back to plugin.webpack).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rspack(compiler: any) {
      setupCompilerHooks(compiler);
    },
  };

  // ── shared webpack/rspack implementation ─────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function setupCompilerHooks(compiler: any) {
    rootDir = compiler.context;

    // Do not start the server or patch HTML in production builds.
    if (compiler.options?.mode === 'production') return;

    compiler.hooks.done.tap('ui-bridge', () => {
      ensureServer();
    });

    // Kill the child process when the compiler shuts down (webpack 5 / rspack).
    compiler.hooks.shutdown?.tapAsync('ui-bridge', (callback: () => void) => {
      if (child && !child.killed) {
        child.kill();
        child = null;
      }
      callback();
    });

    // Use processAssets (PROCESS_ASSETS_STAGE_REPORT) so that html-webpack-plugin
    // has already added the HTML asset before we patch it, and to avoid the
    // DEP_WEBPACK_COMPILATION_ASSETS deprecation warning from direct asset mutation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    compiler.hooks.compilation.tap('ui-bridge', (compilation: any) => {
      // PROCESS_ASSETS_STAGE_REPORT = 5000; use +1 to run after html-webpack-plugin.
      const stage = compiler.webpack?.Compilation?.PROCESS_ASSETS_STAGE_REPORT ?? 5000;
      compilation.hooks.processAssets.tap(
        { name: 'ui-bridge', stage: stage + 1 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (assets: Record<string, any>) => {
          for (const filename of Object.keys(assets)) {
            if (!filename.endsWith('.html')) continue;
            const html: string = assets[filename].source();
            const injection = buildInjectionHtml(resolvedPort);
            const patched = html.replace('</head>', `${injection}</head>`);
            compilation.updateAsset(filename, {
              source: () => patched,
              size: () => Buffer.byteLength(patched),
            });
          }
        },
      );
    });
  }
});

// ── per-bundler exports ───────────────────────────────────────────────────────

export const uiBridge = unpluginFactory;

/** Vite plugin — use in vite.config.js */
export const uiBridgeVite = unpluginFactory.vite;

/** Webpack plugin — use in webpack.config.js */
export const uiBridgeWebpack = unpluginFactory.webpack;

/** Rspack plugin — use in rspack.config.js */
export const uiBridgeRspack = unpluginFactory.rspack;

/** Rollup plugin — use in rollup.config.js */
export const uiBridgeRollup = unpluginFactory.rollup;

/** esbuild plugin — use in esbuild.build({ plugins: [...] }) */
export const uiBridgeEsbuild = unpluginFactory.esbuild;

// ── turbopack (Next.js 15.3+) ─────────────────────────────────────────────────

/**
 * Returns the `turbopack.rules` object for Next.js 15.3+ Turbopack.
 * Includes code-inspector loaders for source attribution AND a UI Bridge
 * inject loader that sets window.__UIB_WS_URL__ and loads the client bundle.
 *
 * Usage in next.config.ts:
 *   import { withUiBridge } from '@ui-bridge/next';
 *   export default withUiBridge(nextConfig);
 */
export function uiBridgeTurbopack(options: UiBridgeOptions = {}): Record<string, unknown> {
  const port =
    options.port ?? parseInt(process.env.UI_BRIDGE_PORT ?? process.env.UIB_PORT ?? '7378', 10);
  const loaderPath = _require.resolve('./turbopack-loader.cjs');

  // code-inspector rules for data-insp-path stamping
  const codeInspectorRules = codeInspectorPlugin({ bundler: 'turbopack' });

  // Merge our inject loader into every rule entry that code-inspector produces
  const merged: Record<string, unknown> = {};
  for (const [glob, rule] of Object.entries(codeInspectorRules)) {
    const existing = (rule as { loaders: unknown[] }).loaders ?? [];
    merged[glob] = {
      loaders: [...existing, { loader: loaderPath, options: { port } }],
    };
  }

  return merged;
}

// ── vite plugin bundle (with code-inspector) ──────────────────────────────────

/**
 * Full Vite plugin set including code-inspector for source attribution.
 * This is what most Vite-based consumers should use.
 */
export function uiBridgeWithInspector(options: UiBridgeOptions = {}) {
  return [
    {
      ...codeInspectorPlugin({ bundler: 'vite', behavior: { locate: false } }),
      transformIndexHtml: undefined,
      apply: 'serve',
    },
    unpluginFactory.vite(options),
  ];
}
