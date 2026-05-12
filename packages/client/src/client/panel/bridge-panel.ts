import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { onMessage, sendMessage } from '../../browser/ws-client.js';
import type { TweakKnob, Annotation } from '@design-bridge/core';
import { renderKnobs } from './render/knobs.js';
import { renderActions } from './render/actions.js';
import { renderAnnotations } from './render/annotations.js';
import { onAnnotationsChange, getAnnotations, deleteAnnotation, clearAnnotations, getItemById, getOpenItem } from '../../browser/inspector.js';
import { annotationBus } from './annotation-bus.js';

// ── LocalStorage persistence ───────────────────────────────────────────────

const LS_KEY = '__design_bridge_panel__';

type SnapPosition = 'left' | 'right' | 'top' | 'bottom';

interface PanelPersistedState {
  top?: number;
  left?: number;
  width?: number;
  height?: number;
  collapsed?: boolean;
  activeTab?: 'tweaks' | 'annotations';
  snap?: SnapPosition | null;
}

function loadPanelState(): PanelPersistedState {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as PanelPersistedState; } catch { return {}; }
}

function savePanelState(patch: Partial<PanelPersistedState>): void {
  try {
    const current = loadPanelState();
    localStorage.setItem(LS_KEY, JSON.stringify({ ...current, ...patch }));
  } catch { /* storage unavailable */ }
}

const PANEL_STYLES = css`
  :host {
    --db-bg: #1e1e2e;
    --db-surface: #313244;
    --db-border: #45475a;
    --db-text: #cdd6f4;
    --db-muted: #6c7086;
    --db-amber: #f59e0b;
    --db-amber-dim: rgba(245,158,11,.12);
    --db-red: #f38ba8;
    --db-subtext: #a6adc8;
    --db-font-mono: ui-monospace, monospace;
    --db-radius: 4px;
    --db-panel-radius: 8px;

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

  .panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--db-bg);
    color: var(--db-text);
    border: 1px solid rgba(245,158,11,.35);
    border-radius: var(--db-panel-radius);
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(245,158,11,.08);
  }

  .panel-title {
    background: var(--db-surface);
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--db-text);
    border-bottom: 1px solid var(--db-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: grab;
    user-select: none;
    flex-shrink: 0;
  }
  .panel-title:active { cursor: grabbing; }
  .panel-snap-btns {
    display: flex;
    gap: 2px;
    margin-left: auto;
  }
  .panel-snap-btn {
    all: unset;
    cursor: pointer;
    width: 20px;
    height: 20px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: var(--db-muted);
    line-height: 1;
  }
  .panel-snap-btn:hover { background: var(--db-border); color: var(--db-text); }

  .db-separator {
    border: none;
    border-top: 1px solid var(--db-border);
    margin: 4px 0;
  }

  .db-section {
    padding: 6px 8px;
  }

  .db-section-header {
    padding: 4px 4px 2px;
  }
  .db-section-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--db-muted);
  }

  /* Rows */
  .db-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px;
  }
  .db-label {
    flex: 1;
    font-size: 11px;
    color: var(--db-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Controls */
  .db-control-wrap {
    flex-shrink: 0;
    min-width: 100px;
    max-width: 120px;
  }
  .db-control {
    width: 100%;
    box-sizing: border-box;
    background: var(--db-surface);
    color: var(--db-text);
    border: 1px solid var(--db-border);
    border-radius: var(--db-radius);
    padding: 3px 6px;
    font: inherit;
    font-size: 11px;
    outline: none;
  }
  .db-control:focus { border-color: var(--db-amber); }
  .db-select { cursor: pointer; }
  .db-color { padding: 2px; height: 24px; cursor: pointer; }
  .db-input { }

  /* Toggle */
  .db-toggle {
    position: relative;
    display: inline-flex;
    cursor: pointer;
    flex-shrink: 0;
  }
  .db-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
  .db-toggle-track {
    width: 32px;
    height: 16px;
    border-radius: 8px;
    background: var(--db-border);
    transition: background .15s;
    position: relative;
  }
  .db-toggle-track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--db-text);
    transition: transform .15s;
  }
  .db-toggle input:checked ~ .db-toggle-track { background: var(--db-amber); }
  .db-toggle input:checked ~ .db-toggle-track::after { transform: translateX(16px); }

  /* Buttons */
  .db-actions { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; }
  .db-btn {
    padding: 5px 8px;
    border-radius: var(--db-radius);
    border: 1px solid transparent;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    text-align: center;
  }
  .db-btn--primary { background: var(--db-amber); color: var(--db-bg); }
  .db-btn--danger { background: transparent; color: var(--db-red); border-color: var(--db-border); }
  .db-btn--ghost { background: var(--db-surface); color: var(--db-text); }
  .db-btn--full { width: 100%; box-sizing: border-box; display: block; margin-top: 4px; }

  /* Annotation list */
  .db-ann-list { display: flex; flex-direction: column; }
  .db-ann-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 4px;
    border-radius: var(--db-radius);
    cursor: pointer;
    border-bottom: 1px solid rgba(69,71,90,.5);
  }
  .db-ann-row:last-child { border-bottom: none; }
  .db-ann-row:hover { background: rgba(245,158,11,.06); }
  .db-ann-row--resolved { opacity: 0.45; }
  .db-ann-row--resolved .db-ann-index { color: #a6e3a1; }
  .db-ann-header {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }
  .db-ann-index {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 700;
    color: var(--db-amber);
    font-variant-numeric: tabular-nums;
  }
  .db-ann-label {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    color: var(--db-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .db-ann-time {
    flex-shrink: 0;
    font-size: 10px;
    color: var(--db-muted);
  }
  .db-ann-body {
    font-size: 11px;
    color: var(--db-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-left: 1px;
  }
  .db-ann-footer {
    font-size: 10px;
    color: var(--db-muted);
    padding-left: 1px;
  }
  .db-icon-btn {
    all: unset;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 12px;
    flex-shrink: 0;
  }
  .db-icon-btn--del { color: var(--db-muted); font-size: 14px; line-height: 1; }
  .db-icon-btn--del:hover { color: var(--db-red); }
  .db-icon-btn:hover { background: var(--db-surface); }
  .db-empty { font-size: 11px; color: var(--db-muted); padding: 6px 4px; font-style: italic; }

  /* Tabs */
  .db-tabs {
    display: flex;
    border-bottom: 1px solid var(--db-border);
    background: var(--db-surface);
  }
  .db-tab {
    flex: 1;
    padding: 6px 8px;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    color: var(--db-muted);
    background: transparent;
    border: none;
    cursor: pointer;
    letter-spacing: .04em;
    text-transform: uppercase;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color .1s, border-color .1s;
  }
  .db-tab:hover { color: var(--db-text); }
  .db-tab[aria-selected="true"] {
    color: var(--db-text);
    border-bottom-color: var(--db-amber);
  }
  .db-tab-badge {
    display: inline-block;
    background: var(--db-amber);
    color: var(--db-bg);
    border-radius: 8px;
    padding: 0 5px;
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    margin-left: 4px;
    vertical-align: middle;
  }
  .db-tabs { flex-shrink: 0; }
  .db-tab-content {
    padding: 6px 8px;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }
`;

@customElement('bridge-panel')
export class BridgePanel extends LitElement {
  static styles = PANEL_STYLES;

  @state() private _knobs: TweakKnob[] = [];
  @state() private _annotations: Annotation[] = [];
  @state() private _activeTab: 'tweaks' | 'annotations' = 'tweaks';
  @state() private _collapsed = false;

  private _unsubAnnotations: (() => void) | null = null;
  private _resizeObserver: ResizeObserver | null = null;
  private _saveResizeTimer: ReturnType<typeof setTimeout> | null = null;

  connectedCallback(): void {
    super.connectedCallback();

    // Restore persisted state
    const saved = loadPanelState();
    const host = this as unknown as HTMLElement;
    if (saved.top !== undefined) { host.style.top = `${saved.top}px`; host.style.bottom = 'auto'; }
    if (saved.left !== undefined) { host.style.left = `${saved.left}px`; host.style.right = 'auto'; }
    if (saved.width !== undefined) host.style.width = `${saved.width}px`;
    if (saved.height !== undefined) host.style.height = `${saved.height}px`;
    if (saved.snap) {
      this._applySnap(saved.snap, false);
    } else {
      if (saved.collapsed) {
        this._collapsed = true;
        (this as unknown as HTMLElement).setAttribute('data-collapsed', '');
      }
    }
    if (saved.activeTab) this._activeTab = saved.activeTab;

    // Sync annotations from inspector state
    this._annotations = getAnnotations();
    this._unsubAnnotations = onAnnotationsChange(() => {
      this._annotations = getAnnotations();
    });

    // WS messages
    onMessage((msg) => {
      if (msg.type === 'tweak:schema') {
        this._knobs = msg.payload;
      }
      if (msg.type === 'annotations:sync') {
        this._annotations = msg.payload;
      }
    });

    // Tweak accept/dismiss events from annotation items via the annotation bus
    annotationBus.on('annotation-accept-tweaks', this._onAcceptTweaks);
    annotationBus.on('tweak-accept', this._onTweakAccept);
    annotationBus.on('tweak-dismiss', this._onTweakDismiss);



    // Save size changes to localStorage (debounced)
    this._resizeObserver = new ResizeObserver(() => {
      if (this._collapsed) return;
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
    this._unsubAnnotations?.();
    this._resizeObserver?.disconnect();
    if (this._saveResizeTimer) clearTimeout(this._saveResizeTimer);
    document.removeEventListener('annotation-accept-tweaks', this._onAcceptTweaks);
    document.removeEventListener('tweak-accept', this._onTweakAccept);
    document.removeEventListener('tweak-dismiss', this._onTweakDismiss);
    annotationBus.off('annotation-accept-tweaks', this._onAcceptTweaks);
    annotationBus.off('tweak-accept', this._onTweakAccept);
    annotationBus.off('tweak-dismiss', this._onTweakDismiss);
  }

  // ── Knob handlers ──────────────────────────────────────────────────────────

  private _onKnobChange = (marker: string, value: string): void => {
    sendMessage({ type: 'tweak:change', payload: { marker, value } });
    const knob = this._knobs.find((k) => k.marker === marker);
    getOpenItem()?.registerTweakReply(marker, value, knob?.label);
  };

  private _onAcceptTweaks = (e: CustomEvent<{ annotationId: string; }>): void => {
    const { annotationId } = e.detail;
    sendMessage({ type: 'tweak:accept-annotation', payload: { annotationId } });
  };

  private _onTweakAccept = (e: CustomEvent<{ annotationId: string; marker: string; }>): void => {
    const { annotationId, marker } = e.detail;
    sendMessage({ type: 'tweak:accept-tweak', payload: { annotationId, marker } });
  };

  private _onTweakDismiss = (e: CustomEvent<{ annotationId: string; marker: string; }>): void => {
    const { annotationId, marker } = e.detail;
    sendMessage({ type: 'tweak:dismiss', payload: { annotationId, marker } });
  };

  private _onRevert = (): void => { sendMessage({ type: 'tweak:reset-all' }); };

  private _onDiscard = (): void => {
    sendMessage({ type: 'tweak:discard-all' });
    this._knobs = [];
  };

  private _onApply = (): void => {
    sendMessage({ type: 'tweak:finalize', payload: { markers: this._knobs.map((k) => k.marker) } });
    this._knobs = [];
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
    this._collapsed = false;

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
    this._collapsed = !this._collapsed;
    const host = this as unknown as HTMLElement;
    if (this._collapsed) {
      host.setAttribute('data-collapsed', '');
    } else {
      host.removeAttribute('data-collapsed');
      const saved = loadPanelState();
      if (!saved.snap) host.style.height = `${saved.height ?? 420}px`;
    }
    savePanelState({ collapsed: this._collapsed });
  };

  // ── Snap to edge ─────────────────────────────────────────────────────────

  private _applySnap(position: SnapPosition, persist = true): void {
    const host = this as unknown as HTMLElement;
    // Clear all position/size inline styles
    host.style.cssText = '';
    host.removeAttribute('data-collapsed');
    this._collapsed = false;

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
        this._collapsed = true;
        host.setAttribute('data-collapsed', '');
        break;
      case 'bottom':
        Object.assign(host.style, { bottom: '0', left: '50%', transform: 'translateX(-50%)', top: 'auto', right: 'auto', width: '240px', height: 'auto', minHeight: '0', resize: 'none' });
        host.style.setProperty('--db-panel-radius', '8px 8px 0 0');
        this._collapsed = true;
        host.setAttribute('data-collapsed', '');
        break;
    }
    if (persist) savePanelState({ snap: position, collapsed: this._collapsed });
  }

  private _setTab(tab: 'tweaks' | 'annotations'): void {
    this._activeTab = tab;
    savePanelState({ activeTab: tab });
  }

  render(): TemplateResult {
    const hasKnobs = this._knobs.length > 0;
    const annCount = this._annotations.length;
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

        ${this._collapsed ? '' : html`
          <div class="db-tabs" role="tablist">
            <button
              class="db-tab"
              role="tab"
              aria-selected=${this._activeTab === 'tweaks'}
              @click=${() => this._setTab('tweaks')}
            >Tweaks${hasKnobs ? html`<span class="db-tab-badge">${this._knobs.length}</span>` : ''}</button>
            <button
              class="db-tab"
              role="tab"
              aria-selected=${this._activeTab === 'annotations'}
              @click=${() => this._setTab('annotations')}
            >Annotations${annCount > 0 ? html`<span class="db-tab-badge">${annCount}</span>` : ''}</button>
          </div>
          <div class="db-tab-content">
            ${this._activeTab === 'tweaks' ? html`
              ${renderKnobs(this._knobs, this._onKnobChange)}
              ${renderActions(hasKnobs, {
      onRevert: this._onRevert,
      onDiscard: this._onDiscard,
      onApply: this._onApply,
    })}
              ${!hasKnobs ? html`<div class="db-empty">No tweaks active — drop a .mjs script into tweaks/scripts/</div>` : ''}
            ` : renderAnnotations(this._annotations, {
      onEdit: (ann) => this._openAnnotation(ann),
      onDelete: (id) => deleteAnnotation(id),
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
