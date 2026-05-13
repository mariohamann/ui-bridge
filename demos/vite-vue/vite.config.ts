import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { designBridgeWithInspector } from '@design-bridge/unplugin';

export default defineConfig({
  plugins: [
    vue(),
    ...designBridgeWithInspector(),
  ],
  server: {
    watch: {
      ignored: ['**/tweaks/**'],
    },
  },
});
