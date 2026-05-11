/**
 * Vite plugin integration test.
 * Verifies that the plugin injects the Design Bridge client script into HTML
 * and that the web component mounts in the browser.
 */

import { test, expect } from '@playwright/test';

test('injects <bridge-panel> into the page via the Vite plugin', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('bridge-panel')).toBeAttached();
});

test('serves the client bundle at /__design-bridge/client.js', async ({ page }) => {
  const res = await page.request.get('http://localhost:5173/__design-bridge/client.js');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('javascript');
});
