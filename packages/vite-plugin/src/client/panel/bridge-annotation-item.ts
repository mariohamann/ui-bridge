import { LitElement, html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { computePosition, autoUpdate, flip, shift, offset } from '@floating-ui/dom';
import autosize from 'autosize';
import type { Annotation, AnnotationReply, AnnotationSource, AnnotationTweakLink } from '../../../shared/protocol.js';
import { annotationItemStyles } from './annotation-item-styles.js';
import { uid, buildAnnotationSelector, shortLabel, relativeTime, formatTweakReply } from './annotation-item-utils.js';

const HIGHLIGHT_ATTR = 'data-db-related';

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
  static styles = annotationItemStyles;

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
  @state() private _showPaths = false;

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
    this._highlightRelated();
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
    this._highlightRelated();
  }

  /** Open the panel (called from panel list row click). */
  openPanel(): void {
    this._open = true;
    this._repositionBadge();
    this._focusTextarea();
  }

  /** Register a tweak change as a reply on this annotation. */
  registerTweakReply(marker: string, value: string, label?: string): void {
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
      linkedTweaks.push({ marker, label, lastValue: value, linkedAt: Date.now() });
    }
    const updated = this._buildAnnotation({ replies, linkedTweaks });
    this.annotation = updated;
    this.dispatchEvent(new CustomEvent<Annotation>('annotation-save', {
      detail: updated, bubbles: true, composed: true,
    }));
  }

  get isOpen(): boolean { return this._open; }

  /** Number of selectors currently connected to this annotation (draft or saved). */
  get connectedSelectorCount(): number {
    return this._mode === 'create'
      ? this._pendingSelectors.length
      : (this.annotation?.selectors?.length ?? 0);
  }

  /** The source location attached to the open draft, or null if none yet. */
  get draftSource(): AnnotationSource | null {
    return this._mode === 'create' ? this._pendingSource : null;
  }

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
    this._clearHighlight();
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
    this._clearHighlight();
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
    this._showMenu = false;
    this._acceptAllTweaks();
  }

  private _acceptAllTweaks(): void {
    if (!this.annotation) return;
    this.dispatchEvent(new CustomEvent('annotation-accept-tweaks', {
      detail: { annotationId: this.annotation.id },
      bubbles: true, composed: true,
    }));
    this._open = false;
  }

  private _acceptOneTweak(marker: string): void {
    if (!this.annotation) return;
    this.dispatchEvent(new CustomEvent('tweak-accept', {
      detail: { annotationId: this.annotation.id, marker },
      bubbles: true, composed: true,
    }));
  }

  private _dismissTweak(marker: string): void {
    if (!this.annotation) return;
    this.dispatchEvent(new CustomEvent('tweak-dismiss', {
      detail: { annotationId: this.annotation.id, marker },
      bubbles: true, composed: true,
    }));
  }

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  private _renderTweaksSection(): TemplateResult {
    const tweaks = this.annotation?.linkedTweaks ?? [];
    if (!tweaks.length) return html``;
    return html`
      <div class="tweaks-section">
        <div class="tweaks-section-header">
          <span class="tweaks-section-title">Tweaks</span>
          <button class="tweak-accept-all" @click=${this._acceptAllTweaks} title="Accept all tweaks and resolve annotation">Accept all ✓</button>
        </div>
        ${tweaks.map((t) => html`
          <div class="tweak-row">
            <span class="tweak-label">${t.label ?? t.marker}</span>
            <span class="tweak-value">${t.lastValue}</span>
            <button class="tweak-btn accept" @click=${() => this._acceptOneTweak(t.marker)} title="Accept this tweak">✓</button>
            <button class="tweak-btn dismiss" @click=${() => this._dismissTweak(t.marker)} title="Dismiss this tweak">✕</button>
          </div>
        `)}
      </div>
    `;
  }

  private _renderHeader(): TemplateResult {
    if (this._mode === 'create') return html``;
    return html`
      <div class="header">
        <span class="header-title">Comment</span>
        <div class="menu-wrap">
          <button class="icon-btn" @click=${() => { this._showMenu = !this._showMenu; }} title="More options">···</button>
          ${this._showMenu ? html`
            <div class="overflow-menu">
              <button class="menu-item" @click=${() => { this._showPaths = !this._showPaths; this._showMenu = false; }}>${this._showPaths ? 'Hide paths' : 'Show paths'}</button>
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
    return html`<button class="send-btn" ?disabled=${!enabled} @click=${enabled ? onClick : undefined} title="Send">↑</button>`;
  }

  private _renderReplies(): TemplateResult {
    if (!this.annotation) return html``;
    return html`${this._normalizeReplies(this.annotation).map((r) => html`
      <div class="comment-text">${r.text}</div>
      <div class="timestamp">${relativeTime(r.createdAt)}</div>
    `)}`;
  }

  private _renderChipsBar(editable: boolean): TemplateResult {
    const selectors = this._mode === 'create' ? this._pendingSelectors : (this.annotation?.selectors ?? []);
    const source = this._mode === 'create' ? this._pendingSource : (this.annotation?.source ?? null);
    if (!editable && !this._showPaths) return html``;
    if (!selectors.length && !source) return html``;
    return html`
      <div class="chips-bar">
        ${selectors.map((sel, i) => html`
          <span class="chip" title=${sel}>
            ${sel}
            ${editable ? html`<button @click=${() => this._removeChip(i)}>×</button>` : ''}
          </span>
        `)}
        ${source ? html`
          <div class="source-chip" title="${source.file}:${source.line}:${source.column}">
            📍 <span class="source-chip-label">${source.file}:${source.line}:${source.column}</span>
          </div>
        ` : ''}
      </div>
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
        ${!isDraft ? this._renderChipsBar(false) : ''}

        ${!isDraft ? html`
        <div class="body">
            ${this._renderReplies()}
        </div>
        ` : ''}

        ${!isDraft ? this._renderTweaksSection() : ''}

        <div class="composer">
          <div class="composer-inner">
          <textarea
            data-role=${isDraft ? 'composer' : 'reply'}
            placeholder=${isDraft ? 'Add a comment\u2026' : 'Reply\u2026'}
            .value=${isDraft ? this._draft : this._replyDraft}
            @input=${(e: Event) => {
        const v = (e.target as HTMLTextAreaElement).value;
        if (isDraft) this._draft = v; else this._replyDraft = v;
      }}
            @keydown=${isDraft ? this._onComposerKeyDown : this._onReplyKeyDown}
          ></textarea>
          <div class="composer-row">
            ${isDraft
        ? this._renderSendBtn(canSendNew, () => this._saveNew())
        : this._renderSendBtn(canSendReply, () => this._saveReply())}
          </div>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'bridge-annotation-item': BridgeAnnotationItem; }
}
