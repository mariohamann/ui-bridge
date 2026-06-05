// ── Styles ────────────────────────────────────────────────────────────────────
export { uiBridgeHostTokenStyles, UIB_HIGHLIGHT_COLOR } from './styles/tokens.js';

// ── Signal stores ─────────────────────────────────────────────────────────────
export { knobsSignal, updateKnobs, getKnobByMarker } from './state/knobs-store.js';
export {
  commentsSignal,
  updateComments,
  orphanedIdsSignal,
  markOrphaned,
  markUnorphaned,
} from './state/comments-store.js';
export {
  preferencesSignal,
  updatePreferences,
  getEffectivePreferences,
} from './state/preferences-store.js';
export { matchesCurrentRoute } from './state/route-matching.js';

// ── Intent bus ────────────────────────────────────────────────────────────────
export { dispatchIntent, onIntent } from './state/intents.js';
export type {
  ComponentIntent,
  CommentSaveIntent,
  CommentCancelIntent,
  CommentResolveIntent,
  CommentBadgeClickIntent,
  CommentBarClickIntent,
  PreferencesUpdateIntent,
} from './state/intents.js';

// ── Comment item ───────────────────────────────────────────────────────────
export { UibComment } from './comment/uib-comment.js';
export { UibKnob } from './comment/uib-knob.js';
export { uid, shortLabel, formatTweakReply, getSourceInfo } from './comment/uib-comment.utils.js';

// ── Comment bar ──────────────────────────────────────────────────────────────
export { UibCommentBar } from './orphaned/uib-comment-bar.js';
export { UibPreferencesDialog } from './comment/uib-preferences-dialog.js';
