import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { computePosition, autoUpdate, flip, shift, offset } from '@floating-ui/dom';
import { finder, idName } from '@medv/finder';
import autosize from 'autosize';
import type { Annotation, AnnotationReply, AnnotationSource, AnnotationTweakLink } from '../../../shared/protocol.js';

const HIGHLIGHT_ATTR = 'data-db-related';

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function buildAnnotationSelector(el: Element): string {
  try {
    return finder(el, {
      idName: (name) => idName(name) || name.length > 0,
      seedMinLength: 5,
      optimizedMinLength: 4,
    });
  } catch { return el.tagName.toLowerCase(); }
}

function shortLabel(el: Element): string {
  let label = el.tagName.toLowerCase();
  if (el.id) label += `#${el.id}`;
  else if (el.classList.length) label += `.${[...el.classList][0]}`;
  return label;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatTweakReply(marker: string, value: string): string {
  return `Tweak ${marker} -> ${value}`;
}

type ItemMode = 'create' | 'view';

/**
 * bridge-annotation-item — one web component per annotation.
 *
 * Contains both the badge dot and the comment thread panel in a single shadow
 * DOM. The host element is `position:fixed; width:0; height:0` so it takes no
 * space. The badge and panel float inside via inline `position:fixed` styles.
 *
 * Modes:
 *  - create: annotation === null, opened immediately on Alt+Shift+click
 *  - view:   annotation is set, panel opens/closes on badge click
 */
@customElement('bridge-annotation-item')
export class BridgeAnnotationItem extends LitElement {
  static styles = css`
    :host {
      --db-bg: #1e1e2e;
      --db-surface: #313244;
      --db-border: #45475a;
      --db-text: #cdd6f4;
      --db-muted: #6c7086;
      --db-amber: #f59e0b;
      --db-amber-dim: rgba(245,158,11,.12);
      --db-blue: #89b4fa;
      --db-red: #f38ba8;
      --db-green: #a6e3a1;
      --db-font-mono: ui-monospace, monospace;

      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: 2147483645;
    }

    /* ── Badge ─────────────────────────────── */
    .badge {
      position: fixed;
      pointer-events: auto;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--db-amber);
      color: #1e1e2e;
      font: 700 10px/20px ui-sans-serif, system-ui, sans-serif;
      text-align: center;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,.4);
      user-select: none;
      transition: transform .1s;
    }
    .badge:hover { transform: scale(1.25); }
    .badge.resolved {
      background: var(--db-green);
      opacity: 0.55;
    }
    .badge.draft {
      opacity: 0.75;
      background: var(--db-amber);
    }

    /* ── Badge hover preview ─────────────────── */
    .badge-preview {
      position: fixed;
      pointer-events: none;
      background: var(--db-bg);
      color: var(--db-text);
      border: 1px solid var(--db-border);
      border-radius: 6px;
      padding: 5px 9px;
      font: 12px/1.4 var(--db-font-mono);
      box-shadow: 0 4px 12px rgba(0,0,0,.45);
      width: 220px;
      z-index: 2147483647;
      opacity: 0;
      transform: scale(0.95);
      transition: opacity .12s ease, transform .12s ease;
    }
    .badge-preview.visible {
      opacity: 1;
      transform: scale(1);
    }
    .badge-preview-text {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      overflow: hidden;
      word-break: break-word;
    }
    .badge-preview-meta {
      font-size: 10px;
      color: var(--db-muted);
      margin-top: 2px;
    }

    /* ── Panel ─────────────────────────────── */
    .panel {
      position: fixed;
      pointer-events: auto;
      z-index: 2147483646;
      background: var(--db-bg);
      color: var(--db-text);
      border-radius: 8px;
      padding: 0;
      width: 300px;
      max-height: calc(100dvh - 32px);
      overflow-y: auto;
      box-shadow: 0 8px 24px rgba(0,0,0,.6);
      font: 13px/1.5 var(--db-font-mono);
    }
    .panel[hidden] { display: none !important; }

    /* ── Header ─────────────────────────────── */
    .header {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--db-border);
    }
    .header-title {
      flex: 1;
      font-size: 12px;
      font-weight: 600;
      color: var(--db-text);
      letter-spacing: .02em;
    }
    .icon-btn {
      all: unset;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      color: var(--db-muted);
      font-size: 14px;
      line-height: 1;
      transition: background .1s, color .1s;
    }
    .icon-btn:hover { background: var(--db-surface); color: var(--db-text); }
    .icon-btn.resolve:hover { color: var(--db-green); }
    .icon-btn.close:hover { color: var(--db-red); }

    /* ── Overflow menu ──────────────────────── */
    .menu-wrap { position: relative; }
    .overflow-menu {
      position: absolute;
      top: 100%;
      right: 0;
      z-index: 1;
      background: var(--db-surface);
      border: 1px solid var(--db-border);
      border-radius: 6px;
      padding: 4px;
      min-width: 140px;
      box-shadow: 0 4px 12px rgba(0,0,0,.4);
    }
    .menu-item {
      all: unset;
      display: block;
      width: 100%;
      box-sizing: border-box;
      padding: 5px 10px;
      font-size: 12px;
      border-radius: 4px;
      cursor: pointer;
      color: var(--db-text);
    }
    .menu-item:hover { background: var(--db-border); }
    .menu-item.danger { color: var(--db-red); }

    /* ── Body ───────────────────────────────── */
    .body { padding: 10px 12px; }

    .comment-text {
      font-size: 13px;
      line-height: 1.5;
      color: var(--db-text);
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0 0 6px;
    }
    .timestamp {
      font-size: 11px;
      color: var(--db-muted);
      margin-bottom: 8px;
    }

    textarea {
      width: 100%;
      box-sizing: border-box;
      background: var(--db-surface);
      color: var(--db-text);
      border: 1px solid var(--db-border);
      border-radius: 4px;
      padding: 8px;
      font: inherit;
      font-size: 12px;
      field-sizing: content;
      resize: none;
      min-height: 2lh;
      outline: none;
      margin-bottom: 8px;
      transition: border-color .12s, box-shadow .12s;
    }
    textarea:focus {
      border-color: var(--db-blue);
      box-shadow: 0 0 0 2px rgba(137,180,250,.28);
    }

    @supports not (field-sizing: content) {
      textarea { overflow: hidden; }
    }

    /* ── Chips ──────────────────────────────── */
    .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--db-amber-dim);
      border: 1px solid var(--db-amber);
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 11px;
      color: var(--db-amber);
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chip button {
      all: unset; cursor: pointer; color: var(--db-muted); font-size: 13px; line-height: 1;
    }
    .chip button:hover { color: var(--db-red); }

    .source-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      background: rgba(137,180,250,.12);
      border: 1px solid var(--db-blue);
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11px;
      color: var(--db-blue);
      margin-bottom: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .source-chip-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .hint {
      font-size: 11px;
      color: var(--db-muted);
      margin-bottom: 8px;
      font-style: italic;
    }

    /* ── Footer ─────────────────────────────── */
    .footer {
      display: flex;
      gap: 6px;
      padding: 8px 12px;
      border-top: 1px solid var(--db-border);
      align-items: center;
    }
    .footer textarea { margin-bottom: 0; resize: none; flex: 1; }
    button.btn {
      flex: 1;
      padding: 5px 8px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
    }
    .btn-save { background: var(--db-amber); color: #1e1e2e; }
    .btn-cancel { background: var(--db-border); color: var(--db-text); flex: 0 0 auto; }
  `;

  /** The saved annotation. null = draft (unsaved, panel auto-opens). */
  @property({ attribute: false }) annotation: Annotation | null = null;
  /** Badge number shown to the user. */
  @property({ type: Number }) index = 0;

  // ── draft-mode state (populated by initDraft) ──────────────────────────
  @state() private _mode: ItemMode = 'create';
  @state() private _open = false;
  @state() private _draft = '';
  @state() private _replyDraft = '';
  @state() private _pendingId = '';
  @state() private _pendingSelectors: string[] = [];
  @state() private _pendingLabels: string[] = [];
  @state() private _pendingSource: AnnotationSource | null = null;
  @state() private _createdAt = 0;
  @state() private _showMenu = false;

  // ── badge + panel + preview position ────────────────────────────────────
  @state() private _badgeTop = -9999;
  @state() private _badgeLeft = -9999;
  @state() private _panelTop = -9999;
  @state() private _panelLeft = -9999;
  @state() private _previewTop = -9999;
  @state() private _previewLeft = -9999;
  @state() private _hovered = false;

  private _cleanupPanel: (() => void) | null = null;
  private _cleanupPreview: (() => void) | null = null;

  private _anchorEl: Element | null = null;

  // ────────────────────────────────────────────────────────────────────────
  // Public API (called by inspector.ts / bridge-panel.ts)
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Initialise as a draft item anchored to a DOM element.
   * Called immediately on Alt+Shift+click — before any annotation is saved.
   */
  initDraft(el: Element): void {
    this._anchorEl = el;
    this._pendingId = uid();
    this._pendingSelectors = [buildAnnotationSelector(el)];
    this._pendingLabels = [shortLabel(el)];
    this._pendingSource = null;
    this._draft = '';
    this._replyDraft = '';
    this._createdAt = Date.now();
    this._mode = 'create';
    this._open = true;
    this._showMenu = false;
    this._repositionBadge();
    this._focusTextarea();
  }

  /** Add source info to an open draft (called after code-inspector fires). */
  setDraftSource(source: AnnotationSource): void {
    if (this._mode === 'create') {
      this._pendingSource = source;
    }
  }

  /** Add another selector to an open draft. */
  addDraftSelector(el: Element): void {
    if (this._mode !== 'create') return;
    const sel = buildAnnotationSelector(el);
    if (!this._pendingSelectors.includes(sel)) {
      this._pendingSelectors = [...this._pendingSelectors, sel];
      this._pendingLabels = [...this._pendingLabels, shortLabel(el)];
    }
    // Update anchor to the latest element so badge tracks it
    this._anchorEl = el;
  }

  /** Open the panel (called from panel list row click). */
  openPanel(): void {
    this._open = true;
    this._repositionBadge();
    this._focusTextarea();
  }

  /** Register a tweak change as a reply on this annotation. */
  registerTweakReply(marker: string, value: string): void {
    if (!this.annotation || !this._open || this._mode !== 'view') return;
    const text = formatTweakReply(marker, value);
    const replies = this._normalizeReplies(this.annotation);
    const idx = replies.findIndex((r) => r.type === 'tweak' && r.text.startsWith(`Tweak ${marker} ->`));
    if (idx >= 0) {
      replies[idx] = { ...replies[idx], text, createdAt: Date.now() };
    } else {
      replies.push({ id: uid(), type: 'tweak', text, createdAt: Date.now() });
    }
    const linkedTweaks = [...(this.annotation.linkedTweaks ?? [])];
    const linkedIdx = linkedTweaks.findIndex((t) => t.marker === marker);
    if (linkedIdx >= 0) {
      linkedTweaks[linkedIdx] = { ...linkedTweaks[linkedIdx], lastValue: value, linkedAt: Date.now() };
    } else {
      linkedTweaks.push({ marker, lastValue: value, linkedAt: Date.now() });
    }
    const updated = this._buildAnnotation({ replies, linkedTweaks });
    this.annotation = updated;
    this.dispatchEvent(new CustomEvent<Annotation>('annotation-save', {
      detail: updated, bubbles: true, composed: true,
    }));
  }

  get isOpen(): boolean { return this._open; }

  // ────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ────────────────────────────────────────────────────────────────────────

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('pointerdown', this._onDocPointerDown, true);
    window.addEventListener('scroll', this._repositionBadge, { passive: true, capture: true });
    window.addEventListener('resize', this._repositionBadge, { passive: true });
    this._repositionBadge();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this._onDocPointerDown, true);
    window.removeEventListener('scroll', this._repositionBadge, true);
    window.removeEventListener('resize', this._repositionBadge);
    this._cleanupPanel?.();
    this._cleanupPanel = null;
    this._cleanupPreview?.();
    this._cleanupPreview = null;
    this._clearHighlight();
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('annotation') && this.annotation) {
      // Switched from draft → saved, or annotation data updated
      this._mode = 'view';
      this._repositionBadge();
    }
    if (changed.has('_open')) {
      if (this._open) {
        this._startPanelAutoUpdate();
        this._applyAutosize();
      } else {
        this._cleanupPanel?.();
        this._cleanupPanel = null;
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Positioning
  // ────────────────────────────────────────────────────────────────────────

  private _anchorRect(): DOMRect | null {
    // For saved annotations, look up target element via selectors
    const selectors = this.annotation?.selectors ?? this._pendingSelectors;
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el.getBoundingClientRect();
      } catch { /* bad selector */ }
    }
    // Fall back to the direct element reference (draft mode)
    return this._anchorEl?.getBoundingClientRect() ?? null;
  }

  private _repositionBadge = (): void => {
    const rect = this._anchorRect();
    if (!rect) { this._badgeTop = -9999; this._badgeLeft = -9999; return; }
    this._badgeTop = rect.top - 10;
    this._badgeLeft = rect.right - 8;
  };

  private _startPanelAutoUpdate(): void {
    this._cleanupPanel?.();
    this.updateComplete.then(() => {
      const panelEl = this.shadowRoot?.querySelector<HTMLElement>('.panel');
      const badgeEl = this.shadowRoot?.querySelector<HTMLElement>('.badge');
      if (!panelEl || !badgeEl) return;
      this._cleanupPanel = autoUpdate(badgeEl, panelEl, () => {
        computePosition(badgeEl, panelEl, {
          placement: 'right-start',
          strategy: 'fixed',
          middleware: [
            offset(8),
            flip({
              fallbackPlacements: ['left-start', 'bottom-start', 'top-start'],
              padding: 8,
            }),
            shift({ padding: 8 }),
          ],
        }).then(({ x, y }) => { this._panelLeft = x; this._panelTop = y; });
      });
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Focus
  // ────────────────────────────────────────────────────────────────────────

  private _applyAutosize(): void {
    const textareas = this.shadowRoot?.querySelectorAll<HTMLTextAreaElement>('textarea');
    if (textareas) autosize(textareas);
  }

  private _focusTextarea(): void {
    this.updateComplete.then(() => {
      const sel = this._mode === 'view' ? 'textarea[data-role="reply"]' : 'textarea[data-role="composer"]';
      const ta = this.shadowRoot?.querySelector<HTMLTextAreaElement>(sel);
      if (!ta) return;
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Highlight
  // ────────────────────────────────────────────────────────────────────────

  private _highlightRelated(): void {
    const selectors = this.annotation?.selectors ?? this._pendingSelectors;
    for (const sel of selectors) {
      try { document.querySelector(sel)?.setAttribute(HIGHLIGHT_ATTR, ''); } catch { /* skip */ }
    }
    if (!document.getElementById('db-badge-highlight-style')) {
      const s = document.createElement('style');
      s.id = 'db-badge-highlight-style';
      s.textContent = `[${HIGHLIGHT_ATTR}]{outline:2px solid #f59e0b!important;outline-offset:2px!important;}`;
      document.head.appendChild(s);
    }
  }

  private _clearHighlight(): void {
    document.querySelectorAll(`[${HIGHLIGHT_ATTR}]`).forEach((el) => el.removeAttribute(HIGHLIGHT_ATTR));
  }

  private _onBadgeMouseEnter = (): void => {
    this._highlightRelated();
    if (!this.annotation || this._open) return;
    this._hovered = true;
    this._startPreviewAutoUpdate();
  };

  private _onBadgeMouseLeave = (): void => {
    this._clearHighlight();
    this._hovered = false;
    this._cleanupPreview?.();
    this._cleanupPreview = null;
  };

  private _startPreviewAutoUpdate(): void {
    this._cleanupPreview?.();
    this.updateComplete.then(() => {
      const badgeEl = this.shadowRoot?.querySelector<HTMLElement>('.badge');
      const previewEl = this.shadowRoot?.querySelector<HTMLElement>('.badge-preview');
      if (!badgeEl || !previewEl) return;
      this._cleanupPreview = autoUpdate(badgeEl, previewEl, () => {
        computePosition(badgeEl, previewEl, {
          placement: 'right',
          strategy: 'fixed',
          middleware: [
            offset(8),
            flip({ fallbackPlacements: ['left', 'bottom', 'top'] }),
            shift({ padding: 8 }),
          ],
        }).then(({ x, y }) => { this._previewLeft = x; this._previewTop = y; });
      });
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Event handlers
  // ────────────────────────────────────────────────────────────────────────

  private _onBadgeClick(e: MouseEvent): void {
    e.stopPropagation();
    if (this._mode === 'view') {
      this._open = !this._open;
      if (this._open) this._focusTextarea();
    }
    // In create mode the panel is already open; clicking badge does nothing extra
  }

  private _onDocPointerDown = (e: PointerEvent): void => {
    if (!this._open) return;
    if (e.composedPath().includes(this)) return;
    // Alt+Shift click is an inspect-mode multi-select, not a dismiss action
    if (e.altKey && e.shiftKey) return;
    if (this._mode === 'view') {
      this._open = false;
      this._showMenu = false;
    }
    // In create mode, outside click = cancel
    if (this._mode === 'create') {
      this._cancelDraft();
    }
  };

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (this._showMenu) { this._showMenu = false; return; }
      if (this._mode === 'create') { this._cancelDraft(); return; }
      this._open = false;
    }
  };

  private _onComposerKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._saveNew(); }
  };

  private _onReplyKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._saveReply(); }
  };

  // ────────────────────────────────────────────────────────────────────────
  // Data helpers
  // ────────────────────────────────────────────────────────────────────────

  private _normalizeReplies(ann: Annotation): AnnotationReply[] {
    if (ann.replies && ann.replies.length > 0) return [...ann.replies];
    if (!ann.comment?.trim()) return [];
    return [{ id: `${ann.id}-root`, type: 'comment', text: ann.comment, createdAt: ann.createdAt ?? ann.timestamp }];
  }

  private _buildAnnotation(overrides?: {
    comment?: string;
    replies?: AnnotationReply[];
    linkedTweaks?: AnnotationTweakLink[];
  }): Annotation {
    const base = this.annotation;
    const replies = overrides?.replies ?? (base ? this._normalizeReplies(base) : []);
    const comment = overrides?.comment ?? base?.comment ?? this._draft.trim();
    const selectors = base?.selectors ?? [...this._pendingSelectors];
    const labels = base?.labels?.length ? [...base.labels] : (
      this._pendingLabels.length ? [...this._pendingLabels]
        : (this._pendingSource ? [`${this._pendingSource.file}:${this._pendingSource.line}`] : [])
    );
    return {
      id: base?.id ?? this._pendingId,
      selectors,
      labels,
      comment,
      pageUrl: location.href,
      timestamp: Date.now(),
      createdAt: (base?.createdAt ?? this._createdAt) || Date.now(),
      replies,
      linkedTweaks: overrides?.linkedTweaks ?? base?.linkedTweaks ?? [],
      ...(this._pendingSource ?? base?.source ? { source: this._pendingSource ?? base?.source } : {}),
    };
  }

  private _removeChip(index: number): void {
    this._pendingSelectors = this._pendingSelectors.filter((_, i) => i !== index);
    this._pendingLabels = this._pendingLabels.filter((_, i) => i !== index);
    if (this._pendingSelectors.length === 0 && !this._pendingSource) this._cancelDraft();
  }

  // ────────────────────────────────────────────────────────────────────────
  // Actions
  // ────────────────────────────────────────────────────────────────────────

  private _saveNew(): void {
    const text = this._draft.trim();
    if (!text) return;
    const ann = this._buildAnnotation({
      comment: text,
      replies: [{ id: uid(), type: 'comment', text, createdAt: Date.now() }],
    });
    this.annotation = ann;   // immediately switch to view mode
    this._mode = 'view';
    this._open = false;
    this.dispatchEvent(new CustomEvent<Annotation>('annotation-save', {
      detail: ann, bubbles: true, composed: true,
    }));
  }

  private _saveReply(): void {
    if (!this.annotation) return;
    const text = this._replyDraft.trim();
    if (!text) return;
    const replies = [...this._normalizeReplies(this.annotation), {
      id: uid(), type: 'comment' as const, text, createdAt: Date.now(),
    }];
    const updated = this._buildAnnotation({
      comment: replies[0]?.text ?? this.annotation.comment,
      replies,
      linkedTweaks: this.annotation.linkedTweaks ?? [],
    });
    this.annotation = updated;
    this._replyDraft = '';
    this.dispatchEvent(new CustomEvent<Annotation>('annotation-save', {
      detail: updated, bubbles: true, composed: true,
    }));
  }

  private _cancelDraft(): void {
    this.dispatchEvent(new CustomEvent('annotation-cancel', { bubbles: true, composed: true }));
    // inspector.ts will remove this element from the DOM
  }

  private _delete(): void {
    if (this.annotation) {
      this.dispatchEvent(new CustomEvent('annotation-delete', {
        detail: { id: this.annotation.id }, bubbles: true, composed: true,
      }));
    }
    this._showMenu = false;
    this._open = false;
  }

  private _resolve(): void {
    if (!this.annotation) return;
    this._showMenu = false;
    this.dispatchEvent(new CustomEvent('annotation-resolve', {
      detail: { id: this.annotation.id, tweakMarkers: (this.annotation.linkedTweaks ?? []).map((t) => t.marker) },
      bubbles: true, composed: true,
    }));
    this._open = false;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  private _renderHeader(): TemplateResult {
    if (this._mode === 'create') return html``;
    return html`
      <div class="header">
        <span class="header-title">Comment</span>
        <div class="menu-wrap">
          <button class="icon-btn" @click=${() => { this._showMenu = !this._showMenu; }} title="More options">···</button>
          ${this._showMenu ? html`
            <div class="overflow-menu">
              <button class="menu-item danger" @click=${this._delete}>Delete</button>
            </div>
          ` : ''}
        </div>
        <button class="icon-btn resolve" @click=${this._resolve} title="Resolve">✓</button>
        <button class="icon-btn close" @click=${() => { this._open = false; }} title="Close">✕</button>
      </div>
    `;
  }

  private _renderSendBtn(enabled: boolean, onClick: () => void): TemplateResult {
    if (!enabled) return html``;
    return html`<button class="icon-btn resolve" @click=${onClick} title="Send">↑</button>`;
  }

  private _renderReplies(): TemplateResult {
    if (!this.annotation) return html``;
    return html`${this._normalizeReplies(this.annotation).map((r) => html`
      <div class="comment-text">${r.text}</div>
      <div class="timestamp">${relativeTime(r.createdAt)}</div>
    `)}`;
  }

  private _renderChips(editable: boolean): TemplateResult {
    const selectors = this._mode === 'create' ? this._pendingSelectors : (this.annotation?.selectors ?? []);
    const source = this._mode === 'create' ? this._pendingSource : (this.annotation?.source ?? null);
    return html`
      ${selectors.length ? html`
        <div class="chips">
          ${selectors.map((sel, i) => html`
            <span class="chip" title=${sel}>
              ${sel}
              ${editable ? html`<button @click=${() => this._removeChip(i)}>×</button>` : ''}
            </span>
          `)}
        </div>
      ` : ''}
      ${source ? html`
        <div class="source-chip" title="${source.file}:${source.line}:${source.column}">
          📍 <span class="source-chip-label">${source.file}:${source.line}:${source.column}</span>
        </div>
      ` : ''}
    `;
  }

  private _renderBadgePreview(): TemplateResult {
    // Only show preview for saved annotations when the panel is closed
    if (!this.annotation || this._open) return html``;
    const comment = this.annotation.comment ?? '';
    const replies = this._normalizeReplies(this.annotation);
    const tweakCount = replies.filter((r) => r.type === 'tweak').length;
    // Subtract 1 for the root comment itself (shown as the preview text)
    const replyCount = replies.filter((r) => r.type !== 'tweak').length - 1;
    const parts: string[] = [];
    if (replyCount > 0) parts.push(`${replyCount} repl${replyCount === 1 ? 'y' : 'ies'}`);
    if (tweakCount) parts.push(`${tweakCount} tweak${tweakCount === 1 ? '' : 's'}`);
    return html`
      <div
        class="badge-preview${this._hovered ? ' visible' : ''}"
        style="top:${this._previewTop}px;left:${this._previewLeft}px"
      >
        <span class="badge-preview-text">${comment}</span>
        ${parts.length ? html`<div class="badge-preview-meta">${parts.join(' · ')}</div>` : ''}
      </div>
    `;
  }

  render(): TemplateResult {
    const isDraft = this._mode === 'create';
    const isResolved = !!this.annotation?.resolvedAt;
    const label = isResolved ? '✓' : `${this.index + 1}`;
    const canSendNew = this._draft.trim().length > 0;
    const canSendReply = this._replyDraft.trim().length > 0;

    return html`
      <!-- Badge dot -->
      <div
        class="badge${isResolved ? ' resolved' : isDraft ? ' draft' : ''}"
        style="top:${this._badgeTop}px;left:${this._badgeLeft}px"
        title=${this.annotation?.comment ?? this._pendingLabels.join(', ')}
        @mouseenter=${this._onBadgeMouseEnter}
        @mouseleave=${this._onBadgeMouseLeave}
        @click=${this._onBadgeClick}
      >${label}</div>

      <!-- Badge hover preview (floating-ui positioned) -->
      ${this._renderBadgePreview()}

      <!-- Thread panel -->
      <div
        class="panel"
        style="top:${this._panelTop}px;left:${this._panelLeft}px"
        ?hidden=${!this._open}
        @keydown=${this._onKeyDown}
      >
        ${this._renderHeader()}

        <div class="body">
          ${isDraft ? html`
            ${!this._pendingSource ? html`<div class="hint">Keep clicking elements to group them</div>` : ''}
            <textarea
              data-role="composer"
              placeholder="Add a comment"
              .value=${this._draft}
              @input=${(e: Event) => { this._draft = (e.target as HTMLTextAreaElement).value; }}
              @keydown=${this._onComposerKeyDown}
            ></textarea>
            ${this._renderChips(true)}
            <div class="footer">
              <button class="btn btn-cancel" @click=${this._cancelDraft}>Cancel</button>
              ${this._renderSendBtn(canSendNew, () => this._saveNew())}
            </div>
          ` : html`
            ${this._renderReplies()}
            ${this._renderChips(false)}
            <div class="footer">
              <textarea
                data-role="reply"
                placeholder="Reply"
                .value=${this._replyDraft}
                @input=${(e: Event) => { this._replyDraft = (e.target as HTMLTextAreaElement).value; }}
                @keydown=${this._onReplyKeyDown}
              ></textarea>
              ${this._renderSendBtn(canSendReply, () => this._saveReply())}
            </div>
          `}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'bridge-annotation-item': BridgeAnnotationItem; }
}
