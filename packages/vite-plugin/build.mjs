import { build, context } from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');

mkdirSync('dist/node', { recursive: true });
mkdirSync('dist/browser', { recursive: true });

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

// ── Browser client bundle ─────────────────────────────────────────────────────
// Lit and all other browser deps get bundled in — no external deps in the browser.
// Use IIFE so the script can be injected as a plain <script> tag with no type="module".
const browserOptions = {
  entryPoints: ['src/browser/index.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  outfile: 'dist/browser/client.js',
  minify: true,
  // Lit decorators require experimentalDecorators + useDefineForClassFields=false
  tsconfigRaw: {
    compilerOptions: {
      experimentalDecorators: true,
      useDefineForClassFields: false,
      target: 'ES2021',
    },
  },
};

if (watch) {
  const [nodeCtx, browserCtx] = await Promise.all([
    context(nodeOptions),
    context(browserOptions),
  ]);
  await Promise.all([nodeCtx.watch(), browserCtx.watch()]);
  console.log('[design-bridge] watching for changes…');
} else {
  await build(nodeOptions);
  await build(browserOptions);

  // ── TypeScript declarations (node + shared only) ──────────────────────────────
  execSync('npx tsc -p tsconfig.build.json', { stdio: 'inherit' });

  console.log('[design-bridge] build complete');
}
