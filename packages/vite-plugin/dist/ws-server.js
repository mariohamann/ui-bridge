import { WebSocketServer, WebSocket } from 'ws';
import { applyTweakChange, buildSchema, resetTweak, resetAllTweaks } from './script-runner.js';
export function createWsServer(server, state) {
    const wss = new WebSocketServer({ noServer: true });
    server.httpServer?.on('upgrade', (req, socket, head) => {
        if (req.url === '/design-bridge') {
            wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
        }
    });
    function broadcast(msg) {
        const data = JSON.stringify(msg);
        for (const client of wss.clients) {
            if (client.readyState === WebSocket.OPEN)
                client.send(data);
        }
    }
    state.broadcast = broadcast;
    wss.on('connection', (ws) => {
        // Send current schema to newly connected browser
        const schema = buildSchema(state.scripts);
        if (schema.length > 0) {
            ws.send(JSON.stringify({ type: 'tweak:schema', payload: schema }));
        }
        ws.on('message', async (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw.toString());
            }
            catch {
                return;
            }
            switch (msg.type) {
                case 'tweak:change': {
                    console.log(`[design-bridge] tweak:change ${msg.payload.marker} = ${msg.payload.value}`);
                    try {
                        await applyTweakChange(state, msg.payload.marker, msg.payload.value);
                    }
                    catch (e) {
                        console.error('[design-bridge] tweak:change error:', e);
                    }
                    break;
                }
                case 'tweak:reset': {
                    const id = msg.payload.marker;
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
                    // "Apply" — keep code, drop scripts folder
                    const { rm } = await import('node:fs/promises');
                    try {
                        await rm(state.scriptsDir, { recursive: true, force: true });
                        await rm(state.cacheDir, { recursive: true, force: true });
                    }
                    catch { /* ignore */ }
                    state.scripts = [];
                    broadcast({ type: 'tweak:schema', payload: [] });
                    break;
                }
            }
        });
    });
}
//# sourceMappingURL=ws-server.js.map