import '@design-bridge/components/comment';
import { LitElement, html, type TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import type { CommentThread } from '@design-bridge/protocol';
import { commentsSignal, orphanedIdsSignal } from '../state/comments-store.js';
import { dbCommentBarStyles } from './db-comment-bar.styles.js';

const _DbCommentBarBase = SignalWatcher(LitElement) as unknown as typeof LitElement;

/** Beyond this count a "+N" indicator appears */
const SHOW_OVERFLOW_AFTER = 3;

function stableRanks(threads: CommentThread[]): Map<string, number> {
  const open = [...threads]
    .filter((t) => !t.meta.resolvedAt)
    .sort((a, b) => (a.meta.createdAt || 0) - (b.meta.createdAt || 0));
  return new Map(open.map((t, i) => [t.meta.id, i + 1]));
}

/**
 * db-comment-bar — always-visible fixed pill (top-left) showing all open
 * comment badges.
 *
 * Collapsed: all badges present in DOM, the ones beyond SHOW_OVERFLOW_AFTER
 * are hidden behind the stack (smaller, lower opacity). "+N" pill shows count.
 * Hovered: all badges fan out vertically with full opacity.
 */
@customElement('db-comment-bar')
export class DbCommentBar extends _DbCommentBarBase {
  static styles = dbCommentBarStyles;

  connectedCallback(): void {
    super.connectedCallback();
    this.classList.add('wa-dark');
  }

  render(): TemplateResult {
    const allThreads = commentsSignal.get();
    const orphanedIds = orphanedIdsSignal.get();
    const open = allThreads.filter((t) => !t.meta.resolvedAt);

    if (open.length === 0) return html``;

    const ranks = stableRanks(allThreads);
    const overflowCount = Math.max(0, open.length - SHOW_OVERFLOW_AFTER);
    // Newest first so index 0 = top of stack
    const newest = [...open]
      .sort((a, b) => (a.meta.createdAt || 0) - (b.meta.createdAt || 0))
      .reverse();
    const visible = newest.slice(0, SHOW_OVERFLOW_AFTER);
    const hidden = newest.slice(SHOW_OVERFLOW_AFTER);

    return html`
      <div class="bar visible">
        ${visible.map((thread, i) => {
          const isOrphaned = orphanedIds.has(thread.meta.id);
          return html`
            <db-comment
              style="z-index:${SHOW_OVERFLOW_AFTER - i}"
              .comment=${thread}
              .index=${(ranks.get(thread.meta.id) ?? 1) - 1}
              ?docked=${true}
              ?orphaned=${isOrphaned}
            ></db-comment>
          `;
        })}
        ${overflowCount > 0 ? html`<div class="overflow-pill">+${overflowCount}</div>` : ''}
        ${hidden.map((thread) => {
          const isOrphaned = orphanedIds.has(thread.meta.id);
          return html`
            <db-comment
              class="overflow-hidden"
              .comment=${thread}
              .index=${(ranks.get(thread.meta.id) ?? 1) - 1}
              ?docked=${true}
              ?orphaned=${isOrphaned}
            ></db-comment>
          `;
        })}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'db-comment-bar': DbCommentBar;
  }
}
