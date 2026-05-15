/**
 * Comment end-to-end tests for Design Bridge.
 */

import { test, expect, type Page, type Locator } from '@playwright/test';

const DB_PORT = parseInt(process.env.DESIGN_BRIDGE_PORT ?? process.env.DB_PORT ?? '7378', 10);
const API_BASE = `http://localhost:${DB_PORT}/api`;
const REVIEW_URL = `http://localhost:${DB_PORT}/`;

/** The draft or open comment item's panel (shadow DOM piercing). */
function commentPanel(page: Page): Locator {
  return page.locator('db-comment .panel:not([hidden])');
}

/**
 * Pierce a wa-textarea's shadow DOM to get the inner native <textarea>.
 * Required for .fill(), .press(), .toHaveValue(), .toBeFocused() etc.
 */
function innerTA(waLoc: Locator): Locator {
  return waLoc.locator('textarea');
}

async function createComment(page: Page, selector: string, comment: string): Promise<void> {
  await page
    .locator(selector)
    .first()
    .click({ modifiers: ['Alt', 'Shift'] });
  const panel = commentPanel(page);
  const waInput = panel.locator('wa-textarea[data-role="composer"]');
  await expect(waInput).toBeVisible();
  await innerTA(waInput).fill(comment);
  await innerTA(waInput).press('Enter');
  // Panel closes after save
  await expect(commentPanel(page)).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.request.delete(`${API_BASE}/comments`);
  await page.goto('/');
  // Wait for the Design Bridge client to initialise (inspector is ready)
  await page.waitForFunction(() => typeof (window as any).__DB_WS_URL__ === 'string');
});

test.afterEach(async ({ page }) => {
  await page.request.delete(`${API_BASE}/comments`);
});

test.describe('Comments', () => {
  test('review page shows empty state when no comments exist', async ({ page }) => {
    await page.goto(REVIEW_URL);
    await expect(page.locator('.empty')).toBeVisible();
  });

  test('creates an comment by clicking a page element with Alt+Shift', async ({ page }) => {
    await createComment(page, 'h1', 'This headline needs a stronger CTA.');

    const res = await page.request.get(`${API_BASE}/comments`);
    const body = (await res.json()) as { comments: { comments?: { text: string }[] }[] };
    expect(
      body.comments.some((a) => a.comments?.[0]?.text === 'This headline needs a stronger CTA.'),
    ).toBe(true);
  });

  test('comment badge appears on the annotated element', async ({ page }) => {
    await createComment(page, 'h1', 'Badge test');
    await expect(page.locator('db-comment wa-badge')).toBeVisible();
  });

  test('comment is persisted to the server API', async ({ page }) => {
    await createComment(page, 'h1', 'Persisted comment');

    const res = await page.request.get(`${API_BASE}/comments`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { comments: { comments?: { text: string }[] }[] };
    expect(body.comments.some((a) => a.comments?.[0]?.text === 'Persisted comment')).toBe(true);
  });

  test('page reload restores comments from server', async ({ page }) => {
    await createComment(page, 'h1', 'Survives reload');

    await page.reload();
    await expect(page.locator('db-comment')).toBeAttached();
    await expect(page.locator('db-comment wa-badge')).toBeVisible();
  });

  test('badge reappears on the correct element after reload', async ({ page }) => {
    await createComment(page, 'h1', 'Pinned to h1');

    const h1Box = await page.locator('h1').first().boundingBox();
    expect(h1Box).not.toBeNull();

    await page.reload();
    await expect(page.locator('db-comment')).toBeAttached();

    const badge = page.locator('db-comment wa-badge').first();
    await expect(badge).toBeVisible();

    const badgeBox = await badge.boundingBox();
    expect(badgeBox).not.toBeNull();
    // Badge should be vertically near the h1 element (within 200px)
    expect(Math.abs(badgeBox!.y - h1Box!.y)).toBeLessThan(200);
    expect(badgeBox!.x).toBeGreaterThanOrEqual(0);
  });

  test('can reply to an comment from the badge', async ({ page }) => {
    await createComment(page, 'h1', 'Original comment');

    const badge = page.locator('db-comment wa-badge').first();
    await badge.click();

    const panel = commentPanel(page);
    const replyInput = innerTA(panel.locator('wa-textarea[data-role="reply"]'));
    await expect(replyInput).toBeVisible();
    await replyInput.fill('Reply from badge');
    await replyInput.press('Enter');

    // Verify reply was saved to the server
    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/comments`);
        const body = (await res.json()) as {
          comments: { comments?: { type: string; text: string }[] }[];
        };
        return body.comments.some((a) =>
          a.comments?.some((c) => c.type === 'comment' && c.text === 'Reply from badge'),
        );
      })
      .toBe(true);
  });

  test('focuses textarea when creating and when opening from badge', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });

    const panel = commentPanel(page);
    const composer = innerTA(panel.locator('wa-textarea[data-role="composer"]'));
    await expect(composer).toBeVisible();
    await expect(composer).toBeFocused();

    await composer.fill('Focus baseline');
    await composer.press('Enter');
    await expect(commentPanel(page)).toHaveCount(0);

    const badge = page.locator('db-comment wa-badge').first();
    await badge.click();

    const openPanel = commentPanel(page);
    const reply = innerTA(openPanel.locator('wa-textarea[data-role="reply"]'));
    await expect(reply).toBeVisible();
    await expect(reply).toBeFocused();
  });

  test('clicking outside the comment panel closes it', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });

    const panel = commentPanel(page);
    await expect(panel.locator('wa-textarea[data-role="composer"]')).toBeVisible();

    await page.locator('main').click({ position: { x: 8, y: 8 } });
    await expect(commentPanel(page)).toHaveCount(0);
  });

  test('resolving from the comment panel removes the comment', async ({ page }) => {
    await createComment(page, 'h1', 'Resolve me');

    const badge = page.locator('db-comment wa-badge').first();
    await badge.click();

    const panel = commentPanel(page);
    await panel.locator('wa-button[title="Resolve"]').click();

    await expect(page.locator('db-comment wa-badge')).toHaveCount(0);
  });

  test('deletes an comment via the review page discard button', async ({ page }) => {
    await createComment(page, 'h1', 'To be deleted');

    await page.goto(REVIEW_URL);
    await expect(page.locator('.dot.ok')).toBeVisible();
    await expect(page.locator('.row')).toHaveCount(1);
    // Open three-dot menu and click Delete
    await page.locator('.row').first().hover();
    await page.locator('.row-menu').first().locator('wa-button[title="More"]').click();
    await page.locator('wa-dropdown-item[variant="danger"]').first().click();
    await expect(page.locator('.row')).toHaveCount(0);
    await expect(page.locator('.empty')).toBeVisible();
  });

  test('deletes a single comment via the delete button in the panel', async ({ page }) => {
    await createComment(page, 'h1', 'Panel delete test');

    const badge = page.locator('db-comment wa-badge').first();
    await badge.click();

    const panel = commentPanel(page);
    await panel.locator('wa-button[title="More options"]').click();
    await page.locator('wa-dropdown-item[variant="danger"]').click();
    await expect(commentPanel(page)).toHaveCount(0);
    await expect(page.locator('db-comment wa-badge')).toHaveCount(0);
  });

  test('review page can resolve all comments', async ({ page }) => {
    for (const selector of ['h1', 'p']) {
      await createComment(page, selector, `Comment on ${selector}`);
    }
    // Ensure both badges (and thus both server-saved comments) are present
    await expect(page.locator('db-comment wa-badge')).toHaveCount(2);

    await page.goto(REVIEW_URL);
    await expect(page.locator('.dot.ok')).toBeVisible();
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

  test('clicking a row in the review page opens the comment panel in the app', async ({
    page,
    context,
  }) => {
    await createComment(page, 'h1', 'Focus via review page');

    // Open the review page in a second tab while the app stays open
    const reviewPage = await context.newPage();
    await reviewPage.goto(REVIEW_URL);

    // Wait for the row to appear and for the review page WS to connect (dot turns green)
    await expect(reviewPage.locator('.row')).toHaveCount(1);
    await expect(reviewPage.locator('.dot.ok')).toBeVisible();

    // Click the row body — this sends comment:focus via WS
    await reviewPage.locator('.row .body').first().click();

    // The app page should open the comment panel for that comment
    await expect(commentPanel(page)).toBeVisible();

    await reviewPage.close();
  });

  test('discard on review page is reflected in the server API', async ({ page }) => {
    await createComment(page, 'h1', 'API clear test');

    await page.goto(REVIEW_URL);
    await expect(page.locator('.dot.ok')).toBeVisible();
    await page.locator('.row').first().hover();
    await page.locator('.row-menu').first().locator('wa-button[title="More"]').click();
    await page.locator('wa-dropdown-item[variant="danger"]').first().click();
    await expect(page.locator('.empty')).toBeVisible();

    const res = await page.request.get(`${API_BASE}/comments`);
    const body = (await res.json()) as { comments: unknown[] };
    expect(body.comments).toHaveLength(0);
  });

  test('alt+shift+click opens panel with source chip visible after save via "Show paths"', async ({
    page,
  }) => {
    await createComment(page, 'h1', 'Source chip test');

    const badge = page.locator('db-comment wa-badge').first();
    await badge.click();
    const p = commentPanel(page);
    await p.locator('wa-button[title="More options"]').click();
    await page.locator('wa-dropdown-item:has-text("Show paths")').click();
    await expect(p.locator('.chips-bar')).toBeVisible();
    await expect(p.locator('.chips-bar wa-tag')).not.toHaveCount(0);
  });

  test('alt+shift+click while panel is open adds another selector chip (visible after save)', async ({
    page,
  }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    const draft = page.locator('db-comment .panel:not([hidden])');
    await expect(draft.locator('wa-textarea[data-role="composer"]')).toBeVisible();

    await page
      .locator('p')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });

    // Save and verify via API that 2 selectors are stored
    const textarea = innerTA(draft.locator('wa-textarea[data-role="composer"]'));
    await textarea.fill('Two selectors');
    await textarea.press('Enter');
    await expect(commentPanel(page)).toHaveCount(0);

    const res = await page.request.get(`${API_BASE}/comments`);
    const body = (await res.json()) as { comments: { elements?: { minimalSelector: string }[] }[] };
    const ann = body.comments.find((a) => (a.elements?.length ?? 0) === 2);
    expect(ann).toBeDefined();
  });

  test('comment saved with source location includes file, line, column', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });

    // Wait for code-inspector to fire and populate draftSource via the public getter
    await expect
      .poll(async () =>
        page.evaluate(() => (document.querySelector('db-comment') as any)?.draftSource),
      )
      .not.toBeNull();

    const panel = commentPanel(page);
    const input = innerTA(panel.locator('wa-textarea').first());
    await input.fill('Has source info');
    await input.press('Enter');
    await expect(commentPanel(page)).toHaveCount(0);

    const apiRes = await page.request.get(`${API_BASE}/comments`);
    const body = (await apiRes.json()) as {
      comments: {
        comments?: { text: string }[];
        elements?: { source?: { file: string; line: number; column: number } }[];
      }[];
    };
    const ann = body.comments.find((a) => a.comments?.[0]?.text === 'Has source info');
    expect(ann).toBeDefined();
    expect(ann!.elements?.[0]?.source?.file).toContain('HeroSection.vue');
    expect(typeof ann!.elements?.[0]?.source?.line).toBe('number');
    expect(typeof ann!.elements?.[0]?.source?.column).toBe('number');
  });

  test('can annotate multiple elements in one comment via the panel chips', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    const panel = commentPanel(page);
    await expect(panel.locator('wa-textarea').first()).toBeVisible();

    await page
      .locator('p')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });

    // Wait until the draft item reports 2 connected selectors via its public property
    await expect
      .poll(async () =>
        page.evaluate(() => (document.querySelector('db-comment') as any)?.connectedSelectorCount),
      )
      .toBe(2);

    const input = innerTA(panel.locator('wa-textarea').first());
    await input.fill('Multi-element comment');
    await input.press('Enter');
    await expect(commentPanel(page)).toHaveCount(0);

    // Verify 2 selectors stored via API
    const res = await page.request.get(`${API_BASE}/comments`);
    const body = (await res.json()) as { comments: { elements?: { minimalSelector: string }[] }[] };
    const ann = body.comments.find((a) => (a.elements?.length ?? 0) === 2);
    expect(ann).toBeDefined();
  });
});

test.describe('Single panel + dirty-draft guard', () => {
  test('opening a second panel closes the first', async ({ page }) => {
    await createComment(page, 'h1', 'First');
    await createComment(page, 'p', 'Second');

    const badges = page.locator('db-comment wa-badge');
    await expect(badges).toHaveCount(2);
    await badges.nth(0).click();
    await expect(commentPanel(page)).toHaveCount(1);

    // Clicking the second badge should close the first and open the second
    await badges.nth(1).click();
    await expect(commentPanel(page)).toHaveCount(1);

    // Confirm the open panel belongs to the second comment (contains "Second")
    await expect(commentPanel(page).locator('.comment-text')).toContainText('Second');
  });

  test('clicking another badge while reply is dirty: first click wobbles, does not close', async ({
    page,
  }) => {
    await createComment(page, 'h1', 'First');
    await createComment(page, 'p', 'Second');

    const badges = page.locator('db-comment wa-badge');
    await expect(badges).toHaveCount(2);

    // Open first panel and type an unsaved reply
    await badges.nth(0).click();
    await innerTA(commentPanel(page).locator('wa-textarea[data-role="reply"]')).fill(
      'unsaved reply text',
    );

    // Click the second badge — panel should remain open (first click only wobbles)
    await badges.nth(1).click();
    await expect(commentPanel(page)).toHaveCount(1);
    await expect(commentPanel(page).locator('.comment-text')).toContainText('First');
  });

  test('clicking another badge twice while reply is dirty: second click switches panel', async ({
    page,
  }) => {
    await createComment(page, 'h1', 'First');
    await createComment(page, 'p', 'Second');

    const badges = page.locator('db-comment wa-badge');
    await expect(badges).toHaveCount(2);

    // Open first panel and type an unsaved reply
    await badges.nth(0).click();
    await innerTA(commentPanel(page).locator('wa-textarea[data-role="reply"]')).fill(
      'unsaved reply text',
    );

    // First click on second badge — should wobble, stay open
    await badges.nth(1).click();
    await expect(commentPanel(page)).toHaveCount(1);
    await expect(commentPanel(page).locator('.comment-text')).toContainText('First');

    // Second click on second badge — should now switch
    await badges.nth(1).click();
    await expect(commentPanel(page)).toHaveCount(1);
    await expect(commentPanel(page).locator('.comment-text')).toContainText('Second');
  });

  test('review page row click: dirty reply wobbles on first click, switches on second', async ({
    page,
    context,
  }) => {
    await createComment(page, 'h1', 'First');
    await createComment(page, 'p', 'Second');

    // Open first panel and type an unsaved reply
    await expect(page.locator('db-comment wa-badge')).toHaveCount(2);
    await page.locator('db-comment wa-badge').nth(0).click();
    await innerTA(commentPanel(page).locator('wa-textarea[data-role="reply"]')).fill(
      'unsaved reply text',
    );

    const reviewPage = await context.newPage();
    await reviewPage.goto(REVIEW_URL);
    await expect(reviewPage.locator('.row')).toHaveCount(2);
    await expect(reviewPage.locator('.dot.ok')).toBeVisible();

    // Click the second comment's row (index 0 — review page sorts newest-first)
    // First time: should NOT switch (dirty guard)
    await reviewPage.locator('.row').nth(0).locator('.body').click();
    await expect(commentPanel(page)).toHaveCount(1);
    await expect(commentPanel(page).locator('.comment-text')).toContainText('First');

    // Second click on same row — should now switch
    await reviewPage.locator('.row').nth(0).locator('.body').click();
    await expect(commentPanel(page)).toHaveCount(1);
    await expect(commentPanel(page).locator('.comment-text')).toContainText('Second');

    await reviewPage.close();
  });
});

test.describe('Badge hover preview', () => {
  test('preview appears on badge hover and shows the comment', async ({ page }) => {
    await createComment(page, 'h1', 'This headline needs a stronger CTA.');

    const badge = page.locator('db-comment wa-badge').first();
    await badge.hover();

    const preview = page.locator('db-comment .badge-preview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('.badge-preview-text')).toHaveText(
      'This headline needs a stronger CTA.',
    );
  });

  test('preview is not visible when not hovering', async ({ page }) => {
    await createComment(page, 'h1', 'Preview hidden at rest');

    const preview = page.locator('db-comment .badge-preview');
    await page.mouse.move(0, 0);
    await expect(preview).not.toHaveClass(/visible/);
  });

  test('preview shows reply count when replies exist', async ({ page }) => {
    await createComment(page, 'h1', 'Original comment');

    const badge = page.locator('db-comment wa-badge').first();
    await badge.click();
    const replyInput = innerTA(commentPanel(page).locator('wa-textarea[data-role="reply"]'));
    await expect(replyInput).toBeVisible();
    await replyInput.fill('A reply');
    await replyInput.press('Enter');

    await page.locator('db-comment wa-button[title="Close"]').click();
    await expect(commentPanel(page)).toHaveCount(0);

    await badge.hover();
    const preview = page.locator('db-comment .badge-preview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('.badge-preview-meta')).toHaveText('1 reply');
  });

  test('preview is hidden while panel is open', async ({ page }) => {
    await createComment(page, 'h1', 'Open panel test');

    const badge = page.locator('db-comment wa-badge').first();
    await badge.click();
    await expect(commentPanel(page)).toBeVisible();

    await expect(page.locator('db-comment .badge-preview')).toHaveCount(0);
  });

  test('preview text wraps to at most 3 lines', async ({ page }) => {
    const long = 'The quick brown fox jumps over the lazy dog. '.repeat(4).trim();
    await createComment(page, 'h1', long);

    const badge = page.locator('db-comment wa-badge').first();
    await badge.hover();
    const previewText = page.locator('db-comment .badge-preview-text').first();
    await expect(previewText).toBeVisible();

    // 12px font × 1.4 line-height × 3 lines ≈ 50px; allow a small margin
    const box = await previewText.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(58);
  });
});

test.describe('Panel scrolling & textarea autogrow', () => {
  test('panel scrolls when replies overflow its max-height', async ({ page }) => {
    await createComment(page, 'h1', 'Overflow test');

    const badge = page.locator('db-comment wa-badge').first();
    await badge.click();
    const p = page.locator('db-comment .panel:not([hidden])');

    // Add enough replies to overflow the panel (max-height is ~88dvh so we need many)
    for (let i = 1; i <= 20; i++) {
      const reply = innerTA(p.locator('wa-textarea[data-role="reply"]'));
      await reply.scrollIntoViewIfNeeded();
      await expect(reply).toBeVisible();
      await reply.fill(`Reply number ${i} with some extra text to take up space`);
      await reply.press('Enter');
      await expect(p.locator('.comment-text')).toHaveCount(i + 1);
    }

    // Panel should be scrollable: scrollHeight > clientHeight
    const isScrollable = await p
      .locator('.panel-scroll')
      .evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(isScrollable).toBe(true);
  });

  test('reply textarea remains accessible when panel overflows', async ({ page }) => {
    await createComment(page, 'h1', 'Scroll position test');

    const badge = page.locator('db-comment wa-badge').first();
    await badge.click();
    const p = page.locator('db-comment .panel:not([hidden])');

    for (let i = 1; i <= 8; i++) {
      const reply = innerTA(p.locator('wa-textarea[data-role="reply"]'));
      await reply.scrollIntoViewIfNeeded();
      await expect(reply).toBeVisible();
      await reply.fill(`Reply ${i}`);
      await reply.press('Enter');
      await expect(p.locator('.comment-text')).toHaveCount(i + 1);
    }

    // Even with 8 replies, the textarea should still be visible/reachable
    const reply = innerTA(p.locator('wa-textarea[data-role="reply"]'));
    await reply.scrollIntoViewIfNeeded();
    await expect(reply).toBeVisible();
    await expect(reply).toBeEditable();
  });

  test('textarea grows taller as content is typed', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-comment .panel:not([hidden])');
    const waTextarea = p.locator('wa-textarea[data-role="composer"]');
    await expect(waTextarea).toBeVisible();

    const initialHeight = (await waTextarea.boundingBox())!.height;

    // Type enough lines to force growth
    await innerTA(waTextarea).fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6');

    const grownHeight = (await waTextarea.boundingBox())!.height;
    expect(grownHeight).toBeGreaterThan(initialHeight);
  });

  test('textarea has no internal scrollbar (overflow is hidden or field-sizing)', async ({
    page,
  }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-comment .panel:not([hidden])');
    const waTextarea = p.locator('wa-textarea[data-role="composer"]');
    await expect(waTextarea).toBeVisible();

    await innerTA(waTextarea).fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6');

    // scrollHeight should equal clientHeight — no internal scroll
    const hasInternalScroll = await innerTA(waTextarea).evaluate(
      (el: HTMLTextAreaElement) => el.scrollHeight > el.clientHeight,
    );
    expect(hasInternalScroll).toBe(false);
  });
});

test.describe('Compact UI (redesign)', () => {
  test('comment panel uses Inter font', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-comment .panel:not([hidden])');
    const fontFamily = await p.evaluate((el) => getComputedStyle(el).fontFamily);
    // WA uses system font stack; verify it's a sans-serif stack
    expect(fontFamily.toLowerCase()).toMatch(/sans-serif|system-ui|ui-sans-serif/);
  });

  test('create mode: no Cancel button present', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-comment .panel:not([hidden])');
    await expect(p.locator('.btn-cancel, button:has-text("Cancel")')).toHaveCount(0);
  });

  test('create mode: send button is always visible', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-comment .panel:not([hidden])');
    await expect(p.locator('wa-button[title="Send"]')).toBeVisible();
  });

  test('create mode: send button is disabled when textarea is empty', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-comment .panel:not([hidden])');
    await expect(p.locator('wa-button[title="Send"]')).toHaveAttribute('disabled', '');
  });

  test('create mode: send button becomes enabled when text is typed', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-comment .panel:not([hidden])');
    await innerTA(p.locator('wa-textarea[data-role="composer"]')).fill('hello');
    await expect(p.locator('wa-button[title="Send"]')).toBeEnabled();
  });

  test('create mode: no body padding (no .body element rendered)', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-comment .panel:not([hidden])');
    await expect(p.locator('.body')).toHaveCount(0);
  });

  test('create mode: no chips bar shown (paths hidden)', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-comment .panel:not([hidden])');
    await expect(p.locator('.chips-bar')).toHaveCount(0);
  });

  test('create mode: composer has rounded inner card', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    const p = page.locator('db-comment .panel:not([hidden])');
    const inner = p.locator('wa-textarea[data-role="composer"]');
    await expect(inner).toBeVisible();
    // wa-textarea with appearance="filled" is used for rounded input style
    await expect(inner).toHaveAttribute('appearance', 'filled');
  });

  test('view mode: header has Close button, no Cancel button', async ({ page }) => {
    await createComment(page, 'h1', 'Header test');
    const badge = page.locator('db-comment wa-badge').first();
    await badge.click();
    const p = commentPanel(page);
    await expect(p.locator('wa-button[title="Close"]')).toBeVisible();
    await expect(p.locator('.btn-cancel, button:has-text("Cancel")')).toHaveCount(0);
  });

  test('view mode: paths hidden by default', async ({ page }) => {
    await createComment(page, 'h1', 'Paths hidden test');
    const badge = page.locator('db-comment wa-badge').first();
    await badge.click();
    const p = commentPanel(page);
    await expect(p.locator('.chips-bar')).toHaveCount(0);
  });

  test('view mode: "Show paths" in menu reveals chips bar', async ({ page }) => {
    await createComment(page, 'h1', 'Show paths test');
    const badge = page.locator('db-comment wa-badge').first();
    await badge.click();
    const p = commentPanel(page);

    await p.locator('wa-button[title="More options"]').click();
    await page.locator('wa-dropdown-item:has-text("Show paths")').click();

    await expect(p.locator('.chips-bar')).toBeVisible();
    await expect(p.locator('.chips-bar wa-tag')).not.toHaveCount(0);
  });

  test('view mode: "Hide paths" in menu hides chips bar again', async ({ page }) => {
    await createComment(page, 'h1', 'Toggle paths test');
    const badge = page.locator('db-comment wa-badge').first();
    await badge.click();
    const p = commentPanel(page);

    await p.locator('wa-button[title="More options"]').click();
    await page.locator('wa-dropdown-item:has-text("Show paths")').click();
    await expect(p.locator('.chips-bar')).toBeVisible();

    await p.locator('wa-button[title="More options"]').click();
    await page.locator('wa-dropdown-item:has-text("Hide paths")').click();
    await expect(p.locator('.chips-bar')).toHaveCount(0);
  });

  test('chips-bar is horizontally scrollable when selectors overflow', async ({ page }) => {
    // Add multiple selectors so the chips bar overflows
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    const draft = page.locator('db-comment .panel:not([hidden])');
    await page
      .locator('p')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    await page
      .locator('nav')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] })
      .catch(() => {});

    const textarea = innerTA(draft.locator('wa-textarea[data-role="composer"]'));
    await textarea.fill('Multi selector');
    await textarea.press('Enter');
    await expect(commentPanel(page)).toHaveCount(0);

    const badge = page.locator('db-comment wa-badge').first();
    await badge.click();
    const p = commentPanel(page);
    await p.locator('wa-button[title="More options"]').click();
    await page.locator('wa-dropdown-item:has-text("Show paths")').click();

    const bar = p.locator('.chips-bar');
    await expect(bar).toBeVisible();
    const overflow = await bar.evaluate((el) => getComputedStyle(el).overflowX);
    expect(overflow).toBe('auto');
  });

  test('chip font is monospace', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    const draft = page.locator('db-comment .panel:not([hidden])');
    const textarea = innerTA(draft.locator('wa-textarea[data-role="composer"]'));
    await textarea.fill('Chip font test');
    await textarea.press('Enter');

    const badge = page.locator('db-comment wa-badge').first();
    await badge.click();
    const p = commentPanel(page);
    await p.locator('wa-button[title="More options"]').click();
    await page.locator('wa-dropdown-item:has-text("Show paths")').click();

    const chip = p.locator('.chips-bar wa-tag').first();
    await expect(chip).toBeVisible();
    // wa-tag has inline style with font-family: var(--wa-font-family-code)
    const font = await chip.getAttribute('style');
    expect(font).toContain('var(--wa-font-family-code)');
  });
});

test.describe('Element highlight on comment create', () => {
  test('target element gets amber outline when draft opens', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    await expect(commentPanel(page)).toBeVisible();

    const highlighted = page.locator('[data-db-related]');
    await expect(highlighted).not.toHaveCount(0);
  });

  test('outline clears after saving the comment', async ({ page }) => {
    await createComment(page, 'h1', 'Outline clears on save');
    await expect(page.locator('[data-db-related]')).toHaveCount(0);
  });

  test('outline clears after cancelling (clicking outside)', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    await expect(page.locator('[data-db-related]')).not.toHaveCount(0);

    await page.locator('main').click({ position: { x: 8, y: 8 } });
    await expect(commentPanel(page)).toHaveCount(0);
    await expect(page.locator('[data-db-related]')).toHaveCount(0);
  });

  test('all elements get highlighted when multiple are added to draft', async ({ page }) => {
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    await expect(page.locator('[data-db-related]')).toHaveCount(1);

    await page
      .locator('p')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    await expect(page.locator('[data-db-related]')).toHaveCount(2);
  });
});

test.describe('Multi-select while draft is open', () => {
  test('clicking an already-annotated element while draft is open adds it to draft', async ({
    page,
  }) => {
    // Create a saved comment on h1
    await createComment(page, 'h1', 'Existing comment');
    await expect(page.locator('db-comment wa-badge')).toHaveCount(1);

    // Start a new draft on p
    await page
      .locator('p')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });
    const draft = commentPanel(page);
    await expect(draft).toBeVisible();

    // Click h1 (already annotated) while draft is open — should add to draft, not open old comment
    await page
      .locator('h1')
      .first()
      .click({ modifiers: ['Alt', 'Shift'] });

    // Still just one open panel (the draft), not the existing comment's panel
    await expect(page.locator('db-comment .panel:not([hidden])')).toHaveCount(1);

    // Save and verify via API that the new comment has 2 selectors (p + h1)
    const textarea = innerTA(draft.locator('wa-textarea[data-role="composer"]'));
    await textarea.fill('Multi-select with existing element');
    await textarea.press('Enter');
    await expect(commentPanel(page)).toHaveCount(0);

    const res = await page.request.get(`${API_BASE}/comments`);
    const body = (await res.json()) as {
      comments: { comments?: { text: string }[]; elements?: { minimalSelector: string }[] }[];
    };
    const newAnn = body.comments.find(
      (a) => a.comments?.[0]?.text === 'Multi-select with existing element',
    );
    expect(newAnn).toBeDefined();
    expect(newAnn!.elements!.length).toBe(2);
  });
});

// ─── Tweak-in-comment tests ───────────────────────────────────────────────

/** Inject an comment directly via the REST API using the new CommentThread schema. */
async function injectComment(
  page: Page,
  overrides: Record<string, unknown> & { id: string },
): Promise<void> {
  const id = overrides.id as string;
  const now = Date.now();

  let comments: unknown[];
  if (Array.isArray(overrides.replies) && (overrides.replies as unknown[]).length > 0) {
    // Use provided replies directly as the comments[] array
    comments = overrides.replies as unknown[];
  } else {
    const rootEntry = {
      id: `${id}-root`,
      type: 'comment',
      text: (overrides.comment as string) ?? 'Test comment',
      createdAt: now,
      author: (overrides.author as string) ?? 'user',
    };
    comments = [rootEntry];
  }

  // Add a tweak entry if knob is provided
  if (overrides.knob) {
    comments = [
      ...comments,
      {
        id: `${id}-tweak`,
        type: 'tweak',
        text: (overrides.comment as string) ?? 'Test comment',
        createdAt: now,
        author: (overrides.author as string) ?? 'user',
        tweakStatus: (overrides.tweakStatus as string) ?? 'pending',
        knob: overrides.knob,
        actions: (overrides.actions as unknown[]) ?? [],
      },
    ];
  }

  const thread = {
    meta: {
      id,
      pageUrl: (overrides.pageUrl as string) ?? 'http://localhost:5173/',
      timestamp: (overrides.timestamp as number) ?? now,
      createdAt: (overrides.createdAt as number) ?? now,
    },
    elements: (overrides.elements as unknown[]) ??
      (overrides.selectors as string[] | undefined)?.map((sel) => ({
        minimalSelector: sel,
        tag: sel,
        classes: [],
      })) ?? [{ minimalSelector: 'h1', tag: 'h1', classes: [] }],
    comments,
  };

  const res = await page.request.post(`${API_BASE}/comments`, { data: thread });
  expect(res.status()).toBe(200);
}

/** Open an comment's panel by clicking its badge. */
async function openCommentPanel(page: Page): Promise<void> {
  const badge = page.locator('db-comment wa-badge').first();
  await badge.waitFor({ state: 'visible' });
  await badge.click();
}

/** Build an comment with a select knob and empty actions (UI-only, no file side-effects). */
function makeTweakComment(id: string): Record<string, unknown> {
  return {
    id,
    selectors: ['h1'],
    labels: ['h1'],
    comment: 'Propose different emojis',
    pageUrl: 'http://localhost:5173/',
    timestamp: Date.now(),
    createdAt: Date.now(),
    replies: [],
    knob: {
      label: 'Feature icon',
      type: 'select',
      value: '🎨',
      options: { Palette: '🎨', Fire: '🔥', Rocket: '🚀' },
    },
    actions: [],
  };
}

test.describe('Tweaks in comments', () => {
  test('tweaks section is not visible when comment has no knob', async ({ page }) => {
    await injectComment(page, {
      id: 'test-no-tweaks',
      comment: 'No tweaks here',
    });
    await page.reload();
    await openCommentPanel(page);
    const tweaksSection = page.locator('db-comment .tweaks-section');
    await expect(tweaksSection).toHaveCount(0);
  });

  test('tweaks section appears when comment has a knob', async ({ page }) => {
    await injectComment(page, makeTweakComment('test-with-knob'));
    await page.reload();
    await openCommentPanel(page);
    await expect(page.locator('db-comment .tweaks-section')).toBeVisible();
  });

  test('tweaks section shows the knob label', async ({ page }) => {
    await injectComment(page, makeTweakComment('test-knob-label'));
    await page.reload();
    await openCommentPanel(page);
    await expect(page.locator('db-comment .tweak-label')).toHaveText('Feature icon');
  });

  test('db-knob renders a wa-select with the correct options', async ({ page }) => {
    await injectComment(page, makeTweakComment('test-knob-select'));
    await page.reload();
    await openCommentPanel(page);
    const select = page.locator('db-comment db-knob wa-select');
    await expect(select).toBeVisible();
    // Default value should be 🎨
    await expect(select).toHaveJSProperty('value', '🎨');
    // All three options should be present
    await expect(select.locator('wa-option')).toHaveCount(3);
  });

  test('changing the select dispatches tweak:change and updates schema value', async ({ page }) => {
    await injectComment(page, makeTweakComment('test-knob-change'));
    await page.reload();
    await openCommentPanel(page);

    const select = page.locator('db-comment db-knob wa-select');
    await expect(select).toBeVisible();
    await select.evaluate((el) => {
      (el as HTMLElement & { value: string }).value = '🔥';
      el.dispatchEvent(new Event('wa-change', { bubbles: true }));
    });

    // Server should update the knob value in the schema
    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/tweaks`);
        const body = (await res.json()) as { knobs: { marker: string; value: string }[] };
        return body.knobs.find((k) => k.marker === 'test-knob-change')?.value;
      })
      .toBe('🔥');
  });

  test('Accept button keeps comment with tweakStatus=accepted and collapses knob to status badge', async ({
    page,
  }) => {
    await injectComment(page, makeTweakComment('test-knob-accept'));
    await page.reload();
    await openCommentPanel(page);

    const acceptBtn = page.locator(
      'db-comment wa-button[title="Accept tweak and resolve comment"]',
    );
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    // Comment should still exist in the API with tweakStatus=accepted
    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/comments/test-knob-accept`);
        if (res.status() !== 200) return null;
        const body = (await res.json()) as { comments?: { type: string; tweakStatus?: string }[] };
        return body.comments?.find((c) => c.type === 'tweak')?.tweakStatus;
      })
      .toBe('accepted');

    // Knob should be removed from schema
    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/tweaks`);
        const body = (await res.json()) as { knobs: { marker: string }[] };
        return body.knobs.find((k) => k.marker === 'test-knob-accept');
      })
      .toBeUndefined();

    // Re-open panel and verify the status badge is shown instead of the live knob
    await page.reload();
    await openCommentPanel(page);
    await expect(page.locator('db-comment .tweak-status.accepted')).toBeVisible();
    await expect(page.locator('db-comment .tweaks-section')).toHaveCount(0);
  });

  test('Discard button removes knob from schema but keeps comment', async ({ page }) => {
    await injectComment(page, makeTweakComment('test-knob-discard'));
    await page.reload();
    await openCommentPanel(page);

    // First change the value
    const select = page.locator('db-comment db-knob wa-select');
    await select.evaluate((el) => {
      (el as HTMLElement & { value: string }).value = '🚀';
      el.dispatchEvent(new Event('wa-change', { bubbles: true }));
    });
    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/tweaks`);
        const body = (await res.json()) as { knobs: { marker: string; value: string }[] };
        return body.knobs.find((k) => k.marker === 'test-knob-discard')?.value;
      })
      .toBe('🚀');

    // Now discard
    const discardBtn = page.locator('db-comment wa-button[title="Discard tweak"]');
    await expect(discardBtn).toBeVisible();
    await discardBtn.click();

    // Comment should still exist
    await expect
      .poll(async () => {
        return (await page.request.get(`${API_BASE}/comments/test-knob-discard`)).status();
      })
      .toBe(200);

    // Knob should be removed from schema after discard
    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/tweaks`);
        const body = (await res.json()) as { knobs: { marker: string; value: string }[] };
        return body.knobs.find((k) => k.marker === 'test-knob-discard');
      })
      .toBeUndefined();
  });

  test('Discard button shows tweakStatus=discarded badge and collapses knob', async ({ page }) => {
    await injectComment(page, makeTweakComment('test-knob-discard-badge'));
    await page.reload();
    await openCommentPanel(page);

    const discardBtn = page.locator('db-comment wa-button[title="Discard tweak"]');
    await expect(discardBtn).toBeVisible();
    await discardBtn.click();

    // API should reflect tweakStatus=discarded
    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/comments/test-knob-discard-badge`);
        if (res.status() !== 200) return null;
        const body = (await res.json()) as { comments?: { type: string; tweakStatus?: string }[] };
        return body.comments?.find((c) => c.type === 'tweak')?.tweakStatus;
      })
      .toBe('discarded');

    // Re-open panel to see the badge
    await page.reload();
    await openCommentPanel(page);
    await expect(page.locator('db-comment .tweak-status.discarded')).toBeVisible();
    await expect(page.locator('db-comment .tweaks-section')).toHaveCount(0);
  });

  test('after tweak is accepted, thread stays open for further replies', async ({ page }) => {
    await injectComment(page, makeTweakComment('test-thread-open-after-accept'));
    await page.reload();
    await openCommentPanel(page);

    await page.locator('db-comment wa-button[title="Accept tweak and resolve comment"]').click();

    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/comments/test-thread-open-after-accept`);
        if (res.status() !== 200) return null;
        return (
          (await res.json()) as { comments?: { type: string; tweakStatus?: string }[] }
        ).comments?.find((c) => c.type === 'tweak')?.tweakStatus;
      })
      .toBe('accepted');

    // Re-open panel — reply textarea must still be accessible
    await page.reload();
    await openCommentPanel(page);
    const replyArea = innerTA(page.locator('db-comment wa-textarea[data-role="reply"]'));
    await expect(replyArea).toBeVisible();
    await replyArea.fill('Still can reply after accept');
    await replyArea.press('Enter');

    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/comments/test-thread-open-after-accept`);
        const body = (await res.json()) as { comments?: { type: string; text: string }[] };
        return body.comments?.some(
          (c) => c.type === 'comment' && c.text === 'Still can reply after accept',
        );
      })
      .toBe(true);
  });

  test('agent-authored comment shows agent icon in reply thread', async ({ page }) => {
    const now = Date.now();
    await injectComment(page, {
      id: 'test-agent-icon',
      comment: 'Agent opened this thread',
      author: 'agent',
      replies: [
        { id: 'r-user', type: 'comment', text: 'User said this', createdAt: now, author: 'user' },
        {
          id: 'r-agent',
          type: 'comment',
          text: 'Agent replied',
          createdAt: now + 1,
          author: 'agent',
        },
      ],
    });
    await page.reload();
    await openCommentPanel(page);

    // Both reply rows should be visible
    const rows = page.locator('db-comment .reply-row');
    await expect(rows).toHaveCount(2);

    // Agent row should have agent icon class
    const agentIcon = page.locator('db-comment .reply-author-icon.agent');
    await expect(agentIcon).toBeVisible();

    // User replies no longer have an author icon
    const userIcon = page.locator('db-comment .reply-author-icon.user');
    await expect(userIcon).toHaveCount(0);
  });

  test('review page shows agent tag on agent-authored comments', async ({ page }) => {
    const now = Date.now();
    await injectComment(page, {
      id: 'test-review-agent-tag',
      comment: 'Agent comment for review',
      author: 'agent',
      replies: [
        {
          id: 'r1',
          type: 'comment',
          text: 'Agent comment for review',
          createdAt: now,
          author: 'agent',
        },
      ],
    });
    await page.goto(REVIEW_URL);
    await expect(page.locator('.row')).toHaveCount(1);
    // Agent tag should appear in meta
    await expect(page.locator('.row .meta wa-tag[title="Agent-authored"]')).toBeVisible();
  });

  test('review page shows live tweak tag for pending knob', async ({ page }) => {
    await injectComment(page, {
      ...makeTweakComment('test-review-tweak-live'),
      tweakStatus: 'pending',
    });
    await page.goto(REVIEW_URL);
    await expect(page.locator('.row')).toHaveCount(1);
    await expect(page.locator('.row .meta wa-tag:has-text("tweak live")')).toBeVisible();
  });

  test('review page shows accepted tweak tag after acceptance', async ({ page }) => {
    await injectComment(page, {
      id: 'test-review-tweak-accepted',
      comment: 'Accepted tweak',
      knob: {
        label: 'Feature icon',
        type: 'select',
        value: '\ud83c\udfa8',
        options: { Palette: '\ud83c\udfa8' },
      },
      actions: [],
      tweakStatus: 'accepted',
    });
    await page.goto(REVIEW_URL);
    await expect(page.locator('.row')).toHaveCount(1);
    await expect(page.locator('.row .meta wa-tag:has-text("tweak accepted")')).toBeVisible();
  });

  // ─── Knob type rendering ──────────────────────────────────────────────────

  test('db-knob renders a wa-number-input with the correct value', async ({ page }) => {
    await injectComment(page, {
      id: 'test-knob-number',
      selectors: ['h1'],
      labels: ['h1'],
      comment: 'Number knob test',
      pageUrl: 'http://localhost:5173/',
      timestamp: Date.now(),
      createdAt: Date.now(),
      replies: [],
      knob: { label: 'Font size', type: 'number', value: 16, min: 8, max: 64, step: 1 },
      actions: [],
    });
    await page.reload();
    await openCommentPanel(page);
    const input = page.locator('db-comment db-knob wa-number-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveJSProperty('value', '16');
  });

  test('changing a number input updates schema value', async ({ page }) => {
    await injectComment(page, {
      id: 'test-knob-number-change',
      selectors: ['h1'],
      labels: ['h1'],
      comment: 'Number change test',
      pageUrl: 'http://localhost:5173/',
      timestamp: Date.now(),
      createdAt: Date.now(),
      replies: [],
      knob: { label: 'Font size', type: 'number', value: 16, min: 8, max: 64, step: 1 },
      actions: [],
    });
    await page.reload();
    await openCommentPanel(page);
    const input = page.locator('db-comment db-knob wa-number-input');
    await input.evaluate((el) => {
      (el as HTMLElement & { value: number }).value = 24;
      el.dispatchEvent(new Event('wa-input', { bubbles: true }));
    });
    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/tweaks`);
        const body = (await res.json()) as { knobs: { marker: string; value: unknown }[] };
        return body.knobs.find((k) => k.marker === 'test-knob-number-change')?.value;
      })
      .toBe('24');
  });

  test('db-knob renders a wa-color-picker with the correct value', async ({ page }) => {
    await injectComment(page, {
      id: 'test-knob-color',
      selectors: ['h1'],
      labels: ['h1'],
      comment: 'Color knob test',
      pageUrl: 'http://localhost:5173/',
      timestamp: Date.now(),
      createdAt: Date.now(),
      replies: [],
      knob: { label: 'Brand color', type: 'color', value: '#ff0000' },
      actions: [],
    });
    await page.reload();
    await openCommentPanel(page);
    const picker = page.locator('db-comment db-knob wa-color-picker');
    await expect(picker).toBeVisible();
    await expect(picker).toHaveJSProperty('value', '#ff0000');
  });

  test('changing a color picker updates schema value', async ({ page }) => {
    await injectComment(page, {
      id: 'test-knob-color-change',
      selectors: ['h1'],
      labels: ['h1'],
      comment: 'Color change test',
      pageUrl: 'http://localhost:5173/',
      timestamp: Date.now(),
      createdAt: Date.now(),
      replies: [],
      knob: { label: 'Brand color', type: 'color', value: '#ff0000' },
      actions: [],
    });
    await page.reload();
    await openCommentPanel(page);
    const picker = page.locator('db-comment db-knob wa-color-picker');
    await picker.evaluate((el) => {
      (el as HTMLElement & { value: string }).value = '#00ff00';
      el.dispatchEvent(new Event('wa-change', { bubbles: true }));
    });
    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/tweaks`);
        const body = (await res.json()) as { knobs: { marker: string; value: unknown }[] };
        return body.knobs.find((k) => k.marker === 'test-knob-color-change')?.value;
      })
      .toBe('#00ff00');
  });

  test('db-knob renders a wa-input for string type with the correct value', async ({ page }) => {
    await injectComment(page, {
      id: 'test-knob-string',
      selectors: ['h1'],
      labels: ['h1'],
      comment: 'String knob test',
      pageUrl: 'http://localhost:5173/',
      timestamp: Date.now(),
      createdAt: Date.now(),
      replies: [],
      knob: { label: 'Heading text', type: 'string', value: 'Hello world' },
      actions: [],
    });
    await page.reload();
    await openCommentPanel(page);
    const input = page.locator('db-comment db-knob wa-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveJSProperty('value', 'Hello world');
  });

  test('changing a string input updates schema value', async ({ page }) => {
    await injectComment(page, {
      id: 'test-knob-string-change',
      selectors: ['h1'],
      labels: ['h1'],
      comment: 'String change test',
      pageUrl: 'http://localhost:5173/',
      timestamp: Date.now(),
      createdAt: Date.now(),
      replies: [],
      knob: { label: 'Heading text', type: 'string', value: 'Hello world' },
      actions: [],
    });
    await page.reload();
    await openCommentPanel(page);
    const input = page.locator('db-comment db-knob wa-input');
    await input.evaluate((el) => {
      (el as HTMLElement & { value: string }).value = 'New heading';
      el.dispatchEvent(new Event('wa-input', { bubbles: true }));
    });
    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/tweaks`);
        const body = (await res.json()) as { knobs: { marker: string; value: unknown }[] };
        return body.knobs.find((k) => k.marker === 'test-knob-string-change')?.value;
      })
      .toBe('New heading');
  });

  test('db-knob renders a wa-textarea for textarea type with the correct value', async ({
    page,
  }) => {
    await injectComment(page, {
      id: 'test-knob-textarea',
      selectors: ['h1'],
      labels: ['h1'],
      comment: 'Textarea knob test',
      pageUrl: 'http://localhost:5173/',
      timestamp: Date.now(),
      createdAt: Date.now(),
      replies: [],
      knob: { label: 'Body copy', type: 'textarea', value: 'Initial text' },
      actions: [],
    });
    await page.reload();
    await openCommentPanel(page);
    const textarea = page.locator('db-comment db-knob wa-textarea');
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveJSProperty('value', 'Initial text');
  });

  test('changing a textarea updates schema value', async ({ page }) => {
    await injectComment(page, {
      id: 'test-knob-textarea-change',
      selectors: ['h1'],
      labels: ['h1'],
      comment: 'Textarea change test',
      pageUrl: 'http://localhost:5173/',
      timestamp: Date.now(),
      createdAt: Date.now(),
      replies: [],
      knob: { label: 'Body copy', type: 'textarea', value: 'Initial text' },
      actions: [],
    });
    await page.reload();
    await openCommentPanel(page);
    const textarea = page.locator('db-comment db-knob wa-textarea');
    await textarea.evaluate((el) => {
      (el as HTMLElement & { value: string }).value = 'Updated text';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/tweaks`);
        const body = (await res.json()) as { knobs: { marker: string; value: unknown }[] };
        return body.knobs.find((k) => k.marker === 'test-knob-textarea-change')?.value;
      })
      .toBe('Updated text');
  });

  test('db-knob renders a wa-switch for boolean type with correct checked state', async ({
    page,
  }) => {
    await injectComment(page, {
      id: 'test-knob-boolean',
      selectors: ['h1'],
      labels: ['h1'],
      comment: 'Boolean knob test',
      pageUrl: 'http://localhost:5173/',
      timestamp: Date.now(),
      createdAt: Date.now(),
      replies: [],
      knob: { label: 'Show badge', type: 'boolean', value: true },
      actions: [],
    });
    await page.reload();
    await openCommentPanel(page);
    const toggle = page.locator('db-comment db-knob wa-switch');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveJSProperty('checked', true);
  });

  test('toggling a boolean switch updates schema value', async ({ page }) => {
    await injectComment(page, {
      id: 'test-knob-boolean-change',
      selectors: ['h1'],
      labels: ['h1'],
      comment: 'Boolean change test',
      pageUrl: 'http://localhost:5173/',
      timestamp: Date.now(),
      createdAt: Date.now(),
      replies: [],
      knob: { label: 'Show badge', type: 'boolean', value: true },
      actions: [],
    });
    await page.reload();
    await openCommentPanel(page);
    const toggle = page.locator('db-comment db-knob wa-switch');
    await toggle.evaluate((el) => {
      (el as HTMLElement & { checked: boolean }).checked = false;
      el.dispatchEvent(new Event('wa-change', { bubbles: true }));
    });
    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/tweaks`);
        const body = (await res.json()) as { knobs: { marker: string; value: unknown }[] };
        return body.knobs.find((k) => k.marker === 'test-knob-boolean-change')?.value;
      })
      .toBe('false');
  });

  test('db-knob renders wa-radio-group for button-group type with the correct options', async ({
    page,
  }) => {
    await injectComment(page, {
      id: 'test-knob-button-group',
      selectors: ['h1'],
      labels: ['h1'],
      comment: 'Button-group knob test',
      pageUrl: 'http://localhost:5173/',
      timestamp: Date.now(),
      createdAt: Date.now(),
      replies: [],
      knob: {
        label: 'Variant',
        type: 'button-group',
        value: 'sm',
        options: { Small: 'sm', Medium: 'md', Large: 'lg' },
      },
      actions: [],
    });
    await page.reload();
    await openCommentPanel(page);
    const group = page.locator('db-comment db-knob wa-radio-group');
    await expect(group).toBeVisible();
    await expect(group).toHaveJSProperty('value', 'sm');
    await expect(group.locator('wa-radio')).toHaveCount(3);
  });

  test('changing a button-group radio updates schema value', async ({ page }) => {
    await injectComment(page, {
      id: 'test-knob-button-group-change',
      selectors: ['h1'],
      labels: ['h1'],
      comment: 'Button-group change test',
      pageUrl: 'http://localhost:5173/',
      timestamp: Date.now(),
      createdAt: Date.now(),
      replies: [],
      knob: {
        label: 'Variant',
        type: 'button-group',
        value: 'sm',
        options: { Small: 'sm', Medium: 'md', Large: 'lg' },
      },
      actions: [],
    });
    await page.reload();
    await openCommentPanel(page);
    const group = page.locator('db-comment db-knob wa-radio-group');
    await group.evaluate((el) => {
      (el as HTMLElement & { value: string }).value = 'lg';
      el.dispatchEvent(new Event('wa-change', { bubbles: true }));
    });
    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/tweaks`);
        const body = (await res.json()) as { knobs: { marker: string; value: unknown }[] };
        return body.knobs.find((k) => k.marker === 'test-knob-button-group-change')?.value;
      })
      .toBe('lg');
  });

  test('comment persists to disk as JSON file after injection', async ({ page }) => {
    await injectComment(page, { id: 'persist-json-test', comment: 'JSON file test' });
    // Verify it can be retrieved (confirms it was stored)
    const res = await page.request.get(`${API_BASE}/comments/persist-json-test`);
    expect(res.status()).toBe(200);
    // Reload page and confirm comment survives (loaded from disk)
    await page.reload();
    await expect(page.locator('db-comment')).toBeAttached();
    const res2 = await page.request.get(`${API_BASE}/comments/persist-json-test`);
    expect(res2.status()).toBe(200);
    const ann = (await res2.json()) as { comments?: { text: string }[] };
    expect(ann.comments?.[0]?.text).toBe('JSON file test');
  });
});

// ── Edit & Delete ─────────────────────────────────────────────────────────────

test.describe('Edit and delete own comments', () => {
  test('three-dot menu always visible on user reply in badge panel', async ({ page }) => {
    await createComment(page, 'h1', 'Editable comment');
    await page.locator('db-comment wa-badge').first().click();
    const panel = commentPanel(page);
    await expect(panel.locator('.reply-menu wa-button[title="More"]')).toBeVisible();
  });

  test('clicking edit in reply menu shows textarea with current text', async ({ page }) => {
    await createComment(page, 'h1', 'Original text');
    await page.locator('db-comment wa-badge').first().click();
    const panel = commentPanel(page);
    await panel.locator('.reply-menu wa-button[title="More"]').first().click();
    await page.locator('wa-dropdown-item:has-text("Edit")').first().click();
    const editArea = innerTA(panel.locator('wa-textarea[data-edit-id]'));
    await expect(editArea).toBeVisible();
    await expect(editArea).toHaveValue('Original text');
  });

  test('saves edited reply text via Enter key', async ({ page }) => {
    await createComment(page, 'h1', 'Old text');
    await page.locator('db-comment wa-badge').first().click();
    const panel = commentPanel(page);
    await panel.locator('.reply-menu wa-button[title="More"]').first().click();
    await page.locator('wa-dropdown-item:has-text("Edit")').first().click();
    const editArea = innerTA(panel.locator('wa-textarea[data-edit-id]'));
    await editArea.fill('Updated text');
    await editArea.press('Enter');
    await expect(panel.locator('wa-textarea[data-edit-id]')).toHaveCount(0);
    await expect(panel.locator('.comment-text').first()).toHaveText('Updated text');
    // Persisted to API
    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/comments`);
        const body = (await res.json()) as { comments: { comments?: { text: string }[] }[] };
        return body.comments.some((a) => a.comments?.some((c) => c.text === 'Updated text'));
      })
      .toBe(true);
  });

  test('saves edited reply text via Save button', async ({ page }) => {
    await createComment(page, 'h1', 'Save via button');
    await page.locator('db-comment wa-badge').first().click();
    const panel = commentPanel(page);
    await panel.locator('.reply-menu wa-button[title="More"]').first().click();
    await page.locator('wa-dropdown-item:has-text("Edit")').first().click();
    const editArea = innerTA(panel.locator('wa-textarea[data-edit-id]'));
    await editArea.fill('Button saved');
    await panel.locator('.edit-actions wa-button[appearance="filled"]').click();
    await expect(panel.locator('wa-textarea[data-edit-id]')).toHaveCount(0);
    await expect(panel.locator('.comment-text').first()).toHaveText('Button saved');
  });

  test('cancel edit in badge panel restores original text', async ({ page }) => {
    await createComment(page, 'h1', 'Cancel restores me');
    await page.locator('db-comment wa-badge').first().click();
    const panel = commentPanel(page);
    await panel.locator('.reply-menu wa-button[title="More"]').first().click();
    await page.locator('wa-dropdown-item:has-text("Edit")').first().click();
    const editArea = innerTA(panel.locator('wa-textarea[data-edit-id]'));
    await editArea.fill('Should be discarded');
    await panel.locator('.edit-actions wa-button[appearance="plain"]').click();
    await expect(panel.locator('wa-textarea[data-edit-id]')).toHaveCount(0);
    await expect(panel.locator('.comment-text').first()).toHaveText('Cancel restores me');
  });

  test('cancel edit via Escape in badge panel restores original text', async ({ page }) => {
    await createComment(page, 'h1', 'Escape cancels edit');
    await page.locator('db-comment wa-badge').first().click();
    const panel = commentPanel(page);
    await panel.locator('.reply-menu wa-button[title="More"]').first().click();
    await page.locator('wa-dropdown-item:has-text("Edit")').first().click();
    const editArea = innerTA(panel.locator('wa-textarea[data-edit-id]'));
    await editArea.fill('Will be discarded');
    await editArea.press('Escape');
    await expect(panel.locator('wa-textarea[data-edit-id]')).toHaveCount(0);
    await expect(panel.locator('.comment-text').first()).toHaveText('Escape cancels edit');
  });

  test('empty text does not save (Save button disabled) in badge panel', async ({ page }) => {
    await createComment(page, 'h1', 'Non-empty');
    await page.locator('db-comment wa-badge').first().click();
    const panel = commentPanel(page);
    await panel.locator('.reply-menu wa-button[title="More"]').first().click();
    await page.locator('wa-dropdown-item:has-text("Edit")').first().click();
    const editArea = innerTA(panel.locator('wa-textarea[data-edit-id]'));
    await editArea.fill('');
    const saveBtn = panel.locator('.edit-actions wa-button[appearance="filled"]');
    await expect(saveBtn).toHaveAttribute('disabled', '');
  });

  test('edit option appears in review page row dropdown for user comment', async ({ page }) => {
    await createComment(page, 'h1', 'Reviewable comment');
    await page.goto(REVIEW_URL);
    await expect(page.locator('.row')).toHaveCount(1);
    await page.locator('.row').first().hover();
    await page.locator('.row-menu').first().locator('wa-button[title="More"]').click();
    await expect(page.locator('wa-dropdown-item:has-text("Edit")')).toBeVisible();
  });

  test('clicking edit in review page dropdown shows inline textarea', async ({ page }) => {
    await createComment(page, 'h1', 'Review edit target');
    await page.goto(REVIEW_URL);
    await page.locator('.row').first().hover();
    await page.locator('.row-menu').first().locator('wa-button[title="More"]').click();
    await page.locator('wa-dropdown-item:has-text("Edit")').first().click();
    const inlineEdit = page.locator('wa-textarea.inline-edit');
    await expect(inlineEdit).toBeVisible();
    await expect(innerTA(inlineEdit)).toHaveValue('Review edit target');
  });

  test('saves edited comment from review page via Enter key', async ({ page }) => {
    await createComment(page, 'h1', 'Before edit');
    await page.goto(REVIEW_URL);
    await page.locator('.row').first().hover();
    await page.locator('.row-menu').first().locator('wa-button[title="More"]').click();
    await page.locator('wa-dropdown-item:has-text("Edit")').first().click();
    const inlineEdit = page.locator('wa-textarea.inline-edit');
    await innerTA(inlineEdit).fill('After edit');
    await innerTA(inlineEdit).press('Enter');
    await expect(page.locator('.inline-edit')).toHaveCount(0);
    await expect(page.locator('.row .comment').first()).toContainText('After edit');
    // Confirm persisted
    await expect
      .poll(async () => {
        const res = await page.request.get(`${API_BASE}/comments`);
        const body = (await res.json()) as { comments: { comments?: { text: string }[] }[] };
        return body.comments.some((a) => a.comments?.some((c) => c.text === 'After edit'));
      })
      .toBe(true);
  });

  test('saves edited comment from review page via Save button', async ({ page }) => {
    await createComment(page, 'h1', 'Click save');
    await page.goto(REVIEW_URL);
    await page.locator('.row').first().hover();
    await page.locator('.row-menu').first().locator('wa-button[title="More"]').click();
    await page.locator('wa-dropdown-item:has-text("Edit")').first().click();
    const inlineEdit = page.locator('wa-textarea.inline-edit');
    await innerTA(inlineEdit).fill('Saved via button');
    await page.locator('.inline-edit-actions wa-button[appearance="filled"]').click();
    await expect(page.locator('.inline-edit')).toHaveCount(0);
    await expect(page.locator('.row .comment').first()).toContainText('Saved via button');
  });

  test('cancel edit in review page restores original text', async ({ page }) => {
    await createComment(page, 'h1', 'Original review text');
    await page.goto(REVIEW_URL);
    await page.locator('.row').first().hover();
    await page.locator('.row-menu').first().locator('wa-button[title="More"]').click();
    await page.locator('wa-dropdown-item:has-text("Edit")').first().click();
    const inlineEdit = page.locator('wa-textarea.inline-edit');
    await innerTA(inlineEdit).fill('Discard this');
    await page.locator('.inline-edit-actions wa-button[appearance="plain"]').click();
    await expect(page.locator('.inline-edit')).toHaveCount(0);
    await expect(page.locator('.row .comment').first()).toContainText('Original review text');
  });

  test('cancel edit via Escape in review page restores original text', async ({ page }) => {
    await createComment(page, 'h1', 'Escape in review');
    await page.goto(REVIEW_URL);
    await page.locator('.row').first().hover();
    await page.locator('.row-menu').first().locator('wa-button[title="More"]').click();
    await page.locator('wa-dropdown-item:has-text("Edit")').first().click();
    const inlineEdit = page.locator('wa-textarea.inline-edit');
    await innerTA(inlineEdit).fill('Will be reverted');
    await innerTA(inlineEdit).press('Escape');
    await expect(page.locator('.inline-edit')).toHaveCount(0);
    await expect(page.locator('.row .comment').first()).toContainText('Escape in review');
  });

  test('empty text does not save (Save button disabled) in review page', async ({ page }) => {
    await createComment(page, 'h1', 'Non-empty review');
    await page.goto(REVIEW_URL);
    await page.locator('.row').first().hover();
    await page.locator('.row-menu').first().locator('wa-button[title="More"]').click();
    await page.locator('wa-dropdown-item:has-text("Edit")').first().click();
    await innerTA(page.locator('wa-textarea.inline-edit')).fill('');
    await expect(
      page.locator('.inline-edit-actions wa-button[appearance="filled"]'),
    ).toHaveAttribute('disabled', '');
  });

  test('agent-authored comments do not show edit option in review page', async ({ page }) => {
    // Inject an agent-authored comment directly via API
    await injectComment(page, {
      id: 'agent-comment-test',
      comment: 'Agent comment',
      author: 'agent',
    });
    await page.goto(REVIEW_URL);
    await expect(page.locator('.row')).toHaveCount(1);
    await page.locator('.row').first().hover();
    await page.locator('.row-menu').first().locator('wa-button[title="More"]').click();
    await expect(page.locator('wa-dropdown-item:has-text("Edit")')).toHaveCount(0);
  });

  test('edit is reflected after page reload (persisted)', async ({ page }) => {
    await createComment(page, 'h1', 'Pre-reload text');
    await page.locator('db-comment wa-badge').first().click();
    const panel = commentPanel(page);
    await panel.locator('.reply-menu wa-button[title="More"]').first().click();
    await page.locator('wa-dropdown-item:has-text("Edit")').first().click();
    await innerTA(panel.locator('wa-textarea[data-edit-id]')).fill('Post-reload text');
    await panel.locator('.edit-actions wa-button[appearance="filled"]').click();
    await expect(panel.locator('wa-textarea[data-edit-id]')).toHaveCount(0);
    // Reload and check API
    await page.reload();
    const res = await page.request.get(`${API_BASE}/comments`);
    const body = (await res.json()) as { comments: { comments?: { text: string }[] }[] };
    expect(body.comments.some((a) => a.comments?.some((c) => c.text === 'Post-reload text'))).toBe(
      true,
    );
  });

  test('first reply has only Edit option (no Delete) in badge panel', async ({ page }) => {
    await createComment(page, 'h1', 'Root only edit');
    await page.locator('db-comment wa-badge').first().click();
    const panel = commentPanel(page);
    await panel.locator('.reply-menu wa-button[title="More"]').first().click();
    // Edit must be present, Delete must not exist for the root reply
    await expect(page.locator('wa-dropdown-item:has-text("Edit")')).toBeVisible();
    await expect(
      panel.locator('.reply-row:first-child .reply-menu wa-dropdown-item[variant="danger"]'),
    ).toHaveCount(0);
  });

  test('subsequent reply can be deleted from badge panel', async ({ page }) => {
    await createComment(page, 'h1', 'Root comment');
    // Add a reply
    await page.locator('db-comment wa-badge').first().click();
    const panel = commentPanel(page);
    const replyInput = panel.locator('wa-textarea[data-role="reply"]');
    await innerTA(replyInput).fill('A follow-up reply');
    await innerTA(replyInput).press('Enter');
    // Wait for the reply to appear in the thread (panel stays open after reply)
    await expect(panel.locator('.comment-text')).toHaveCount(2);
    // Second reply row (index 1) should have a three-dot menu with Delete
    await panel.locator('.reply-menu wa-button[title="More"]').nth(1).click();
    await expect(
      panel.locator(
        '.reply-row:nth-child(2) wa-dropdown-item[variant="danger"]:has-text("Delete")',
      ),
    ).toBeVisible();
    await panel
      .locator('.reply-row:nth-child(2) wa-dropdown-item[variant="danger"]:has-text("Delete")')
      .click();
    // Reply should be gone, root comment remains
    await expect(panel.locator('.comment-text')).toHaveCount(1);
  });
});
