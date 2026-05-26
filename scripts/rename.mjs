#!/usr/bin/env node
/**
 * Rename script: Design Bridge → UI Bridge
 *
 * Usage:
 *   node scripts/rename.mjs          # dry-run (no files written)
 *   node scripts/rename.mjs --apply  # apply changes
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname, basename } from 'path';

const APPLY = process.argv.includes('--apply');
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// Ordered from most-specific to least-specific to avoid double-substitution.
const SUBSTITUTIONS = [
  // npm scope
  ['@design-bridge/', '@ui-bridge/'],

  // Demo package names
  ['design-bridge-demo-', 'ui-bridge-demo-'],

  // Environment variables (uppercase, most specific first)
  ['DESIGN_BRIDGE_READY', 'UI_BRIDGE_READY'],
  ['DESIGN_BRIDGE_PORT', 'UI_BRIDGE_PORT'],
  ['DESIGN_BRIDGE_URL', 'UI_BRIDGE_URL'],
  ['DESIGN_BRIDGE_ROOT', 'UI_BRIDGE_ROOT'],

  // Injected browser globals
  ['__DB_WS_URL__', '__UIB_WS_URL__'],
  ['__DB_COMPONENTS__', '__UIB_COMPONENTS__'],

  // Uppercase constants / env vars
  ['DB_PORT', 'UIB_PORT'],
  ['DB_HIGHLIGHT_COLOR', 'UIB_HIGHLIGHT_COLOR'],
  ['DB_COMMENT_TAG', 'UIB_COMMENT_TAG'],
  ['DB_SOURCE_INSPECTOR_TAG', 'UIB_SOURCE_INSPECTOR_TAG'],

  // Bin / MCP identifiers
  ['design-bridge-mcp', 'ui-bridge-mcp'],
  ['design-bridge://', 'ui-bridge://'],
  ['design-bridge:comments', 'ui-bridge:comments'],
  ['design-bridge-docs', 'ui-bridge-docs'],

  // Build artifact filename
  ['design-bridge.js', 'ui-bridge.js'],

  // Runtime folder
  ['.design-bridge/', '.ui-bridge/'],
  // Without trailing slash (e.g. in .gitignore)
  ['.design-bridge\n', '.ui-bridge\n'],
  // With quotes
  ["'.design-bridge'", "'.ui-bridge'"],
  ['".design-bridge"', '".ui-bridge"'],
  // Bare at end of string or line (catch any remaining)
  ['.design-bridge', '.ui-bridge'],

  // DOM ids and query params
  ['__uib-hover-highlight', '__uib-hover-highlight'],
  ['?uib-comment=', '?uib-comment='],
  ['#uib-items', '#uib-items'],
  // query param in URL template literals / strings (without leading ?)
  ["'uib-comment'", "'uib-comment'"],
  ['"uib-comment"', '"uib-comment"'],

  // Custom element tags – longest/most specific first
  ['uib-comment-bar', 'uib-comment-bar'],
  ['uib-source-inspector', 'uib-source-inspector'],
  ['uib-dropdown-item', 'uib-dropdown-item'],
  ['uib-comment', 'uib-comment'],
  ['uib-textarea', 'uib-textarea'],
  ['uib-button', 'uib-button'],
  ['uib-badge', 'uib-badge'],
  ['uib-knob', 'uib-knob'],
  ['uib-tag', 'uib-tag'],

  // PascalCase class names (must come before generic camelCase)
  ['DbCommentBar', 'UibCommentBar'],
  ['DbSourceInspector', 'UibSourceInspector'],
  ['DbComment', 'UibComment'],
  ['DbKnob', 'UibKnob'],
  ['DbBadge', 'UibBadge'],
  ['DbButton', 'UibButton'],
  ['DbTextarea', 'UibTextarea'],

  // TypeScript types / React component names
  ['DesignBridgeModuleOptions', 'UiBridgeModuleOptions'],
  ['DesignBridgeNextOptions', 'UiBridgeNextOptions'],
  ['DesignBridgeOptions', 'UiBridgeOptions'],
  ['DesignBridgeScript', 'UiBridgeScript'],

  // camelCase function / export names (longer patterns first)
  ['designBridgeHostTokenStyles', 'uiBridgeHostTokenStyles'],
  ['designBridgeInjectLoader', 'uiBridgeInjectLoader'],
  ['designBridgeWithInspector', 'uiBridgeWithInspector'],
  ['designBridgeTurbopack', 'uiBridgeTurbopack'],
  ['designBridgeEsbuild', 'uiBridgeEsbuild'],
  ['designBridgeRollup', 'uiBridgeRollup'],
  ['designBridgeRspack', 'uiBridgeRspack'],
  ['designBridgeWebpack', 'uiBridgeWebpack'],
  ['designBridgeVite', 'uiBridgeVite'],
  ['withDesignBridge', 'withUiBridge'],
  ['designBridge', 'uiBridge'],

  // Human-readable display name
  ['Design Bridge', 'UI Bridge'],

  // Kebab-case catch-all (must be last)
  ['design-bridge', 'ui-bridge'],
];

// File extensions to process
const INCLUDE_EXTS = new Set([
  '.ts',
  '.mts',
  '.cts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.json',
  '.jsonc',
  '.md',
  '.mdx',
  '.astro',
  '.vue',
  '.svelte',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.toml',
  '.yaml',
  '.yml',
  '.sh',
]);

// Exact filenames to include even without a matching extension
const INCLUDE_NAMES = new Set(['.gitignore', '.prettierignore', '.npmignore', '.editorconfig']);

// Directory names to skip entirely
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  'test-results',
  '.cache',
  'coverage',
  '.next',
  '.nuxt',
  '.output',
  '.turbo',
]);

// Exact filenames to skip
const SKIP_FILES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'rename.mjs', // don't corrupt this script itself
]);

function shouldProcess(filePath) {
  const name = basename(filePath);
  if (SKIP_FILES.has(name)) return false;
  if (INCLUDE_NAMES.has(name)) return true;
  return INCLUDE_EXTS.has(extname(name));
}

function walkDir(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...walkDir(full));
    } else if (st.isFile() && shouldProcess(full)) {
      files.push(full);
    }
  }
  return files;
}

function applySubstitutions(content) {
  let result = content;
  let count = 0;
  for (const [from, to] of SUBSTITUTIONS) {
    let next = result;
    while (next.includes(from)) {
      next = next.replace(from, to);
      count++;
    }
    result = next;
  }
  return { result, count };
}

// ---- Main ----

const files = walkDir(ROOT);
let totalFiles = 0;
let totalSubs = 0;

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue; // skip binary or unreadable files
  }

  const { result, count } = applySubstitutions(content);
  if (count === 0) continue;

  const rel = relative(ROOT, file);
  console.log(`  ${rel}  (${count} substitution${count === 1 ? '' : 's'})`);

  if (APPLY) {
    writeFileSync(file, result, 'utf8');
  }

  totalFiles++;
  totalSubs += count;
}

console.log('');
console.log(`${'='.repeat(60)}`);
if (APPLY) {
  console.log(`Applied: ${totalFiles} files changed, ${totalSubs} substitutions`);
} else {
  console.log(`Dry-run: ${totalFiles} files would change, ${totalSubs} substitutions`);
  console.log(`Run with --apply to write changes.`);
}
