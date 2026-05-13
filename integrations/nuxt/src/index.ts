import { addVitePlugin, defineNuxtModule, useNuxt } from '@nuxt/kit';
import type { NuxtModule } from '@nuxt/schema';
import { designBridgeWithInspector } from '@design-bridge/unplugin';

export interface DesignBridgeModuleOptions {
  /**
   * Port the Design Bridge server listens on.
   * Resolution order: this option → DESIGN_BRIDGE_PORT env var → DB_PORT env var (legacy) → 7378.
   */
  port?: number;
}

/**
 * Design Bridge Nuxt 3 module.
 *
 * Usage in nuxt.config.ts:
 *
 * ```ts
 * export default defineNuxtConfig({
 *   modules: ['@design-bridge/nuxt'],
 * });
 * ```
 *
 * Or with options:
 * ```ts
 * export default defineNuxtConfig({
 *   modules: [['@design-bridge/nuxt', { port: 7378 }]],
 * });
 * ```
 *
 * Only active in development mode (`nuxt dev`).
 */
const designBridgeModule: NuxtModule<DesignBridgeModuleOptions> = defineNuxtModule<DesignBridgeModuleOptions>({
  meta: {
    name: '@design-bridge/nuxt',
    configKey: 'designBridge',
  },

  defaults: {},

  setup(options, nuxt) {
    // Only active during development
    if (!nuxt.options.dev) return;

    const port = options.port ?? parseInt(process.env.DESIGN_BRIDGE_PORT ?? process.env.DB_PORT ?? '7378', 10);
    const wsUrl = `ws://localhost:${port}/design-bridge`;
    const clientUrl = `http://localhost:${port}/design-bridge/client.js`;

    const plugins = designBridgeWithInspector({ port: options.port });
    for (const plugin of plugins) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      addVitePlugin(plugin as any);
    }

    // Inject the WS URL and client script into every rendered page.
    // Nuxt doesn't have a static index.html, so we use head injection.
    const n = useNuxt();
    n.options.app.head.script = n.options.app.head.script ?? [];
    n.options.app.head.script.push(
      { innerHTML: `window.__DB_WS_URL__=${JSON.stringify(wsUrl)};` },
      { src: clientUrl, async: true },
    );
  },
});

export default designBridgeModule;
export { designBridgeWithInspector };
