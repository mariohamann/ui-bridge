# Design Bridge — Agent Instructions

## What is Design Bridge?

Design Bridge is a local developer tool that bridges design experimentation and code. It runs alongside any Vite-based dev server (or as a standalone Node.js server) and injects a floating panel into the browser.

The panel has two capabilities:

**Tweaks** — live UI knobs backed by `.mjs` scripts in `tweaks/scripts/`. Each script exports a `meta` object (defining the knob: label, type, default value) and an `apply(value, ctx)` function that rewrites source files on the fly using regex-based `ctx.replaceInFile()`. A snapshot/replay model ensures every knob change starts from the original file, so tweaks compose safely without corrupting source. When the user commits a value (`tweak:finalize`), the change is written permanently; reset restores from the snapshot.

**Annotations** — the user can enter inspect mode (Alt+click), click any DOM element in the browser, and attach a comment. Annotations are stored with a stable CSS selector (via `@medv/finder`), a comment, and optionally a source location (file:line:col from code-inspector). They are persisted to `tweaks/annotations.md` and synced across tabs via `BroadcastChannel`. Annotations serve as async design feedback left directly on the running UI — the agent reads and acts on them.

## Running Tests

Tests are Playwright end-to-end tests located in `demos/vue-tailwind/tests/`.

**Prerequisites — two servers must be running before or during the test run:**

1. **Vite dev server** (port 5173) — started automatically by Playwright's `webServer` config when no existing server is found. The Design Bridge Vite plugin spawns the Design Bridge server as a subprocess.
2. **Design Bridge server** (port 7378) — spawned automatically by the Vite plugin when the dev server starts.

If both servers are already running (e.g. you started `pnpm dev` manually in `demos/vue-tailwind/`), Playwright will reuse them (`reuseExistingServer: true` in non-CI mode).

**Run all tests from the repo root (builds first, starts fresh servers, cleans up after):**

```bash
pnpm test
```

Extra args after `--` are forwarded to Playwright, so you can target a single test:

```bash
pnpm test -- -g "test name here"
```

These scripts: build `@design-bridge/vite-plugin`, then run Playwright which starts a fresh Vite dev server (and Design Bridge server as a subprocess) and kills it when done. `reuseExistingServer` is `false` — stale sessions are never reused.

**Do NOT run tests from `demos/vue-tailwind/` directly** unless you have already built the plugin and want to reuse the running server intentionally.

## Agent Rules for Writing Tests

**NEVER use `page.waitForTimeout()` or any arbitrary sleep/pause.** Always wait for a concrete condition — a DOM state, a network response, a locator visibility change, etc.

**Debug test failures one test at a time.** Run a single failing test with `-g "test name"` before re-running the full suite. Running everything again after a single change wastes time and obscures which fix worked.
