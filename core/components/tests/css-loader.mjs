/**
 * Node.js ESM loader hook that stubs out CSS imports so unit tests can run
 * without a Vite bundler (which handles `?shadow` and raw `.css` imports).
 *
 * Used as: node --loader ./tests/css-loader.mjs --test tests/stores.test.mjs
 */
export function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.css') || specifier.includes('.css?')) {
    return { shortCircuit: true, url: 'data:text/javascript,export default ""' };
  }
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  if (url.startsWith('data:text/javascript,')) {
    const source = decodeURIComponent(url.slice('data:text/javascript,'.length));
    return { shortCircuit: true, format: 'module', source };
  }
  return nextLoad(url, context);
}
