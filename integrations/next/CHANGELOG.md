# @ui-bridge/next

## 1.1.3

### Patch Changes

- 627da59: Fix a bug where the browser could connect to a UI Bridge server bound to a different project, causing comments and tweaks to be written to the wrong location.
  - Add a `server-info` WebSocket message so the client can verify the server's project root and port against what the integration expects, disconnecting on a mismatch instead of silently using the wrong server.
  - Improve port resolution across all integrations so each project reliably discovers or spawns its own dedicated server instead of reusing one from another project.
  - Ensure the server shuts down promptly and reliably when its dev process exits, including a parent-liveness watchdog (with zombie-process detection) that closes orphaned servers left behind after a crash or force-killed dev process.

- Updated dependencies [627da59]
  - @ui-bridge/server@1.1.3
  - @ui-bridge/mcp@1.1.3

## 1.1.2

### Patch Changes

- Updated dependencies [36e1692]
  - @ui-bridge/server@1.1.2
  - @ui-bridge/mcp@1.1.2

## 1.1.1

### Patch Changes

- @ui-bridge/server@1.1.1
- @ui-bridge/mcp@1.1.1

## 1.1.0

### Patch Changes

- @ui-bridge/server@1.1.0
- @ui-bridge/mcp@1.1.0

## 1.0.1

### Patch Changes

- @ui-bridge/server@1.0.1
- @ui-bridge/mcp@1.0.1

## 1.0.0

### Major Changes

- b58e41a: Release version 1.0

### Patch Changes

- Updated dependencies [b58e41a]
  - @ui-bridge/mcp@1.0.0
  - @ui-bridge/server@1.0.0
