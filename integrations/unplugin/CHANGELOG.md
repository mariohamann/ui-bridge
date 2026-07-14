# @ui-bridge/unplugin

## 1.0.1

### Patch Changes

- f21c074: Fix Vite plugin adding significant build time overhead in production builds. The `resolveId`/`load` hooks handling the `virtual:ui-bridge` module now use Rollup/Rolldown's `filter` option so the native binding can skip calling into JS for every other module in the project, instead of only the one virtual specifier. Previously this showed up as a large "ui-bridge" entry in Rolldown's `PLUGIN_TIMINGS` output even though the hooks were no-ops outside of dev mode.
- Updated dependencies [e45387f]
  - @ui-bridge/client@1.0.1
  - @ui-bridge/server@1.0.1
  - @ui-bridge/protocol@1.0.1
  - @ui-bridge/mcp@1.0.1

## 1.0.0

### Major Changes

- b58e41a: Release version 1.0

### Patch Changes

- Updated dependencies [b58e41a]
  - @ui-bridge/client@1.0.0
  - @ui-bridge/mcp@1.0.0
  - @ui-bridge/protocol@1.0.0
  - @ui-bridge/server@1.0.0
