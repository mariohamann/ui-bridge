import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js';
import '@awesome.me/webawesome/dist/components/dropdown/dropdown.js';
import '@awesome.me/webawesome/dist/components/tag/tag.js';
import autosize from 'autosize';
import type {
  Comment,
  CommentReply,
  CommentSource,
  CommentTweakLink,
  TweakKnob,
} from '@design-bridge/protocol';
import { knobsSignal } from '../state/knobs-store.js';
import './db-knob.js';
import { LitElement, html, type TemplateResult } from 'lit';
import { commentItemStyles } from './db-comment.styles.js';
import { computePosition, autoUpdate, flip, shift, offset } from '@floating-ui/dom';
import { customElement, property, state } from 'lit/decorators.js';
import { dispatchIntent } from '../state/intents.js';
import { uid, shortLabel, formatTweakReply } from './db-comment.utils.js';
import { DB_HIGHLIGHT_COLOR } from '../styles/tokens.js';

const HIGHLIGHT_ATTR = 'data-db-related';

type ItemMode = 'create' | 'view';

/**
 * db-comment — one web component per comment.
 *
 * Contains both the badge dot and the comment thread panel in a single shadow
 * DOM. The host element is `position:fixed; width:0; height:0` so it takes no
 * space. The badge and panel float inside via inline `position:fixed` styles.
 *
 * Modes:
 *  - create: comment === null, opened immediately on Alt+Shift+click
 *  - view:   comment is set, panel opens/closes on badge click
 */
@customElement('db-comment')
export class DbComment extends LitElement {
  static styles = commentItemStyles;

  /** The saved comment. null = draft (unsaved, panel auto-opens). */
  @property({ attribute: false }) comment: Comment | null = null;
  /** Badge number shown to the user. */
  @property({ type: Number }) index = 0;

  // ── draft-mode state (populated by initDraft) ──────────────────────────
  @state() private _mode: ItemMode = 'create';
  @state() private _open = false;
  @state() private _draft = '';
  @state() private _replyDraft = '';
  @state() private _wobbling = false;
  @state() private _pendingId = '';
  @state() private _pendingSelectors: string[] = [];
  @state() private _pendingLabels: string[] = [];
  @state() private _pendingSource: CommentSource | null = null;
  @state() private _createdAt = 0;
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
  private _pendingElements: Set<Element> = new Set();

  // ────────────────────────────────────────────────────────────────────────
  // Public API (called by inspector.ts)
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Initialise as a draft item anchored to a DOM element.
   * Called immediately on Alt+Shift+click — before any comment is saved.
   * The caller (inspector) must provide a pre-computed CSS selector string.
   */
  initDraft(el: Element, selector: string): void {
    this._anchorEl = el;
    this._pendingId = uid();
    this._pendingSelectors = [selector];
    this._pendingLabels = [shortLabel(el)];
    this._pendingElements = new Set([el]);
    this._pendingSource = null;
    this._draft = '';
    this._replyDraft = '';
    this._createdAt = Date.now();
    this._mode = 'create';
    this._open = true;

    this._repositionBadge();
    this._highlightRelated();
    this._focusTextarea();
  }

  /** Add source info to an open draft (called after code-inspector fires). */
  setDraftSource(source: CommentSource): void {
    if (this._mode === 'create') {
      this._pendingSource = source;
    }
  }

  /** Add another selector to an open draft. Caller provides the pre-computed selector. */
  addDraftSelector(el: Element, selector: string): void {
    if (this._mode !== 'create') return;
    // Deduplicate by element reference (selector strings can differ between calls)
    if (!this._pendingElements.has(el) && !this._pendingSelectors.includes(selector)) {
      this._pendingElements.add(el);
      this._pendingSelectors = [...this._pendingSelectors, selector];
      this._pendingLabels = [...this._pendingLabels, shortLabel(el)];
    }
    // Update anchor to the latest element so badge tracks it
    this._anchorEl = el;
    this._highlightRelated();
  }

  /** Whether the user has unsaved text in the composer or reply box. */
  get hasDirtyDraft(): boolean {
    return this._draft.trim().length > 0 || this._replyDraft.trim().length > 0;
  }

  /** Open the panel (called from inspector). */
  openPanel(): void {
    this._open = true;
    this._wobbling = false;
    this._repositionBadge();
    this._focusTextarea();
  }

  /** Close without discarding the comment. */
  closePanel(): void {
    this._open = false;
  }

  /** Close and discard any unsaved draft text. */
  discardDraftAndClose(): void {
    this._replyDraft = '';
    this._draft = '';
    this.closePanel();
  }

  /** Play a short wobble to signal the panel cannot be dismissed yet. */
  wobble(): void {
    this._wobbling = false;
    // Force reflow so re-triggering the animation works
    void this.shadowRoot?.querySelector('.panel')?.getBoundingClientRect();
    this._wobbling = true;
    setTimeout(() => {
      this._wobbling = false;
    }, 420);
  }

  /** Register a tweak change as a reply on this comment. */
  registerTweakReply(marker: string, value: string, _label?: string): void {
    if (!this.comment || !this._open || this._mode !== 'view') return;
    const text = formatTweakReply(marker, value);
    const replies = this._normalizeReplies(this.comment);
    const idx = replies.findIndex(
      (r) => r.type === 'tweak' && r.text.startsWith(`Tweak ${marker} ->`),
    );
    if (idx >= 0) {
      replies[idx] = { ...replies[idx], text, createdAt: Date.now() };
    } else {
      replies.push({ id: uid(), type: 'tweak', text, createdAt: Date.now() });
    }
    const updated = this._buildComment({ replies });
    this.comment = updated;
    dispatchIntent({ type: 'comment:save', comment: updated });
  }

  get isOpen(): boolean {
    return this._open;
  }

  /** Number of selectors currently connected to this comment (draft or saved). */
  get connectedSelectorCount(): number {
    return this._mode === 'create'
      ? this._pendingSelectors.length
      : (this.comment?.selectors?.length ?? 0);
  }

  /** The source location attached to the open draft, or null if none yet. */
  get draftSource(): CommentSource | null {
    return this._mode === 'create' ? this._pendingSource : null;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ────────────────────────────────────────────────────────────────────────

  connectedCallback(): void {
    super.connectedCallback();
    this.classList.add('wa-dark');
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
    if (changed.has('comment') && this.comment) {
      // Switched from draft → saved, or comment data updated
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
    // For saved comments, look up target element via selectors
    const selectors = this.comment?.selectors ?? this._pendingSelectors;
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el.getBoundingClientRect();
      } catch {
        /* bad selector */
      }
    }
    // Fall back to the direct element reference (draft mode)
    return this._anchorEl?.getBoundingClientRect() ?? null;
  }

  private _repositionBadge = (): void => {
    const rect = this._anchorRect();
    if (!rect) {
      this._badgeTop = -9999;
      this._badgeLeft = -9999;
      return;
    }
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
        }).then(({ x, y }) => {
          this._panelLeft = x;
          this._panelTop = y;
        });
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
      const sel =
        this._mode === 'view' ? 'textarea[data-role="reply"]' : 'textarea[data-role="composer"]';
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
    const selectors = this.comment?.selectors ?? this._pendingSelectors;
    for (const sel of selectors) {
      try {
        document.querySelector(sel)?.setAttribute(HIGHLIGHT_ATTR, '');
      } catch {
        /* skip */
      }
    }
    if (!document.getElementById('db-badge-highlight-style')) {
      const s = document.createElement('style');
      s.id = 'db-badge-highlight-style';
      s.textContent = `[${HIGHLIGHT_ATTR}]{outline:2px solid ${DB_HIGHLIGHT_COLOR}!important;outline-offset:2px!important;}`;
      document.head.appendChild(s);
    }
  }

  private _clearHighlight(): void {
    document
      .querySelectorAll(`[${HIGHLIGHT_ATTR}]`)
      .forEach((el) => el.removeAttribute(HIGHLIGHT_ATTR));
  }

  private _onBadgeMouseEnter = (): void => {
    this._highlightRelated();
    if (!this.comment || this._open) return;
    this._hovered = true;
    this._startPreviewAutoUpdate();
  };

  private _onBadgeMouseLeave = (): void => {
    // Only clear highlights when not in draft mode — in create mode the highlights
    // represent selected elements and must persist until the draft is saved/cancelled.
    if (this._mode !== 'create') this._clearHighlight();
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
        }).then(({ x, y }) => {
          this._previewLeft = x;
          this._previewTop = y;
        });
      });
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Event handlers
  // ────────────────────────────────────────────────────────────────────────

  private _onBadgeClick(e: MouseEvent): void {
    e.stopPropagation();
    if (this._mode === 'view') {
      dispatchIntent({ type: 'comment:badge-click', id: this.comment!.id });
    }
    // In create mode the panel is already open; clicking badge does nothing extra
  }

  private _onDocPointerDown = (e: PointerEvent): void => {
    if (!this._open) return;
    if (e.composedPath().includes(this)) return;
    // Alt+Shift click is an inspect-mode multi-select, not a dismiss action
    if (e.altKey && e.shiftKey) return;
    if (this._mode === 'view') {
      if (this.hasDirtyDraft) {
        this.wobble();
        return;
      }
      this._open = false;
    }
    // In create mode, outside click = cancel
    if (this._mode === 'create') {
      this._cancelDraft();
    }
  };

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (this._mode === 'create') {
        this._cancelDraft();
        return;
      }
      this._open = false;
    }
  };

  private _onComposerKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._saveNew();
    }
  };

  private _onReplyKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._saveReply();
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // Data helpers
  // ────────────────────────────────────────────────────────────────────────

  private _normalizeReplies(ann: Comment): CommentReply[] {
    if (ann.replies && ann.replies.length > 0) return [...ann.replies];
    if (!ann.comment?.trim()) return [];
    return [
      {
        id: `${ann.id}-root`,
        type: 'comment',
        text: ann.comment,
        createdAt: ann.createdAt ?? ann.timestamp,
      },
    ];
  }

  private _buildComment(overrides?: {
    comment?: string;
    replies?: CommentReply[];
    linkedTweaks?: CommentTweakLink[];
  }): Comment {
    const base = this.comment;
    const replies = overrides?.replies ?? (base ? this._normalizeReplies(base) : []);
    const comment = overrides?.comment ?? base?.comment ?? this._draft.trim();
    const selectors = base?.selectors ?? [...this._pendingSelectors];
    const labels = base?.labels?.length
      ? [...base.labels]
      : this._pendingLabels.length
        ? [...this._pendingLabels]
        : this._pendingSource
          ? [`${this._pendingSource.file}:${this._pendingSource.line}`]
          : [];
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
      ...(base?.knob ? { knob: base.knob } : {}),
      ...(base?.actions ? { actions: base.actions } : {}),
      ...((this._pendingSource ?? base?.source)
        ? { source: this._pendingSource ?? base?.source }
        : {}),
    };
  }

  private _removeChip(index: number): void {
    const elArr = [...this._pendingElements];
    if (elArr[index]) this._pendingElements.delete(elArr[index]);
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
    const ann = this._buildComment({
      comment: text,
      replies: [{ id: uid(), type: 'comment', text, createdAt: Date.now() }],
    });
    this.comment = ann; // immediately switch to view mode
    this._mode = 'view';
    this._draft = '';
    this._open = false;
    dispatchIntent({ type: 'comment:save', comment: ann });
  }

  private _saveReply(): void {
    if (!this.comment) return;
    const text = this._replyDraft.trim();
    if (!text) return;
    const replies = [
      ...this._normalizeReplies(this.comment),
      {
        id: uid(),
        type: 'comment' as const,
        text,
        createdAt: Date.now(),
      },
    ];
    const updated = this._buildComment({
      comment: replies[0]?.text ?? this.comment.comment,
      replies,
      linkedTweaks: this.comment.linkedTweaks ?? [],
    });
    this.comment = updated;
    this._replyDraft = '';
    dispatchIntent({ type: 'comment:save', comment: updated });
  }

  private _cancelDraft(): void {
    this._clearHighlight();
    dispatchIntent({ type: 'comment:cancel', id: this._pendingId });
    // inspector.ts will remove this element from the DOM
  }

  private _delete(): void {
    if (this.comment) {
      dispatchIntent({ type: 'comment:delete', id: this.comment.id });
    }
    this._open = false;
  }

  private _copyReviewLink(): void {
    const wsUrl = (window as unknown as Record<string, unknown>).__DB_WS_URL__ as
      | string
      | undefined;
    const url = wsUrl
      ? wsUrl.replace(/^ws:\/\//, 'http://').replace(/\/design-bridge$/, '/')
      : `http://${location.host}/`;
    navigator.clipboard.writeText(url).catch(() => {});
  }

  private _resolve(): void {
    if (!this.comment) return;
    dispatchIntent({ type: 'comment:delete', id: this.comment.id });
    this._open = false;
  }

  private _acceptAllTweaks(): void {
    if (!this.comment) return;
    dispatchIntent({ type: 'tweak:accept-comment', commentId: this.comment.id });
    this._open = false;
  }

  private _discardTweak(): void {
    if (!this.comment) return;
    dispatchIntent({ type: 'tweak:discard-comment', commentId: this.comment.id });
  }

  private _onKnobChange(e: CustomEvent<{ value: string | number | boolean }>): void {
    if (!this.comment) return;
    dispatchIntent({
      type: 'tweak:change',
      marker: this.comment.id,
      value: String(e.detail.value),
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  private _renderTweaksSection(): TemplateResult {
    const knobDef = this.comment?.knob;
    if (!knobDef) return html``;
    // Build a TweakKnob using the live value from knobsSignal when available.
    const liveKnob = knobsSignal.get().find((k) => k.marker === this.comment!.id);
    const knob: TweakKnob = liveKnob ?? {
      marker: this.comment!.id,
      commentId: this.comment!.id,
      ...knobDef,
    };
    return html`
      <div class="tweaks-section">
        <div class="tweaks-section-header">
          <span class="tweaks-section-title">Tweak</span>
          <wa-button
            appearance="outlined"
            variant="success"
            size="s"
            @click=${this._acceptAllTweaks}
            title="Accept tweak and resolve comment"
            >Accept ✓</wa-button
          >
          <wa-button
            appearance="outlined"
            variant="warning"
            size="s"
            @click=${this._discardTweak}
            title="Discard tweak"
            >Discard ✕</wa-button
          >
        </div>
        <div class="tweak-row">
          <span class="tweak-label">${knobDef.label}</span>
          <db-knob .knob=${knob} @db-knob-change=${this._onKnobChange}></db-knob>
        </div>
      </div>
    `;
  }

  private _renderHeader(): TemplateResult {
    if (this._mode === 'create') return html``;
    return html`
      <div class="header">
        <span class="header-title">Comment</span>
        <wa-dropdown
          size="s"
          @wa-select=${(e: CustomEvent) => {
            const val = e.detail.item.value;
            if (val === 'paths') {
              this._showPaths = !this._showPaths;
            } else if (val === 'copy-link') {
              this._copyReviewLink();
            } else if (val === 'delete') {
              this._delete();
            }
          }}
        >
          <wa-button slot="trigger" appearance="plain" size="s" title="More options">···</wa-button>
          <wa-dropdown-item value="paths"
            >${this._showPaths ? 'Hide paths' : 'Show paths'}</wa-dropdown-item
          >
          <wa-dropdown-item value="copy-link">Copy link to comment list</wa-dropdown-item>
          <wa-divider></wa-divider>
          <wa-dropdown-item value="delete" variant="danger">Delete</wa-dropdown-item>
        </wa-dropdown>
        <wa-button appearance="plain" size="s" title="Resolve" @click=${this._resolve}>✓</wa-button>
        <wa-button
          appearance="plain"
          size="s"
          title="Close"
          @click=${() => {
            this._open = false;
          }}
          >✕</wa-button
        >
      </div>
    `;
  }

  private _renderSendBtn(enabled: boolean, onClick: () => void): TemplateResult {
    return html`<wa-button
      appearance="filled"
      variant="brand"
      size="s"
      ?disabled=${!enabled}
      @click=${enabled ? onClick : undefined}
      title="Send"
      >↑</wa-button
    >`;
  }

  private _renderReplies(): TemplateResult {
    if (!this.comment) return html``;
    return html`${this._normalizeReplies(this.comment).map(
      (r) => html`
        <div class="comment-text">${r.text}</div>
        <wa-relative-time
          sync
          .date=${new Date(r.createdAt)}
          style="font-size:var(--wa-font-size-xs);color:var(--wa-color-text-quiet);display:block;margin-bottom:var(--wa-space-s);"
        ></wa-relative-time>
      `,
    )}`;
  }

  private _renderChipsBar(editable: boolean): TemplateResult {
    const selectors =
      this._mode === 'create' ? this._pendingSelectors : (this.comment?.selectors ?? []);
    const source = this._mode === 'create' ? this._pendingSource : (this.comment?.source ?? null);
    if (!editable && !this._showPaths) return html``;
    if (!selectors.length && !source) return html``;
    return html`
      <div class="chips-bar">
        ${selectors.map(
          (sel, i) => html`
            <wa-tag
              variant="brand"
              appearance="outlined"
              size="s"
              title=${sel}
              style="font-family:var(--wa-font-family-code);max-width:160px;overflow:hidden;text-overflow:ellipsis;"
              ?with-remove=${editable}
              @wa-remove=${editable
                ? (e: Event) => {
                    e.stopPropagation();
                    this._removeChip(i);
                  }
                : undefined}
            >
              ${sel}
            </wa-tag>
          `,
        )}
        ${source
          ? html`
              <wa-tag
                variant="brand"
                appearance="outlined"
                size="s"
                title="${source.file}:${source.line}:${source.column}"
                style="font-family:var(--wa-font-family-code);max-width:200px;overflow:hidden;text-overflow:ellipsis;"
                >📍 ${source.file}:${source.line}:${source.column}</wa-tag
              >
            `
          : ''}
      </div>
    `;
  }

  private _renderBadgePreview(): TemplateResult {
    if (!this.comment || this._open) return html``;
    const comment = this.comment.comment ?? '';
    const replies = this._normalizeReplies(this.comment);
    const tweakCount = replies.filter((r) => r.type === 'tweak').length;
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
    const isResolved = !!this.comment?.resolvedAt;
    const label = isResolved ? '✓' : `${this.index + 1}`;
    const canSendNew = this._draft.trim().length > 0;
    const canSendReply = this._replyDraft.trim().length > 0;

    const badgeVariant = isResolved ? 'success' : 'brand';

    return html`
      <!-- Badge dot -->
      <wa-badge
        variant=${badgeVariant}
        appearance="filled"
        pill="true"
        class="badge${isResolved ? ' resolved' : isDraft ? ' draft' : ''}"
        style="position:fixed;top:${this._badgeTop}px;left:${this._badgeLeft}px"
        title=${this.comment?.comment ?? this._pendingLabels.join(', ')}
        @mouseenter=${this._onBadgeMouseEnter}
        @mouseleave=${this._onBadgeMouseLeave}
        @click=${this._onBadgeClick}
        >${label}</wa-badge
      >

      <!-- Badge hover preview (floating-ui positioned) -->
      ${this._renderBadgePreview()}

      <!-- Thread panel -->
      <div
        class="panel ${this._wobbling ? 'wobble' : ''}"
        style="top:${this._panelTop}px;left:${this._panelLeft}px"
        ?hidden=${!this._open}
        @keydown=${this._onKeyDown}
      >
        <div class="panel-scroll">
          ${this._renderHeader()} ${!isDraft ? this._renderChipsBar(false) : ''}
          ${!isDraft ? html` <div class="body">${this._renderReplies()}</div> ` : ''}
          ${!isDraft ? this._renderTweaksSection() : ''}

          <div class="composer">
            <div class="composer-inner">
              <textarea
                data-role=${isDraft ? 'composer' : 'reply'}
                placeholder=${isDraft ? 'Add a comment\u2026' : 'Reply\u2026'}
                .value=${isDraft ? this._draft : this._replyDraft}
                @input=${(e: Event) => {
                  const v = (e.target as HTMLTextAreaElement).value;
                  if (isDraft) this._draft = v;
                  else this._replyDraft = v;
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
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'db-comment': DbComment;
  }
}
