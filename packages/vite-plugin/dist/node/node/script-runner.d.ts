import type { TweakKnob } from '../shared/protocol.js';
export interface ScriptMeta {
    id: string;
    label: string;
    type: TweakKnob['type'];
    value: string | number | boolean;
    options?: Record<string, string>;
    min?: number;
    max?: number;
    step?: number;
}
export interface TweakScript {
    meta: ScriptMeta;
    /** Original value from the .mjs file — restored on reset */
    defaultValue: string | number | boolean;
    scriptPath: string;
}
export interface TweakState {
    rootDir: string;
    scriptsDir: string;
    cacheDir: string;
    scripts: TweakScript[];
    broadcast: (msg: unknown) => void;
}
export declare function discoverScripts(scriptsDir: string): Promise<TweakScript[]>;
export declare function buildSchema(scripts: TweakScript[]): TweakKnob[];
export declare function applyTweakChange(state: TweakState, id: string, value: string): Promise<void>;
export declare function resetTweak(state: TweakState, id: string): Promise<void>;
export declare function resetAllTweaks(state: TweakState): Promise<void>;
