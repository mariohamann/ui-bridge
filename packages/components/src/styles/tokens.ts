import { css, unsafeCSS } from 'lit';
import waCss from '@awesome.me/webawesome/dist/styles/webawesome.css?shadow';

// Injects the full Web Awesome stylesheet (tokens, dark palette, font-face) into
// the component's own shadow DOM. This keeps all WA styles scoped to our UI and
// prevents any bleed onto the host page.
export const designBridgeHostTokenStyles = [
  unsafeCSS(waCss),
  css`:host { color-scheme: dark; }`,
];
