export type {
  TweakKnob,
  TweakKnobType,
  BrowserMessage,
  ServerMessage,
  TweakChangeMsg,
  TweakFinalizeMsg,
  TweakResetMsg,
  TweakResetAllMsg,
  TweakDiscardAllMsg,
  TweakAcceptAnnotationMsg,
  TweakAcceptTweakMsg,
  TweakDismissMsg,
  TweakSchemaMsg,
  AnnotationSource,
  AnnotationReply,
  AnnotationTweakLink,
  Annotation,
  AnnotationUpsertMsg,
  AnnotationDeleteMsg,
  AnnotationClearMsg,
  AnnotationsSyncMsg,
  InspectPickMsg,
} from './protocol.js';

// ─── Custom element tag names ─────────────────────────────────────────────────
// Single source of truth — import these instead of using string literals.
export const DB_ANNOTATION_TAG = 'db-annotation' as const;
export const DB_SOURCE_INSPECTOR_TAG = 'db-source-inspector' as const;
