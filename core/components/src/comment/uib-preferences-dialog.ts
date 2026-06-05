import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/details/details.js';
import '@awesome.me/webawesome/dist/components/dialog/dialog.js';
import '@awesome.me/webawesome/dist/components/divider/divider.js';
import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import type {
  UserPreferences,
  VisibilityStatus,
  CommentBarPosition,
  VisibilityRouteConfig,
} from '@ui-bridge/protocol';
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

    /* ── Section heading ─────────────────────────────────────────────── */
    .section-heading {
      font-size: var(--wa-font-size-s);
      font-weight: var(--wa-font-weight-semibold);
      color: var(--wa-color-text-normal);
      margin: 0 0 var(--wa-space-s) 0;
    }

    /* ── Native fieldsets ────────────────────────────────────────────── */
    fieldset {
      border: none;
      padding: 0;
      margin: 0;
    }

    legend {
      font-size: var(--wa-font-size-xs);
      font-weight: var(--wa-font-weight-semibold);
      color: var(--wa-color-text-quiet);
      padding: 0;
      margin-bottom: var(--wa-space-xs);
    }

    /* wa-stack equivalent: vertical flex with gap */
    .stack {
      display: flex;
      flex-direction: column;
      gap: var(--wa-space-xs);
    }

    /* wa-cluster equivalent: horizontal flex with wrapping */
    .cluster {
      display: flex;
      flex-wrap: wrap;
      gap: var(--wa-space-s);
    }

    fieldset + fieldset {
      margin-top: var(--wa-space-m);
    }

    label {
      display: flex;
      align-items: center;
      gap: var(--wa-space-xs);
      font-size: var(--wa-font-size-s);
      color: var(--wa-color-text-normal);
      cursor: pointer;
    }

    input[type='radio'],
    input[type='checkbox'] {
      accent-color: var(--wa-color-brand-600);
      width: 14px;
      height: 14px;
      cursor: pointer;
      flex-shrink: 0;
    }

    /* ── Spacing between top-level sections in the dialog ─────────────── */
    wa-details {
      margin-top: var(--wa-space-m);
    }

    wa-divider {
      margin: var(--wa-space-m) 0;
    }

    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: var(--wa-space-s);
    }
  `;

  @query('wa-dialog') private _dialog!: HTMLElement & { show(): void; requestClose(): void; };

  /** Local draft — edited in the dialog, committed on save */
  @state() private _draft: UserPreferences | null = null;

  open(): void {
    const p = preferencesSignal.get();
    this._draft = JSON.parse(JSON.stringify(p)) as UserPreferences;
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

  // ── draft helpers ─────────────────────────────────────────────────────────

  private _setGlobalStatus(v: VisibilityStatus): void {
    if (!this._draft) return;
    this._draft = {
      ...this._draft,
      visibility: { ...this._draft.visibility, status: v },
    };
  }

  private _setGlobalRoute(field: keyof VisibilityRouteConfig, checked: boolean): void {
    if (!this._draft) return;
    this._draft = {
      ...this._draft,
      visibility: {
        ...this._draft.visibility,
        route: { ...this._draft.visibility?.route, [field]: checked },
      },
    };
  }

  private _setPosition(v: CommentBarPosition): void {
    if (!this._draft) return;
    this._draft = {
      ...this._draft,
      commentBar: { ...this._draft.commentBar, position: v },
    };
  }

  private _setBarStatus(v: VisibilityStatus): void {
    if (!this._draft) return;
    this._draft = {
      ...this._draft,
      commentBar: {
        ...this._draft.commentBar,
        visibility: { ...this._draft.commentBar?.visibility, status: v },
      },
    };
  }

  private _setBarRoute(field: keyof VisibilityRouteConfig, checked: boolean): void {
    if (!this._draft) return;
    this._draft = {
      ...this._draft,
      commentBar: {
        ...this._draft.commentBar,
        visibility: {
          ...this._draft.commentBar?.visibility,
          route: { ...this._draft.commentBar?.visibility?.route, [field]: checked },
        },
      },
    };
  }

  private _setPanelStatus(v: VisibilityStatus): void {
    if (!this._draft) return;
    this._draft = {
      ...this._draft,
      ui: {
        ...this._draft.ui,
        visibility: { ...this._draft.ui?.visibility, status: v },
      },
    };
  }

  private _setPanelRoute(field: keyof VisibilityRouteConfig, checked: boolean): void {
    if (!this._draft) return;
    this._draft = {
      ...this._draft,
      ui: {
        ...this._draft.ui,
        visibility: {
          ...this._draft.ui?.visibility,
          route: { ...this._draft.ui?.visibility?.route, [field]: checked },
        },
      },
    };
  }

  // ── render helpers ─────────────────────────────────────────────────────────

  private _renderStatusFieldset(
    name: string,
    current: VisibilityStatus | undefined,
    defaultLabel: string,
    onChange: (v: VisibilityStatus) => void,
  ): TemplateResult {
    const val = current ?? 'non-approved';
    return html`
      <fieldset class="stack">
        <legend>Status</legend>
        <label>
          <input
            type="radio"
            name=${name}
            value="always"
            .checked=${val === 'always'}
            @change=${() => onChange('always')}
          />
          Always
        </label>
        <label>
          <input
            type="radio"
            name=${name}
            value="non-approved"
            .checked=${val === 'non-approved'}
            @change=${() => onChange('non-approved')}
          />
          ${defaultLabel}
        </label>
        <label>
          <input
            type="radio"
            name=${name}
            value="never"
            .checked=${val === 'never'}
            @change=${() => onChange('never')}
          />
          Never
        </label>
      </fieldset>
    `;
  }

  private _renderRouteFieldset(
    route: VisibilityRouteConfig | undefined,
    onChange: (field: keyof VisibilityRouteConfig, checked: boolean) => void,
  ): TemplateResult {
    return html`
      <fieldset class="cluster">
        <legend>Route matching</legend>
        <label>
          <input
            type="checkbox"
            .checked=${route?.domain ?? false}
            @change=${(e: Event) => onChange('domain', (e.target as HTMLInputElement).checked)}
          />
          Domain
        </label>
        <label>
          <input
            type="checkbox"
            .checked=${route?.path ?? false}
            @change=${(e: Event) => onChange('path', (e.target as HTMLInputElement).checked)}
          />
          Path
        </label>
        <label>
          <input
            type="checkbox"
            .checked=${route?.params ?? false}
            @change=${(e: Event) => onChange('params', (e.target as HTMLInputElement).checked)}
          />
          Query Params
        </label>
      </fieldset>
    `;
  }

  private _renderPositionFieldset(
    current: CommentBarPosition | undefined,
    onChange: (v: CommentBarPosition) => void,
  ): TemplateResult {
    const val = current ?? 'top-left';
    return html`
      <fieldset class="stack">
        <legend>Position</legend>
        <label>
          <input
            type="radio"
            name="bar-position"
            value="top-left"
            .checked=${val === 'top-left'}
            @change=${() => onChange('top-left')}
          />
          Top Left
        </label>
        <label>
          <input
            type="radio"
            name="bar-position"
            value="top-right"
            .checked=${val === 'top-right'}
            @change=${() => onChange('top-right')}
          />
          Top Right
        </label>
        <label>
          <input
            type="radio"
            name="bar-position"
            value="bottom-left"
            .checked=${val === 'bottom-left'}
            @change=${() => onChange('bottom-left')}
          />
          Bottom Left
        </label>
        <label>
          <input
            type="radio"
            name="bar-position"
            value="bottom-right"
            .checked=${val === 'bottom-right'}
            @change=${() => onChange('bottom-right')}
          />
          Bottom Right
        </label>
      </fieldset>
    `;
  }

  render(): TemplateResult {
    const draft = this._draft ?? preferencesSignal.get();
    const barHasOverride =
      draft.commentBar?.visibility?.status !== undefined ||
      draft.commentBar?.visibility?.route !== undefined;
    const panelHasOverride =
      draft.ui?.visibility?.status !== undefined || draft.ui?.visibility?.route !== undefined;

    return html`
      <wa-dialog label="Preferences">
        <!-- ── Visibility (global defaults) ──────────────────────────── -->
        <p class="section-heading">Visibility</p>
        ${this._renderStatusFieldset(
      'global-status',
      draft.visibility?.status,
      'Only Non-Approved (default)',
      (v) => this._setGlobalStatus(v),
    )}
        ${this._renderRouteFieldset(draft.visibility?.route, (f, c) => this._setGlobalRoute(f, c))}

        <wa-divider></wa-divider>

        <!-- ── Comment Bar ────────────────────────────────────────────── -->
        <p class="section-heading">Comment Bar</p>
        ${this._renderPositionFieldset(draft.commentBar?.position, (v) => this._setPosition(v))}

        <wa-details summary="Custom visibility" ?open=${barHasOverride}>
          ${this._renderStatusFieldset(
      'bar-status',
      draft.commentBar?.visibility?.status,
      'Only Non-Approved',
      (v) => this._setBarStatus(v),
    )}
          ${this._renderRouteFieldset(draft.commentBar?.visibility?.route, (f, c) =>
      this._setBarRoute(f, c),
    )}
        </wa-details>

        <wa-divider></wa-divider>

        <!-- ── Comment Panel ──────────────────────────────────────────── -->
        <p class="section-heading">Comment Panel</p>

        <wa-details summary="Custom visibility" ?open=${panelHasOverride}>
          ${this._renderStatusFieldset(
      'panel-status',
      draft.ui?.visibility?.status,
      'Only Non-Approved',
      (v) => this._setPanelStatus(v),
    )}
          ${this._renderRouteFieldset(draft.ui?.visibility?.route, (f, c) =>
      this._setPanelRoute(f, c),
    )}
        </wa-details>

        <div slot="footer" class="dialog-footer">
          <wa-button variant="neutral" @click=${this._cancel}>Cancel</wa-button>
          <wa-button variant="brand" @click=${this._save}>Save</wa-button>
        </div>
      </wa-dialog>
    `;
  }
}
