import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { computePosition, flip, shift, offset, size } from '@floating-ui/dom';
import { finder, idName } from '@medv/finder';
import type { Annotation, AnnotationReply, AnnotationSource, AnnotationTweakLink } from '../../../shared/protocol.js';

// Fired when user saves (create or update)
export type AnnotationSaveEvent = CustomEvent<Annotation>;
// Fired when user cancels
export type AnnotationCancelEvent = CustomEvent<void>;

type PopoverMode = 'create' | 'view';

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function buildSelector(el: Element): string {
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

@customElement('bridge-annotation-popover')
export class BridgeAnnotationPopover extends LitElement {
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
    }
    :host([hidden]) { display: none !important; }

    .popover {
      position: fixed;
      z-index: 2147483646;
      background: var(--db-bg);
      color: var(--db-text);
      border: none;
      border-radius: 8px;
      padding: 0;
      width: 300px;
      box-shadow: 0 8px 24px rgba(0,0,0,.6);
      font: 13px/1.5 var(--db-font-mono);
      overflow: hidden;
    }

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
    .icon-btn.resolved { color: var(--db-green); }
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
    .comment-empty {
      font-size: 12px;
      color: var(--db-muted);
      font-style: italic;
      margin: 0 0 6px;
    }
    .timestamp {
      font-size: 11px;
      color: var(--db-muted);
      margin-bottom: 8px;
    }
    .resolved-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--db-green);
      margin-bottom: 8px;
    }

    textarea {
      width: 100%;
      box-sizing: border-box;
      background: var(--db-surface);
      color: var(--db-text);
      border: 1px solid var(--db-border);
      border-radius: 4px;
      padding: 6px 8px;
      font: inherit;
      font-size: 12px;
      resize: vertical;
      min-height: 60px;
      outline: none;
      margin-bottom: 8px;
      transition: border-color .12s, box-shadow .12s;
    }
    textarea:focus,
    textarea:focus-visible {
      border-color: var(--db-blue);
      box-shadow: 0 0 0 2px rgba(137,180,250,.28);
    }

    /* ── Chips ──────────────────────────────── */
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 6px;
    }
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
      all: unset;
      cursor: pointer;
      color: var(--db-muted);
      font-size: 13px;
      line-height: 1;
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

    /* ── Footer (create/edit actions) ─────── */
    .footer {
      display: flex;
      gap: 6px;
      padding: 8px 12px;
      border-top: 1px solid var(--db-border);
      align-items: center;
    }
    .footer textarea {
      margin-bottom: 0;
      min-height: 38px;
      resize: none;
      flex: 1;
    }
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

  @property({ attribute: false }) annotation: Annotation | null = null;

  @state() private _mode: PopoverMode = 'create';
  @state() private _selectors: string[] = [];
  @state() private _labels: string[] = [];
  @state() private _source: AnnotationSource | null = null;
  @state() private _draft = '';
  @state() private _replyDraft = '';
  @state() private _top = -9999;
  @state() private _left = -9999;
  @state() private _positioned = false;
  @state() private _pendingId = '';
  @state() private _createdAt = 0;
  @state() private _showMenu = false;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('pointerdown', this._onDocumentPointerDown, true);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this._onDocumentPointerDown, true);
  }

  /** Open in create mode targeting a DOM element. */
  showForElement(el: Element): void {
    const sel = buildSelector(el);
    if (this.hidden === false && this._mode === 'create') {
      if (!this._selectors.includes(sel)) {
        this._selectors = [...this._selectors, sel];
        this._labels = [...this._labels, shortLabel(el)];
      }
      this._focusActiveTextarea();
      return;
    }
    this._pendingId = uid();
    this._selectors = [sel];
    this._labels = [shortLabel(el)];
    this._source = null;
    this._draft = '';
    this._replyDraft = '';
    this._createdAt = Date.now();
    this.annotation = null;
    this._mode = 'create';
    this._showMenu = false;
    this._positioned = false;
    this.hidden = false;
    this._floatNear(el.getBoundingClientRect());
    this._focusActiveTextarea();
  }

  /** Open in create mode for a source location from code-inspector (no DOM element needed). */
  showForSource(source: AnnotationSource): void {
    if (!this.hidden && this._mode === 'create') {
      this._source = source;
      this._focusActiveTextarea();
      return;
    }
    this._pendingId = uid();
    this._selectors = [];
    this._labels = [];
    this._source = source;
    this._draft = '';
    this._replyDraft = '';
    this._createdAt = Date.now();
    this.annotation = null;
    this._mode = 'create';
    this._showMenu = false;
    this.hidden = false;
    this._top = Math.max(16, window.innerHeight - 280);
    this._left = Math.max(16, window.innerWidth - 340);
    this._focusActiveTextarea();
  }

  /** Open in view mode for an existing annotation. */
  showForAnnotation(ann: Annotation, anchor?: Element | DOMRect): void {
    this._pendingId = ann.id;
    this._selectors = [...ann.selectors];
    this._labels = [...ann.labels];
    this._source = ann.source ?? null;
    this._draft = ann.comment;
    this._replyDraft = '';
    this._createdAt = ann.createdAt ?? ann.timestamp;
    this.annotation = ann;
    this._mode = 'view';
    this._showMenu = false;
    this._positioned = false;
    this.hidden = false;
    const rect = anchor instanceof Element ? anchor.getBoundingClientRect()
      : anchor ?? this._firstElementRect(ann);
    if (rect) this._floatNear(rect);
    this._focusActiveTextarea();
  }

  private _focusActiveTextarea(): void {
    this.updateComplete.then(() => {
      const selector = this._mode === 'view' ? 'textarea[data-role="reply"]' : 'textarea[data-role="composer"]';
      const textarea = this.shadowRoot?.querySelector<HTMLTextAreaElement>(selector);
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  }

  private _firstElementRect(ann: Annotation): DOMRect | null {
    for (const sel of ann.selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el.getBoundingClientRect();
      } catch { /* bad selector */ }
    }
    return null;
  }

  private _floatNear(anchorRect: DOMRect): void {
    // Compute initial position synchronously to avoid layout shift
    this._computeFloatSync(anchorRect);
    // Then compute final position asynchronously for precision
    requestAnimationFrame(() => this._computeFloat(anchorRect));
  }

  private _computeFloatSync(anchorRect: DOMRect): void {
    // Simple synchronous positioning: place popover to the right of anchor
    // Fallback to left/bottom if needed, similar to floating-ui but simpler
    const popoverWidth = 300;
    const popoverHeight = 280;
    const gapSize = 8;

    let x = anchorRect.right + gapSize; // Try right first
    let y = anchorRect.top;

    // Adjust if would go off-screen
    if (x + popoverWidth + 8 > window.innerWidth) x = Math.max(8, anchorRect.left - popoverWidth - gapSize); // Move to left
    if (x + popoverWidth + 8 > window.innerWidth) x = Math.max(8, window.innerWidth - popoverWidth - 8);
    if (y + popoverHeight + 8 > window.innerHeight) y = Math.max(8, window.innerHeight - popoverHeight - 8);
    if (y < 8) y = 8;

    this._left = x;
    this._top = y;
  }

  private _computeFloat(anchorRect: DOMRect): void {
    const reference = { getBoundingClientRect: () => anchorRect };
    const floating = this.shadowRoot?.querySelector<HTMLElement>('.popover');
    if (!floating) return;

    computePosition(reference as Element, floating, {
      placement: 'right-start',
      strategy: 'fixed',
      middleware: [
        offset(8),
        flip({ fallbackPlacements: ['left-start', 'bottom-start', 'top-start'] }),
        size({
          padding: 8,
          apply({ availableHeight, availableWidth, elements }) {
            Object.assign(elements.floating.style, {
              maxHeight: `${Math.max(availableHeight, 120)}px`,
              maxWidth: `${Math.max(availableWidth, 200)}px`,
              overflowY: 'auto',
            });
          },
        }),
        shift({ padding: 8 }),
      ],
    }).then(({ x, y }) => {
      this._left = x;
      this._top = y;
    });
  }

  private _removeChip(index: number): void {
    this._selectors = this._selectors.filter((_, i) => i !== index);
    this._labels = this._labels.filter((_, i) => i !== index);
    if (this._selectors.length === 0 && !this._source) { this._close(); }
  }

  private _normalizeReplies(ann: Annotation | null): AnnotationReply[] {
    if (ann?.replies && ann.replies.length > 0) return [...ann.replies];
    if (!ann?.comment?.trim()) return [];
    return [{
      id: `${ann.id}-root`,
      type: 'comment',
      text: ann.comment,
      createdAt: ann.createdAt ?? ann.timestamp,
    }];
  }

  private _buildAnnotation(overrides?: {
    comment?: string;
    replies?: AnnotationReply[];
    linkedTweaks?: AnnotationTweakLink[];
  }): Annotation {
    const base = this.annotation;
    const replies = overrides?.replies ?? this._normalizeReplies(base);
    const comment = overrides?.comment ?? base?.comment ?? this._draft.trim();
    return {
      id: this._pendingId,
      selectors: [...this._selectors],
      labels: this._labels.length ? [...this._labels] : (this._source ? [`${this._source.file}:${this._source.line}`] : []),
      comment,
      pageUrl: location.href,
      timestamp: Date.now(),
      createdAt: this._createdAt || Date.now(),
      replies,
      linkedTweaks: overrides?.linkedTweaks ?? base?.linkedTweaks ?? [],
      ...(this._source ? { source: this._source } : {}),
    };
  }

  private _saveNewComment(): void {
    const text = this._draft.trim();
    if (!text) return;
    const reply: AnnotationReply = {
      id: uid(),
      type: 'comment',
      text,
      createdAt: Date.now(),
    };
    this.dispatchEvent(new CustomEvent<Annotation>('annotation-save', {
      detail: this._buildAnnotation({ comment: text, replies: [reply] }),
      bubbles: true,
      composed: true,
    }));
    this._close();
  }

  private _saveReply(): void {
    if (!this.annotation) return;
    const text = this._replyDraft.trim();
    if (!text) return;
    const replies = [...this._normalizeReplies(this.annotation), {
      id: uid(),
      type: 'comment',
      text,
      createdAt: Date.now(),
    }];
    const updated = this._buildAnnotation({
      comment: replies[0]?.text ?? this.annotation.comment,
      replies,
      linkedTweaks: this.annotation.linkedTweaks ?? [],
    });
    this.annotation = updated;
    this._replyDraft = '';
    this.dispatchEvent(new CustomEvent<Annotation>('annotation-save', {
      detail: updated,
      bubbles: true,
      composed: true,
    }));
  }

  registerTweakReply(marker: string, value: string): void {
    if (!this.annotation || this.hidden || this._mode !== 'view') return;
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

    const updated = this._buildAnnotation({
      comment: replies[0]?.text ?? this.annotation.comment,
      replies,
      linkedTweaks,
    });
    this.annotation = updated;
    this.dispatchEvent(new CustomEvent<Annotation>('annotation-save', {
      detail: updated,
      bubbles: true,
      composed: true,
    }));
  }

  private _delete(): void {
    if (this.annotation) {
      this.dispatchEvent(new CustomEvent('annotation-delete', { detail: { id: this.annotation.id }, bubbles: true, composed: true }));
    }
    this._close();
  }

  private _resolveAndRemove(): void {
    if (!this.annotation) return;
    this._showMenu = false;
    this.dispatchEvent(new CustomEvent('annotation-resolve', {
      detail: {
        id: this.annotation.id,
        tweakMarkers: (this.annotation.linkedTweaks ?? []).map((t) => t.marker),
      },
      bubbles: true,
      composed: true,
    }));
    this._close();
  }

  private _close(): void {
    this.hidden = true;
    this.annotation = null;
    this._selectors = [];
    this._labels = [];
    this._source = null;
    this._draft = '';
    this._replyDraft = '';
    this._showMenu = false;
    this.dispatchEvent(new CustomEvent('annotation-cancel', { bubbles: true, composed: true }));
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (this._showMenu) { this._showMenu = false; return; }
      this._close();
    }
  };

  private _onComposerKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._saveNewComment();
    }
  };

  private _onReplyKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._saveReply();
    }
  };

  private _onDocumentPointerDown = (e: PointerEvent): void => {
    if (this.hidden) return;
    const path = e.composedPath();
    if (path.includes(this)) return;
    this._close();
  };

  private _renderHeader(): TemplateResult {
    if (this._mode === 'create') {
      return html``;
    }
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
        <button class="icon-btn resolve" @click=${this._resolveAndRemove} title="Resolve">✓</button>
        <button class="icon-btn close" @click=${this._close} title="Close">✕</button>
      </div>
    `;
  }

  private _renderSendButton(enabled: boolean, onClick: () => void): TemplateResult {
    if (!enabled) return html``;
    return html`<button class="icon-btn resolve" @click=${onClick} title="Send">↑</button>`;
  }

  private _renderReplies(): TemplateResult {
    const ann = this.annotation;
    if (!ann) return html``;
    const replies = this._normalizeReplies(ann);
    return html`
      ${replies.map((reply) => html`
        <div class="comment-text">${reply.text}</div>
        <div class="timestamp">${relativeTime(reply.createdAt)}</div>
      `)}
    `;
  }

  private _renderChips(editable: boolean): TemplateResult {
    return html`
      ${this._selectors.length ? html`
        <div class="chips">
          ${this._selectors.map((sel, i) => html`
            <span class="chip" title=${sel}>
              ${sel}
              ${editable ? html`<button @click=${() => this._removeChip(i)}>×</button>` : ''}
            </span>
          `)}
        </div>
      ` : ''}
      ${this._source ? html`
        <div class="source-chip" title="${this._source.file}:${this._source.line}:${this._source.column}">
          📍 <span class="source-chip-label">${this._source.file}:${this._source.line}:${this._source.column}</span>
        </div>
      ` : ''}
    `;
  }

  render(): TemplateResult {
    const canSendNew = this._draft.trim().length > 0;
    const canSendReply = this._replyDraft.trim().length > 0;
    return html`
      <div class="popover" style="top:${this._top}px;left:${this._left}px" @keydown=${this._onKeyDown}>
        ${this._renderHeader()}

        <div class="body">
          ${this._mode === 'view' ? html`
            ${this._renderReplies()}
            ${this._renderChips(false)}
          ` : html`
            ${!this._source && this._mode === 'create' ? html`<div class="hint">Keep clicking elements to group them</div>` : ''}
            <textarea
              data-role="composer"
              placeholder="Add a comment"
              .value=${this._draft}
              @input=${(e: Event) => { this._draft = (e.target as HTMLTextAreaElement).value; }}
              @keydown=${this._onComposerKeyDown}
            ></textarea>
            ${this._renderChips(true)}
          `}
        </div>

        ${this._mode !== 'view' ? html`
          <div class="footer">
            <button class="btn btn-cancel" @click=${this._close}>Cancel</button>
            ${this._renderSendButton(canSendNew, () => this._saveNewComment())}
          </div>
        ` : html`
          <div class="footer">
            <textarea
              data-role="reply"
              placeholder="Reply"
              .value=${this._replyDraft}
              @input=${(e: Event) => { this._replyDraft = (e.target as HTMLTextAreaElement).value; }}
              @keydown=${this._onReplyKeyDown}
            ></textarea>
            ${this._renderSendButton(canSendReply, () => this._saveReply())}
          </div>
        `}
      </div>
    `;
  }
}


declare global {
  interface HTMLElementTagNameMap { 'bridge-annotation-popover': BridgeAnnotationPopover; }
}
