import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoDir = path.resolve(__dirname, '../../demos/next');

// Dedicate a port so parallel test-suite runs never clash on the default 7378.
process.env.DESIGN_BRIDGE_PORT ??= '7380';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  timeout: 30_000,

  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // Build this package, then start the Next.js demo on a non-conflicting port
    command: `cd ${path.resolve(__dirname, '../../core/protocol')} && node_modules/.bin/tsc -p tsconfig.json && cd ${__dirname} && node build.mjs && cd ${demoDir} && PORT=3001 pnpm exec next dev --turbo`,
    cwd: demoDir,
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
