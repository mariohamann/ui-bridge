import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { uiBridgeWithInspector } from '@ui-bridge/unplugin';

export default defineConfig({
  plugins: [
    vue(),
    ...uiBridgeWithInspector({
      sourceAnnotation: {
        htmlComments: [{ pattern: 'Start component: (.+\.vue)' }],
      },
    }),
  ],
  server: {
    watch: {
      ignored: ['**/tweaks/**'],
    },
  },
});
