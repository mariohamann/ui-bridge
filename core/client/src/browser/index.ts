import { initInspector, upsertComment } from './inspector.js';
import '@ui-bridge/components/comment';
import '@ui-bridge/components/orphaned';
import './ws-adapter.js'; // side-effect: wires signal stores ↔ WebSocket
import {
  updateComments,
  commentsSignal,
  updateKnobs,
  knobsSignal,
  onIntent,
} from '@ui-bridge/components';

function boot(): void {
  initInspector();
  if (!document.querySelector('uib-comment-bar')) {
    const bar = document.createElement('uib-comment-bar');
    document.body.appendChild(bar);
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
