---
name: write-tweaks
description: How to write Design Bridge tweak scripts (.mjs) for live UI experimentation
---

# How to Write Design Bridge Tweaks

Tweaks are small `.mjs` scripts in `.design-bridge/tweaks/`. Each file becomes one knob in the Tweakpane UI. The dev server auto-discovers them on startup and whenever the folder changes.

The folder is gitignored — tweaks are local, experimental, and disposable.

> **One knob per file.** `meta` must be a **single object**, not an array. The script runner checks `meta?.id` and `meta?.label` on a plain object and skips the file if it's an array. To expose multiple independent knobs, create multiple `.mjs` files — one per knob.

---

## File anatomy

```js
// .design-bridge/tweaks/my-tweak.mjs

export const meta = {
  id: 'my-tweak', // unique, kebab-case, used as the knob identifier
  label: 'My Tweak', // displayed in the Tweakpane UI
  type: 'select', // knob type — see below
  value: 'primary', // default / current value
  options: {
    // only for type: 'select'
    // key   = the label shown in the UI     ← what the user sees
    // value = the value passed to apply()   ← what the code receives
    Primary: 'primary',
    Secondary: 'secondary',
    Tertiary: 'tertiary',
  },
};

export async function apply(value, ctx) {
  await ctx.replaceInFile('src/pages/MyPage.vue', /variant="[^"]*"/, `variant="${value}"`);
}
```

---

## Knob types

| `type`         | `value` type       | Extra `meta` fields                                                                  |
| -------------- | ------------------ | ------------------------------------------------------------------------------------ |
| `select`       | `string`           | `options: Record<string,string>` — key is the UI label, value is passed to `apply()` |
| `string`       | `string`           | —                                                                                    |
| `number`       | `number`           | `min`, `max`, `step`                                                                 |
| `boolean`      | `boolean`          | —                                                                                    |
| `color`        | `string` (hex/rgb) | —                                                                                    |
| `button-group` | `string`           | `options: Record<string,string>` — same key/label convention as `select`             |

In general `string` should be avoided in favor of more specific types. If the knob represents a fixed set of options, `select` or `button-group` is best — it constrains the user to valid values and provides a clear UI. Use `string` for freeform values like text content or so.

---

## The `ctx` API

`apply(value, ctx)` receives a sandboxed context. All paths are relative to the project root.

```js
// Read a file
const content = await ctx.readFile('src/pages/Foo.vue');

// Write a file (full replacement)
await ctx.writeFile('src/pages/Foo.vue', newContent);

// Replace with regex or string (most common)
await ctx.replaceInFile(
  'src/pages/Foo.vue',
  /size="[^"]*"/, // RegExp or plain string
  `size="${value}"`,
);

// Glob for files
const files = await ctx.findFiles('src/**/*.vue');
```

Paths outside the project root are blocked.

---

## Replay model — write your regex against the original

Every time any knob changes, the engine:

1. Restores all touched files to their **original content** (snapshotted automatically before the first change)
2. Replays **all active tweaks in sequence**

This means `apply()` always sees the original file, not what a previous run left behind.  
**Consequence: your regex must match the original source, not a previously-tweaked version.**

---

## What files can a tweak target?

**Anything inside the project root** — `.vue`, `.ts`, `.css`, `.json`, `.html`, config files, whatever. The sandbox only blocks paths outside the project root.

**Before writing a tweak, always read the target file first** to find the exact string or attribute pattern. A regex that doesn't match the original source is silently a no-op.

**Keep replacements targeted, not just small.** Each `replaceInFile` call must match **exactly one location** in the file. Target the minimum context required for uniqueness — no more.

If a single attribute is unique in the file, that's enough:

```js
await ctx.replaceInFile('src/pages/Foo.vue', /variant="[^"]*"/, `variant="${value}"`);
```

If the attribute appears multiple times, add a nearby stable anchor:

```js
// variant="…" exists on several elements — include the id to disambiguate
await ctx.replaceInFile(
  'src/pages/Foo.vue',
  /id="reset-btn" variant="[^"]*"/,
  `id="reset-btn" variant="${value}"`,
);
```

For complex changes, chain multiple small calls — one per independent change:

```js
await ctx.replaceInFile(
  file,
  /v-if="appMode === 'error'" variant="error" open/,
  `v-if="false" variant="error" open`,
);
await ctx.replaceInFile(
  file,
  `v-else-if="appMode === 'empty'"`,
  `v-else-if="appMode === 'error' || appMode === 'empty'"`,
);
await ctx.replaceInFile(file, `name="system/filter-empty"`, `name="system/exclamation-circle"`);
```

Avoid multiline template literals with `\n` and nested quote escaping — they are brittle. For genuinely complex multiline edits, use `readFile` + `writeFile` instead:

```js
// Prefer for complex multiline edits
const src = await ctx.readFile('src/pages/Foo.vue')
await ctx.writeFile('src/pages/Foo.vue', src.replace(...))
```

**Keep `apply()` simple and direct.** Inline the replacement when straightforward; use a lookup table when values map to non-trivial output strings — no branching needed.

```js
// Lookup table for non-trivial mappings
const CLASS_MAP = {
  primary: `'sd-button'`,
  secondary: `'sd-button', 'sd-button--secondary'`,
  ghost: `'sd-button', 'sd-button--ghost'`,
};

export async function apply(value, ctx) {
  await ctx.replaceInFile('src/pages/Foo.vue', /\['sd-button'[^\]]*\]/, `[${CLASS_MAP[value]}]`);
}
```

---

## HMR behaviour by file type

| File type            | Vite behaviour on change                         |
| -------------------- | ------------------------------------------------ |
| `.vue` SFC           | Component hot-replaced in-place — **no reload**  |
| `.ts` / `.js` module | Module hot-replaced if the module accepts HMR    |
| `.css`               | Style hot-replaced — **no reload**               |
| `.html` entry        | **Full page reload** — avoid if possible         |
| `*.json`             | Full reload unless imported as a module with HMR |

Prefer targeting `.vue` or `.css` files over `.html` entry files to keep the page alive during tweaks.

---

## Reset & Apply

- **Reset knob** — restores the file to its original and sets the knob back to the default value from `meta.value`
- **Reset All** — resets every knob
- **Apply** — keeps all file changes as-is and deletes the entire `.design-bridge/` folder
