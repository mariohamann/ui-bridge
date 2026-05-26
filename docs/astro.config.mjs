// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import uiBridge from '@ui-bridge/astro';

// https://astro.build/config
export default defineConfig({
  integrations: [uiBridge()],
  vite: {
    plugins: [tailwindcss()],
  },
});
