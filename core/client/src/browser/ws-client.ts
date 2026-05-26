import type { BrowserMessage, ServerMessage } from '@ui-bridge/protocol';

const WS_PATH = '/ui-bridge';
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;

type MessageHandler = (msg: ServerMessage) => void;
type ConnectionHandler = (connected: boolean) => void;

let ws: WebSocket | null = null;
let reconnectDelay = RECONNECT_BASE_MS;
const handlers = new Set<MessageHandler>();
const connectionHandlers = new Set<ConnectionHandler>();
const buffered: ServerMessage[] = [];

function connect(): void {
  // __UIB_WS_URL__ is injected by the Vite plugin (or set manually for non-Vite stacks).
  // Falls back to the same host so the Vite-embedded server still works as a fallback.
  const url =
    ((window as unknown as Record<string, unknown>).__UIB_WS_URL__ as string | undefined) ??
    `ws://${location.host}${WS_PATH}`;
  ws = new WebSocket(url);

  ws.addEventListener('open', () => {
    reconnectDelay = RECONNECT_BASE_MS;
    for (const h of connectionHandlers) h(true);
    console.debug('[ui-bridge] WebSocket connected');
  });

  ws.addEventListener('message', (event) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(event.data as string) as ServerMessage;
    } catch {
      return;
    }
    if (handlers.size === 0) {
      buffered.push(msg);
    } else {
      for (const handler of handlers) handler(msg);
    }
  });

  ws.addEventListener('close', () => {
    for (const h of connectionHandlers) h(false);
    console.debug(`[ui-bridge] WS closed – reconnecting in ${reconnectDelay}ms`);
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
      connect();
    }, reconnectDelay);
  });

  ws.addEventListener('error', () => {
    ws?.close();
  });
}

export function sendMessage(msg: BrowserMessage): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function onMessage(handler: MessageHandler): () => void {
  handlers.add(handler);
  for (const msg of buffered) handler(msg);
  buffered.length = 0;
  return () => handlers.delete(handler);
}

export function onConnectionChange(handler: ConnectionHandler): () => void {
  connectionHandlers.add(handler);
  return () => connectionHandlers.delete(handler);
}

connect();
