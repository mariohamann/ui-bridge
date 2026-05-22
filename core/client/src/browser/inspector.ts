/**
 * Inspector — comment state + badge rendering via db-comment.
 *
 * Each saved comment gets one persistent <db-comment> element.
 * Items are reconciled by ID — never destroyed and recreated wholesale.
 * A draft item is created immediately on Alt+Shift+click; it becomes a saved
 * item when the user submits a comment, or is removed on cancel.
 */

import { sendMessage, onMessage } from './ws-client.js';
import { finder, idName } from '@medv/finder';
import type { CommentThread } from '@design-bridge/protocol';
import { DB_COMMENT_TAG, DB_SOURCE_INSPECTOR_TAG } from '@design-bridge/protocol';
import type { DbComment } from '@design-bridge/components';
import {
  onIntent,
  updateComments,
  getSourceInfo,
  DB_HIGHLIGHT_COLOR,
  orphanedIdsSignal,
} from '@design-bridge/components';

// ─── Selector helper ──────────────────────────────────────────────────────────

function buildSelector(el: Element): string {
  try {
    return finder(el, {
      idName: (name) => idName(name) || name.length > 0,
      seedMinLength: 5,
      optimizedMinLength: 4,
    });
  } catch {
    return el.tagName.toLowerCase();
  }
}

// ─── State ───────────────────────────────────────────────────────────────────

const comments = new Map<string, CommentThread>();
const changeListeners = new Set<() => void>();
const channel = new BroadcastChannel('design-bridge:comments');

function notifyChange(): void {
  for (const cb of changeListeners) cb();
  // Push into the shared signal store so any SignalWatcher consumer re-renders
  updateComments([...comments.values()]);
}

export function getComments(): CommentThread[] {
  return [...comments.values()];
}

export function onCommentsChange(cb: () => void): () => void {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}

function syncComments(list: CommentThread[]): void {
  // Preserve demo fixtures — they are never sent by the server.
  const demos = [...comments.values()].filter((c) => c.meta.demo);
  comments.clear();
  for (const ann of [...list, ...demos]) comments.set(ann.meta.id, ann);
  reconcileItems();
  notifyChange();
}

export function upsertComment(ann: CommentThread): void {
  comments.set(ann.meta.id, ann);
  if (!ann.meta.demo) sendMessage({ type: 'comment:upsert', payload: ann });
  channel.postMessage({ type: 'comments:sync', payload: [...comments.values()] });
  reconcileItems();
  notifyChange();
}

export function deleteComment(id: string): void {
  comments.delete(id);
  sendMessage({ type: 'comment:delete', payload: { id } });
  channel.postMessage({ type: 'comments:sync', payload: [...comments.values()] });
  reconcileItems();
  notifyChange();
}

export function clearComments(): void {
  comments.clear();
  sendMessage({ type: 'comment:clear' });
  channel.postMessage({ type: 'comments:sync', payload: [] });
  reconcileItems();
  notifyChange();
}

// ─── Item container ───────────────────────────────────────────────────────────

let itemContainer: HTMLElement | null = null;
let orphanedBar: HTMLElement | null = null;
const itemEls = new Map<string, DbComment>();
let draftItem: DbComment | null = null;

/** ID of the comment we want to focus on the next click, when the current panel has a dirty draft. */
let pendingFocusId: string | null = null;

export function getItemById(id: string): DbComment | undefined {
  return itemEls.get(id);
}

/** Close all open saved panels (does not affect draft). */
function closeAllPanels(): void {
  for (const item of itemEls.values()) {
    if (item.isOpen) item.closePanel();
  }
}

/** Open a saved panel, closing any other open panel first. */
function openItemPanel(item: DbComment): void {
  closeAllPanels();
  pendingFocusId = null;
  item.openPanel();
}

export function getOpenItem(): DbComment | null {
  if (draftItem) return draftItem;
  for (const item of itemEls.values()) {
    if (item.isOpen) return item;
  }
  return null;
}

/**
 * Focus a saved comment panel from an external trigger (review page click,
 * deep-link, etc.). Implements the dirty-draft guard:
 *  - If the currently open panel has unsaved text → wobble it and remember the
 *    requested id; the caller must call focusComment(id) again to confirm.
 *  - On confirm (same id requested twice) → discard the draft and open the new panel.
 */
export function focusComment(id: string): boolean {
  const target = itemEls.get(id);
  if (!target) return false;

  const currentOpen = getOpenItem();

  // Clicking the badge of the already-open panel → toggle it closed
  if (currentOpen === target) {
    target.closePanel();
    pendingFocusId = null;
    return false;
  }

  if (currentOpen) {
    // Check for dirty draft on the currently open panel
    if (currentOpen.hasDirtyDraft) {
      if (pendingFocusId !== id) {
        // First attempt: wobble the current panel and register the pending focus
        pendingFocusId = id;
        currentOpen.wobble();
        return false;
      }
      // Second attempt with the same id: discard the draft, fall through to open
      currentOpen.discardDraftAndClose();
    } else {
      currentOpen.closePanel();
    }
  }

  pendingFocusId = null;
  target.openPanel();
  return true;
}

function reconcileOrphans(): void {
  if (!itemContainer) return;
  // Lazy lookup — bar is appended after initInspector() in index.ts
  if (!orphanedBar) orphanedBar = document.querySelector('db-comment-bar');
  if (!orphanedBar) return;
  const orphanedIds = orphanedIdsSignal.get();
  for (const [id, el] of itemEls) {
    const isOrphaned = orphanedIds.has(id);
    const inBar = el.parentElement === orphanedBar;
    if (isOrphaned && !inBar) {
      orphanedBar.appendChild(el);
      el.setAttribute('docked', '');
    } else if (!isOrphaned && inBar) {
      itemContainer.appendChild(el);
      el.removeAttribute('docked');
    }
  }
}

function reconcileItems(): void {
  if (!itemContainer) return;
  const annList = [...comments.values()].filter((ann) => !ann.meta.resolvedAt);

  // Remove items whose comment was deleted or resolved
  for (const [id, el] of itemEls) {
    if (!comments.has(id) || comments.get(id)?.meta.resolvedAt) {
      el.remove();
      itemEls.delete(id);
    }
  }

  // Add or update items
  annList.forEach((ann, i) => {
    let item = itemEls.get(ann.meta.id);
    if (!item) {
      item = document.createElement('db-comment') as DbComment;
      itemContainer!.appendChild(item);
      itemEls.set(ann.meta.id, item);
    }
    item.comment = ann;
    item.index = i;
  });

  // Schedule orphan reconciliation after the next paint so _repositionBadge
  // has had a chance to run and update orphanedIdsSignal.
  // Double-rAF: first tick lets Lit queue property updates; second runs after they apply.
  requestAnimationFrame(() => requestAnimationFrame(reconcileOrphans));
}

// ─── code-inspector integration ──────────────────────────────────────────────

let lastInspectedEl: Element | null = null;

function isOwnUI(el: Element): boolean {
  return !!el.closest(DB_COMMENT_TAG);
}

function isInspectorUI(el: Element): boolean {
  return el.tagName === DB_SOURCE_INSPECTOR_TAG.toUpperCase() || isOwnUI(el);
}

// ─── Hover highlight overlay ──────────────────────────────────────────────

let highlightEl: HTMLElement | null = null;

function getOrCreateHighlight(): HTMLElement {
  if (!highlightEl) {
    highlightEl = document.createElement('div');
    highlightEl.id = '__db-hover-highlight';
    Object.assign(highlightEl.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483646',
      outline: `2px solid ${DB_HIGHLIGHT_COLOR}`,
      outlineOffset: '1px',
      borderRadius: '2px',
      display: 'none',
    });
    document.documentElement.appendChild(highlightEl);
  }
  return highlightEl;
}

function showHighlight(el: Element): void {
  const rect = el.getBoundingClientRect();
  const h = getOrCreateHighlight();
  Object.assign(h.style, {
    display: 'block',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

function hideHighlight(): void {
  if (highlightEl) highlightEl.style.display = 'none';
}

function onPointerMoveForInspect(e: MouseEvent): void {
  if (!e.altKey || !e.shiftKey) {
    lastInspectedEl = null;
    hideHighlight();
    document.documentElement.style.cursor = '';
    return;
  }
  document.documentElement.style.cursor = 'crosshair';
  for (const node of e.composedPath()) {
    if (!(node instanceof Element)) continue;
    if (isInspectorUI(node)) continue;
    if (node !== lastInspectedEl) {
      lastInspectedEl = node;
      showHighlight(node);
    }
    return;
  }
}

/**
 * When a draft is already open, our panel may cover the page element the user
 * wants to add. code-inspector can't see through it, so we handle multi-select
 * directly on pointerdown using elementsFromPoint to pierce our own UI.
 * No source-info update needed — it's already set from the first click.
 */
function onPointerDownForInspect(e: PointerEvent): void {
  if (!e.altKey || !e.shiftKey) return;
  hideHighlight();
  if (!draftItem) return;
  const els = document.elementsFromPoint(e.clientX, e.clientY);
  const target = els.find(
    (el) =>
      !isInspectorUI(el) &&
      el.tagName !== 'HTML' &&
      el.tagName !== 'BODY' &&
      el !== document.documentElement,
  );
  if (!target) return;
  lastInspectedEl = target;
  draftItem.addDraftSelector(target, buildSelector(target));
}

function onTrackCode(e: Event): void {
  const detail = (e as CustomEvent<{ path?: string; line?: number; column?: number; }>).detail;
  hideHighlight();
  if (!itemContainer) return;

  const el = lastInspectedEl;
  if (!el || isInspectorUI(el)) return;

  const sel = buildSelector(el);
  const existing = [...comments.values()].find((a) =>
    a.elements.some((el) => el.minimalSelector === sel),
  );
  // Prefer event detail source info; fall back to reading DOM attributes directly.
  const detailSource = detail?.path
    ? { file: detail.path, line: detail.line ?? 1, column: detail.column ?? 0 }
    : null;
  const source = detailSource ?? getSourceInfo(el) ?? undefined;

  if (existing && !draftItem) {
    openItemPanel(getItemById(existing.meta.id)!);
  } else if (draftItem) {
    draftItem.addDraftSelector(el, buildSelector(el));
    if (source) draftItem.setDraftSource(source);
  } else {
    const item = document.createElement(DB_COMMENT_TAG) as DbComment;
    itemContainer.appendChild(item);
    draftItem = item;
    item.initDraft(el, buildSelector(el));
    if (source) item.setDraftSource(source);
  }
}

// ─── Event wiring ────────────────────────────────────────────────────────────

// ─── Cross-tab BroadcastChannel ──────────────────────────────────────────────

channel.addEventListener('message', (e) => {
  const { type, payload } = e.data as { type: string; payload: CommentThread[]; };
  if (type === 'comments:sync') syncComments(payload);
});

// ─── WS incoming ─────────────────────────────────────────────────────────────

onMessage((msg) => {
  if (msg.type === 'comments:sync') {
    syncComments(msg.payload);
  } else if (msg.type === 'inspect:pick') {
    if (draftItem) draftItem.setDraftSource(msg.payload);
  } else if (msg.type === 'comment:focus') {
    const opened = focusComment(msg.payload.id);
    // Scroll annotated element into view only when the panel actually opened
    if (opened) {
      const ann = comments.get(msg.payload.id);
      if (ann) {
        for (const el of ann.elements) {
          try {
            const domEl = document.querySelector(el.minimalSelector);
            if (domEl) {
              domEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              break;
            }
          } catch {
            /* noop */
          }
        }
      }
    }
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

export function initInspector(): void {
  itemContainer = document.createElement('div');
  itemContainer.id = 'db-items';
  itemContainer.style.cssText =
    'position:fixed;top:0;left:0;pointer-events:none;z-index:2147483645;width:0;height:0;';
  document.body.appendChild(itemContainer);

  orphanedBar = document.querySelector('db-comment-bar');

  // Re-reconcile orphans after scroll/resize (same events that trigger _repositionBadge).
  // One rAF delay ensures _repositionBadge has already updated orphanedIdsSignal.
  let rafPending = false;
  const scheduleOrphanReconcile = (): void => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      reconcileOrphans();
    });
  };
  window.addEventListener('scroll', scheduleOrphanReconcile, { passive: true, capture: true });
  window.addEventListener('resize', scheduleOrphanReconcile, { passive: true });
  // Also fire once on the next tick after all badges have had a chance to reposition.
  requestAnimationFrame(reconcileOrphans);

  document.addEventListener('pointermove', onPointerMoveForInspect as EventListener, {
    capture: true,
  });
  document.addEventListener('pointerdown', onPointerDownForInspect as EventListener, {
    capture: true,
  });
  window.addEventListener('code-inspector:trackCode', onTrackCode);

  onIntent((intent) => {
    if (intent.type === 'comment:save') {
      const ann = intent.comment;
      if (draftItem) {
        itemEls.set(ann.meta.id, draftItem);
        draftItem = null;
      }
      upsertComment(ann);
    } else if (intent.type === 'comment:cancel') {
      draftItem?.remove();
      draftItem = null;
    } else if (intent.type === 'comment:delete') {
      deleteComment(intent.id);
    } else if (intent.type === 'comment:badge-click') {
      focusComment(intent.id);
    } else if (intent.type === 'comment:bar-click') {
      const ann = comments.get(intent.id);
      // Try to find the element in the DOM
      let found = false;
      if (ann) {
        for (const el of ann.elements) {
          try {
            const domEl = document.querySelector(el.minimalSelector);
            if (domEl) {
              domEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              found = true;
              break;
            }
          } catch {
            /* noop */
          }
        }
      }
      if (found) {
        // Open the real anchored panel in #db-items
        focusComment(intent.id);
      } else {
        // Orphaned: open the bar badge's own panel
        const barEl = document.querySelector('db-comment-bar');
        if (barEl) {
          const barBadges = barEl.shadowRoot?.querySelectorAll('db-comment') ?? [];
          for (const badge of barBadges) {
            const b = badge as unknown as DbComment;
            if (b.comment?.meta.id === intent.id) {
              b.openPanel();
              break;
            }
          }
        }
      }
    }
  });

  reconcileItems();

  // Also listen for the click event (Alt+Shift) to trigger draft creation.
  // The click is processed at capture phase so it fires before any page handlers.
  document.addEventListener(
    'click',
    (e: MouseEvent) => {
      if (!e.altKey || !e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(
        new CustomEvent('code-inspector:trackCode', {
          detail: getSourceInfo(lastInspectedEl!) ?? {},
        }),
      );
    },
    { capture: true },
  );

  // Deep-link: ?db-comment=<id> opens the comment panel on load
  const targetId = new URLSearchParams(location.search).get('db-comment');
  if (targetId) {
    const tryOpen = (): boolean => {
      const item = itemEls.get(targetId);
      if (item) {
        focusComment(targetId);
        return true;
      }
      return false;
    };
    if (!tryOpen()) {
      // Wait for the first comments:sync to arrive and items to be reconciled
      const unsub = onCommentsChange(() => {
        if (tryOpen()) unsub();
      });
    }
  }
}
