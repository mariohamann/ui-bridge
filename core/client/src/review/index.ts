/**
 * Review page entry point — registers <db-review> and wires transport.
 *
 * Responsibilities:
 *  - Establish WebSocket connection (via ws-client)
 *  - Feed incoming annotations:sync into the shared signal store
 *  - Initial fetch of persisted annotations on load
 *  - Handle review-page intents → translate to WebSocket messages
 *  - Reflect WS connection status into the <db-review> element
 */
import { onMessage, sendMessage, onConnectionChange } from '../browser/ws-client.js';
import { updateAnnotations, onIntent } from '@design-bridge/components';
import '@design-bridge/components/review';
import type { DbReview } from '@design-bridge/components/review';

// ── Server → store ─────────────────────────────────────────────────────────

onMessage((msg) => {
  if (msg.type === 'annotations:sync') updateAnnotations(msg.payload);
});

// ── Initial fetch ───────────────────────────────────────────────────────────

fetch('/api/annotations')
  .then((r) => r.json())
  .then((data: { annotations?: unknown[] }) => {
    if (Array.isArray(data.annotations)) updateAnnotations(data.annotations as never);
  })
  .catch(() => { /* server not yet available */ });

// ── Intents → server ────────────────────────────────────────────────────────

onIntent((intent) => {
  switch (intent.type) {
    case 'annotation:open':
      sendMessage({ type: 'annotation:focus', payload: { id: intent.id } });
      break;
    case 'annotation:save':
      sendMessage({ type: 'annotation:upsert', payload: intent.annotation });
      break;
    case 'annotation:delete':
      sendMessage({ type: 'annotation:delete', payload: { id: intent.id } });
      break;
  }
});

// ── WS connection status → db-review element ───────────────────────────────

onConnectionChange((connected) => {
  document.querySelectorAll<DbReview>('db-review').forEach((el) => {
    el.connected = connected;
  });
});
