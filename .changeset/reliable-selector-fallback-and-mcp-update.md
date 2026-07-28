---
'@ui-bridge/client': patch
'@ui-bridge/components': patch
'@ui-bridge/server': patch
'@ui-bridge/mcp': patch
---

Improve comment anchor reliability and selector maintenance across client, server, and MCP.

- Ensure comment open flows always remain accessible by falling back to opening in the comment bar when a DOM anchor cannot be resolved.
- Allow orphaned comments to recover back to anchored rendering when selectors become valid again after UI changes.
- Add server support for partial comment updates via `PATCH /api/comments/:id` and broadcast updated comment state.
- Add MCP `update_comment_selectors` to append/merge precise selectors on existing threads.
- Update MCP guidance to explicitly request a new precise selector after agent-made element-changing edits.
