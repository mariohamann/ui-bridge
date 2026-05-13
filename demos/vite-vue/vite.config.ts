import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { designBridge } from '@design-bridge/vite-plugin';

export default defineConfig({
  plugins: [
    vue(),
    designBridge(),
  ],
  server: {
    watch: {
      ignored: ['**/tweaks/**'],
    },
  },
});
