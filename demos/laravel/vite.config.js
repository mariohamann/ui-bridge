import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import { uiBridgeVite } from '@ui-bridge/unplugin';

export default defineConfig({
  plugins: [
    laravel({
      input: ['resources/js/app.js'],
      refresh: true,
    }),
    uiBridgeVite({
      // Laravel Blade annotates rendered views with HTML comments:
      //   <!-- Start view: /path/to/file.blade.php -->
      // This tells UI Bridge to extract source locations from those comments.
      // You can list multiple patterns to support several frameworks at once.
      sourceAnnotation: {
        htmlComments: [{ pattern: 'Start view: (.+?\\.blade\\.php)' }],
      },
    }),
  ],
  server: {
    port: 5176,
    watch: {
      ignored: ['**/.ui-bridge/**'],
    },
  },
});
