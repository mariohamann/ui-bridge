/**
 * Astro integration tests for Design Bridge.
 *
 * These are *integration* tests — they verify the @design-bridge/astro
 * package wires up correctly in a real Astro dev server. We only test the
 * things that are unique to the Astro integration:
 *
 *  1. The WS URL global is injected into the page.
 *  2. The client bundle is registered and boots (db-annotation element defined).
 *  3. The client bundle is served by the middleware.
 *  4. The Design Bridge WebSocket server is reachable.
 *  5. Full annotation round-trip: create on the page → appears on the review UI.
 */

import { test, expect } from '@playwright/test';
import { access, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASTRO_DEMO_ROOT = resolve(__dirname, '../../../demos/astro');
const ANNOTATIONS_DIR = resolve(ASTRO_DEMO_ROOT, '.design-bridge', 'annotations');

const DB_PORT = parseInt(process.env.DESIGN_BRIDGE_PORT ?? '7378', 10);
const API_BASE = `http://localhost:${DB_PORT}/api`;
const REVIEW_URL = `http://localhost:${DB_PORT}/`;

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
  const res = await request.get('http://localhost:4321/__design-bridge/client.js');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('javascript');
});

test('Design Bridge server health endpoint is reachable', async ({ request }) => {
  const res = await request.get(`http://localhost:${DB_PORT}/health`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { port: number };
  expect(typeof body.port).toBe('number');
});

test('annotation round-trip: created on the page appears on the review UI', async ({
  page,
  context,
}) => {
  // 1. Load the Astro demo and wait for the Design Bridge client to be ready
  await page.goto('/');
  await page.waitForFunction(() => !!customElements.get('db-annotation'), { timeout: 10_000 });

  // 2. Alt+Shift+click the h1. The inspector reads Astro's
  //    data-astro-source-file / data-astro-source-loc attributes and dispatches
  //    code-inspector:trackCode, which opens the annotation draft panel.
  const h1 = page.locator('h1').first();
  await h1.click({ modifiers: ['Alt', 'Shift'] });

  const panel = page.locator('db-annotation .panel:not([hidden])');
  const input = panel.locator('textarea').first();
  await expect(input).toBeVisible();
  await input.fill('Round-trip check from Astro');
  await input.press('Enter');
  await expect(panel).toHaveCount(0);

  // 3. Verify it was persisted via the API
  const res = await page.request.get(`${API_BASE}/annotations`);
  const body = (await res.json()) as { annotations: { id: string; comment: string }[] };
  expect(body.annotations.some((a) => a.comment === 'Round-trip check from Astro')).toBe(true);

  // File must be written inside the Astro demo root, not somewhere else
  const ann = body.annotations.find((a) => a.comment === 'Round-trip check from Astro')!;
  const expectedPath = resolve(ANNOTATIONS_DIR, `${ann.id}.json`);
  await expect(access(expectedPath)).resolves.toBeUndefined();

  const files = await readdir(ANNOTATIONS_DIR);
  expect(files).toContain(`${ann.id}.json`);

  // 4. Open the server-side review UI and confirm the comment is listed there
  const reviewPage = await context.newPage();
  await reviewPage.goto(REVIEW_URL);
  await expect(reviewPage.getByText('Round-trip check from Astro')).toBeVisible();
  await reviewPage.close();
});
