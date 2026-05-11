import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { ServerMessage, BrowserMessage, Annotation } from '../shared/protocol.js';
import type { ViteDevServer } from 'vite';
import type { TweakScript } from './script-runner.js';
import { applyTweakChange, buildSchema, resetTweak, resetAllTweaks } from './script-runner.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

// ─── Annotations markdown helpers ────────────────────────────────────────────

function annotationsToMarkdown(annotations: Map<string, Annotation>): string {
  if (annotations.size === 0) return '# Annotations\n\n_No annotations yet._\n';
  const lines: string[] = ['# Annotations\n'];
  let i = 1;
  for (const ann of annotations.values()) {
    lines.push(`## ${i++} — ${ann.labels.join(', ')}`);
    if (ann.comment) lines.push(`\n**Comment:** ${ann.comment}`);
    lines.push(`\n**Selectors:** ${ann.selectors.map(s => `\`${s}\``).join(', ')}`);
    if (ann.source) lines.push(`**Source:** \`${ann.source.file}:${ann.source.line}:${ann.source.column}\``);
    if (ann.labels.length > 1) lines.push(`**Targets:** ${ann.labels.join(' · ')}`);
    lines.push(`**Page:** ${ann.pageUrl}`);
    lines.push(`**Saved:** ${new Date(ann.timestamp).toISOString()}`);
    lines.push(`**CreatedAt:** ${new Date(ann.createdAt ?? ann.timestamp).toISOString()}`);
    if (ann.resolvedAt) lines.push(`**ResolvedAt:** ${new Date(ann.resolvedAt).toISOString()}`);
    if (ann.replies?.length) lines.push(`**Replies:** ${JSON.stringify(ann.replies)}`);
    if (ann.linkedTweaks?.length) lines.push(`**LinkedTweaks:** ${JSON.stringify(ann.linkedTweaks)}`);
    lines.push('\n---\n');
  }
  return lines.join('\n');
}

export async function persistAnnotations(state: PluginState): Promise<void> {
  const annotationsFile = resolve(dirname(state.scriptsDir), 'annotations.md');
  try {
    await mkdir(dirname(annotationsFile), { recursive: true });
    await writeFile(annotationsFile, annotationsToMarkdown(state.annotations), 'utf-8');
  } catch (e) {
    console.warn('[design-bridge] could not write annotations.md:', e);
  }
}

export async function loadAnnotationsFromFile(state: PluginState): Promise<void> {
  const { readFile } = await import('node:fs/promises');
  const annotationsFile = resolve(dirname(state.scriptsDir), 'annotations.md');
  try {
    const raw = await readFile(annotationsFile, 'utf-8');
    // Parse sections between ## and ---
    const sections = raw.split(/\n---\n/).filter(s => s.includes('**Selectors:**') || s.includes('**Source:**'));
    for (const section of sections) {
      const idMatch = section.match(/\*\*Saved:\*\* (.+)/);
      const commentMatch = section.match(/\*\*Comment:\*\* (.+)/);
      const selectorsMatch = section.match(/\*\*Selectors:\*\* (.+)/);
      const sourceMatch = section.match(/\*\*Source:\*\* `([^:]+):(\d+):(\d+)`/);
      const pageMatch = section.match(/\*\*Page:\*\* (.+)/);
      const createdAtMatch = section.match(/\*\*CreatedAt:\*\* (.+)/);
      const resolvedAtMatch = section.match(/\*\*ResolvedAt:\*\* (.+)/);
      const repliesMatch = section.match(/\*\*Replies:\*\* (.+)/);
      const linkedTweaksMatch = section.match(/\*\*LinkedTweaks:\*\* (.+)/);
      const headingMatch = section.match(/## \d+ — (.+)/);
      if (!idMatch) continue;
      const selectors = selectorsMatch ? selectorsMatch[1].split(',').map(s => s.trim().replace(/^`|`$/g, '')) : [];
      const labels = headingMatch ? headingMatch[1].split(',').map(s => s.trim()) : selectors;
      const id = `loaded-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const savedAt = new Date(idMatch[1].trim()).getTime() || Date.now();
      let replies = undefined;
      if (repliesMatch) {
        try {
          replies = JSON.parse(repliesMatch[1].trim()) as Annotation['replies'];
        } catch {
          replies = undefined;
        }
      }
      let linkedTweaks = undefined;
      if (linkedTweaksMatch) {
        try {
          linkedTweaks = JSON.parse(linkedTweaksMatch[1].trim()) as Annotation['linkedTweaks'];
        } catch {
          linkedTweaks = undefined;
        }
      }
      const ann: Annotation = {
        id,
        selectors,
        labels,
        comment: commentMatch?.[1]?.trim() ?? '',
        pageUrl: pageMatch?.[1]?.trim() ?? '',
        timestamp: savedAt,
        createdAt: createdAtMatch ? (new Date(createdAtMatch[1].trim()).getTime() || savedAt) : savedAt,
        resolvedAt: resolvedAtMatch ? new Date(resolvedAtMatch[1].trim()).getTime() : undefined,
        source: sourceMatch ? {
          file: sourceMatch[1],
          line: Number(sourceMatch[2]),
          column: Number(sourceMatch[3]),
        } : undefined,
        replies,
        linkedTweaks,
      };
      state.annotations.set(id, ann);
    }
    if (state.annotations.size > 0) {
      console.log(`[design-bridge] loaded ${state.annotations.size} annotation(s) from annotations.md`);
    }
  } catch {
    // File doesn't exist yet — that's fine
  }
}

export interface PluginState {
  rootDir: string;
  scriptsDir: string;
  cacheDir: string;
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
          void persistAnnotations(state);
          break;
        }

        case 'annotation:delete': {
          state.annotations.delete(msg.payload.id);
          broadcast({ type: 'annotations:sync', payload: [...state.annotations.values()] });
          void persistAnnotations(state);
          break;
        }

        case 'annotation:clear': {
          state.annotations.clear();
          broadcast({ type: 'annotations:sync', payload: [] });
          void persistAnnotations(state);
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
