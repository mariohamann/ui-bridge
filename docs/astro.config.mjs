// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import uiBridge from '@ui-bridge/astro';

// https://astro.build/config
export default defineConfig({
  site: 'https://ui-bridge.mariohamann.com',
  integrations: [
    uiBridge({
      staticMode: true,
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
