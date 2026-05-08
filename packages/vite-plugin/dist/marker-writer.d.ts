import type { MarkerRegistry } from '@design-bridge/core';
export declare class MarkerWriter {
    private registry;
    constructor(registry: MarkerRegistry);
    replaceValue(name: string, newValue: string): Promise<void>;
    finalizeMarker(name: string): Promise<void>;
    discardMarker(name: string): Promise<void>;
}
//# sourceMappingURL=marker-writer.d.ts.map