import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { uiBridgeVite } from '@ui-bridge/unplugin';

export default defineConfig({
  plugins: [
    vue(),
    ...uiBridgeVite({
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
