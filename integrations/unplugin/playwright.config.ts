import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viteDemoDir = path.resolve(__dirname, '../../demos/vite');
const webpackDemoDir = path.resolve(__dirname, '../../demos/webpack');
const rspackDemoDir = path.resolve(__dirname, '../../demos/rspack');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  timeout: 15_000,

  use: {
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'vite',
      testMatch: 'vite.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173' },
    },
    {
      name: 'webpack',
      testMatch: 'webpack.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' },
    },
    {
      name: 'rspack',
      testMatch: 'rspack.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5175' },
    },
  ],

  webServer: [
    {
      // Build protocol → unplugin + client, then start the vite demo
      command: `cd ${path.resolve(__dirname, '../../core/protocol')} && node_modules/.bin/tsc -p tsconfig.json && cd ${__dirname} && node build.mjs && cd ${path.resolve(__dirname, '../../core/client')} && node build.mjs && cd ${viteDemoDir} && pnpm exec vite`,
      cwd: viteDemoDir,
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Build protocol → unplugin + client, then start the webpack demo
      command: `cd ${path.resolve(__dirname, '../../core/protocol')} && node_modules/.bin/tsc -p tsconfig.json && cd ${__dirname} && node build.mjs && cd ${path.resolve(__dirname, '../../core/client')} && node build.mjs && cd ${webpackDemoDir} && pnpm exec webpack serve`,
      cwd: webpackDemoDir,
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Build protocol → unplugin + client, then start the rspack demo
      command: `cd ${path.resolve(__dirname, '../../core/protocol')} && node_modules/.bin/tsc -p tsconfig.json && cd ${__dirname} && node build.mjs && cd ${path.resolve(__dirname, '../../core/client')} && node build.mjs && cd ${rspackDemoDir} && pnpm exec rspack serve`,
      cwd: rspackDemoDir,
      url: 'http://localhost:5175',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
    },
  ],
});
