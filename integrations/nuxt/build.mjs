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

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[design-bridge/nuxt] watching for changes…');
} else {
  await build(options);
  execSync('npx tsc -p tsconfig.build.json --emitDeclarationOnly --declaration --outDir dist', {
    stdio: 'inherit',
  });
  console.log('[design-bridge/nuxt] build complete');
}
