import { build, context } from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');

mkdirSync('dist', { recursive: true });

const options = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/index.js',
  packages: 'external',
};

// The turbopack loader must be CJS (webpack-loader convention) and resolvable
// at a stable path so next.config.ts can require.resolve it.
const loaderOptions = {
  entryPoints: ['src/turbopack-loader.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/turbopack-loader.cjs',
  packages: 'external',
};

if (watch) {
  const ctx = await context(options);
  const loaderCtx = await context(loaderOptions);
  await Promise.all([ctx.watch(), loaderCtx.watch()]);
  console.log('[design-bridge/unplugin] watching for changes…');
} else {
  await Promise.all([build(options), build(loaderOptions)]);
  execSync('npx tsc -p tsconfig.build.json --emitDeclarationOnly --declaration --outDir dist', { stdio: 'inherit' });
  console.log('[design-bridge/unplugin] build complete');
}
