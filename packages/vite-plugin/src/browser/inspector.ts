/**
 * Inspector — annotation state + badge rendering via bridge-annotation-item.
 *
 * Each saved annotation gets one persistent <bridge-annotation-item> element.
 * Items are reconciled by ID — never destroyed and recreated wholesale.
 * A draft item is created immediately on Alt+Shift+click; it becomes a saved
 * item when the user submits a comment, or is removed on cancel.
 */

import { sendMessage, onMessage } from './ws-client.js';
import { finder, idName } from '@medv/finder';
import type { Annotation } from '../shared/protocol.js';
import type { BridgeAnnotationItem } from '../client/panel/bridge-annotation-item.js';

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
const itemEls = new Map<string, BridgeAnnotationItem>();
let draftItem: BridgeAnnotationItem | null = null;

export function getItemById(id: string): BridgeAnnotationItem | undefined {
  return itemEls.get(id);
}

export function getOpenItem(): BridgeAnnotationItem | null {
  if (draftItem) return draftItem;
  for (const item of itemEls.values()) {
    if (item.isOpen) return item;
  }
  return null;
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
      item = document.createElement('bridge-annotation-item') as BridgeAnnotationItem;
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
  return !!el.closest('bridge-panel, bridge-annotation-item');
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
  draftItem.addDraftSelector(target);
}

function onTrackCode(e: Event): void {
  const detail = (e as CustomEvent<{ path: string; line: number; column: number }>).detail;
  if (!detail?.path) return;
  if (!itemContainer) return;

  const el = lastInspectedEl;
  if (!el || isOwnUI(el)) return;

  const sel = buildSelector(el);
  const existing = [...annotations.values()].find((a) => a.selectors.includes(sel));

  if (existing) {
    // Open the existing saved item
    getItemById(existing.id)?.openPanel();
  } else if (draftItem) {
    // Draft already open: add another selector + update source
    draftItem.addDraftSelector(el);
    draftItem.setDraftSource({ file: detail.path, line: detail.line, column: detail.column });
  } else {
    // Create a new draft item immediately
    const item = document.createElement('bridge-annotation-item') as BridgeAnnotationItem;
    itemContainer.appendChild(item);
    draftItem = item;
    item.initDraft(el);
    item.setDraftSource({ file: detail.path, line: detail.line, column: detail.column });
  }
}

// ─── Event wiring ────────────────────────────────────────────────────────────

function onAnnotationSave(e: Event): void {
  const ann = (e as CustomEvent<Annotation>).detail;
  if (draftItem) {
    // Promote draft to saved item
    itemEls.set(ann.id, draftItem);
    draftItem = null;
  }
  upsertAnnotation(ann);
}

function onAnnotationCancel(): void {
  draftItem?.remove();
  draftItem = null;
}

function onAnnotationDelete(e: Event): void {
  const { id } = (e as CustomEvent<{ id: string }>).detail;
  deleteAnnotation(id);
}

function onAnnotationResolve(e: Event): void {
  const { id, tweakMarkers } = (e as CustomEvent<{ id: string; tweakMarkers: string[] }>).detail;
  deleteAnnotation(id);
  for (const marker of [...new Set(tweakMarkers)]) {
    sendMessage({ type: 'tweak:reset', payload: { marker } });
  }
}

// ─── Cross-tab BroadcastChannel ──────────────────────────────────────────────

channel.addEventListener('message', (e) => {
  const { type, payload } = e.data as { type: string; payload: Annotation[] };
  if (type === 'annotations:sync') syncAnnotations(payload);
});

// ─── WS incoming ─────────────────────────────────────────────────────────────

onMessage((msg) => {
  if (msg.type === 'annotations:sync') {
    syncAnnotations(msg.payload);
  } else if (msg.type === 'inspect:pick') {
    if (draftItem) draftItem.setDraftSource(msg.payload);
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

  document.addEventListener('annotation-save', onAnnotationSave);
  document.addEventListener('annotation-cancel', onAnnotationCancel);
  document.addEventListener('annotation-delete', onAnnotationDelete);
  document.addEventListener('annotation-resolve', onAnnotationResolve);

  reconcileItems();
}
