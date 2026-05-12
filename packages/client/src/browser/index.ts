import { initInspector } from './inspector.js';
import { initPanel } from '../client/panel/index.js';
import './ws-adapter.js'; // side-effect: wires signal stores ↔ WebSocket

function boot(): void {
  initPanel();
  initInspector();
}

if (document.body) {
  boot();
} else {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
}
