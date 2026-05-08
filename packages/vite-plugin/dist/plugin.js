import { resolve } from 'node:path';
import { createWsServer } from './ws-server.js';
import { registerApiMiddleware } from './api-middleware.js';
import { buildSchema, discoverScripts } from './script-runner.js';
export function designBridge() {
    const state = {
        rootDir: '',
        scriptsDir: '',
        cacheDir: '',
        scripts: [],
        broadcast: () => { },
    };
    return {
        name: 'design-bridge',
        // Prevent Vite from treating snapshot writes in tweaks/.cache/ as
        // "unknown new file" and triggering a premature full-reload before
        // index.html has been written with the updated values.
        config() {
            return {
                server: { watch: { ignored: ['**/tweaks/.cache/**'] } },
            };
        },
        async configResolved(config) {
            state.rootDir = config.root;
            state.scriptsDir = resolve(config.root, 'tweaks', 'scripts');
            state.cacheDir = resolve(config.root, 'tweaks', '.cache');
            console.log('[design-bridge] loading scripts from', state.scriptsDir);
            state.scripts = await discoverScripts(state.scriptsDir);
            console.log(`[design-bridge] ${state.scripts.length} tweak(s) loaded`);
        },
        configureServer(server) {
            createWsServer(server, state);
            registerApiMiddleware(server, state);
            server.watcher.add(state.scriptsDir);
            server.watcher.on('all', async (event, filePath) => {
                if (!filePath.startsWith(state.scriptsDir))
                    return;
                if (!filePath.endsWith('.mjs'))
                    return;
                console.log(`[design-bridge] script ${event}: ${filePath} — reloading`);
                state.scripts = await discoverScripts(state.scriptsDir);
                state.broadcast({ type: 'tweak:schema', payload: buildSchema(state.scripts) });
            });
        },
    };
}
//# sourceMappingURL=plugin.js.map