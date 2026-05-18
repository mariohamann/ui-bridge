---
name: docs-writer
description: When writing documentation for Design Bridge, use this skill to work properly in the Astro package and follow the style of the existing docs.
---

1. Always HTML semantics first, as we're using Native styles provided by Webawesome (see `agents/skills/webawesome/references/utilities/native.md`.)
2. Reach out to Webawesome components when needed and applicable.
3. Try reducing custom components and styles wherever possible, but if so, use TailwindCSS using the theme provided in `docs/src/styles/global.css`. `color-wa-surface-raised` translates to `bg-wa-surface-raised` etc.
