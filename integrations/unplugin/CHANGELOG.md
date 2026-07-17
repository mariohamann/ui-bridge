# @ui-bridge/unplugin

## 1.1.1

### Patch Changes

- 8f2e9c9: Fix bug where the middleware mode was not being set correctly in the WebSocket plugin.
  - @ui-bridge/protocol@1.1.1
  - @ui-bridge/client@1.1.1
  - @ui-bridge/server@1.1.1
  - @ui-bridge/mcp@1.1.1

## 1.1.0

### Minor Changes

- 67d7909: Add WSS support via Vite proxy

  Registers a `/ui-bridge` proxy in Vite's dev server so the WebSocket rides the same origin as Vite and automatically upgrades to `wss://` when Vite runs over HTTPS (e.g. Herd/Valet/mkcert). WS and client URLs are now derived from the current origin instead of a hardcoded `ws://localhost:<port>`, fixing mixed-content issues and non-Vite backends (Laravel, etc.). Adds a warning when the server falls back to a different port than configured.

### Patch Changes

- Updated dependencies [f51d27e]
  - @ui-bridge/client@1.1.0
  - @ui-bridge/server@1.1.0
  - @ui-bridge/protocol@1.1.0
  - @ui-bridge/mcp@1.1.0

## 1.0.1

### Patch Changes

- f21c074: Fix Vite plugin adding significant build time overhead in production builds. The `resolveId`/`load` hooks handling the `virtual:ui-bridge` module now use Rollup/Rolldown's `filter` option so the native binding can skip calling into JS for every other module in the project, instead of only the one virtual specifier. Previously this showed up as a large "ui-bridge" entry in Rolldown's `PLUGIN_TIMINGS` output even though the hooks were no-ops outside of dev mode.
- Updated dependencies [e45387f]
  - @ui-bridge/client@1.0.1
  - @ui-bridge/server@1.0.1
  - @ui-bridge/protocol@1.0.1
  - @ui-bridge/mcp@1.0.1

## 1.0.0

### Major Changes

- b58e41a: Release version 1.0

### Patch Changes

- Updated dependencies [b58e41a]
  - @ui-bridge/client@1.0.0
  - @ui-bridge/mcp@1.0.0
  - @ui-bridge/protocol@1.0.0
  - @ui-bridge/server@1.0.0
