import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoDir = path.resolve(__dirname, '../../demos/astro');

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
    command: `cd ${__dirname} && node build.mjs && cd ${path.resolve(__dirname, '../client')} && node build.mjs && cd ${path.resolve(__dirname, '../unplugin')} && node build.mjs && cd ${demoDir} && pnpm dev`,
    cwd: demoDir,
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
