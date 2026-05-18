/**
 * Intent bus — decouples UI components from transport.
 *
 * Components dispatch typed intents when users take action (e.g. change a
 * knob, delete an comment). A transport adapter (ws-adapter.ts in the
 * client package) subscribes and translates intents into WebSocket messages.
 *
 * No WebSocket or browser-API imports here — this module is transport-agnostic.
 */

import type { CommentThread } from '@design-bridge/protocol';

// ── Intent types ──────────────────────────────────────────────────────────────

export type TweakChangeIntent = { type: 'tweak:change'; marker: string; value: string; };
export type TweakRevertIntent = { type: 'tweak:revert'; };
export type TweakApplyIntent = { type: 'tweak:apply'; markers: string[]; };
export type TweakDiscardIntent = { type: 'tweak:discard'; };
export type TweakDiscardCommentIntent = {
  type: 'tweak:discard-comment';
  commentId: string;
};
export type TweakAcceptCommentIntent = { type: 'tweak:accept-comment'; commentId: string; };
export type TweakAcceptOneIntent = {
  type: 'tweak:accept-one';
  commentId: string;
  marker: string;
};
export type TweakDismissOneIntent = {
  type: 'tweak:dismiss-one';
  commentId: string;
  marker: string;
};

export type CommentDeleteIntent = { type: 'comment:delete'; id: string; };
export type CommentClearIntent = { type: 'comment:clear'; };
export type CommentOpenIntent = { type: 'comment:open'; id: string; };
export type CommentSaveIntent = { type: 'comment:save'; comment: CommentThread; };
export type CommentCancelIntent = { type: 'comment:cancel'; id: string; };
export type CommentResolveIntent = { type: 'comment:resolve'; id: string; };
export type CommentBadgeClickIntent = { type: 'comment:badge-click'; id: string; };
export type CommentBarClickIntent = { type: 'comment:bar-click'; id: string; };
export type CommentReadIntent = { type: 'comment:read'; id: string; };

export type PanelTabIntent = { type: 'panel:set-tab'; tab: 'tweaks' | 'comments'; };
export type PanelCollapseIntent = { type: 'panel:set-collapsed'; collapsed: boolean; };

export type ComponentIntent =
  | TweakChangeIntent
  | TweakRevertIntent
  | TweakApplyIntent
  | TweakDiscardIntent
  | TweakDiscardCommentIntent
  | TweakAcceptCommentIntent
  | TweakAcceptOneIntent
  | TweakDismissOneIntent
  | CommentDeleteIntent
  | CommentClearIntent
  | CommentOpenIntent
  | CommentSaveIntent
  | CommentCancelIntent
  | CommentResolveIntent
  | CommentBadgeClickIntent
  | CommentBarClickIntent
  | CommentReadIntent
  | PanelTabIntent
  | PanelCollapseIntent;

// ── Bus ───────────────────────────────────────────────────────────────────────

const _intentTarget = new EventTarget();

export function dispatchIntent(intent: ComponentIntent): void {
  _intentTarget.dispatchEvent(new CustomEvent('db:intent', { detail: intent }));
}

export function onIntent(handler: (intent: ComponentIntent) => void): () => void {
  const listener = (e: Event): void => handler((e as CustomEvent<ComponentIntent>).detail);
  _intentTarget.addEventListener('db:intent', listener);
  return () => _intentTarget.removeEventListener('db:intent', listener);
}
