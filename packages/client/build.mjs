import { build, context } from 'esbuild';
import { mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');

mkdirSync('dist', { recursive: true });

// Lit and all other browser deps get bundled in — no external deps in the browser.
// Use IIFE so the script can be injected as a plain <script> tag with no type="module".
const options = {
  entryPoints: ['src/browser/index.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  outfile: 'dist/design-bridge.js',
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
  const ctx = await context(options);
  await ctx.watch();
  console.log('[design-bridge/client] watching for changes…');
} else {
  await build(options);
  console.log('[design-bridge/client] build complete → dist/design-bridge.js');
}
