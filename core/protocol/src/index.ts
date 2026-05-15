export type {
  TweakKnob,
  TweakKnobType,
  TweakKnobDef,
  TweakAction,
  ContentEditAction,
  FileCreateAction,
  FileDeleteAction,
  BrowserMessage,
  ServerMessage,
  TweakChangeMsg,
  TweakFinalizeMsg,
  TweakResetMsg,
  TweakResetAllMsg,
  TweakDiscardAllMsg,
  TweakAcceptCommentMsg,
  TweakAcceptTweakMsg,
  TweakDismissMsg,
  TweakSchemaMsg,
  CommentSource,
  CommentAuthor,
  CommentElement,
  CommentMeta,
  CommentEntry,
  TextCommentEntry,
  TweakCommentEntry,
  CommentThread,
  CommentUpsertMsg,
  CommentDeleteMsg,
  CommentClearMsg,
  CommentsSyncMsg,
  InspectPickMsg,
} from './protocol.js';

export {
  CommentThreadSchema,
  CommentElementSchema,
  CommentMetaSchema,
  CommentEntrySchema,
  TextCommentEntrySchema,
  TweakCommentEntrySchema,
  TweakActionSchema,
  TweakKnobDefSchema,
} from './protocol.js';

// ─── Custom element tag names ─────────────────────────────────────────────────
// Single source of truth — import these instead of using string literals.
export const DB_COMMENT_TAG = 'db-comment' as const;
export const DB_SOURCE_INSPECTOR_TAG = 'db-source-inspector' as const;
