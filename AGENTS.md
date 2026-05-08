# Design Bridge — Agent Instructions

## What is Design Bridge?

Design Bridge is a local developer tool that bridges design experimentation and code. It runs alongside any Vite-based dev server (or as a standalone Node.js server) and injects a floating panel into the browser.

The panel has two capabilities:

**Tweaks** — live UI knobs backed by `.mjs` scripts in `tweaks/scripts/`. Each script exports a `meta` object (defining the knob: label, type, default value) and an `apply(value, ctx)` function that rewrites source files on the fly using regex-based `ctx.replaceInFile()`. A snapshot/replay model ensures every knob change starts from the original file, so tweaks compose safely without corrupting source. When the user commits a value (`tweak:finalize`), the change is written permanently; reset restores from the snapshot.

**Annotations** — the user can enter inspect mode (Alt+click), click any DOM element in the browser, and attach a comment. Annotations are stored with a stable CSS selector (via `@medv/finder`), a comment, and optionally a source location (file:line:col from code-inspector). They are persisted to `tweaks/annotations.md` and synced across tabs via `BroadcastChannel`. Annotations serve as async design feedback left directly on the running UI — the agent reads and acts on them.
