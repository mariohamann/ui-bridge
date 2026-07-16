---
"@ui-bridge/unplugin": minor
---

Add WSS support via Vite proxy

Registers a `/ui-bridge` proxy in Vite's dev server so the WebSocket rides the same origin as Vite and automatically upgrades to `wss://` when Vite runs over HTTPS (e.g. Herd/Valet/mkcert). WS and client URLs are now derived from the current origin instead of a hardcoded `ws://localhost:<port>`, fixing mixed-content issues and non-Vite backends (Laravel, etc.). Adds a warning when the server falls back to a different port than configured.
