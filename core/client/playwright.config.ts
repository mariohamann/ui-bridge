import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skipBuild = process.env.SKIP_BUILD === 'true';
const protocolDir = path.resolve(__dirname, '../../core/protocol');
const clientDir = __dirname;
const viteDemoDir = path.resolve(__dirname, '../../demos/vite');

const webServerCommand = skipBuild
  ? `cd ${viteDemoDir} && pnpm exec vite`
  : `cd ${protocolDir} && node_modules/.bin/tsc -p tsconfig.json && cd ${clientDir} && node build.mjs && cd ${viteDemoDir} && pnpm exec vite`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  retries: 2,
  timeout: 3_000,

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // When SKIP_BUILD=true (set by root `pnpm test`), packages are already built
    // so we just start the Vite dev server. Otherwise, build protocol + client first.
    // reuseExistingServer lets unplugin tests and client tests share the same server locally.
    command: webServerCommand,
    cwd: viteDemoDir,
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
