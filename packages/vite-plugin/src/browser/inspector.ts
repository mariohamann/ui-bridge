/**
 * Inspector — thin state-only module.
 *
 * Responsibilities:
 * - Manage annotation state (Map + listeners)
 * - Sync annotations over WebSocket + BroadcastChannel
 * - Handle element selection via code-inspector's Alt+Shift+click UX
 * - Render annotation badges in host DOM via <bridge-annotation-badge>
 *
 * Selection model (single mechanism):
 *   Hold Alt+Shift and click any element → code-inspector shows its highlight
 *   overlay and fires `code-inspector:trackCode` with source info. We pick up
 *   the hovered element for the CSS selector and the event detail for the
 *   source location, then open the annotation popover with both.
 *
 * DOM rendering (popover, Tweakpane) has moved to the Lit components.
 */

import { sendMessage, onMessage } from './ws-client.js';
import { finder, idName } from '@medv/finder';
import type { Annotation } from '../shared/protocol.js';
import type { BridgeAnnotationPopover } from '../client/panel/bridge-annotation-popover.js';
import type { BridgeAnnotationBadge } from '../client/panel/bridge-annotation-badge.js';

// ─── Selector helpers ────────────────────────────────────────────────────────

function buildSelectorInternal(el: Element): string {
  try {
    return finder(el, {
      // Always use IDs when present
      idName: (name) => idName(name) || name.length > 0,
      // Longer, more stable selectors
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
  renderBadges();
  notifyChange();
}

export function upsertAnnotation(ann: Annotation): void {
  annotations.set(ann.id, ann);
  sendMessage({ type: 'annotation:upsert', payload: ann });
  channel.postMessage({ type: 'annotations:sync', payload: [...annotations.values()] });
  renderBadges();
  notifyChange();
}

export function deleteAnnotation(id: string): void {
  annotations.delete(id);
  sendMessage({ type: 'annotation:delete', payload: { id } });
  channel.postMessage({ type: 'annotations:sync', payload: [...annotations.values()] });
  renderBadges();
  notifyChange();
}

export function clearAnnotations(): void {
  annotations.clear();
  sendMessage({ type: 'annotation:clear' });
  channel.postMessage({ type: 'annotations:sync', payload: [] });
  renderBadges();
  notifyChange();
}

// ─── code-inspector integration ──────────────────────────────────────────────
//
// code-inspector-plugin is the single selection mechanism:
//   Hold Alt+Shift → code-inspector shows its highlight overlay on the hovered
//   element. Click → it fires `code-inspector:trackCode` on window with
//   detail: { path, line, column, name }.
//
// We track the last element under the cursor while the modifier keys are held
// so we can generate a CSS selector. Source info comes from the event detail.

let lastInspectedEl: Element | null = null;

function isOwnUI(el: Element): boolean {
  return !!el.closest('bridge-panel, bridge-annotation-popover, bridge-annotation-badge');
}

function onPointerMoveForInspect(e: MouseEvent): void {
  if (!e.altKey || !e.shiftKey) {
    lastInspectedEl = null;
    return;
  }
  // Walk composedPath to find first real content element (skip our own UI and
  // the code-inspector overlay which sits in front of everything).
  for (const node of e.composedPath()) {
    if (!(node instanceof Element)) continue;
    if (node.tagName === 'CODE-INSPECTOR-COMPONENT') continue;
    if (isOwnUI(node)) break;
    lastInspectedEl = node;
    return;
  }
}

function onTrackCode(e: Event): void {
  const detail = (e as CustomEvent<{ path: string; line: number; column: number }>).detail;
  if (!detail?.path) return;

  const popover = document.querySelector('bridge-annotation-popover') as BridgeAnnotationPopover | null;
  if (!popover) return;

  const el = lastInspectedEl;
  if (el && !isOwnUI(el)) {
    // Open with selector first — showForSource then adds source to the open popover
    const sel = buildSelectorInternal(el);
    const existing = [...annotations.values()].find((a) => a.selectors.includes(sel));
    if (existing) {
      popover.showForAnnotation(existing);
    } else {
      popover.showForElement(el);
    }
  }

  popover.showForSource({ file: detail.path, line: detail.line, column: detail.column });
}

// ─── Badges ──────────────────────────────────────────────────────────────────

let badgeContainer: HTMLElement | null = null;

function renderBadges(): void {
  if (!badgeContainer) return;
  badgeContainer.innerHTML = '';
  const annList = [...annotations.values()];
  annList.forEach((ann, i) => {
    const badge = document.createElement('bridge-annotation-badge') as BridgeAnnotationBadge;
    badge.annotation = ann;
    badge.index = i;
    badgeContainer!.appendChild(badge);
  });
}

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
    const popover = document.querySelector('bridge-annotation-popover') as BridgeAnnotationPopover | null;
    popover?.showForSource(msg.payload);
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

export function initInspector(): void {
  badgeContainer = document.createElement('div');
  badgeContainer.id = 'db-badges';
  badgeContainer.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:2147483645;width:0;height:0;';
  document.body.appendChild(badgeContainer);

  // Track hovered element for selector generation (fires before code-inspector's click handler)
  document.addEventListener('pointermove', onPointerMoveForInspect as EventListener, { capture: true });
  // code-inspector fires this after every Alt+Shift+click
  window.addEventListener('code-inspector:trackCode', onTrackCode);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const popover = document.querySelector('bridge-annotation-popover') as BridgeAnnotationPopover | null;
      if (popover && !popover.hidden) { popover.hidden = true; }
    }
  });

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver((mutations) => {
    if (mutations.every((m) => badgeContainer!.contains(m.target as Node) || m.target === badgeContainer)) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderBadges, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('scroll', renderBadges, { passive: true });
  window.addEventListener('resize', renderBadges, { passive: true });

  // Render any annotations that were synced before initInspector() ran
  renderBadges();
}
