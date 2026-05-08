import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ViteDevServer } from 'vite';
import type { PluginState } from './ws-server.js';
import { buildSchema, applyTweakChange, resetTweak, resetAllTweaks } from './script-runner.js';
import { persistAnnotations } from './ws-server.js';
import { rm } from 'node:fs/promises';

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(data);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

export function registerApiMiddleware(server: ViteDevServer, state: PluginState): void {
  server.middlewares.use(async (req, res, next) => {
    const url = req.url ?? '';
    if (!url.startsWith('/design-bridge/api')) { next(); return; }
    if (req.method === 'OPTIONS') { json(res, 204, {}); return; }

    const path = url.replace('/design-bridge/api', '');

    if (req.method === 'GET' && path === '/tweaks') {
      json(res, 200, { knobs: buildSchema(state.scripts) });
      return;
    }

    if (req.method === 'POST' && path === '/run-tweak') {
      try {
        const { id, value } = (await readBody(req)) as { id: string; value: string; };
        await applyTweakChange(state, id, value);
        json(res, 200, { ok: true });
      } catch (e) { json(res, 400, { error: String(e) }); }
      return;
    }

    if (req.method === 'POST' && path === '/reset') {
      try {
        const { id } = (await readBody(req)) as { id?: string; };
        if (id) await resetTweak(state, id);
        else await resetAllTweaks(state);
        state.broadcast({ type: 'tweak:schema', payload: buildSchema(state.scripts) });
        json(res, 200, { ok: true });
      } catch (e) { json(res, 400, { error: String(e) }); }
      return;
    }

    if (req.method === 'POST' && path === '/apply') {
      try {
        await rm(state.scriptsDir, { recursive: true, force: true });
        state.scripts = [];
        state.broadcast({ type: 'tweak:schema', payload: [] });
        json(res, 200, { ok: true });
      } catch (e) { json(res, 400, { error: String(e) }); }
      return;
    }

    if (req.method === 'GET' && path === '/annotations') {
      json(res, 200, { annotations: [...state.annotations.values()] });
      return;
    }

    if (req.method === 'DELETE' && path === '/annotations') {
      state.annotations.clear();
      state.broadcast({ type: 'annotations:sync', payload: [] });
      void persistAnnotations(state);
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { error: 'not found' });
  });
}
