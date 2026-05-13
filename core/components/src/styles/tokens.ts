import { css, unsafeCSS } from 'lit';
import waCss from '@awesome.me/webawesome/dist/styles/webawesome.css?shadow';

// Injects the full Web Awesome stylesheet (tokens, dark palette, font-face) into
// the component's own shadow DOM. This keeps all WA styles scoped to our UI and
// prevents any bleed onto the host page.
export const designBridgeHostTokenStyles = [
  unsafeCSS(waCss),
  css`
    :host {
      color-scheme: dark;
    }
  `,
];

/**
 * Brand color used for element highlights (hover outline, related-element outline).
 * Matches Web Awesome's --wa-color-brand in dark mode. Export as a plain string
 * so it can be used in vanilla DOM code (inspector.ts) and Lit CSS alike.
 */
export const DB_HIGHLIGHT_COLOR = '#3b82f6';
