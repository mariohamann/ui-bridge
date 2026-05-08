// Register all 3 custom elements (side-effect imports)
import './bridge-panel.js';
import './bridge-annotation-badge.js';
import './bridge-annotation-popover.js';

/**
 * Mount the Design Bridge panel and the annotation popover singleton
 * into the host page DOM. Call once on DOMContentLoaded / body ready.
 */
export function initPanel(): void {
  // Panel (singleton)
  if (!document.querySelector('bridge-panel')) {
    document.body.appendChild(document.createElement('bridge-panel'));
  }
  // Popover singleton (hidden by default)
  if (!document.querySelector('bridge-annotation-popover')) {
    const pop = document.createElement('bridge-annotation-popover');
    pop.hidden = true;
    document.body.appendChild(pop);
  }
}
