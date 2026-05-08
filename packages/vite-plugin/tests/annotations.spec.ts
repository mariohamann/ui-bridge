/**
 * Annotation end-to-end tests for Design Bridge.
 *
 * The panel is a `<bridge-panel>` custom element injected by the Vite plugin.
 * Its internals live in a Shadow DOM — Playwright pierces open shadow roots
 * automatically when you call `.locator()` on another locator.
 *
 * Annotation flow:
 *  1. Hold Alt+Shift and click any element (code-inspector's selection UX).
 *     → The annotation popover opens with a CSS selector chip AND a source chip.
 *  2. Type a comment and save — a badge appears and the row shows in the list.
 *  3. The WS message reaches the server; GET /design-bridge/api/annotations returns it.
 */

import { test, expect, type Page, type Locator } from '@playwright/test';

const API_BASE = 'http://localhost:7378/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the shadow root of `<bridge-panel>` as a locator base. */
function panel(page: Page): Locator {
  return page.locator('bridge-panel');
}

/** Pierces into the shadow DOM. Playwright auto-pierces open shadow roots. */
function inPanel(page: Page, selector: string): Locator {
  return panel(page).locator(selector);
}

/**
 * Opens the Annotations tab to view the annotation list.
 * Note: no longer activates any inspect mode — selection is via Alt+Shift+click.
 */
async function openAnnotationsTab(page: Page): Promise<void> {
  const tab = inPanel(page, 'button[role="tab"]:has-text("Annotations")');
  await tab.waitFor({ state: 'visible' });
  await tab.click();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Annotations', () => {

  test.beforeEach(async ({ page }) => {
    await page.request.delete(`${API_BASE}/annotations`);
    await page.goto('/');
    await page.waitForSelector('bridge-panel');
    await page.waitForSelector('bridge-annotation-popover', { state: 'attached' });
  });

  test.afterEach(async ({ page }) => {
    await page.request.delete(`${API_BASE}/annotations`);
  });

  // ── Panel basics ────────────────────────────────────────────────────────────

  test('bridge-panel is injected into the page', async ({ page }) => {
    await expect(panel(page)).toBeAttached();
  });

  test('Annotations tab is visible inside the panel', async ({ page }) => {
    const tab = inPanel(page, 'button[role="tab"]:has-text("Annotations")');
    await expect(tab).toBeVisible();
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  test('shows empty state when no annotations exist', async ({ page }) => {
    await openAnnotationsTab(page);
    await expect(inPanel(page, '.db-empty')).toBeVisible();
  });

  // ── Creating an annotation ──────────────────────────────────────────────────

  test('creates an annotation by clicking a page element with Alt+Shift', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });

    const popover = page.locator('bridge-annotation-popover');
    await expect(popover.locator('textarea')).toBeVisible();
    await popover.locator('textarea').fill('This headline needs a stronger CTA.');

    await popover.locator('button.btn-save, button:has-text("Save")').click();
    await expect(popover).not.toBeVisible();

    await openAnnotationsTab(page);
    await expect(inPanel(page, '.db-ann-row')).toBeVisible();
    await expect(inPanel(page, '.db-ann-comment')).toHaveText('This headline needs a stronger CTA.');
  });

  test('annotation badge appears on the annotated element', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });

    const popover = page.locator('bridge-annotation-popover');
    await expect(popover.locator('textarea')).toBeVisible();
    await popover.locator('textarea').fill('Badge test');
    await popover.locator('button.btn-save, button:has-text("Save")').click();

    await expect(page.locator('bridge-annotation-badge .badge')).toBeVisible();
  });

  // ── Persistence ─────────────────────────────────────────────────────────────

  test('annotation is persisted to the server API', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });

    const popover = page.locator('bridge-annotation-popover');
    await expect(popover.locator('textarea')).toBeVisible();
    await popover.locator('textarea').fill('Persisted comment');
    await popover.locator('button.btn-save, button:has-text("Save")').click();
    await expect(popover).not.toBeVisible();

    const res = await page.request.get(`${API_BASE}/annotations`);
    expect(res.status()).toBe(200);
    const body = await res.json() as { annotations: { comment: string; }[]; };
    expect(body.annotations.some(a => a.comment === 'Persisted comment')).toBe(true);
  });

  test('page reload restores annotations from server', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });

    const popover = page.locator('bridge-annotation-popover');
    await expect(popover.locator('textarea')).toBeVisible();
    await popover.locator('textarea').fill('Survives reload');
    await popover.locator('button.btn-save, button:has-text("Save")').click();
    await expect(popover).not.toBeVisible();

    await page.reload();
    await page.waitForSelector('bridge-panel');
    await openAnnotationsTab(page);

    await expect(inPanel(page, '.db-ann-comment')).toHaveText('Survives reload');
  });

  test('badge reappears on the correct element after reload', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });

    const popover = page.locator('bridge-annotation-popover');
    await expect(popover.locator('textarea')).toBeVisible();
    await popover.locator('textarea').fill('Pinned to h1');
    await popover.locator('button.btn-save, button:has-text("Save")').click();
    await expect(popover).not.toBeVisible();

    await page.reload();
    await page.waitForSelector('bridge-panel');
    await page.waitForSelector('bridge-annotation-badge', { state: 'attached' });

    // Badge should reappear after reload without manually opening the tab
    const badge = page.locator('bridge-annotation-badge .badge').first();
    await expect(badge).toBeVisible();

    // The badge should be positioned within the viewport (not off-screen)
    const badgeBox = await badge.boundingBox();
    expect(badgeBox).not.toBeNull();
    expect(badgeBox!.x).toBeGreaterThanOrEqual(0);
    expect(badgeBox!.y).toBeGreaterThanOrEqual(0);

    // The annotation comment should still be correct after reload
    await openAnnotationsTab(page);
    await expect(inPanel(page, '.db-ann-comment')).toHaveText('Pinned to h1');
  });

  // ── Editing an annotation ───────────────────────────────────────────────────

  test('editing an annotation updates its comment', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });

    const popover = page.locator('bridge-annotation-popover');
    await expect(popover.locator('textarea')).toBeVisible();
    await popover.locator('textarea').fill('Original comment');
    await popover.locator('button.btn-save, button:has-text("Save")').click();
    await expect(popover).not.toBeVisible();

    await openAnnotationsTab(page);
    await inPanel(page, '.db-ann-row').first().click();

    const editPopover = page.locator('bridge-annotation-popover');
    await expect(editPopover.locator('textarea')).toBeVisible();
    await editPopover.locator('textarea').clear();
    await editPopover.locator('textarea').fill('Updated comment');
    await editPopover.locator('button.btn-save, button:has-text("Save")').click();
    await expect(editPopover).not.toBeVisible();

    await expect(inPanel(page, '.db-ann-comment')).toHaveText('Updated comment');
  });

  // ── Deleting annotations ────────────────────────────────────────────────────

  test('deletes a single annotation via the delete button in the list', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });

    const popover = page.locator('bridge-annotation-popover');
    await expect(popover.locator('textarea')).toBeVisible();
    await popover.locator('textarea').fill('To be deleted');
    await popover.locator('button.btn-save, button:has-text("Save")').click();
    await expect(popover).not.toBeVisible();

    await openAnnotationsTab(page);
    await inPanel(page, '.db-icon-btn--del').first().click();

    await expect(inPanel(page, '.db-ann-row')).not.toBeVisible();
    await expect(inPanel(page, '.db-empty')).toBeVisible();
  });

  test('deletes a single annotation via the delete button in the popover', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });

    const popover = page.locator('bridge-annotation-popover');
    await expect(popover.locator('textarea')).toBeVisible();
    await popover.locator('textarea').fill('Popover delete test');
    await popover.locator('button.btn-save, button:has-text("Save")').click();
    await expect(popover).not.toBeVisible();

    await openAnnotationsTab(page);
    await inPanel(page, '.db-ann-row').first().click();

    const editPopover = page.locator('bridge-annotation-popover');
    await expect(editPopover.locator('textarea')).toBeVisible();
    await editPopover.locator('button.btn-delete, button:has-text("Delete")').click();
    await expect(editPopover).not.toBeVisible();

    await expect(inPanel(page, '.db-empty')).toBeVisible();
  });

  test('"Clear all" removes every annotation', async ({ page }) => {
    for (const selector of ['h1', 'p']) {
      await page.locator(selector).first().click({ modifiers: ['Alt', 'Shift'] });
      const popover = page.locator('bridge-annotation-popover');
      await expect(popover.locator('textarea')).toBeVisible();
      await popover.locator('textarea').fill(`Comment on ${selector}`);
      await popover.locator('button.btn-save, button:has-text("Save")').click();
      await expect(popover).not.toBeVisible();
    }

    await openAnnotationsTab(page);
    await expect(inPanel(page, '.db-ann-row')).toHaveCount(2);

    await inPanel(page, 'button:has-text("Clear all"), .db-btn--danger').click();

    await expect(inPanel(page, '.db-empty')).toBeVisible();
    await expect(inPanel(page, '.db-ann-row')).toHaveCount(0);
  });

  test('clear all is reflected in the server API', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const popover = page.locator('bridge-annotation-popover');
    await expect(popover.locator('textarea')).toBeVisible();
    await popover.locator('textarea').fill('API clear test');
    await popover.locator('button.btn-save, button:has-text("Save")').click();
    await expect(popover).not.toBeVisible();

    await openAnnotationsTab(page);
    await inPanel(page, 'button:has-text("Clear all"), .db-btn--danger').click();
    await expect(inPanel(page, '.db-empty')).toBeVisible();

    const res = await page.request.get(`${API_BASE}/annotations`);
    const body = await res.json() as { annotations: unknown[]; };
    expect(body.annotations).toHaveLength(0);
  });

  // ── Source location + multi-element (code-inspector integration) ────────────

  test('alt+shift+click opens popover with selector chip and source chip', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });

    const popover = page.locator('bridge-annotation-popover');
    await expect(popover.locator('.chip')).toBeVisible();
    await expect(popover.locator('.source-chip')).toBeVisible();
  });

  test('alt+shift+click while popover is open adds another selector chip', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const popover = page.locator('bridge-annotation-popover');
    await expect(popover.locator('.chip')).toBeVisible();

    // Alt+Shift+click a second element while popover is open adds another chip
    await page.locator('p').first().click({ modifiers: ['Alt', 'Shift'] });
    await expect(popover.locator('.chip')).toHaveCount(2);
  });

  test('annotation saved with source location includes file, line, column', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });

    const popover = page.locator('bridge-annotation-popover');
    await expect(popover.locator('.source-chip')).toBeVisible();
    await popover.locator('textarea').fill('Has source info');
    await popover.locator('button.btn-save, button:has-text("Save")').click();
    await expect(popover).not.toBeVisible();

    const apiRes = await page.request.get(`${API_BASE}/annotations`);
    const body = await apiRes.json() as { annotations: { comment: string; source?: { file: string; line: number; column: number; }; }[]; };
    const ann = body.annotations.find(a => a.comment === 'Has source info');
    expect(ann).toBeDefined();
    expect(ann!.source?.file).toContain('HeroSection.vue');
    expect(typeof ann!.source?.line).toBe('number');
    expect(typeof ann!.source?.column).toBe('number');
  });

  test('can annotate multiple elements in one annotation via the popover chips', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const popover = page.locator('bridge-annotation-popover');
    await expect(popover.locator('textarea')).toBeVisible();

    await page.locator('p').first().click({ modifiers: ['Alt', 'Shift'] });
    await expect(popover.locator('.chip')).toHaveCount(2);

    await popover.locator('textarea').fill('Multi-element annotation');
    await popover.locator('button.btn-save, button:has-text("Save")').click();
    await expect(popover).not.toBeVisible();

    await openAnnotationsTab(page);
    await expect(inPanel(page, '.db-ann-extra')).toBeVisible();
    await expect(inPanel(page, '.db-ann-extra')).toHaveText('+1');
  });
});
