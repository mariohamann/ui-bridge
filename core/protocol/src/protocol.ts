// ─── Knob types ───────────────────────────────────────────────────────────────

export type TweakKnobType =
  | 'number'
  | 'color'
  | 'string'
  | 'textarea'
  | 'boolean'
  | 'select'
  | 'button-group';

export interface TweakKnob {
  /** Equals the annotation id that owns this knob. */
  marker: string;
  label: string;
  type: TweakKnobType;
  value: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Record<string, string>;
  annotationId?: string;
}

// ─── Tweak actions ────────────────────────────────────────────────────────────

/**
 * Transform an existing file.
 * The transformer script at `.design-bridge/scripts/{scriptId}.mjs` must export
 * a default function `(content: string, value: unknown) => string`.
 */
export interface ContentEditAction {
  type: 'content-edit';
  /** Project-relative path to the file to transform. */
  file: string;
  /** References `.design-bridge/scripts/{scriptId}.mjs`. */
  scriptId: string;
}

/**
 * Create a new file at `path` from the asset stored at
 * `.design-bridge/files/{fileId}`.
 */
export interface FileCreateAction {
  type: 'file-create';
  /** Project-relative destination path. */
  path: string;
  /** References `.design-bridge/files/{fileId}`. */
  fileId: string;
}

/**
 * Delete the file at `path`. Snapshot is taken first so discard can restore it.
 */
export interface FileDeleteAction {
  type: 'file-delete';
  /** Project-relative path of the file to delete. */
  path: string;
}

export type TweakAction = ContentEditAction | FileCreateAction | FileDeleteAction;

/**
 * Knob definition embedded in an Annotation. Drives the Tweakpane UI.
 */
export interface TweakKnobDef {
  label: string;
  type: TweakKnobType;
  value: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Record<string, string>;
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
  label?: string;
  lastValue: string;
  linkedAt: number;
}

export interface Annotation {
  id: string; // stable uuid, set by browser
  selectors: string[]; // CSS selectors of all annotated elements (via @medv/finder)
  labels: string[]; // short human labels matching selectors
  comment: string;
  pageUrl: string;
  timestamp: number;
  createdAt: number; // timestamp when annotation was first created
  resolvedAt?: number; // timestamp when resolved; undefined = open
  source?: AnnotationSource; // source location from code-inspector (file:line:column)
  replies?: AnnotationReply[];
  /** @deprecated Use `knob` + `actions` instead. */
  linkedTweaks?: AnnotationTweakLink[];
  /** Knob definition — when present this annotation drives a live tweak. */
  knob?: TweakKnobDef;
  /** Ordered list of actions executed when the knob value changes. */
  actions?: TweakAction[];
}

// ─── Browser → Server ────────────────────────────────────────────────────────

export interface TweakChangeMsg {
  type: 'tweak:change';
  payload: { marker: string; value: string };
}

export interface TweakFinalizeMsg {
  type: 'tweak:finalize';
  payload: { markers: string[] };
}

export interface TweakResetMsg {
  type: 'tweak:reset';
  payload: { marker: string };
}

export interface TweakResetAllMsg {
  type: 'tweak:reset-all';
}

export interface TweakDiscardAllMsg {
  type: 'tweak:discard-all';
}

export interface TweakDiscardMsg {
  type: 'tweak:discard';
  payload: { annotationId: string };
}

export interface TweakAcceptAnnotationMsg {
  type: 'tweak:accept-annotation';
  payload: { annotationId: string };
}

export interface TweakAcceptTweakMsg {
  type: 'tweak:accept-tweak';
  payload: { annotationId: string; marker: string };
}

export interface TweakDismissMsg {
  type: 'tweak:dismiss';
  payload: { annotationId: string; marker: string };
}

export interface AnnotationUpsertMsg {
  type: 'annotation:upsert';
  payload: Annotation;
}

export interface AnnotationDeleteMsg {
  type: 'annotation:delete';
  payload: { id: string };
}

export interface AnnotationClearMsg {
  type: 'annotation:clear';
}

export interface AnnotationFocusMsg {
  type: 'annotation:focus';
  payload: { id: string };
}

export type BrowserMessage =
  | TweakChangeMsg
  | TweakFinalizeMsg
  | TweakResetMsg
  | TweakResetAllMsg
  | TweakDiscardAllMsg
  | TweakDiscardMsg
  | TweakAcceptAnnotationMsg
  | TweakAcceptTweakMsg
  | TweakDismissMsg
  | AnnotationUpsertMsg
  | AnnotationDeleteMsg
  | AnnotationClearMsg
  | AnnotationFocusMsg;

// ─── Server → Browser ────────────────────────────────────────────────────────

export interface TweakSchemaMsg {
  type: 'tweak:schema';
  payload: TweakKnob[];
}

export interface AnnotationsSyncMsg {
  type: 'annotations:sync';
  payload: Annotation[];
}

export interface InspectPickMsg {
  type: 'inspect:pick';
  payload: AnnotationSource;
}

export interface AnnotationFocusBroadcastMsg {
  type: 'annotation:focus';
  payload: { id: string };
}

export type ServerMessage =
  | TweakSchemaMsg
  | AnnotationsSyncMsg
  | InspectPickMsg
  | AnnotationFocusBroadcastMsg;
