/**
 * Turbopack-compatible loader (Next.js 15.3+ Turbopack rules).
 *
 * Injects the Design Bridge WS URL global and a dynamic script loader into
 * the entry file of the Next.js app. This runs client-side because it is
 * added to layout/page files which are treated as 'use client' boundaries
 * by Next.js when they contain DOM references.
 *
 * The injection is wrapped in a typeof-window guard so it is a no-op during
 * server-side rendering.
 */

export default function designBridgeInjectLoader(
  this: { query: { port?: number } },
  content: string,
): string {
  const port =
    this.query?.port ??
    parseInt(process.env.DESIGN_BRIDGE_PORT ?? process.env.DB_PORT ?? '7378', 10);
  const wsUrl = `ws://localhost:${port}/design-bridge`;
  const clientUrl = `http://localhost:${port}/design-bridge/client.js`;

  const injection = `
;if(typeof window!=='undefined'&&!window.__DB_WS_URL__){
  window.__DB_WS_URL__=${JSON.stringify(wsUrl)};
  var __db_s=document.createElement('script');
  __db_s.src=${JSON.stringify(clientUrl)};
  document.head.appendChild(__db_s);
}
`;

  return injection + content;
}
