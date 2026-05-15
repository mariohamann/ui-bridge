#!/usr/bin/env node
/**
 * Design Bridge MCP Server (stdio transport)
 *
 * Exposes Design Bridge annotation and tweak actions as MCP tools, and
 * provides workflow guidance as MCP resources.
 *
 * Port discovery order:
 *   1. DESIGN_BRIDGE_URL  — full base URL (e.g. http://localhost:7378)
 *   2. DESIGN_BRIDGE_PORT — port number, uses http://localhost
 *   3. Walk up from DESIGN_BRIDGE_ROOT (or cwd) looking for .design-bridge/.port
 *   4. Default: http://localhost:7378
 *
 * Usage in .mcp.json:
 *   { "type": "stdio", "command": "node", "args": ["path/to/core/mcp/index.mjs"] }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolveBaseUrl } from './resolve-url.mjs';

// ── Fetch helpers ─────────────────────────────────────────────────────────────

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

Use a **tweak** when the user wants to compare options, try multiple variants,
or explore design alternatives side-by-side in the browser. Tweaks are backed
by annotations with a live knob — the value can be changed, reset, and accepted
or discarded from the browser panel.

Use a **direct edit** when the decision is already clear: bug fixes, structural
refactors, or any change with a single correct outcome.

**When in doubt:** if the user will want to see options in the browser, tweak.
If there is one right answer, edit directly.

## Workflow for creating a tweak

1. Call \`get_server_info\` — note the \`scriptsDir\` path.
2. Read the target source file to find the exact string to transform.
3. Write the script file to \`{scriptsDir}/{scriptId}.mjs\` directly using your
   file-write tools. Format: \`export default (content, value) => string\`.
4. Call \`upsert_annotation\` with \`knob\` + \`actions\` referencing the scriptId.
5. The browser panel shows the knob immediately — accept (finalizes file changes)
   or discard (reverts) from the panel.
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
- \`content\` — the **original** source file text (always restored before replay)
- \`value\` — the current knob value as a **string** (all types are coerced)

It must return the modified file content as a string.
The function must be **pure** — no imports, no async, no side effects.

## Where to write the script

Call \`get_server_info\` to get \`scriptsDir\`. Write the file directly:

  \`{scriptsDir}/{scriptId}.mjs\`

The \`scriptId\` must be lowercase kebab-case (e.g. \`hero-variant\`).
The server reads scripts from disk on demand — no registration step needed.

## Knob types

| \`type\`         | \`value\` in script      | Extra \`knob\` fields              |
| -------------- | ----------------------- | ---------------------------------- |
| \`select\`       | \`string\`               | \`options: Record<string,string>\` |
| \`button-group\` | \`string\`               | \`options: Record<string,string>\` |
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

Step 2 — register the annotation with the tweak:

\`\`\`json
{
  "id": "feature-icon-tweak",
  "selectors": [".feature-icon"],
  "labels": [".feature-icon"],
  "comment": "Try different icons",
  "pageUrl": "http://localhost:5173/",
  "timestamp": 0,
  "createdAt": 0,
  "replies": [],
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
server and injects a floating annotation panel into the browser.

## Core concepts

**Annotations** are lightweight records attached to DOM elements via CSS selectors. They can be
pure comments (design feedback) or carry a **knob** + **actions** (a live tweak). Use
\`list_annotations\` proactively at the start of a session to discover pending design feedback.

**Tweaks** are live knobs backed by transform scripts. When a knob value changes, the engine
restores the original file from snapshot and replays all active tweaks — the result is
hot-module-replaced in the browser instantly. The user sees the change live without any commit.

**Always prefer a tweak over a direct edit when:**
- The user wants to compare variants or alternatives ("try a few button styles", "show me options")
- The decision isn't final yet — exploring, not committing
- The user will want to see choices side-by-side in the browser before picking one

**Use a direct code edit when:**
- The change is a bug fix or structural refactor with one correct outcome
- The user explicitly says "just change it"

## Agent scope — read, comment, and tweak only

The agent's role is to **read feedback and create tweaks**. Resolving, accepting, discarding,
and deleting annotations is the **user's job** — done from the browser panel. Never attempt
to accept, discard, or delete annotations on the user's behalf.

## Tweak workflow (always follow this order)

1. \`get_server_info\` — get \`scriptsDir\` (absolute path where script files live)
2. Read the target source file to find the exact string your regex will match
3. Write \`{scriptsDir}/{scriptId}.mjs\` with: \`export default (content, value) => string\`
   - Pure function, no imports, no async
   - \`content\` is always the ORIGINAL file text (replay model — never pre-tweaked)
   - \`value\` is always a string (coerce inside the function if needed)
   - scriptId must be lowercase kebab-case (e.g. \`hero-button-variant\`)
4. \`upsert_annotation\` with \`knob\` + \`actions\` referencing the scriptId
5. The browser panel shows the knob immediately. The user picks the variant and
   accepts or discards it themselves from the panel.

## Reading annotations

Annotations are persistent async design feedback and exploration state. At the start of a
session always call \`list_annotations\` to surface any open feedback or pending tweaks.
Each annotation may include a \`comment\`, \`replies\` thread, and optionally a \`knob\` (tweak).

For detailed regex rules, knob types, HMR behaviour, and full examples see:
- \`design-bridge://guide/workflow\` — when to tweak vs. direct edit
- \`design-bridge://guide/write-scripts\` — full script authoring reference
`;

const server = new McpServer(
  { name: 'design-bridge', version: '0.0.1' },
  { instructions: INSTRUCTIONS },
);

// ── Resources ─────────────────────────────────────────────────────────────────

server.resource(
  'workflow-guide',
  'design-bridge://guide/workflow',
  { mimeType: 'text/markdown', description: 'When to tweak vs. direct edit — decision guide' },
  async () => ({
    contents: [
      { uri: 'design-bridge://guide/workflow', mimeType: 'text/markdown', text: GUIDE_WORKFLOW },
    ],
  }),
);

server.resource(
  'write-scripts-guide',
  'design-bridge://guide/write-scripts',
  { mimeType: 'text/markdown', description: 'How to write Design Bridge transform scripts' },
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
  'list_annotations',
  `List all annotations stored in Design Bridge.
  Call this proactively at the start of a session to discover pending design feedback and active
  tweaks. Each annotation may carry a \`knob\` (live tweak), an \`actions\` array, and a \`replies\`
  thread. Annotations without a \`resolvedAt\` field are still open.`,
  {},
  async () => {
    const url = await resolveBaseUrl();
    const data = await apiFetch(url, '/api/annotations');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'get_annotation',
  `Get a single annotation by id — includes full knob definition, actions, and reply thread.
  Use this to inspect the details of a specific tweak before accepting or discarding it.`,
  { id: z.string().describe('Annotation id') },
  async ({ id }) => {
    const url = await resolveBaseUrl();
    const data = await apiFetch(url, `/api/annotations/${encodeURIComponent(id)}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'upsert_annotation',
  `Create or update an annotation. Can optionally attach a live tweak knob.

  To create a tweak annotation:
  1. Call get_server_info — note scriptsDir.
  2. Read the target source file to find the exact string to replace.
  3. Write {scriptsDir}/{scriptId}.mjs directly using your file tools.
     Format: export default (content, value) => string  (pure, no imports, no async).
     The scriptId must be lowercase kebab-case.
  4. Call upsert_annotation with knob + actions referencing the scriptId.

  The browser panel shows the knob immediately. The user can change the value
  live, then accept (permanently writes the file change and deletes the
  annotation) or discard (reverts the file, keeps the annotation).

  See resource design-bridge://guide/write-scripts for regex rules, knob types,
  HMR behaviour, and a complete example.`,
  {
    annotation: z
      .object({
        id: z.string(),
        selectors: z.array(z.string()),
        labels: z.array(z.string()),
        comment: z.string(),
        pageUrl: z.string(),
        timestamp: z.number(),
        createdAt: z.number(),
        replies: z.array(z.unknown()).default([]),
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
          .optional(),
        actions: z
          .array(
            z.discriminatedUnion('type', [
              z.object({ type: z.literal('content-edit'), file: z.string(), scriptId: z.string() }),
              z.object({ type: z.literal('file-create'), path: z.string(), fileId: z.string() }),
              z.object({ type: z.literal('file-delete'), path: z.string() }),
            ]),
          )
          .optional(),
      })
      .describe('Annotation object'),
  },
  async ({ annotation }) => {
    const url = await resolveBaseUrl();
    const data = await apiFetch(url, '/api/annotations', { method: 'POST', body: annotation });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'get_tweaks',
  `Get the current knobs schema — lists all active tweak knobs with their current values.
  Useful to check which tweaks are live and summarise the current exploration state to the user.
  Each knob entry includes the annotation id (\`marker\`), label, type, and current value.`,
  {},
  async () => {
    const url = await resolveBaseUrl();
    const data = await apiFetch(url, '/api/tweaks');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'get_server_info',
  `Get the running Design Bridge server's root directory and key paths.
  Call this first when creating a tweak — it tells you where to write script files.

  Returns: { port, root, scriptsDir, annotationsDir }
  - root: the project root the server is watching
  - scriptsDir: write {scriptId}.mjs files here BEFORE calling upsert_annotation
  - annotationsDir: where annotation JSON files are persisted`,
  {},
  async () => {
    const url = await resolveBaseUrl();
    const data = await apiFetch(url, '/health');
    const root = data.root ?? '';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              port: data.port,
              root,
              scriptsDir: `${root}/.design-bridge/scripts`,
              annotationsDir: `${root}/.design-bridge/annotations`,
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
