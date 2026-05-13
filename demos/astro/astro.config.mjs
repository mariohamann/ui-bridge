// @ts-check
import { defineConfig } from 'astro/config';
import designBridge from '@design-bridge/astro';

// https://astro.build/config
export default defineConfig({
  integrations: [designBridge()],
});
