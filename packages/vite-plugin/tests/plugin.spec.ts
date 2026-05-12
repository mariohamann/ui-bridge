/**
 * Vite plugin integration test.
 * Verifies that the plugin injects the Design Bridge client script into HTML
 * and that the web component mounts in the browser.
 */

import { test, expect } from '@playwright/test';

test('injects the Design Bridge client script into the page via the Vite plugin', async ({ page }) => {
  await page.goto('/');
  // Confirm the custom element is registered (component mounted by the injected client script)
  const isDefined = await page.evaluate(() => !!customElements.get('db-annotation'));
  expect(isDefined).toBe(true);
  // Confirm __DB_WS_URL__ was injected by the plugin
  const wsUrl = await page.evaluate(() => (window as any).__DB_WS_URL__);
  expect(typeof wsUrl).toBe('string');
  expect(wsUrl).toContain('ws://');
});

test('serves the client bundle at /__design-bridge/client.js', async ({ page }) => {
  const res = await page.request.get('http://localhost:5173/__design-bridge/client.js');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('javascript');
});
