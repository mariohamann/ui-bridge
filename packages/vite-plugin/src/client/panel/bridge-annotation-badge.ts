import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Annotation } from '../../../shared/protocol.js';

const HIGHLIGHT_ATTR = 'data-db-related';

@customElement('bridge-annotation-badge')
export class BridgeAnnotationBadge extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      z-index: 2147483645;
      pointer-events: auto;
    }

    .badge {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #f59e0b;
      color: #1e1e2e;
      font: 700 10px/20px ui-sans-serif, system-ui, sans-serif;
      text-align: center;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,.4);
      transition: transform .1s, opacity .1s;
      user-select: none;
    }
    .badge:hover { transform: scale(1.25); }
    .badge.resolved {
      background: #a6e3a1;
      opacity: 0.55;
    }
  `;

  @property({ attribute: false }) annotation!: Annotation;
  @property({ type: Number }) index = 0;

  @state() private _top = -9999;
  @state() private _left = -9999;

  private _resizeObserver: ResizeObserver | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this._reposition();
    window.addEventListener('scroll', this._reposition, { passive: true, capture: true });
    window.addEventListener('resize', this._reposition, { passive: true });
    this._resizeObserver = new ResizeObserver(this._reposition);
    this._resizeObserver.observe(document.body);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('scroll', this._reposition, true);
    window.removeEventListener('resize', this._reposition);
    this._resizeObserver?.disconnect();
    this._clearHighlight();
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('annotation')) this._reposition();
  }

  private _reposition = (): void => {
    for (const sel of this.annotation.selectors) {
      try {
        const el = document.querySelector(sel);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        this._top = rect.top - 10;
        this._left = rect.right - 8;
        return;
      } catch { /* bad selector */ }
    }
    // No element found — hide off-screen
    this._top = -9999;
    this._left = -9999;
  };

  private _highlightRelated(): void {
    for (const sel of this.annotation.selectors) {
      try {
        document.querySelector(sel)?.setAttribute(HIGHLIGHT_ATTR, '');
      } catch { /* skip */ }
    }
    // Inject outline style if not already present
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

  private _handleClick(e: MouseEvent): void {
    e.stopPropagation();
    const rect = (this.shadowRoot!.querySelector('.badge') ?? this).getBoundingClientRect();
    this.dispatchEvent(new CustomEvent('annotation-open', {
      detail: { annotation: this.annotation, rect },
      bubbles: true,
      composed: true,
    }));
  }

  render(): TemplateResult {
    return html`
      <div
        class="badge${this.annotation.resolvedAt ? ' resolved' : ''}"
        style="position:fixed;top:${this._top}px;left:${this._left}px"
        title=${this.annotation.comment || this.annotation.labels.join(', ')}
        @mouseenter=${this._highlightRelated}
        @mouseleave=${this._clearHighlight}
        @click=${this._handleClick}
      >${this.annotation.resolvedAt ? '✓' : this.index + 1}</div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'bridge-annotation-badge': BridgeAnnotationBadge; }
}
