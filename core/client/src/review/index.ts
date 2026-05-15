/**
 * Review page entry point — registers <db-review> and wires transport.
 *
 * Responsibilities:
 *  - Establish WebSocket connection (via ws-client)
 *  - Feed incoming comments:sync into the shared signal store
 *  - Initial fetch of persisted comments on load
 *  - Handle review-page intents → translate to WebSocket messages
 *  - Reflect WS connection status into the <db-review> element
 */
import { onMessage, sendMessage, onConnectionChange } from '../browser/ws-client.js';
import { updateComments, onIntent } from '@design-bridge/components';
import '@design-bridge/components/review';
import type { DbReview } from '@design-bridge/components/review';

// ── Server → store ─────────────────────────────────────────────────────────

onMessage((msg) => {
  if (msg.type === 'comments:sync') updateComments(msg.payload);
});

// ── Initial fetch ───────────────────────────────────────────────────────────

fetch('/api/comments')
  .then((r) => r.json())
  .then((data: { comments?: unknown[] }) => {
    if (Array.isArray(data.comments)) updateComments(data.comments as never);
  })
  .catch(() => {
    /* server not yet available */
  });

// ── Intents → server ────────────────────────────────────────────────────────

onIntent((intent) => {
  switch (intent.type) {
    case 'comment:open':
      sendMessage({ type: 'comment:focus', payload: { id: intent.id } });
      break;
    case 'comment:save':
      sendMessage({ type: 'comment:upsert', payload: intent.comment });
      break;
    case 'comment:delete':
      sendMessage({ type: 'comment:delete', payload: { id: intent.id } });
      break;
  }
});

// ── WS connection status → db-review element ───────────────────────────────

onConnectionChange((connected) => {
  document.querySelectorAll<DbReview>('db-review').forEach((el) => {
    el.connected = connected;
  });
});
