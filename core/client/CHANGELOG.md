# @ui-bridge/client

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
