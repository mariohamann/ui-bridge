// ── Styles ────────────────────────────────────────────────────────────────────
export { designBridgeHostTokenStyles, DB_HIGHLIGHT_COLOR } from './styles/tokens.js';

// ── Signal stores ─────────────────────────────────────────────────────────────
export { knobsSignal, updateKnobs, getKnobByMarker } from './state/knobs-store.js';
export { annotationsSignal, updateAnnotations } from './state/annotations-store.js';

// ── Intent bus ────────────────────────────────────────────────────────────────
export { dispatchIntent, onIntent } from './state/intents.js';
export type {
  ComponentIntent,
  AnnotationSaveIntent,
  AnnotationCancelIntent,
  AnnotationResolveIntent,
  AnnotationBadgeClickIntent,
} from './state/intents.js';

// ── Annotation item ───────────────────────────────────────────────────────────
export { DbAnnotation } from './annotation/db-annotation.js';
export { DbKnob } from './annotation/db-knob.js';
export {
  uid,
  shortLabel,
  formatTweakReply,
  getSourceInfo,
} from './annotation/db-annotation.utils.js';
