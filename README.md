# UI Bridge

UI Bridge is a local developer tool that connects design feedback directly to your source code. You click elements in your browser, leave comments, and your AI agent reads them through an MCP server and can apply live changes — without you leaving the browser.

---

<!-- section:how-it-works -->

## How it works

UI Bridge sits between your running UI and your AI agent. You leave feedback directly on the page, the agent reads it via MCP, and changes land in your source files.

1. **Select an element** — hold Alt and click any element in your browser. A comment thread opens attached to that element.
2. **Write a comment** — describe what you want to change. The comment is stored locally and surfaced to your agent through the MCP server.
3. **Get a live tweak** — the agent can reply with a knob: a live control that updates your source file on the fly so you can try values without switching to an editor.
4. **Accept or discard** — keep the change by accepting it — the file is updated permanently. Discard to restore the original. Either way the thread stays as a record.
<!-- /section:how-it-works -->

---

<!-- section:get-started -->

## Setup

Install the package for your framework, add it to your config, and run your dev server.

<details>
<summary>Vite</summary>

```sh
# pnpm
pnpm add -D @ui-bridge/unplugin
# npm
npm install --save-dev @ui-bridge/unplugin
# yarn
yarn add -D @ui-bridge/unplugin
```

**`vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { uiBridgeVite } from '@ui-bridge/unplugin';

export default defineConfig({
  plugins: [...uiBridgeVite()],
});
```

</details>

<details>
<summary>Next.js</summary>

```sh
# pnpm
pnpm add -D @ui-bridge/next
# npm
npm install --save-dev @ui-bridge/next
# yarn
yarn add -D @ui-bridge/next
```

**`next.config.mjs`**

```js
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
pnpm add -D @ui-bridge/nuxt
# npm
npm install --save-dev @ui-bridge/nuxt
# yarn
yarn add -D @ui-bridge/nuxt
```

**`nuxt.config.ts`**

```ts
export default defineNuxtConfig({
  modules: ['@ui-bridge/nuxt'],
});
```

</details>

<details>
<summary>Astro</summary>

```sh
# pnpm
pnpm add -D @ui-bridge/astro
# npm
npm install --save-dev @ui-bridge/astro
# yarn
yarn add -D @ui-bridge/astro
```

**`astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';
import uiBridge from '@ui-bridge/astro';

export default defineConfig({
  integrations: [uiBridge()],
});
```

</details>

Run your dev server. The panel appears in your browser.

<!-- /section:get-started -->

---

<!-- section:source-annotation -->

## Custom source location

Source location is detected automatically. If your stack doesn't support it — or you want to override it — you can read it from HTML comments or data attributes in the rendered markup.

**HTML comments** — use `htmlComments` with a regex pattern. Useful for frameworks like Laravel Blade with [laravel-view-debug](https://github.com/pixelfear/laravel-view-debug) that wrap partials in comments like `<!-- Start view: /path/to/file.blade.php -->`. Set `inspector: false` when code-inspector can't annotate your templates:

**`vite.config.ts`**

```ts
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

**Data attributes** — use `dataAttributes` if your build pipeline stamps location onto elements. Supports a single `file:line:col` attribute or separate file and location attributes:

**`vite.config.ts`**

```ts
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

<!-- /section:source-annotation -->

---

<!-- section:preferences -->

## Preferences

UI Bridge ships with sensible defaults and lets you override them — either as project-wide plugin config or at runtime through the preferences dialog in the browser.

### Plugin-level defaults

Pass a `preferences` object to your integration to set defaults for your whole project. These are used as the base layer and can still be overridden by individual users at runtime.

**`vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { uiBridgeVite } from '@ui-bridge/unplugin';

export default defineConfig({
  plugins: [
    ...uiBridgeVite({
      preferences: {
        commentBarPosition: 'bottom-right',
        knobVisibilityUI: 'always',
        routeMatching: { path: true },
      },
    }),
  ],
});
```

The same `preferences` key is available on all integrations (`withUiBridge`, `uiBridge()`, `@ui-bridge/nuxt`).

### Browser overrides

Click the gear icon (⚙) in the comment bar to open the preferences dialog. Changes are saved immediately to `.ui-bridge/preferences.json` and broadcast to all connected browser sessions.

### All preference fields

```ts
interface UserPreferences {
  /**
   * Which knobs appear inside the floating comment panel.
   * 'non-approved' hides tweaks that have already been accepted or discarded.
   * @default 'non-approved'
   */
  knobVisibilityUI: 'always' | 'non-approved' | 'never';

  /**
   * Which comment threads appear in the comment bar.
   * Same semantics as knobVisibilityUI.
   * @default 'non-approved'
   */
  knobVisibilityBar: 'always' | 'non-approved' | 'never';

  routeMatching: {
    /**
     * Only show comments whose pageUrl matches the current origin
     * (protocol + host + port).
     * @default false
     */
    domain: boolean;

    /**
     * Only show comments whose pageUrl pathname matches the current page.
     * @default true
     */
    path: boolean;

    /**
     * Only show comments whose pageUrl query string matches the current page.
     * @default false
     */
    params: boolean;
  };

  /**
   * Where the comment bar is pinned on screen.
   * @default 'top-left'
   */
  commentBarPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}
```

### Route matching

When `routeMatching.path` is `true` (the default), only comments created on the current page appear in the UI. This keeps the comment bar and panel uncluttered when you have comments across many pages. Disable it if you want to see all comments everywhere.

If no route matching criteria are enabled (all three set to `false`), all comments are shown regardless of URL.

<!-- /section:preferences -->

---

<!-- section:connect-agent -->

## Connect your agent

UI Bridge exposes an MCP server so your AI agent can read comments and apply tweaks. Add it to your agent's MCP config and restart the client.

<details>
<summary>VS Code</summary>

**`.vscode/mcp.json`**

```json
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

**`.mcp.json`** (project root)

```json
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

**`~/.cursor/mcp.json`**

```json
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
<summary>Claude Desktop</summary>

**`~/Library/Application Support/Claude/claude_desktop_config.json`**

```json
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

### Monorepos and subdirectories

The MCP server finds its data by looking for a `.ui-bridge/` folder, starting from its working directory and walking up. This works automatically when UI Bridge runs at your project root.

If UI Bridge runs in a subdirectory — a `docs/` folder, a monorepo package, etc. — set `cwd` to that directory:

**`.vscode/mcp.json`**

```json
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

<!-- /section:connect-agent -->

---

<!-- section:git -->

## Working with Git

UI Bridge stores everything in a `.ui-bridge/` folder at your project root. Deciding what to commit — and what to ignore — is a team decision.

### What's in `.ui-bridge/`

| Path               | Contents                                                       | Commit?                                |
| ------------------ | -------------------------------------------------------------- | -------------------------------------- |
| `comments/*.json`  | One file per comment thread (selector, text, replies, knobs)   | **Yes** — this is your shared feedback |
| `preferences.json` | User-overridden preferences from the browser dialog            | **Team choice** — see below            |
| `scripts/*.mjs`    | Knob transform scripts (the code that edits your source files) | **Yes** — needed to replay tweaks      |
| `.port`            | The port the server last bound to                              | **No** — ephemeral                     |

### Recommended `.gitignore`

```plaintext
# UI Bridge — ephemeral runtime file
.ui-bridge/.port
```

That's all you strictly need to ignore. Everything else is worth committing.

### Sharing comments with your team

Comment files in `comments/` are plain JSON. Commit them and every team member sees the same open threads when they run their dev server. The agent reads them through MCP and can pick up where you left off.

### Sharing preferences

There are two ways to share preferences with your team:

**Option A — Plugin config (recommended for team defaults)**

Set `preferences` in your plugin config. These are checked into version control as part of your `vite.config.ts` (or equivalent) and apply to everyone:

```ts
// vite.config.ts
...uiBridgeVite({
  preferences: {
    commentBarPosition: 'bottom-right',
    routeMatching: { path: true },
  },
})
```

**Option B — Commit `preferences.json`**

If someone adjusts preferences via the browser dialog and you want to share that with the team, commit `.ui-bridge/preferences.json`. It overrides the plugin defaults for all users who pull it.

The two layers merge: plugin config is the base, `preferences.json` overrides it. Individual users can override again via the dialog — but those changes will be overwritten the next time they pull if you're committing the file.

If you want personal overrides to be truly personal, add `preferences.json` to `.gitignore`:

```shell
.ui-bridge/.port
.ui-bridge/preferences.json
```

### Sharing knob scripts

Knob scripts in `scripts/` are the transform functions your agent writes when replying with a live tweak. They're referenced by comment threads, so if you commit comments you should commit their scripts too — otherwise teammates won't be able to replay the tweaks.

If you prefer to keep the `.ui-bridge/` folder entirely local:

```plaintext
.ui-bridge/
```

In that case, comments and tweaks are personal and not shared across the team.

<!-- /section:git -->

---

## License

MIT — see [LICENSE](LICENSE) for details.
