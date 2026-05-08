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
import { WebSocketServer, WebSocket } from 'ws';
import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { watch } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import fg from 'fast-glob';

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
const ROOT = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : process.cwd();
const PORT = parseInt(process.env.DB_PORT ?? '7378', 10);

const SCRIPTS_DIR = resolve(ROOT, 'tweaks', 'scripts');
const CACHE_DIR = resolve(ROOT, 'tweaks', '.cache');
const ANNOTATIONS_FILE = resolve(ROOT, 'tweaks', 'annotations.md');

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

// ── Annotations persistence ───────────────────────────────────────────────────

function annotationsToMarkdown() {
  if (annotations.size === 0) return '# Annotations\n\n_No annotations yet._\n';
  const lines = ['# Annotations\n'];
  let i = 1;
  for (const ann of annotations.values()) {
    lines.push(`## ${i++} — ${ann.labels.join(', ')}`);
    if (ann.comment) lines.push(`\n**Comment:** ${ann.comment}`);
    if (ann.selectors?.length) lines.push(`\n**Selectors:** ${ann.selectors.map(s => `\`${s}\``).join(', ')}`);
    if (ann.source) lines.push(`**Source:** \`${ann.source.file}:${ann.source.line}:${ann.source.column}\``);
    lines.push(`**Page:** ${ann.pageUrl}`);
    lines.push(`**Saved:** ${new Date(ann.timestamp).toISOString()}`);
    lines.push('\n---\n');
  }
  return lines.join('\n');
}

async function persistAnnotations() {
  try {
    await mkdir(dirname(ANNOTATIONS_FILE), { recursive: true });
    await writeFile(ANNOTATIONS_FILE, annotationsToMarkdown(), 'utf-8');
  } catch (e) {
    console.warn('[design-bridge] could not write annotations.md:', e);
  }
}

async function loadAnnotations() {
  try {
    const raw = await readFile(ANNOTATIONS_FILE, 'utf-8');
    const sections = raw.split(/\n---\n/).filter(s => s.includes('**Selectors:**') || s.includes('**Source:**'));
    for (const section of sections) {
      const commentMatch = section.match(/\*\*Comment:\*\* (.+)/);
      const selectorsMatch = section.match(/\*\*Selectors:\*\* (.+)/);
      const sourceMatch = section.match(/\*\*Source:\*\* `([^:]+):(\d+):(\d+)`/);
      const pageMatch = section.match(/\*\*Page:\*\* (.+)/);
      const savedMatch = section.match(/\*\*Saved:\*\* (.+)/);
      const headingMatch = section.match(/## \d+ — (.+)/);
      const selectors = selectorsMatch ? selectorsMatch[1].split(',').map(s => s.trim().replace(/^`|`$/g, '')) : [];
      const labels = headingMatch ? headingMatch[1].split(',').map(s => s.trim()) : selectors;
      const id = `loaded-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      annotations.set(id, {
        id,
        selectors,
        labels,
        comment: commentMatch?.[1]?.trim() ?? '',
        pageUrl: pageMatch?.[1]?.trim() ?? '',
        timestamp: savedMatch ? new Date(savedMatch[1].trim()).getTime() : Date.now(),
        source: sourceMatch ? { file: sourceMatch[1], line: parseInt(sourceMatch[2]), column: parseInt(sourceMatch[3]) } : undefined,
      });
    }
    if (annotations.size > 0) console.log(`[design-bridge] loaded ${annotations.size} annotation(s)`);
  } catch { /* file doesn't exist yet — that's fine */ }
}

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
        persistAnnotations();
        break;

      case 'annotation:delete':
        annotations.delete(msg.payload.id);
        broadcast({ type: 'annotations:sync', payload: [...annotations.values()] });
        persistAnnotations();
        break;

      case 'annotation:clear':
        annotations.clear();
        broadcast({ type: 'annotations:sync', payload: [] });
        persistAnnotations();
        break;
    }
  });
});

// ── HTTP server ───────────────────────────────────────────────────────────────

const httpServer = createServer(async (req, res) => {
  const url = req.url ?? '';

  if (req.method === 'OPTIONS') { jsonResponse(res, 204, {}); return; }

  // Health check
  if (url === '/health') { jsonResponse(res, 200, { ok: true, port: PORT, root: ROOT }); return; }

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

  // REST API
  const apiPath = url.startsWith('/api') ? url.slice(4) : null;
  if (!apiPath) { jsonResponse(res, 404, { error: 'not found' }); return; }

  if (req.method === 'GET' && apiPath === '/annotations') {
    jsonResponse(res, 200, { annotations: [...annotations.values()] });
    return;
  }

  if (req.method === 'DELETE' && apiPath === '/annotations') {
    annotations.clear();
    broadcast({ type: 'annotations:sync', payload: [] });
    persistAnnotations();
    jsonResponse(res, 200, { ok: true });
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
  console.log(`[design-bridge] ${scripts.length} tweak(s) loaded`);
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

console.log(`[design-bridge] server starting on :${PORT}`);
console.log(`[design-bridge] root: ${ROOT}`);
console.log(`[design-bridge] ${scripts.length} tweak(s) loaded`);

httpServer.listen(PORT, () => {
  console.log(`[design-bridge] WS  → ws://localhost:${PORT}/design-bridge`);
  console.log(`[design-bridge] API → http://localhost:${PORT}/api`);
  console.log(`[design-bridge] inspect-pick → POST http://localhost:${PORT}/inspect-pick`);
});

watchScripts();
