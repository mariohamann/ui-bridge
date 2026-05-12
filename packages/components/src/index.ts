// ── Styles ────────────────────────────────────────────────────────────────────
export { designBridgeHostTokenStyles } from './styles/tokens.js';

// ── Signal stores ─────────────────────────────────────────────────────────────
export { knobsSignal, updateKnobs, getKnobByMarker } from './state/knobs-store.js';
export { annotationsSignal, updateAnnotations } from './state/annotations-store.js';

// ── Intent bus ────────────────────────────────────────────────────────────────
export { dispatchIntent, onIntent } from './state/intents.js';
export type { ComponentIntent, AnnotationSaveIntent, AnnotationCancelIntent, AnnotationResolveIntent, AnnotationBadgeClickIntent } from './state/intents.js';

// ── Annotation item ───────────────────────────────────────────────────────────
export { BridgeAnnotationItem } from './annotation/bridge-annotation-item.js';
export { uid, shortLabel, formatTweakReply } from './annotation/annotation-item-utils.js';
