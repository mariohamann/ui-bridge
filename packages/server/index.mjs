#!/usr/bin/env node
/**
 * Design Bridge — Standalone Server
 *
 * Handles WebSocket connections, annotation CRUD, tweak script execution,
 * and the /inspect-pick endpoint for code-inspector integration.
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
import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { watch } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import fg from 'fast-glob';

const _require = createRequire(import.meta.url);
const CLIENT_BUNDLE_PATH = _require.resolve('@design-bridge/client');
const REVIEW_BUNDLE_PATH = _require.resolve('@design-bridge/client/review-page');

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
const ROOT = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : process.cwd();
const PORT = parseInt(process.env.DB_PORT ?? '7378', 10);

const SCRIPTS_DIR = resolve(ROOT, 'tweaks', 'scripts');
const CACHE_DIR = resolve(ROOT, 'tweaks', '.cache');
const ANNOTATIONS_DIR = resolve(ROOT, 'tweaks', 'annotations');

// ── State ─────────────────────────────────────────────────────────────────────

/** @type {Array<{ meta: object; defaultValue: string|number|boolean; scriptPath: string }>} */
let scripts = [];

/** @type {Map<string, object>} */
const annotations = new Map();

// ── Script runner ─────────────────────────────────────────────────────────────

async function discoverScripts() {
  try {
    const files = await fg(`${SCRIPTS_DIR}/*.mjs`, { onlyFiles: true, absolute: true });
    const result = [];
    for (const filePath of files.sort()) {
      try {
        const mod = await import(pathToFileURL(filePath).href + `?t=${Date.now()}`);
        const meta = mod.meta;
        if (!meta?.id || !meta?.label) {
          console.warn(`[design-bridge] ${filePath}: missing meta.id or meta.label — skipped`);
          continue;
        }
        result.push({ meta, defaultValue: meta.value, scriptPath: filePath });
      } catch (e) {
        console.warn(`[design-bridge] failed to load ${filePath}:`, e);
      }
    }
    return result;
  } catch {
    return [];
  }
}

function buildSchema(scripts) {
  return scripts.map(({ meta }) => ({
    marker: meta.id,
    label: meta.label,
    type: meta.type ?? 'string',
    value: meta.value,
    min: meta.min,
    max: meta.max,
    step: meta.step,
    options: meta.options,
    annotationId: meta.annotationId,
  }));
}

// ── Per-file snapshots ────────────────────────────────────────────────────────

function snapshotPath(absFilePath) {
  const key = Buffer.from(absFilePath).toString('base64url');
  return resolve(CACHE_DIR, `${key}.orig`);
}

async function ensureSnapshot(absFilePath) {
  const snap = snapshotPath(absFilePath);
  try { await access(snap); return; } catch { /* not yet snapshotted */ }
  await mkdir(CACHE_DIR, { recursive: true });
  const content = await readFile(absFilePath, 'utf-8');
  await writeFile(snap, content, 'utf-8');
}

async function readSnapshot(absFilePath) {
  try { return await readFile(snapshotPath(absFilePath), 'utf-8'); } catch { return null; }
}

async function deleteSnapshot(absFilePath) {
  await rm(snapshotPath(absFilePath), { force: true });
}

// ── Sandbox context (passed to each tweak script's apply()) ──────────────────

function makeCtx(rootDir) {
  function guard(filePath) {
    const abs = isAbsolute(filePath) ? filePath : resolve(rootDir, filePath);
    if (relative(rootDir, abs).startsWith('..')) {
      throw new Error(`[design-bridge] path "${filePath}" is outside project root — blocked`);
    }
    return abs;
  }
  return {
    async readFile(filePath) { return readFile(guard(filePath), 'utf-8'); },
    async writeFile(filePath, content) { await writeFile(guard(filePath), content, 'utf-8'); },
    async findFiles(pattern) {
      const abs = isAbsolute(pattern) ? pattern : resolve(rootDir, pattern);
      return fg(abs, { onlyFiles: true, absolute: true });
    },
    async replaceInFile(filePath, find, replacement) {
      const abs = guard(filePath);
      const content = await readFile(abs, 'utf-8');
      await writeFile(abs, content.replace(find instanceof RegExp ? find : new RegExp(find, 'g'), replacement), 'utf-8');
    },
    console: {
      log: (...a) => console.log('[tweak]', ...a),
      warn: (...a) => console.warn('[tweak]', ...a),
      error: (...a) => console.error('[tweak]', ...a),
    },
  };
}

// ── Dry run — discover which files a script would touch ──────────────────────

async function dryRun(script, value, rootDir) {
  const touched = [];
  const base = makeCtx(rootDir);
  function guard(p) {
    const abs = isAbsolute(p) ? p : resolve(rootDir, p);
    return abs;
  }
  const dryCtx = {
    ...base,
    async writeFile(p) { touched.push(guard(p)); },
    async replaceInFile(p) { touched.push(guard(p)); },
  };
  try {
    const mod = await import(pathToFileURL(script.scriptPath).href + `?t=${Date.now()}`);
    if (typeof mod.apply === 'function') await mod.apply(value, dryCtx);
  } catch { /* ignore — readFile may throw in dry run */ }
  return [...new Set(touched)];
}

// ── Replay engine — restore originals then re-apply all tweaks ───────────────

async function replayAllTweaks() {
  const allTouched = new Set();
  for (const s of scripts) {
    for (const f of await dryRun(s, s.meta.value, ROOT)) allTouched.add(f);
  }
  if (allTouched.size === 0) return;

  for (const f of allTouched) await ensureSnapshot(f);
  for (const f of allTouched) {
    const orig = await readSnapshot(f);
    if (orig !== null) await writeFile(f, orig, 'utf-8');
  }

  const ctx = makeCtx(ROOT);
  for (const s of scripts) {
    try {
      const mod = await import(pathToFileURL(s.scriptPath).href + `?t=${Date.now()}`);
      if (typeof mod.apply === 'function') await mod.apply(s.meta.value, ctx);
    } catch (e) {
      console.error(`[design-bridge] replay error in "${s.meta.id}":`, e);
    }
  }
}

async function applyTweakChange(marker, value) {
  const script = scripts.find(s => s.meta.id === marker);
  if (!script) { console.warn(`[design-bridge] tweak "${marker}" not found`); return; }
  script.meta.value = value;
  console.log(`[design-bridge] tweak "${marker}" → ${value}`);
  await replayAllTweaks();
}

async function resetTweak(marker) {
  const script = scripts.find(s => s.meta.id === marker);
  if (!script) return;
  script.meta.value = script.defaultValue;
  const anyDirty = scripts.some(s => s.meta.value !== s.defaultValue);
  if (anyDirty) {
    await replayAllTweaks();
  } else {
    const allTouched = new Set();
    for (const s of scripts) for (const f of await dryRun(s, s.defaultValue, ROOT)) allTouched.add(f);
    for (const f of allTouched) {
      const orig = await readSnapshot(f);
      if (orig !== null) { await writeFile(f, orig, 'utf-8'); await deleteSnapshot(f); }
    }
  }
}

async function resetAllTweaks() {
  const allTouched = new Set();
  for (const s of scripts) for (const f of await dryRun(s, s.meta.value, ROOT)) allTouched.add(f);
  for (const s of scripts) s.meta.value = s.defaultValue;
  for (const f of allTouched) {
    const orig = await readSnapshot(f);
    if (orig !== null) { await writeFile(f, orig, 'utf-8'); await deleteSnapshot(f); }
  }
}

/**
 * Finalize a subset of scripts (make their changes permanent), then replay the rest.
 * @param {typeof scripts} toFinalize - scripts to bake in
 * @param {typeof scripts} toKeep    - scripts to continue with
 */
async function finalizeScripts(toFinalize, toKeep) {
  if (toFinalize.length === 0) return;

  const allScripts = [...toFinalize, ...toKeep];

  // Step 1: Collect all files any script touches, ensure snapshots exist
  const allTouched = new Set();
  for (const s of allScripts) for (const f of await dryRun(s, s.meta.value, ROOT)) allTouched.add(f);
  for (const f of allTouched) await ensureSnapshot(f);

  // Step 2: Restore all touched files to their originals
  for (const f of allTouched) {
    const orig = await readSnapshot(f);
    if (orig !== null) await writeFile(f, orig, 'utf-8');
  }

  // Step 3: Apply ONLY the finalised scripts — their state becomes the new baseline
  const ctx = makeCtx(ROOT);
  for (const s of toFinalize) {
    try {
      const mod = await import(pathToFileURL(s.scriptPath).href + `?t=${Date.now()}`);
      if (typeof mod.apply === 'function') await mod.apply(s.meta.value, ctx);
    } catch (e) {
      console.error(`[design-bridge] finalize error in "${s.meta.id}":`, e);
    }
  }

  // Step 4: Update snapshots for files the finalised scripts touch
  // (so toKeep scripts replay on top of the new permanent baseline)
  const finalizedFiles = new Set();
  for (const s of toFinalize) for (const f of await dryRun(s, s.meta.value, ROOT)) finalizedFiles.add(f);
  for (const f of finalizedFiles) {
    await deleteSnapshot(f);
    try {
      const content = await readFile(f, 'utf-8');
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(snapshotPath(f), content, 'utf-8');
    } catch { /* file might not exist */ }
  }

  // Step 5: Delete finalized script files
  for (const s of toFinalize) await rm(s.scriptPath, { force: true });

  // Step 6: Replay remaining scripts on top of the new baseline
  scripts = toKeep;
  if (toKeep.length > 0) {
    await replayAllTweaks();
  } else {
    // No remaining — clean up all snapshots for finalized files
    for (const f of finalizedFiles) {
      await deleteSnapshot(f);
    }
  }
}

/** Finalize ALL tweaks linked to the given annotationId. */
async function finalizeForAnnotation(annotationId) {
  const toFinalize = scripts.filter(s => s.meta.annotationId === annotationId);
  const toKeep = scripts.filter(s => s.meta.annotationId !== annotationId);
  await finalizeScripts(toFinalize, toKeep);
}

/** Finalize a single tweak (by marker), keep all others. */
async function finalizeOneTweak(marker) {
  const toFinalize = scripts.filter(s => s.meta.id === marker);
  const toKeep = scripts.filter(s => s.meta.id !== marker);
  await finalizeScripts(toFinalize, toKeep);
}

/** Revert a single tweak's file changes and remove it from the active set. */
async function dismissTweak(marker) {
  const idx = scripts.findIndex(s => s.meta.id === marker);
  if (idx < 0) return;
  const [dismissed] = scripts.splice(idx, 1);

  // Files this script would have touched
  const dismissedFiles = new Set(await dryRun(dismissed, dismissed.meta.value, ROOT));

  if (scripts.length > 0) {
    // Replay remaining — they restore snapshots (originals) then re-apply themselves
    await replayAllTweaks();
    // Clean up snapshots for files only the dismissed script was using
    const keepFiles = new Set();
    for (const s of scripts) for (const f of await dryRun(s, s.meta.value, ROOT)) keepFiles.add(f);
    for (const f of dismissedFiles) {
      if (!keepFiles.has(f)) await deleteSnapshot(f);
    }
  } else {
    // No remaining scripts — restore dismissed files to their originals
    for (const f of dismissedFiles) {
      const orig = await readSnapshot(f);
      if (orig !== null) { await writeFile(f, orig, 'utf-8'); await deleteSnapshot(f); }
    }
  }

  await rm(dismissed.scriptPath, { force: true });
}

// ── Annotations persistence (per-file JSON) ──────────────────────────────────

async function persistAnnotation(ann) {
  try {
    await mkdir(ANNOTATIONS_DIR, { recursive: true });
    await writeFile(resolve(ANNOTATIONS_DIR, `${ann.id}.json`), JSON.stringify(ann, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[design-bridge] could not write annotation file:', e);
  }
}

async function deleteAnnotationFile(id) {
  try {
    await rm(resolve(ANNOTATIONS_DIR, `${id}.json`), { force: true });
  } catch { /* ignore */ }
}

function unlinkTweakFromAnnotation(annotationId, marker) {
  const ann = annotations.get(annotationId);
  if (ann) {
    ann.linkedTweaks = (ann.linkedTweaks ?? []).filter(t => t.marker !== marker);
    ann.timestamp = Date.now();
    annotations.set(annotationId, ann);
    persistAnnotation(ann);
  }
}

async function loadAnnotations() {
  try {
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(ANNOTATIONS_DIR).catch(() => []);
    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const raw = await readFile(resolve(ANNOTATIONS_DIR, file), 'utf-8');
        const ann = JSON.parse(raw);
        if (ann?.id) annotations.set(ann.id, ann);
      } catch (e) {
        console.warn(`[design-bridge] could not parse annotation ${file}:`, e);
      }
    }
    if (annotations.size > 0) console.log(`[design-bridge] loaded ${annotations.size} annotation(s)`);
  } catch { /* dir doesn't exist yet — that's fine */ }
}

// ── Annotations review page ───────────────────────────────────────────────────

const REVIEW_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Design Bridge — Annotations</title>
  <style>html,body{margin:0;padding:0;background:#1e1e2e;}</style>
</head>
<body>
  <bridge-review-page></bridge-review-page>
  <script src="/design-bridge/review-page.js"></script>
</body>
</html>`;

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function jsonResponse(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(data);
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
  // Send current state to newly connected browser
  const schema = buildSchema(scripts);
  if (schema.length > 0) ws.send(JSON.stringify({ type: 'tweak:schema', payload: schema }));
  if (annotations.size > 0) ws.send(JSON.stringify({ type: 'annotations:sync', payload: [...annotations.values()] }));

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case 'tweak:change':
        await applyTweakChange(msg.payload.marker, msg.payload.value);
        break;

      case 'tweak:reset':
        await resetTweak(msg.payload.marker);
        broadcast({ type: 'tweak:schema', payload: buildSchema(scripts) });
        break;

      case 'tweak:reset-all':
        await resetAllTweaks();
        broadcast({ type: 'tweak:schema', payload: buildSchema(scripts) });
        break;

      case 'tweak:finalize':
        try { await rm(SCRIPTS_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
        try { await rm(CACHE_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
        scripts = [];
        broadcast({ type: 'tweak:schema', payload: [] });
        break;

      case 'tweak:discard-all':
        await resetAllTweaks();
        try { await rm(SCRIPTS_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
        try { await rm(CACHE_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
        scripts = [];
        broadcast({ type: 'tweak:schema', payload: [] });
        break;

      case 'annotation:upsert':
        annotations.set(msg.payload.id, msg.payload);
        broadcast({ type: 'annotations:sync', payload: [...annotations.values()] });
        persistAnnotation(msg.payload);
        break;

      case 'annotation:delete':
        annotations.delete(msg.payload.id);
        broadcast({ type: 'annotations:sync', payload: [...annotations.values()] });
        deleteAnnotationFile(msg.payload.id);
        break;

      case 'annotation:clear':
        for (const id of annotations.keys()) deleteAnnotationFile(id);
        annotations.clear();
        broadcast({ type: 'annotations:sync', payload: [] });
        break;

      case 'annotation:focus':
        // Relay to all other connected clients (e.g. app windows)
        broadcast({ type: 'annotation:focus', payload: msg.payload });
        break;

      case 'tweak:accept-annotation': {
        const { annotationId } = msg.payload;
        await finalizeForAnnotation(annotationId);
        annotations.delete(annotationId);
        await deleteAnnotationFile(annotationId);
        broadcast({ type: 'tweak:schema', payload: buildSchema(scripts) });
        broadcast({ type: 'annotations:sync', payload: [...annotations.values()] });
        break;
      }

      case 'tweak:accept-tweak': {
        const { annotationId, marker } = msg.payload;
        await finalizeOneTweak(marker);
        unlinkTweakFromAnnotation(annotationId, marker);
        broadcast({ type: 'tweak:schema', payload: buildSchema(scripts) });
        broadcast({ type: 'annotations:sync', payload: [...annotations.values()] });
        break;
      }

      case 'tweak:dismiss': {
        const { annotationId, marker } = msg.payload;
        await dismissTweak(marker);
        unlinkTweakFromAnnotation(annotationId, marker);
        broadcast({ type: 'tweak:schema', payload: buildSchema(scripts) });
        broadcast({ type: 'annotations:sync', payload: [...annotations.values()] });
        break;
      }
    }
  });
});

// ── HTTP server ───────────────────────────────────────────────────────────────

const httpServer = createServer(async (req, res) => {
  const url = req.url ?? '';

  if (req.method === 'OPTIONS') { jsonResponse(res, 204, {}); return; }

  // Health check
  if (url === '/health') { jsonResponse(res, 200, { ok: true, port: PORT, root: ROOT }); return; }

  // Serve the browser client bundle — allows any page to load Design Bridge with a single <script> tag
  if (url === '/design-bridge/client.js' && req.method === 'GET') {
    try {
      const content = readFileSync(CLIENT_BUNDLE_PATH);
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      res.end(content);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
    return;
  }

  // Serve the review page Lit component bundle
  if (url === '/design-bridge/review-page.js' && req.method === 'GET') {
    try {
      const content = readFileSync(REVIEW_BUNDLE_PATH);
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      res.end(content);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
    return;
  }

  // code-inspector hook: POST /inspect-pick { file, line, column }
  // Broadcasts inspect:pick to all connected browsers so they open the annotation popover
  if (url === '/inspect-pick' && req.method === 'POST') {
    try {
      const source = await readBody(req);
      broadcast({ type: 'inspect:pick', payload: source });
      jsonResponse(res, 200, { ok: true });
    } catch (e) { jsonResponse(res, 400, { error: String(e) }); }
    return;
  }

  // Annotations review page
  if (req.method === 'GET' && (url === '/' || url === '')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(REVIEW_PAGE_HTML);
    return;
  }

  // REST API
  const apiPath = url.startsWith('/api') ? url.slice(4) : null;
  if (!apiPath) { jsonResponse(res, 404, { error: 'not found' }); return; }

  if (req.method === 'GET' && apiPath === '/annotations') {
    jsonResponse(res, 200, { annotations: [...annotations.values()] });
    return;
  }

  if (req.method === 'POST' && apiPath === '/annotations') {
    try {
      const ann = await readBody(req);
      if (!ann?.id) { jsonResponse(res, 400, { error: 'missing id' }); return; }
      annotations.set(ann.id, ann);
      broadcast({ type: 'annotations:sync', payload: [...annotations.values()] });
      await persistAnnotation(ann);
      jsonResponse(res, 200, { ok: true });
    } catch (e) { jsonResponse(res, 400, { error: String(e) }); }
    return;
  }

  if (req.method === 'DELETE' && apiPath === '/annotations') {
    for (const id of annotations.keys()) await deleteAnnotationFile(id);
    annotations.clear();
    broadcast({ type: 'annotations:sync', payload: [] });
    jsonResponse(res, 200, { ok: true });
    return;
  }

  // Per-annotation endpoints: /annotations/:id
  const annIdMatch = apiPath.match(/^\/annotations\/([^/]+)$/);
  if (annIdMatch) {
    const annId = annIdMatch[1];
    if (req.method === 'GET') {
      const ann = annotations.get(annId);
      if (!ann) { jsonResponse(res, 404, { error: 'not found' }); return; }
      jsonResponse(res, 200, ann);
      return;
    }
    if (req.method === 'DELETE') {
      annotations.delete(annId);
      await deleteAnnotationFile(annId);
      broadcast({ type: 'annotations:sync', payload: [...annotations.values()] });
      jsonResponse(res, 200, { ok: true });
      return;
    }
  }

  // POST /annotations/:id/accept — accept all tweaks for this annotation
  const acceptAnnMatch = apiPath.match(/^\/annotations\/([^/]+)\/accept$/);
  if (acceptAnnMatch && req.method === 'POST') {
    const annId = acceptAnnMatch[1];
    try {
      await finalizeForAnnotation(annId);
      annotations.delete(annId);
      await deleteAnnotationFile(annId);
      broadcast({ type: 'tweak:schema', payload: buildSchema(scripts) });
      broadcast({ type: 'annotations:sync', payload: [...annotations.values()] });
      jsonResponse(res, 200, { ok: true });
    } catch (e) { jsonResponse(res, 400, { error: String(e) }); }
    return;
  }

  // DELETE /annotations/:id/tweaks/:marker — dismiss a single tweak
  const dismissMatch = apiPath.match(/^\/annotations\/([^/]+)\/tweaks\/([^/]+)$/);
  if (dismissMatch && req.method === 'DELETE') {
    const [, annId, marker] = dismissMatch;
    try {
      await dismissTweak(marker);
      unlinkTweakFromAnnotation(annId, marker);
      broadcast({ type: 'tweak:schema', payload: buildSchema(scripts) });
      broadcast({ type: 'annotations:sync', payload: [...annotations.values()] });
      jsonResponse(res, 200, { ok: true });
    } catch (e) { jsonResponse(res, 400, { error: String(e) }); }
    return;
  }

  // POST /annotations/:id/tweaks/:marker/accept — accept a single tweak
  const acceptTweakMatch = apiPath.match(/^\/annotations\/([^/]+)\/tweaks\/([^/]+)\/accept$/);
  if (acceptTweakMatch && req.method === 'POST') {
    const [, annId, marker] = acceptTweakMatch;
    try {
      await finalizeOneTweak(marker);
      unlinkTweakFromAnnotation(annId, marker);
      broadcast({ type: 'tweak:schema', payload: buildSchema(scripts) });
      broadcast({ type: 'annotations:sync', payload: [...annotations.values()] });
      jsonResponse(res, 200, { ok: true });
    } catch (e) { jsonResponse(res, 400, { error: String(e) }); }
    return;
  }

  if (req.method === 'GET' && apiPath === '/tweaks') {
    jsonResponse(res, 200, { knobs: buildSchema(scripts) });
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

// ── Script watcher ────────────────────────────────────────────────────────────

async function reloadScripts() {
  scripts = await discoverScripts();
  broadcast({ type: 'tweak:schema', payload: buildSchema(scripts) });
  console.log(`[design-bridge] reloaded — ${scripts.length} tweak(s)`);
}

function watchScripts() {
  try {
    let debounce = null;
    watch(SCRIPTS_DIR, { recursive: false }, (event, filename) => {
      if (!filename?.endsWith('.mjs')) return;
      clearTimeout(debounce);
      debounce = setTimeout(reloadScripts, 100);
    });
  } catch {
    // Scripts dir may not exist yet — that's fine
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

await loadAnnotations();
scripts = await discoverScripts();

httpServer.listen(PORT, () => {
  const tweakInfo = scripts.length > 0 ? `, ${scripts.length} tweak(s)` : '';
  console.log(`[design-bridge] :${PORT} → ${ROOT}${tweakInfo}`);
  console.log(`[design-bridge] Annotations review → http://localhost:${PORT}/`);
});

watchScripts();
