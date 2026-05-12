/**
 * Intent bus — decouples UI components from transport.
 *
 * Components dispatch typed intents when users take action (e.g. change a
 * knob, delete an annotation). A transport adapter (ws-adapter.ts in the
 * client package) subscribes and translates intents into WebSocket messages.
 *
 * No WebSocket or browser-API imports here — this module is transport-agnostic.
 */

// ── Intent types ──────────────────────────────────────────────────────────────

export type TweakChangeIntent = { type: 'tweak:change'; marker: string; value: string; };
export type TweakRevertIntent = { type: 'tweak:revert'; };
export type TweakApplyIntent = { type: 'tweak:apply'; markers: string[]; };
export type TweakDiscardIntent = { type: 'tweak:discard'; };
export type TweakAcceptAnnotationIntent = { type: 'tweak:accept-annotation'; annotationId: string; };
export type TweakAcceptOneIntent = { type: 'tweak:accept-one'; annotationId: string; marker: string; };
export type TweakDismissOneIntent = { type: 'tweak:dismiss-one'; annotationId: string; marker: string; };

export type AnnotationDeleteIntent = { type: 'annotation:delete'; id: string; };
export type AnnotationClearIntent = { type: 'annotation:clear'; };
export type AnnotationOpenIntent = { type: 'annotation:open'; id: string; };

export type PanelTabIntent = { type: 'panel:set-tab'; tab: 'tweaks' | 'annotations'; };
export type PanelCollapseIntent = { type: 'panel:set-collapsed'; collapsed: boolean; };

export type ComponentIntent =
  | TweakChangeIntent
  | TweakRevertIntent
  | TweakApplyIntent
  | TweakDiscardIntent
  | TweakAcceptAnnotationIntent
  | TweakAcceptOneIntent
  | TweakDismissOneIntent
  | AnnotationDeleteIntent
  | AnnotationClearIntent
  | AnnotationOpenIntent
  | PanelTabIntent
  | PanelCollapseIntent;

// ── Bus ───────────────────────────────────────────────────────────────────────

const _intentTarget = new EventTarget();

export function dispatchIntent(intent: ComponentIntent): void {
  _intentTarget.dispatchEvent(new CustomEvent('db:intent', { detail: intent }));
}

export function onIntent(handler: (intent: ComponentIntent) => void): () => void {
  const listener = (e: Event): void =>
    handler((e as CustomEvent<ComponentIntent>).detail);
  _intentTarget.addEventListener('db:intent', listener);
  return () => _intentTarget.removeEventListener('db:intent', listener);
}
