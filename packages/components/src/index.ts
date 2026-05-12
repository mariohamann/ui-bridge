// ── Styles ────────────────────────────────────────────────────────────────────
export { designBridgeHostTokenStyles } from './styles/tokens.js';
export { baseControlStyles } from './styles/base-controls.js';
export { panelLayoutStyles } from './styles/panel-layout.js';

// ── Signal stores ─────────────────────────────────────────────────────────────
export { knobsSignal, updateKnobs, getKnobByMarker } from './state/knobs-store.js';
export { annotationsSignal, updateAnnotations } from './state/annotations-store.js';
export {
  activeTabSignal,
  collapsedSignal,
  snapSignal,
  setActiveTab,
  setCollapsed,
  setSnap,
  hydrateFromPersisted,
} from './state/panel-ui-store.js';
export type { PanelPersistedState, SnapPosition, ActiveTab } from './state/panel-ui-store.js';

// ── Intent bus ────────────────────────────────────────────────────────────────
export { dispatchIntent, onIntent } from './state/intents.js';
export type { ComponentIntent } from './state/intents.js';
