// Allow CSS side-effect imports (e.g. from @awesome.me/webawesome).
// Bundlers (esbuild) process these; tsc only needs to know the module exists.
declare module '*.css' { }
declare module '*.css?shadow' {
  const content: string;
  export default content;
}
