import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use a dedicated subdirectory as the server root during tests.
// The server creates dirs lazily, so we just need to point it somewhere clean.
const TEST_ROOT = resolve(__dirname, '.test-root');

/** Port for the test-only server instance — avoids clashing with the dev server on 7378. */
const TEST_PORT = 7379;

export default defineConfig({
  testDir: './tests',
  // Tests are pure API — no browser needed, run them sequentially to keep state predictable.
  fullyParallel: false,
  reporter: 'list',
  timeout: 10_000,

  use: {
    baseURL: `http://localhost:${TEST_PORT}`,
  },

  // API-only tests — we still need a project defined for Playwright to discover tests.
  // Using chromium without launching a browser (tests only use `request` fixture).
  projects: [{ name: 'api' }],

  webServer: {
    command: `node index.mjs --root ${TEST_ROOT}`,
    url: `http://localhost:${TEST_PORT}/health`,
    reuseExistingServer: false,
    env: { DESIGN_BRIDGE_PORT: String(TEST_PORT) },
    timeout: 15_000,
  },

  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
});
