import { initInspector } from './inspector.js';
import { initPanel } from '../client/panel/index.js';

function boot(): void {
  initPanel();
  initInspector();
}

if (document.body) {
  boot();
} else {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
}
