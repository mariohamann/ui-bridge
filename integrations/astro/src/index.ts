import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { uiBridgeVite, resolveUiBridgePort } from '@ui-bridge/unplugin';
import type { CommentThread } from '@ui-bridge/protocol';

/** Options accepted by the uiBridge() Astro integration. */
export interface UiBridgeOptions {
  /**
   * Port the UI Bridge server listens on.
   * Resolution order: this option → UI_BRIDGE_PORT env var → UIB_PORT env var (legacy) → 7378.
   */
  port?: number;
  /**
   * Inject the UI Bridge client into production/static builds without a
   * running server. No WebSocket connection is attempted.
   */
  staticMode?: boolean;
  /**
   * Pre-baked comments to display in static mode. Only used when
   * `staticMode` is `true`.
   */
  staticComments?: CommentThread[];
  /**
   * Allow tweaks to modify files outside the project root directory.
   */
  allowOutsideRoot?: boolean;
}

/**
 * Astro integration for UI Bridge.
 *
 * Usage in astro.config.mjs:
 *   import uiBridge from '@ui-bridge/astro';
 *   export default defineConfig({ integrations: [uiBridge()] });
 *
 * The integration:
 *  1. Adds the Vite plugin (spawns the UI Bridge server, serves the client bundle)
 *  2. Injects `window.__UIB_WS_URL__` inline so the client bundle knows which WS to connect to
 *  3. Injects the client bundle script tag
 *
 * Astro's `transformIndexHtml` hook (used by the plain Vite plugin) is not
 * called for .astro pages, so we use Astro's `injectScript` API instead.
 */
export function uiBridge(options: UiBridgeOptions = {}): AstroIntegration {
  // We let the Vite plugin handle spawning/reusing the server and serving
  // /__ui-bridge/client.js, and handle script injection here via injectScript.

  const preferredPort =
    options.port ?? parseInt(process.env.UI_BRIDGE_PORT ?? process.env.UIB_PORT ?? '7378', 10);

  return {
    name: 'ui-bridge',
    hooks: {
      'astro:config:setup': async ({ config, updateConfig, injectScript, command }) => {
        // Only active during dev (or staticMode for production builds)
        if (command !== 'dev' && !options.staticMode) return;

        if (options.staticMode) {
          // In static mode: emit the client bundle as an asset and inject it
          // without any WebSocket connection.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          updateConfig({ vite: { plugins: [uiBridgeVite(options) as any] } });
          const staticModeScript =
            `window.__UIB_STATIC_MODE__=true;` +
            (options.staticComments?.length
              ? `window.__UIB_STATIC_COMMENTS__=${JSON.stringify(options.staticComments)};`
              : '') +
            `(function(){var s=document.createElement('script');` +
            `s.src='/ui-bridge/client.js';` +
            `document.head.appendChild(s);})();`;
          injectScript('head-inline', staticModeScript);
          return;
        }

        // Add the Vite plugin so the server is spawned and the bundle is served.
        // We intentionally do NOT include code-inspector-plugin here: it injects
        // a client bundle that triggers Vite HMR on startup, which causes Astro to
        // re-render components client-side — stripping the native data-astro-source-*
        // attributes that Astro's compiler already provides in dev mode.
        // Cast to any: Astro 6 uses Vite 7 (rollup) while the vite-plugin is typed
        // against Vite 8 (rolldown) — the Plugin interface differs at the type level
        // but is compatible at runtime.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updateConfig({ vite: { plugins: [uiBridgeVite(options) as any] } });

        // Preserve data-astro-source-* attributes across HMR cycles.
        //
        // Astro's compiler injects data-astro-source-file and data-astro-source-loc
        // in dev mode so that tools can map DOM elements back to their source files.
        // However, Astro's Dev Toolbar and HMR pipeline strip these attributes during
        // re-renders, which breaks source-location lookup in the UI Bridge panel.
        //
        // This observer fires whenever either attribute is removed or changed. Because
        // we pass attributeOldValue:true we get the previous value in mutation.oldValue.
        // We immediately write it back with setAttribute — restoring the attribute before
        // any other script can read a missing value. The oldValue===null guard prevents
        // an infinite loop: when *our* setAttribute fires the observer again, oldValue
        // will be null (the attribute didn't exist before we set it), so we skip it.
        injectScript(
          'head-inline',
          `(function(){` +
            `new MutationObserver(function(ms){` +
            `ms.forEach(function(m){` +
            `if(m.oldValue===null)return;` +
            `m.target.setAttribute(m.attributeName,m.oldValue);` +
            `});` +
            `}).observe(document.documentElement,{` +
            `subtree:true,` +
            `attributes:true,` +
            `attributeFilter:['data-astro-source-file','data-astro-source-loc'],` +
            `attributeOldValue:true` +
            `});` +
            `})();`,
        );

        // Inject the WS URL global + a runtime script loader for the client bundle.
        // We use head-inline (raw HTML injection) so Vite's import-analysis plugin
        // never sees the /__ui-bridge/client.js URL — it's loaded at runtime
        // via document.createElement, which hits the Vite middleware directly.
        //
        // Resolve (and await) the port the server actually bound to — shared
        // and memoized with the Vite plugin's own resolution by root, so this
        // never spawns a second server and never injects a stale/wrong port.
        // `config.root` is a file URL and always keeps a trailing slash — normalize
        // it so it matches the server's node:path-resolved root exactly.
        const rootDir = resolvePath(fileURLToPath(config.root));
        const resolvedPort = await resolveUiBridgePort(rootDir, preferredPort, {
          allowOutsideRoot: options.allowOutsideRoot,
        });
        const wsUrl = `ws://localhost:${resolvedPort}/ui-bridge`;
        injectScript(
          'head-inline',
          `window.__UIB_WS_URL__=${JSON.stringify(wsUrl)};` +
            `window.__UIB_EXPECTED_ROOT__=${JSON.stringify(rootDir)};` +
            `(function(){var s=document.createElement('script');` +
            `s.src='/__ui-bridge/client.js?t='+Date.now();` +
            `document.head.appendChild(s);})();`,
        );
      },
    },
  };
}

export default uiBridge;
