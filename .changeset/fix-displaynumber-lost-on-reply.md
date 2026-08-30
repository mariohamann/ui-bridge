---
'@ui-bridge/components': patch
---

Fix `meta.displayNumber` (and any other unrelated `meta` field) being dropped whenever a thread was updated from the browser — replying, editing, deleting a reply, registering a tweak reply, or resolving. `_buildThread()` rebuilt `meta` from scratch instead of preserving the existing thread's fields, so every save round-tripped through the store as if the comment had no `displayNumber`, causing it to be reassigned a new (higher) number each time.
