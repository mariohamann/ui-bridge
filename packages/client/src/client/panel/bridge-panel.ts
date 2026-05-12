import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import type { Annotation } from '@design-bridge/core';
import {
  designBridgeHostTokenStyles,
  baseControlStyles,
  panelLayoutStyles,
  knobsSignal,
  annotationsSignal,
  activeTabSignal, collapsedSignal, snapSignal,
  setActiveTab, setCollapsed, setSnap, hydrateFromPersisted,
  dispatchIntent,
  type PanelPersistedState, type SnapPosition,
} from '@design-bridge/components';
import { renderKnobs } from './render/knobs.js';
import { renderActions } from './render/actions.js';
import { renderAnnotations } from './render/annotations.js';
import { deleteAnnotation, clearAnnotations, getItemById } from '../../browser/inspector.js';
import { annotationBus } from './annotation-bus.js';

// ── LocalStorage persistence ───────────────────────────────────────────────

const LS_KEY = '__design_bridge_panel__';

function loadPanelState(): PanelPersistedState {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as PanelPersistedState; } catch { return {}; }
}

function savePanelState(patch: Partial<PanelPersistedState>): void {
  try {
    const current = loadPanelState();
    localStorage.setItem(LS_KEY, JSON.stringify({ ...current, ...patch }));
  } catch { /* storage unavailable */ }
}

/** Panel-specific host positioning rules not covered by shared style modules. */
const PANEL_STYLES = css`
  :host {
    display: flex;
    flex-direction: column;
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: 2147483647;
    width: 300px;
    height: 420px;
    min-width: 220px;
    min-height: 200px;
    resize: both;
    overflow: hidden;
    font-family: var(--db-font-mono);
    font-size: 12px;
  }

  :host([data-collapsed]) {
    height: auto !important;
    min-height: 0 !important;
    resize: none !important;
  }

  /* Section layout — not in shared panel-layout (those are tab/ann-row only) */
  .db-section { padding: 6px 8px; }
  .db-section-header { padding: 4px 4px 2px; }
  .db-section-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--db-muted);
  }
`;

@customElement('bridge-panel')
export class BridgePanel extends SignalWatcher(LitElement) {
  static styles = [designBridgeHostTokenStyles, baseControlStyles, panelLayoutStyles, PANEL_STYLES];

  private _resizeObserver: ResizeObserver | null = null;
  private _saveResizeTimer: ReturnType<typeof setTimeout> | null = null;

  connectedCallback(): void {
    super.connectedCallback();

    // Hydrate panel-ui store from localStorage and apply position/size to host
    const saved = loadPanelState();
    hydrateFromPersisted(saved);
    const host = this as unknown as HTMLElement;
    if (saved.top !== undefined) { host.style.top = `${saved.top}px`; host.style.bottom = 'auto'; }
    if (saved.left !== undefined) { host.style.left = `${saved.left}px`; host.style.right = 'auto'; }
    if (saved.width !== undefined) host.style.width = `${saved.width}px`;
    if (saved.height !== undefined) host.style.height = `${saved.height}px`;
    if (saved.snap) {
      this._applySnap(saved.snap, false);
    } else if (saved.collapsed) {
      host.setAttribute('data-collapsed', '');
    }

    // Annotation bus events from annotation items → intent dispatch
    annotationBus.on('annotation-accept-tweaks', this._onAcceptTweaks);
    annotationBus.on('tweak-accept', this._onTweakAccept);
    annotationBus.on('tweak-dismiss', this._onTweakDismiss);

    // Save size changes to localStorage (debounced)
    this._resizeObserver = new ResizeObserver(() => {
      if (collapsedSignal.get()) return;
      if (this._saveResizeTimer) clearTimeout(this._saveResizeTimer);
      this._saveResizeTimer = setTimeout(() => {
        const r = host.getBoundingClientRect();
        savePanelState({ width: r.width, height: r.height });
      }, 300);
    });
    this._resizeObserver.observe(host);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
    if (this._saveResizeTimer) clearTimeout(this._saveResizeTimer);
    annotationBus.off('annotation-accept-tweaks', this._onAcceptTweaks);
    annotationBus.off('tweak-accept', this._onTweakAccept);
    annotationBus.off('tweak-dismiss', this._onTweakDismiss);
  }

  // ── Knob handlers → intent dispatch ──────────────────────────────────────

  private _onKnobChange = (marker: string, value: string): void => {
    dispatchIntent({ type: 'tweak:change', marker, value });
  };

  private _onAcceptTweaks = (e: CustomEvent<{ annotationId: string; }>): void => {
    dispatchIntent({ type: 'tweak:accept-annotation', annotationId: e.detail.annotationId });
  };

  private _onTweakAccept = (e: CustomEvent<{ annotationId: string; marker: string; }>): void => {
    dispatchIntent({ type: 'tweak:accept-one', annotationId: e.detail.annotationId, marker: e.detail.marker });
  };

  private _onTweakDismiss = (e: CustomEvent<{ annotationId: string; marker: string; }>): void => {
    dispatchIntent({ type: 'tweak:dismiss-one', annotationId: e.detail.annotationId, marker: e.detail.marker });
  };

  private _onRevert = (): void => { dispatchIntent({ type: 'tweak:revert' }); };

  private _onDiscard = (): void => { dispatchIntent({ type: 'tweak:discard' }); };

  private _onApply = (): void => {
    dispatchIntent({ type: 'tweak:apply', markers: knobsSignal.get().map((k) => k.marker) });
  };

  // ── Annotation open (from panel row click) ───────────────────────────────

  private _openAnnotation(ann: Annotation): void {
    // Scroll target element into view if off-screen
    for (const sel of ann.selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); break; }
      } catch { /* bad selector */ }
    }
    // Open the item's panel
    getItemById(ann.id)?.openPanel();
  }

  // ── Drag to move ──────────────────────────────────────────────────────────

  private _onDragStart = (e: MouseEvent): void => {
    if ((e.target as Element).closest('button')) return;
    // Let dblclick fire first — don't start drag on a double-click
    if (e.detail >= 2) return;
    e.preventDefault();

    const host = this as unknown as HTMLElement;

    // Clear any snap transforms BEFORE reading getBoundingClientRect,
    // otherwise translateX(-50%) causes the rect.left to differ from style.left
    // and the panel drifts on every drag.
    host.style.transform = '';
    host.style.setProperty('--db-panel-radius', '8px');
    host.style.resize = 'both';
    host.style.height = host.style.height || '420px';
    host.removeAttribute('data-collapsed');
    setCollapsed(false);

    const startX = e.clientX;
    const startY = e.clientY;
    const rect = host.getBoundingClientRect();
    // Switch from bottom/right/top/left combos to explicit top+left
    host.style.bottom = 'auto';
    host.style.right = 'auto';
    host.style.top = `${rect.top}px`;
    host.style.left = `${rect.left}px`;

    const onMove = (ev: MouseEvent): void => {
      const titleBarHeight = 36; // approximate height of the panel title bar
      const newTop = rect.top + ev.clientY - startY;
      const newLeft = rect.left + ev.clientX - startX;
      const panelWidth = host.offsetWidth;
      // Clamp so the title bar stays fully within the viewport
      const clampedTop = Math.max(0, Math.min(newTop, window.innerHeight - titleBarHeight));
      const clampedLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panelWidth));
      host.style.top = `${clampedTop}px`;
      host.style.left = `${clampedLeft}px`;
    };
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const r = host.getBoundingClientRect();
      savePanelState({ top: r.top, left: r.left, snap: null, collapsed: false });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ── Collapse on double-click ───────────────────────────────────────────────

  private _onTitleDblClick = (e: MouseEvent): void => {
    if ((e.target as Element).closest('button')) return;
    e.preventDefault();
    const next = !collapsedSignal.get();
    setCollapsed(next);
    const host = this as unknown as HTMLElement;
    if (next) {
      host.setAttribute('data-collapsed', '');
    } else {
      host.removeAttribute('data-collapsed');
      const saved = loadPanelState();
      if (!saved.snap) host.style.height = `${saved.height ?? 420}px`;
    }
    savePanelState({ collapsed: next });
  };

  // ── Snap to edge ─────────────────────────────────────────────────────────

  private _applySnap(position: SnapPosition, persist = true): void {
    const host = this as unknown as HTMLElement;
    // Clear all position/size inline styles
    host.style.cssText = '';
    host.removeAttribute('data-collapsed');
    setCollapsed(false);
    setSnap(position);

    switch (position) {
      case 'left':
        Object.assign(host.style, { top: '0', left: '0', bottom: '0', right: 'auto', width: '280px', height: '100dvh', resize: 'horizontal' });
        host.style.setProperty('--db-panel-radius', '0 8px 8px 0');
        break;
      case 'right':
        Object.assign(host.style, { top: '0', right: '0', bottom: '0', left: 'auto', width: '280px', height: '100dvh', resize: 'horizontal' });
        host.style.setProperty('--db-panel-radius', '8px 0 0 8px');
        break;
      case 'top':
        Object.assign(host.style, { top: '0', left: '50%', transform: 'translateX(-50%)', bottom: 'auto', right: 'auto', width: '240px', height: 'auto', minHeight: '0', resize: 'none' });
        host.style.setProperty('--db-panel-radius', '0 0 8px 8px');
        setCollapsed(true);
        host.setAttribute('data-collapsed', '');
        break;
      case 'bottom':
        Object.assign(host.style, { bottom: '0', left: '50%', transform: 'translateX(-50%)', top: 'auto', right: 'auto', width: '240px', height: 'auto', minHeight: '0', resize: 'none' });
        host.style.setProperty('--db-panel-radius', '8px 8px 0 0');
        setCollapsed(true);
        host.setAttribute('data-collapsed', '');
        break;
    }
    if (persist) savePanelState({ snap: position, collapsed: collapsedSignal.get() });
  }

  private _setTab(tab: 'tweaks' | 'annotations'): void {
    setActiveTab(tab);
    savePanelState({ activeTab: tab });
  }

  render(): TemplateResult {
    // Reads from signals — SignalWatcher schedules re-render on any signal change.
    const knobs = knobsSignal.get();
    const annotations = annotationsSignal.get();
    const activeTab = activeTabSignal.get();
    const collapsed = collapsedSignal.get();

    const hasKnobs = knobs.length > 0;
    const annCount = annotations.length;
    return html`
      <div class="panel">
        <div class="panel-title" @mousedown=${this._onDragStart} @dblclick=${this._onTitleDblClick}>
          <span>Design Bridge</span>
          <div class="panel-snap-btns">
            <button class="panel-snap-btn" title="Snap to top" @click=${(e: Event) => { e.stopPropagation(); this._applySnap('top'); }}>&#9650;</button>
            <button class="panel-snap-btn" title="Snap left" @click=${(e: Event) => { e.stopPropagation(); this._applySnap('left'); }}>&#9664;</button>
            <button class="panel-snap-btn" title="Snap right" @click=${(e: Event) => { e.stopPropagation(); this._applySnap('right'); }}>&#9654;</button>
            <button class="panel-snap-btn" title="Snap to bottom" @click=${(e: Event) => { e.stopPropagation(); this._applySnap('bottom'); }}>&#9660;</button>
          </div>
        </div>

        ${collapsed ? '' : html`
          <div class="db-tabs" role="tablist">
            <button
              class="db-tab"
              role="tab"
              aria-selected=${activeTab === 'tweaks'}
              @click=${() => this._setTab('tweaks')}
            >Tweaks${hasKnobs ? html`<span class="db-tab-badge">${knobs.length}</span>` : ''}</button>
            <button
              class="db-tab"
              role="tab"
              aria-selected=${activeTab === 'annotations'}
              @click=${() => this._setTab('annotations')}
            >Annotations${annCount > 0 ? html`<span class="db-tab-badge">${annCount}</span>` : ''}</button>
          </div>
          <div class="db-tab-content">
            ${activeTab === 'tweaks' ? html`
              ${renderKnobs(knobs, this._onKnobChange)}
              ${renderActions(hasKnobs, {
      onRevert: this._onRevert,
      onDiscard: this._onDiscard,
      onApply: this._onApply,
    })}
              ${!hasKnobs ? html`<div class="db-empty">No tweaks active — drop a .mjs script into tweaks/scripts/</div>` : ''}
            ` : renderAnnotations(annotations, {
      onEdit: (ann: Annotation) => this._openAnnotation(ann),
      onDelete: (id: string) => deleteAnnotation(id),
      onClear: () => clearAnnotations(),
    })}
          </div>
        `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'bridge-panel': BridgePanel; }
}
