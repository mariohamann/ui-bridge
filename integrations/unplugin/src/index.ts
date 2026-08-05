import { readFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { resolve as resolvePath } from 'node:path';
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
  const serverArgs = [serverEntry, '--root', rootDir, '--parent-pid', String(process.pid)];
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

interface PortResolution {
  port: Promise<number>;
  child: ChildProcess | null;
}

const resolutionsByRoot = new Map<string, PortResolution>();

// Fast path for a clean shutdown (Ctrl+C, normal exit) — kills every spawned
// server immediately instead of waiting on its parent-liveness watchdog poll.
// The watchdog (--parent-pid, see core/server/index.mjs) remains the fallback
// for abrupt termination (SIGKILL, crash) where this handler never runs.
process.once('exit', () => {
  for (const { child } of resolutionsByRoot.values()) {
    if (child && !child.killed) child.kill();
  }
});

/**
 * Resolve the actual port a UI Bridge server for `rootDir` is (or will be)
 * listening on — reusing an already-running server for the same root, or
 * spawning a new one otherwise. Memoized per root so concurrent callers (the
 * Vite plugin itself, plus framework wrappers like Astro/Nuxt that also need
 * the port to inject the WS URL) never spawn more than one server for the
 * same project.
 */
export function resolveUiBridgePort(
  rootDir: string,
  preferredPort: number,
  options: { preferences?: UserPreferences; allowOutsideRoot?: boolean } = {},
): Promise<number> {
  const existing = resolutionsByRoot.get(rootDir);
  if (existing) return existing.port;

  const entry: PortResolution = { port: Promise.resolve(preferredPort), child: null };
  entry.port = (async () => {
    const existingPort = await getServerPort(preferredPort, rootDir);
    if (existingPort !== null) {
      console.log(`[ui-bridge] using existing server at http://localhost:${existingPort}`);
      return existingPort;
    }
    const { child, ready } = spawnServer(
      rootDir,
      preferredPort,
      options.preferences,
      options.allowOutsideRoot,
    );
    entry.child = child;
    const resolvedPort = await ready;
    if (resolvedPort !== preferredPort) {
      // Informational only — the resolved port is used everywhere automatically,
      // and the root handshake below guards against ever syncing to the wrong project.
      console.log(`[ui-bridge] port ${preferredPort} was in use, using ${resolvedPort} instead.`);
    }
    return resolvedPort;
  })();

  resolutionsByRoot.set(rootDir, entry);
  return entry.port;
}

/** The child process spawned for `rootDir` by `resolveUiBridgePort`, if any (vs. reusing an existing server). */
export function getUiBridgeChild(rootDir: string): ChildProcess | null {
  return resolutionsByRoot.get(rootDir)?.child ?? null;
}

/** Forget the memoized resolution for `rootDir` so the next call resolves fresh (e.g. after the server is killed). */
export function clearUiBridgeResolution(rootDir: string): void {
  resolutionsByRoot.delete(rootDir);
}

/**
 * Build the injection HTML for a given WS port.
 * For webpack/rspack the client bundle is served by the ui-bridge server itself.
 */
function buildInjectionHtml(
  resolvedPort: number,
  rootDir: string,
  sourceAnnotation?: SourceAnnotationConfig,
): string {
  const wsUrl = `ws://localhost:${resolvedPort}/ui-bridge`;
  const clientUrl = `http://localhost:${resolvedPort}/ui-bridge/client.js`;
  const sourceConfigScript = sourceAnnotation
    ? `<script>window.__UIB_SOURCE_CONFIG__=${JSON.stringify(sourceAnnotation)};</script>`
    : '';
  return (
    `<script>window.__UIB_WS_URL__=${JSON.stringify(wsUrl)};` +
    `window.__UIB_EXPECTED_ROOT__=${JSON.stringify(rootDir)};</script>` +
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

  return {
    name: 'ui-bridge',

    // ── vite-specific hooks ─────────────────────────────────────────────────
    vite: {
      // Resolved (awaited) before Vite finalizes its config, so the proxy
      // target below and every later use of `resolvedPort` always reflect
      // the port the server actually bound to — never a stale guess.
      async config(config: { root?: string }, env: { command: string }) {
        rootDir = resolvePath(config.root ?? process.cwd());
        isDevServer = env.command === 'serve';
        if (isDevServer) {
          resolvedPort = await resolveUiBridgePort(rootDir, preferredPort, {
            preferences,
            allowOutsideRoot: options.allowOutsideRoot,
          });
        }
        return {
          server: {
            // Ignore all UI Bridge internal files — comments, scripts, file
            // assets, and the cache — so Vite never treats them as app source
            // changes and triggers spurious HMR updates or full page reloads.
            watch: { ignored: ['**/.ui-bridge/**'] },
            proxy: {
              // The standalone ui-bridge server only ever speaks plain ws/http
              // — it has no TLS story of its own. Proxying it through Vite's
              // own dev server keeps the WebSocket same-origin, so it
              // automatically inherits wss:// whenever Vite itself is served
              // over https (e.g. via Herd/Valet/mkcert). Without this, the
              // browser blocks a direct ws://localhost:<port> connection as
              // mixed content on an https page.
              '/ui-bridge': {
                target: `http://localhost:${resolvedPort}`,
                ws: true,
                changeOrigin: true,
              },
            },
          },
        };
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

        server.httpServer?.once('close', () => {
          const c = getUiBridgeChild(rootDir);
          if (c && !c.killed) c.kill();
          clearUiBridgeResolution(rootDir);
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
      //
      // `filter` lets Rollup/Rolldown pre-match the id natively and skip
      // calling into JS for every other module in the graph. Without it,
      // resolveId/load are invoked (and cross the JS boundary) once per
      // module in the whole project on every build, which is what showed up
      // disproportionately large in Rolldown's PLUGIN_TIMINGS output even
      // though the hooks are effectively no-ops outside of dev.
      resolveId: {
        filter: { id: /^virtual:ui-bridge$/ },
        handler(id: string) {
          if (id === 'virtual:ui-bridge') return '\0virtual:ui-bridge';
        },
      },

      load: {
        filter: { id: /^\0virtual:ui-bridge$/ },
        handler(id: string) {
          if (id !== '\0virtual:ui-bridge') return;
          if (!isDevServer) return 'export {};';
          const sourceConfigInit = options.sourceAnnotation
            ? `window.__UIB_SOURCE_CONFIG__=${JSON.stringify(options.sourceAnnotation)};`
            : '';
          // Frameworks that own the HTML response (Laravel, Django, Rails…)
          // still load this JS entry file directly from the Vite dev server,
          // so `import.meta.url` resolves to that dev server's own origin —
          // even though the page itself is served by a different backend on
          // a different origin/port.
          //
          // Only route the WebSocket through the same-origin `/ui-bridge`
          // proxy (registered in `config()`) when that origin is https —
          // that's the one case where connecting directly to the standalone
          // server (a different origin/port, plain ws://) gets blocked as
          // mixed content. Everywhere else, connect directly: Vite's proxy
          // middleware only wires up the WebSocket `upgrade` event when Vite
          // owns its own `httpServer`, which isn't true when Vite runs in
          // middleware mode (e.g. Storybook's Vite builder) — there the proxy
          // entry never receives the upgrade at all and the socket just hangs
          // in CONNECTING forever, silently dropping every comment.
          return (
            `if(typeof window!=='undefined'&&!window.__UIB_WS_URL__){` +
            `var o=new URL(import.meta.url).origin;` +
            `window.__UIB_WS_URL__=o.startsWith('https:')` +
            `?('wss://'+new URL(o).host+'/ui-bridge')` +
            `:${JSON.stringify(`ws://localhost:${resolvedPort}/ui-bridge`)};` +
            `window.__UIB_EXPECTED_ROOT__=${JSON.stringify(rootDir)};` +
            sourceConfigInit +
            `var s=document.createElement('script');` +
            `s.src=o+'/__ui-bridge/client.js';` +
            `document.head.appendChild(s);}` +
            `export {};`
          );
        },
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
            const CLIENT_URL = '/__ui-bridge/client.js';
            // Same-origin as the page (Vite serves this HTML directly). Only
            // route through the `/ui-bridge` proxy (registered in `config()`)
            // when the page is https — the one case where a direct plain
            // `ws://localhost:<port>` connection gets blocked as mixed
            // content. Everywhere else, connect directly to the standalone
            // server: the proxy's WebSocket `upgrade` handling only works
            // when Vite owns its own `httpServer`, which isn't true when Vite
            // runs in middleware mode (e.g. Storybook's Vite builder) — there
            // the proxy never receives the upgrade and the socket just hangs
            // in CONNECTING forever, silently dropping every comment.
            const wsUrlScript =
              `(function(){if(location.protocol==='https:'){` +
              `window.__UIB_WS_URL__='wss://'+location.host+'/ui-bridge';` +
              `}else{` +
              `window.__UIB_WS_URL__=${JSON.stringify(`ws://localhost:${resolvedPort}/ui-bridge`)};` +
              `}` +
              `window.__UIB_EXPECTED_ROOT__=${JSON.stringify(rootDir)};` +
              `})();`;
            tags.push({
              tag: 'script',
              attrs: { type: 'text/javascript' },
              children: wsUrlScript,
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
      resolveUiBridgePort(rootDir, preferredPort, {
        preferences,
        allowOutsideRoot: options.allowOutsideRoot,
      }).then((port) => {
        resolvedPort = port;
      });
    });

    // Kill the child process when the compiler shuts down (webpack 5 / rspack).
    compiler.hooks.shutdown?.tapAsync('ui-bridge', (callback: () => void) => {
      const c = getUiBridgeChild(rootDir);
      if (c && !c.killed) c.kill();
      clearUiBridgeResolution(rootDir);
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
            const injection = buildInjectionHtml(resolvedPort, rootDir, options.sourceAnnotation);
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
