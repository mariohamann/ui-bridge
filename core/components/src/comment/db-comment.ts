import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js';
import '@awesome.me/webawesome/dist/components/dropdown/dropdown.js';
import '@awesome.me/webawesome/dist/components/tag/tag.js';
import '@awesome.me/webawesome/dist/components/textarea/textarea.js';
import type {
  CommentThread,
  CommentElement,
  CommentEntry,
  TextCommentEntry,
  TweakCommentEntry,
  CommentSource,
  TweakKnob,
} from '@design-bridge/protocol';
import { knobsSignal } from '../state/knobs-store.js';
import './db-knob.js';
import { LitElement, html, type TemplateResult } from 'lit';
import { commentItemStyles } from './db-comment.styles.js';
import { computePosition, autoUpdate, flip, shift, offset } from '@floating-ui/dom';
import { customElement, property, state } from 'lit/decorators.js';
import { dispatchIntent } from '../state/intents.js';
import { markOrphaned, markUnorphaned } from '../state/comments-store.js';
import { uid, parseElement, shortLabel, formatTweakReply } from './db-comment.utils.js';
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
  @property({ attribute: false }) comment: CommentThread | null = null;
  /** Badge number shown to the user. */
  @property({ type: Number }) index = 0;
  /**
   * When true the badge flows in the parent layout (position:relative) instead
   * of being absolutely placed via _repositionBadge. Used by db-comment-bar.
   */
  @property({ type: Boolean }) docked = false;
  /**
   * When true, badge clicks dispatch `comment:bar-click` instead of toggling
   * the panel. Used for bar badge instances where the real panel lives on the
   * anchored db-comment in #db-items.
   */
  @property({ type: Boolean }) orphaned = false;

  // ── draft-mode state (populated by initDraft) ──────────────────────────
  @state() private _mode: ItemMode = 'create';
  @state() private _open = false;
  @state() private _draft = '';
  @state() private _replyDraft = '';
  @state() private _wobbling = false;
  @state() private _pendingId = '';
  @state() private _pendingElements: CommentElement[] = [];
  @state() private _pendingSource: CommentSource | null = null;
  @state() private _createdAt = 0;
  @state() private _showPaths = false;
  @state() private _editingReplyId: string | null = null;
  @state() private _editDraft = '';

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
  private _pendingDomElements: Set<Element> = new Set();

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
    this._pendingElements = [parseElement(el, selector)];
    this._pendingDomElements = new Set([el]);
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
    // Deduplicate by element reference
    if (!this._pendingDomElements.has(el)) {
      this._pendingDomElements.add(el);
      this._pendingElements = [...this._pendingElements, parseElement(el, selector)];
    }
    // Update anchor to the latest element so badge tracks it
    this._anchorEl = el;
    this._highlightRelated();
  }

  /** Whether the user has unsaved text in the composer or reply box. */
  get hasDirtyDraft(): boolean {
    return this._draft.trim().length > 0 || this._replyDraft.trim().length > 0;
  }

  /** Returns true if the thread has an agent reply not yet read by the user. */
  private _hasUnread(): boolean {
    const thread = this.comment;
    if (!thread) return false;
    const lastReadAt = thread.meta.lastReadAt ?? 0;
    return thread.comments.some((e) => e.author === 'agent' && e.createdAt > lastReadAt);
  }

  /** Open the panel (called from inspector). */
  openPanel(): void {
    this._open = true;
    this._wobbling = false;
    this._repositionBadge();
    this._focusTextarea();
    if (this.comment) {
      dispatchIntent({ type: 'comment:read', id: this.comment.meta.id });
      this._scrollToFirstUnread();
    }
  }

  /** Scroll the panel to the first unread agent reply after render. */
  private _scrollToFirstUnread(): void {
    const thread = this.comment;
    if (!thread) return;
    const lastReadAt = thread.meta.lastReadAt ?? 0;
    const firstUnread = thread.comments.find(
      (e) => e.author === 'agent' && e.createdAt > lastReadAt,
    );
    if (!firstUnread) return;
    void this.updateComplete.then(() => {
      const row = this.renderRoot.querySelector<HTMLElement>(`[data-entry-id="${firstUnread.id}"]`);
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
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
    const comments = this._getComments(this.comment);
    const idx = comments.findIndex(
      (r) => r.type === 'comment' && r.text.startsWith(`Tweak ${marker} ->`),
    );
    let updated: CommentEntry[];
    if (idx >= 0) {
      updated = comments.map((r, i) => (i === idx ? { ...r, text, createdAt: Date.now() } : r));
    } else {
      const entry: TextCommentEntry = { id: uid(), type: 'comment', text, createdAt: Date.now() };
      updated = [...comments, entry];
    }
    const thread = this._buildThread({ comments: updated });
    this.comment = thread;
    dispatchIntent({ type: 'comment:save', comment: thread });
  }

  get isOpen(): boolean {
    return this._open;
  }

  /** Number of selectors currently connected to this comment (draft or saved). */
  get connectedSelectorCount(): number {
    return this._mode === 'create'
      ? this._pendingElements.length
      : (this.comment?.elements?.length ?? 0);
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
    if (this.comment?.meta.id) markUnorphaned(this.comment.meta.id);
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('comment') && this.comment) {
      // Switched from draft → saved, or comment data updated
      this._mode = 'view';
      this._repositionBadge();
    }
    if (changed.has('_open') || changed.has('_hovered')) {
      this.toggleAttribute('panel-open', this._open || this._hovered);
    }
    if (changed.has('_open')) {
      if (this._open) {
        this._startPanelAutoUpdate();
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
    const selectors =
      this.comment?.elements?.map((e) => e.minimalSelector) ??
      this._pendingElements.map((e) => e.minimalSelector);
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
    if (this.docked) return;
    const rect = this._anchorRect();
    if (!rect) {
      this._badgeTop = -9999;
      this._badgeLeft = -9999;
      if (this.comment?.meta.id) markOrphaned(this.comment.meta.id);
      return;
    }
    if (this.comment?.meta.id) markUnorphaned(this.comment.meta.id);
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

  private _focusTextarea(): void {
    this.updateComplete.then(() => {
      const sel =
        this._mode === 'view'
          ? 'wa-textarea[data-role="reply"]'
          : 'wa-textarea[data-role="composer"]';
      const ta = this.shadowRoot?.querySelector<HTMLElement>(sel);
      if (!ta) return;
      (ta as HTMLElement & { focus: (opts?: FocusOptions) => void }).focus({ preventScroll: true });
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Highlight
  // ────────────────────────────────────────────────────────────────────────

  private _highlightRelated(): void {
    const selectors =
      this.comment?.elements?.map((e) => e.minimalSelector) ??
      this._pendingElements.map((e) => e.minimalSelector);
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
      if (this.orphaned) {
        dispatchIntent({ type: 'comment:bar-click', id: this.comment!.meta.id });
        return;
      }
      dispatchIntent({ type: 'comment:badge-click', id: this.comment!.meta.id });
    }
    // In create mode the panel is already open; clicking badge does nothing extra
  }

  private _onDocPointerDown = (e: PointerEvent): void => {
    if (!this._open) return;
    if (e.composedPath().includes(this)) {
      // The click landed inside this component's shadow DOM (panel, badge, dropdown, etc.).
      // Exception: our elevated z-index panel can physically cover another db-comment's badge.
      // If the click coordinates land on a sibling badge, treat it as an outside click and
      // forward the intent so the other panel opens in the same interaction.
      const otherId = this._otherBadgeIdAt(e.clientX, e.clientY);
      if (otherId) {
        if (this._mode === 'view') {
          if (this.hasDirtyDraft) {
            this.wobble();
            return;
          }
          this._open = false;
          dispatchIntent({ type: 'comment:badge-click', id: otherId });
        }
      }
      return;
    }
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

  private _otherBadgeIdAt(x: number, y: number): string | null {
    const siblings = document.querySelectorAll<Element>('db-comment');
    for (const el of siblings) {
      if (el === this) continue;
      const badge = el.shadowRoot?.querySelector<HTMLElement>('wa-button.badge');
      if (!badge) continue;
      const r = badge.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return (el as DbComment).comment?.meta.id ?? null;
      }
    }
    return null;
  }

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

  private _getComments(thread: CommentThread): CommentEntry[] {
    return [...thread.comments];
  }

  /** Get the first text entry's text from a thread (for previews/display). */
  private _firstText(thread: CommentThread): string {
    return thread.comments.find((c) => c.type === 'comment')?.text ?? '';
  }

  /** Get the active (most recent pending) tweak entry, if any. */
  private _activeTweak(thread: CommentThread): TweakCommentEntry | undefined {
    return [...thread.comments]
      .reverse()
      .find((c): c is TweakCommentEntry => c.type === 'tweak' && c.tweakStatus === 'pending');
  }

  /** Get the most recent tweak entry (any status) for status badge display. */
  private _latestTweak(thread: CommentThread): TweakCommentEntry | undefined {
    return [...thread.comments].reverse().find((c): c is TweakCommentEntry => c.type === 'tweak');
  }

  private _buildThread(overrides?: { comments?: CommentEntry[] }): CommentThread {
    const base = this.comment;
    const comments = overrides?.comments ?? (base ? this._getComments(base) : []);
    const elements = base?.elements?.length
      ? [...base.elements]
      : this._pendingElements.length
        ? [...this._pendingElements]
        : [];
    // Attach source from pending to the first element if not already set
    const elementsWithSource: typeof elements = this._pendingSource
      ? elements.map((el, i) =>
          i === 0 && !el.source
            ? {
                ...el,
                source: {
                  file: this._pendingSource!.file,
                  line: this._pendingSource!.line,
                  column: this._pendingSource!.column,
                },
              }
            : el,
        )
      : elements;
    return {
      meta: {
        id: base?.meta?.id ?? this._pendingId,
        pageUrl: location.href,
        timestamp: Date.now(),
        createdAt: (base?.meta?.createdAt ?? this._createdAt) || Date.now(),
        ...(base?.meta?.resolvedAt ? { resolvedAt: base.meta.resolvedAt } : {}),
      },
      elements: elementsWithSource,
      comments,
    };
  }

  private _removeChip(index: number): void {
    const elArr = [...this._pendingDomElements];
    if (elArr[index]) this._pendingDomElements.delete(elArr[index]);
    this._pendingElements = this._pendingElements.filter((_, i) => i !== index);
    if (this._pendingElements.length === 0 && !this._pendingSource) this._cancelDraft();
  }

  // ────────────────────────────────────────────────────────────────────────
  // Actions
  // ────────────────────────────────────────────────────────────────────────

  private _saveNew(): void {
    const text = this._draft.trim();
    if (!text) return;
    this._clearHighlight();
    const entry: TextCommentEntry = {
      id: uid(),
      type: 'comment',
      text,
      createdAt: Date.now(),
      author: 'user',
    };
    const thread = this._buildThread({ comments: [entry] });
    this.comment = thread; // immediately switch to view mode
    this._mode = 'view';
    this._draft = '';
    this._open = false;
    dispatchIntent({ type: 'comment:save', comment: thread });
  }

  private _saveReply(): void {
    if (!this.comment) return;
    const text = this._replyDraft.trim();
    if (!text) return;
    const entry: TextCommentEntry = {
      id: uid(),
      type: 'comment',
      text,
      createdAt: Date.now(),
      author: 'user',
    };
    const comments = [...this._getComments(this.comment), entry];
    const updated = this._buildThread({ comments });
    this.comment = updated;
    this._replyDraft = '';
    dispatchIntent({ type: 'comment:save', comment: updated });
  }

  private _startEditReply(replyId: string, text: string): void {
    this._editingReplyId = replyId;
    this._editDraft = text;
    this.updateComplete.then(() => {
      const ta = this.shadowRoot?.querySelector<HTMLElement>(
        `wa-textarea[data-edit-id="${replyId}"]`,
      );
      if (ta) {
        (ta as HTMLElement & { focus: () => void }).focus();
      }
    });
  }

  private _saveEditReply(): void {
    if (!this.comment || !this._editingReplyId) return;
    const text = this._editDraft.trim();
    if (!text) return;
    const comments = this._getComments(this.comment).map((r) =>
      r.id === this._editingReplyId ? { ...r, text } : r,
    );
    const updated = this._buildThread({ comments });
    this.comment = updated;
    this._editingReplyId = null;
    this._editDraft = '';
    dispatchIntent({ type: 'comment:save', comment: updated });
  }

  private _cancelEditReply(): void {
    this._editingReplyId = null;
    this._editDraft = '';
  }

  private _deleteReply(replyId: string): void {
    if (!this.comment) return;
    const comments = this._getComments(this.comment).filter((r) => r.id !== replyId);
    const updated = this._buildThread({ comments });
    this.comment = updated;
    dispatchIntent({ type: 'comment:save', comment: updated });
  }

  private _cancelDraft(): void {
    this._clearHighlight();
    dispatchIntent({ type: 'comment:cancel', id: this._pendingId });
    // inspector.ts will remove this element from the DOM
  }

  private _delete(): void {
    if (this.comment) {
      dispatchIntent({ type: 'comment:delete', id: this.comment.meta.id });
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
    dispatchIntent({ type: 'comment:delete', id: this.comment.meta.id });
    this._open = false;
  }

  private _acceptAllTweaks(): void {
    if (!this.comment) return;
    dispatchIntent({ type: 'tweak:accept-comment', commentId: this.comment.meta.id });
    this._open = false;
  }

  private _discardTweak(): void {
    if (!this.comment) return;
    dispatchIntent({ type: 'tweak:discard-comment', commentId: this.comment.meta.id });
  }

  private _onKnobChange(e: CustomEvent<{ value: string | number | boolean }>): void {
    if (!this.comment) return;
    dispatchIntent({
      type: 'tweak:change',
      marker: this.comment.meta.id,
      value: String(e.detail.value),
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  private _renderTweaksSection(): TemplateResult {
    // Pending tweaks are now rendered inline in _renderReplies as agent bubbles.
    return html``;
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
          <wa-button slot="trigger" appearance="plain" size="xs" title="More options"
            >···</wa-button
          >
          <wa-dropdown-item value="paths"
            >${this._showPaths ? 'Hide paths' : 'Show paths'}</wa-dropdown-item
          >
          <wa-dropdown-item value="copy-link">Copy link to comment list</wa-dropdown-item>
          <wa-divider></wa-divider>
          <wa-dropdown-item value="delete" variant="danger">Delete</wa-dropdown-item>
        </wa-dropdown>
        <wa-button appearance="plain" size="xs" title="Resolve" @click=${this._resolve}
          >✓</wa-button
        >
        <wa-button
          appearance="plain"
          size="xs"
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
      size="xs"
      ?disabled=${!enabled}
      @click=${enabled ? onClick : undefined}
      title="Send"
      >↑</wa-button
    >`;
  }

  private _renderReplyAuthorIcon(author: string | undefined): TemplateResult {
    const isAgent = author === 'agent';
    if (!isAgent) return html``;
    return html``;
  }

  private _renderReplies(): TemplateResult {
    if (!this.comment) return html``;
    // Include pending tweaks in the list so they render inside agent bubbles.
    const entries = this._getComments(this.comment);

    // Determine which entries render as agent bubbles for grouping purposes.
    const isAgentBubble = (e: CommentEntry) => {
      if (e.type === 'tweak') return (e as TweakCommentEntry).tweakStatus === 'pending';
      return e.author === 'agent';
    };

    return html`${entries.map((r, index) => {
      if (r.type === 'tweak') {
        const tweak = r as TweakCommentEntry;
        if (tweak.tweakStatus === 'accepted') {
          return html`
            <div class="tweak-status accepted" data-entry-id=${r.id}>
              <span class="tweak-status-icon">✓</span>
              <span>Tweak accepted</span>
            </div>
          `;
        }
        if (tweak.tweakStatus === 'discarded') {
          return html`
            <div class="tweak-status discarded" data-entry-id=${r.id}>
              <span class="tweak-status-icon">✕</span>
              <span>Tweak discarded</span>
            </div>
          `;
        }
        // Pending tweak — render inline as an agent bubble.
        const liveKnob = knobsSignal.get().find((k) => k.marker === this.comment!.meta.id);
        const knob: TweakKnob = liveKnob ?? {
          marker: this.comment!.meta.id,
          commentId: this.comment!.meta.id,
          ...tweak.knob,
        };
        const prevIsAgent = index > 0 && isAgentBubble(entries[index - 1]);
        const nextIsAgent = index < entries.length - 1 && isAgentBubble(entries[index + 1]);
        const bubbleClass = `agent-bubble${prevIsAgent ? ' no-top-radius' : ''}${nextIsAgent ? ' no-bottom-radius' : ''}`;
        const replyClass = `reply agent${prevIsAgent ? ' no-top-radius' : ''}${nextIsAgent ? ' no-bottom-radius group-gap' : ''}`;
        return html`
          <div class=${replyClass} data-entry-id=${r.id}>
            ${!prevIsAgent ? html`<span class="reply-author-tag">✦ Agent</span>` : ''}
            <div class="tweak-row">
              <db-knob
                label=${tweak.knob.label}
                .knob=${knob}
                @db-knob-change=${this._onKnobChange}
              ></db-knob>
              <div class="tweak-actions">
                <wa-button
                  appearance="plain"
                  size="xs"
                  @click=${this._acceptAllTweaks}
                  title="Accept tweak and resolve comment"
                  >✓</wa-button
                >
                <wa-dropdown
                  size="s"
                  @wa-select=${(e: CustomEvent) => {
                    if (e.detail.item.value === 'discard') this._discardTweak();
                  }}
                >
                  <wa-button slot="trigger" appearance="plain" size="xs" title="More options"
                    >···</wa-button
                  >
                  <wa-dropdown-item value="discard" variant="danger"
                    >Discard changes</wa-dropdown-item
                  >
                </wa-dropdown>
              </div>
            </div>
          </div>
        `;
      }
      const isUser = r.author !== 'agent';
      const isEditing = this._editingReplyId === r.id;
      const isFirst = index === 0;
      const showMenu = isUser && r.type === 'comment';
      const prevIsAgent = !isUser && index > 0 && isAgentBubble(entries[index - 1]);
      const nextIsAgent =
        !isUser && index < entries.length - 1 && isAgentBubble(entries[index + 1]);
      const replyClass = isUser
        ? 'reply'
        : `reply agent${prevIsAgent ? ' no-top-radius' : ''}${nextIsAgent ? ' no-bottom-radius group-gap' : ''}`;
      return html`
        <div class=${replyClass} data-entry-id=${r.id}>
          ${!isUser && !prevIsAgent ? html`<span class="reply-author-tag">✦ Agent</span>` : ''}
          ${isEditing
            ? html`
                <wa-textarea
                  rows="1"
                  data-edit-id=${r.id}
                  appearance="filled"
                  resize="auto"
                  size="xs"
                  .value=${this._editDraft}
                  @input=${(e: Event) => {
                    this._editDraft = (e.target as HTMLElement & { value: string }).value;
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      this._saveEditReply();
                    } else if (e.key === 'Escape') {
                      e.stopPropagation();
                      this._cancelEditReply();
                    }
                  }}
                ></wa-textarea>
                <div class="edit-actions">
                  <wa-button
                    appearance="filled"
                    variant="brand"
                    size="xs"
                    ?disabled=${!this._editDraft.trim()}
                    @click=${this._saveEditReply}
                    >Save</wa-button
                  >
                  <wa-button appearance="plain" size="xs" @click=${this._cancelEditReply}
                    >Cancel</wa-button
                  >
                </div>
              `
            : html`
                <div class="reply-main">
                  <div class="reply-content">
                    <div class="comment-text">${r.text}</div>
                    <wa-relative-time
                      sync
                      .date=${new Date(r.createdAt)}
                      style="font-size:var(--wa-font-size-xs);color:var(--wa-color-text-quiet);"
                    ></wa-relative-time>
                  </div>
                  ${showMenu
                    ? html`
                        <wa-dropdown
                          size="xs"
                          class="reply-menu"
                          @click=${(e: Event) => e.stopPropagation()}
                          @wa-select=${(e: CustomEvent) => {
                            const val = e.detail.item.value;
                            if (val === 'edit') this._startEditReply(r.id, r.text);
                            else if (val === 'delete') this._deleteReply(r.id);
                          }}
                        >
                          <wa-button slot="trigger" appearance="plain" size="xs" title="More"
                            >···</wa-button
                          >
                          <wa-dropdown-item value="edit">Edit</wa-dropdown-item>
                          ${!isFirst
                            ? html`<wa-dropdown-item value="delete" variant="danger"
                                >Delete</wa-dropdown-item
                              >`
                            : ''}
                        </wa-dropdown>
                      `
                    : ''}
                </div>
              `}
        </div>
      `;
    })}`;
  }

  private _renderChipsBar(editable: boolean): TemplateResult {
    const elements =
      this._mode === 'create' ? this._pendingElements : (this.comment?.elements ?? []);
    const source =
      this._mode === 'create' ? this._pendingSource : (this.comment?.elements?.[0]?.source ?? null);
    if (!editable && !this._showPaths) return html``;
    if (!elements.length && !source) return html``;
    return html`
      <div class="chips-bar">
        ${elements.map(
          (el, i) => html`
            <wa-tag
              variant="brand"
              appearance="outlined"
              size="s"
              title=${el.minimalSelector}
              style="font-family:var(--wa-font-family-code);max-width:160px;overflow:hidden;text-overflow:ellipsis;"
              ?with-remove=${editable}
              @wa-remove=${editable
                ? (e: Event) => {
                    e.stopPropagation();
                    this._removeChip(i);
                  }
                : undefined}
            >
              ${el.minimalSelector}
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
    const comment = this._firstText(this.comment);
    const entries = this._getComments(this.comment);
    const tweakCount = entries.filter((r) => r.type === 'tweak').length;
    const replyCount = entries.filter((r) => r.type === 'comment').length - 1;
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
    const isResolved = !!this.comment?.meta?.resolvedAt;
    const label = isResolved ? '✓' : `${this.index + 1}`;
    const canSendNew = this._draft.trim().length > 0;
    const canSendReply = this._replyDraft.trim().length > 0;

    const badgeVariant = isResolved ? 'success' : this._hasUnread() ? 'brand' : 'neutral';

    return html`
      <!-- Badge dot -->
      <wa-button
        variant=${badgeVariant}
        appearance="filled-outlined"
        size="xs"
        .pill=${true}
        class="badge${isResolved ? ' resolved' : isDraft ? ' draft' : ''}"
        style=${this.docked
          ? 'position:relative;top:auto;left:auto'
          : `position:fixed;top:${this._badgeTop}px;left:${this._badgeLeft}px`}
        @mouseenter=${this._onBadgeMouseEnter}
        @mouseleave=${this._onBadgeMouseLeave}
        @click=${this._onBadgeClick}
        >${label}</wa-button
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
            <div class="textarea-wrap">
              <wa-textarea
                data-role=${isDraft ? 'composer' : 'reply'}
                appearance="filled"
                rows="1"
                resize="auto"
                size="xs"
                placeholder=${isDraft ? 'Add a comment\u2026' : 'Reply\u2026'}
                .value=${isDraft ? this._draft : this._replyDraft}
                @input=${(e: Event) => {
                  const v = (e.target as HTMLElement & { value: string }).value;
                  if (isDraft) this._draft = v;
                  else this._replyDraft = v;
                }}
                @keydown=${isDraft ? this._onComposerKeyDown : this._onReplyKeyDown}
              ></wa-textarea>
              <div class="composer-send">
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
