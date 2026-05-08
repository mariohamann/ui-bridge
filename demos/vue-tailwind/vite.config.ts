import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { designBridge } from '@design-bridge/vite-plugin';

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    designBridge(),
  ],
});
