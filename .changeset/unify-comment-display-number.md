---
'@ui-bridge/store': patch
'@ui-bridge/mcp': patch
'@ui-bridge/server': patch
'@ui-bridge/components': patch
---

Assign a stable `meta.displayNumber` to every comment thread, regardless of whether it was created in the browser or via MCP.

- `store.upsert()` now assigns the next available `displayNumber` whenever a comment doesn't already have one, instead of this only happening inside MCP's `create_comment` tool. This means browser-created comments (Alt+Shift+click) now get a number too.
- `store.load()` backfills `displayNumber` for pre-existing comments on disk that don't have one yet, oldest-first by `createdAt`.
- The comment badge in the browser now renders `meta.displayNumber` instead of a live positional index, so the number shown on the page matches the number MCP would reference for the same thread — and it no longer shifts when an earlier comment is resolved.
