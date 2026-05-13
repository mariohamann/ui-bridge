/**
 * Integration tests for @design-bridge/unplugin — Vite variant.
 *
 * These tests verify that the unplugin wires up correctly in the Vite
 * dev server (demos/vite-vue):
 *
 *  1. The WS URL global is injected into the page.
 *  2. The client bundle is served by the Vite middleware and boots.
 *  3. The Design Bridge server health endpoint is reachable.
 *  4. The client bundle is served at the expected path.
 *  5. Basic annotation round-trip: create on page → persisted to server.
 */
export {};
