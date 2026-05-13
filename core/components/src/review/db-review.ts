import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/divider/divider.js';
import '@awesome.me/webawesome/dist/components/dropdown/dropdown.js';
import '@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js';
import '@awesome.me/webawesome/dist/components/relative-time/relative-time.js';
import '@awesome.me/webawesome/dist/components/switch/switch.js';
import '@awesome.me/webawesome/dist/components/tag/tag.js';
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import type { Annotation } from '@design-bridge/protocol';
import { annotationsSignal } from '../state/annotations-store.js';
import { dispatchIntent } from '../state/intents.js';
import { dbReviewStyles } from './db-review.styles.js';

// Cast away the private mixin type — runtime signal-watching is preserved,
// TypeScript sees plain LitElement and avoids the TS4020/TS4023 mixin errors.
const _DbReviewBase = SignalWatcher(LitElement) as unknown as typeof LitElement;

// ── Helpers ──────────────────────────────────────────────────────────────────

function pageLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === '/' ? u.host : u.host + u.pathname;
  } catch {
    return url || '';
  }
}

function sourceLabel(ann: Annotation): string {
  if (ann.source?.file) {
    const filename = ann.source.file.split('/').pop() ?? '';
    return filename.replace(/\.[^.]+$/, '');
  }
  return ann.labels?.[0] || pageLabel(ann.pageUrl ?? '') || '';
}

function stableRanks(annotations: Annotation[]): Map<string, number> {
  const open = [...annotations]
    .filter((a) => !a.resolvedAt)
    .sort((a, b) => (a.createdAt || a.timestamp || 0) - (b.createdAt || b.timestamp || 0));
  return new Map(open.map((a, i) => [a.id, i + 1]));
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * db-review — full-page annotation list.
 *
 * Transport-free: reads annotations from the shared signal store.
 * All user actions dispatch ComponentIntents to be handled by the entry point
 * (client/review/index.ts) which translates them to WebSocket messages.
 */
@customElement('db-review')
export class DbReview extends _DbReviewBase {
  /** Reflects the WebSocket connection status — set by the entry point. */
  @property({ type: Boolean }) connected = false;
  @property({ type: Boolean, attribute: 'show-resolved' }) showResolved = false;

  static styles = dbReviewStyles;

  connectedCallback(): void {
    super.connectedCallback();
    this.classList.add('wa-dark');
  }

  private _resolve(ann: Annotation): void {
    dispatchIntent({
      type: 'annotation:save',
      annotation: { ...ann, resolvedAt: Date.now(), timestamp: Date.now() },
    });
  }

  private _unresolve(ann: Annotation): void {
    const { resolvedAt: _removed, ...rest } = ann as Annotation & { resolvedAt?: number };
    dispatchIntent({ type: 'annotation:save', annotation: { ...rest, timestamp: Date.now() } });
  }

  private _delete(id: string): void {
    dispatchIntent({ type: 'annotation:delete', id });
  }

  private _focus(id: string): void {
    dispatchIntent({ type: 'annotation:open', id });
  }

  private _copyLink(ann: Annotation): void {
    navigator.clipboard.writeText(ann.pageUrl || location.href).catch(() => {});
  }

  private _renderRow(ann: Annotation, rank: Map<string, number>) {
    const resolved = !!ann.resolvedAt;
    const idx = resolved ? null : rank.get(ann.id);
    const ts = ann.createdAt ?? ann.timestamp;
    const replies = (ann.replies ?? []).filter((r) => r.type === 'comment');
    const extraReplies = replies.length - 1;

    return html`
      <div
        class="row${resolved ? ' resolved' : ''}"
        @click=${(e: Event) => {
          if (!(e.target as Element).closest('wa-dropdown')) this._focus(ann.id);
        }}
      >
        <!-- Index badge -->
        <wa-badge
          pill
          variant=${resolved ? 'success' : 'brand'}
          appearance="filled"
          style="flex-shrink:0;margin-top:2px;"
          >${resolved ? '✓' : idx}</wa-badge
        >

        <div class="body">
          <div class="meta">
            <span class="src-label">${sourceLabel(ann)}</span>
            <wa-relative-time
              sync
              .date=${new Date(ts)}
              style="font-size:var(--wa-font-size-2xs);color:var(--wa-color-text-quiet);"
            ></wa-relative-time>
            ${resolved
              ? html`<wa-tag variant="success" appearance="outlined" size="s">resolved</wa-tag>`
              : ''}
          </div>
          ${ann.comment
            ? html`<div class="comment">${ann.comment}</div>`
            : html`<div class="comment empty-comment">No comment</div>`}
          ${extraReplies > 0
            ? html`<div class="footer">
                <wa-tag variant="neutral" appearance="outlined" size="s"
                  >${extraReplies} repl${extraReplies === 1 ? 'y' : 'ies'}</wa-tag
                >
              </div>`
            : ''}
        </div>

        <!-- Per-row actions dropdown -->
        <wa-dropdown
          size="s"
          class="row-menu"
          @click=${(e: Event) => e.stopPropagation()}
          @wa-select=${(e: CustomEvent) => {
            const val = e.detail.item.value;
            if (val === 'resolve') this._resolve(ann);
            else if (val === 'unresolve') this._unresolve(ann);
            else if (val === 'copy') this._copyLink(ann);
            else if (val === 'delete') this._delete(ann.id);
          }}
        >
          <wa-button slot="trigger" appearance="plain" size="s" title="More">···</wa-button>
          ${!resolved
            ? html`<wa-dropdown-item value="resolve">✓ Mark resolved</wa-dropdown-item>`
            : html`<wa-dropdown-item value="unresolve">↩ Unresolve</wa-dropdown-item>`}
          <wa-dropdown-item value="copy">Copy page link</wa-dropdown-item>
          <wa-divider></wa-divider>
          <wa-dropdown-item value="delete" variant="danger">Delete</wa-dropdown-item>
        </wa-dropdown>
      </div>
    `;
  }

  render() {
    const annotations = annotationsSignal.get();
    const sorted = [...annotations].sort(
      (a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0),
    );
    const visible = this.showResolved ? sorted : sorted.filter((a) => !a.resolvedAt);
    const openCount = annotations.filter((a) => !a.resolvedAt).length;
    const rank = stableRanks(annotations);

    return html`
      <div class="bar">
        <span class="bar-title"><strong>Design Bridge</strong> — Annotations</span>
        <wa-badge pill variant=${openCount ? 'brand' : 'neutral'} appearance="filled"
          >${openCount}</wa-badge
        >
        <span class="dot${this.connected ? ' ok' : ''}"></span>
        <span class="toggle-label">Show resolved</span>
        <wa-switch
          size="s"
          ?checked=${this.showResolved}
          @wa-change=${(e: Event) => {
            this.showResolved = (e.target as HTMLInputElement).checked;
          }}
        ></wa-switch>
      </div>
      <div class="list">
        ${visible.length === 0
          ? html`
              <div class="empty">
                ${annotations.length === 0
                  ? html`No annotations yet.<br /><span style="color:var(--wa-color-text-quiet)"
                        >Hold Alt+Shift and click any element in your app.</span
                      >`
                  : 'All annotations resolved.'}
              </div>
            `
          : visible.map((ann) => this._renderRow(ann, rank))}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'db-review': DbReview;
  }
}
