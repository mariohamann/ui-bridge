import { readFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { createUnplugin } from 'unplugin';
import { codeInspectorPlugin } from 'code-inspector-plugin';
import type { CommentThread, SourceAnnotationConfig, UserPreferences } from '@ui-bridge/protocol';

const _require = createRequire(import.meta.url);

/** Options accepted by the uiBridge() plugin. */
export interface UiBridgeOptions {
  /**
   * Port the UI Bridge server listens on.
   * Resolution order: this option → UI_BRIDGE_PORT env var → UIB_PORT env var (legacy) → 7378.
   */
  port?: number;
  /**
   * Configure how the client detects source file/line information when the
   * user clicks an element. Useful for server-side frameworks that annotate
   * the DOM with HTML comments (Blade, Twig, Django) or custom data attributes
   * instead of the default code-inspector / Astro strategies.
   */
  sourceAnnotation?: SourceAnnotationConfig;
  /**
   * Include code-inspector for automatic source file/line attribution when
   * clicking elements. Enabled by default. Set to `false` for frameworks that
   * provide their own source attribution (e.g. Astro) or where code-inspector
   * cannot annotate templates (e.g. Laravel/Blade).
   */
  inspector?: boolean;
  /**
   * Default user preferences. These are used as a base layer and can be
   * overridden by the user at runtime via the preferences dialog in the browser.
   * The runtime overrides are persisted in `.ui-bridge/preferences.json`.
   */
  preferences?: UserPreferences;
  /**
   * Inject the UI Bridge client into production/static builds without a
   * running server. No WebSocket connection is attempted. The client bundle
   * is emitted as a static asset at `ui-bridge/client.js`.
   */
  staticMode?: boolean;
  /**
   * Pre-baked comments to display in static mode. Only used when
   * `staticMode` is `true`.
   */
  staticComments?: CommentThread[];
  /**
   * Allow tweaks to modify files outside the project root directory.
   * Useful in monorepo setups where tweaks target sibling packages.
   */
  allowOutsideRoot?: boolean;
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
  preferences?: UserPreferences,
  allowOutsideRoot?: boolean,
): { child: ChildProcess; ready: Promise<number> } {
  const serverEntry = _require.resolve('@ui-bridge/server');
  const serverArgs = [serverEntry, '--root', rootDir];
  if (allowOutsideRoot) serverArgs.push('--allow-outside-root');
  const child = spawn(process.execPath, serverArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      UI_BRIDGE_PORT: String(preferredPort),
      ...(preferences ? { UI_BRIDGE_PREFERENCES: JSON.stringify(preferences) } : {}),
    },
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
function buildInjectionHtml(
  resolvedPort: number,
  sourceAnnotation?: SourceAnnotationConfig,
): string {
  const wsUrl = `ws://localhost:${resolvedPort}/ui-bridge`;
  const clientUrl = `http://localhost:${resolvedPort}/ui-bridge/client.js`;
  const sourceConfigScript = sourceAnnotation
    ? `<script>window.__UIB_SOURCE_CONFIG__=${JSON.stringify(sourceAnnotation)};</script>`
    : '';
  return (
    `<script>window.__UIB_WS_URL__=${JSON.stringify(wsUrl)};</script>` +
    sourceConfigScript +
    `<script src="${clientUrl}"></script>`
  );
}

// ── unplugin factory ──────────────────────────────────────────────────────────

const unpluginFactory = createUnplugin((options: UiBridgeOptions = {}) => {
  const preferredPort =
    options.port ?? parseInt(process.env.UI_BRIDGE_PORT ?? process.env.UIB_PORT ?? '7378', 10);
  const preferences = options.preferences;

  let resolvedPort = preferredPort;
  let rootDir = '';
  let isDevServer = false;
  let child: ChildProcess | null = null;
  let serverReady = false;

  async function ensureServer() {
    if (serverReady) return;
    const existingPort = await getServerPort(preferredPort, rootDir);
    if (existingPort !== null) {
      resolvedPort = existingPort;
      console.log(`[ui-bridge] using existing server at http://localhost:${resolvedPort}`);
    } else {
      const { child: c, ready } = spawnServer(
        rootDir,
        preferredPort,
        preferences,
        options.allowOutsideRoot,
      );
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
        // Ignore all UI Bridge internal files — comments, scripts, file assets,
        // and the cache — so Vite never treats them as app source changes and
        // triggers spurious HMR updates or full page reloads.
        return { server: { watch: { ignored: ['**/.ui-bridge/**'] } } };
      },

      async configResolved(config: { root: string; command: string }) {
        rootDir = config.root;
        isDevServer = config.command === 'serve';
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

      // ── virtual:ui-bridge module ──────────────────────────────────────────
      // Provides an importable entry point for frameworks where Vite does not
      // serve HTML (e.g. Laravel). Add `import 'virtual:ui-bridge'` to your
      // JS entry file (e.g. resources/js/app.js). Resolves to an IIFE that
      // injects the WS URL global and loads the client bundle in dev mode; in
      // production builds Vite tree-shakes it to an empty module.
      resolveId(id: string) {
        if (id === 'virtual:ui-bridge') return '\0virtual:ui-bridge';
      },

      load(id: string) {
        if (id !== '\0virtual:ui-bridge') return;
        if (!isDevServer) return 'export {};';
        const wsUrl = `ws://localhost:${preferredPort}/ui-bridge`;
        const clientUrl = `http://localhost:${preferredPort}/ui-bridge/client.js`;
        const sourceConfigInit = options.sourceAnnotation
          ? `window.__UIB_SOURCE_CONFIG__=${JSON.stringify(options.sourceAnnotation)};`
          : '';
        return (
          `if(typeof window!=='undefined'&&!window.__UIB_WS_URL__){` +
          `window.__UIB_WS_URL__=${JSON.stringify(wsUrl)};` +
          sourceConfigInit +
          `var s=document.createElement('script');` +
          `s.src=${JSON.stringify(clientUrl)};` +
          `document.head.appendChild(s);}` +
          `export {};`
        );
      },

      generateBundle() {
        if (!options.staticMode) return;
        const clientBundlePath: string = _require.resolve('@ui-bridge/client');
        const source = readFileSync(clientBundlePath);
        this.emitFile({ type: 'asset', fileName: 'ui-bridge/client.js', source });
      },

      transformIndexHtml: {
        handler(_html: string, ctx: { server?: unknown }) {
          if (!ctx.server && !options.staticMode) return;
          type InjectTo = 'head' | 'body' | 'head-prepend' | 'body-prepend';
          type Tag = {
            tag: string;
            attrs?: Record<string, string>;
            children?: string;
            injectTo: InjectTo;
          };
          const tags: Tag[] = [];

          if (options.staticMode) {
            tags.push({
              tag: 'script',
              attrs: { type: 'text/javascript' },
              children: `window.__UIB_STATIC_MODE__=true;`,
              injectTo: 'head-prepend',
            });
            if (options.staticComments?.length) {
              tags.push({
                tag: 'script',
                attrs: { type: 'text/javascript' },
                children: `window.__UIB_STATIC_COMMENTS__=${JSON.stringify(options.staticComments)};`,
                injectTo: 'head-prepend',
              });
            }
            tags.push({
              tag: 'script',
              attrs: { src: '/ui-bridge/client.js' },
              injectTo: 'head',
            });
          } else {
            const wsUrl = `ws://localhost:${resolvedPort}/ui-bridge`;
            const CLIENT_URL = '/__ui-bridge/client.js';
            tags.push({
              tag: 'script',
              attrs: { type: 'text/javascript' },
              children: `window.__UIB_WS_URL__=${JSON.stringify(wsUrl)};`,
              injectTo: 'head-prepend',
            });
            if (options.sourceAnnotation) {
              tags.push({
                tag: 'script',
                attrs: { type: 'text/javascript' },
                children: `window.__UIB_SOURCE_CONFIG__=${JSON.stringify(options.sourceAnnotation)};`,
                injectTo: 'head-prepend',
              });
            }
            tags.push({
              tag: 'script',
              attrs: { src: `${CLIENT_URL}?t=${Date.now()}` },
              injectTo: 'head',
            });
          }
          return tags;
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
            const injection = buildInjectionHtml(resolvedPort, options.sourceAnnotation);
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

/**
 * Vite plugin set for use in vite.config.js. Includes code-inspector for
 * automatic source attribution by default. Spread into the plugins array:
 *
 *   plugins: [...uiBridgeVite()]
 *
 * Pass `inspector: false` for frameworks that handle source attribution
 * themselves (Astro) or where code-inspector cannot annotate templates
 * (Laravel/Blade, Django, Twig).
 */
export function uiBridgeVite(options: UiBridgeOptions = {}) {
  const { inspector = true, ...rest } = options;
  const base = unpluginFactory.vite(rest);
  if (!inspector) return [base];
  return [
    {
      ...codeInspectorPlugin({ bundler: 'vite', behavior: { locate: false } }),
      transformIndexHtml: undefined,
      apply: 'serve' as const,
    },
    base,
  ];
}

// ── future bundler support (not yet officially maintained) ───────────────────
// The underlying unplugin factory supports webpack, rspack, rollup, and esbuild.
// These exports are commented out until first-class support is added with demos
// and integration tests. Uncomment to use at your own risk.

// /** Webpack plugin — use in webpack.config.js */
// export const uiBridgeWebpack = unpluginFactory.webpack;

// /** Rspack plugin — use in rspack.config.js */
// export const uiBridgeRspack = unpluginFactory.rspack;

// /** Rollup plugin — use in rollup.config.js */
// export const uiBridgeRollup = unpluginFactory.rollup;

// /** esbuild plugin — use in esbuild.build({ plugins: [...] }) */
// export const uiBridgeEsbuild = unpluginFactory.esbuild;

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
