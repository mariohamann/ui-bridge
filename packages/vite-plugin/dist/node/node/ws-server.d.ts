import type { Annotation } from '../shared/protocol.js';
import type { ViteDevServer } from 'vite';
import type { TweakScript } from './script-runner.js';
export declare function persistAnnotations(state: PluginState): Promise<void>;
export declare function loadAnnotationsFromFile(state: PluginState): Promise<void>;
export interface PluginState {
    rootDir: string;
    scriptsDir: string;
    cacheDir: string;
    scripts: TweakScript[];
    annotations: Map<string, Annotation>;
    broadcast: (msg: unknown) => void;
}
export declare function createWsServer(server: ViteDevServer, state: PluginState): void;
