import { promises as fs } from 'node:fs';
import { replace, strip } from '@design-bridge/core';
export class MarkerWriter {
    registry;
    constructor(registry) {
        this.registry = registry;
    }
    async replaceValue(name, newValue) {
        const entry = this.registry.get(name);
        if (!entry)
            throw new Error(`[design-bridge] marker "${name}" not in registry`);
        const content = await fs.readFile(entry.file, 'utf-8');
        const updated = replace(content, name, newValue);
        await fs.writeFile(entry.file, updated, 'utf-8');
    }
    async finalizeMarker(name) {
        const entry = this.registry.get(name);
        if (!entry)
            return;
        const content = await fs.readFile(entry.file, 'utf-8');
        const updated = strip(content, name);
        await fs.writeFile(entry.file, updated, 'utf-8');
    }
    async discardMarker(name) {
        const entry = this.registry.get(name);
        if (!entry)
            return;
        const content = await fs.readFile(entry.file, 'utf-8');
        const updated = strip(content, name, entry.originalValue);
        await fs.writeFile(entry.file, updated, 'utf-8');
    }
}
//# sourceMappingURL=marker-writer.js.map