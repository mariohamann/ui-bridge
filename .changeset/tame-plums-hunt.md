---
'@ui-bridge/unplugin': patch
---

Fix Vite plugin adding significant build time overhead in production builds. The `resolveId`/`load` hooks handling the `virtual:ui-bridge` module now use Rollup/Rolldown's `filter` option so the native binding can skip calling into JS for every other module in the project, instead of only the one virtual specifier. Previously this showed up as a large "ui-bridge" entry in Rolldown's `PLUGIN_TIMINGS` output even though the hooks were no-ops outside of dev mode.
