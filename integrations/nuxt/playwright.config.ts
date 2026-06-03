import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skipBuild = process.env.SKIP_BUILD === 'true';
const protocolDir = path.resolve(__dirname, '../../core/protocol');
const demoDir = path.resolve(__dirname, '../../demos/nuxt');
const buildPrefix = skipBuild
  ? ''
  : `cd ${protocolDir} && node_modules/.bin/tsc -p tsconfig.json && cd ${__dirname} && node build.mjs && `;

// Dedicate a port so parallel test-suite runs never clash on the default 7378.
process.env.UI_BRIDGE_PORT ??= '7382';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  timeout: 3_000,

  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // Build this package, then start the Nuxt demo on a non-conflicting port
    // When SKIP_BUILD=true (set by root `pnpm test`), packages are already built.
    command: `${buildPrefix}cd ${demoDir} && PORT=3002 pnpm exec nuxt dev`,
    cwd: demoDir,
    url: 'http://localhost:3002',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
