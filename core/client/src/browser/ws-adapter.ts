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
import {
  updateKnobs,
  updateComments,
  updatePreferences,
  onIntent,
  commentsSignal,
} from '@ui-bridge/components';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDemoThread(commentId: string): boolean {
  const threads = commentsSignal.get() as { meta: { id: string; demo?: boolean } }[];
  return threads.some((t) => t.meta.id === commentId && t.meta.demo === true);
}

// ── A: Server → stores ───────────────────────────────────────────────────────

onMessage((msg) => {
  if (msg.type === 'tweak:schema') {
    updateKnobs(msg.payload);
  } else if (msg.type === 'comments:sync') {
    updateComments(msg.payload);
  } else if (msg.type === 'preferences:sync') {
    updatePreferences(msg.payload);
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
      if (!isDemoThread(intent.commentId))
        sendMessage({ type: 'tweak:discard', payload: { commentId: intent.commentId } });
      break;
    case 'tweak:accept-comment':
      if (!isDemoThread(intent.commentId))
        sendMessage({
          type: 'tweak:accept-comment',
          payload: { commentId: intent.commentId },
        });
      break;
    case 'tweak:accept-one':
      if (!isDemoThread(intent.commentId))
        sendMessage({
          type: 'tweak:accept-tweak',
          payload: { commentId: intent.commentId, marker: intent.marker },
        });
      break;
    case 'tweak:dismiss-one':
      if (!isDemoThread(intent.commentId))
        sendMessage({
          type: 'tweak:dismiss',
          payload: { commentId: intent.commentId, marker: intent.marker },
        });
      break;
    case 'comment:read':
      if (!isDemoThread(intent.id))
        sendMessage({ type: 'comment:read', payload: { id: intent.id } });
      break;
    case 'preferences:update':
      sendMessage({ type: 'preferences:update', payload: intent.payload });
      break;
    // comment:delete / clear are handled locally by inspector.ts which also
    // calls sendMessage. Panel dispatches these through the comment store.
    default:
      break;
  }
});
