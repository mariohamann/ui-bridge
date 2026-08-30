---
'@ui-bridge/components': patch
---

Fix the Resolve button in the comment panel permanently deleting the comment instead of just hiding it.

- `_resolve()` now sets `meta.resolvedAt` and saves the thread instead of dispatching a delete, so resolved comments stay on disk and are still counted by MCP's `get_comments` when `includeResolved: true` is passed.
