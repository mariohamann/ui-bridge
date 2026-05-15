import '@awesome.me/webawesome/dist/components/color-picker/color-picker.js';
import '@awesome.me/webawesome/dist/components/input/input.js';
import '@awesome.me/webawesome/dist/components/number-input/number-input.js';
import '@awesome.me/webawesome/dist/components/option/option.js';
import '@awesome.me/webawesome/dist/components/radio/radio.js';
import '@awesome.me/webawesome/dist/components/radio-group/radio-group.js';
import '@awesome.me/webawesome/dist/components/select/select.js';
import '@awesome.me/webawesome/dist/components/switch/switch.js';
import '@awesome.me/webawesome/dist/components/textarea/textarea.js';
import { LitElement, html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { TweakKnob } from '@design-bridge/protocol';

/**
 * db-knob — renders a single knob input based on its type using Web Awesome components.
 *
 * Responsibilities:
 *   - Render the correct WA input control for the knob type
 *   - Track the current value locally (optimistic UI)
 *   - Fire `db-knob-change` with `{ value }` when the user changes the input
 *
 * The parent (db-comment) listens to `db-knob-change` and dispatches the
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

  // Use light DOM so db-comment's existing CSS applies directly.
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
      <wa-select
        .value=${String(this._value)}
        @wa-change=${(e: Event) =>
          this._emit((e.target as HTMLSelectElement & { value: string }).value)}
      >
        ${opts.map(([label, val]) => html`<wa-option value=${val}>${label}</wa-option>`)}
      </wa-select>
    `;
  }

  private _renderButtonGroup(): TemplateResult {
    const opts = Object.entries(this.knob!.options ?? {});
    return html`
      <wa-radio-group
        .value=${String(this._value)}
        orientation="horizontal"
        @wa-change=${(e: Event) => this._emit((e.target as HTMLElement & { value: string }).value)}
      >
        ${opts.map(
          ([label, val]) => html`<wa-radio appearance="button" value=${val}>${label}</wa-radio>`,
        )}
      </wa-radio-group>
    `;
  }

  render(): TemplateResult {
    if (!this.knob) return html``;
    const { type, min, max, step } = this.knob;

    if (type === 'select') return this._renderSelect();
    if (type === 'button-group') return this._renderButtonGroup();

    if (type === 'color') {
      return html`<wa-color-picker
        format="hex"
        without-format-toggle
        .value=${String(this._value)}
        @wa-change=${(e: Event) => this._emit((e.target as HTMLElement & { value: string }).value)}
      ></wa-color-picker>`;
    }

    if (type === 'number') {
      return html`<wa-number-input
        .value=${Number(this._value)}
        min=${min ?? ''}
        max=${max ?? ''}
        step=${step ?? ''}
        @wa-input=${(e: Event) =>
          this._emit(Number((e.target as HTMLElement & { value: number }).value))}
      ></wa-number-input>`;
    }

    if (type === 'boolean') {
      return html`<wa-switch
        ?checked=${Boolean(this._value)}
        @wa-change=${(e: Event) =>
          this._emit((e.target as HTMLElement & { checked: boolean }).checked)}
      ></wa-switch>`;
    }

    if (type === 'textarea') {
      return html`<wa-textarea
        .value=${String(this._value)}
        rows="3"
        @wa-input=${(e: Event) => this._emit((e.target as HTMLElement & { value: string }).value)}
      ></wa-textarea>`;
    }

    // string / fallback
    return html`<wa-input
      .value=${String(this._value)}
      @wa-input=${(e: Event) => this._emit((e.target as HTMLElement & { value: string }).value)}
    ></wa-input>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'db-knob': DbKnob;
  }
}
