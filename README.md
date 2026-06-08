# UI Bridge

The missing link between your browser and your agent.

---

- **Work visually.**

  Point directly at multiple elements on screen at once. No written descriptions — just click and annotate, exactly like leaving comments in a design tool.

- **Auto-located.**

  Every annotation carries the precise CSS selector, (and if supported) file path, and line number. No more token-heavy searches — the agent lands directly on the right spot.

- **Try variants.**

  The agent can attach live Tweaks to comments: change a value, see it reflected instantly, then bake the winning variant into code with the click of a button.

---

## How it works

1. **Pick any element** – hold `Alt-Shift` and click anything on your page to open a comment thread.
2. **Your agent responds** – it reads the comment via MCP and suggests a code change or a live Tweak.
3. **React in the thread** – reply, tweak values interactively or resolve the thread.

https://github.com/user-attachments/assets/634b3570-a4cc-4915-8094-aefde67a02ac

---

## Setup

### 1. Install

<details>
<summary>Vite</summary>

```sh
# pnpm
pnpm add -D @ui-bridge/unplugin @ui-bridge/mcp
# npm
npm install --save-dev @ui-bridge/unplugin @ui-bridge/mcp
# yarn
yarn add -D @ui-bridge/unplugin @ui-bridge/mcp
```

```ts
// vite.config.ts

import { defineConfig } from 'vite';
import { uiBridgeVite } from '@ui-bridge/unplugin';

export default defineConfig({
  plugins: [...uiBridgeVite()],
});
```

</details>

<details>
<summary>Astro</summary>

```sh
# pnpm
pnpm add -D @ui-bridge/astro @ui-bridge/mcp
# npm
npm install --save-dev @ui-bridge/astro @ui-bridge/mcp
# yarn
yarn add -D @ui-bridge/astro @ui-bridge/mcp
```

```js
// astro.config.mjs

import { defineConfig } from 'astro/config';
import uiBridge from '@ui-bridge/astro';

export default defineConfig({
  integrations: [uiBridge()],
});
```

</details>

<details>
<summary>Next.js</summary>

```sh
# pnpm
pnpm add -D @ui-bridge/next @ui-bridge/mcp
# npm
npm install --save-dev @ui-bridge/next @ui-bridge/mcp
# yarn
yarn add -D @ui-bridge/next @ui-bridge/mcp
```

```js
// next.config.mjs

import { withUiBridge } from '@ui-bridge/next';

export default withUiBridge({
  // your Next.js config
});
```

</details>

<details>
<summary>Nuxt</summary>

```sh
# pnpm
pnpm add -D @ui-bridge/nuxt @ui-bridge/mcp
# npm
npm install --save-dev @ui-bridge/nuxt @ui-bridge/mcp
# yarn
yarn add -D @ui-bridge/nuxt @ui-bridge/mcp
```

```ts
// nuxt.config.ts

export default defineNuxtConfig({
  modules: ['@ui-bridge/nuxt'],
});
```

</details>

> Using a stack without automatic source annotation? See [Custom Source Annotation](#custom-source-annotation) to configure it manually.

### 2. Connect your agent

UI Bridge exposes an MCP server — your agent reads your feedback and applies changes through it.

<details>
<summary>VS Code</summary>

```json
// .vscode/mcp.json

{
  "servers": {
    "ui-bridge": {
      "type": "stdio",
      "command": "npx",
      "args": ["--no", "ui-bridge-mcp"]
    }
  }
}
```

</details>

<details>
<summary>Claude Code</summary>

```json
// .mcp.json (project root)

{
  "mcpServers": {
    "ui-bridge": {
      "type": "stdio",
      "command": "npx",
      "args": ["--no", "ui-bridge-mcp"]
    }
  }
}
```

</details>

<details>
<summary>Cursor</summary>

```json
// ~/.cursor/mcp.json

{
  "mcpServers": {
    "ui-bridge": {
      "type": "stdio",
      "command": "npx",
      "args": ["--no", "ui-bridge-mcp"]
    }
  }
}
```

</details>

Run your dev server. `Alt-Shift`-click any element to open a comment thread — your agent picks it up through the MCP server and creates Tweaks on demand.

> Working in a monorepo or a subdirectory? See [Monorepos and subdirectories](#monorepos-and-subdirectories) to configure a custom working directory.

---

## Documentation

### Preferences

#### Plugin-level

Pass a `preferences` object to your integration to set defaults for your whole project. These are used as the base layer and can still be overridden by individual users at runtime.

```ts
// vite.config.ts

import { defineConfig } from 'vite';
import { uiBridgeVite } from '@ui-bridge/unplugin';

export default defineConfig({
  plugins: [
    ...uiBridgeVite({
      preferences: {
        commentBar: { position: 'bottom-right' },
        visibility: { status: 'always' },
      },
    }),
  ],
});
```

> The same `preferences` key is available on all integrations (`withUiBridge`, `uiBridge()`, `@ui-bridge/nuxt`).

#### Browser overrides

Click the gear icon (⚙) in the comment bar to open the preferences dialog. Changes are saved immediately to `.ui-bridge/preferences.json` and broadcast to all connected browser sessions.

#### API

```ts
interface VisibilityConfig {
  /**
   * Which comments/knobs are visible.
   * 'non-approved' hides threads whose tweaks are all accepted or discarded.
   * @default 'non-approved'
   */
  status?: 'always' | 'non-approved' | 'never';

  /**
   * URL-based filter. All false/unset means show all comments regardless of URL.
   * Bar default: all false (show across all routes — click to navigate).
   * Panel default: { path: true } (current page only).
   */
  route?: {
    /**
     * Only show comments whose pageUrl matches the current origin
     * (protocol + host + port).
     * @default false
     */
    domain?: boolean;

    /**
     * Only show comments whose pageUrl pathname matches the current page.
     * Bar default: false. Panel default: true.
     */
    path?: boolean;

    /**
     * Only show comments whose pageUrl query string matches the current page.
     * @default false
     */
    params?: boolean;
  };
}

interface UserPreferences {
  /**
   * Shared visibility defaults for both the comment bar and the comment panel.
   * Each context can override individually.
   */
  visibility?: VisibilityConfig;

  commentBar?: {
    /**
     * Where the comment bar is pinned on screen.
     * @default 'top-left'
     */
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

    /**
     * Visibility overrides for the comment bar.
     * Merged on top of `visibility`.
     * Bar-specific route default: all false (show comments from all routes
     * so users can click a badge to navigate to a different page).
     */
    visibility?: VisibilityConfig;
  };

  ui?: {
    /**
     * Visibility overrides for the floating comment panel.
     * Merged on top of `visibility`.
     * Panel-specific route default: { path: true } (current page only).
     */
    visibility?: VisibilityConfig;
  };
}
```

### Custom Source Annotation

If possible, UI Bridge automatically detects to which file and even line a comment belongs using [code-inspector](https://github.com/zh-lx/code-inspector). If your stack doesn't support it — or you want to override it — you can read it from HTML comments or data attributes in the rendered markup.

<details>
<summary>HTML comments</summary>

Use `htmlComments` with a regex pattern. Useful for e.g. Laravel Blade with [laravel-view-debug](https://github.com/pixelfear/laravel-view-debug) that wrap partials in comments like `<!-- Start view: /path/to/file.blade.php -->`. Set `inspector: false` when code-inspector can't annotate your templates:

```ts
// vite.config.ts

import { defineConfig } from 'vite';
import { uiBridgeVite } from '@ui-bridge/unplugin';

export default defineConfig({
  plugins: [
    ...uiBridgeVite({
      inspector: false,
      sourceAnnotation: {
        // Each entry is a regex. Capture group 1 is the file path.
        // List multiple patterns if you mix frameworks — first match wins.
        htmlComments: [{ pattern: 'Start view: (.+?\\.blade\\.php)' }],
      },
    }),
  ],
});
```

</details>

<details>
<summary>Data attributes</summary>

Use `dataAttributes` if your build pipeline stamps location onto elements. Supports a single `file:line:col` attribute or separate file and location attributes:

```ts
// vite.config.ts

import { defineConfig } from 'vite';
import { uiBridgeVite } from '@ui-bridge/unplugin';

export default defineConfig({
  plugins: [
    ...uiBridgeVite({
      sourceAnnotation: {
        // Single attribute encoding "file:line:col"
        dataAttributes: [{ pathAttr: 'data-source' }],
        // Or split across two attributes:
        // dataAttributes: [{ fileAttr: 'data-file', locAttr: 'data-loc' }],
      },
    }),
  ],
});
```

</details>

### Monorepos and subdirectories

The MCP server finds its data by looking for a `.ui-bridge/` folder, starting from its working directory and walking up. This works automatically when UI Bridge runs at your project root.

If UI Bridge runs in a subdirectory — a `docs/` folder, a monorepo package, etc. — set `cwd` to that directory:

```json
// .vscode/mcp.json

{
  "servers": {
    "ui-bridge": {
      "type": "stdio",
      "command": "npx",
      "args": ["--no", "ui-bridge-mcp"],
      "cwd": "${workspaceFolder}/packages/my-app"
    }
  }
}
```

#### Allow tweaks outside the project root

By default, tweaks can only modify files within the Vite/framework project root (the directory containing your `vite.config.ts`, or your app's working directory in Next.js). In monorepo setups where tweaks need to target files in sibling packages, enable `allowOutsideRoot`:

```ts
// vite.config.ts

...uiBridgeVite({
  allowOutsideRoot: true,
})
```

The same option is available on all integrations (`withUiBridge`, `uiBridge()`, `@ui-bridge/nuxt`).

When using the standalone server directly, pass the `--allow-outside-root` CLI flag:

```sh
node node_modules/@ui-bridge/server/index.mjs --root ./packages/my-app --allow-outside-root
```

### Working with Git

UI Bridge stores everything in a `.ui-bridge/` folder at your project root. Deciding what to commit — and what to ignore — is a team decision.

#### What's in `.ui-bridge/`

| Path               | Contents                                                       | Commit?                                |
| ------------------ | -------------------------------------------------------------- | -------------------------------------- |
| `comments/*.json`  | One file per comment thread (selector, text, replies, knobs)   | **Yes** — this is your shared feedback |
| `preferences.json` | User-overridden preferences from the browser dialog            | **No** — see below                     |
| `scripts/*.mjs`    | Knob transform scripts (the code that edits your source files) | **Yes** — needed to replay tweaks      |

#### Preferences

There are two ways to share preferences with your team. Usually it's best to set defaults in the plugin config and let individuals adjust as they like through the browser dialog — those changes are local and won't affect anyone else.

The simplest way to keep preferences local is to gitignore the whole file:

```shell
# .gitignore

.ui-bridge/preferences.json
```

<details>
<summary>Option A — Plugin config (recommended for teams)</summary>

Set `preferences` in your plugin config. These are checked into version control as part of your `vite.config.ts` (or equivalent) and apply to everyone:

```ts
// vite.config.ts

...uiBridgeVite({
  preferences: {
    commentBar: { position: 'bottom-right' },
    visibility: { route: { path: true } },
  },
})
```

</details>

<details>
<summary>Option B — Commit `preferences.json` (not recommended)</summary>

If someone adjusts preferences via the browser dialog and you want to share that with the team, commit `.ui-bridge/preferences.json`. It overrides the plugin defaults for all users who pull it.

The two layers merge: plugin config is the base, `preferences.json` overrides it. Individual users can override again via the dialog — but those changes will be overwritten the next time they pull if you're committing the file.

</details>

#### Comments and Knob scripts

Comment files in `comments/` are plain JSON. Commit them and every team member sees the same open threads when they run their dev server. The agent reads them through MCP and can pick up where you left off.

Knob scripts in `scripts/` are the transform functions your agent writes when replying with a live tweak. They're referenced by comment threads, so if you commit comments you should commit their scripts too — otherwise teammates won't be able to replay the tweaks.

If you prefer to keep the `.ui-bridge/` folder entirely local:

```shell
# .gitignore

.ui-bridge/
```

In that case, comments and tweaks are personal and not shared across the team.

## License

MIT — see [LICENSE](LICENSE) for details.
