// ── Styles ────────────────────────────────────────────────────────────────────
export { designBridgeHostTokenStyles, DB_HIGHLIGHT_COLOR } from './styles/tokens.js';

// ── Signal stores ─────────────────────────────────────────────────────────────
export { knobsSignal, updateKnobs, getKnobByMarker } from './state/knobs-store.js';
export {
  commentsSignal,
  updateComments,
  orphanedIdsSignal,
  markOrphaned,
  markUnorphaned,
} from './state/comments-store.js';

// ── Intent bus ────────────────────────────────────────────────────────────────
export { dispatchIntent, onIntent } from './state/intents.js';
export type {
  ComponentIntent,
  CommentSaveIntent,
  CommentCancelIntent,
  CommentResolveIntent,
  CommentBadgeClickIntent,
} from './state/intents.js';

// ── Comment item ───────────────────────────────────────────────────────────
export { DbComment } from './comment/db-comment.js';
export { DbKnob } from './comment/db-knob.js';
export { uid, shortLabel, formatTweakReply, getSourceInfo } from './comment/db-comment.utils.js';

// ── Orphaned bar ─────────────────────────────────────────────────────────────
export { DbOrphanedBar } from './orphaned/db-orphaned-bar.js';
