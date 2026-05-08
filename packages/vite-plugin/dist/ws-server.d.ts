import type { ViteDevServer } from 'vite';
import type { TweakScript } from './script-runner.js';
export interface PluginState {
    rootDir: string;
    scriptsDir: string;
    cacheDir: string;
    scripts: TweakScript[];
    broadcast: (msg: unknown) => void;
}
export declare function createWsServer(server: ViteDevServer, state: PluginState): void;
//# sourceMappingURL=ws-server.d.ts.map