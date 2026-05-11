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

test.beforeEach(async ({ page }) => {
  await page.request.delete(`${API_BASE}/annotations`);
  await page.goto('/');
  await expect(panel(page)).toBeAttached();
});

test.afterEach(async ({ page }) => {
  await page.request.delete(`${API_BASE}/annotations`);
});

test.describe('Annotations', () => {
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
    const body = await res.json() as { annotations: { comment: string; }[]; };
    expect(body.annotations.some((a) => a.comment === 'Persisted comment')).toBe(true);
  });

  test('page reload restores annotations from server', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Survives reload');

    await page.reload();
    await expect(panel(page)).toBeAttached();
    await openAnnotationsTab(page);
    await expect(inPanel(page, '.db-ann-comment')).toHaveText('Survives reload');
  });

  test('badge reappears on the correct element after reload', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Pinned to h1');

    const h1Box = await page.locator('h1').first().boundingBox();
    expect(h1Box).not.toBeNull();

    await page.reload();
    await expect(panel(page)).toBeAttached();
    await expect(page.locator('bridge-annotation-item')).toBeAttached();

    const badge = page.locator('bridge-annotation-item .badge').first();
    await expect(badge).toBeVisible();

    const badgeBox = await badge.boundingBox();
    expect(badgeBox).not.toBeNull();
    // Badge should be vertically near the h1 element (within 200px)
    expect(Math.abs(badgeBox!.y - h1Box!.y)).toBeLessThan(200);
    expect(badgeBox!.x).toBeGreaterThanOrEqual(0);

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
    const body = await res.json() as { annotations: unknown[]; };
    expect(body.annotations).toHaveLength(0);
  });

  test('alt+shift+click opens panel with source chip visible after save via "Show paths"', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Source chip test');

    const badge = page.locator('bridge-annotation-item .badge').first();
    await badge.click();
    const p = annotationPanel(page);
    await p.locator('.icon-btn[title="More options"]').click();
    await p.locator('.menu-item:has-text("Show paths")').click();

    await expect(p.locator('.chips-bar .chip')).toBeVisible();
    await expect(p.locator('.chips-bar .source-chip')).toBeVisible();
  });

  test('alt+shift+click while panel is open adds another selector chip (visible after save)', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const draft = page.locator('bridge-annotation-item .panel:not([hidden])');
    await expect(draft.locator('textarea[data-role="composer"]')).toBeVisible();

    await page.locator('p').first().click({ modifiers: ['Alt', 'Shift'] });

    // Save and verify via API that 2 selectors are stored
    const textarea = draft.locator('textarea[data-role="composer"]');
    await textarea.fill('Two selectors');
    await textarea.press('Enter');
    await expect(annotationPanel(page)).toHaveCount(0);

    const res = await page.request.get(`${API_BASE}/annotations`);
    const body = await res.json() as { annotations: { selectors: string[]; }[]; };
    const ann = body.annotations.find((a) => a.selectors.length === 2);
    expect(ann).toBeDefined();
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
    const body = await apiRes.json() as { annotations: { comment: string; source?: { file: string; line: number; column: number; }; }[]; };
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

test.describe('Badge hover preview', () => {
  test('preview appears on badge hover and shows the comment', async ({ page }) => {
    await createAnnotation(page, 'h1', 'This headline needs a stronger CTA.');

    const badge = page.locator('bridge-annotation-item .badge').first();
    await badge.hover();

    const preview = page.locator('bridge-annotation-item .badge-preview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('.badge-preview-text')).toHaveText('This headline needs a stronger CTA.');
  });

  test('preview is not visible when not hovering', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Preview hidden at rest');

    const preview = page.locator('bridge-annotation-item .badge-preview');
    await page.mouse.move(0, 0);
    await expect(preview).not.toHaveClass(/visible/);
  });

  test('preview shows reply count when replies exist', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Original comment');

    const badge = page.locator('bridge-annotation-item .badge').first();
    await badge.click();
    const replyInput = annotationPanel(page).locator('textarea[data-role="reply"]');
    await expect(replyInput).toBeVisible();
    await replyInput.fill('A reply');
    await replyInput.press('Enter');

    await page.locator('bridge-annotation-item .icon-btn.close').click();
    await expect(annotationPanel(page)).toHaveCount(0);

    await badge.hover();
    const preview = page.locator('bridge-annotation-item .badge-preview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('.badge-preview-meta')).toHaveText('1 reply');
  });

  test('preview is hidden while panel is open', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Open panel test');

    const badge = page.locator('bridge-annotation-item .badge').first();
    await badge.click();
    await expect(annotationPanel(page)).toBeVisible();

    await expect(page.locator('bridge-annotation-item .badge-preview')).toHaveCount(0);
  });

  test('preview text wraps to at most 3 lines', async ({ page }) => {
    const long = 'The quick brown fox jumps over the lazy dog. '.repeat(4).trim();
    await createAnnotation(page, 'h1', long);

    const badge = page.locator('bridge-annotation-item .badge').first();
    await badge.hover();
    const previewText = page.locator('bridge-annotation-item .badge-preview-text').first();
    await expect(previewText).toBeVisible();

    // 12px font × 1.4 line-height × 3 lines ≈ 50px; allow a small margin
    const box = await previewText.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(55);
  });
});

test.describe('Panel scrolling & textarea autogrow', () => {
  test('panel scrolls when replies overflow its max-height', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Overflow test');

    const badge = page.locator('bridge-annotation-item .badge').first();
    await badge.click();
    const p = page.locator('bridge-annotation-item .panel:not([hidden])');

    // Add enough replies to overflow the panel
    for (let i = 1; i <= 8; i++) {
      const reply = p.locator('textarea[data-role="reply"]');
      await reply.scrollIntoViewIfNeeded();
      await expect(reply).toBeVisible();
      await reply.fill(`Reply number ${i} with some extra text to take up space`);
      await reply.press('Enter');
      await expect(p.locator('.comment-text')).toHaveCount(i + 1);
    }

    // Panel should be scrollable: scrollHeight > clientHeight
    const isScrollable = await p.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(isScrollable).toBe(true);
  });

  test('reply textarea remains accessible when panel overflows', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Scroll position test');

    const badge = page.locator('bridge-annotation-item .badge').first();
    await badge.click();
    const p = page.locator('bridge-annotation-item .panel:not([hidden])');

    for (let i = 1; i <= 8; i++) {
      const reply = p.locator('textarea[data-role="reply"]');
      await reply.scrollIntoViewIfNeeded();
      await expect(reply).toBeVisible();
      await reply.fill(`Reply ${i}`);
      await reply.press('Enter');
      await expect(p.locator('.comment-text')).toHaveCount(i + 1);
    }

    // Even with 8 replies, the textarea should still be visible/reachable
    const reply = p.locator('textarea[data-role="reply"]');
    await reply.scrollIntoViewIfNeeded();
    await expect(reply).toBeVisible();
    await expect(reply).toBeEditable();
  });

  test('textarea grows taller as content is typed', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('bridge-annotation-item .panel:not([hidden])');
    const textarea = p.locator('textarea[data-role="composer"]');
    await expect(textarea).toBeVisible();

    const initialHeight = (await textarea.boundingBox())!.height;

    // Type enough lines to force growth
    await textarea.fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6');

    const grownHeight = (await textarea.boundingBox())!.height;
    expect(grownHeight).toBeGreaterThan(initialHeight);
  });

  test('textarea has no internal scrollbar (overflow is hidden or field-sizing)', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('bridge-annotation-item .panel:not([hidden])');
    const textarea = p.locator('textarea[data-role="composer"]');
    await expect(textarea).toBeVisible();

    await textarea.fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6');

    // scrollHeight should equal clientHeight — no internal scroll
    const hasInternalScroll = await textarea.evaluate(
      (el: HTMLTextAreaElement) => el.scrollHeight > el.clientHeight
    );
    expect(hasInternalScroll).toBe(false);
  });
});

test.describe('Compact UI (redesign)', () => {
  test('annotation panel uses Inter font', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('bridge-annotation-item .panel:not([hidden])');
    const fontFamily = await p.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily.toLowerCase()).toContain('inter');
  });

  test('create mode: no Cancel button present', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('bridge-annotation-item .panel:not([hidden])');
    await expect(p.locator('.btn-cancel, button:has-text("Cancel")')).toHaveCount(0);
  });

  test('create mode: send button is always visible', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('bridge-annotation-item .panel:not([hidden])');
    await expect(p.locator('.send-btn')).toBeVisible();
  });

  test('create mode: send button is disabled when textarea is empty', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('bridge-annotation-item .panel:not([hidden])');
    await expect(p.locator('.send-btn')).toBeDisabled();
  });

  test('create mode: send button becomes enabled when text is typed', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('bridge-annotation-item .panel:not([hidden])');
    await p.locator('textarea[data-role="composer"]').fill('hello');
    await expect(p.locator('.send-btn')).toBeEnabled();
  });

  test('create mode: no body padding (no .body element rendered)', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('bridge-annotation-item .panel:not([hidden])');
    await expect(p.locator('.body')).toHaveCount(0);
  });

  test('create mode: no chips bar shown (paths hidden)', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('bridge-annotation-item .panel:not([hidden])');
    await expect(p.locator('.chips-bar')).toHaveCount(0);
  });

  test('create mode: composer has rounded inner card', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('bridge-annotation-item .panel:not([hidden])');
    const inner = p.locator('.composer-inner');
    await expect(inner).toBeVisible();
    const radius = await inner.evaluate((el) => getComputedStyle(el).borderRadius);
    // 10px border-radius
    expect(radius).not.toBe('0px');
  });

  test('view mode: header has Close button, no Cancel button', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Header test');
    const badge = page.locator('bridge-annotation-item .badge').first();
    await badge.click();
    const p = annotationPanel(page);
    await expect(p.locator('.icon-btn.close')).toBeVisible();
    await expect(p.locator('.btn-cancel, button:has-text("Cancel")')).toHaveCount(0);
  });

  test('view mode: paths hidden by default', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Paths hidden test');
    const badge = page.locator('bridge-annotation-item .badge').first();
    await badge.click();
    const p = annotationPanel(page);
    await expect(p.locator('.chips-bar')).toHaveCount(0);
  });

  test('view mode: "Show paths" in menu reveals chips bar', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Show paths test');
    const badge = page.locator('bridge-annotation-item .badge').first();
    await badge.click();
    const p = annotationPanel(page);

    await p.locator('.icon-btn[title="More options"]').click();
    await p.locator('.menu-item:has-text("Show paths")').click();

    await expect(p.locator('.chips-bar')).toBeVisible();
    await expect(p.locator('.chips-bar .chip, .chips-bar .source-chip')).not.toHaveCount(0);
  });

  test('view mode: "Hide paths" in menu hides chips bar again', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Toggle paths test');
    const badge = page.locator('bridge-annotation-item .badge').first();
    await badge.click();
    const p = annotationPanel(page);

    await p.locator('.icon-btn[title="More options"]').click();
    await p.locator('.menu-item:has-text("Show paths")').click();
    await expect(p.locator('.chips-bar')).toBeVisible();

    await p.locator('.icon-btn[title="More options"]').click();
    await p.locator('.menu-item:has-text("Hide paths")').click();
    await expect(p.locator('.chips-bar')).toHaveCount(0);
  });

  test('chips-bar is horizontally scrollable when selectors overflow', async ({ page }) => {
    // Add multiple selectors so the chips bar overflows
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const draft = page.locator('bridge-annotation-item .panel:not([hidden])');
    await page.locator('p').first().click({ modifiers: ['Alt', 'Shift'] });
    await page.locator('nav').first().click({ modifiers: ['Alt', 'Shift'] }).catch(() => { });

    const textarea = draft.locator('textarea[data-role="composer"]');
    await textarea.fill('Multi selector');
    await textarea.press('Enter');
    await expect(annotationPanel(page)).toHaveCount(0);

    const badge = page.locator('bridge-annotation-item .badge').first();
    await badge.click();
    const p = annotationPanel(page);
    await p.locator('.icon-btn[title="More options"]').click();
    await p.locator('.menu-item:has-text("Show paths")').click();

    const bar = p.locator('.chips-bar');
    await expect(bar).toBeVisible();
    const overflow = await bar.evaluate((el) => getComputedStyle(el).overflowX);
    expect(overflow).toBe('auto');
  });

  test('chip font is monospace', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const draft = page.locator('bridge-annotation-item .panel:not([hidden])');
    const textarea = draft.locator('textarea[data-role="composer"]');
    await textarea.fill('Chip font test');
    await textarea.press('Enter');

    const badge = page.locator('bridge-annotation-item .badge').first();
    await badge.click();
    const p = annotationPanel(page);
    await p.locator('.icon-btn[title="More options"]').click();
    await p.locator('.menu-item:has-text("Show paths")').click();

    const chip = p.locator('.chips-bar .chip').first();
    await expect(chip).toBeVisible();
    const font = await chip.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(font).toMatch(/monospace/i);
  });
});

test.describe('Element highlight on annotation create', () => {
  test('target element gets amber outline when draft opens', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    await expect(annotationPanel(page)).toBeVisible();

    const highlighted = page.locator('[data-db-related]');
    await expect(highlighted).not.toHaveCount(0);
  });

  test('outline clears after saving the annotation', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Outline clears on save');
    await expect(page.locator('[data-db-related]')).toHaveCount(0);
  });

  test('outline clears after cancelling (clicking outside)', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    await expect(page.locator('[data-db-related]')).not.toHaveCount(0);

    await page.locator('main').click({ position: { x: 8, y: 8 } });
    await expect(annotationPanel(page)).toHaveCount(0);
    await expect(page.locator('[data-db-related]')).toHaveCount(0);
  });

  test('all elements get highlighted when multiple are added to draft', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    await expect(page.locator('[data-db-related]')).toHaveCount(1);

    await page.locator('p').first().click({ modifiers: ['Alt', 'Shift'] });
    await expect(page.locator('[data-db-related]')).toHaveCount(2);
  });
});

test.describe('Multi-select while draft is open', () => {
  test('clicking an already-annotated element while draft is open adds it to draft', async ({ page }) => {
    // Create a saved annotation on h1
    await createAnnotation(page, 'h1', 'Existing annotation');
    await expect(page.locator('bridge-annotation-item .badge')).toHaveCount(1);

    // Start a new draft on p
    await page.locator('p').first().click({ modifiers: ['Alt', 'Shift'] });
    const draft = annotationPanel(page);
    await expect(draft).toBeVisible();

    // Click h1 (already annotated) while draft is open — should add to draft, not open old annotation
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });

    // Still just one open panel (the draft), not the existing annotation's panel
    await expect(page.locator('bridge-annotation-item .panel:not([hidden])')).toHaveCount(1);

    // Save and verify via API that the new annotation has 2 selectors (p + h1)
    const textarea = draft.locator('textarea[data-role="composer"]');
    await textarea.fill('Multi-select with existing element');
    await textarea.press('Enter');
    await expect(annotationPanel(page)).toHaveCount(0);

    const res = await page.request.get(`${API_BASE}/annotations`);
    const body = await res.json() as { annotations: { comment: string; selectors: string[]; }[]; };
    const newAnn = body.annotations.find((a) => a.comment === 'Multi-select with existing element');
    expect(newAnn).toBeDefined();
    expect(newAnn!.selectors.length).toBe(2);
  });
});
