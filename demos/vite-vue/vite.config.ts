import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { designBridge } from '@design-bridge/vite-plugin';
import { codeInspectorPlugin } from 'code-inspector-plugin';

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    codeInspectorPlugin({
      bundler: 'vite',
      // Don't open the IDE — we only want the data-insp-path attributes on DOM elements
      behavior: { locate: false },
    }),
    designBridge(),
  ],
  server: {
    watch: {
      ignored: ['**/tweaks/**'],
    },
  },
});
