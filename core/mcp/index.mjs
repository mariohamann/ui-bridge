#!/usr/bin/env node
/**
 * UI Bridge MCP Server (stdio transport)
 *
 * Exposes UI Bridge comment and tweak actions as MCP tools, and
 * provides workflow guidance as MCP resources.
 *
 * All operations work entirely via the file system — no running server
 * required. The server (if running) will pick up file changes via its watcher
 * and broadcast them to connected browsers.
 *
 * Usage in .mcp.json:
 *   { "type": "stdio", "command": "node", "args": ["path/to/core/mcp/index.mjs"] }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createCommentStore, resolveRoot, scriptsDir, commentsDir } from '@ui-bridge/store';
import { relative, isAbsolute, resolve } from 'node:path';

// ── Path normalization ───────────────────────────────────────────────────────

/**
 * Normalize an action file path to be relative to rootDir.
 * Agents sometimes pass repo-root-relative paths (e.g. "demos/vite/src/Foo.vue")
 * when they should be root-relative (e.g. "src/Foo.vue"). Strip the prefix.
 */
function normalizeActionPath(rootDir, filePath) {
  // Resolve relative paths the same way code-inspector does: from process.cwd(),
  // which may be the monorepo root rather than the Vite project root.
  const abs = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  const rel = relative(rootDir, abs);
  // If the result escapes rootDir, return the original (let the engine error clearly)
  return rel.startsWith('..') ? filePath : rel;
}

function normalizeActions(rootDir, actions) {
  if (!actions) return actions;
  return actions.map((action) => {
    if (action.type === 'content-edit') {
      return { ...action, file: normalizeActionPath(rootDir, action.file) };
    }
    if (action.type === 'file-create' || action.type === 'file-delete') {
      return { ...action, path: normalizeActionPath(rootDir, action.path) };
    }
    return action;
  });
}

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

// ── Guidance content (MCP resources) ─────────────────────────────────────────

const GUIDE_WORKFLOW = `# When to Tweak vs. Direct Edit

## Conversation flow

1. User marks an element (Alt+click) and writes a comment.
2. LLM reads the thread via \`get_comments\` / \`get_comment\` and responds with a text reply, a text + tweak reply, or a new comment on a different element.
3. User tries the live knob and accepts (permanent) or discards (restored) from the panel.

## Use a tweak when

The comment signals exploration: "try", "compare", "I'm not sure", "let me see options".

## Use a direct edit when

The intent is clear and decided: "fix", "change X to Y", "it's wrong", "make it smaller".
Bug fixes, structural refactors, single correct outcome.
**When in doubt — default to a direct edit.**

## Multiple tweaks

Each comment holds one knob. For independent tweaks on the same thread, add sibling \`reply_to_comment\` calls — the replay engine composes them in creation order as long as they touch different code.
`;

const GUIDE_WRITE_SCRIPTS = `# How to Write UI Bridge Transform Scripts

## Script format

\`\`\`js
// {scriptsDir}/my-script-id.mjs
export default (content, value) =>
  content.replace(/variant="[^"]*"/, \`variant="\${value}"\`);
\`\`\`

- **\`content\`** — full original file text (FIRST param, always restored before replay)
- **\`value\`** — knob value as a string (SECOND param, all types coerced)
- Must return a string. Must be pure — no imports, no async, no side effects.
- ⚠ \`(value, content)\` reverses the params and corrupts the file.

## Where to write the script

Call \`get_server_info\` → use \`scriptsDir\`. Filename: \`{scriptsDir}/{scriptId}.mjs\` (lowercase kebab-case).
No registration needed — the server reads scripts from disk on demand.
## File paths in actions

The \`file\` field in a \`content-edit\` action must be **relative to the project root** returned by \`get_server_info\`.
Comment elements may carry a \`source.file\` path that is relative to the repo root — do NOT copy it directly.
Example: if root is \`/projects/demo/demos/vite\` and source.file is \`demos/vite/src/Foo.vue\`, use \`src/Foo.vue\`.
## Knob types

| \`type\`         | \`value\` in script      | Extra \`knob\` fields              |
| -------------- | ----------------------- | ---------------------------------- |
| \`select\`       | \`string\`               | \`options: Record<string,string>\` — key = submitted value, value = display label |
| \`radio\`         | \`string\`               | \`options: Record<string,string>\` — key = submitted value, value = display label |
| \`string\`       | \`string\`               | —                                  |
| \`number\`       | \`string\` (coerced)     | \`min\`, \`max\`, \`step\`         |
| \`boolean\`      | \`"true"\`/\`"false"\`   | —                                  |
| \`color\`        | \`string\` (hex/rgb)     | —                                  |

Prefer \`select\` or \`radio\` over \`string\` for fixed option sets.

## Replay model

On every knob change the engine restores all touched files from snapshot and replays all active tweaks in creation order. **Regexes must match the original source.**

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

## Example

\`\`\`js
// {scriptsDir}/feature-icon.mjs
export default (content, value) =>
  content.replace(/icon: '[^']*'/, \`icon: '\${value}'\`);
\`\`\`

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
UI Bridge injects a floating comment panel into the browser and bridges design feedback to code.
**Comments** are threads on DOM elements. **Tweaks** are live knobs in replies — on change, the engine restores all touched files from snapshot and replays tweaks, hot-replacing the result.

## Agent scope

Read all comments; create/edit only agent-authored content (author='agent').
Resolving, accepting, discarding, and deleting is the **user's job** — never do it on their behalf.

## Response modes

Call \`get_comments\` at session start, then for each open thread pick one mode:

- **Mode A — Direct edit** (default): intent is decided ("fix", "change X to Y", "it's wrong") → edit code, then \`reply_to_comment\` with text. No knob.
- **Mode B — Live tweak**: intent is exploratory ("try", "I'm not sure", "let me see options") → call \`get_write_scripts_guide\`, write script, then \`reply_to_comment\` with knob.

When in doubt, use Mode A.

## Tools

- \`get_comments\` / \`get_comment\` — read threads
- \`create_comment\` — start a new agent thread
- \`reply_to_comment\` — add text or text + tweak reply

- \`get_server_info\` — root, scriptsDir, commentsDir
- \`get_write_scripts_guide\` — full script reference (call before writing any .mjs tweak)
`;

const server = new McpServer(
  { name: 'UI Bridge', version: '0.0.1' },
  { instructions: INSTRUCTIONS },
);

// ── Resources ─────────────────────────────────────────────────────────────────

server.resource(
  'workflow-guide',
  'ui-bridge://guide/workflow',
  {
    mimeType: 'text/markdown',
    description: 'Conversational design loop — when to tweak vs. direct edit',
  },
  async () => ({
    contents: [
      { uri: 'ui-bridge://guide/workflow', mimeType: 'text/markdown', text: GUIDE_WORKFLOW },
    ],
  }),
);

server.resource(
  'write-scripts-guide',
  'ui-bridge://guide/write-scripts',
  {
    mimeType: 'text/markdown',
    description:
      'How to write UI Bridge transform scripts for reply_to_comment / create_comment tweaks',
  },
  async () => ({
    contents: [
      {
        uri: 'ui-bridge://guide/write-scripts',
        mimeType: 'text/markdown',
        text: GUIDE_WRITE_SCRIPTS,
      },
    ],
  }),
);

// ── Tools ─────────────────────────────────────────────────────────────────────

server.tool(
  'get_write_scripts_guide',
  `Return the full UI Bridge transform script authoring reference.
  Call this BEFORE writing any transform script (.mjs file) for a tweak.
  Covers: required function signature, parameter order, knob types, regex rules, HMR behaviour, and complete examples.`,
  {},
  async () => ({
    content: [{ type: 'text', text: GUIDE_WRITE_SCRIPTS }],
  }),
);

server.tool(
  'get_comments',
  `List all comment threads stored in UI Bridge (full thread data).
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
    await store.reload();
    let comments = store.all();
    if (!includeResolved) comments = comments.filter((c) => !c.meta?.resolvedAt);
    return { content: [{ type: 'text', text: JSON.stringify({ comments }, null, 2) }] };
  },
);

server.tool(
  'get_comment',
  `Get a single comment thread by display number or id — includes full knob definition, actions, and reply thread.
  Prefer \`number\` (e.g. 3) over \`id\` when you know the display number.`,
  {
    number: z.number().optional().describe('Comment display number (stable, e.g. 3)'),
    id: z.string().optional().describe('Comment UUID (fallback if display number is unknown)'),
  },
  async ({ number, id }) => {
    const { store } = await getStore();
    await store.reload();
    let comment;
    if (number !== undefined) {
      comment = store.getByDisplayNumber(number);
    } else if (id) {
      comment = store.get(id);
    } else {
      throw new Error('Provide either number or id');
    }
    if (!comment) throw new Error(`Comment not found: ${number !== undefined ? `#${number}` : id}`);
    return { content: [{ type: 'text', text: JSON.stringify(comment, null, 2) }] };
  },
);

server.tool(
  'create_comment',
  `Start a new comment thread on one or more DOM elements (agent-authored).
  The comment is stamped author='agent'.
  For tweaks: call get_write_scripts_guide first — signature is (content, value) => string, content FIRST.`,
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
        type: z.enum(['select', 'radio', 'string', 'number', 'boolean', 'color']),
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
    const { store, root } = await getStore();
    await store.reload();
    const now = Date.now();
    const id = `agent-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const displayNumber = store.nextDisplayNumber();
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
            actions: normalizeActions(root, actions) ?? [],
            tweakStatus: 'pending',
          },
        ]
      : [rootEntry];
    const payload = {
      meta: { id, displayNumber, pageUrl, timestamp: now, createdAt: now },
      elements,
      comments,
    };
    await store.upsert(payload);
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
  },
);

server.tool(
  'reply_to_comment',
  `Add an agent reply to an existing comment thread.
  Text only (no knob) for direct edits; text + knob + actions for live tweaks.
  Multiple tweak replies on the same thread are allowed as long as they touch different code.
  For tweaks: call get_write_scripts_guide first — signature is (content, value) => string, content FIRST.`,
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
        type: z.enum(['select', 'radio', 'string', 'number', 'boolean', 'color']),
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
    const { store, root } = await getStore();
    await store.reload();
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
            actions: normalizeActions(root, actions) ?? [],
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
  'get_server_info',
  `Get the UI Bridge root directory and key paths.
  Call this first when creating a tweak — it tells you where to write script files.

  Returns: { root, scriptsDir, commentsDir }
  - root: the project root containing the .ui-bridge/ folder
  - scriptsDir: write {scriptId}.mjs files here BEFORE calling reply_to_comment / create_comment
  - commentsDir: where comment JSON files are persisted`,
  {},
  async () => {
    const { root } = await getStore();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              root,
              scriptsDir: scriptsDir(root),
              commentsDir: commentsDir(root),
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
