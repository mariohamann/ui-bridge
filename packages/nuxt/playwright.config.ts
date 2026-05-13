import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoDir = path.resolve(__dirname, '../../demos/nuxt');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  timeout: 30_000,

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
    command: `cd ${__dirname} && node build.mjs && cd ${demoDir} && PORT=3002 pnpm dev`,
    cwd: demoDir,
    url: 'http://localhost:3002',
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
