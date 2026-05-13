import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoDir = path.resolve(__dirname, '../../demos/astro');

// Dedicate a port so parallel test-suite runs never clash on the default 7378.
process.env.DESIGN_BRIDGE_PORT ??= '7381';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  // Generous timeout — Astro cold-starts slower than plain Vite
  timeout: 20_000,

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
    command: `cd ${path.resolve(__dirname, '../../core/protocol')} && node_modules/.bin/tsc -p tsconfig.json && cd ${__dirname} && node build.mjs && cd ${path.resolve(__dirname, '../../core/client')} && node build.mjs && cd ${path.resolve(__dirname, '../unplugin')} && node build.mjs && cd ${demoDir} && pnpm exec astro dev`,
    cwd: demoDir,
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
