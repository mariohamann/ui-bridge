#!/usr/bin/env node
/**
 * Design Bridge — Standalone Server
 *
 * Orchestrates the tweak engine, annotation store, HTTP server, and WebSocket
 * server. Business logic lives in tweak-engine.mjs and annotation-store.mjs.
 *
 * Usage:
 *   node packages/server/index.mjs --root /path/to/project
 *   npx design-bridge-server --root .
 *
 * Environment:
 *   DB_PORT  — port to listen on (default: 7378)
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createTweakEngine } from './tweak-engine.mjs';
import { createAnnotationStore } from './annotation-store.mjs';

const _require = createRequire(import.meta.url);
const CLIENT_BUNDLE_PATH = _require.resolve('@design-bridge/client');
const REVIEW_BUNDLE_PATH = _require.resolve('@design-bridge/client/review-page');

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
const ROOT = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : process.cwd();
const PORT = parseInt(process.env.DB_PORT ?? '7378', 10);

// ── Engine & store ────────────────────────────────────────────────────────────

const tweaks = createTweakEngine(ROOT);
const store = createAnnotationStore(ROOT);

// ── Review page HTML ──────────────────────────────────────────────────────────

const REVIEW_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Design Bridge — Annotations</title>
  <style>html,body{margin:0;padding:0;background:#1e1e2e;}</style>
</head>
<body>
  <db-review></db-review>
  <script src="/design-bridge/review-page.js"></script>
</body>
</html>`;

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
    req.on('data', chunk => (raw += chunk.toString()));
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); }
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
  const annotations = store.all();
  if (annotations.length > 0) ws.send(JSON.stringify({ type: 'annotations:sync', payload: annotations }));

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case 'tweak:change':
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

      case 'annotation:upsert':
        store.upsert(msg.payload);
        broadcast({ type: 'annotations:sync', payload: store.all() });
        break;

      case 'annotation:delete':
        store.del(msg.payload.id);
        broadcast({ type: 'annotations:sync', payload: store.all() });
        break;

      case 'annotation:clear':
        await store.clear();
        broadcast({ type: 'annotations:sync', payload: [] });
        break;

      case 'annotation:focus':
        broadcast({ type: 'annotation:focus', payload: msg.payload });
        break;

      case 'tweak:accept-annotation': {
        const { annotationId } = msg.payload;
        await tweaks.finalizeForAnnotation(annotationId);
        store.del(annotationId);
        broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
        broadcast({ type: 'annotations:sync', payload: store.all() });
        break;
      }

      case 'tweak:accept-tweak': {
        const { annotationId, marker } = msg.payload;
        await tweaks.finalizeOneTweak(marker);
        store.unlinkTweak(annotationId, marker);
        broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
        broadcast({ type: 'annotations:sync', payload: store.all() });
        break;
      }

      case 'tweak:dismiss': {
        const { annotationId, marker } = msg.payload;
        await tweaks.dismissTweak(marker);
        store.unlinkTweak(annotationId, marker);
        broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
        broadcast({ type: 'annotations:sync', payload: store.all() });
        break;
      }
    }
  });
});

// ── HTTP server ───────────────────────────────────────────────────────────────

const httpServer = createServer(async (req, res) => {
  const url = req.url ?? '';

  if (req.method === 'OPTIONS') { jsonResponse(res, 204, {}); return; }

  if (url === '/health') {
    jsonResponse(res, 200, { ok: true, port: PORT, root: ROOT });
    return;
  }

  if (url === '/design-bridge/client.js' && req.method === 'GET') {
    try {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.end(readFileSync(CLIENT_BUNDLE_PATH));
    } catch (e) { res.writeHead(500); res.end(String(e)); }
    return;
  }

  if (url === '/design-bridge/review-page.js' && req.method === 'GET') {
    try {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
      res.end(readFileSync(REVIEW_BUNDLE_PATH));
    } catch (e) { res.writeHead(500); res.end(String(e)); }
    return;
  }

  if (url === '/inspect-pick' && req.method === 'POST') {
    try {
      const source = await readBody(req);
      broadcast({ type: 'inspect:pick', payload: source });
      jsonResponse(res, 200, { ok: true });
    } catch (e) { jsonResponse(res, 400, { error: String(e) }); }
    return;
  }

  if (req.method === 'GET' && (url === '/' || url === '')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(REVIEW_PAGE_HTML);
    return;
  }

  // ── REST API (/api/...) ───────────────────────────────────────────────────

  const apiPath = url.startsWith('/api') ? url.slice(4) : null;
  if (!apiPath) { jsonResponse(res, 404, { error: 'not found' }); return; }

  if (req.method === 'GET' && apiPath === '/annotations') {
    jsonResponse(res, 200, { annotations: store.all() });
    return;
  }

  if (req.method === 'POST' && apiPath === '/annotations') {
    try {
      const ann = await readBody(req);
      if (!ann?.id) { jsonResponse(res, 400, { error: 'missing id' }); return; }
      store.upsert(ann);
      broadcast({ type: 'annotations:sync', payload: store.all() });
      jsonResponse(res, 200, { ok: true });
    } catch (e) { jsonResponse(res, 400, { error: String(e) }); }
    return;
  }

  if (req.method === 'DELETE' && apiPath === '/annotations') {
    await store.clear();
    broadcast({ type: 'annotations:sync', payload: [] });
    jsonResponse(res, 200, { ok: true });
    return;
  }

  const annIdMatch = apiPath.match(/^\/annotations\/([^/]+)$/);
  if (annIdMatch) {
    const annId = annIdMatch[1];
    if (req.method === 'GET') {
      const ann = store.get(annId);
      if (!ann) { jsonResponse(res, 404, { error: 'not found' }); return; }
      jsonResponse(res, 200, ann);
      return;
    }
    if (req.method === 'DELETE') {
      store.del(annId);
      broadcast({ type: 'annotations:sync', payload: store.all() });
      jsonResponse(res, 200, { ok: true });
      return;
    }
  }

  const acceptAnnMatch = apiPath.match(/^\/annotations\/([^/]+)\/accept$/);
  if (acceptAnnMatch && req.method === 'POST') {
    const annId = acceptAnnMatch[1];
    try {
      await tweaks.finalizeForAnnotation(annId);
      store.del(annId);
      broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
      broadcast({ type: 'annotations:sync', payload: store.all() });
      jsonResponse(res, 200, { ok: true });
    } catch (e) { jsonResponse(res, 400, { error: String(e) }); }
    return;
  }

  const dismissMatch = apiPath.match(/^\/annotations\/([^/]+)\/tweaks\/([^/]+)$/);
  if (dismissMatch && req.method === 'DELETE') {
    const [, annId, marker] = dismissMatch;
    try {
      await tweaks.dismissTweak(marker);
      store.unlinkTweak(annId, marker);
      broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
      broadcast({ type: 'annotations:sync', payload: store.all() });
      jsonResponse(res, 200, { ok: true });
    } catch (e) { jsonResponse(res, 400, { error: String(e) }); }
    return;
  }

  const acceptTweakMatch = apiPath.match(/^\/annotations\/([^/]+)\/tweaks\/([^/]+)\/accept$/);
  if (acceptTweakMatch && req.method === 'POST') {
    const [, annId, marker] = acceptTweakMatch;
    try {
      await tweaks.finalizeOneTweak(marker);
      store.unlinkTweak(annId, marker);
      broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() });
      broadcast({ type: 'annotations:sync', payload: store.all() });
      jsonResponse(res, 200, { ok: true });
    } catch (e) { jsonResponse(res, 400, { error: String(e) }); }
    return;
  }

  if (req.method === 'GET' && apiPath === '/tweaks') {
    jsonResponse(res, 200, { knobs: tweaks.buildSchema() });
    return;
  }

  jsonResponse(res, 404, { error: 'not found' });
});

httpServer.on('upgrade', (req, socket, head) => {
  if (req.url === '/design-bridge') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

await store.load();
await tweaks.discoverScripts();
tweaks.watchScripts(() => broadcast({ type: 'tweak:schema', payload: tweaks.buildSchema() }));

httpServer.listen(PORT, () => {
  console.log(`[design-bridge] server listening on http://localhost:${PORT} (root: ${ROOT})`);
});
