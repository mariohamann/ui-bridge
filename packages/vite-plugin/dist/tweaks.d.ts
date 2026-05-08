import type { TweakKnob } from '@design-bridge/core';
export interface TweakDefinition extends TweakKnob {
    /** Path to the replacement script (relative to /tweaks) */
    script: string;
}
export interface ReplacementRule {
    targets: string[];
    find: string;
    replace: string;
    flags?: string;
}
export interface TweakStoreState {
    rootDir: string;
    tweaksDir: string;
    tweaksFile: string;
    tweaks: TweakDefinition[];
}
export declare function loadTweaks(tweaksFile: string): Promise<TweakDefinition[]>;
export declare function buildSchema(tweaks: TweakDefinition[]): TweakKnob[];
export declare function applyTweakChange(state: TweakStoreState, id: string, value: string): Promise<void>;
export declare function clearTweaks(state: TweakStoreState): Promise<void>;
//# sourceMappingURL=tweaks.d.ts.map