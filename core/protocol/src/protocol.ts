import { z } from 'zod';

// ─── Source annotation config ─────────────────────────────────────────────────

/**
 * Configures how the client resolves source file/line information when the user
 * clicks an element. JSON-serializable so it can be injected as a global via
 * the Vite plugin.
 */
export interface SourceAnnotationConfig {
  /**
   * Match source location from HTML comments in the DOM (e.g. Blade, Twig,
   * Django templates that emit surrounding comments).
   *
   * Each entry is a pattern definition. The walker tries them in order and
   * returns the first match — so you can list multiple frameworks at once.
   *
   * Each entry's `pattern` is a regex string. Capture groups:
   *   - `fileGroup` (default 1) → file path
   *   - `lineGroup` (optional) → 1-based line number
   *   - `columnGroup` (optional) → 0-based column number
   *
   * Example for Laravel Blade:
   *   [{ pattern: 'Start view: (.+?\\.blade\\.php)' }]
   */
  htmlComments?: Array<{
    pattern: string;
    fileGroup?: number;
    lineGroup?: number;
    columnGroup?: number;
  }>;
  /**
   * Additional data-attribute strategies, checked before the built-in ones.
   * Two formats are supported:
   *   - `{ pathAttr }` — single attribute encoding "file:line:col"
   *   - `{ fileAttr, locAttr }` — separate file and "line:col" attributes
   */
  dataAttributes?: Array<{ pathAttr: string } | { fileAttr: string; locAttr: string }>;
}

// ─── Knob types ───────────────────────────────────────────────────────────────

export const TweakKnobTypeSchema = z.enum([
  'number',
  'color',
  'string',
  'textarea',
  'boolean',
  'select',
  'radio',
]);
export type TweakKnobType = z.infer<typeof TweakKnobTypeSchema>;

export interface TweakKnob {
  /** Equals the comment id that owns this knob. */
  marker: string;
  label: string;
  type: TweakKnobType;
  value: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  /**
   * For `select` and `radio` knobs.
   * Keys are the values submitted to the transform script; values are the display labels shown in the UI.
   * Example: `{ "gap-2": "Tight", "gap-4": "Normal", "gap-6": "Roomy" }`
   */
  options?: Record<string, string>;
  commentId?: string;
}

// ─── Tweak actions ────────────────────────────────────────────────────────────

export const ContentEditActionSchema = z.object({
  type: z.literal('content-edit'),
  file: z.string(),
  scriptId: z.string(),
});
export type ContentEditAction = z.infer<typeof ContentEditActionSchema>;

export const FileCreateActionSchema = z.object({
  type: z.literal('file-create'),
  path: z.string(),
  fileId: z.string(),
});
export type FileCreateAction = z.infer<typeof FileCreateActionSchema>;

export const FileDeleteActionSchema = z.object({
  type: z.literal('file-delete'),
  path: z.string(),
});
export type FileDeleteAction = z.infer<typeof FileDeleteActionSchema>;

export const TweakActionSchema = z.discriminatedUnion('type', [
  ContentEditActionSchema,
  FileCreateActionSchema,
  FileDeleteActionSchema,
]);
export type TweakAction = z.infer<typeof TweakActionSchema>;

export const TweakKnobDefSchema = z.object({
  label: z.string(),
  type: TweakKnobTypeSchema,
  value: z.union([z.string(), z.number(), z.boolean()]),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.record(z.string()).optional(),
});
export type TweakKnobDef = z.infer<typeof TweakKnobDefSchema>;

// ─── Comment thread schema ─────────────────────────────────────────────────

export const CommentAuthorSchema = z.enum(['user', 'agent']);
export type CommentAuthor = z.infer<typeof CommentAuthorSchema>;

export const CommentSourceSchema = z.object({
  file: z.string(),
  line: z.number().int(),
  column: z.number().int(),
});
export type CommentSource = z.infer<typeof CommentSourceSchema>;

/**
 * A single annotated DOM element within a comment thread.
 * Stores the selector, semantic element info, and optional source location.
 */
export const CommentElementSchema = z.object({
  /** Stable CSS selector from @medv/finder — used to locate the element in the DOM. */
  minimalSelector: z.string(),
  /** HTML tag name, lowercase (e.g. 'p', 'div', 'button'). */
  tag: z.string(),
  /** Element id attribute, if present. */
  id: z.string().optional(),
  /** List of CSS classes on the element. */
  classes: z.array(z.string()),
  /** Source file location from code-inspector, if available. */
  source: CommentSourceSchema.optional(),
});
export type CommentElement = z.infer<typeof CommentElementSchema>;

export const CommentMetaSchema = z.object({
  id: z.string(),
  pageUrl: z.string(),
  timestamp: z.number(),
  createdAt: z.number(),
  resolvedAt: z.number().optional(),
  lastReadAt: z.number().optional(),
});
export type CommentMeta = z.infer<typeof CommentMetaSchema>;

export const TextCommentEntrySchema = z.object({
  id: z.string(),
  type: z.literal('comment'),
  text: z.string(),
  createdAt: z.number(),
  author: CommentAuthorSchema.optional(),
});
export type TextCommentEntry = z.infer<typeof TextCommentEntrySchema>;

export const TweakCommentEntrySchema = z.object({
  id: z.string(),
  type: z.literal('tweak'),
  text: z.string(),
  createdAt: z.number(),
  author: CommentAuthorSchema.optional(),
  knob: TweakKnobDefSchema,
  actions: z.array(TweakActionSchema),
  tweakStatus: z.enum(['pending', 'accepted', 'discarded']),
});
export type TweakCommentEntry = z.infer<typeof TweakCommentEntrySchema>;

export const CommentEntrySchema = z.discriminatedUnion('type', [
  TextCommentEntrySchema,
  TweakCommentEntrySchema,
]);
export type CommentEntry = z.infer<typeof CommentEntrySchema>;

export const CommentThreadSchema = z.object({
  meta: CommentMetaSchema,
  /** One or more annotated elements this thread is attached to. */
  elements: z.array(CommentElementSchema),
  /** Unified message history: text replies and tweak entries in chronological order. */
  comments: z.array(CommentEntrySchema),
});
export type CommentThread = z.infer<typeof CommentThreadSchema>;

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
  payload: { commentId: string };
}

export interface TweakAcceptCommentMsg {
  type: 'tweak:accept-comment';
  payload: { commentId: string };
}

export interface TweakAcceptTweakMsg {
  type: 'tweak:accept-tweak';
  payload: { commentId: string; marker: string };
}

export interface TweakDismissMsg {
  type: 'tweak:dismiss';
  payload: { commentId: string; marker: string };
}

export interface CommentUpsertMsg {
  type: 'comment:upsert';
  payload: CommentThread;
}

export interface CommentDeleteMsg {
  type: 'comment:delete';
  payload: { id: string };
}

export interface CommentClearMsg {
  type: 'comment:clear';
}

export interface CommentReadMsg {
  type: 'comment:read';
  payload: { id: string };
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
  | CommentReadMsg;

// ─── Server → Browser ────────────────────────────────────────────────────────

export interface TweakSchemaMsg {
  type: 'tweak:schema';
  payload: TweakKnob[];
}

export interface CommentsSyncMsg {
  type: 'comments:sync';
  payload: CommentThread[];
}

export interface InspectPickMsg {
  type: 'inspect:pick';
  payload: CommentSource;
}

export type ServerMessage = TweakSchemaMsg | CommentsSyncMsg | InspectPickMsg;
