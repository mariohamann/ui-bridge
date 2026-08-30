# @ui-bridge/client

## 1.1.6

### Patch Changes

- 9e79d0b: Fix comments looking "new" again after a page reload or a server restart.
  - Read state (`meta.lastReadAt`) is now persisted to `.ui-bridge/read-state.json` instead of only living in server memory. Previously a server restart — or any external write to a comment file, e.g. from MCP — reset every already-read agent reply back to unread, turning the badge brand again. The comment JSON files stay free of this per-user state.
  - Closing a comment panel (✕, Escape, click outside, save, resolve, accept tweak) now clears the persisted "open panel" id. Only the inspector used to clear it, so a stale id survived and the panel spontaneously re-opened on the next reload.
  - Fixed a boot race that dropped the persisted "open panel" id whenever a comment sync had not arrived yet, which made legitimate panel restore unreliable.

## 1.1.5

## 1.1.4

## 1.1.3

### Patch Changes

- 627da59: Fix a bug where the browser could connect to a UI Bridge server bound to a different project, causing comments and tweaks to be written to the wrong location.
  - Add a `server-info` WebSocket message so the client can verify the server's project root and port against what the integration expects, disconnecting on a mismatch instead of silently using the wrong server.
  - Improve port resolution across all integrations so each project reliably discovers or spawns its own dedicated server instead of reusing one from another project.
  - Ensure the server shuts down promptly and reliably when its dev process exits, including a parent-liveness watchdog (with zombie-process detection) that closes orphaned servers left behind after a crash or force-killed dev process.

## 1.1.2

### Patch Changes

- 36e1692: Improve comment anchor reliability and selector maintenance across client, server, and MCP.
  - Ensure comment open flows always remain accessible by falling back to opening in the comment bar when a DOM anchor cannot be resolved.
  - Allow orphaned comments to recover back to anchored rendering when selectors become valid again after UI changes.
  - Add server support for partial comment updates via `PATCH /api/comments/:id` and broadcast updated comment state.
  - Add MCP `update_comment_selectors` to append/merge precise selectors on existing threads.
  - Update MCP guidance to explicitly request a new precise selector after agent-made element-changing edits.

## 1.1.1

## 1.1.0

### Patch Changes

- f51d27e: Update README

## 1.0.1

### Patch Changes

- e45387f: Update documentation for e. g. Inertia.js

## 1.0.0

### Major Changes

- b58e41a: Release version 1.0
