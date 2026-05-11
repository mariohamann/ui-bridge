import { html, type TemplateResult } from 'lit';
import type { TweakKnob } from '@design-bridge/core';

export type KnobChangeHandler = (marker: string, value: string) => void;

function renderKnobRow(knob: TweakKnob, onChange: KnobChangeHandler): TemplateResult {
  const id = `knob-${knob.marker}`;

  let control: TemplateResult;

  if (knob.type === 'select' && knob.options) {
    const entries = Object.entries(knob.options);
    control = html`
      <select
        id=${id}
        class="db-control db-select"
        .value=${String(knob.value)}
        @change=${(e: Event) => onChange(knob.marker, (e.target as HTMLSelectElement).value)}
      >
        ${entries.map(([label, val]) => html`
          <option value=${val} ?selected=${val === String(knob.value)}>${label}</option>
        `)}
      </select>
    `;
  } else if (knob.type === 'boolean') {
    control = html`
      <label class="db-toggle">
        <input
          type="checkbox"
          .checked=${Boolean(knob.value)}
          @change=${(e: Event) => onChange(knob.marker, String((e.target as HTMLInputElement).checked))}
        />
        <span class="db-toggle-track"></span>
      </label>
    `;
  } else if (knob.type === 'number') {
    control = html`
      <input
        id=${id}
        type="number"
        class="db-control db-input"
        .value=${String(knob.value)}
        min=${knob.min ?? ''}
        max=${knob.max ?? ''}
        step=${knob.step ?? ''}
        @change=${(e: Event) => onChange(knob.marker, (e.target as HTMLInputElement).value)}
      />
    `;
  } else if (knob.type === 'color') {
    control = html`
      <input
        id=${id}
        type="color"
        class="db-control db-color"
        .value=${String(knob.value)}
        @input=${(e: Event) => onChange(knob.marker, (e.target as HTMLInputElement).value)}
      />
    `;
  } else {
    // string + button-group fallback as text input
    control = html`
      <input
        id=${id}
        type="text"
        class="db-control db-input"
        .value=${String(knob.value)}
        @change=${(e: Event) => onChange(knob.marker, (e.target as HTMLInputElement).value)}
      />
    `;
  }

  return html`
    <div class="db-row">
      <label class="db-label" for=${id}>${knob.label}</label>
      <div class="db-control-wrap">${control}</div>
    </div>
  `;
}

export function renderKnobs(knobs: TweakKnob[], onChange: KnobChangeHandler): TemplateResult {
  if (knobs.length === 0) return html``;
  return html`
    <div class="db-knobs">
      ${knobs.map((k) => renderKnobRow(k, onChange))}
    </div>
    <div class="db-separator"></div>
  `;
}
