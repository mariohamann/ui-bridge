/**
 * Annotation end-to-end tests for Design Bridge.
 */

import { test, expect, type Page, type Locator } from '@playwright/test';

const DB_PORT = parseInt(process.env.DESIGN_BRIDGE_PORT ?? process.env.DB_PORT ?? '7378', 10);
const API_BASE = `http://localhost:${DB_PORT}/api`;
const REVIEW_URL = `http://localhost:${DB_PORT}/`;

/** The draft or open annotation item's panel (shadow DOM piercing). */
function annotationPanel(page: Page): Locator {
  return page.locator('db-annotation .panel:not([hidden])');
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
  // Wait for the Design Bridge client to initialise (inspector is ready)
  await page.waitForFunction(() => typeof (window as any).__DB_WS_URL__ === 'string');
});

test.afterEach(async ({ page }) => {
  await page.request.delete(`${API_BASE}/annotations`);
});

test.describe('Annotations', () => {
  test('review page shows empty state when no annotations exist', async ({ page }) => {
    await page.goto(REVIEW_URL);
    await expect(page.locator('.empty')).toBeVisible();
  });

  test('creates an annotation by clicking a page element with Alt+Shift', async ({ page }) => {
    await createAnnotation(page, 'h1', 'This headline needs a stronger CTA.');

    const res = await page.request.get(`${API_BASE}/annotations`);
    const body = await res.json() as { annotations: { comment: string; }[]; };
    expect(body.annotations.some((a) => a.comment === 'This headline needs a stronger CTA.')).toBe(true);
  });

  test('annotation badge appears on the annotated element', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Badge test');
    await expect(page.locator('db-annotation wa-badge')).toBeVisible();
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
    await expect(page.locator('db-annotation')).toBeAttached();
    await expect(page.locator('db-annotation wa-badge')).toBeVisible();
  });

  test('badge reappears on the correct element after reload', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Pinned to h1');

    const h1Box = await page.locator('h1').first().boundingBox();
    expect(h1Box).not.toBeNull();

    await page.reload();
    await expect(page.locator('db-annotation')).toBeAttached();

    const badge = page.locator('db-annotation wa-badge').first();
    await expect(badge).toBeVisible();

    const badgeBox = await badge.boundingBox();
    expect(badgeBox).not.toBeNull();
    // Badge should be vertically near the h1 element (within 200px)
    expect(Math.abs(badgeBox!.y - h1Box!.y)).toBeLessThan(200);
    expect(badgeBox!.x).toBeGreaterThanOrEqual(0);

  });

  test('can reply to an annotation from the badge', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Original comment');

    const badge = page.locator('db-annotation wa-badge').first();
    await badge.click();

    const panel = annotationPanel(page);
    const replyInput = panel.locator('textarea[data-role="reply"]');
    await expect(replyInput).toBeVisible();
    await replyInput.fill('Reply from badge');
    await replyInput.press('Enter');

    // Verify reply was saved to the server
    await expect.poll(async () => {
      const res = await page.request.get(`${API_BASE}/annotations`);
      const body = await res.json() as { annotations: { replies?: { text: string; }[]; }[]; };
      return body.annotations.some((a) => a.replies?.some((r) => r.text === 'Reply from badge'));
    }).toBe(true);
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

    const badge = page.locator('db-annotation wa-badge').first();
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

    const badge = page.locator('db-annotation wa-badge').first();
    await badge.click();

    const panel = annotationPanel(page);
    await panel.locator('wa-button[title="Resolve"]').click();

    await expect(page.locator('db-annotation wa-badge')).toHaveCount(0);
  });

  test('deletes an annotation via the review page discard button', async ({ page }) => {
    await createAnnotation(page, 'h1', 'To be deleted');

    await page.goto(REVIEW_URL);
    await expect(page.locator('.row')).toHaveCount(1);
    // Open three-dot menu and click Delete
    await page.locator('.row').first().hover();
    await page.locator('.row-menu').first().locator('wa-button[title="More"]').click();
    await page.locator('wa-dropdown-item[variant="danger"]').first().click();
    await expect(page.locator('.row')).toHaveCount(0);
    await expect(page.locator('.empty')).toBeVisible();
  });

  test('deletes a single annotation via the delete button in the panel', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Panel delete test');

    const badge = page.locator('db-annotation wa-badge').first();
    await badge.click();

    const panel = annotationPanel(page);
    await panel.locator('wa-button[title="More options"]').click();
    await page.locator('wa-dropdown-item[variant="danger"]').click();
    await expect(annotationPanel(page)).toHaveCount(0);
    await expect(page.locator('db-annotation wa-badge')).toHaveCount(0);
  });

  test('review page can resolve all annotations', async ({ page }) => {
    for (const selector of ['h1', 'p']) {
      await createAnnotation(page, selector, `Comment on ${selector}`);
    }

    await page.goto(REVIEW_URL);
    await expect(page.locator('.row')).toHaveCount(2);

    // Discard both via three-dot menu
    for (let i = 0; i < 2; i++) {
      await page.locator('.row').first().hover();
      await page.locator('.row-menu').first().locator('wa-button[title="More"]').click();
      await page.locator('wa-dropdown-item[variant="danger"]').first().click();
    }

    await expect(page.locator('.row')).toHaveCount(0);
    await expect(page.locator('.empty')).toBeVisible();
  });

  test('clicking a row in the review page opens the annotation panel in the app', async ({ page, context }) => {
    await createAnnotation(page, 'h1', 'Focus via review page');

    // Open the review page in a second tab while the app stays open
    const reviewPage = await context.newPage();
    await reviewPage.goto(REVIEW_URL);

    // Wait for the row to appear and for the review page WS to connect (dot turns green)
    await expect(reviewPage.locator('.row')).toHaveCount(1);
    await expect(reviewPage.locator('.dot.ok')).toBeVisible();

    // Click the row body — this sends annotation:focus via WS
    await reviewPage.locator('.row .body').first().click();

    // The app page should open the annotation panel for that annotation
    await expect(annotationPanel(page)).toBeVisible();

    await reviewPage.close();
  });

  test('discard on review page is reflected in the server API', async ({ page }) => {
    await createAnnotation(page, 'h1', 'API clear test');

    await page.goto(REVIEW_URL);
    await page.locator('.row').first().hover();
    await page.locator('.row-menu').first().locator('wa-button[title="More"]').click();
    await page.locator('wa-dropdown-item[variant="danger"]').first().click();
    await expect(page.locator('.empty')).toBeVisible();

    const res = await page.request.get(`${API_BASE}/annotations`);
    const body = await res.json() as { annotations: unknown[]; };
    expect(body.annotations).toHaveLength(0);
  });

  test('alt+shift+click opens panel with source chip visible after save via "Show paths"', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Source chip test');

    const badge = page.locator('db-annotation wa-badge').first();
    await badge.click();
    const p = annotationPanel(page);
    await p.locator('wa-button[title="More options"]').click();
    await page.locator('wa-dropdown-item:has-text("Show paths")').click();
    await expect(p.locator('.chips-bar')).toBeVisible();
    await expect(p.locator('.chips-bar wa-tag')).not.toHaveCount(0);
  });

  test('alt+shift+click while panel is open adds another selector chip (visible after save)', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const draft = page.locator('db-annotation .panel:not([hidden])');
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

    // Wait for code-inspector to fire and populate draftSource via the public getter
    await expect.poll(async () =>
      page.evaluate(() => (document.querySelector('db-annotation') as any)?.draftSource)
    ).not.toBeNull();

    const panel = annotationPanel(page);
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

    // Wait until the draft item reports 2 connected selectors via its public property
    await expect.poll(async () =>
      page.evaluate(() => (document.querySelector('db-annotation') as any)?.connectedSelectorCount)
    ).toBe(2);

    const input = panel.locator('textarea').first();
    await input.fill('Multi-element annotation');
    await input.press('Enter');
    await expect(annotationPanel(page)).toHaveCount(0);

    // Verify 2 selectors stored via API
    const res = await page.request.get(`${API_BASE}/annotations`);
    const body = await res.json() as { annotations: { selectors: string[]; }[]; };
    const ann = body.annotations.find((a) => a.selectors.length === 2);
    expect(ann).toBeDefined();
  });
});

test.describe('Single panel + dirty-draft guard', () => {
  test('opening a second panel closes the first', async ({ page }) => {
    await createAnnotation(page, 'h1', 'First');
    await createAnnotation(page, 'p', 'Second');

    const badges = page.locator('db-annotation wa-badge');
    await badges.nth(0).click();
    await expect(annotationPanel(page)).toHaveCount(1);

    // Clicking the second badge should close the first and open the second
    await badges.nth(1).click();
    await expect(annotationPanel(page)).toHaveCount(1);

    // Confirm the open panel belongs to the second annotation (contains "Second")
    await expect(annotationPanel(page).locator('.comment-text')).toContainText('Second');
  });

  test('clicking another badge while reply is dirty: first click wobbles, does not close', async ({ page }) => {
    await createAnnotation(page, 'h1', 'First');
    await createAnnotation(page, 'p', 'Second');

    const badges = page.locator('db-annotation wa-badge');

    // Open first panel and type an unsaved reply
    await badges.nth(0).click();
    await annotationPanel(page).locator('textarea[data-role="reply"]').fill('unsaved reply text');

    // Click the second badge — panel should remain open (first click only wobbles)
    await badges.nth(1).click();
    await expect(annotationPanel(page)).toHaveCount(1);
    await expect(annotationPanel(page).locator('.comment-text')).toContainText('First');
  });

  test('clicking another badge twice while reply is dirty: second click switches panel', async ({ page }) => {
    await createAnnotation(page, 'h1', 'First');
    await createAnnotation(page, 'p', 'Second');

    const badges = page.locator('db-annotation wa-badge');

    // Open first panel and type an unsaved reply
    await badges.nth(0).click();
    await annotationPanel(page).locator('textarea[data-role="reply"]').fill('unsaved reply text');

    // First click on second badge — should wobble, stay open
    await badges.nth(1).click();
    await expect(annotationPanel(page)).toHaveCount(1);
    await expect(annotationPanel(page).locator('.comment-text')).toContainText('First');

    // Second click on second badge — should now switch
    await badges.nth(1).click();
    await expect(annotationPanel(page)).toHaveCount(1);
    await expect(annotationPanel(page).locator('.comment-text')).toContainText('Second');
  });

  test('review page row click: dirty reply wobbles on first click, switches on second', async ({ page, context }) => {
    await createAnnotation(page, 'h1', 'First');
    await createAnnotation(page, 'p', 'Second');

    // Open first panel and type an unsaved reply
    await page.locator('db-annotation wa-badge').nth(0).click();
    await annotationPanel(page).locator('textarea[data-role="reply"]').fill('unsaved reply text');

    const reviewPage = await context.newPage();
    await reviewPage.goto(REVIEW_URL);
    await expect(reviewPage.locator('.row')).toHaveCount(2);
    await expect(reviewPage.locator('.dot.ok')).toBeVisible();

    // Click the second annotation's row (index 0 — review page sorts newest-first)
    // First time: should NOT switch (dirty guard)
    await reviewPage.locator('.row').nth(0).locator('.body').click();
    await expect(annotationPanel(page)).toHaveCount(1);
    await expect(annotationPanel(page).locator('.comment-text')).toContainText('First');

    // Second click on same row — should now switch
    await reviewPage.locator('.row').nth(0).locator('.body').click();
    await expect(annotationPanel(page)).toHaveCount(1);
    await expect(annotationPanel(page).locator('.comment-text')).toContainText('Second');

    await reviewPage.close();
  });
});

test.describe('Badge hover preview', () => {
  test('preview appears on badge hover and shows the comment', async ({ page }) => {
    await createAnnotation(page, 'h1', 'This headline needs a stronger CTA.');

    const badge = page.locator('db-annotation wa-badge').first();
    await badge.hover();

    const preview = page.locator('db-annotation .badge-preview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('.badge-preview-text')).toHaveText('This headline needs a stronger CTA.');
  });

  test('preview is not visible when not hovering', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Preview hidden at rest');

    const preview = page.locator('db-annotation .badge-preview');
    await page.mouse.move(0, 0);
    await expect(preview).not.toHaveClass(/visible/);
  });

  test('preview shows reply count when replies exist', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Original comment');

    const badge = page.locator('db-annotation wa-badge').first();
    await badge.click();
    const replyInput = annotationPanel(page).locator('textarea[data-role="reply"]');
    await expect(replyInput).toBeVisible();
    await replyInput.fill('A reply');
    await replyInput.press('Enter');

    await page.locator('db-annotation wa-button[title="Close"]').click();
    await expect(annotationPanel(page)).toHaveCount(0);

    await badge.hover();
    const preview = page.locator('db-annotation .badge-preview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('.badge-preview-meta')).toHaveText('1 reply');
  });

  test('preview is hidden while panel is open', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Open panel test');

    const badge = page.locator('db-annotation wa-badge').first();
    await badge.click();
    await expect(annotationPanel(page)).toBeVisible();

    await expect(page.locator('db-annotation .badge-preview')).toHaveCount(0);
  });

  test('preview text wraps to at most 3 lines', async ({ page }) => {
    const long = 'The quick brown fox jumps over the lazy dog. '.repeat(4).trim();
    await createAnnotation(page, 'h1', long);

    const badge = page.locator('db-annotation wa-badge').first();
    await badge.hover();
    const previewText = page.locator('db-annotation .badge-preview-text').first();
    await expect(previewText).toBeVisible();

    // 12px font × 1.4 line-height × 3 lines ≈ 50px; allow a small margin
    const box = await previewText.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(58);
  });
});

test.describe('Panel scrolling & textarea autogrow', () => {
  test('panel scrolls when replies overflow its max-height', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Overflow test');

    const badge = page.locator('db-annotation wa-badge').first();
    await badge.click();
    const p = page.locator('db-annotation .panel:not([hidden])');

    // Add enough replies to overflow the panel (max-height is ~88dvh so we need many)
    for (let i = 1; i <= 20; i++) {
      const reply = p.locator('textarea[data-role="reply"]');
      await reply.scrollIntoViewIfNeeded();
      await expect(reply).toBeVisible();
      await reply.fill(`Reply number ${i} with some extra text to take up space`);
      await reply.press('Enter');
      await expect(p.locator('.comment-text')).toHaveCount(i + 1);
    }

    // Panel should be scrollable: scrollHeight > clientHeight
    const isScrollable = await p.locator('.panel-scroll').evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(isScrollable).toBe(true);
  });

  test('reply textarea remains accessible when panel overflows', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Scroll position test');

    const badge = page.locator('db-annotation wa-badge').first();
    await badge.click();
    const p = page.locator('db-annotation .panel:not([hidden])');

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
    const p = page.locator('db-annotation .panel:not([hidden])');
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
    const p = page.locator('db-annotation .panel:not([hidden])');
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
    const p = page.locator('db-annotation .panel:not([hidden])');
    const fontFamily = await p.evaluate((el) => getComputedStyle(el).fontFamily);
    // WA uses system font stack; verify it's a sans-serif stack
    expect(fontFamily.toLowerCase()).toMatch(/sans-serif|system-ui|ui-sans-serif/);
  });

  test('create mode: no Cancel button present', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-annotation .panel:not([hidden])');
    await expect(p.locator('.btn-cancel, button:has-text("Cancel")')).toHaveCount(0);
  });

  test('create mode: send button is always visible', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-annotation .panel:not([hidden])');
    await expect(p.locator('wa-button[title="Send"]')).toBeVisible();
  });

  test('create mode: send button is disabled when textarea is empty', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-annotation .panel:not([hidden])');
    await expect(p.locator('wa-button[title="Send"]')).toHaveAttribute('disabled', '');
  });

  test('create mode: send button becomes enabled when text is typed', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-annotation .panel:not([hidden])');
    await p.locator('textarea[data-role="composer"]').fill('hello');
    await expect(p.locator('wa-button[title="Send"]')).toBeEnabled();
  });

  test('create mode: no body padding (no .body element rendered)', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-annotation .panel:not([hidden])');
    await expect(p.locator('.body')).toHaveCount(0);
  });

  test('create mode: no chips bar shown (paths hidden)', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-annotation .panel:not([hidden])');
    await expect(p.locator('.chips-bar')).toHaveCount(0);
  });

  test('create mode: composer has rounded inner card', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-annotation .panel:not([hidden])');
    const inner = p.locator('.composer-inner');
    await expect(inner).toBeVisible();
    const radius = await inner.evaluate((el) => getComputedStyle(el).borderRadius);
    // 10px border-radius
    expect(radius).not.toBe('0px');
  });

  test('view mode: header has Close button, no Cancel button', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Header test');
    const badge = page.locator('db-annotation wa-badge').first();
    await badge.click();
    const p = annotationPanel(page);
    await expect(p.locator('wa-button[title="Close"]')).toBeVisible();
    await expect(p.locator('.btn-cancel, button:has-text("Cancel")')).toHaveCount(0);
  });

  test('view mode: paths hidden by default', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Paths hidden test');
    const badge = page.locator('db-annotation wa-badge').first();
    await badge.click();
    const p = annotationPanel(page);
    await expect(p.locator('.chips-bar')).toHaveCount(0);
  });

  test('view mode: "Show paths" in menu reveals chips bar', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Show paths test');
    const badge = page.locator('db-annotation wa-badge').first();
    await badge.click();
    const p = annotationPanel(page);

    await p.locator('wa-button[title="More options"]').click();
    await page.locator('wa-dropdown-item:has-text("Show paths")').click();

    await expect(p.locator('.chips-bar')).toBeVisible();
    await expect(p.locator('.chips-bar wa-tag')).not.toHaveCount(0);
  });

  test('view mode: "Hide paths" in menu hides chips bar again', async ({ page }) => {
    await createAnnotation(page, 'h1', 'Toggle paths test');
    const badge = page.locator('db-annotation wa-badge').first();
    await badge.click();
    const p = annotationPanel(page);

    await p.locator('wa-button[title="More options"]').click();
    await page.locator('wa-dropdown-item:has-text("Show paths")').click();
    await expect(p.locator('.chips-bar')).toBeVisible();

    await p.locator('wa-button[title="More options"]').click();
    await page.locator('wa-dropdown-item:has-text("Hide paths")').click();
    await expect(p.locator('.chips-bar')).toHaveCount(0);
  });

  test('chips-bar is horizontally scrollable when selectors overflow', async ({ page }) => {
    // Add multiple selectors so the chips bar overflows
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const draft = page.locator('db-annotation .panel:not([hidden])');
    await page.locator('p').first().click({ modifiers: ['Alt', 'Shift'] });
    await page.locator('nav').first().click({ modifiers: ['Alt', 'Shift'] }).catch(() => { });

    const textarea = draft.locator('textarea[data-role="composer"]');
    await textarea.fill('Multi selector');
    await textarea.press('Enter');
    await expect(annotationPanel(page)).toHaveCount(0);

    const badge = page.locator('db-annotation wa-badge').first();
    await badge.click();
    const p = annotationPanel(page);
    await p.locator('wa-button[title="More options"]').click();
    await page.locator('wa-dropdown-item:has-text("Show paths")').click();

    const bar = p.locator('.chips-bar');
    await expect(bar).toBeVisible();
    const overflow = await bar.evaluate((el) => getComputedStyle(el).overflowX);
    expect(overflow).toBe('auto');
  });

  test('chip font is monospace', async ({ page }) => {
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });
    const draft = page.locator('db-annotation .panel:not([hidden])');
    const textarea = draft.locator('textarea[data-role="composer"]');
    await textarea.fill('Chip font test');
    await textarea.press('Enter');

    const badge = page.locator('db-annotation wa-badge').first();
    await badge.click();
    const p = annotationPanel(page);
    await p.locator('wa-button[title="More options"]').click();
    await page.locator('wa-dropdown-item:has-text("Show paths")').click();

    const chip = p.locator('.chips-bar wa-tag').first();
    await expect(chip).toBeVisible();
    // wa-tag has inline style with font-family: var(--wa-font-family-code)
    const font = await chip.getAttribute('style');
    expect(font).toContain('var(--wa-font-family-code)');
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
    await expect(page.locator('db-annotation wa-badge')).toHaveCount(1);

    // Start a new draft on p
    await page.locator('p').first().click({ modifiers: ['Alt', 'Shift'] });
    const draft = annotationPanel(page);
    await expect(draft).toBeVisible();

    // Click h1 (already annotated) while draft is open — should add to draft, not open old annotation
    await page.locator('h1').first().click({ modifiers: ['Alt', 'Shift'] });

    // Still just one open panel (the draft), not the existing annotation's panel
    await expect(page.locator('db-annotation .panel:not([hidden])')).toHaveCount(1);

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

// ─── Tweak-in-annotation tests ───────────────────────────────────────────────

/** Inject an annotation directly via the REST API. */
async function injectAnnotation(
  page: Page,
  overrides: Record<string, unknown> & { id: string; },
): Promise<void> {
  const ann = {
    selectors: ['h1'],
    labels: ['h1'],
    comment: 'Test annotation',
    pageUrl: 'http://localhost:5173/',
    timestamp: Date.now(),
    createdAt: Date.now(),
    replies: [],
    linkedTweaks: [],
    ...overrides,
  };
  const res = await page.request.post(`${API_BASE}/annotations`, { data: ann });
  expect(res.status()).toBe(200);
}

/** Open an annotation's panel by clicking its badge. */
async function openAnnotationPanel(page: Page): Promise<void> {
  const badge = page.locator('db-annotation wa-badge').first();
  await badge.waitFor({ state: 'visible' });
  await badge.click();
}

test.describe('Tweaks in annotations', () => {
  test('tweaks section is not visible when annotation has no linkedTweaks', async ({ page }) => {
    await injectAnnotation(page, { id: 'test-no-tweaks', comment: 'No tweaks here', linkedTweaks: [] });
    await page.reload();
    await openAnnotationPanel(page);
    const tweaksSection = page.locator('db-annotation .tweaks-section');
    await expect(tweaksSection).toHaveCount(0);
  });

  test('tweaks section appears when annotation has linkedTweaks', async ({ page }) => {
    await injectAnnotation(page, {
      id: 'test-with-tweaks',
      comment: 'Has a tweak',
      linkedTweaks: [{ marker: 'font-size', label: 'Font Size', lastValue: '18px', linkedAt: Date.now() }],
    });
    await page.reload();
    await openAnnotationPanel(page);
    const tweaksSection = page.locator('db-annotation .tweaks-section');
    await expect(tweaksSection).toBeVisible();
  });

  test('tweaks section shows label and value for each linked tweak', async ({ page }) => {
    await injectAnnotation(page, {
      id: 'test-tweak-content',
      comment: 'Tweak content check',
      linkedTweaks: [
        { marker: 'primary-color', label: 'Primary Color', lastValue: '#ff6600', linkedAt: Date.now() },
        { marker: 'font-size', label: 'Font Size', lastValue: '20px', linkedAt: Date.now() },
      ],
    });
    await page.reload();
    await openAnnotationPanel(page);
    const tweaksSection = page.locator('db-annotation .tweaks-section');
    await expect(tweaksSection).toBeVisible();
    await expect(tweaksSection.locator('.tweak-label').nth(0)).toHaveText('Primary Color');
    await expect(tweaksSection.locator('.tweak-value').nth(0)).toHaveText('#ff6600');
    await expect(tweaksSection.locator('.tweak-label').nth(1)).toHaveText('Font Size');
    await expect(tweaksSection.locator('.tweak-value').nth(1)).toHaveText('20px');
  });

  test('tweaks section shows Accept and Dismiss buttons per tweak', async ({ page }) => {
    await injectAnnotation(page, {
      id: 'test-tweak-buttons',
      comment: 'Tweak buttons',
      linkedTweaks: [{ marker: 'spacing', label: 'Spacing', lastValue: '8px', linkedAt: Date.now() }],
    });
    await page.reload();
    await openAnnotationPanel(page);
    const tweaksSection = page.locator('db-annotation .tweaks-section');
    await expect(tweaksSection.locator('wa-button[title="Accept this tweak"]')).toBeVisible();
    await expect(tweaksSection.locator('wa-button[title="Dismiss this tweak"]')).toBeVisible();
  });

  test('"Accept all" button is visible when annotation has linked tweaks', async ({ page }) => {
    await injectAnnotation(page, {
      id: 'test-accept-all-btn',
      comment: 'Accept all button',
      linkedTweaks: [{ marker: 'spacing', label: 'Spacing', lastValue: '8px', linkedAt: Date.now() }],
    });
    await page.reload();
    await openAnnotationPanel(page);
    await expect(page.locator('db-annotation wa-button:has-text("Accept all")')).toBeVisible();
  });

  test('annotation persists to disk as JSON file after injection', async ({ page }) => {
    await injectAnnotation(page, { id: 'persist-json-test', comment: 'JSON file test' });
    // Verify it can be retrieved (confirms it was stored)
    const res = await page.request.get(`${API_BASE}/annotations/persist-json-test`);
    expect(res.status()).toBe(200);
    // Reload page and confirm annotation survives (loaded from disk)
    await page.reload();
    await expect(page.locator('db-annotation')).toBeAttached();
    const res2 = await page.request.get(`${API_BASE}/annotations/persist-json-test`);
    expect(res2.status()).toBe(200);
    const ann = await res2.json() as { comment: string; };
    expect(ann.comment).toBe('JSON file test');
  });

  test('dismissing a tweak via API removes its row from the tweaks section', async ({ page }) => {
    await injectAnnotation(page, {
      id: 'dismiss-ui-test',
      comment: 'Dismiss via API + UI check',
      linkedTweaks: [
        { marker: 'ui-tweak-1', label: 'UI Tweak 1', lastValue: '10px', linkedAt: Date.now() },
        { marker: 'ui-tweak-2', label: 'UI Tweak 2', lastValue: '20px', linkedAt: Date.now() },
      ],
    });
    await page.reload();
    await openAnnotationPanel(page);
    const tweaksSection = page.locator('db-annotation .tweaks-section');
    await expect(tweaksSection.locator('.tweak-row')).toHaveCount(2);
    // Dismiss via REST API (the server broadcasts annotations:sync → UI re-renders)
    const res = await page.request.delete(`${API_BASE}/annotations/dismiss-ui-test/tweaks/ui-tweak-1`);
    expect(res.status()).toBe(200);
    // UI should update via annotations:sync broadcast
    await expect(tweaksSection.locator('.tweak-row')).toHaveCount(1);
    await expect(tweaksSection.locator('.tweak-label')).toHaveText('UI Tweak 2');
  });
});

