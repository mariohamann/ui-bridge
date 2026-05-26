/**
 * Integration tests for @ui-bridge/unplugin — Vite variant.
 *
 * These tests verify that the unplugin wires up correctly in the Vite
 * dev server (demos/vite):
 *
 *  1. The WS URL global is injected into the page.
 *  2. The client bundle is served by the Vite middleware and boots.
 *  3. The UI Bridge server health endpoint is reachable.
 *  4. The client bundle is served at the expected path.
 *  5. Basic comment round-trip: create on page → persisted to server.
 *
 * NOTE — selectors use `uib-*` tags (e.g. `uib-textarea`, `uib-button`) even though
 * source components are authored with `wa-*`. The client build renames every `wa-`
 * to `uib-` to avoid CustomElementRegistry collisions on host pages that also load
 * Web Awesome. See core/client/build.mjs and AGENTS.md for details.
 */

import { test, expect } from '@playwright/test';
import { access, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const UIB_PORT = parseInt(process.env.UI_BRIDGE_PORT ?? process.env.UIB_PORT ?? '7378', 10);
const API_BASE = `http://localhost:${UIB_PORT}/api`;

/** Resolve the comment directory from the running server's reported root. */
async function getCommentsDir(request: {
  get: (url: string) => Promise<{ json: () => Promise<unknown>; }>;
}): Promise<string> {
  const res = await request.get(`http://localhost:${UIB_PORT}/health`);
  const body = (await res.json()) as { root: string; };
  return resolve(body.root, '.ui-bridge', 'comments');
}

test.beforeEach(async ({ request }) => {
  await request.delete(`${API_BASE}/comments`);
});

test.afterEach(async ({ request }) => {
  await request.delete(`${API_BASE}/comments`);
});

test('injects __UIB_WS_URL__ into the page', async ({ page }) => {
  await page.goto('/');
  const wsUrl = await page.evaluate(() => (window as any).__UIB_WS_URL__);
  expect(typeof wsUrl).toBe('string');
  expect(wsUrl).toMatch(/^ws:\/\//);
});

test('uib-comment custom element is registered after client boots', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!customElements.get('uib-comment'), { timeout: 10_000 });
  const isDefined = await page.evaluate(() => !!customElements.get('uib-comment'));
  expect(isDefined).toBe(true);
});

test('serves the client bundle at /__ui-bridge/client.js', async ({ request }) => {
  const res = await request.get('http://localhost:5173/__ui-bridge/client.js');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('javascript');
});

test('UI Bridge server health endpoint is reachable', async ({ request }) => {
  const res = await request.get(`http://localhost:${UIB_PORT}/health`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { port: number; };
  expect(typeof body.port).toBe('number');
});

test('comment round-trip: created on the page is persisted to the server', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.waitForFunction(
    () => !!customElements.get('uib-comment') && typeof (window as any).__UIB_WS_URL__ === 'string',
    { timeout: 10_000 },
  );

  await page
    .locator('h1')
    .first()
    .click({ modifiers: ['Alt', 'Shift'] });

  const panel = page.locator('#uib-items uib-comment .panel:not([hidden])');
  const waInput = panel.locator('uib-textarea[data-role="composer"]');
  await expect(waInput).toBeVisible();
  await waInput.locator('textarea').fill('unplugin integration check');
  await waInput.locator('textarea').press('Enter');
  await expect(panel).toHaveCount(0);

  const res = await page.request.get(`${API_BASE}/comments`);
  const body = (await res.json()) as {
    comments: { meta: { id: string; }; comments?: { text: string; }[]; }[];
  };
  expect(body.comments.some((a) => a.comments?.[0]?.text === 'unplugin integration check')).toBe(
    true,
  );

  // File must be written inside the server's root, not somewhere else
  const ann = body.comments.find((a) => a.comments?.[0]?.text === 'unplugin integration check')!;
  const commentsDir = await getCommentsDir(request);
  const expectedPath = resolve(commentsDir, `${ann.meta.id}.json`);
  await expect(access(expectedPath)).resolves.toBeUndefined();

  const files = await readdir(commentsDir);
  expect(files).toContain(`${ann.meta.id}.json`);
});
