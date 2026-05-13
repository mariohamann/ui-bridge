/**
 * Integration tests for @design-bridge/unplugin — Vite variant.
 *
 * These tests verify that the unplugin wires up correctly in the Vite
 * dev server (demos/vite):
 *
 *  1. The WS URL global is injected into the page.
 *  2. The client bundle is served by the Vite middleware and boots.
 *  3. The Design Bridge server health endpoint is reachable.
 *  4. The client bundle is served at the expected path.
 *  5. Basic annotation round-trip: create on page → persisted to server.
 */

import { test, expect } from '@playwright/test';
import { access, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const DB_PORT = parseInt(process.env.DESIGN_BRIDGE_PORT ?? process.env.DB_PORT ?? '7378', 10);
const API_BASE = `http://localhost:${DB_PORT}/api`;

/** Resolve the annotation directory from the running server's reported root. */
async function getAnnotationsDir(request: {
  get: (url: string) => Promise<{ json: () => Promise<unknown> }>;
}): Promise<string> {
  const res = await request.get(`http://localhost:${DB_PORT}/health`);
  const body = (await res.json()) as { root: string };
  return resolve(body.root, '.design-bridge', 'annotations');
}

test.beforeEach(async ({ request }) => {
  await request.delete(`${API_BASE}/annotations`);
});

test.afterEach(async ({ request }) => {
  await request.delete(`${API_BASE}/annotations`);
});

test('injects __DB_WS_URL__ into the page', async ({ page }) => {
  await page.goto('/');
  const wsUrl = await page.evaluate(() => (window as any).__DB_WS_URL__);
  expect(typeof wsUrl).toBe('string');
  expect(wsUrl).toMatch(/^ws:\/\//);
});

test('db-annotation custom element is registered after client boots', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!customElements.get('db-annotation'), { timeout: 10_000 });
  const isDefined = await page.evaluate(() => !!customElements.get('db-annotation'));
  expect(isDefined).toBe(true);
});

test('serves the client bundle at /__design-bridge/client.js', async ({ request }) => {
  const res = await request.get('http://localhost:5173/__design-bridge/client.js');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('javascript');
});

test('Design Bridge server health endpoint is reachable', async ({ request }) => {
  const res = await request.get(`http://localhost:${DB_PORT}/health`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { port: number };
  expect(typeof body.port).toBe('number');
});

test('annotation round-trip: created on the page is persisted to the server', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      !!customElements.get('db-annotation') && typeof (window as any).__DB_WS_URL__ === 'string',
    { timeout: 10_000 },
  );

  await page
    .locator('h1')
    .first()
    .click({ modifiers: ['Alt', 'Shift'] });

  const panel = page.locator('db-annotation .panel:not([hidden])');
  const input = panel.locator('textarea').first();
  await expect(input).toBeVisible();
  await input.fill('unplugin integration check');
  await input.press('Enter');
  await expect(panel).toHaveCount(0);

  const res = await page.request.get(`${API_BASE}/annotations`);
  const body = (await res.json()) as { annotations: { id: string; comment: string }[] };
  expect(body.annotations.some((a) => a.comment === 'unplugin integration check')).toBe(true);

  // File must be written inside the server's root, not somewhere else
  const ann = body.annotations.find((a) => a.comment === 'unplugin integration check')!;
  const annotationsDir = await getAnnotationsDir(request);
  const expectedPath = resolve(annotationsDir, `${ann.id}.json`);
  await expect(access(expectedPath)).resolves.toBeUndefined();

  const files = await readdir(annotationsDir);
  expect(files).toContain(`${ann.id}.json`);
});
