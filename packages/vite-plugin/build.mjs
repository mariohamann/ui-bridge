import { build, context } from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');

mkdirSync('dist/node', { recursive: true });

// ── Node plugin bundle ────────────────────────────────────────────────────────
// External: all npm packages + Node builtins (they're available at runtime)
const nodeOptions = {
  entryPoints: ['src/node/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/node/index.js',
  packages: 'external',
};

if (watch) {
  const nodeCtx = await context(nodeOptions);
  await nodeCtx.watch();
  console.log('[design-bridge/vite-plugin] watching for changes…');
} else {
  await build(nodeOptions);

  // ── TypeScript declarations ───────────────────────────────────────────────
  execSync('npx tsc -p tsconfig.build.json', { stdio: 'inherit' });

  console.log('[design-bridge/vite-plugin] build complete');
}
