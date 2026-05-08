import { buildSchema, applyTweakChange, resetTweak, resetAllTweaks } from './script-runner.js';
import { rm } from 'node:fs/promises';
function json(res, status, body) {
    const data = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(data);
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk) => (raw += chunk.toString()));
        req.on('end', () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            }
            catch {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}
export function registerApiMiddleware(server, state) {
    server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/design-bridge/api')) {
            next();
            return;
        }
        if (req.method === 'OPTIONS') {
            json(res, 204, {});
            return;
        }
        const path = url.replace('/design-bridge/api', '');
        if (req.method === 'GET' && path === '/tweaks') {
            json(res, 200, { knobs: buildSchema(state.scripts) });
            return;
        }
        if (req.method === 'POST' && path === '/run-tweak') {
            try {
                const { id, value } = (await readBody(req));
                await applyTweakChange(state, id, value);
                json(res, 200, { ok: true });
            }
            catch (e) {
                json(res, 400, { error: String(e) });
            }
            return;
        }
        if (req.method === 'POST' && path === '/reset') {
            try {
                const { id } = (await readBody(req));
                if (id)
                    await resetTweak(state, id);
                else
                    await resetAllTweaks(state);
                state.broadcast({ type: 'tweak:schema', payload: buildSchema(state.scripts) });
                json(res, 200, { ok: true });
            }
            catch (e) {
                json(res, 400, { error: String(e) });
            }
            return;
        }
        if (req.method === 'POST' && path === '/apply') {
            try {
                await rm(state.scriptsDir, { recursive: true, force: true });
                await rm(state.cacheDir, { recursive: true, force: true });
                state.scripts = [];
                state.broadcast({ type: 'tweak:schema', payload: [] });
                json(res, 200, { ok: true });
            }
            catch (e) {
                json(res, 400, { error: String(e) });
            }
            return;
        }
        json(res, 404, { error: 'not found' });
    });
}
//# sourceMappingURL=api-middleware.js.map