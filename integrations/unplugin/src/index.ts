import { readFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { createUnplugin } from 'unplugin';
import { codeInspectorPlugin } from 'code-inspector-plugin';

const _require = createRequire(import.meta.url);

/** Options accepted by the designBridge() plugin. */
export interface DesignBridgeOptions {
  /**
   * Port the Design Bridge server listens on.
   * Resolution order: this option → DESIGN_BRIDGE_PORT env var → DB_PORT env var (legacy) → 7378.
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

/**
 * Build the injection HTML for a given WS port.
 * For webpack/rspack the client bundle is served by the design-bridge server itself.
 */
function buildInjectionHtml(resolvedPort: number): string {
  const wsUrl = `ws://localhost:${resolvedPort}/design-bridge`;
  const clientUrl = `http://localhost:${resolvedPort}/design-bridge/client.js`;
  return (
    `<script>window.__DB_WS_URL__=${JSON.stringify(wsUrl)};</script>` +
    `<script src="${clientUrl}"></script>`
  );
}

// ── unplugin factory ──────────────────────────────────────────────────────────

const unpluginFactory = createUnplugin((options: DesignBridgeOptions = {}) => {
  const preferredPort =
    options.port ?? parseInt(process.env.DESIGN_BRIDGE_PORT ?? process.env.DB_PORT ?? '7378', 10);

  let resolvedPort = preferredPort;
  let rootDir = '';
  let child: ChildProcess | null = null;
  let serverReady = false;

  async function ensureServer() {
    if (serverReady) return;
    const existingPort = await getServerPort(preferredPort, rootDir);
    if (existingPort !== null) {
      resolvedPort = existingPort;
      console.log(`[design-bridge] using existing server at http://localhost:${resolvedPort}`);
    } else {
      const { child: c, ready } = spawnServer(rootDir, preferredPort);
      child = c;
      resolvedPort = await ready;
    }
    serverReady = true;
  }

  return {
    name: 'design-bridge',

    // ── vite-specific hooks ─────────────────────────────────────────────────
    vite: {
      config() {
        return { server: { watch: { ignored: ['**/.design-bridge/.cache/**'] } } };
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
      }) {
        const CLIENT_URL = '/__design-bridge/client.js';
        const clientBundlePath: string = _require.resolve('@design-bridge/client');
        // readFileSync is now available synchronously in the middleware closure

        ensureServer();

        server.httpServer?.once('close', () => {
          if (child && !child.killed) {
            child.kill();
            child = null;
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
          const wsUrl = `ws://localhost:${resolvedPort}/design-bridge`;
          const CLIENT_URL = '/__design-bridge/client.js';
          return [
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

    compiler.hooks.done.tap('design-bridge', () => {
      ensureServer();
    });

    // Kill the child process when the compiler shuts down (webpack 5 / rspack).
    compiler.hooks.shutdown?.tapAsync('design-bridge', (callback: () => void) => {
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
    compiler.hooks.compilation.tap('design-bridge', (compilation: any) => {
      // PROCESS_ASSETS_STAGE_REPORT = 5000; use +1 to run after html-webpack-plugin.
      const stage = compiler.webpack?.Compilation?.PROCESS_ASSETS_STAGE_REPORT ?? 5000;
      compilation.hooks.processAssets.tap(
        { name: 'design-bridge', stage: stage + 1 },
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

export const designBridge = unpluginFactory;

/** Vite plugin — use in vite.config.js */
export const designBridgeVite = unpluginFactory.vite;

/** Webpack plugin — use in webpack.config.js */
export const designBridgeWebpack = unpluginFactory.webpack;

/** Rspack plugin — use in rspack.config.js */
export const designBridgeRspack = unpluginFactory.rspack;

/** Rollup plugin — use in rollup.config.js */
export const designBridgeRollup = unpluginFactory.rollup;

/** esbuild plugin — use in esbuild.build({ plugins: [...] }) */
export const designBridgeEsbuild = unpluginFactory.esbuild;

// ── turbopack (Next.js 15.3+) ─────────────────────────────────────────────────

/**
 * Returns the `turbopack.rules` object for Next.js 15.3+ Turbopack.
 * Includes code-inspector loaders for source attribution AND a Design Bridge
 * inject loader that sets window.__DB_WS_URL__ and loads the client bundle.
 *
 * Usage in next.config.ts:
 *   import { withDesignBridge } from '@design-bridge/next';
 *   export default withDesignBridge(nextConfig);
 */
export function designBridgeTurbopack(options: DesignBridgeOptions = {}): Record<string, unknown> {
  const port =
    options.port ?? parseInt(process.env.DESIGN_BRIDGE_PORT ?? process.env.DB_PORT ?? '7378', 10);
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
export function designBridgeWithInspector(options: DesignBridgeOptions = {}) {
  return [
    {
      ...codeInspectorPlugin({ bundler: 'vite', behavior: { locate: false } }),
      transformIndexHtml: undefined,
      apply: 'serve',
    },
    unpluginFactory.vite(options),
  ];
}
