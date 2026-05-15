// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import designBridge from '@design-bridge/astro';

// https://astro.build/config
export default defineConfig({
  integrations: [designBridge()],
  vite: {
    plugins: [tailwindcss()],
  },
});
