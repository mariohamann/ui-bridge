import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skipBuild = process.env.SKIP_BUILD === 'true';
const protocolDir = path.resolve(__dirname, '../../core/protocol');
const clientDir = path.resolve(__dirname, '../../core/client');
const viteDemoDir = path.resolve(__dirname, '../../demos/vite');
const buildPrefix = skipBuild
  ? ''
  : `cd ${protocolDir} && node_modules/.bin/tsc -p tsconfig.json && cd ${__dirname} && node build.mjs && cd ${clientDir} && node build.mjs && `;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  // All three projects (vite/webpack/rspack) share one UI Bridge server,
  // so comment cleanup calls would race if projects ran in parallel.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  timeout: 3_000,

  use: {
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'vite',
      testMatch: 'vite.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173' },
    },
  ],

  webServer: [
    {
      // When SKIP_BUILD=true (set by root `pnpm test`), packages are already built.
      command: `${buildPrefix}cd ${viteDemoDir} && pnpm exec vite`,
      cwd: viteDemoDir,
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
  ],
});
