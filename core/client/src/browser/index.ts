import { initInspector } from './inspector.js';
import '@design-bridge/components/annotation';
import './ws-adapter.js'; // side-effect: wires signal stores ↔ WebSocket

function boot(): void {
  initInspector();
}

if (document.body) {
  boot();
} else {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
}
