import { LitElement, html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { TweakKnob } from '@design-bridge/protocol';

/**
 * db-knob — renders a single knob input based on its type.
 *
 * Responsibilities:
 *   - Render the correct input control (select, number, color, boolean, text)
 *   - Track the current value locally (optimistic UI)
 *   - Fire `db-knob-change` with `{ value }` when the user changes the input
 *
 * The parent (db-annotation) listens to `db-knob-change` and dispatches the
 * appropriate intent. This component has no knowledge of intents or transport.
 *
 * Renders into light DOM (no shadow root) so the parent's styles apply.
 */
@customElement('db-knob')
export class DbKnob extends LitElement {
  /** The knob descriptor coming from the server schema. */
  @property({ attribute: false }) knob: TweakKnob | null = null;

  /** Locally-tracked current value — initialised from knob.value. */
  @state() private _value: string | number | boolean = '';

  // Use light DOM so db-annotation's existing CSS applies directly.
  protected createRenderRoot(): HTMLElement {
    return this;
  }

  willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('knob') && this.knob != null) {
      this._value = this.knob.value;
    }
  }

  private _emit(value: string | number | boolean): void {
    this._value = value;
    this.dispatchEvent(
      new CustomEvent('db-knob-change', { detail: { value }, bubbles: true, composed: true }),
    );
  }

  private _renderSelect(): TemplateResult {
    const opts = Object.entries(this.knob!.options ?? {});
    return html`
      <select
        class="knob-select"
        @change=${(e: Event) => this._emit((e.target as HTMLSelectElement).value)}
      >
        ${opts.map(
      ([label, val]) =>
        html`<option value=${val} ?selected=${val === this._value}>${label}</option>`,
    )}
      </select>
    `;
  }

  render(): TemplateResult {
    if (!this.knob) return html``;
    const { type, min, max, step } = this.knob;

    if (type === 'select' || type === 'button-group') return this._renderSelect();

    if (type === 'color') {
      return html`<input
        type="color"
        class="knob-color"
        .value=${String(this._value)}
        @input=${(e: Event) => this._emit((e.target as HTMLInputElement).value)}
      />`;
    }

    if (type === 'number') {
      return html`<input
        type="number"
        class="knob-number"
        .value=${String(this._value)}
        min=${min ?? ''}
        max=${max ?? ''}
        step=${step ?? ''}
        @input=${(e: Event) => this._emit(Number((e.target as HTMLInputElement).value))}
      />`;
    }

    if (type === 'boolean') {
      return html`<input
        type="checkbox"
        class="knob-boolean"
        ?checked=${Boolean(this._value)}
        @change=${(e: Event) => this._emit((e.target as HTMLInputElement).checked)}
      />`;
    }

    // string / fallback
    return html`<input
      type="text"
      class="knob-text"
      .value=${String(this._value)}
      @input=${(e: Event) => this._emit((e.target as HTMLInputElement).value)}
    />`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'db-knob': DbKnob;
  }
}
