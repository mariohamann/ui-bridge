import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/divider/divider.js';
import '@awesome.me/webawesome/dist/components/dropdown/dropdown.js';
import '@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js';
import '@awesome.me/webawesome/dist/components/relative-time/relative-time.js';
import '@awesome.me/webawesome/dist/components/switch/switch.js';
import '@awesome.me/webawesome/dist/components/tag/tag.js';
import '@awesome.me/webawesome/dist/components/textarea/textarea.js';
import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import type { CommentThread, TweakCommentEntry } from '@design-bridge/protocol';
import { commentsSignal } from '../state/comments-store.js';
import { dispatchIntent } from '../state/intents.js';
import { dbReviewStyles } from './db-review.styles.js';

// Cast away the private mixin type — runtime signal-watching is preserved,
// TypeScript sees plain LitElement and avoids the TS4020/TS4023 mixin errors.
const _DbReviewBase = SignalWatcher(LitElement) as unknown as typeof LitElement;

// ── Helpers ──────────────────────────────────────────────────────────────────

function sourceLabel(ann: CommentThread): string {
  const source = ann.elements?.[0]?.source;
  if (source?.file) {
    const filename = source.file.split('/').pop() ?? '';
    return filename.replace(/\.[^.]+$/, '');
  }
  const el = ann.elements?.[0];
  if (el) {
    let label = el.tag;
    if (el.id) label += `#${el.id}`;
    else if (el.classes.length) label += `.${el.classes[0]}`;
    return label;
  }
  try {
    const u = new URL(ann.meta.pageUrl);
    return u.pathname === '/' ? u.host : u.host + u.pathname;
  } catch {
    return ann.meta.pageUrl || '';
  }
}

function stableRanks(threads: CommentThread[]): Map<string, number> {
  const open = [...threads]
    .filter((a) => !a.meta.resolvedAt)
    .sort((a, b) => (a.meta.createdAt || 0) - (b.meta.createdAt || 0));
  return new Map(open.map((a, i) => [a.meta.id, i + 1]));
}

function activeTweak(thread: CommentThread): TweakCommentEntry | undefined {
  return [...(thread.comments ?? [])]
    .reverse()
    .find((c): c is TweakCommentEntry => c.type === 'tweak' && c.tweakStatus === 'pending');
}

/** Most recent tweak entry regardless of status — used for tag display. */
function latestTweak(thread: CommentThread): TweakCommentEntry | undefined {
  return [...(thread.comments ?? [])]
    .reverse()
    .find((c): c is TweakCommentEntry => c.type === 'tweak');
}

function firstCommentText(thread: CommentThread): string {
  return thread.comments.find((c) => c.type === 'comment')?.text ?? '';
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * db-review — full-page comment list.
 *
 * Transport-free: reads comments from the shared signal store.
 * All user actions dispatch ComponentIntents to be handled by the entry point
 * (client/review/index.ts) which translates them to WebSocket messages.
 */
@customElement('db-review')
export class DbReview extends _DbReviewBase {
  /** Reflects the WebSocket connection status — set by the entry point. */
  @property({ type: Boolean }) connected = false;
  @property({ type: Boolean, attribute: 'show-resolved' }) showResolved = false;
  @state() private _editingId: string | null = null;
  @state() private _editDraft = '';

  static styles = dbReviewStyles;

  connectedCallback(): void {
    super.connectedCallback();
    this.classList.add('wa-dark');
  }

  private _resolve(ann: CommentThread): void {
    dispatchIntent({
      type: 'comment:save',
      comment: { ...ann, meta: { ...ann.meta, resolvedAt: Date.now(), timestamp: Date.now() } },
    });
  }

  private _unresolve(ann: CommentThread): void {
    const { resolvedAt: _removed, ...metaRest } = ann.meta as typeof ann.meta & {
      resolvedAt?: number;
    };
    dispatchIntent({
      type: 'comment:save',
      comment: { ...ann, meta: { ...metaRest, timestamp: Date.now() } },
    });
  }

  private _delete(id: string): void {
    dispatchIntent({ type: 'comment:delete', id });
  }

  private _startEdit(ann: CommentThread): void {
    this._editingId = ann.meta.id;
    this._editDraft = firstCommentText(ann);
    this.updateComplete.then(() => {
      const ta = this.shadowRoot?.querySelector<HTMLElement>(
        `wa-textarea[data-edit-id="${ann.meta.id}"]`,
      );
      (ta as (HTMLElement & { focus: () => void }) | null)?.focus();
    });
  }

  private _saveEdit(ann: CommentThread): void {
    const text = this._editDraft.trim();
    if (!text) return;
    // Update the first text comment entry
    const comments = ann.comments.map((c, i) =>
      i === 0 && c.type === 'comment' ? { ...c, text } : c,
    );
    dispatchIntent({
      type: 'comment:save',
      comment: { ...ann, meta: { ...ann.meta, timestamp: Date.now() }, comments },
    });
    this._editingId = null;
    this._editDraft = '';
  }

  private _cancelEdit(): void {
    this._editingId = null;
    this._editDraft = '';
  }

  private _focus(id: string): void {
    dispatchIntent({ type: 'comment:open', id });
  }

  private _copyLink(ann: CommentThread): void {
    navigator.clipboard.writeText(ann.meta.pageUrl || location.href).catch(() => {});
  }

  private _renderRow(ann: CommentThread, rank: Map<string, number>) {
    const resolved = !!ann.meta.resolvedAt;
    const idx = resolved ? null : rank.get(ann.meta.id);
    const ts = ann.meta.createdAt ?? ann.meta.timestamp;
    const textEntries = ann.comments.filter((c) => c.type === 'comment');
    const extraReplies = textEntries.length - 1;
    const isAgent = ann.comments[0]?.author === 'agent';
    const tweak = latestTweak(ann);
    const tweakStatus = tweak?.tweakStatus;

    return html`
      <div
        class="row${resolved ? ' resolved' : ''}"
        @click=${(e: Event) => {
          if (!(e.target as Element).closest('wa-dropdown')) this._focus(ann.meta.id);
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
            ${isAgent
              ? html`<wa-tag variant="brand" appearance="outlined" size="s" title="Agent-authored"
                  >✦ Agent</wa-tag
                >`
              : ''}
            <wa-relative-time
              sync
              .date=${new Date(ts)}
              style="font-size:var(--wa-font-size-2xs);color:var(--wa-color-text-quiet);"
            ></wa-relative-time>
            ${resolved
              ? html`<wa-tag variant="success" appearance="outlined" size="s">resolved</wa-tag>`
              : ''}
            ${tweakStatus === 'accepted'
              ? html`<wa-tag variant="success" appearance="outlined" size="s"
                  >✓ tweak accepted</wa-tag
                >`
              : tweakStatus === 'discarded'
                ? html`<wa-tag variant="warning" appearance="outlined" size="s"
                    >✕ tweak discarded</wa-tag
                  >`
                : tweakStatus === 'pending' && activeTweak(ann)?.knob
                  ? html`<wa-tag variant="brand" appearance="outlined" size="s"
                      >⚙ tweak live</wa-tag
                    >`
                  : ''}
          </div>
          ${firstCommentText(ann)
            ? html`<div class="comment">
                ${this._editingId === ann.meta.id
                  ? html`
                      <wa-textarea
                        data-edit-id=${ann.meta.id}
                        class="inline-edit"
                        appearance="filled"
                        resize="auto"
                        size="xs"
                        .value=${this._editDraft}
                        @input=${(e: Event) => {
                          this._editDraft = (e.target as HTMLElement & { value: string }).value;
                        }}
                        @keydown=${(e: KeyboardEvent) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            this._saveEdit(ann);
                          } else if (e.key === 'Escape') {
                            e.stopPropagation();
                            this._cancelEdit();
                          }
                        }}
                        @click=${(e: Event) => e.stopPropagation()}
                      ></wa-textarea>
                      <div class="inline-edit-actions">
                        <wa-button
                          appearance="filled"
                          variant="brand"
                          size="xs"
                          ?disabled=${!this._editDraft.trim()}
                          @click=${(e: Event) => {
                            e.stopPropagation();
                            this._saveEdit(ann);
                          }}
                          >Save</wa-button
                        >
                        <wa-button
                          appearance="plain"
                          size="xs"
                          @click=${(e: Event) => {
                            e.stopPropagation();
                            this._cancelEdit();
                          }}
                          >Cancel</wa-button
                        >
                      </div>
                    `
                  : firstCommentText(ann)}
              </div>`
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
          size="xs"
          class="row-menu"
          @click=${(e: Event) => e.stopPropagation()}
          @wa-select=${(e: CustomEvent) => {
            const val = e.detail.item.value;
            if (val === 'resolve') this._resolve(ann);
            else if (val === 'unresolve') this._unresolve(ann);
            else if (val === 'copy') this._copyLink(ann);
            else if (val === 'edit') this._startEdit(ann);
            else if (val === 'delete') this._delete(ann.meta.id);
          }}
        >
          <wa-button slot="trigger" appearance="plain" size="xs" title="More">···</wa-button>
          ${!resolved
            ? html`<wa-dropdown-item value="resolve">✓ Mark resolved</wa-dropdown-item>`
            : html`<wa-dropdown-item value="unresolve">↩ Unresolve</wa-dropdown-item>`}
          ${!isAgent ? html`<wa-dropdown-item value="edit">✎ Edit</wa-dropdown-item>` : ''}
          <wa-dropdown-item value="copy">Copy page link</wa-dropdown-item>
          <wa-divider></wa-divider>
          <wa-dropdown-item value="delete" variant="danger">Delete</wa-dropdown-item>
        </wa-dropdown>
      </div>
    `;
  }

  render() {
    const comments = commentsSignal.get();
    const sorted = [...comments].sort(
      (a, b) =>
        (b.meta.createdAt || b.meta.timestamp || 0) - (a.meta.createdAt || a.meta.timestamp || 0),
    );
    const visible = this.showResolved ? sorted : sorted.filter((a) => !a.meta.resolvedAt);
    const openCount = comments.filter((a) => !a.meta.resolvedAt).length;
    const rank = stableRanks(comments);

    return html`
      <div class="bar">
        <span class="bar-title"><strong>Design Bridge</strong> — Comments</span>
        <wa-badge pill variant=${openCount ? 'brand' : 'neutral'} appearance="filled"
          >${openCount}</wa-badge
        >
        <span class="dot${this.connected ? ' ok' : ''}"></span>
        <span class="toggle-label">Show resolved</span>
        <wa-switch
          size="xs"
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
                ${comments.length === 0
                  ? html`No comments yet.<br /><span style="color:var(--wa-color-text-quiet)"
                        >Hold Alt+Shift and click any element in your app.</span
                      >`
                  : 'All comments resolved.'}
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
