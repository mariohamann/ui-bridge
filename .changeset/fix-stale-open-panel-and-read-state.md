---
'@ui-bridge/store': patch
'@ui-bridge/server': patch
'@ui-bridge/components': patch
'@ui-bridge/client': patch
---

Fix comments looking "new" again after a page reload or a server restart.

- Read state (`meta.lastReadAt`) is now persisted to `.ui-bridge/read-state.json` instead of only living in server memory. Previously a server restart — or any external write to a comment file, e.g. from MCP — reset every already-read agent reply back to unread, turning the badge brand again. The comment JSON files stay free of this per-user state.
- Closing a comment panel (✕, Escape, click outside, save, resolve, accept tweak) now clears the persisted "open panel" id. Only the inspector used to clear it, so a stale id survived and the panel spontaneously re-opened on the next reload.
- Fixed a boot race that dropped the persisted "open panel" id whenever a comment sync had not arrived yet, which made legitimate panel restore unreliable.
