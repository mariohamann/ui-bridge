#!/usr/bin/env node
/**
 * UI Bridge — Standalone Server
 *
 * Orchestrates the tweak engine, comment store, HTTP server, and WebSocket
 * server. Business logic lives in tweak-engine.mjs and comment-store.mjs.
 *
 * Usage:
 *   node packages/server/index.mjs --root /path/to/project
 *   npx ui-bridge-server --root .
 *
 * Environment:
 *   UI_BRIDGE_PORT  — port to listen on (default: 7378)
 */

import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { watch } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { WebSocketServer, WebSocket } from 'ws';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createTweakEngine } from './tweak-engine.mjs';
import { createCommentStore, commentsDir } from '@ui-bridge/store';

const _require = createRequire(import.meta.url);
const CLIENT_BUNDLE_PATH = _require.resolve('@ui-bridge/client');

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
const ROOT = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : process.cwd();
const PREFERRED_PORT = parseInt(process.env.UI_BRIDGE_PORT ?? process.env.UIB_PORT ?? '7378', 10);
let actualPort = PREFERRED_PORT;

// ── Free-port finder ──────────────────────────────────────────────────────────

function findFreePort(start, maxAttempts = 10) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    function tryPort(port) {
      const probe = createNetServer();
      probe.once('error', (err) => {
        probe.close();
        if (err.code === 'EADDRINUSE') {
          attempt++;
          if (attempt >= maxAttempts) {
            reject(
              new Error(
                `[ui-bridge] no free port found in range ${start}–${start + maxAttempts - 1}`,
              ),
            );
          } else {
            tryPort(port + 1);
          }
        } else {
          reject(err);
        }
      });
      probe.once('listening', () => {
        probe.close(() => resolve(port));
      });
      probe.listen(port);
    }
    tryPort(start);
  });
}

// ── Engine & store ────────────────────────────────────────────────────────────

const store = createCommentStore(ROOT);
// Engine receives a callback so it always reads the latest comment list.
const tweaks = createTweakEngine(ROOT, () => store.all());

/**
 * Update the most recent pending tweak entry in a thread to the given status.
 * @param {object} thread
 * @param {'accepted'|'discarded'} status
 */
function markActiveTweakStatus(thread, status) {
  let marked = false;
  const comments = [...(thread.comments ?? [])]
    .reverse()
    .map((c) => {
      if (!marked && c.type === 'tweak' && c.tweakStatus === 'pending') {
        marked = true;
        return { ...c, tweakStatus: status };
      }
      return c;
    })
    .reverse();
  return { ...thread, meta: { ...thread.meta, timestamp: Date.now() }, comments };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function jsonResponse(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk.toString()));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ── WebSocket server ──────────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

wss.on('connection', (ws) => {
  const schema = tweaks.buildSchema();
  if (schema.length > 0) ws.send(JSON.stringify({ type: 'tweak:schema', payload: schema }));
  const comments = store.all();
  if (comments.length > 0) ws.send(JSON.stringify({ type: 'comments:sync', payload: comments }));

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'tweak:change':
        // marker === comment id
        await tweaks.applyTweakChange(msg.payload.marker, msg.payload.value);
        broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
        break;

      case 'tweak:reset':
        await tweaks.resetTweak(msg.payload.marker);
        broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
        break;

      case 'tweak:reset-all':
        await tweaks.resetAllTweaks();
        broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
        break;

      case 'tweak:finalize':
        await tweaks.finalizeAll();
        broadcast({ type: 'tweak:schema', payload: [] });
        break;

      case 'tweak:discard-all':
        await tweaks.discardAll();
        broadcast({ type: 'tweak:schema', payload: [] });
        break;

      case 'tweak:discard': {
        const { commentId } = msg.payload;
        await tweaks.discardComment(commentId);
        const discardedByWs = store.get(commentId);
        if (discardedByWs) {
          store.upsert(markActiveTweakStatus(discardedByWs, 'discarded'));
        }
        broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
        broadcast({ type: 'comments:sync', payload: store.all() });
        break;
      }

      case 'tweak:accept-comment': {
        const { commentId } = msg.payload;
        await tweaks.finalizeForComment(commentId);
        const accepted = store.get(commentId);
        if (accepted) {
          store.upsert(markActiveTweakStatus(accepted, 'accepted'));
        }
        broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
        broadcast({ type: 'comments:sync', payload: store.all() });
        break;
      }

      case 'tweak:dismiss': {
        const { commentId } = msg.payload;
        await tweaks.discardComment(commentId);
        const discarded = store.get(commentId);
        if (discarded) {
          store.upsert(markActiveTweakStatus(discarded, 'discarded'));
        }
        broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
        broadcast({ type: 'comments:sync', payload: store.all() });
        break;
      }

      case 'comment:upsert':
        console.log('[server] comment:upsert received, id:', msg.payload?.meta?.id);
        store.upsert(msg.payload);
        broadcast({ type: 'comments:sync', payload: store.all() });
        broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
        break;

      case 'comment:delete':
        store.del(msg.payload.id);
        broadcast({ type: 'comments:sync', payload: store.all() });
        broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
        break;

      case 'comment:clear':
        await store.clear();
        broadcast({ type: 'comments:sync', payload: [] });
        broadcast({ type: 'tweak:schema', payload: [] });
        break;

      case 'comment:read': {
        const thread = store.get(msg.payload.id);
        if (thread) {
          // Update in-memory only — lastReadAt is ephemeral UI state.
          // Writing to disk would cause Vite to reload the page on every panel open
          // when .ui-bridge/ is inside the watched project root.
          store.updateInMemory({ ...thread, meta: { ...thread.meta, lastReadAt: Date.now() } });
          broadcast({ type: 'comments:sync', payload: store.all() });
        }
        break;
      }
    }
  });
});

// ── HTTP server ───────────────────────────────────────────────────────────────

const httpServer = createServer(async (req, res) => {
  const url = req.url ?? '';

  if (req.method === 'OPTIONS') {
    jsonResponse(res, 204, {});
    return;
  }

  if (url === '/health') {
    jsonResponse(res, 200, { ok: true, port: actualPort, root: ROOT });
    return;
  }

  if (url === '/ui-bridge/client.js' && req.method === 'GET') {
    try {
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      res.end(readFileSync(CLIENT_BUNDLE_PATH));
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
    return;
  }

  if (url === '/inspect-pick' && req.method === 'POST') {
    try {
      const source = await readBody(req);
      broadcast({ type: 'inspect:pick', payload: source });
      jsonResponse(res, 200, { ok: true });
    } catch (e) {
      jsonResponse(res, 400, { error: String(e) });
    }
    return;
  }

  // ── REST API (/api/...) ───────────────────────────────────────────────────

  const apiPath = url.startsWith('/api') ? url.slice(4) : null;
  if (!apiPath) {
    jsonResponse(res, 404, { error: 'not found' });
    return;
  }

  // ── Comments ───────────────────────────────────────────────────────────

  if (req.method === 'GET' && apiPath === '/comments') {
    jsonResponse(res, 200, { comments: store.all() });
    return;
  }

  if (req.method === 'POST' && apiPath === '/comments') {
    try {
      const ann = await readBody(req);
      if (!ann?.meta?.id) {
        jsonResponse(res, 400, { error: 'missing id' });
        return;
      }
      await store.upsert(ann);
      broadcast({ type: 'comments:sync', payload: store.all() });
      broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
      jsonResponse(res, 200, { ok: true });
    } catch (e) {
      jsonResponse(res, 400, { error: String(e) });
    }
    return;
  }

  if (req.method === 'DELETE' && apiPath === '/comments') {
    await store.clear();
    broadcast({ type: 'comments:sync', payload: [] });
    broadcast({ type: 'tweak:schema', payload: [] });
    jsonResponse(res, 200, { ok: true });
    return;
  }

  const annIdMatch = apiPath.match(/^\/comments\/([^/]+)$/);
  if (annIdMatch) {
    const annId = annIdMatch[1];
    if (req.method === 'GET') {
      const ann = store.get(annId);
      if (!ann) {
        jsonResponse(res, 404, { error: 'not found' });
        return;
      }
      jsonResponse(res, 200, ann);
      return;
    }
    if (req.method === 'DELETE') {
      await store.del(annId);
      broadcast({ type: 'comments:sync', payload: store.all() });
      broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
      jsonResponse(res, 200, { ok: true });
      return;
    }
  }

  const acceptAnnMatch = apiPath.match(/^\/comments\/([^/]+)\/accept$/);
  if (acceptAnnMatch && req.method === 'POST') {
    const annId = acceptAnnMatch[1];
    try {
      await tweaks.finalizeForComment(annId);
      const accepted = store.get(annId);
      if (accepted) {
        await store.upsert(markActiveTweakStatus(accepted, 'accepted'));
      }
      broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
      broadcast({ type: 'comments:sync', payload: store.all() });
      jsonResponse(res, 200, { ok: true });
    } catch (e) {
      jsonResponse(res, 400, { error: String(e) });
    }
    return;
  }

  const discardAnnMatch = apiPath.match(/^\/comments\/([^/]+)\/discard$/);
  if (discardAnnMatch && req.method === 'POST') {
    const annId = discardAnnMatch[1];
    try {
      await tweaks.discardComment(annId);
      const discarded = store.get(annId);
      if (discarded) {
        await store.upsert(markActiveTweakStatus(discarded, 'discarded'));
      }
      broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
      broadcast({ type: 'comments:sync', payload: store.all() });
      jsonResponse(res, 200, { ok: true });
    } catch (e) {
      jsonResponse(res, 400, { error: String(e) });
    }
    return;
  }

  // ── Tweaks schema ─────────────────────────────────────────────────────────

  if (req.method === 'GET' && apiPath === '/tweaks') {
    jsonResponse(res, 200, { knobs: tweaks.buildSchema() });
    return;
  }

  // ── Scripts ───────────────────────────────────────────────────────────────

  if (req.method === 'POST' && apiPath === '/scripts') {
    try {
      const body = await readBody(req);
      if (!body?.id || typeof body.script !== 'string') {
        jsonResponse(res, 400, { error: 'missing id or script' });
        return;
      }
      await tweaks.writeScript(body.id, body.script);
      jsonResponse(res, 201, { id: body.id });
    } catch (e) {
      jsonResponse(res, 400, { error: String(e) });
    }
    return;
  }

  const scriptIdMatch = apiPath.match(/^\/scripts\/([^/]+)$/);
  if (scriptIdMatch) {
    const scriptId = scriptIdMatch[1];
    if (req.method === 'GET') {
      try {
        const script = await tweaks.readScript(scriptId);
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(script);
      } catch {
        jsonResponse(res, 404, { error: 'not found' });
      }
      return;
    }
    if (req.method === 'DELETE') {
      try {
        await tweaks.deleteScript(scriptId);
        jsonResponse(res, 200, { ok: true });
      } catch (e) {
        jsonResponse(res, 400, { error: String(e) });
      }
      return;
    }
  }

  // ── File assets ───────────────────────────────────────────────────────────

  if (req.method === 'POST' && apiPath === '/files') {
    try {
      const body = await readBody(req);
      if (!body?.id || typeof body.content !== 'string') {
        jsonResponse(res, 400, { error: 'missing id or content' });
        return;
      }
      await tweaks.writeFileAsset(body.id, body.content);
      jsonResponse(res, 201, { id: body.id });
    } catch (e) {
      jsonResponse(res, 400, { error: String(e) });
    }
    return;
  }

  const fileIdMatch = apiPath.match(/^\/files\/([^/]+)$/);
  if (fileIdMatch) {
    const fileId = fileIdMatch[1];
    if (req.method === 'DELETE') {
      try {
        await tweaks.deleteFileAsset(fileId);
        jsonResponse(res, 200, { ok: true });
      } catch (e) {
        jsonResponse(res, 400, { error: String(e) });
      }
      return;
    }
  }

  jsonResponse(res, 404, { error: 'not found' });
});

httpServer.on('upgrade', (req, socket, head) => {
  if (req.url === '/ui-bridge') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

await store.load();

// Watch for external comment file changes (e.g. from MCP writing files directly)
const COMMENTS_WATCH_DIR = commentsDir(ROOT);
let commentsWatcher;
mkdir(COMMENTS_WATCH_DIR, { recursive: true }).then(() => {
  commentsWatcher = watch(COMMENTS_WATCH_DIR, { persistent: false }, async (_, filename) => {
    if (!filename?.endsWith('.json')) return;
    const id = filename.slice(0, -5);
    // Skip reloads triggered by the server's own atomic writes — the in-memory
    // store and broadcast are already up-to-date from store.upsert().
    if (store.consumeSelfWrite(id)) return;
    await store.reloadOne(id);
    broadcast({ type: 'comments:sync', payload: store.all() });
  });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown() {
  commentsWatcher?.close();
  for (const client of wss.clients) client.terminate();
  wss.close(() => httpServer.close(() => process.exit(0)));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

actualPort = await findFreePort(PREFERRED_PORT);
if (actualPort !== PREFERRED_PORT) {
  console.log(
    `[ui-bridge] port ${PREFERRED_PORT} in use, using http://localhost:${actualPort} instead`,
  );
}

httpServer.listen(actualPort, async () => {
  console.log(`[ui-bridge] server listening on http://localhost:${actualPort} (root: ${ROOT})`);
  console.log(`UI_BRIDGE_READY:${actualPort}`);
});
