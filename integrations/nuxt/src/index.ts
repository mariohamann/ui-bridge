import { addVitePlugin, defineNuxtModule, useNuxt } from '@nuxt/kit';
import type { NuxtModule } from '@nuxt/schema';
import { uiBridgeVite, resolveUiBridgePort } from '@ui-bridge/unplugin';

export interface UiBridgeModuleOptions {
  /**
   * Port the UI Bridge server listens on.
   * Resolution order: this option → UI_BRIDGE_PORT env var → UIB_PORT env var (legacy) → 7378.
   */
  port?: number;
}

/**
 * UI Bridge Nuxt 3 module.
 *
 * Usage in nuxt.config.ts:
 *
 * ```ts
 * export default defineNuxtConfig({
 *   modules: ['@ui-bridge/nuxt'],
 * });
 * ```
 *
 * Or with options:
 * ```ts
 * export default defineNuxtConfig({
 *   modules: [['@ui-bridge/nuxt', { port: 7378 }]],
 * });
 * ```
 *
 * Only active in development mode (`nuxt dev`).
 */
const uiBridgeModule: NuxtModule<UiBridgeModuleOptions> = defineNuxtModule<UiBridgeModuleOptions>({
  meta: {
    name: '@ui-bridge/nuxt',
    configKey: 'uiBridge',
  },

  defaults: {},

  setup: async (options, nuxt) => {
    // Only active during development
    if (!nuxt.options.dev) return;

    const preferredPort =
      options.port ?? parseInt(process.env.UI_BRIDGE_PORT ?? process.env.UIB_PORT ?? '7378', 10);

    const plugins = uiBridgeVite({ port: options.port });
    for (const plugin of plugins) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      addVitePlugin(plugin as any);
    }

    // Resolve (and await) the port the server actually bound to — shared and
    // memoized with the Vite plugin's own resolution by root, so this never
    // spawns a second server and never injects a stale/wrong port.
    const resolvedPort = await resolveUiBridgePort(nuxt.options.rootDir, preferredPort);
    const wsUrl = `ws://localhost:${resolvedPort}/ui-bridge`;
    const clientUrl = `http://localhost:${resolvedPort}/ui-bridge/client.js`;

    // Inject the WS URL and client script into every rendered page.
    // Nuxt doesn't have a static index.html, so we use head injection.
    const n = useNuxt();
    n.options.app.head.script = n.options.app.head.script ?? [];
    n.options.app.head.script.push(
      {
        innerHTML:
          `window.__UIB_WS_URL__=${JSON.stringify(wsUrl)};` +
          `window.__UIB_EXPECTED_ROOT__=${JSON.stringify(nuxt.options.rootDir)};`,
      },
      { src: clientUrl, async: true },
    );
  },
});

export default uiBridgeModule;
export { uiBridgeVite };
