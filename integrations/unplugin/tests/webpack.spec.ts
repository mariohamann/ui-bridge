/**
 * Integration tests for @design-bridge/unplugin — webpack variant.
 *
 * Verifies that the webpack plugin (designBridgeWebpack) wires up correctly
 * in the webpack-dev-server (demos/webpack):
 *
 *  1. The WS URL global is injected into the HTML by the processAssets hook.
 *  2. The db-comment custom element boots after the client script loads.
 *  3. The Design Bridge server health endpoint is reachable.
 *  4. The client script tag is present in the served HTML.
 *  5. Full comment round-trip: create on the page → persisted to the correct file location.
 */

import { test, expect } from '@playwright/test';
import { access, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const DB_PORT = parseInt(process.env.DESIGN_BRIDGE_PORT ?? process.env.DB_PORT ?? '7378', 10);
const API_BASE = `http://localhost:${DB_PORT}/api`;

/** Resolve the comment directory from the running server's reported root. */
async function getCommentsDir(request: {
  get: (url: string) => Promise<{ json: () => Promise<unknown>; }>;
}): Promise<string> {
  const res = await request.get(`http://localhost:${DB_PORT}/health`);
  const body = (await res.json()) as { root: string; };
  return resolve(body.root, '.design-bridge', 'comments');
}

test('injects __DB_WS_URL__ into the page', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__DB_WS_URL__ === 'string', {
    timeout: 10_000,
  });
  const wsUrl = await page.evaluate(() => (window as any).__DB_WS_URL__);
  expect(wsUrl).toMatch(/^ws:\/\//);
});

test('db-comment custom element is registered after client boots', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!customElements.get('db-comment'), { timeout: 10_000 });
  const isDefined = await page.evaluate(() => !!customElements.get('db-comment'));
  expect(isDefined).toBe(true);
});

test('Design Bridge server health endpoint is reachable', async ({ request }) => {
  const res = await request.get(`http://localhost:${DB_PORT}/health`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { port: number; };
  expect(typeof body.port).toBe('number');
});

test('client script tag is present in the served HTML', async ({ page }) => {
  await page.goto('/');
  // The webpack plugin injects a <script> pointing at the DB server's client bundle
  const scriptSrc = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    return (
      scripts
        .map((s) => (s as HTMLScriptElement).src)
        .find((src) => src.includes('design-bridge/client')) ?? null
    );
  });
  expect(scriptSrc).not.toBeNull();
  expect(scriptSrc).toContain('design-bridge/client');
});

test.describe('comment round-trip', () => {
  test.beforeEach(async ({ request }) => {
    await request.delete(`${API_BASE}/comments`);
  });

  test.afterEach(async ({ request }) => {
    await request.delete(`${API_BASE}/comments`);
  });

  test('comment created on the page is persisted to the correct location', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => !!customElements.get('db-comment') && typeof (window as any).__DB_WS_URL__ === 'string',
      { timeout: 10_000 },
    );

    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });

    const panel = page.locator('#db-items db-comment .panel:not([hidden])');
    const waInput = panel.locator('wa-textarea[data-role="composer"]');
    await expect(waInput).toBeVisible();
    await waInput.locator('textarea').fill('webpack integration check');
    await waInput.locator('textarea').press('Enter');
    await expect(panel).toHaveCount(0);

    const res = await page.request.get(`${API_BASE}/comments`);
    const body = (await res.json()) as {
      comments: { meta: { id: string; }; comments?: { text: string; }[]; }[];
    };
    expect(
      body.comments.some((a) => a.comments?.[0]?.text === 'webpack integration check'),
    ).toBe(true);

    const ann = body.comments.find((a) => a.comments?.[0]?.text === 'webpack integration check')!;
    const commentsDir = await getCommentsDir(request);
    const expectedPath = resolve(commentsDir, `${ann.meta.id}.json`);
    await expect(access(expectedPath)).resolves.toBeUndefined();

    const files = await readdir(commentsDir);
    expect(files).toContain(`${ann.meta.id}.json`);
  });
});
