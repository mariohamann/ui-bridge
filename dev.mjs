/**
 * Root dev convenience alias — starts the Vite demo with full watch mode.
 * To dev a different demo, run `pnpm dev` from within that demo's directory.
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const child = spawn(
  'node',
  ['scripts/dev-demo.mjs', '--integration=unplugin', '--server=vite', '--demo=demos/vite'],
  { cwd: __dirname, stdio: 'inherit', shell: false },
);

child.on('error', (err) => {
  console.error('[dev] failed to start:', err.message);
  process.exit(1);
});

child.on('exit', (code) => process.exit(code ?? 0));
