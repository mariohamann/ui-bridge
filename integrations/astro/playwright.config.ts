import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skipBuild = process.env.SKIP_BUILD === 'true';
const protocolDir = path.resolve(__dirname, '../../core/protocol');
const clientDir = path.resolve(__dirname, '../../core/client');
const unpluginDir = path.resolve(__dirname, '../unplugin');
const demoDir = path.resolve(__dirname, '../../demos/astro');
const buildPrefix = skipBuild
  ? ''
  : `cd ${protocolDir} && node_modules/.bin/tsc -p tsconfig.json && cd ${__dirname} && node build.mjs && cd ${clientDir} && node build.mjs && cd ${unpluginDir} && node build.mjs && `;

// Dedicate a port so parallel test-suite runs never clash on the default 7378.
process.env.UI_BRIDGE_PORT ??= '7381';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  // Generous timeout — Astro cold-starts slower than plain Vite
  timeout: 3_000,

  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // Builds this package + client + vite-plugin, then starts the Astro demo.
    // In non-CI mode an already-running server is reused so repeated test runs
    // are fast.
    // When SKIP_BUILD=true (set by root `pnpm test`), packages are already built.
    command: `${buildPrefix}cd ${demoDir} && pnpm exec astro dev`,
    cwd: demoDir,
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
