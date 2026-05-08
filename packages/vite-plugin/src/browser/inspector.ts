/**
 * Inspector — thin state-only module.
 *
 * Responsibilities:
 * - Manage annotation state (Map + listeners)
 * - Sync annotations over WebSocket + BroadcastChannel
 * - Manage inspect mode (hover highlight + Alt+click → popover)
 * - Render annotation badges in host DOM via <bridge-annotation-badge>
 *
 * DOM rendering (popover, Tweakpane) has moved to the Lit components.
 */

import { sendMessage, onMessage } from './ws-client.js';
import { finder } from '@medv/finder';
import type { Annotation } from '../shared/protocol.js';
import type { BridgeAnnotationPopover } from '../client/panel/bridge-annotation-popover.js';
import type { BridgeAnnotationBadge } from '../client/panel/bridge-annotation-badge.js';

// ─── Selector helpers ────────────────────────────────────────────────────────

function buildSelectorInternal(el: Element): string {
  try { return finder(el); } catch { return el.tagName.toLowerCase(); }
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

// ─── Inspect mode ────────────────────────────────────────────────────────────

let inspectMode = false;
let hovered: Element | null = null;

export function isInspectMode(): boolean { return inspectMode; }

export function setInspectMode(active: boolean): void {
  inspectMode = active;
  document.body.style.cursor = active ? 'crosshair' : '';
  if (!active && hovered) {
    hovered.classList.remove('db-inspect-highlight');
    hovered = null;
  }
}

// ─── Hover highlight ─────────────────────────────────────────────────────────

function isOwnUI(el: Element): boolean {
  return !!el.closest('bridge-panel, bridge-annotation-popover, bridge-annotation-badge');
}

function onMouseOver(e: MouseEvent): void {
  if (!inspectMode) return;
  const el = e.target as Element;
  if (isOwnUI(el)) return;
  if (hovered) hovered.classList.remove('db-inspect-highlight');
  hovered = el;
  hovered.classList.add('db-inspect-highlight');
}

function onMouseOut(e: MouseEvent): void {
  if (!inspectMode) return;
  const el = e.target as Element;
  el.classList.remove('db-inspect-highlight');
  if (hovered === el) hovered = null;
}

// ─── Click handler ────────────────────────────────────────────────────────────

function onInspectClick(e: MouseEvent): void {
  if (!inspectMode) return;
  if ((e.target as Element).closest('bridge-panel, bridge-annotation-popover, bridge-annotation-badge')) return;

  e.preventDefault();
  e.stopPropagation();

  const el = e.target as Element;
  el.classList.remove('db-inspect-highlight');

  const popover = document.querySelector('bridge-annotation-popover') as BridgeAnnotationPopover | null;
  if (!popover) return;

  const sel = buildSelectorInternal(el);
  const existing = [...annotations.values()].find((a) => a.selectors.includes(sel));
  if (existing) {
    popover.showForAnnotation(existing);
  } else {
    popover.showForElement(el);
  }
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
  const { type, payload } = e.data as { type: string; payload: Annotation[] };
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

// ─── Inject inspect highlight style ─────────────────────────────────────────

function injectInspectStyle(): void {
  if (document.getElementById('db-inspect-style')) return;
  const s = document.createElement('style');
  s.id = 'db-inspect-style';
  s.textContent = '.db-inspect-highlight{outline:2px solid #f59e0b!important;outline-offset:2px!important;cursor:crosshair!important;}';
  document.head.appendChild(s);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

export function initInspector(): void {
  injectInspectStyle();

  badgeContainer = document.createElement('div');
  badgeContainer.id = 'db-badges';
  badgeContainer.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:2147483645;width:0;height:0;';
  document.body.appendChild(badgeContainer);

  document.addEventListener('mouseover', onMouseOver, { capture: true });
  document.addEventListener('mouseout', onMouseOut, { capture: true });
  document.addEventListener('click', onInspectClick, { capture: true });

  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'i') {
      e.preventDefault();
      setInspectMode(!inspectMode);
      return;
    }
    if (e.key === 'Escape') {
      const popover = document.querySelector('bridge-annotation-popover') as BridgeAnnotationPopover | null;
      if (popover && !popover.hidden) { popover.hidden = true; return; }
      if (inspectMode) setInspectMode(false);
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
}
