import { promises as fs } from 'node:fs';
import { glob } from 'node:fs/promises';
import { resolve } from 'node:path';
import { scan } from '@design-bridge/core';
const WATCHED_EXTENSIONS = new Set(['.css', '.ts', '.js', '.tsx', '.jsx', '.html', '.vue', '.svelte']);
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git']);
function hasWatchedExtension(filePath) {
    const dot = filePath.lastIndexOf('.');
    if (dot === -1)
        return false;
    return WATCHED_EXTENSIONS.has(filePath.slice(dot));
}
async function scanFile(filePath, state) {
    let content;
    try {
        content = await fs.readFile(filePath, 'utf-8');
    }
    catch {
        return;
    }
    const fresh = scan(content, filePath);
    const diff = state.registry.diffAndApply(fresh, filePath);
    for (const entry of diff.added) {
        state.broadcast({ type: 'marker:registered', payload: entry });
    }
    for (const entry of diff.removed) {
        state.broadcast({ type: 'marker:removed', payload: { name: entry.name } });
    }
}
export function createFileWatcher(server, state) {
    // Initial scan of all project files so markers are registered on startup
    const root = server.config.root;
    (async () => {
        try {
            const pattern = `**/*.{ts,js,tsx,jsx,css,html,vue,svelte}`;
            for await (const file of glob(pattern, {
                cwd: root,
                exclude: (entry) => IGNORED_DIRS.has(entry),
            })) {
                await scanFile(resolve(root, file), state);
            }
        }
        catch {
            // glob not available in older Node — fall back silently
        }
    })();
    // Watch ongoing changes
    server.watcher.on('change', async (filePath) => {
        if (!hasWatchedExtension(filePath))
            return;
        await scanFile(filePath, state);
    });
}
//# sourceMappingURL=file-watcher.js.map