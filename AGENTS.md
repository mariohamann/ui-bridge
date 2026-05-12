# Design Bridge — Agent Instructions

## What is Design Bridge?

Design Bridge is a local developer tool that bridges design experimentation and code. It runs alongside any Vite-based dev server (or as a standalone Node.js server) and injects a floating panel into the browser.

### Package structure

The project is a pnpm monorepo under `packages/`:

| Package | Role |
|---|---|
| `@design-bridge/core` | Shared TypeScript types and WebSocket protocol definitions (knobs, annotations, messages). |
| `@design-bridge/server` | Node.js server (`server/index.mjs`). Hosts the WebSocket endpoint, runs the tweak engine, and manages the annotation store. Annotations are persisted as individual JSON files in `tweaks/annotations/`. |
| `@design-bridge/vite-plugin` | Vite plugin that spawns the server as a subprocess and injects the client bundle into the dev server. |
| `@design-bridge/components` | Lit web components (`db-annotation`, `db-review`) and the shared signal/intent bus. Transport-agnostic: components read from signal stores and dispatch typed `ComponentIntent`s. |
| `@design-bridge/client` | Browser entry points. `src/browser/index.ts` boots the inspector and wires the WebSocket adapter (`ws-adapter.ts`), which translates between WebSocket messages and the signal/intent bus. `src/review/index.ts` is the entry for the standalone review page. |

### Capabilities

**Tweaks** — live UI knobs backed by `.mjs` scripts in `tweaks/scripts/`. Each script exports a `meta` object (defining the knob: label, type, default value) and an `apply(value, ctx)` function that rewrites source files on the fly using regex-based `ctx.replaceInFile()`. A snapshot/replay model ensures every knob change starts from the original file, so tweaks compose safely without corrupting source. When the user commits a value (`tweak:finalize`), the change is written permanently; reset restores from the snapshot.

**Annotations** — the user can enter inspect mode (Alt+click), click any DOM element in the browser, and attach a comment. Annotations are stored with a stable CSS selector (via `@medv/finder`), a comment, and optionally a source location (file:line:col from code-inspector). They are persisted as per-annotation JSON files in `tweaks/annotations/` and synced across clients via WebSocket (`annotations:sync` messages). A standalone `/review` page (`db-review` component) lists all annotations with reply threads, resolve/delete actions, and tweak links. Annotations serve as async design feedback left directly on the running UI — the agent reads and acts on them.

### Signal / intent bus

UI components in `@design-bridge/components` are transport-agnostic. They read state from shared TC39 signal stores (`annotations-store.ts`, `knobs-store.ts`) and express user actions as typed `ComponentIntent` objects dispatched to an intent bus (`intents.ts`). The WS adapter in `@design-bridge/client` subscribes to both the WebSocket (server → stores) and the intent bus (UI → WebSocket), keeping all transport logic out of the component layer.

## Running Tests

Tests are spread across four packages, each with a different runner:

| Package | Runner | What it tests |
|---|---|---|
| `@design-bridge/components` | Node.js built-in test runner (`node --test`) | Signal stores and intent bus — no browser, no server |
| `@design-bridge/server` | Playwright (API-only, no browser) | HTTP + WebSocket API of the standalone server |
| `@design-bridge/client` | Playwright (Chromium) | Annotation UI end-to-end against the Vite dev server |
| `@design-bridge/vite-plugin` | Playwright (Chromium) | Plugin integration against the Vite dev server |

**Run all test suites from the repo root:**

```bash
pnpm test
```

This runs each package's test script in order: `components` → `server` → `client` → `vite-plugin`.

**Run a single package's tests:**

```bash
pnpm --filter @design-bridge/client test
pnpm --filter @design-bridge/server test
pnpm --filter @design-bridge/components test
pnpm --filter @design-bridge/vite-plugin test
```

**Target a single Playwright test by name** (for `client` or `vite-plugin`):

```bash
pnpm --filter @design-bridge/client test -- -g "test name here"
```

**Server tests** spin up a dedicated server instance on port 7379 (`DESIGN_BRIDGE_PORT=7379`, `reuseExistingServer: false`) so they never interfere with the dev server on 7378.

**Client and vite-plugin tests** require the Vite dev server (port 5173). Playwright's `webServer` config starts it automatically (building the plugin first) if it is not already running; it reuses an existing server in non-CI mode.

**Do NOT run Playwright tests from inside a package directly** unless you have already built the required packages, since the build step is part of the `webServer` command.

## Agent Rules for Writing Tests

**NEVER use `page.waitForTimeout()` or any arbitrary sleep/pause.** Always wait for a concrete condition — a DOM state, a network response, a locator visibility change, etc.

**Debug test failures one test at a time.** Run a single failing test with `-g "test name"` before re-running the full suite. Running everything again after a single change wastes time and obscures which fix worked.
