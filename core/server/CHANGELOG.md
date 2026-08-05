# @ui-bridge/server

## 1.1.3

### Patch Changes

- 627da59: Fix a bug where the browser could connect to a UI Bridge server bound to a different project, causing comments and tweaks to be written to the wrong location.
  - Add a `server-info` WebSocket message so the client can verify the server's project root and port against what the integration expects, disconnecting on a mismatch instead of silently using the wrong server.
  - Improve port resolution across all integrations so each project reliably discovers or spawns its own dedicated server instead of reusing one from another project.
  - Ensure the server shuts down promptly and reliably when its dev process exits, including a parent-liveness watchdog (with zombie-process detection) that closes orphaned servers left behind after a crash or force-killed dev process.

- Updated dependencies [627da59]
  - @ui-bridge/client@1.1.3
  - @ui-bridge/store@1.1.3

## 1.1.2

### Patch Changes

- 36e1692: Improve comment anchor reliability and selector maintenance across client, server, and MCP.
  - Ensure comment open flows always remain accessible by falling back to opening in the comment bar when a DOM anchor cannot be resolved.
  - Allow orphaned comments to recover back to anchored rendering when selectors become valid again after UI changes.
  - Add server support for partial comment updates via `PATCH /api/comments/:id` and broadcast updated comment state.
  - Add MCP `update_comment_selectors` to append/merge precise selectors on existing threads.
  - Update MCP guidance to explicitly request a new precise selector after agent-made element-changing edits.

- Updated dependencies [36e1692]
  - @ui-bridge/client@1.1.2
  - @ui-bridge/store@1.1.2

## 1.1.1

### Patch Changes

- @ui-bridge/client@1.1.1
- @ui-bridge/store@1.1.1

## 1.1.0

### Patch Changes

- Updated dependencies [f51d27e]
  - @ui-bridge/client@1.1.0
  - @ui-bridge/store@1.1.0

## 1.0.1

### Patch Changes

- Updated dependencies [e45387f]
  - @ui-bridge/client@1.0.1
  - @ui-bridge/store@1.0.1

## 1.0.0

### Major Changes

- b58e41a: Release version 1.0

### Patch Changes

- Updated dependencies [b58e41a]
  - @ui-bridge/client@1.0.0
  - @ui-bridge/store@1.0.0
