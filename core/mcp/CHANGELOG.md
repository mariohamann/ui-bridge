# @ui-bridge/mcp

## 1.1.4

### Patch Changes

- f055ff5: Assign a stable `meta.displayNumber` to every comment thread, regardless of whether it was created in the browser or via MCP.
  - `store.upsert()` now assigns the next available `displayNumber` whenever a comment doesn't already have one, instead of this only happening inside MCP's `create_comment` tool. This means browser-created comments (Alt+Shift+click) now get a number too.
  - `store.load()` backfills `displayNumber` for pre-existing comments on disk that don't have one yet, oldest-first by `createdAt`.
  - The comment badge in the browser now renders `meta.displayNumber` instead of a live positional index, so the number shown on the page matches the number MCP would reference for the same thread — and it no longer shifts when an earlier comment is resolved.

- Updated dependencies [f055ff5]
  - @ui-bridge/store@1.1.4

## 1.1.3

### Patch Changes

- @ui-bridge/store@1.1.3

## 1.1.2

### Patch Changes

- 36e1692: Improve comment anchor reliability and selector maintenance across client, server, and MCP.
  - Ensure comment open flows always remain accessible by falling back to opening in the comment bar when a DOM anchor cannot be resolved.
  - Allow orphaned comments to recover back to anchored rendering when selectors become valid again after UI changes.
  - Add server support for partial comment updates via `PATCH /api/comments/:id` and broadcast updated comment state.
  - Add MCP `update_comment_selectors` to append/merge precise selectors on existing threads.
  - Update MCP guidance to explicitly request a new precise selector after agent-made element-changing edits.
  - @ui-bridge/store@1.1.2

## 1.1.1

### Patch Changes

- @ui-bridge/store@1.1.1

## 1.1.0

### Patch Changes

- @ui-bridge/store@1.1.0

## 1.0.1

### Patch Changes

- @ui-bridge/store@1.0.1

## 1.0.0

### Major Changes

- b58e41a: Release version 1.0

### Patch Changes

- Updated dependencies [b58e41a]
  - @ui-bridge/store@1.0.0
