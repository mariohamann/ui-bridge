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

import { test, expect } from '@playwright/test';

const DB_PORT = parseInt(process.env.DESIGN_BRIDGE_PORT ?? process.env.DB_PORT ?? '7378', 10);

test('injects __DB_WS_URL__ into the page', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__DB_WS_URL__ === 'string', { timeout: 10_000 });
  const wsUrl = await page.evaluate(() => (window as any).__DB_WS_URL__);
  expect(wsUrl).toMatch(/^ws:\/\//);
});

test('db-annotation custom element is registered after client boots', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!customElements.get('db-annotation'), { timeout: 10_000 });
  const isDefined = await page.evaluate(() => !!customElements.get('db-annotation'));
  expect(isDefined).toBe(true);
});

test('Design Bridge server health endpoint is reachable', async ({ request }) => {
  const res = await request.get(`http://localhost:${DB_PORT}/health`);
  expect(res.status()).toBe(200);
  const body = await res.json() as { port: number; };
  expect(typeof body.port).toBe('number');
});

test('client script tag is present in the served HTML', async ({ page }) => {
  await page.goto('/');
  // The webpack plugin injects a <script> pointing at the DB server's client bundle
  const scriptSrc = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    return scripts.map((s) => (s as HTMLScriptElement).src).find((src) => src.includes('design-bridge/client')) ?? null;
  });
  expect(scriptSrc).not.toBeNull();
  expect(scriptSrc).toContain('design-bridge/client');
});
