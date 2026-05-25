/**
 * Astro integration tests for Design Bridge.
 *
 * These are *integration* tests — they verify the @design-bridge/astro
 * package wires up correctly in a real Astro dev server. We only test the
 * things that are unique to the Astro integration:
 *
 *  1. The WS URL global is injected into the page.
 *  2. The client bundle is registered and boots (db-comment element defined).
 *  3. The client bundle is served by the middleware.
 *  4. The Design Bridge WebSocket server is reachable.
 *  5. Full comment round-trip: create on the page → appears on the review UI.
 *
 * NOTE — selectors use `db-*` tags (e.g. `db-textarea`, `db-button`) even though
 * source components are authored with `wa-*`. The client build renames every `wa-`
 * to `db-` to avoid CustomElementRegistry collisions on host pages that also load
 * Web Awesome. See core/client/build.mjs and AGENTS.md for details.
 */

import { test, expect } from '@playwright/test';
import { access, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASTRO_DEMO_ROOT = resolve(__dirname, '../../../demos/astro');
const ANNOTATIONS_DIR = resolve(ASTRO_DEMO_ROOT, '.design-bridge', 'comments');

const DB_PORT = parseInt(process.env.DESIGN_BRIDGE_PORT ?? '7378', 10);
const API_BASE = `http://localhost:${DB_PORT}/api`;

test.beforeEach(async ({ request }) => {
  await request.delete(`${API_BASE}/comments`);
});

test.afterEach(async ({ request }) => {
  await request.delete(`${API_BASE}/comments`);
});

test('injects __DB_WS_URL__ into the page', async ({ page }) => {
  await page.goto('/');
  const wsUrl = await page.evaluate(() => (window as any).__DB_WS_URL__);
  expect(typeof wsUrl).toBe('string');
  expect(wsUrl).toMatch(/^ws:\/\//);
});

test('db-comment custom element is registered after client boots', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!customElements.get('db-comment'), { timeout: 10_000 });
  const isDefined = await page.evaluate(() => !!customElements.get('db-comment'));
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

test('comment round-trip: created on the page appears on the review UI', async ({ page }) => {
  // 1. Load the Astro demo and wait for the Design Bridge client to be ready
  await page.goto('/');
  await page.waitForFunction(() => !!customElements.get('db-comment'), { timeout: 10_000 });

  // 2. Alt+Shift+click the h1. The inspector reads Astro's
  //    data-astro-source-file / data-astro-source-loc attributes and dispatches
  //    code-inspector:trackCode, which opens the comment draft panel.
  const h1 = page.locator('h1').first();
  await h1.click({ modifiers: ['Alt', 'Shift'] });

  const panel = page.locator('#db-items db-comment .panel:not([hidden])');
  const waInput = panel.locator('db-textarea[data-role="composer"]');
  await expect(waInput).toBeVisible();
  await waInput.locator('textarea').fill('Round-trip check from Astro');
  await waInput.locator('textarea').press('Enter');
  await expect(panel).toHaveCount(0);

  // 3. Verify it was persisted via the API
  const res = await page.request.get(`${API_BASE}/comments`);
  const body = (await res.json()) as {
    comments: { meta: { id: string }; comments?: { text: string }[] }[];
  };
  expect(body.comments.some((a) => a.comments?.[0]?.text === 'Round-trip check from Astro')).toBe(
    true,
  );

  // File must be written inside the Astro demo root, not somewhere else
  const ann = body.comments.find((a) => a.comments?.[0]?.text === 'Round-trip check from Astro')!;
  const expectedPath = resolve(ANNOTATIONS_DIR, `${ann.meta.id}.json`);
  await expect(access(expectedPath)).resolves.toBeUndefined();

  const files = await readdir(ANNOTATIONS_DIR);
  expect(files).toContain(`${ann.meta.id}.json`);
});
