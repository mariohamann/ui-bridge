import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viteDemoDir = path.resolve(__dirname, '../../demos/vite-vue');
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
      // Build unplugin + client, then start the vite-vue demo
      command: `cd ${__dirname} && node build.mjs && cd ${path.resolve(__dirname, '../client')} && node build.mjs && cd ${viteDemoDir} && pnpm dev`,
      cwd: viteDemoDir,
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Start the webpack demo (webpack-dev-server)
      command: `cd ${webpackDemoDir} && pnpm dev`,
      cwd: webpackDemoDir,
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Start the rspack demo (rspack-dev-server)
      command: `cd ${rspackDemoDir} && pnpm dev`,
      cwd: rspackDemoDir,
      url: 'http://localhost:5175',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
    },
  ],
});
