/**
 * Annotation end-to-end tests for Design Bridge.
 */

import { test, expect, type Page, type Locator } from '@playwright/test';

const API_BASE = 'http://localhost:7378/api';

function panel(page: Page): Locator {
  return page.locator('bridge-panel');
}

function inPanel(page: Page, selector: string): Locator {
  return panel(page).locator(selector);
}

/** The draft or open annotation item's panel (shadow DOM piercing). */
function annotationPanel(page: Page): Locator {
  return page.locator('bridge-annotation-item .panel:not([hidden])');
}

async function openAnnotationsTab(page: Page): Promise<void> {
  const tab = inPanel(page, 'button[role="tab"]:has-text("Annotations")');
  await tab.waitFor({ state: 'visible' });
  await tab.click();
}

async function createAnnotation(page: Page, selector: string, comment: string): Promise<void> {
  await page.locator(selector).first().click({ modifiers: ['Alt', 'Shift'] });
  const panel = annotationPanel(page);
  const input = panel.locator('textarea').first();
  await expect(input).toBeVisible();
  await input.fill(comment);
  await input.press('Enter');
  // Panel closes after save
  await expect(annotationPanel(page)).toHaveCount(0);
}

test.describe('Annotations', () => {
  test.beforeEach(async ({ page }) => {
    await page.request.delete(`${API_BASE}/annotations`);
    await page.goto('/');
    await page.waitForSelector('bridge-panel');
  });

  test.afterEach(async ({ page }) => {
    await page.request.delete(`${API_BASE}/annotations`);
  });

  test('bridge-panel is injected into the page', async ({ page }) => {
    await expect(panel(page)).toBeAttached();
  });

  test('Annotations tab is visible inside the panel', async ({ page }) => {
    const tab = inPanel(page, 'button[role="tab"]:has-text("Annotations")');
    await expect(tab).toBeVisible();
  });

  test('shows empty state when no annotations exist', async ({ page }) => {
    await openAnnotationsTab(page);
    await expect(inPanel(page, '.db-empty')).toBeVisible();
  });

  test('creates an annotation by clicking a page element with Alt+Shift', async ({ page }) => {
    await createAnnotation(page, 'h1', 'This headline needs a stronger CTA.');

    await openAnnotationsTab(page);
    await expect(inPanel(page, '.db-ann-row')).toBeVisible();
    await expect(inPanel(page, '.db-ann-comment')).toHaveText('This headline needs a stronger CTA.');
  });

  test('annotation badge appears on the annotated element', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Badge test');
    await expect(page.locator('bridge-annotation-item .badge')).toBeVisible();
  });

  test('annotation is persisted to the server API', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Persisted comment');

    const res = await page.request.get(`${API_BASE}/annotations`);
    expect(res.status()).toBe(200);
    const body = await res.json() as { annotations: { comment: string }[] };
    expect(body.annotations.some((a) => a.comment === 'Persisted comment')).toBe(true);
  });

  test('page reload restores annotations from server', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Survives reload');

    await page.reload();
    await page.waitForSelector('bridge-panel');
    await openAnnotationsTab(page);
    await expect(inPanel(page, '.db-ann-comment')).toHaveText('Survives reload');
  });

  test('badge reappears on the correct element after reload', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Pinned to h1');

    await page.reload();
    await page.waitForSelector('bridge-panel');
    await page.waitForSelector('bridge-annotation-item', { state: 'attached' });

    const badge = page.locator('bridge-annotation-item .badge').first();
    await expect(badge).toBeVisible();

    const badgeBox = await badge.boundingBox();
    expect(badgeBox).not.toBeNull();
    expect(badgeBox!.x).toBeGreaterThanOrEqual(0);
    expect(badgeBox!.y).toBeGreaterThanOrEqual(0);

    await openAnnotationsTab(page);
    await expect(inPanel(page, '.db-ann-comment')).toHaveText('Pinned to h1');
  });

  test('can reply to an annotation from the badge', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Original comment');

    const badge = page.locator('bridge-annotation-item .badge').first();
    await badge.click();

    const panel = annotationPanel(page);
    const replyInput = panel.locator('textarea[data-role="reply"]');
    await expect(replyInput).toBeVisible();
    await replyInput.fill('Reply from badge');
    await replyInput.press('Enter');

    await openAnnotationsTab(page);
    await expect(inPanel(page, '.db-ann-comment')).toHaveText('Original comment');
  });

  test('focuses textarea when creating and when opening from badge', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });

    const panel = annotationPanel(page);
    const composer = panel.locator('textarea[data-role="composer"]');
    await expect(composer).toBeVisible();
    await expect(composer).toBeFocused();

    await composer.fill('Focus baseline');
    await composer.press('Enter');
    await expect(annotationPanel(page)).toHaveCount(0);

    const badge = page.locator('bridge-annotation-item .badge').first();
    await badge.click();

    const openPanel = annotationPanel(page);
    const reply = openPanel.locator('textarea[data-role="reply"]');
    await expect(reply).toBeVisible();
    await expect(reply).toBeFocused();
  });

  test('clicking outside the annotation panel closes it', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });

    const panel = annotationPanel(page);
    await expect(panel.locator('textarea[data-role="composer"]')).toBeVisible();

    await page.locator('main').click({ position: { x: 8, y: 8 } });
    await expect(annotationPanel(page)).toHaveCount(0);
  });

  test('resolving from the annotation panel removes the annotation', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Resolve me');

    const badge = page.locator('bridge-annotation-item .badge').first();
    await badge.click();

    const panel = annotationPanel(page);
    await panel.locator('.icon-btn[title="Resolve"]').click();

    await expect(page.locator('bridge-annotation-item .badge')).toHaveCount(0);
    await openAnnotationsTab(page);
    await expect(inPanel(page, '.db-empty')).toBeVisible();
  });

  test('deletes a single annotation via the delete button in the list', async ({ page }) => {
    await createAnnotation(page, 'h1', 'To be deleted');

    await openAnnotationsTab(page);
    await inPanel(page, '.db-icon-btn--del').first().click();

    await expect(inPanel(page, '.db-ann-row')).not.toBeVisible();
    await expect(inPanel(page, '.db-empty')).toBeVisible();
  });

  test('deletes a single annotation via the delete button in the panel', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Panel delete test');

    await openAnnotationsTab(page);
    await inPanel(page, '.db-ann-row').first().click();

    const panel = annotationPanel(page);
    await panel.locator('.icon-btn[title="More options"]').click();
    await panel.locator('.menu-item.danger').click();
    await expect(annotationPanel(page)).toHaveCount(0);

    await expect(inPanel(page, '.db-empty')).toBeVisible();
  });

  test('"Clear all" removes every annotation', async ({ page }) => {
    for (const selector of ['h1', 'p']) {
      await createAnnotation(page, selector, `Comment on ${selector}`);
    }

    await openAnnotationsTab(page);
    await expect(inPanel(page, '.db-ann-row')).toHaveCount(2);

    await inPanel(page, 'button:has-text("Clear all"), .db-btn--danger').click();

    await expect(inPanel(page, '.db-empty')).toBeVisible();
    await expect(inPanel(page, '.db-ann-row')).toHaveCount(0);
  });

  test('clear all is reflected in the server API', async ({ page }) => {
    await createAnnotation(page, 'h1', 'API clear test');

    await openAnnotationsTab(page);
    await inPanel(page, 'button:has-text("Clear all"), .db-btn--danger').click();
    await expect(inPanel(page, '.db-empty')).toBeVisible();

    const res = await page.request.get(`${API_BASE}/annotations`);
    const body = await res.json() as { annotations: unknown[] };
    expect(body.annotations).toHaveLength(0);
  });

  test('alt+shift+click opens panel with selector chip and source chip', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });

    const panel = annotationPanel(page);
    await expect(panel.locator('.chip')).toBeVisible();
    await expect(panel.locator('.source-chip')).toBeVisible();
  });

  test('alt+shift+click while panel is open adds another selector chip', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const panel = annotationPanel(page);
    await expect(panel.locator('.chip')).toBeVisible();

    await page.locator('p').first().click({ modifiers: ['Alt', 'Shift'] });
    await expect(panel.locator('.chip')).toHaveCount(2);
  });

  test('annotation saved with source location includes file, line, column', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });

    const panel = annotationPanel(page);
    await expect(panel.locator('.source-chip')).toBeVisible();
    const input = panel.locator('textarea').first();
    await input.fill('Has source info');
    await input.press('Enter');
    await expect(annotationPanel(page)).toHaveCount(0);

    const apiRes = await page.request.get(`${API_BASE}/annotations`);
    const body = await apiRes.json() as { annotations: { comment: string; source?: { file: string; line: number; column: number } }[] };
    const ann = body.annotations.find((a) => a.comment === 'Has source info');
    expect(ann).toBeDefined();
    expect(ann!.source?.file).toContain('HeroSection.vue');
    expect(typeof ann!.source?.line).toBe('number');
    expect(typeof ann!.source?.column).toBe('number');
  });

  test('can annotate multiple elements in one annotation via the panel chips', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const panel = annotationPanel(page);
    await expect(panel.locator('textarea').first()).toBeVisible();

    await page.locator('p').first().click({ modifiers: ['Alt', 'Shift'] });
    await expect(panel.locator('.chip')).toHaveCount(2);

    const input = panel.locator('textarea').first();
    await input.fill('Multi-element annotation');
    await input.press('Enter');
    await expect(annotationPanel(page)).toHaveCount(0);

    await openAnnotationsTab(page);
    await expect(inPanel(page, '.db-ann-extra')).toBeVisible();
    await expect(inPanel(page, '.db-ann-extra')).toHaveText('+1');
  });
});
