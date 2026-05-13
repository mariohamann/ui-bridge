/**
 * Integration tests for @design-bridge/unplugin — webpack variant.
 *
 * Verifies that the webpack plugin (designBridgeWebpack) wires up correctly
 * in the webpack-dev-server (demos/webpack):
 *
 *  1. The WS URL global is injected into the HTML by the processAssets hook.
 *  2. The db-annotation custom element boots after the client script loads.
 *  3. The Design Bridge server health endpoint is reachable.
 *  4. The client script tag is present in the served HTML.
 */
export {};
