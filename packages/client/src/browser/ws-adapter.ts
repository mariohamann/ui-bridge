/**
 * WS adapter — the sole glue layer that connects the transport (WebSocket) to
 * the shared signal stores and intent bus from @design-bridge/components.
 *
 * Direction A: Server → Browser
 *   onMessage() → update signal stores (knobs, annotations)
 *
 * Direction B: Browser → Server
 *   onIntent() → translate ComponentIntent → BrowserMessage → sendMessage()
 *
 * Nothing in the UI layer (bridge-annotation-item) should import
 * sendMessage or onMessage directly — they express what they want via intents.
 */

import { onMessage, sendMessage } from './ws-client.js';
import {
  updateKnobs,
  updateAnnotations,
  onIntent,
  getKnobByMarker,
} from '@design-bridge/components';
import { getOpenItem } from './inspector.js';

// ── A: Server → stores ───────────────────────────────────────────────────────

onMessage((msg) => {
  if (msg.type === 'tweak:schema') {
    updateKnobs(msg.payload);
  } else if (msg.type === 'annotations:sync') {
    updateAnnotations(msg.payload);
  }
  // inspect:pick and annotation:focus are handled inside inspector.ts directly
  // because they need DOM-level coordination (open draft, scroll element).
});

// ── B: Intent bus → server ───────────────────────────────────────────────────

onIntent((intent) => {
  switch (intent.type) {
    case 'tweak:change': {
      sendMessage({ type: 'tweak:change', payload: { marker: intent.marker, value: intent.value } });
      // Register the value change as a reply on any currently open annotation item
      const label = getKnobByMarker(intent.marker)?.label;
      getOpenItem()?.registerTweakReply(intent.marker, intent.value, label);
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
    case 'tweak:accept-annotation':
      sendMessage({ type: 'tweak:accept-annotation', payload: { annotationId: intent.annotationId } });
      break;
    case 'tweak:accept-one':
      sendMessage({ type: 'tweak:accept-tweak', payload: { annotationId: intent.annotationId, marker: intent.marker } });
      break;
    case 'tweak:dismiss-one':
      sendMessage({ type: 'tweak:dismiss', payload: { annotationId: intent.annotationId, marker: intent.marker } });
      break;
    // annotation:delete / clear are handled locally by inspector.ts which also
    // calls sendMessage. Panel dispatches these through the annotation store.
    default:
      break;
  }
});
