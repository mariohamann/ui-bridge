import { LitElement, html, type TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { dbOrphanedBarStyles } from './db-orphaned-bar.styles.js';

/**
 * db-orphaned-bar — a fixed-position pill (top-left) that holds db-comment
 * elements whose CSS selector no longer resolves in the DOM.
 *
 * inspector.ts physically moves existing <db-comment> elements into this
 * element's light DOM (slotted) when orphaned, and back to #db-items when
 * they resolve again.
 *
 * Layout:
 *  - Collapsed: all badges stack on top of each other (position:absolute)
 *  - Hovered:   badges fan out vertically (position:relative, flex column)
 */
@customElement('db-orphaned-bar')
export class DbOrphanedBar extends LitElement {
  static styles = dbOrphanedBarStyles;

  @state() private _hasChildren = false;

  private _observer: MutationObserver | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.classList.add('wa-dark');
    this._observer = new MutationObserver(() => {
      this._hasChildren = this.childElementCount > 0;
    });
    this._observer.observe(this, { childList: true });
    this._hasChildren = this.childElementCount > 0;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._observer?.disconnect();
    this._observer = null;
  }

  render(): TemplateResult {
    const cls = [
      'container',
      this._hasChildren ? 'has-children' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return html`
      <div
        class=${cls}
      >
        <slot></slot>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'db-orphaned-bar': DbOrphanedBar;
  }
}
