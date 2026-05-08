import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
export async function loadTweaks(tweaksFile) {
    try {
        const raw = await fs.readFile(tweaksFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed.knobs || !Array.isArray(parsed.knobs))
            return [];
        return parsed.knobs;
    }
    catch {
        return [];
    }
}
export function buildSchema(tweaks) {
    return tweaks.map(({ script, ...knob }) => knob);
}
export async function applyTweakChange(state, id, value) {
    const tweak = state.tweaks.find((t) => t.marker === id);
    if (!tweak)
        return;
    tweak.value = value;
    const rulePath = resolve(state.tweaksDir, tweak.script);
    const rule = await readReplacementRule(rulePath);
    await runReplacement(state, rule, value);
}
export async function clearTweaks(state) {
    try {
        await fs.rm(state.tweaksDir, { recursive: true, force: true });
    }
    catch {
        // ignore
    }
    state.tweaks = [];
}
async function readReplacementRule(rulePath) {
    const raw = await fs.readFile(rulePath, 'utf-8');
    return JSON.parse(raw);
}
async function runReplacement(state, rule, value) {
    const srcRoot = resolve(state.rootDir, 'src');
    const patterns = rule.targets.map((p) => resolve(state.rootDir, p));
    const files = await fg(patterns, { onlyFiles: true, dot: false });
    for (const filePath of files) {
        if (!filePath.startsWith(srcRoot))
            continue;
        const content = await fs.readFile(filePath, 'utf-8');
        const re = new RegExp(rule.find, rule.flags ?? 'g');
        const replacement = rule.replace.replaceAll('{{value}}', value);
        const updated = content.replace(re, replacement);
        if (updated !== content) {
            await fs.writeFile(filePath, updated, 'utf-8');
        }
    }
}
//# sourceMappingURL=tweaks.js.map