# Design Bridge — Agent Instructions

## What is Design Bridge?

Design Bridge is a local developer tool that bridges design experimentation and code. It runs alongside any Vite-based dev server (or as a standalone Node.js server) and injects a floating panel into the browser.

### Package structure

The project is a pnpm monorepo with packages split across `core/`, `integrations/`, `demos/`, and `docs/`.

**Core packages** (`core/`):

| Package                     | Role                                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@design-bridge/protocol`   | Shared TypeScript types and WebSocket protocol definitions (knobs, annotations, messages).                                                                                                                                                                    |
| `@design-bridge/server`     | Node.js server (`server/index.mjs`). Hosts the WebSocket endpoint, runs the tweak engine, and manages the annotation store. Annotations are persisted as individual JSON files in `tweaks/annotations/`.                                                      |
| `@design-bridge/components` | Lit web components (`db-annotation`, `db-review`) and the shared signal/intent bus. Transport-agnostic: components read from signal stores and dispatch typed `ComponentIntent`s.                                                                             |
| `@design-bridge/client`     | Browser entry points. `src/browser/index.ts` boots the inspector and wires the WebSocket adapter (`ws-adapter.ts`), which translates between WebSocket messages and the signal/intent bus. `src/review/index.ts` is the entry for the standalone review page. |

**Integration packages** (`integrations/`):

| Package                   | Role                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@design-bridge/unplugin` | Universal plugin built with `unplugin`. Exposes `.vite()`, `.webpack()`, and `.rspack()` — spawns the server and injects the client bundle.                 |
| `@design-bridge/astro`    | Astro integration. Wraps the unplugin and registers it with the Astro Vite pipeline.                                                                        |
| `@design-bridge/next`     | Next.js integration. Exports `withDesignBridge(nextConfig)` and a `DesignBridgeScript` React Server Component for injecting the client in `app/layout.tsx`. |
| `@design-bridge/nuxt`     | Nuxt 3 module. Injects the client scripts via `nuxt.options.app.head.script`.                                                                               |

### Capabilities

**Tweaks** — live UI knobs backed by `.mjs` scripts in `tweaks/scripts/`. Each script exports a `meta` object (defining the knob: label, type, default value) and an `apply(value, ctx)` function that rewrites source files on the fly using regex-based `ctx.replaceInFile()`. A snapshot/replay model ensures every knob change starts from the original file, so tweaks compose safely without corrupting source. When the user commits a value (`tweak:finalize`), the change is written permanently; reset restores from the snapshot.

**Annotations** — the user can enter inspect mode (Alt+click), click any DOM element in the browser, and attach a comment. Annotations are stored with a stable CSS selector (via `@medv/finder`), a comment, and optionally a source location (file:line:col from code-inspector). They are persisted as per-annotation JSON files in `tweaks/annotations/` and synced across clients via WebSocket (`annotations:sync` messages). A standalone `/review` page (`db-review` component) lists all annotations with reply threads, resolve/delete actions, and tweak links. Annotations serve as async design feedback left directly on the running UI — the agent reads and acts on them.

### Signal / intent bus

UI components in `@design-bridge/components` are transport-agnostic. They read state from shared TC39 signal stores (`annotations-store.ts`, `knobs-store.ts`) and express user actions as typed `ComponentIntent` objects dispatched to an intent bus (`intents.ts`). The WS adapter in `@design-bridge/client` subscribes to both the WebSocket (server → stores) and the intent bus (UI → WebSocket), keeping all transport logic out of the component layer.

## Running Tests

Tests are spread across packages in `core/` and `integrations/`, each with a different runner:

| Package                     | Runner                                       | What it tests                                        |
| --------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| `@design-bridge/components` | Node.js built-in test runner (`node --test`) | Signal stores and intent bus — no browser, no server |
| `@design-bridge/server`     | Playwright (API-only, no browser)            | HTTP + WebSocket API of the standalone server        |
| `@design-bridge/client`     | Playwright (Chromium)                        | Annotation UI end-to-end against the Vite dev server |
| `@design-bridge/unplugin`   | Playwright (Chromium)                        | Vite, webpack, and rspack plugin integration         |
| `@design-bridge/astro`      | Playwright (Chromium)                        | Astro integration against the Astro demo             |
| `@design-bridge/next`       | Playwright (Chromium)                        | Next.js integration against the Next.js demo         |
| `@design-bridge/nuxt`       | Playwright (Chromium)                        | Nuxt 3 integration against the Nuxt demo             |

**Run all test suites from the repo root:**

```bash
pnpm test
```

**Run a single package's tests:**

```bash
pnpm --filter @design-bridge/client test
pnpm --filter @design-bridge/server test
pnpm --filter @design-bridge/components test
pnpm --filter @design-bridge/unplugin test
pnpm --filter @design-bridge/astro test
pnpm --filter @design-bridge/next test
pnpm --filter @design-bridge/nuxt test
```

**Target a single Playwright test by title** — pass `-g` after `--` to filter by name substring (case-insensitive):

```bash
# Any Playwright-based package
pnpm --filter @design-bridge/client test -- -g "annotation panel"

# unplugin: also select a specific bundler project with --project
pnpm --filter @design-bridge/unplugin test -- --project=rspack
pnpm --filter @design-bridge/unplugin test -- --project=rspack -g "injects __DB_WS_URL__"
```

**Target a single Node.js test** (components package uses `node --test`):

The `pnpm test --` passthrough does not reach node's own flags, so invoke node directly:

```bash
cd core/components
node --loader ./tests/css-loader.mjs --test --test-name-pattern "annotations store" tests/stores.test.mjs
```

**Run only tests in a specific file:**

```bash
pnpm --filter @design-bridge/unplugin test -- tests/rspack.spec.ts
pnpm --filter @design-bridge/client test -- tests/annotations.spec.ts
```

**Server tests** spin up a dedicated server instance on port 7379 (`DESIGN_BRIDGE_PORT=7379`, `reuseExistingServer: false`) so they never interfere with the dev server on 7378.

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
pnpm --filter @design-bridge/protocol typecheck
pnpm --filter @design-bridge/components typecheck
pnpm --filter @design-bridge/server typecheck
pnpm --filter @design-bridge/unplugin typecheck
pnpm --filter @design-bridge/astro typecheck
pnpm --filter @design-bridge/next typecheck
pnpm --filter @design-bridge/nuxt typecheck
```

**Note on tsconfig split:** Integration packages (`unplugin`, `next`, `nuxt`, `astro`) have two tsconfig files:

- `tsconfig.json` — used for type-checking (includes `src/` and `tests/`)
- `tsconfig.build.json` — used for emitting declarations (only `src/`, enforces `rootDir`)

The `build.mjs` scripts use `tsconfig.build.json`; `pnpm typecheck` uses the plain `tsconfig.json`.
