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
  /** Equals the comment id that owns this knob. */
  marker: string;
  label: string;
  type: TweakKnobType;
  value: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Record<string, string>;
  commentId?: string;
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
 * Knob definition embedded in an Comment. Drives the Tweakpane UI.
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

// ─── Comments ─────────────────────────────────────────────────────────────

export interface CommentSource {
  file: string;
  line: number;
  column: number;
}

export type CommentAuthor = 'user' | 'agent';

export interface CommentReply {
  id: string;
  /** 'comment' = human/agent text; 'tweak' = auto-generated knob-change record. */
  type: 'comment' | 'tweak';
  text: string;
  createdAt: number;
  /** 'agent' when written by the LLM via MCP; 'user' (or absent) for human replies. */
  author?: CommentAuthor;
}

export interface CommentTweakLink {
  marker: string;
  label?: string;
  lastValue: string;
  linkedAt: number;
}

export interface Comment {
  id: string; // stable uuid, set by browser
  selectors: string[]; // CSS selectors of all annotated elements (via @medv/finder)
  labels: string[]; // short human labels matching selectors
  comment: string;
  pageUrl: string;
  timestamp: number;
  createdAt: number; // timestamp when comment was first created
  resolvedAt?: number; // timestamp when resolved; undefined = open
  source?: CommentSource; // source location from code-inspector (file:line:column)
  replies?: CommentReply[];
  /** 'agent' when created by the LLM via MCP; 'user' (or absent) for human comments. */
  author?: CommentAuthor;
  /**
   * Lifecycle state of the embedded tweak knob.
   * 'pending'   — knob is live, not yet acted on.
   * 'accepted'  — user accepted the tweak; file changes are permanent.
   * 'discarded' — user discarded the tweak; files were restored.
   * Absent when the comment carries no knob.
   */
  tweakStatus?: 'pending' | 'accepted' | 'discarded';
  /** @deprecated Use `knob` + `actions` instead. */
  linkedTweaks?: CommentTweakLink[];
  /** Knob definition — when present this comment drives a live tweak. */
  knob?: TweakKnobDef;
  /** Ordered list of actions executed when the knob value changes. */
  actions?: TweakAction[];
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

export interface TweakDiscardMsg {
  type: 'tweak:discard';
  payload: { commentId: string; };
}

export interface TweakAcceptCommentMsg {
  type: 'tweak:accept-comment';
  payload: { commentId: string; };
}

export interface TweakAcceptTweakMsg {
  type: 'tweak:accept-tweak';
  payload: { commentId: string; marker: string; };
}

export interface TweakDismissMsg {
  type: 'tweak:dismiss';
  payload: { commentId: string; marker: string; };
}

export interface CommentUpsertMsg {
  type: 'comment:upsert';
  payload: Comment;
}

export interface CommentDeleteMsg {
  type: 'comment:delete';
  payload: { id: string; };
}

export interface CommentClearMsg {
  type: 'comment:clear';
}

export interface CommentFocusMsg {
  type: 'comment:focus';
  payload: { id: string; };
}

export type BrowserMessage =
  | TweakChangeMsg
  | TweakFinalizeMsg
  | TweakResetMsg
  | TweakResetAllMsg
  | TweakDiscardAllMsg
  | TweakDiscardMsg
  | TweakAcceptCommentMsg
  | TweakAcceptTweakMsg
  | TweakDismissMsg
  | CommentUpsertMsg
  | CommentDeleteMsg
  | CommentClearMsg
  | CommentFocusMsg;

// ─── Server → Browser ────────────────────────────────────────────────────────

export interface TweakSchemaMsg {
  type: 'tweak:schema';
  payload: TweakKnob[];
}

export interface CommentsSyncMsg {
  type: 'comments:sync';
  payload: Comment[];
}

export interface InspectPickMsg {
  type: 'inspect:pick';
  payload: CommentSource;
}

export interface CommentFocusBroadcastMsg {
  type: 'comment:focus';
  payload: { id: string; };
}

export type ServerMessage =
  | TweakSchemaMsg
  | CommentsSyncMsg
  | InspectPickMsg
  | CommentFocusBroadcastMsg;
