import { initPanel } from '../client/panel/index.js';
import { initInspector } from './inspector.js';

function boot(): void {
  initPanel();
  initInspector();
}

if (document.body) {
  boot();
} else {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
}
