import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { ServerMessage, BrowserMessage, Annotation } from '../shared/protocol.js';
import type { ViteDevServer } from 'vite';
import type { TweakScript } from './script-runner.js';
import { applyTweakChange, buildSchema, resetTweak, resetAllTweaks, finalizeForAnnotation, finalizeOneTweak, dismissTweak } from './script-runner.js';
import { writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// ─── Annotations per-file JSON helpers ─────────────────────────────────────────

export async function persistAnnotation(state: PluginState, ann: Annotation): Promise<void> {
  try {
    await mkdir(state.annotationsDir, { recursive: true });
    await writeFile(resolve(state.annotationsDir, `${ann.id}.json`), JSON.stringify(ann, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[design-bridge] could not write annotation file:', e);
  }
}

export async function deleteAnnotationFile(state: PluginState, id: string): Promise<void> {
  try {
    await rm(resolve(state.annotationsDir, `${id}.json`), { force: true });
  } catch { /* ignore */ }
}

export async function loadAnnotationsFromDir(state: PluginState): Promise<void> {
  try {
    const { readFile } = await import('node:fs/promises');
    const files = await readdir(state.annotationsDir).catch(() => []);
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      try {
        const raw = await readFile(resolve(state.annotationsDir, file), 'utf-8');
        const ann = JSON.parse(raw) as Annotation;
        if (ann?.id) state.annotations.set(ann.id, ann);
      } catch (e) {
        console.warn(`[design-bridge] could not parse annotation ${file}:`, e);
      }
    }
    if (state.annotations.size > 0) {
      console.log(`[design-bridge] loaded ${state.annotations.size} annotation(s)`);
    }
  } catch { /* dir doesn't exist yet — that's fine */ }
}

/** Remove a single tweak link from an annotation and persist. */
export function unlinkTweakFromAnnotation(state: PluginState, annotationId: string, marker: string): void {
  const ann = state.annotations.get(annotationId);
  if (ann) {
    ann.linkedTweaks = (ann.linkedTweaks ?? []).filter((t) => t.marker !== marker);
    ann.timestamp = Date.now();
    state.annotations.set(annotationId, ann);
    void persistAnnotation(state, ann);
  }
}

export interface PluginState {
  rootDir: string;
  scriptsDir: string;
  cacheDir: string;
  annotationsDir: string;
  scripts: TweakScript[];
  annotations: Map<string, Annotation>;
  broadcast: (msg: unknown) => void;
}

export function createWsServer(server: ViteDevServer, state: PluginState): void {
  const wss = new WebSocketServer({ noServer: true });

  server.httpServer?.on('upgrade', (req: IncomingMessage, socket, head) => {
    if (req.url === '/design-bridge') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    }
  });

  function broadcast(msg: unknown): void {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  }

  state.broadcast = broadcast;

  wss.on('connection', (ws) => {
    // Send current schema + annotations to newly connected browser
    const schema = buildSchema(state.scripts);
    if (schema.length > 0) {
      ws.send(JSON.stringify({ type: 'tweak:schema', payload: schema }));
    }
    if (state.annotations.size > 0) {
      ws.send(JSON.stringify({ type: 'annotations:sync', payload: [...state.annotations.values()] }));
    }

    ws.on('message', async (raw) => {
      let msg: BrowserMessage;
      try {
        msg = JSON.parse(raw.toString()) as BrowserMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case 'tweak:change': {
          console.log(`[design-bridge] tweak:change ${msg.payload.marker} = ${msg.payload.value}`);
          try {
            await applyTweakChange(state, msg.payload.marker, msg.payload.value);
          } catch (e) {
            console.error('[design-bridge] tweak:change error:', e);
          }
          break;
        }

        case 'tweak:reset': {
          const id = (msg as unknown as { payload: { marker: string; }; }).payload.marker;
          console.log(`[design-bridge] reset tweak "${id}"`);
          await resetTweak(state, id);
          // Restore knob to its original value after reset
          const schema = buildSchema(state.scripts);
          broadcast({ type: 'tweak:schema', payload: schema });
          break;
        }

        case 'tweak:reset-all': {
          console.log('[design-bridge] reset all tweaks');
          await resetAllTweaks(state);
          broadcast({ type: 'tweak:schema', payload: buildSchema(state.scripts) });
          break;
        }

        case 'tweak:finalize': {
          // "Apply" — keep code, drop tweaks/scripts/ and cache
          const { rm } = await import('node:fs/promises');
          try {
            await rm(state.scriptsDir, { recursive: true, force: true });
          } catch { /* ignore */ }
          try {
            await rm(state.cacheDir, { recursive: true, force: true });
          } catch { /* ignore */ }
          state.scripts = [];
          broadcast({ type: 'tweak:schema', payload: [] });
          break;
        }

        case 'annotation:upsert': {
          state.annotations.set(msg.payload.id, msg.payload);
          broadcast({ type: 'annotations:sync', payload: [...state.annotations.values()] });
          void persistAnnotation(state, msg.payload);
          break;
        }

        case 'annotation:delete': {
          state.annotations.delete(msg.payload.id);
          broadcast({ type: 'annotations:sync', payload: [...state.annotations.values()] });
          void deleteAnnotationFile(state, msg.payload.id);
          break;
        }

        case 'annotation:clear': {
          for (const id of state.annotations.keys()) void deleteAnnotationFile(state, id);
          state.annotations.clear();
          broadcast({ type: 'annotations:sync', payload: [] });
          break;
        }

        case 'tweak:accept-annotation': {
          const { annotationId } = msg.payload;
          await finalizeForAnnotation(state, annotationId);
          state.annotations.delete(annotationId);
          void deleteAnnotationFile(state, annotationId);
          broadcast({ type: 'tweak:schema', payload: buildSchema(state.scripts) });
          broadcast({ type: 'annotations:sync', payload: [...state.annotations.values()] });
          break;
        }

        case 'tweak:accept-tweak': {
          const { annotationId, marker } = msg.payload;
          await finalizeOneTweak(state, marker);
          unlinkTweakFromAnnotation(state, annotationId, marker);
          broadcast({ type: 'tweak:schema', payload: buildSchema(state.scripts) });
          broadcast({ type: 'annotations:sync', payload: [...state.annotations.values()] });
          break;
        }

        case 'tweak:dismiss': {
          const { annotationId, marker } = msg.payload;
          await dismissTweak(state, marker);
          unlinkTweakFromAnnotation(state, annotationId, marker);
          broadcast({ type: 'tweak:schema', payload: buildSchema(state.scripts) });
          broadcast({ type: 'annotations:sync', payload: [...state.annotations.values()] });
          break;
        }

        case 'tweak:discard-all': {
          // "Discard & Exit" — reset all file changes, drop tweaks/scripts/ and cache
          await resetAllTweaks(state);
          const { rm: rmDiscard } = await import('node:fs/promises');
          try {
            await rmDiscard(state.scriptsDir, { recursive: true, force: true });
          } catch { /* ignore */ }
          try {
            await rmDiscard(state.cacheDir, { recursive: true, force: true });
          } catch { /* ignore */ }
          state.scripts = [];
          broadcast({ type: 'tweak:schema', payload: [] });
          break;
        }
      }
    });
  });
}
