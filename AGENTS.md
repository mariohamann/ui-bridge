# UI Bridge — Agent Instructions

## What is UI Bridge?

UI Bridge is a local developer tool that bridges design experimentation and code. It runs alongside any Vite-based dev server (or as a standalone Node.js server) and injects a floating panel into the browser.

### Package structure

The project is a pnpm monorepo with packages split across `core/`, `integrations/`, `demos/`, and `docs/`.

**Core packages** (`core/`):

| Package                 | Role                                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ui-bridge/protocol`   | Shared TypeScript types and WebSocket protocol definitions (knobs, comments, messages).                                                                                                                                                                     |
| `@ui-bridge/server`     | Node.js server (`server/index.mjs`). Hosts the WebSocket endpoint, runs the tweak engine, and manages the comment store. Comments are persisted as individual JSON files in `.ui-bridge/comments/`. Writes the bound port to `.ui-bridge/.port` on startup. |
| `@ui-bridge/components` | Lit web components (`uib-comment`, `uib-knob`) and the shared signal/intent bus. Transport-agnostic: components read from signal stores and dispatch typed `ComponentIntent`s.                                                                              |
| `@ui-bridge/client`     | Browser entry point. `src/browser/index.ts` boots the inspector and wires the WebSocket adapter (`ws-adapter.ts`), which translates between WebSocket messages and the signal/intent bus.                                                                   |
| `@ui-bridge/mcp`        | Stdio MCP server (`core/mcp/index.mjs`). Exposes comment and tweak actions as MCP tools and workflow guidance as MCP resources. Auto-discovers the running server via `.ui-bridge/.port`.                                                                   |

**Integration packages** (`integrations/`):

| Package               | Role                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ui-bridge/unplugin` | Universal plugin built with `unplugin`. Exposes `.vite()`, `.webpack()`, and `.rspack()` — spawns the server and injects the client bundle.         |
| `@ui-bridge/astro`    | Astro integration. Wraps the unplugin and registers it with the Astro Vite pipeline.                                                                |
| `@ui-bridge/next`     | Next.js integration. Exports `withUiBridge(nextConfig)` and a `UiBridgeScript` React Server Component for injecting the client in `app/layout.tsx`. |
| `@ui-bridge/nuxt`     | Nuxt 3 module. Injects the client scripts via `nuxt.options.app.head.script`.                                                                       |

### Capabilities

**Tweaks** — live UI knobs attached to comments. Each comment can carry a `knob` definition (label, type, default value) and an `actions` array. A `content-edit` action references a transform script (a pure `(content, value) => string` ES module stored in `.ui-bridge/scripts/`) and a target file. The tweak engine uses a snapshot/replay model: on every knob change it restores all touched files from snapshot and replays all active tweaks in order, so each script always sees the original source. When the user accepts an comment, the change is written permanently; discard restores from snapshot.

**Comments** — the user can enter inspect mode (Alt+click), click any DOM element in the browser, and attach a comment. Comments are stored with a stable CSS selector (via `@medv/finder`), a comment, and optionally a source location (file:line:col from code-inspector). They are persisted as per-comment JSON files in `.ui-bridge/comments/` and synced across clients via WebSocket (`comments:sync` messages). The floating panel in the main window displays comments with reply threads, resolve/delete actions, and tweak controls. Comments serve as async design feedback left directly on the running UI — the agent reads and acts on them.

### Signal / intent bus

UI components in `@ui-bridge/components` are transport-agnostic. They read state from shared TC39 signal stores (`comments-store.ts`, `knobs-store.ts`) and express user actions as typed `ComponentIntent` objects dispatched to an intent bus (`intents.ts`). The WS adapter in `@ui-bridge/client` subscribes to both the WebSocket (server → stores) and the intent bus (UI → WebSocket), keeping all transport logic out of the component layer.

### `wa-` → `uib-` element prefix rename (client bundle only)

The `@ui-bridge/components` source uses Web Awesome components (`wa-button`, `wa-textarea`, etc.) written with their native `wa-` tag names. To avoid a `CustomElementRegistry` collision when the client bundle is injected into a host page that _also_ loads Web Awesome (e.g. the UI Bridge docs site itself), the **client build step** (`core/client/build.mjs`) post-processes the esbuild output and renames every `wa-` custom element to `uib-`:

- `wa-badge` → `uib-badge`, `wa-button` → `uib-button`, etc. (tag names / CSS selectors)
- `WaBadge` → `UibBadge`, etc. (PascalCase class names passed to `customElements.define`)

**Source files are never touched** — the rename only applies to `dist/ui-bridge.js`. TypeScript types, Lit templates, and Web Awesome imports all stay `wa-*` in the source.

**Consequence for tests:** Playwright tests query the live DOM, which sees the renamed `uib-*` elements from the injected bundle. All test selectors therefore use `uib-textarea`, `uib-button`, `uib-dropdown-item`, etc., even though the source code uses `wa-*`. If you add a new Web Awesome component in source, use `wa-*` in source and `uib-*` in tests.

## Running Tests

Tests are spread across packages in `core/` and `integrations/`, each with a different runner:

| Package                 | Runner                                       | What it tests                                        |
| ----------------------- | -------------------------------------------- | ---------------------------------------------------- |
| `@ui-bridge/mcp`        | Node.js built-in test runner (`node --test`) | MCP tools, resources, and port discovery             |
| `@ui-bridge/components` | Node.js built-in test runner (`node --test`) | Signal stores and intent bus — no browser, no server |
| `@ui-bridge/server`     | Playwright (API-only, no browser)            | HTTP + WebSocket API of the standalone server        |
| `@ui-bridge/client`     | Playwright (Chromium)                        | Comment UI end-to-end against the Vite dev server    |
| `@ui-bridge/unplugin`   | Playwright (Chromium)                        | Vite, webpack, and rspack plugin integration         |
| `@ui-bridge/astro`      | Playwright (Chromium)                        | Astro integration against the Astro demo             |
| `@ui-bridge/next`       | Playwright (Chromium)                        | Next.js integration against the Next.js demo         |
| `@ui-bridge/nuxt`       | Playwright (Chromium)                        | Nuxt 3 integration against the Nuxt demo             |

**Run all test suites from the repo root:**

```bash
pnpm test
```

**Run a single package's tests:**

```bash
pnpm --filter @ui-bridge/client test
pnpm --filter @ui-bridge/server test
pnpm --filter @ui-bridge/components test
pnpm --filter @ui-bridge/mcp test
pnpm --filter @ui-bridge/unplugin test
pnpm --filter @ui-bridge/astro test
pnpm --filter @ui-bridge/next test
pnpm --filter @ui-bridge/nuxt test
```

**Target a single Playwright test by title** — pass `-g` after `--` to filter by name substring (case-insensitive):

```bash
# Any Playwright-based package
pnpm --filter @ui-bridge/client test -- -g "comment panel"

# unplugin: also select a specific bundler project with --project
pnpm --filter @ui-bridge/unplugin test -- --project=rspack
pnpm --filter @ui-bridge/unplugin test -- --project=rspack -g "injects __UIB_WS_URL__"
```

**Target a single Node.js test** (components and mcp packages use `node --test`):

The `pnpm test --` passthrough does not reach node's own flags, so invoke node directly:

```bash
cd core/components
node --loader ./tests/css-loader.mjs --test --test-name-pattern "comments store" tests/stores.test.mjs

cd core/mcp
node --test --test-name-pattern "returns all 10 tools" tests/mcp.test.mjs
```

**Run only tests in a specific file:**

```bash
pnpm --filter @ui-bridge/unplugin test -- tests/rspack.spec.ts
pnpm --filter @ui-bridge/client test -- tests/comments.spec.ts
```

**Server tests** spin up a dedicated server instance on port 7379 — the default (`UI_BRIDGE_PORT=7378`, `reuseExistingServer: false`). Each other suite has its own port: unplugin/client → 7378, next → 7380, astro → 7381, nuxt → 7382. **MCP tests** use port 7383.

**`core/client` tests** require the Vite dev server (port 5173). The webServer config starts it automatically with `reuseExistingServer: true` — if `integrations/unplugin` tests are already running and have started the server, `core/client` will reuse it.

**`integrations/unplugin` tests** cover three bundlers across three projects: `vite` (port 5173), `webpack` (port 5174), and `rspack` (port 5175). The webServer command builds both `unplugin` and `client` before starting the Vite demo.

**Do NOT run Playwright tests from inside a package directly** unless you have already built the required packages, since the build step is part of the `webServer` command.

## Agent Rules for Writing Tests

**NEVER use `page.waitForTimeout()` or any arbitrary sleep/pause.** Always wait for a concrete condition — a DOM state, a network response, a locator visibility change, etc.

**Debug test failures one test at a time.** Run a single failing test with `-g "test name"` before re-running the full suite. Running everything again after a single change wastes time and obscures which fix worked.

## Static Analysis

The repo uses TypeScript (strict mode throughout) and Prettier for formatting.

### Formatting — run after every code change

Always run Prettier after making code changes. It is fast and keeps diffs clean:

```bash
# Format everything (safe to run at any time)
pnpm format

# Check without writing (useful in CI or before committing)
pnpm format:check
```

Prettier is configured in `.prettierrc.json` at the repo root. Ignored paths are in `.prettierignore`.

### Type checking — run after significant changes

Run the full type-check suite after adding or changing TypeScript source files, touching a `tsconfig.json`, or refactoring across packages:

```bash
# Type-check all packages in parallel
pnpm typecheck

# Type-check a single package
pnpm --filter @ui-bridge/protocol typecheck
pnpm --filter @ui-bridge/components typecheck
pnpm --filter @ui-bridge/server typecheck
pnpm --filter @ui-bridge/unplugin typecheck
pnpm --filter @ui-bridge/astro typecheck
pnpm --filter @ui-bridge/next typecheck
pnpm --filter @ui-bridge/nuxt typecheck
```

**Note on tsconfig split:** Integration packages (`unplugin`, `next`, `nuxt`, `astro`) have two tsconfig files:

- `tsconfig.json` — used for type-checking (includes `src/` and `tests/`)
- `tsconfig.build.json` — used for emitting declarations (only `src/`, enforces `rootDir`)

The `build.mjs` scripts use `tsconfig.build.json`; `pnpm typecheck` uses the plain `tsconfig.json`.
