/**
 * Inspector — annotation state + badge rendering via db-annotation.
 *
 * Each saved annotation gets one persistent <db-annotation> element.
 * Items are reconciled by ID — never destroyed and recreated wholesale.
 * A draft item is created immediately on Alt+Shift+click; it becomes a saved
 * item when the user submits a comment, or is removed on cancel.
 */

import { sendMessage, onMessage } from './ws-client.js';
import { finder, idName } from '@medv/finder';
import type { Annotation } from '@design-bridge/core';
import type { DbAnnotation } from '@design-bridge/components';
import { onIntent, updateAnnotations } from '@design-bridge/components';

// ─── Selector helper ──────────────────────────────────────────────────────────

function buildSelector(el: Element): string {
  try {
    return finder(el, {
      idName: (name) => idName(name) || name.length > 0,
      seedMinLength: 5,
      optimizedMinLength: 4,
    });
  } catch { return el.tagName.toLowerCase(); }
}

// ─── State ───────────────────────────────────────────────────────────────────

const annotations = new Map<string, Annotation>();
const changeListeners = new Set<() => void>();
const channel = new BroadcastChannel('design-bridge:annotations');

function notifyChange(): void {
  for (const cb of changeListeners) cb();
  // Push into the shared signal store so any SignalWatcher consumer re-renders
  updateAnnotations([...annotations.values()]);
}

export function getAnnotations(): Annotation[] {
  return [...annotations.values()];
}

export function onAnnotationsChange(cb: () => void): () => void {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}

function syncAnnotations(list: Annotation[]): void {
  annotations.clear();
  for (const ann of list) annotations.set(ann.id, ann);
  reconcileItems();
  notifyChange();
}

export function upsertAnnotation(ann: Annotation): void {
  annotations.set(ann.id, ann);
  sendMessage({ type: 'annotation:upsert', payload: ann });
  channel.postMessage({ type: 'annotations:sync', payload: [...annotations.values()] });
  reconcileItems();
  notifyChange();
}

export function deleteAnnotation(id: string): void {
  annotations.delete(id);
  sendMessage({ type: 'annotation:delete', payload: { id } });
  channel.postMessage({ type: 'annotations:sync', payload: [...annotations.values()] });
  reconcileItems();
  notifyChange();
}

export function clearAnnotations(): void {
  annotations.clear();
  sendMessage({ type: 'annotation:clear' });
  channel.postMessage({ type: 'annotations:sync', payload: [] });
  reconcileItems();
  notifyChange();
}

// ─── Item container ───────────────────────────────────────────────────────────

let itemContainer: HTMLElement | null = null;
const itemEls = new Map<string, DbAnnotation>();
let draftItem: DbAnnotation | null = null;

/** ID of the annotation we want to focus on the next click, when the current panel has a dirty draft. */
let pendingFocusId: string | null = null;

export function getItemById(id: string): DbAnnotation | undefined {
  return itemEls.get(id);
}

/** Close all open saved panels (does not affect draft). */
function closeAllPanels(): void {
  for (const item of itemEls.values()) {
    if (item.isOpen) item.closePanel();
  }
}

/** Open a saved panel, closing any other open panel first. */
function openItemPanel(item: DbAnnotation): void {
  closeAllPanels();
  pendingFocusId = null;
  item.openPanel();
}

export function getOpenItem(): DbAnnotation | null {
  if (draftItem) return draftItem;
  for (const item of itemEls.values()) {
    if (item.isOpen) return item;
  }
  return null;
}

/**
 * Focus a saved annotation panel from an external trigger (review page click,
 * deep-link, etc.). Implements the dirty-draft guard:
 *  - If the currently open panel has unsaved text → wobble it and remember the
 *    requested id; the caller must call focusAnnotation(id) again to confirm.
 *  - On confirm (same id requested twice) → discard the draft and open the new panel.
 */
export function focusAnnotation(id: string): boolean {
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

function reconcileItems(): void {
  if (!itemContainer) return;
  const annList = [...annotations.values()];

  // Remove items whose annotation was deleted
  for (const [id, el] of itemEls) {
    if (!annotations.has(id)) {
      el.remove();
      itemEls.delete(id);
    }
  }

  // Add or update items
  annList.forEach((ann, i) => {
    let item = itemEls.get(ann.id);
    if (!item) {
      item = document.createElement('db-annotation') as DbAnnotation;
      itemContainer!.appendChild(item);
      itemEls.set(ann.id, item);
    }
    item.annotation = ann;
    item.index = i;
  });
}

// ─── code-inspector integration ──────────────────────────────────────────────

let lastInspectedEl: Element | null = null;

function isOwnUI(el: Element): boolean {
  return !!el.closest('db-annotation');
}

function onPointerMoveForInspect(e: MouseEvent): void {
  if (!e.altKey || !e.shiftKey) { lastInspectedEl = null; return; }
  for (const node of e.composedPath()) {
    if (!(node instanceof Element)) continue;
    if (node.tagName === 'CODE-INSPECTOR-COMPONENT') continue;
    if (isOwnUI(node)) continue;
    lastInspectedEl = node;
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
  if (!e.altKey || !e.shiftKey || !draftItem) return;
  const els = document.elementsFromPoint(e.clientX, e.clientY);
  const target = els.find(
    (el) => el.tagName !== 'CODE-INSPECTOR-COMPONENT' && !isOwnUI(el) && el.tagName !== 'HTML' && el.tagName !== 'BODY' && el !== document.documentElement,
  );
  if (!target) return;
  lastInspectedEl = target;
  draftItem.addDraftSelector(target, buildSelector(target));
}

function onTrackCode(e: Event): void {
  const detail = (e as CustomEvent<{ path: string; line: number; column: number; }>).detail;
  if (!detail?.path) return;
  if (!itemContainer) return;

  const el = lastInspectedEl;
  if (!el || isOwnUI(el)) return;

  const sel = buildSelector(el);
  const existing = [...annotations.values()].find((a) => a.selectors.includes(sel));

  if (existing && !draftItem) {
    // Open the existing saved item (only when not in draft/multi-select mode)
    openItemPanel(getItemById(existing.id)!);
  } else if (draftItem) {
    // Draft already open: add selector (deduped by element ref) + update source.
    draftItem.addDraftSelector(el, buildSelector(el));
    draftItem.setDraftSource({ file: detail.path, line: detail.line, column: detail.column });
  } else {
    // Create a new draft item immediately
    const item = document.createElement('db-annotation') as DbAnnotation;
    itemContainer.appendChild(item);
    draftItem = item;
    item.initDraft(el, buildSelector(el));
    item.setDraftSource({ file: detail.path, line: detail.line, column: detail.column });
  }
}

// ─── Event wiring ────────────────────────────────────────────────────────────

// ─── Cross-tab BroadcastChannel ──────────────────────────────────────────────

channel.addEventListener('message', (e) => {
  const { type, payload } = e.data as { type: string; payload: Annotation[]; };
  if (type === 'annotations:sync') syncAnnotations(payload);
});

// ─── WS incoming ─────────────────────────────────────────────────────────────

onMessage((msg) => {
  if (msg.type === 'annotations:sync') {
    syncAnnotations(msg.payload);
  } else if (msg.type === 'inspect:pick') {
    if (draftItem) draftItem.setDraftSource(msg.payload);
  } else if (msg.type === 'annotation:focus') {
    const opened = focusAnnotation(msg.payload.id);
    // Scroll annotated element into view only when the panel actually opened
    if (opened) {
      const ann = annotations.get(msg.payload.id);
      if (ann) {
        for (const sel of ann.selectors) {
          try {
            const el = document.querySelector(sel);
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); break; }
          } catch { /* noop */ }
        }
      }
    }
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

export function initInspector(): void {
  itemContainer = document.createElement('div');
  itemContainer.id = 'db-items';
  itemContainer.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:2147483645;width:0;height:0;';
  document.body.appendChild(itemContainer);

  document.addEventListener('pointermove', onPointerMoveForInspect as EventListener, { capture: true });
  document.addEventListener('pointerdown', onPointerDownForInspect as EventListener, { capture: true });
  window.addEventListener('code-inspector:trackCode', onTrackCode);

  onIntent((intent) => {
    if (intent.type === 'annotation:save') {
      const ann = intent.annotation;
      if (draftItem) { itemEls.set(ann.id, draftItem); draftItem = null; }
      upsertAnnotation(ann);
    } else if (intent.type === 'annotation:cancel') {
      draftItem?.remove();
      draftItem = null;
    } else if (intent.type === 'annotation:delete') {
      deleteAnnotation(intent.id);
    } else if (intent.type === 'annotation:badge-click') {
      focusAnnotation(intent.id);
    }
  });

  reconcileItems();

  // Deep-link: ?db-annotation=<id> opens the annotation panel on load
  const targetId = new URLSearchParams(location.search).get('db-annotation');
  if (targetId) {
    const tryOpen = (): boolean => {
      const item = itemEls.get(targetId);
      if (item) { focusAnnotation(targetId); return true; }
      return false;
    };
    if (!tryOpen()) {
      // Wait for the first annotations:sync to arrive and items to be reconciled
      const unsub = onAnnotationsChange(() => {
        if (tryOpen()) unsub();
      });
    }
  }
}
