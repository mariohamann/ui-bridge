import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ViteDevServer } from 'vite';
import type { PluginState } from './ws-server.js';
import { buildSchema, applyTweakChange, resetTweak, resetAllTweaks, finalizeForAnnotation, finalizeOneTweak, dismissTweak } from './script-runner.js';
import { persistAnnotation, deleteAnnotationFile, unlinkTweakFromAnnotation } from './ws-server.js';
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

    if (req.method === 'POST' && path === '/annotations') {
      try {
        const ann = (await readBody(req)) as { id?: string; } & Record<string, unknown>;
        if (!ann?.id) { json(res, 400, { error: 'missing id' }); return; }
        state.annotations.set(ann.id, ann as never);
        state.broadcast({ type: 'annotations:sync', payload: [...state.annotations.values()] });
        void persistAnnotation(state, ann as never);
        json(res, 200, { ok: true });
      } catch (e) { json(res, 400, { error: String(e) }); }
      return;
    }

    if (req.method === 'DELETE' && path === '/annotations') {
      for (const id of state.annotations.keys()) void deleteAnnotationFile(state, id);
      state.annotations.clear();
      state.broadcast({ type: 'annotations:sync', payload: [] });
      json(res, 200, { ok: true });
      return;
    }

    // Per-annotation endpoints: /annotations/:id
    const annIdMatch = path.match(/^\/annotations\/([^/]+)$/);
    if (annIdMatch) {
      const annId = annIdMatch[1];
      if (req.method === 'GET') {
        const ann = state.annotations.get(annId);
        if (!ann) { json(res, 404, { error: 'not found' }); return; }
        json(res, 200, ann);
        return;
      }
      if (req.method === 'DELETE') {
        state.annotations.delete(annId);
        void deleteAnnotationFile(state, annId);
        state.broadcast({ type: 'annotations:sync', payload: [...state.annotations.values()] });
        json(res, 200, { ok: true });
        return;
      }
      if (req.method === 'POST' && path.endsWith('/accept')) {
        try {
          await finalizeForAnnotation(state, annId);
          state.annotations.delete(annId);
          void deleteAnnotationFile(state, annId);
          state.broadcast({ type: 'tweak:schema', payload: buildSchema(state.scripts) });
          state.broadcast({ type: 'annotations:sync', payload: [...state.annotations.values()] });
          json(res, 200, { ok: true });
        } catch (e) { json(res, 400, { error: String(e) }); }
        return;
      }
    }

    // DELETE /annotations/:id/tweaks/:marker — dismiss a single tweak
    const dismissMatch = path.match(/^\/annotations\/([^/]+)\/tweaks\/([^/]+)$/);
    if (dismissMatch && req.method === 'DELETE') {
      const [, annId, marker] = dismissMatch;
      try {
        await dismissTweak(state, marker);
        unlinkTweakFromAnnotation(state, annId, marker);
        state.broadcast({ type: 'tweak:schema', payload: buildSchema(state.scripts) });
        state.broadcast({ type: 'annotations:sync', payload: [...state.annotations.values()] });
        json(res, 200, { ok: true });
      } catch (e) { json(res, 400, { error: String(e) }); }
      return;
    }

    // POST /annotations/:id/tweaks/:marker/accept — accept a single tweak
    const acceptTweakMatch = path.match(/^\/annotations\/([^/]+)\/tweaks\/([^/]+)\/accept$/);
    if (acceptTweakMatch && req.method === 'POST') {
      const [, annId, marker] = acceptTweakMatch;
      try {
        await finalizeOneTweak(state, marker);
        unlinkTweakFromAnnotation(state, annId, marker);
        state.broadcast({ type: 'tweak:schema', payload: buildSchema(state.scripts) });
        state.broadcast({ type: 'annotations:sync', payload: [...state.annotations.values()] });
        json(res, 200, { ok: true });
      } catch (e) { json(res, 400, { error: String(e) }); }
      return;
    }

    json(res, 404, { error: 'not found' });
  });
}
