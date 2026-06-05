import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/dialog/dialog.js';
import '@awesome.me/webawesome/dist/components/divider/divider.js';
import '@awesome.me/webawesome/dist/components/radio/radio.js';
import '@awesome.me/webawesome/dist/components/radio-group/radio-group.js';
import '@awesome.me/webawesome/dist/components/switch/switch.js';
import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import type { UserPreferences, KnobVisibility, CommentBarPosition } from '@ui-bridge/protocol';
import { preferencesSignal } from '../state/preferences-store.js';
import { dispatchIntent } from '../state/intents.js';

const _UibPreferencesDialogBase = SignalWatcher(LitElement) as unknown as typeof LitElement;

/**
 * uib-preferences-dialog — settings panel wrapped in a wa-dialog.
 *
 * Opened programmatically by calling `open()`. On save, dispatches a
 * `preferences:update` intent which is picked up by the WS adapter and
 * sent to the server for persistence.
 */
@customElement('uib-preferences-dialog')
export class UibPreferencesDialog extends _UibPreferencesDialogBase {
  static styles = css`
    wa-dialog::part(panel) {
      max-width: 480px;
    }

    .section-title {
      font: 600 13px / 1.4 var(--wa-font-family-body, sans-serif);
      color: var(--wa-color-neutral-700, #444);
      margin: 0 0 10px 0;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 11px;
    }

    .field-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;
    }

    .route-matching {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
    }

    .route-matching-label {
      font: 500 13px / 1 var(--wa-font-family-body, sans-serif);
      color: var(--wa-color-neutral-600, #666);
      min-width: 120px;
    }

    wa-divider {
      margin: 16px 0;
    }

    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `;

  @query('wa-dialog') private _dialog!: HTMLElement & { show(): void; requestClose(): void };

  /** Local draft — edited in the dialog, committed on save */
  @state() private _draft: UserPreferences | null = null;

  open(): void {
    this._draft = {
      ...preferencesSignal.get(),
      routeMatching: { ...preferencesSignal.get().routeMatching },
    };
    this._dialog?.show();
  }

  private _save(): void {
    if (!this._draft) return;
    dispatchIntent({ type: 'preferences:update', payload: this._draft });
    this._dialog?.requestClose();
  }

  private _cancel(): void {
    this._dialog?.requestClose();
  }

  private _setKnobVisibilityUI(v: KnobVisibility): void {
    if (!this._draft) return;
    this._draft = { ...this._draft, knobVisibilityUI: v };
  }

  private _setKnobVisibilityBar(v: KnobVisibility): void {
    if (!this._draft) return;
    this._draft = { ...this._draft, knobVisibilityBar: v };
  }

  private _setPosition(v: CommentBarPosition): void {
    if (!this._draft) return;
    this._draft = { ...this._draft, commentBarPosition: v };
  }

  private _setRouteMatching(field: 'domain' | 'path' | 'params', checked: boolean): void {
    if (!this._draft) return;
    this._draft = {
      ...this._draft,
      routeMatching: { ...this._draft.routeMatching, [field]: checked },
    };
  }

  private _renderVisibilityGroup(
    label: string,
    current: KnobVisibility,
    onChange: (v: KnobVisibility) => void,
  ): TemplateResult {
    return html`
      <div>
        <p class="section-title">${label}</p>
        <wa-radio-group
          value=${current}
          @change=${(e: CustomEvent) =>
            onChange((e.target as HTMLInputElement).value as KnobVisibility)}
        >
          <wa-radio value="always">Always</wa-radio>
          <wa-radio value="non-approved">Only Non-Approved (default)</wa-radio>
          <wa-radio value="never">Never</wa-radio>
        </wa-radio-group>
      </div>
    `;
  }

  render(): TemplateResult {
    const draft = this._draft ?? preferencesSignal.get();

    return html`
      <wa-dialog label="Preferences">
        ${this._renderVisibilityGroup('Knob Visibility in UI', draft.knobVisibilityUI, (v) =>
          this._setKnobVisibilityUI(v),
        )}

        <div class="field-group route-matching">
          <span class="route-matching-label">Route matching</span>
          <wa-switch
            ?checked=${draft.routeMatching.domain}
            @change=${(e: Event) =>
              this._setRouteMatching('domain', (e.target as HTMLInputElement).checked)}
            >Domain</wa-switch
          >
          <wa-switch
            ?checked=${draft.routeMatching.path}
            @change=${(e: Event) =>
              this._setRouteMatching('path', (e.target as HTMLInputElement).checked)}
            >Path</wa-switch
          >
          <wa-switch
            ?checked=${draft.routeMatching.params}
            @change=${(e: Event) =>
              this._setRouteMatching('params', (e.target as HTMLInputElement).checked)}
            >Query Params</wa-switch
          >
        </div>

        <wa-divider></wa-divider>

        ${this._renderVisibilityGroup(
          'Knob Visibility in Comment Bar',
          draft.knobVisibilityBar,
          (v) => this._setKnobVisibilityBar(v),
        )}

        <wa-divider></wa-divider>

        <div>
          <p class="section-title">Comment Bar Position</p>
          <wa-radio-group
            value=${draft.commentBarPosition}
            @change=${(e: CustomEvent) =>
              this._setPosition((e.target as HTMLInputElement).value as CommentBarPosition)}
          >
            <wa-radio value="top-left">Top Left (default)</wa-radio>
            <wa-radio value="top-right">Top Right</wa-radio>
            <wa-radio value="bottom-left">Bottom Left</wa-radio>
            <wa-radio value="bottom-right">Bottom Right</wa-radio>
          </wa-radio-group>
        </div>

        <div slot="footer" class="dialog-footer">
          <wa-button variant="neutral" @click=${this._cancel}>Cancel</wa-button>
          <wa-button variant="brand" @click=${this._save}>Save</wa-button>
        </div>
      </wa-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'uib-preferences-dialog': UibPreferencesDialog;
  }
}
