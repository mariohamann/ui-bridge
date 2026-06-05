import { initInspector, upsertComment } from './inspector.js';
import '@ui-bridge/components/comment';
import '@ui-bridge/components/orphaned';
import './ws-adapter.js'; // side-effect: wires signal stores ↔ WebSocket
import type { CommentThread, SourceAnnotationConfig } from '@ui-bridge/protocol';
import {
  updateComments,
  commentsSignal,
  updateKnobs,
  knobsSignal,
  onIntent,
} from '@ui-bridge/components';

function boot(): void {
  const sourceConfig = (window as unknown as Record<string, unknown>).__UIB_SOURCE_CONFIG__ as
    | SourceAnnotationConfig
    | undefined;
  initInspector(sourceConfig);
  if (!document.querySelector('uib-comment-bar')) {
    const bar = document.createElement('uib-comment-bar');
    document.body.appendChild(bar);
  }
  // Seed pre-baked static comments (set by staticMode builds via __UIB_STATIC_COMMENTS__).
  const staticComments = (window as unknown as Record<string, unknown>).__UIB_STATIC_COMMENTS__ as
    | CommentThread[]
    | undefined;
  if (Array.isArray(staticComments)) {
    updateComments(staticComments);
  }
  // Expose signal store helpers for E2E tests and demo adapters.
  (window as unknown as Record<string, unknown>).__UIB_COMPONENTS__ = {
    updateComments,
    commentsSignal,
    updateKnobs,
    knobsSignal,
    onIntent,
    upsertComment,
  };
}

if (document.body) {
  boot();
} else {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
}
