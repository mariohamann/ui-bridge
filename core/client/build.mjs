import { build, context } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';

// Post-process the bundle to rename all Web Awesome custom elements from the
// `wa-` prefix to `db-` so they never collide with a host page that also loads
// Web Awesome (e.g. the Design Bridge docs site).
//   wa-badge  →  db-badge    (tag names in strings/selectors/templates)
//   WaBadge   →  DbBadge     (PascalCase class names passed to customElements.define)
// This includes CSS custom properties: --wa-font-family-code → --db-font-family-code etc.
function renameWaPrefix(outfile) {
  const src = readFileSync(outfile, 'utf8');
  const out = src
    // Match `wa-` when not preceded by a letter — renames tag names, JS class
    // references, and CSS custom properties (--wa-* → --db-*).
    .replace(/(?<![A-Za-z])wa-/g, 'db-')
    .replace(/Wa(?=[A-Z])/g, 'Db');
  writeFileSync(outfile, out, 'utf8');
}

const watch = process.argv.includes('--watch');

mkdirSync('dist', { recursive: true });

// Recursively inlines all @import url(...) references so the resulting CSS
// string is fully self-contained and can be injected as a <style> tag without
// the browser needing to resolve any additional requests.
function inlineCssImports(filePath, visited = new Set()) {
  if (visited.has(filePath)) return '';
  visited.add(filePath);
  const dir = dirname(filePath);
  const css = readFileSync(filePath, 'utf8');
  return css.replace(/@import\s+url\(['"]?([^'")\s]+)['"]?\)\s*;?\s*/g, (_, importPath) => {
    const resolved = resolvePath(dir, importPath);
    try {
      return inlineCssImports(resolved, visited);
    } catch {
      return '';
    }
  });
}

// Converts CSS file imports into runtime style injection so that all styles
// (including Web Awesome theme tokens with their full @import chain) end up
// self-contained in the JS IIFE bundle — no separate .css file needed.
const injectCssPlugin = {
  name: 'inject-css',
  setup(build) {
    // ?shadow imports → export raw CSS string (for use with Lit unsafeCSS / adoptedStyleSheets)
    build.onLoad({ filter: /\.css\?shadow$/ }, (args) => {
      const realPath = args.path.replace(/\?shadow$/, '');
      const css = inlineCssImports(realPath);
      return { contents: `export default ${JSON.stringify(css)};`, loader: 'js' };
    });
    // Plain CSS imports → inject into document.head (for global reset/fonts only)
    build.onLoad({ filter: /\.css$/ }, (args) => {
      const css = inlineCssImports(args.path);
      return {
        contents: `
          const __style = document.createElement('style');
          __style.textContent = ${JSON.stringify(css)};
          document.head.appendChild(__style);
        `,
        loader: 'js',
      };
    });
  },
};

// Lit and all other browser deps get bundled in — no external deps in the browser.
// Use IIFE so the script can be injected as a plain <script> tag with no type="module".
const sharedOptions = {
  bundle: true,
  platform: 'browser',
  format: 'iife',
  minify: true,
  plugins: [injectCssPlugin],
  conditions: ['source', 'import', 'default'],
  // Lit decorators require experimentalDecorators + useDefineForClassFields=false
  tsconfigRaw: {
    compilerOptions: {
      experimentalDecorators: true,
      useDefineForClassFields: false,
      target: 'ES2021',
    },
  },
};

const panelOptions = {
  ...sharedOptions,
  entryPoints: ['src/browser/index.ts'],
  outfile: 'dist/design-bridge.js',
};

if (watch) {
  const ctx1 = await context({
    ...panelOptions,
    plugins: [
      ...(panelOptions.plugins ?? []),
      {
        name: 'rename-wa-prefix',
        setup(b) {
          b.onEnd(() => renameWaPrefix(panelOptions.outfile));
        },
      },
    ],
  });
  await ctx1.watch();
  console.log('[design-bridge/client] watching for changes…');
} else {
  await build(panelOptions);
  renameWaPrefix(panelOptions.outfile);
  console.log('[design-bridge/client] build complete → dist/design-bridge.js');
}
