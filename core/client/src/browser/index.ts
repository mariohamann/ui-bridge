import { initInspector } from './inspector.js';
import '@design-bridge/components/comment';
import '@design-bridge/components/orphaned';
import './ws-adapter.js'; // side-effect: wires signal stores ↔ WebSocket

function boot(): void {
  initInspector();
  if (!document.querySelector('db-orphaned-bar')) {
    const bar = document.createElement('db-orphaned-bar');
    document.body.appendChild(bar);
  }
}

if (document.body) {
  boot();
} else {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
}
