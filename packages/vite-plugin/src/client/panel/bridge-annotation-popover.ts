import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { computePosition, flip, shift, offset, size } from '@floating-ui/dom';
import { finder } from '@medv/finder';
import type { Annotation, AnnotationSource } from '../../../shared/protocol.js';

// Fired when user saves (create or update)
export type AnnotationSaveEvent = CustomEvent<Annotation>;
// Fired when user cancels
export type AnnotationCancelEvent = CustomEvent<void>;

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function buildSelector(el: Element): string {
  try { return finder(el); } catch { return el.tagName.toLowerCase(); }
}

function shortLabel(el: Element): string {
  let label = el.tagName.toLowerCase();
  if (el.id) label += `#${el.id}`;
  else if (el.classList.length) label += `.${[...el.classList][0]}`;
  return label;
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
      padding: 12px 14px;
      width: 300px;
      box-shadow: 0 8px 24px rgba(0,0,0,.6);
      font: 13px/1.5 var(--db-font-mono);
    }

    .title {
      margin: 0 0 8px;
      font-size: 11px;
      color: var(--db-amber);
      font-weight: 600;
      letter-spacing: .05em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .title span { color: var(--db-muted); font-weight: 400; text-transform: none; letter-spacing: 0; }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 8px;
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
      max-width: 200px;
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

    .hint {
      font-size: 11px;
      color: var(--db-muted);
      margin-bottom: 8px;
      font-style: italic;
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
    }
    textarea:focus { border-color: var(--db-blue); }

    .actions {
      display: flex;
      gap: 6px;
      margin-top: 8px;
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
    .btn-cancel { background: var(--db-border); color: var(--db-text); }
    .btn-delete { background: transparent; color: var(--db-red); border: 1px solid var(--db-red); }

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
      margin-bottom: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .source-chip-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `;

  @property({ attribute: false }) annotation: Annotation | null = null;

  @state() private _selectors: string[] = [];
  @state() private _labels: string[] = [];
  @state() private _source: AnnotationSource | null = null;
  @state() private _comment = '';
  @state() private _top = 0;
  @state() private _left = 0;
  @state() private _pendingId = '';

  private get _isEdit(): boolean { return this.annotation !== null; }

  /** Open in create mode targeting a DOM element. */
  showForElement(el: Element): void {
    const sel = buildSelector(el);
    if (this.hidden === false && !this._isEdit && !this._source) {
      if (!this._selectors.includes(sel)) {
        this._selectors = [...this._selectors, sel];
        this._labels = [...this._labels, shortLabel(el)];
      }
      return;
    }
    this._pendingId = uid();
    this._selectors = [sel];
    this._labels = [shortLabel(el)];
    this._source = null;
    this._comment = '';
    this.annotation = null;
    this.hidden = false;
    this._floatNear(el.getBoundingClientRect());
  }

  /** Open in create mode for a source location from code-inspector (no DOM element needed). */
  showForSource(source: AnnotationSource): void {
    if (!this.hidden && !this._source) {
      // A selector-based popover is open — just add the source to it
      this._source = source;
      return;
    }
    this._pendingId = uid();
    this._selectors = [];
    this._labels = [];
    this._source = source;
    this._comment = '';
    this.annotation = null;
    this.hidden = false;
    // Position in bottom-right area (no element to anchor to)
    this._top = Math.max(16, window.innerHeight - 280);
    this._left = Math.max(16, window.innerWidth - 340);
  }

  /** Open in edit mode for an existing annotation. */
  showForAnnotation(ann: Annotation, anchor?: Element | DOMRect): void {
    this._pendingId = ann.id;
    this._selectors = [...ann.selectors];
    this._labels = [...ann.labels];
    this._source = ann.source ?? null;
    this._comment = ann.comment;
    this.annotation = ann;
    this.hidden = false;
    const rect = anchor instanceof Element ? anchor.getBoundingClientRect()
      : anchor ?? this._firstElementRect(ann);
    if (rect) this._floatNear(rect);
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
    // Always wait for Lit to render before measuring — ensures .popover exists with real dimensions
    this.updateComplete.then(() => this._computeFloat(anchorRect));
  }

  private _computeFloat(anchorRect: DOMRect): void {
    const reference = { getBoundingClientRect: () => anchorRect };
    const floating = this.shadowRoot?.querySelector<HTMLElement>('.popover');
    if (!floating) return;

    computePosition(reference as Element, floating, {
      placement: 'left-start',
      strategy: 'fixed',
      middleware: [
        offset(8),
        flip({ fallbackPlacements: ['right-start', 'bottom-start', 'top-start'] }),
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

  private _save(): void {
    const ann: Annotation = {
      id: this._pendingId,
      selectors: [...this._selectors],
      labels: this._labels.length ? [...this._labels] : (this._source ? [`${this._source.file}:${this._source.line}`] : []),
      comment: this._comment,
      pageUrl: location.href,
      timestamp: Date.now(),
      ...(this._source ? { source: this._source } : {}),
    };
    this.dispatchEvent(new CustomEvent<Annotation>('annotation-save', { detail: ann, bubbles: true, composed: true }));
    this._close();
  }

  private _delete(): void {
    if (this.annotation) {
      this.dispatchEvent(new CustomEvent('annotation-delete', { detail: { id: this.annotation.id }, bubbles: true, composed: true }));
    }
    this._close();
  }

  private _close(): void {
    this.hidden = true;
    this.annotation = null;
    this._selectors = [];
    this._labels = [];
    this._source = null;
    this._comment = '';
    this.dispatchEvent(new CustomEvent('annotation-cancel', { bubbles: true, composed: true }));
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      this._save();
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      this._close();
    }
  };

  render(): TemplateResult {
    return html`
      <div class="popover" style="top:${this._top}px;left:${this._left}px" @keydown=${this._onKeyDown}>
        <div class="title">
          Annotation
          <span>${this._isEdit ? 'editing' : this._source && !this._selectors.length ? 'from code-inspector' : 'click more to add'}</span>
        </div>

        ${this._source ? html`
          <div class="source-chip" title="${this._source.file}:${this._source.line}:${this._source.column}">
            📍 <span class="source-chip-label">${this._source.file}:${this._source.line}:${this._source.column}</span>
          </div>
        ` : ''}

        ${this._selectors.length ? html`
          <div class="chips">
            ${this._selectors.map((sel, i) => html`
              <span class="chip" title=${sel}>
                ${this._labels[i]}
                <button @click=${() => this._removeChip(i)}>×</button>
              </span>
            `)}
          </div>
        ` : ''}

        ${!this._isEdit && !this._source ? html`<div class="hint">Keep clicking elements to group them</div>` : ''}

        <textarea
          placeholder="Describe what to tweak…"
          .value=${this._comment}
          @input=${(e: Event) => { this._comment = (e.target as HTMLTextAreaElement).value; }}
        ></textarea>

        <div class="actions">
          <button class="btn btn-save" @click=${this._save}>${this._isEdit ? 'Update' : 'Save'}</button>
          <button class="btn btn-delete" @click=${this._delete}>Delete</button>
          <button class="btn btn-cancel" @click=${this._close}>Cancel</button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'bridge-annotation-popover': BridgeAnnotationPopover; }
}
