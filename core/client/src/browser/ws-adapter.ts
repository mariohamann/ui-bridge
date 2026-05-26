/**
 * WS adapter — the sole glue layer that connects the transport (WebSocket) to
 * the shared signal stores and intent bus from @ui-bridge/components.
 *
 * Direction A: Server → Browser
 *   onMessage() → update signal stores (knobs, comments)
 *
 * Direction B: Browser → Server
 *   onIntent() → translate ComponentIntent → BrowserMessage → sendMessage()
 *
 * Nothing in the UI layer (uib-comment) should import
 * sendMessage or onMessage directly — they express what they want via intents.
 */

import { onMessage, sendMessage } from './ws-client.js';
import { updateKnobs, updateComments, onIntent } from '@ui-bridge/components';

// ── A: Server → stores ───────────────────────────────────────────────────────

onMessage((msg) => {
  if (msg.type === 'tweak:schema') {
    updateKnobs(msg.payload);
  } else if (msg.type === 'comments:sync') {
    updateComments(msg.payload);
  }
  // inspect:pick is handled inside inspector.ts directly
  // because it needs DOM-level coordination (open draft).
});

// ── B: Intent bus → server ───────────────────────────────────────────────────

onIntent((intent) => {
  switch (intent.type) {
    case 'tweak:change': {
      sendMessage({
        type: 'tweak:change',
        payload: { marker: intent.marker, value: intent.value },
      });
      break;
    }
    case 'tweak:revert':
      sendMessage({ type: 'tweak:reset-all' });
      break;
    case 'tweak:apply':
      sendMessage({ type: 'tweak:finalize', payload: { markers: intent.markers } });
      break;
    case 'tweak:discard':
      sendMessage({ type: 'tweak:discard-all' });
      break;
    case 'tweak:discard-comment':
      sendMessage({ type: 'tweak:discard', payload: { commentId: intent.commentId } });
      break;
    case 'tweak:accept-comment':
      sendMessage({
        type: 'tweak:accept-comment',
        payload: { commentId: intent.commentId },
      });
      break;
    case 'tweak:accept-one':
      sendMessage({
        type: 'tweak:accept-tweak',
        payload: { commentId: intent.commentId, marker: intent.marker },
      });
      break;
    case 'tweak:dismiss-one':
      sendMessage({
        type: 'tweak:dismiss',
        payload: { commentId: intent.commentId, marker: intent.marker },
      });
      break;
    case 'comment:read':
      sendMessage({ type: 'comment:read', payload: { id: intent.id } });
      break;
    // comment:delete / clear are handled locally by inspector.ts which also
    // calls sendMessage. Panel dispatches these through the comment store.
    default:
      break;
  }
});
