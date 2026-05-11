// ─── Knob types ───────────────────────────────────────────────────────────────

export type TweakKnobType = 'number' | 'color' | 'string' | 'boolean' | 'select' | 'button-group';

export interface TweakKnob {
  marker: string;
  label: string;
  type: TweakKnobType;
  value: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Record<string, string>;
}

// ─── Browser → Server ────────────────────────────────────────────────────────

export interface TweakChangeMsg {
  type: 'tweak:change';
  payload: { marker: string; value: string; };
}

export interface TweakFinalizeMsg {
  type: 'tweak:finalize';
  payload: { markers: string[]; };
}

export interface TweakResetMsg {
  type: 'tweak:reset';
  payload: { marker: string; };
}

export interface TweakResetAllMsg {
  type: 'tweak:reset-all';
}

export interface TweakDiscardAllMsg {
  type: 'tweak:discard-all';
}

// ─── Annotations ─────────────────────────────────────────────────────────────

export interface AnnotationSource {
  file: string;
  line: number;
  column: number;
}

export interface AnnotationReply {
  id: string;
  type: 'comment' | 'tweak';
  text: string;
  createdAt: number;
  author?: string;
}

export interface AnnotationTweakLink {
  marker: string;
  lastValue: string;
  linkedAt: number;
}

export interface Annotation {
  id: string;            // stable uuid, set by browser
  selectors: string[];   // CSS selectors of all annotated elements (via @medv/finder)
  labels: string[];      // short human labels matching selectors
  comment: string;
  pageUrl: string;
  timestamp: number;
  createdAt: number;     // timestamp when annotation was first created
  resolvedAt?: number;   // timestamp when resolved; undefined = open
  source?: AnnotationSource; // source location from code-inspector (file:line:column)
  replies?: AnnotationReply[];
  linkedTweaks?: AnnotationTweakLink[];
}

export interface AnnotationUpsertMsg {
  type: 'annotation:upsert';
  payload: Annotation;
}

export interface AnnotationDeleteMsg {
  type: 'annotation:delete';
  payload: { id: string; };
}

export interface AnnotationClearMsg {
  type: 'annotation:clear';
}

export type BrowserMessage =
  | TweakChangeMsg
  | TweakFinalizeMsg
  | TweakResetMsg
  | TweakResetAllMsg
  | TweakDiscardAllMsg
  | AnnotationUpsertMsg
  | AnnotationDeleteMsg
  | AnnotationClearMsg;

// ─── Server → Browser ────────────────────────────────────────────────────────

export interface TweakSchemaMsg {
  type: 'tweak:schema';
  payload: TweakKnob[];
}

export interface AnnotationsSyncMsg {
  type: 'annotations:sync';
  payload: Annotation[];
}

// Sent by the server when code-inspector picks an element, carrying its source location.
// The browser should open the annotation popover with this source pre-filled.
export interface InspectPickMsg {
  type: 'inspect:pick';
  payload: AnnotationSource;
}

export type ServerMessage = TweakSchemaMsg | AnnotationsSyncMsg | InspectPickMsg;
