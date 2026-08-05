import type { BrowserMessage, ServerMessage } from '@ui-bridge/protocol';

const WS_PATH = '/ui-bridge';
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;

type MessageHandler = (msg: ServerMessage) => void;
type ConnectionHandler = (connected: boolean) => void;

let ws: WebSocket | null = null;
let reconnectDelay = RECONNECT_BASE_MS;
let disabled = false;
const handlers = new Set<MessageHandler>();
const connectionHandlers = new Set<ConnectionHandler>();
const buffered: ServerMessage[] = [];

/** Strip a trailing path separator so root comparisons ignore that difference. */
function normalizeRoot(root: string): string {
  return root.replace(/[/\\]+$/, '');
}

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
    if (msg.type === 'server:info') {
      // A build-time injected expected root (set alongside __UIB_WS_URL__)
      // lets us detect a port collision with an unrelated project's server
      // — e.g. a stale/occupied preferred port that a fallback resolution
      // missed. Fail closed instead of silently syncing comments/tweaks
      // into the wrong project.
      const expectedRoot = (window as unknown as Record<string, unknown>).__UIB_EXPECTED_ROOT__ as
        | string
        | undefined;
      if (expectedRoot && normalizeRoot(msg.payload.root) !== normalizeRoot(expectedRoot)) {
        console.error(
          `[ui-bridge] connected to the wrong server — expected project root ` +
            `"${expectedRoot}", got "${msg.payload.root}" (port ${msg.payload.port}). ` +
            `Refusing to sync to avoid writing into the wrong project. This usually ` +
            `means another UI Bridge server is already using the configured port — ` +
            `free it up or set a different \`port\` option.`,
        );
        disabled = true;
        ws?.close();
      }
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
    if (disabled) return;
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

if (!(window as unknown as Record<string, unknown>).__UIB_STATIC_MODE__) {
  connect();
}
