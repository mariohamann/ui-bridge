# @ui-bridge/components

## 1.1.6

### Patch Changes

- 9e79d0b: Fix comments looking "new" again after a page reload or a server restart.
  - Read state (`meta.lastReadAt`) is now persisted to `.ui-bridge/read-state.json` instead of only living in server memory. Previously a server restart — or any external write to a comment file, e.g. from MCP — reset every already-read agent reply back to unread, turning the badge brand again. The comment JSON files stay free of this per-user state.
  - Closing a comment panel (✕, Escape, click outside, save, resolve, accept tweak) now clears the persisted "open panel" id. Only the inspector used to clear it, so a stale id survived and the panel spontaneously re-opened on the next reload.
  - Fixed a boot race that dropped the persisted "open panel" id whenever a comment sync had not arrived yet, which made legitimate panel restore unreliable.
  - @ui-bridge/protocol@1.1.6

## 1.1.5

### Patch Changes

- a5fb33e: Fix `meta.displayNumber` (and any other unrelated `meta` field) being dropped whenever a thread was updated from the browser — replying, editing, deleting a reply, registering a tweak reply, or resolving. `_buildThread()` rebuilt `meta` from scratch instead of preserving the existing thread's fields, so every save round-tripped through the store as if the comment had no `displayNumber`, causing it to be reassigned a new (higher) number each time.
  - @ui-bridge/protocol@1.1.5

## 1.1.4

### Patch Changes

- f055ff5: Fix the Resolve button in the comment panel permanently deleting the comment instead of just hiding it.
  - `_resolve()` now sets `meta.resolvedAt` and saves the thread instead of dispatching a delete, so resolved comments stay on disk and are still counted by MCP's `get_comments` when `includeResolved: true` is passed.

- f055ff5: Assign a stable `meta.displayNumber` to every comment thread, regardless of whether it was created in the browser or via MCP.
  - `store.upsert()` now assigns the next available `displayNumber` whenever a comment doesn't already have one, instead of this only happening inside MCP's `create_comment` tool. This means browser-created comments (Alt+Shift+click) now get a number too.
  - `store.load()` backfills `displayNumber` for pre-existing comments on disk that don't have one yet, oldest-first by `createdAt`.
  - The comment badge in the browser now renders `meta.displayNumber` instead of a live positional index, so the number shown on the page matches the number MCP would reference for the same thread — and it no longer shifts when an earlier comment is resolved.
  - @ui-bridge/protocol@1.1.4

## 1.1.3

### Patch Changes

- Updated dependencies [627da59]
  - @ui-bridge/protocol@1.1.3

## 1.1.2

### Patch Changes

- 36e1692: Improve comment anchor reliability and selector maintenance across client, server, and MCP.
  - Ensure comment open flows always remain accessible by falling back to opening in the comment bar when a DOM anchor cannot be resolved.
  - Allow orphaned comments to recover back to anchored rendering when selectors become valid again after UI changes.
  - Add server support for partial comment updates via `PATCH /api/comments/:id` and broadcast updated comment state.
  - Add MCP `update_comment_selectors` to append/merge precise selectors on existing threads.
  - Update MCP guidance to explicitly request a new precise selector after agent-made element-changing edits.
  - @ui-bridge/protocol@1.1.2

## 1.1.1

### Patch Changes

- @ui-bridge/protocol@1.1.1

## 1.1.0

### Patch Changes

- @ui-bridge/protocol@1.1.0

## 1.0.1

### Patch Changes

- @ui-bridge/protocol@1.0.1

## 1.0.0

### Major Changes

- b58e41a: Release version 1.0

### Patch Changes

- Updated dependencies [b58e41a]
  - @ui-bridge/protocol@1.0.0
