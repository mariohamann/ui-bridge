import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { uiBridgeWithInspector } from '@ui-bridge/unplugin';

export default defineConfig({
  plugins: [vue(), ...uiBridgeWithInspector()],
  server: {
    watch: {
      ignored: ['**/tweaks/**'],
    },
  },
});
