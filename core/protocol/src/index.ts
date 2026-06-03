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
  SourceAnnotationConfig,
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
export const UIB_COMMENT_TAG = 'uib-comment' as const;
export const UIB_SOURCE_INSPECTOR_TAG = 'uib-source-inspector' as const;
