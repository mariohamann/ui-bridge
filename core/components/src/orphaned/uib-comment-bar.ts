import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '../comment/uib-preferences-dialog.js';
import '@ui-bridge/components/comment';
import { LitElement, html, type TemplateResult } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import type { CommentThread } from '@ui-bridge/protocol';
import { commentsSignal, orphanedIdsSignal } from '../state/comments-store.js';
import { preferencesSignal } from '../state/preferences-store.js';
import { matchesCurrentRoute } from '../state/route-matching.js';
import { dbCommentBarStyles } from './uib-comment-bar.styles.js';
import type { UibPreferencesDialog } from '../comment/uib-preferences-dialog.js';

const _UibCommentBarBase = SignalWatcher(LitElement) as unknown as typeof LitElement;

/** Beyond this count a "+N" indicator appears */
const SHOW_OVERFLOW_AFTER = 3;

function stableRanks(threads: CommentThread[]): Map<string, number> {
  const open = [...threads]
    .filter((t) => !t.meta.resolvedAt)
    .sort((a, b) => (a.meta.createdAt || 0) - (b.meta.createdAt || 0));
  return new Map(open.map((t, i) => [t.meta.id, i + 1]));
}

/**
 * uib-comment-bar — always-visible fixed pill (top-left) showing all open
 * comment badges.
 *
 * Collapsed: all badges present in DOM, the ones beyond SHOW_OVERFLOW_AFTER
 * are hidden behind the stack (smaller, lower opacity). "+N" pill shows count.
 * Hovered: all badges fan out vertically with full opacity.
 */
@customElement('uib-comment-bar')
export class UibCommentBar extends _UibCommentBarBase {
  static styles = dbCommentBarStyles;

  @query('uib-preferences-dialog')
  private _prefsDialog!: UibPreferencesDialog;

  connectedCallback(): void {
    super.connectedCallback();
    this.classList.add('wa-dark');
  }

  private _openPreferences(): void {
    this._prefsDialog?.open();
  }

  render(): TemplateResult {
    const allThreads = commentsSignal.get();
    const orphanedIds = orphanedIdsSignal.get();
    const prefs = preferencesSignal.get();

    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

    // Filter by route matching
    const routeFiltered = allThreads.filter(
      (t) =>
        !t.meta.resolvedAt && matchesCurrentRoute(t.meta.pageUrl, currentUrl, prefs.routeMatching),
    );

    // Apply knob visibility filter for comment bar
    const open = routeFiltered.filter((t) => {
      if (prefs.knobVisibilityBar === 'always') return true;
      if (prefs.knobVisibilityBar === 'never') return false;
      // 'non-approved': show threads that have no accepted-tweak-only entries, i.e. have pending tweaks or plain comments
      const hasPendingTweak = t.comments.some(
        (c) => c.type === 'tweak' && c.tweakStatus === 'pending',
      );
      const hasNoTweaks = t.comments.every((c) => c.type !== 'tweak');
      return hasPendingTweak || hasNoTweaks;
    });

    const ranks = stableRanks(allThreads);
    const overflowCount = Math.max(0, open.length - SHOW_OVERFLOW_AFTER);
    // Newest first so index 0 = top of stack
    const newest = [...open]
      .sort((a, b) => (a.meta.createdAt || 0) - (b.meta.createdAt || 0))
      .reverse();
    const visible = newest.slice(0, SHOW_OVERFLOW_AFTER);
    const hidden = newest.slice(SHOW_OVERFLOW_AFTER);

    return html`
      <uib-preferences-dialog></uib-preferences-dialog>
      <div class="bar bar--${prefs.commentBarPosition}">
        <div class="bar__comments">
          ${visible.map((thread, i) => {
            const isOrphaned = orphanedIds.has(thread.meta.id);
            return html`
              <uib-comment
                style="z-index:${SHOW_OVERFLOW_AFTER - i}"
                .comment=${thread}
                .index=${(ranks.get(thread.meta.id) ?? 1) - 1}
                ?docked=${true}
                ?orphaned=${isOrphaned}
              ></uib-comment>
            `;
          })}
          ${overflowCount > 0 ? html`<div class="overflow-pill">+${overflowCount}</div>` : ''}
          ${hidden.map((thread) => {
            const isOrphaned = orphanedIds.has(thread.meta.id);
            return html`
              <uib-comment
                class="overflow-hidden"
                .comment=${thread}
                .index=${(ranks.get(thread.meta.id) ?? 1) - 1}
                ?docked=${true}
                ?orphaned=${isOrphaned}
              ></uib-comment>
            `;
          })}
        </div>
        <button class="preferences-btn" @click=${this._openPreferences} title="Preferences">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
            />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'uib-comment-bar': UibCommentBar;
  }
}
