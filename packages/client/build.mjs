import { build, context } from 'esbuild';
import { mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');

mkdirSync('dist', { recursive: true });

// Lit and all other browser deps get bundled in — no external deps in the browser.
// Use IIFE so the script can be injected as a plain <script> tag with no type="module".
const sharedOptions = {
  bundle: true,
  platform: 'browser',
  format: 'iife',
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

const panelOptions = { ...sharedOptions, entryPoints: ['src/browser/index.ts'], outfile: 'dist/design-bridge.js' };
const reviewOptions = { ...sharedOptions, entryPoints: ['src/review/index.ts'], outfile: 'dist/review-page.js' };

if (watch) {
  const [ctx1, ctx2] = await Promise.all([context(panelOptions), context(reviewOptions)]);
  await Promise.all([ctx1.watch(), ctx2.watch()]);
  console.log('[design-bridge/client] watching for changes…');
} else {
  await Promise.all([build(panelOptions), build(reviewOptions)]);
  console.log('[design-bridge/client] build complete → dist/design-bridge.js, dist/review-page.js');
}
