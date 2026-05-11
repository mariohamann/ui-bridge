// Register all custom elements (side-effect imports)
import './bridge-panel.js';
import './bridge-annotation-item.js';

/**
 * Mount the Design Bridge panel into the host page DOM.
 * Annotation items are created dynamically by inspector.ts.
 */
export function initPanel(): void {
  if (!document.querySelector('bridge-panel')) {
    document.body.appendChild(document.createElement('bridge-panel'));
  }
}
