import type { AstroIntegration } from 'astro';
import { designBridgeWithInspector } from '@design-bridge/unplugin';

/** Options accepted by the designBridge() Astro integration. */
export interface DesignBridgeOptions {
  /**
   * Port the Design Bridge server listens on.
   * Resolution order: this option → DESIGN_BRIDGE_PORT env var → DB_PORT env var (legacy) → 7378.
   */
  port?: number;
}

/**
 * Astro integration for Design Bridge.
 *
 * Usage in astro.config.mjs:
 *   import designBridge from '@design-bridge/astro';
 *   export default defineConfig({ integrations: [designBridge()] });
 *
 * The integration:
 *  1. Adds the Vite plugin (spawns the Design Bridge server, serves the client bundle)
 *  2. Injects `window.__DB_WS_URL__` inline so the client bundle knows which WS to connect to
 *  3. Injects the client bundle script tag
 *
 * Astro's `transformIndexHtml` hook (used by the plain Vite plugin) is not
 * called for .astro pages, so we use Astro's `injectScript` API instead.
 */
export function designBridge(options: DesignBridgeOptions = {}): AstroIntegration {
  // The resolved WS port is communicated from the Vite plugin via a shared
  // module-level variable. We can't easily read it here synchronously, so we
  // use a lazy placeholder that reads __DB_WS_URL__ if already set, then falls
  // back to polling — or simply mirror what the Vite plugin does: inject a
  // small inline script that sets the URL, followed by the bundle.
  //
  // To keep things simple and avoid duplication we let the Vite plugin handle:
  //   • spawning / reusing the server
  //   • serving /__design-bridge/client.js
  //
  // And we handle script injection here via injectScript.

  const preferredPort =
    options.port ??
    parseInt(process.env.DESIGN_BRIDGE_PORT ?? process.env.DB_PORT ?? '7378', 10);

  return {
    name: 'design-bridge',
    hooks: {
      'astro:config:setup': ({ updateConfig, injectScript, command }) => {
        // Only active during dev (the bridge panel has no purpose in builds)
        if (command !== 'dev') return;

        // Add the Vite plugin so the server is spawned and the bundle is served.
        // This also includes code-inspector-plugin (bundled inside @design-bridge/unplugin)
        // which adds data-insp-path attributes for source location on Alt+Shift+click.
        // Cast to any: Astro 6 uses Vite 7 (rollup) while the vite-plugin is typed
        // against Vite 8 (rolldown) — the Plugin interface differs at the type level
        // but is compatible at runtime.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updateConfig({ vite: { plugins: [designBridgeWithInspector(options) as any] } });

        // Inject the WS URL global + a runtime script loader for the client bundle.
        // We use head-inline (raw HTML injection) so Vite's import-analysis plugin
        // never sees the /__design-bridge/client.js URL — it's loaded at runtime
        // via document.createElement, which hits the Vite middleware directly.
        const wsUrl = `ws://localhost:${preferredPort}/design-bridge`;
        injectScript(
          'head-inline',
          `window.__DB_WS_URL__=${JSON.stringify(wsUrl)};` +
          `(function(){var s=document.createElement('script');` +
          `s.src='/__design-bridge/client.js?t='+Date.now();` +
          `document.head.appendChild(s);})();`,
        );
      },
    },
  };
}

export default designBridge;
