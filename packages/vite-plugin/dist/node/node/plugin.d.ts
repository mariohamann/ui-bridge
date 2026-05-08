import type { Plugin } from 'vite';
/** Minimal public interface for consumers who import PluginState. */
export interface PluginState {
    rootDir: string;
    serverPort: number;
}
export declare function designBridge(): Plugin;
