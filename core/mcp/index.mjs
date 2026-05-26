#!/usr/bin/env node
/**
 * Design Bridge MCP Server (stdio transport)
 *
 * Exposes Design Bridge comment and tweak actions as MCP tools, and
 * provides workflow guidance as MCP resources.
 *
 * Comment operations work entirely via the file system — no running server
 * required. The server (if running) will pick up file changes via its watcher
 * and broadcast them to connected browsers.
 *
 * get_tweaks still calls the HTTP server (live knob state lives in memory).
 * It degrades gracefully when the server is not running.
 *
 * Environment:
 *   DESIGN_BRIDGE_ROOT  — project root (directory containing .design-bridge/)
 *   DESIGN_BRIDGE_URL   — full server URL (overrides port discovery)
 *   DESIGN_BRIDGE_PORT  — server port (overrides .port file)
 *
 * Usage in .mcp.json:
 *   { "type": "stdio", "command": "node", "args": ["path/to/core/mcp/index.mjs"] }
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createCommentStore } from '@design-bridge/server/comment-store';
import { resolveBaseUrl, resolveRoot } from './resolve-url.mjs';

// ── Lazy store ────────────────────────────────────────────────────────────────

let _store = null;
let _root = null;

async function getStore() {
  if (!_store) {
    _root = await resolveRoot();
    _store = createCommentStore(_root);
    await _store.load();
  }
  return { store: _store, root: _root };
}

// ── Fetch helpers (server-dependent tools only) ───────────────────────────────

async function apiFetch(baseUrl, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message = typeof data === 'object' && data?.error ? data.error : text;
    throw new Error(`HTTP ${res.status}: ${message}`);
  }
  return data;
}

// ── Guidance content (MCP resources) ─────────────────────────────────────────

const GUIDE_WORKFLOW = `# When to Tweak vs. Direct Edit

Design Bridge enables a **conversational design loop** between the user and the LLM,
anchored to specific DOM elements. Comments are threads; the LLM is a first-class
participant that can reply with text, code changes, or live tweaks.

## Conversation flow

1. **User** marks an element in the browser (Alt+click) and writes a comment.
2. **LLM** reads the thread via \`list_comments\` / \`get_comment\` and responds with one of:
   - **(a) Text reply** — \`reply_to_comment\` with just \`text\`
   - **(b) Text + tweak** — \`reply_to_comment\` with \`text\` + \`knob\` + \`actions\` (live UI knob)
   - **(c) New comment** — \`create_comment\` to annotate a different element
3. **User** sees the live knob, tries values, then accepts or discards from the panel.
   - Accept → file change is permanent, knob collapses with "✓ Tweak accepted" badge.
   - Discard → files restored, knob collapses with "✕ Tweak discarded" badge.
   - Thread stays open for further replies either way.
4. If the user is unhappy, they reply again and the LLM can \`reply_to_comment\` with a new tweak.
   The previous tweak is already resolved, so there is no conflict.

## Use a tweak when

- The user's comment signals exploration: "try", "compare", "I'm not sure", "options", "let me see".
- The decision isn't final — the user needs to see variants to decide.

## Use a direct edit when

- The user's intent is clear and decided: "fix", "change X to Y", "it's wrong", "make it smaller".
- Bug fixes, structural refactors, single correct outcome.
- When in doubt — default to a direct edit.

## Multiple tweaks at once

Each comment can carry **one knob**. For independent tweaks on the same thread, call
\`reply_to_comment\` for each one — they become sibling replies. As long as they touch
different files or different lines, the replay engine composes them correctly.

## Workflow for creating a tweak reply

1. \`get_server_info\` — note \`scriptsDir\`.
2. Read the target source file to find the exact string to transform.
3. Write \`{scriptsDir}/{scriptId}.mjs\` — signature: \`export default (content, value) => string\`
   where \`content\` is the full file text (first) and \`value\` is the knob value (second).
   ⚠ Reversing the parameters corrupts or empties the file.
4. \`reply_to_comment\` with \`text\`, \`knob\`, and \`actions\` referencing the scriptId.
5. The browser shows the knob inline in the reply thread. The user accepts or discards.
`;

const GUIDE_WRITE_SCRIPTS = `# How to Write Design Bridge Transform Scripts

## Script format

A transform script is a plain \`.mjs\` file with a **single default export**:

\`\`\`js
// {scriptsDir}/my-script-id.mjs
export default (content, value) =>
  content.replace(/variant="[^"]*"/, \`variant="\${value}"\`);
\`\`\`

The function receives:
- \`content\` — the **original** source file text (always restored before replay) — **FIRST parameter**
- \`value\` — the current knob value as a **string** (all types are coerced) — **SECOND parameter**

It must return the modified file content as a string.
The function must be **pure** — no imports, no async, no side effects.

> ⚠️ **Common mistake — reversed parameters**: the first parameter is \`content\` (the file text),
> the second is \`value\` (the knob). Writing \`(value, content)\` or \`(value, original)\` means
> your regex runs on the knob string, returns \`undefined\`, and the file is emptied or corrupted.

## Where to write the script

Call \`get_server_info\` to get \`scriptsDir\`. Write the file directly:

  \`{scriptsDir}/{scriptId}.mjs\`

The \`scriptId\` must be lowercase kebab-case (e.g. \`hero-variant\`).
The server reads scripts from disk on demand — no registration step needed.

## Knob types

| \`type\`         | \`value\` in script      | Extra \`knob\` fields              |
| -------------- | ----------------------- | ---------------------------------- |
| \`select\`       | \`string\`               | \`options: Record<string,string>\` — key = submitted value, value = display label |
| \`button-group\` | \`string\`               | \`options: Record<string,string>\` — key = submitted value, value = display label |
| \`string\`       | \`string\`               | —                                  |
| \`number\`       | \`string\` (coerced)     | \`min\`, \`max\`, \`step\`         |
| \`boolean\`      | \`"true"\`/\`"false"\`   | —                                  |
| \`color\`        | \`string\` (hex/rgb)     | —                                  |

Prefer \`select\` or \`button-group\` over \`string\` for fixed option sets.

## Replay model — write your regex against the original

Every time any knob changes, the engine:
1. Restores all touched files to their **original content** from snapshot.
2. Replays **all active tweaks in creation order**.

**Your regex must match the original source, not a previously-tweaked version.**

## Regex rules

**Read the target file first.** A regex that doesn't match the original is silently a no-op.
Each replacement must match **exactly one location**.

\`\`\`js
// Unique attribute — no extra context needed
export default (content, value) =>
  content.replace(/variant="[^"]*"/, \`variant="\${value}"\`);

// Same attribute on multiple elements — anchor with a stable id
export default (content, value) =>
  content.replace(/id="reset-btn" variant="[^"]*"/, \`id="reset-btn" variant="\${value}"\`);
\`\`\`

For multiple independent replacements, chain \`.replace()\` calls:

\`\`\`js
export default (content, value) =>
  content
    .replace(/name="system\\/filter-empty"/, \`name="system/\${value}"\`)
    .replace(/icon="old"/, \`icon="\${value}"\`);
\`\`\`

## HMR behaviour by file type

| File type        | Vite behaviour                               |
| ---------------- | -------------------------------------------- |
| \`.vue\` SFC      | Component hot-replaced in-place — no reload  |
| \`.ts\` / \`.js\` | Hot-replaced if the module accepts HMR       |
| \`.css\`          | Style hot-replaced — no reload               |
| \`.html\` entry   | **Full page reload** — avoid                 |
| \`*.json\`        | Full reload unless imported as an HMR module |

Prefer \`.vue\` or \`.css\` targets over \`.html\` entry files.

## Complete example

Step 1 — write the script to disk:

\`\`\`js
// {scriptsDir}/feature-icon.mjs
export default (content, value) =>
  content.replace(/icon: '[^']*'/, \`icon: '\${value}'\`);
\`\`\`

Step 2 — reply to the comment with a tweak:

\`\`\`json
{
  "commentId": "abc-123",
  "text": "I tried a few icons — use the picker to compare them live.",
  "knob": {
    "label": "Icon",
    "type": "select",
    "value": "🎨",
    "options": { "Palette": "🎨", "Fire": "🔥", "Rocket": "🚀" }
  },
  "actions": [
    {
      "type": "content-edit",
      "file": "src/components/FeaturesSection.vue",
      "scriptId": "feature-icon"
    }
  ]
}
\`\`\`
`;

// ── MCP server setup ──────────────────────────────────────────────────────────

const INSTRUCTIONS = `
Design Bridge bridges design exploration and code. It runs a local server alongside your dev
server and injects a floating comment panel into the browser.

## Core concepts

**Comments** are threads attached to DOM elements via CSS selectors. Each thread can hold
text replies and live tweaks. The LLM is a first-class participant — it can create comments
and reply with text, code changes, or live knob tweaks.

**Tweaks** are live knobs embedded in a reply. When the knob value changes, the engine
restores the original file from snapshot and replays all active tweaks — the result is
hot-module-replaced in the browser instantly.

## Agent scope

The agent can **read all comments** but can only **create or edit agent-authored content**
(author='agent'). Resolving, accepting, discarding, and deleting is the **user's job** —
done from the browser panel. Never attempt those actions on the user's behalf.

## Conversational flow

1. User annotates an element in the browser; a thread is created.
2. LLM calls \`list_comments\` at session start, then reads each open thread and responds.
3. For each thread, choose **one** of two response modes based on the user's intent:

**Mode A — Direct edit** (default): The user's intent is clear and decided.
Examples: "fix this", "change X to Y", "the spacing is wrong".
→ Make the code change directly, then \`reply_to_comment\` with text explaining what was done.
→ No knob, no script.

**Mode B — Live tweak**: The user wants to explore options interactively in the browser.
Examples: "try different sizes", "I'm not sure which color", "let me see options", "explore this".
→ Call \`get_write_scripts_guide\` first, create the script, then \`reply_to_comment\` with a knob.
→ The user tries values live and accepts or discards from the panel.

When in doubt, prefer Mode A. Only use Mode B when the comment clearly signals exploration.

## Key tools

- \`create_comment\`      — start a new thread on one or more elements (agent-authored)
- \`reply_to_comment\`    — add an agent reply (text only, or text + live tweak)
- \`list_comments\`       — read open (unresolved) threads by default; pass \`includeResolved: true\` to see all
- \`get_comment\`         — read a single thread with full knob + actions + replies
- \`get_tweaks\`          — list all live knobs with current values
- \`get_server_info\`     — get root, scriptsDir, commentsDir paths

## When writing a tweak script (Mode B only)

Call \`get_write_scripts_guide\` before writing any script. Required signature:
  export default (content, value) => string  — content FIRST, value SECOND.
⚠ Reversing the parameters corrupts the file.
`;

const server = new McpServer(
  { name: 'Design Bridge', version: '0.0.1' },
  { instructions: INSTRUCTIONS },
);

// ── Resources ─────────────────────────────────────────────────────────────────

server.resource(
  'workflow-guide',
  'design-bridge://guide/workflow',
  {
    mimeType: 'text/markdown',
    description: 'Conversational design loop — when to tweak vs. direct edit',
  },
  async () => ({
    contents: [
      { uri: 'design-bridge://guide/workflow', mimeType: 'text/markdown', text: GUIDE_WORKFLOW },
    ],
  }),
);

server.resource(
  'write-scripts-guide',
  'design-bridge://guide/write-scripts',
  {
    mimeType: 'text/markdown',
    description:
      'How to write Design Bridge transform scripts for reply_to_comment / create_comment tweaks',
  },
  async () => ({
    contents: [
      {
        uri: 'design-bridge://guide/write-scripts',
        mimeType: 'text/markdown',
        text: GUIDE_WRITE_SCRIPTS,
      },
    ],
  }),
);

// ── Tools ─────────────────────────────────────────────────────────────────────

server.tool(
  'get_write_scripts_guide',
  `Return the full Design Bridge transform script authoring reference.
  Call this BEFORE writing any transform script (.mjs file) for a tweak.
  Covers: required function signature, parameter order, knob types, regex rules, HMR behaviour, and complete examples.`,
  {},
  async () => ({
    content: [{ type: 'text', text: GUIDE_WRITE_SCRIPTS }],
  }),
);

server.tool(
  'list_comments',
  `List all comments stored in Design Bridge.
  Call this proactively at the start of a session to discover pending design feedback and active
  tweaks. Each comment may carry a \`knob\` (live tweak), an \`actions\` array, and a \`replies\`
  thread. Comments without a \`resolvedAt\` field are still open.
  By default only open (unresolved) comments are returned. Set \`includeResolved\` to true to also include resolved comments.`,
  {
    includeResolved: z
      .boolean()
      .optional()
      .describe('When true, resolved comments are included in the response. Defaults to false.'),
  },
  async ({ includeResolved = false } = {}) => {
    const { store } = await getStore();
    let comments = store.all();
    if (!includeResolved) comments = comments.filter((c) => !c.meta?.resolvedAt);
    return { content: [{ type: 'text', text: JSON.stringify({ comments }, null, 2) }] };
  },
);

server.tool(
  'get_comment',
  `Get a single comment by id — includes full knob definition, actions, and reply thread.
  Use this to inspect the details of a specific tweak before accepting or discarding it.`,
  { id: z.string().describe('Comment id') },
  async ({ id }) => {
    const { store } = await getStore();
    const comment = store.get(id);
    if (!comment) throw new Error(`Comment not found: ${id}`);
    return { content: [{ type: 'text', text: JSON.stringify(comment, null, 2) }] };
  },
);

server.tool(
  'create_comment',
  `Start a new comment thread on one or more DOM elements (agent-authored).
  Use this when the LLM proactively wants to annotate an element or respond to user
  feedback by opening a thread on a specific element.

  Can optionally attach a live tweak knob (knob + actions). If creating a tweak:
  1. Call get_server_info — note scriptsDir.
  2. Read the target source file to find the exact string to replace.
  3. Write {scriptsDir}/{scriptId}.mjs — REQUIRED signature:
        export default (content, value) => string
     • content = the full file text (FIRST param)
     • value   = the knob value as a string (SECOND param)
     ⚠ Reversing the params (e.g. (value, content)) corrupts or empties the file.
  4. Include knob + actions in this call.

  The comment is stamped author='agent'.

  Call get_write_scripts_guide for the full script reference (knob types, regex rules, HMR notes).`,
  {
    elements: z
      .array(
        z.object({
          minimalSelector: z.string().describe('CSS selector for this element'),
          tag: z.string().describe('HTML tag name (lowercase)'),
          id: z.string().optional().describe('Element id attribute'),
          classes: z.array(z.string()).describe('CSS classes on the element'),
          source: z
            .object({ file: z.string(), line: z.number(), column: z.number() })
            .optional()
            .describe('Source file location'),
        }),
      )
      .describe('DOM elements this comment is attached to'),
    comment: z
      .string()
      .describe(
        'The comment / opening message of the thread. Keep it short and concise — 1–3 sentences max. Write for a non-technical audience: no file paths, no code references, no markdown links. Use only basic Markdown (bold, italic, bullet lists, inline code). Focus on the design observation, not the implementation.',
      ),

    pageUrl: z.string().describe('URL of the page where the comment is anchored'),
    knob: z
      .object({
        label: z.string(),
        type: z.enum(['select', 'button-group', 'string', 'number', 'boolean', 'color']),
        value: z.union([z.string(), z.number(), z.boolean()]),
        options: z.record(z.string()).optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().optional(),
      })
      .optional()
      .describe('Live tweak knob definition'),
    actions: z
      .array(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('content-edit'), file: z.string(), scriptId: z.string() }),
          z.object({ type: z.literal('file-create'), path: z.string(), fileId: z.string() }),
          z.object({ type: z.literal('file-delete'), path: z.string() }),
        ]),
      )
      .optional()
      .describe('Ordered actions to execute when the knob value changes'),
  },
  async ({ elements, comment, pageUrl, knob, actions }) => {
    const { store } = await getStore();
    const now = Date.now();
    const id = `agent-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const rootEntry = {
      id: `${id}-root`,
      type: 'comment',
      text: comment,
      createdAt: now,
      author: 'agent',
    };
    const comments = knob
      ? [
        rootEntry,
        {
          id: `${id}-tweak`,
          type: 'tweak',
          text: comment,
          createdAt: now,
          author: 'agent',
          knob,
          actions: actions ?? [],
          tweakStatus: 'pending',
        },
      ]
      : [rootEntry];
    const payload = {
      meta: { id, pageUrl, timestamp: now, createdAt: now },
      elements,
      comments,
    };
    await store.upsert(payload);
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
  },
);

server.tool(
  'reply_to_comment',
  `Add an agent reply to an existing comment thread. This is the primary tool for the LLM
  to respond to user feedback.

  The reply can be:
  - Text only (omit knob + actions) — for explanations, questions, or direct edits
  - Text + tweak (include knob + actions) — for live explorations the user can try in the browser

  If adding a tweak reply:
  1. Call get_server_info — note scriptsDir.
  2. Read the target source file to find the exact string to replace.
  3. Write {scriptsDir}/{scriptId}.mjs — REQUIRED signature:
        export default (content, value) => string
     • content = the full file text (FIRST param)
     • value   = the knob value as a string (SECOND param)
     ⚠ Reversing the params (e.g. (value, content)) corrupts or empties the file.
  4. Include knob + actions in this call.

  The knob appears inline in the thread at the position of this reply.
  The user accepts or discards from the panel — the knob collapses with a status badge either way.
  Multiple tweak replies on the same thread are allowed as long as they touch different code.

  Call get_write_scripts_guide for the full script reference (knob types, regex rules, HMR notes).`,
  {
    commentId: z.string().describe('ID of the existing comment thread to reply to'),
    text: z
      .string()
      .describe(
        'The reply text — shown inline in the thread. Keep it short and concise — 1–3 sentences max. Write for a non-technical audience: no file paths, no code references, no markdown links. Use only basic Markdown (bold, italic, bullet lists). Focus on the design observation or proposed change, not the implementation.',
      ),

    knob: z
      .object({
        label: z.string(),
        type: z.enum(['select', 'button-group', 'string', 'number', 'boolean', 'color']),
        value: z.union([z.string(), z.number(), z.boolean()]),
        options: z.record(z.string()).optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().optional(),
      })
      .optional()
      .describe('Live tweak knob — if provided, creates a tweak reply'),
    actions: z
      .array(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('content-edit'), file: z.string(), scriptId: z.string() }),
          z.object({ type: z.literal('file-create'), path: z.string(), fileId: z.string() }),
          z.object({ type: z.literal('file-delete'), path: z.string() }),
        ]),
      )
      .optional()
      .describe('Ordered actions for the knob — required when knob is provided'),
  },
  async ({ commentId, text, knob, actions }) => {
    const { store } = await getStore();
    const existing = store.get(commentId);
    if (!existing) throw new Error(`Comment not found: ${commentId}`);
    const now = Date.now();
    const replyId = `reply-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const textEntry = { id: replyId, type: 'comment', text, createdAt: now, author: 'agent' };
    const newComments = knob
      ? [
        ...(existing.comments ?? []),
        textEntry,
        {
          id: `${replyId}-tweak`,
          type: 'tweak',
          text,
          createdAt: now,
          author: 'agent',
          knob,
          actions: actions ?? [],
          tweakStatus: 'pending',
        },
      ]
      : [...(existing.comments ?? []), textEntry];
    const updated = {
      ...existing,
      meta: { ...existing.meta, timestamp: now },
      comments: newComments,
    };
    await store.upsert(updated);
    return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }] };
  },
);

server.tool(
  'get_tweaks',
  `Get the current knobs schema — lists all active tweak knobs with their current values.
  Useful to check which tweaks are live and summarise the current exploration state to the user.
  Each knob entry includes the comment id (\`marker\`), label, type, and current value.`,
  {},
  async () => {
    try {
      const url = await resolveBaseUrl();
      const data = await apiFetch(url, '/api/tweaks');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    } catch {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                tweaks: [],
                note: 'Design Bridge server not running — live tweak state unavailable',
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  },
);

server.tool(
  'get_server_info',
  `Get the running Design Bridge server's root directory and key paths.
  Call this first when creating a tweak — it tells you where to write script files.

  Returns: { port, root, scriptsDir, commentsDir }
  - root: the project root the server is watching
  - scriptsDir: write {scriptId}.mjs files here BEFORE calling reply_to_comment / create_comment
  - commentsDir: where comment JSON files are persisted`,
  {},
  async () => {
    const { root } = await getStore();
    let port = null;
    try {
      const portStr = await readFile(resolve(root, '.design-bridge', '.port'), 'utf-8');
      port = parseInt(portStr.trim(), 10);
    } catch {
      // server not running — port stays null
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              port,
              root,
              scriptsDir: `${root}/.design-bridge/scripts`,
              commentsDir: `${root}/.design-bridge/comments`,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
