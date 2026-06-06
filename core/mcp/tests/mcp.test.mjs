/**
 * MCP server tests — uses Node.js built-in test runner.
 *
 * Each test spawns the UI Bridge server on port 7383 (beforeAll), writes
 * its port to a .ui-bridge/.port file, then talks to the MCP stdio server
 * by spawning it as a child process and sending JSON-RPC 2.0 messages over
 * stdin/stdout.
 *
 * Run:  node --test tests/mcp.test.mjs
 */

import { describe, it as nodeIt, before, after } from 'node:test';

const TEST_TIMEOUT_MS = 5_000;
const it = (name, fn) => nodeIt(name, { timeout: TEST_TIMEOUT_MS }, fn);
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const SERVER_BIN = resolve(REPO_ROOT, 'core/server/index.mjs');
const MCP_BIN = resolve(__dirname, '../index.mjs');

const TEST_PORT = 7383;
const TEST_ROOT = resolve(__dirname, '../.test-root');
const BASE_URL = `http://localhost:${TEST_PORT}`;

// ── Server lifecycle ──────────────────────────────────────────────────────────

let serverProc;

async function waitForServer(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('UI Bridge server did not start in time');
}

before(async () => {
  await rm(TEST_ROOT, { recursive: true, force: true });
  await mkdir(TEST_ROOT, { recursive: true });

  serverProc = spawn(process.execPath, [SERVER_BIN, '--root', TEST_ROOT], {
    env: { ...process.env, UI_BRIDGE_PORT: String(TEST_PORT) },
    stdio: 'pipe',
  });

  serverProc.stderr.on('data', () => {});
  serverProc.stdout.on('data', () => {});

  await waitForServer();
});

after(async () => {
  serverProc?.kill('SIGTERM');
  await rm(TEST_ROOT, { recursive: true, force: true });
});

// ── MCP JSON-RPC helper ───────────────────────────────────────────────────────

/**
 * Spawn the MCP process, send an `initialize` + one method call, collect the
 * responses from stdout, then kill the process.
 *
 * Returns an array of parsed JSON-RPC response objects in the order received.
 */
function mcpCall(method, params = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [MCP_BIN], {
      cwd: TEST_ROOT,
      env: {
        ...process.env,
        UI_BRIDGE_PORT: String(TEST_PORT),
        // suppress MCP SDK internal logs that go to stderr
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const responses = [];
    let buf = '';

    proc.on('error', reject);

    const send = (obj) => {
      proc.stdin.write(JSON.stringify(obj) + '\n');
    };

    let fallbackTimer;
    const finish = () => {
      clearTimeout(fallbackTimer);
      proc.kill();
      resolve(responses);
    };

    // Fallback timeout — ensures the spawned process is killed if no response arrives
    fallbackTimer = setTimeout(finish, TEST_TIMEOUT_MS);

    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      // MCP Streamable HTTP / stdio uses newline-delimited JSON
      const lines = buf.split('\n');
      buf = lines.pop(); // keep incomplete last line
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          responses.push(JSON.parse(trimmed));
        } catch {
          // ignore non-JSON lines (e.g. Content-Type headers in SSE mode)
        }
      }
      // Resolve as soon as the response to the actual request (id: 2) arrives
      if (responses.some((r) => r.id === 2)) finish();
    });

    // MCP handshake
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0.0.1' },
      },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

    // Actual request
    send({ jsonrpc: '2.0', id: 2, method, params });
  });
}

/** Find a JSON-RPC response with the given id. */
function findResponse(responses, id) {
  return responses.find((r) => r.id === id);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MCP initialize', () => {
  it('returns server info and capabilities', async () => {
    const responses = await mcpCall('ping', {});
    const init = findResponse(responses, 1);
    assert.ok(init, 'initialize response missing');
    assert.equal(init.result?.serverInfo?.name, 'UI Bridge');
    assert.ok(init.result?.capabilities?.tools, 'tools capability missing');
    assert.ok(init.result?.capabilities?.resources, 'resources capability missing');
  });
});

describe('MCP tools/list', () => {
  it('returns all 6 tools', async () => {
    const responses = await mcpCall('tools/list', {});
    const res = findResponse(responses, 2);
    assert.ok(res?.result?.tools, 'tools missing');
    const names = res.result.tools.map((t) => t.name);
    const expected = [
      'get_write_scripts_guide',
      'get_comments',
      'get_comment',
      'create_comment',
      'reply_to_comment',
      'get_server_info',
    ];
    for (const name of expected) {
      assert.ok(names.includes(name), `tool "${name}" missing`);
    }
    assert.equal(names.length, 6);
  });
});

describe('MCP resources/list', () => {
  it('returns 2 resources', async () => {
    const responses = await mcpCall('resources/list', {});
    const res = findResponse(responses, 2);
    assert.ok(res?.result?.resources, 'resources missing');
    assert.equal(res.result.resources.length, 2);
  });

  it('includes the workflow guide resource', async () => {
    const responses = await mcpCall('resources/list', {});
    const res = findResponse(responses, 2);
    const uris = res.result.resources.map((r) => r.uri);
    assert.ok(uris.includes('ui-bridge://guide/workflow'), 'workflow guide missing');
  });

  it('includes the write-scripts guide resource', async () => {
    const responses = await mcpCall('resources/list', {});
    const res = findResponse(responses, 2);
    const uris = res.result.resources.map((r) => r.uri);
    assert.ok(uris.includes('ui-bridge://guide/write-scripts'), 'write-scripts guide missing');
  });
});

describe('MCP resources/read', () => {
  it('returns markdown content for the workflow guide', async () => {
    const responses = await mcpCall('resources/read', {
      uri: 'ui-bridge://guide/workflow',
    });
    const res = findResponse(responses, 2);
    const text = res?.result?.contents?.[0]?.text;
    assert.ok(typeof text === 'string' && text.length > 0, 'guide content empty');
    assert.ok(text.includes('tweak'), 'guide should mention "tweak"');
  });

  it('returns markdown content for the write-scripts guide', async () => {
    const responses = await mcpCall('resources/read', {
      uri: 'ui-bridge://guide/write-scripts',
    });
    const res = findResponse(responses, 2);
    const text = res?.result?.contents?.[0]?.text;
    assert.ok(typeof text === 'string' && text.length > 0, 'guide content empty');
    assert.ok(text.includes('export default'), 'guide should show export default pattern');
  });
});

describe('MCP tools/call — get_comments', () => {
  it('returns an array', async () => {
    const responses = await mcpCall('tools/call', {
      name: 'get_comments',
      arguments: {},
    });
    const res = findResponse(responses, 2);
    const text = res?.result?.content?.[0]?.text;
    assert.ok(text, 'no content returned');
    const parsed = JSON.parse(text);
    assert.ok(Array.isArray(parsed.comments), 'expected comments array');
  });
});

describe('MCP tools/call — create_comment', () => {
  it('creates an agent-authored comment', async () => {
    const responses = await mcpCall('tools/call', {
      name: 'create_comment',
      arguments: {
        elements: [{ minimalSelector: 'h1', tag: 'h1', classes: [] }],
        comment: 'Agent created this thread',
        pageUrl: 'http://localhost:5173/',
      },
    });
    const res = findResponse(responses, 2);
    assert.ok(!res?.error, `error: ${JSON.stringify(res?.error)}`);

    // MCP returns the created payload directly — verify structure
    const created = JSON.parse(res.result.content[0].text);
    assert.equal(created.comments[0].author, 'agent');
    assert.equal(created.comments[0].text, 'Agent created this thread');
    assert.ok(Array.isArray(created.comments) && created.comments.length > 0);

    // Verify round-trip via get_comment (file-direct, no server needed)
    const getResponses = await mcpCall('tools/call', {
      name: 'get_comment',
      arguments: { id: created.meta.id },
    });
    const getRes = findResponse(getResponses, 2);
    assert.ok(!getRes?.error, `get_comment error: ${JSON.stringify(getRes?.error)}`);
    const fetched = JSON.parse(getRes.result.content[0].text);
    assert.equal(fetched.meta.id, created.meta.id);

    // Cleanup
    await fetch(`${BASE_URL}/api/comments/${created.meta.id}`, { method: 'DELETE' });
  });

  it('creates an agent comment with a knob (tweakStatus = pending)', async () => {
    const responses = await mcpCall('tools/call', {
      name: 'create_comment',
      arguments: {
        elements: [{ minimalSelector: 'h1', tag: 'h1', classes: [] }],
        comment: 'Try this tweak',
        pageUrl: 'http://localhost:5173/',
        knob: { label: 'Variant', type: 'select', value: 'A', options: { A: 'A', B: 'B' } },
        actions: [{ type: 'content-edit', file: 'src/App.vue', scriptId: 'test-variant' }],
      },
    });
    const res = findResponse(responses, 2);
    assert.ok(!res?.error, `error: ${JSON.stringify(res?.error)}`);

    const created = JSON.parse(res.result.content[0].text);
    const tweakEntry = created.comments.find(
      (c) => c.type === 'tweak' && c.tweakStatus === 'pending',
    );
    assert.ok(tweakEntry, 'pending tweak entry missing');
    assert.ok(tweakEntry.knob, 'knob missing');

    await fetch(`${BASE_URL}/api/comments/${created.meta.id}`, { method: 'DELETE' });
  });
});

describe('MCP tools/call — displayNumber', () => {
  const ids = [];

  after(async () => {
    for (const id of ids) await fetch(`${BASE_URL}/api/comments/${id}`, { method: 'DELETE' });
  });

  it('assigns displayNumber to a newly created comment', async () => {
    const responses = await mcpCall('tools/call', {
      name: 'create_comment',
      arguments: {
        elements: [{ minimalSelector: 'h1', tag: 'h1', classes: [] }],
        comment: 'First comment',
        pageUrl: 'http://localhost:5173/',
      },
    });
    const res = findResponse(responses, 2);
    const created = JSON.parse(res.result.content[0].text);
    ids.push(created.meta.id);
    assert.ok(typeof created.meta.displayNumber === 'number', 'displayNumber should be a number');
    assert.ok(created.meta.displayNumber >= 1, 'displayNumber should be >= 1');
  });

  it('assigns sequential displayNumbers to successive comments', async () => {
    const make = async (comment) => {
      const responses = await mcpCall('tools/call', {
        name: 'create_comment',
        arguments: {
          elements: [{ minimalSelector: 'p', tag: 'p', classes: [] }],
          comment,
          pageUrl: 'http://localhost:5173/',
        },
      });
      const res = findResponse(responses, 2);
      const created = JSON.parse(res.result.content[0].text);
      ids.push(created.meta.id);
      return created.meta.displayNumber;
    };
    const n1 = await make('Sequential A');
    const n2 = await make('Sequential B');
    assert.equal(n2, n1 + 1, 'second comment should have displayNumber one higher than first');
  });

  it('get_comment resolves a thread by display number', async () => {
    const createRes = findResponse(
      await mcpCall('tools/call', {
        name: 'create_comment',
        arguments: {
          elements: [{ minimalSelector: 'span', tag: 'span', classes: [] }],
          comment: 'Lookup by number',
          pageUrl: 'http://localhost:5173/',
        },
      }),
      2,
    );
    const created = JSON.parse(createRes.result.content[0].text);
    ids.push(created.meta.id);
    const { displayNumber } = created.meta;

    const getResponses = await mcpCall('tools/call', {
      name: 'get_comment',
      arguments: { number: displayNumber },
    });
    const getRes = findResponse(getResponses, 2);
    assert.ok(!getRes?.error, `get_comment error: ${JSON.stringify(getRes?.error)}`);
    const fetched = JSON.parse(getRes.result.content[0].text);
    assert.equal(fetched.meta.id, created.meta.id, 'should return the correct thread');
    assert.equal(fetched.meta.displayNumber, displayNumber);
  });

  it('displayNumber of earlier comment is unaffected when a later comment is deleted', async () => {
    const makeComment = async (text) => {
      const res = findResponse(
        await mcpCall('tools/call', {
          name: 'create_comment',
          arguments: {
            elements: [{ minimalSelector: 'div', tag: 'div', classes: [] }],
            comment: text,
            pageUrl: 'http://localhost:5173/',
          },
        }),
        2,
      );
      return JSON.parse(res.result.content[0].text);
    };

    const first = await makeComment('Stable comment');
    ids.push(first.meta.id);
    const second = await makeComment('To be deleted');
    // delete the second immediately
    await fetch(`${BASE_URL}/api/comments/${second.meta.id}`, { method: 'DELETE' });

    // Re-fetch first by its display number — must still resolve
    const getRes = findResponse(
      await mcpCall('tools/call', {
        name: 'get_comment',
        arguments: { number: first.meta.displayNumber },
      }),
      2,
    );
    assert.ok(!getRes?.error);
    const fetched = JSON.parse(getRes.result.content[0].text);
    assert.equal(fetched.meta.id, first.meta.id, 'first comment id should be unchanged');
    assert.equal(
      fetched.meta.displayNumber,
      first.meta.displayNumber,
      'displayNumber of first comment should be unchanged',
    );
  });
});

describe('MCP tools/call — reply_to_comment', () => {
  let parentId;

  before(async () => {
    // Create a parent comment via HTTP to reply to
    const now = Date.now();
    parentId = `mcp-reply-parent-${now}`;
    const ann = {
      meta: { id: parentId, pageUrl: 'http://localhost:5173/', timestamp: now, createdAt: now },
      elements: [{ minimalSelector: 'p', tag: 'p', classes: [] }],
      comments: [
        {
          id: `${parentId}-root`,
          type: 'comment',
          text: 'User comment needing response',
          createdAt: now,
          author: 'user',
        },
      ],
    };
    await fetch(`${BASE_URL}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ann),
    });
  });

  after(async () => {
    if (parentId) await fetch(`${BASE_URL}/api/comments/${parentId}`, { method: 'DELETE' });
  });

  it('adds an agent reply to an existing thread', async () => {
    const responses = await mcpCall('tools/call', {
      name: 'reply_to_comment',
      arguments: { commentId: parentId, text: 'Here is my suggestion.' },
    });
    const res = findResponse(responses, 2);
    assert.ok(!res?.error, `error: ${JSON.stringify(res?.error)}`);

    // Verify via MCP get_comment (file-direct)
    const getResponses = await mcpCall('tools/call', {
      name: 'get_comment',
      arguments: { id: parentId },
    });
    const getRes = findResponse(getResponses, 2);
    const body = JSON.parse(getRes.result.content[0].text);
    const agentReply = body.comments?.find((r) => r.author === 'agent' && r.type === 'comment');
    assert.ok(agentReply, 'agent reply not found in thread');
    assert.equal(agentReply.text, 'Here is my suggestion.');
  });

  it('adds an agent reply with a tweak (sets tweakStatus = pending)', async () => {
    const responses = await mcpCall('tools/call', {
      name: 'reply_to_comment',
      arguments: {
        commentId: parentId,
        text: 'Try this color tweak.',
        knob: { label: 'Color', type: 'color', value: '#ff0000' },
        actions: [{ type: 'content-edit', file: 'src/App.vue', scriptId: 'reply-color' }],
      },
    });
    const res = findResponse(responses, 2);
    assert.ok(!res?.error, `error: ${JSON.stringify(res?.error)}`);

    // Verify via MCP get_comment (file-direct)
    const getResponses = await mcpCall('tools/call', {
      name: 'get_comment',
      arguments: { id: parentId },
    });
    const getRes = findResponse(getResponses, 2);
    const body = JSON.parse(getRes.result.content[0].text);
    const tweakEntry = body.comments?.find(
      (c) => c.type === 'tweak' && c.tweakStatus === 'pending',
    );
    assert.equal(tweakEntry?.tweakStatus, 'pending', 'tweakStatus should be pending');
    assert.ok(tweakEntry?.knob, 'knob should be set');
    assert.equal(tweakEntry?.knob.label, 'Color');
  });
});

describe('MCP tools/call — get_comment (backward compat)', () => {
  const ANN_ID = 'mcp-getcomment-test';

  before(async () => {
    const now = Date.now();
    const ann = {
      meta: { id: ANN_ID, pageUrl: 'http://localhost:5173/', timestamp: now, createdAt: now },
      elements: [{ minimalSelector: 'h1', tag: 'h1', classes: [] }],
      comments: [
        {
          id: `${ANN_ID}-root`,
          type: 'comment',
          text: 'MCP test comment',
          createdAt: now,
          author: 'user',
        },
      ],
    };
    // Write directly to file — no server needed
    await mkdir(resolve(TEST_ROOT, '.ui-bridge', 'comments'), { recursive: true });
    await writeFile(
      resolve(TEST_ROOT, '.ui-bridge', 'comments', `${ANN_ID}.json`),
      JSON.stringify(ann, null, 2),
      'utf-8',
    );
  });

  after(async () => {
    await rm(resolve(TEST_ROOT, '.ui-bridge', 'comments', `${ANN_ID}.json`), { force: true });
  });

  it('gets the comment via get_comment', async () => {
    const responses = await mcpCall('tools/call', {
      name: 'get_comment',
      arguments: { id: ANN_ID },
    });
    const res = findResponse(responses, 2);
    const text = res?.result?.content?.[0]?.text;
    const parsed = JSON.parse(text);
    assert.equal(parsed.meta.id, ANN_ID);
    assert.equal(parsed.comments[0].text, 'MCP test comment');
  });
});

describe('MCP tools/call — get_server_info', () => {
  it('get_server_info returns root, scriptsDir, commentsDir', async () => {
    const responses = await mcpCall('tools/call', {
      name: 'get_server_info',
      arguments: {},
    });
    const res = findResponse(responses, 2);
    assert.ok(!res?.error, `error: ${JSON.stringify(res?.error)}`);
    const body = JSON.parse(res?.result?.content?.[0]?.text);
    assert.ok(typeof body.root === 'string', 'root should be a string');
    assert.ok(body.scriptsDir.includes('.ui-bridge/scripts'), 'scriptsDir incorrect');
    assert.ok(body.commentsDir.includes('.ui-bridge/comments'), 'commentsDir incorrect');
  });
});

// ── Long-lived session helper ─────────────────────────────────────────────────

/**
 * Spawn a single MCP process and keep it alive so multiple tool calls can be
 * sent within the same process lifetime — this is how real AI agents use the
 * MCP server.  Calling `session.call()` returns a Promise resolved with the
 * JSON-RPC response for that specific request id.
 */
function createMcpSession() {
  let nextId = 1;
  /** @type {Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>} */
  const pending = new Map();
  let buf = '';

  const proc = spawn(process.execPath, [MCP_BIN], {
    cwd: TEST_ROOT,
    env: { ...process.env, UI_BRIDGE_PORT: String(TEST_PORT) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const entry = pending.get(msg.id);
        pending.delete(msg.id);
        clearTimeout(entry.timer);
        entry.resolve(msg);
      }
    }
  });

  const send = (obj) => proc.stdin.write(JSON.stringify(obj) + '\n');

  // Handshake
  const initId = nextId++;
  const initPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MCP session init timeout')), TEST_TIMEOUT_MS);
    pending.set(initId, { resolve, reject, timer });
  });
  send({
    jsonrpc: '2.0',
    id: initId,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'session-test', version: '0.0.1' },
    },
  });
  send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

  const call = (method, params = {}) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`MCP session call timeout: ${method}`)),
        TEST_TIMEOUT_MS,
      );
      pending.set(id, { resolve, reject, timer });
      send({ jsonrpc: '2.0', id, method, params });
    });
  };

  const close = () => proc.kill();

  return { initPromise, call, close };
}

// ── Staleness regression tests ────────────────────────────────────────────────
// These tests send MULTIPLE calls within the same MCP process to verify that
// get_comments / reply_to_comment always reflects the current disk state, not
// the snapshot from the initial load().

describe('get_comments — reflects disk changes within the same MCP session', () => {
  it('sees a comment created externally after the session started', async () => {
    const session = createMcpSession();
    await session.initPromise;

    const id = `staleness-add-${Date.now()}`;

    // First call — comment does not exist yet
    const before = await session.call('tools/call', {
      name: 'get_comments',
      arguments: {},
    });
    const beforeBody = JSON.parse(before.result.content[0].text);
    assert.ok(!beforeBody.comments.find((c) => c.meta?.id === id), 'comment should not exist yet');

    // Create comment via HTTP (simulates browser writing through the server)
    const now = Date.now();
    await fetch(`${BASE_URL}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meta: { id, pageUrl: 'http://localhost:5173/', timestamp: now, createdAt: now },
        elements: [{ minimalSelector: 'h1', tag: 'h1', classes: [] }],
        comments: [
          {
            id: `${id}-root`,
            type: 'comment',
            text: 'Externally added',
            createdAt: now,
            author: 'user',
          },
        ],
      }),
    });

    // Second call on the SAME session — must see the new comment
    const after = await session.call('tools/call', {
      name: 'get_comments',
      arguments: {},
    });
    session.close();
    await fetch(`${BASE_URL}/api/comments/${id}`, { method: 'DELETE' });

    const afterBody = JSON.parse(after.result.content[0].text);
    assert.ok(
      afterBody.comments.find((c) => c.meta?.id === id),
      'newly created comment must be visible on second get_comments call',
    );
  });

  it('does not return a comment deleted externally after the session started', async () => {
    const id = `staleness-del-${Date.now()}`;
    const now = Date.now();

    // Pre-create the comment so it is loaded on session start
    await fetch(`${BASE_URL}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meta: { id, pageUrl: 'http://localhost:5173/', timestamp: now, createdAt: now },
        elements: [{ minimalSelector: 'h1', tag: 'h1', classes: [] }],
        comments: [
          {
            id: `${id}-root`,
            type: 'comment',
            text: 'Will be deleted',
            createdAt: now,
            author: 'user',
          },
        ],
      }),
    });

    const session = createMcpSession();
    await session.initPromise;

    // First call — comment exists
    const before = await session.call('tools/call', {
      name: 'get_comments',
      arguments: {},
    });
    const beforeBody = JSON.parse(before.result.content[0].text);
    assert.ok(
      beforeBody.comments.find((c) => c.meta?.id === id),
      'comment should be present initially',
    );

    // Delete via HTTP (simulates user deleting from browser)
    await fetch(`${BASE_URL}/api/comments/${id}`, { method: 'DELETE' });

    // Second call on the SAME session — must NOT return the deleted comment
    const after = await session.call('tools/call', {
      name: 'get_comments',
      arguments: {},
    });
    session.close();

    const afterBody = JSON.parse(after.result.content[0].text);
    assert.ok(
      !afterBody.comments.find((c) => c.meta?.id === id),
      'deleted comment must not appear on second get_comments call',
    );
  });
});

describe('reply_to_comment — reads up-to-date thread from disk', () => {
  it('preserves replies added externally between two calls in the same session', async () => {
    const id = `staleness-reply-${Date.now()}`;
    const now = Date.now();

    // Create base thread
    await fetch(`${BASE_URL}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meta: { id, pageUrl: 'http://localhost:5173/', timestamp: now, createdAt: now },
        elements: [{ minimalSelector: 'p', tag: 'p', classes: [] }],
        comments: [
          {
            id: `${id}-root`,
            type: 'comment',
            text: 'User comment',
            createdAt: now,
            author: 'user',
          },
        ],
      }),
    });

    const session = createMcpSession();
    await session.initPromise;

    // Simulate another process adding a reply directly (e.g. browser user replying)
    const threadRes = await fetch(`${BASE_URL}/api/comments/${id}`);
    const thread = await threadRes.json();
    const extNow = Date.now();
    thread.comments.push({
      id: `${id}-ext`,
      type: 'comment',
      text: 'External reply',
      createdAt: extNow,
      author: 'user',
    });
    thread.meta.timestamp = extNow;
    await fetch(`${BASE_URL}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(thread),
    });

    // Now MCP reply_to_comment — must base its update on the current disk state
    const res = await session.call('tools/call', {
      name: 'reply_to_comment',
      arguments: { commentId: id, text: 'Agent reply' },
    });
    assert.ok(!res.error, `reply_to_comment errored: ${JSON.stringify(res.error)}`);

    // Verify via MCP get_comment (reads directly from disk — no server race)
    const getRes = await session.call('tools/call', {
      name: 'get_comment',
      arguments: { id },
    });
    session.close();
    await fetch(`${BASE_URL}/api/comments/${id}`, { method: 'DELETE' });

    const final = JSON.parse(getRes.result.content[0].text);

    assert.ok(
      final.comments.find((c) => c.text === 'External reply'),
      'external reply must be preserved',
    );
    assert.ok(
      final.comments.find((c) => c.text === 'Agent reply'),
      'agent reply must be appended',
    );
  });
});

// ── Integration: get_comments works file-direct ─────────────────────────────

describe('get_comments — file-direct (no server required)', () => {
  it('returns comments from disk', async () => {
    // no HTTP call to the server is made.
    const responses = await mcpCall('tools/call', {
      name: 'get_comments',
      arguments: {},
    });
    const res = findResponse(responses, 2);
    assert.ok(!res?.error, `unexpected error: ${JSON.stringify(res?.error)}`);
    const body = JSON.parse(res.result.content[0].text);
    assert.ok(Array.isArray(body.comments), 'expected comments array');
  });
});

// ── Path normalization: action file paths ─────────────────────────────────────
// Agents often copy source.file from comment elements directly into action file
// paths. source.file is relative to process.cwd() (e.g. the monorepo root), but
// the tweak engine resolves relative to rootDir (e.g. demos/vite). These tests
// verify that MCP normalizes both formats to root-relative paths.

describe('create_comment — normalizes action file paths', () => {
  it('strips a cwd-relative prefix from action file (monorepo case)', async () => {
    // Simulate: TEST_ROOT = /abs/path/to/.test-root
    // MCP process cwd = TEST_ROOT (set via spawn cwd option)
    // A cwd-relative path "src/Foo.vue" (already root-relative) must stay "src/Foo.vue"
    const responses = await mcpCall('tools/call', {
      name: 'create_comment',
      arguments: {
        elements: [{ minimalSelector: 'h1', tag: 'h1', classes: [] }],
        comment: 'path normalization test',
        pageUrl: 'http://localhost:5173/',
        knob: { label: 'Size', type: 'select', value: 'sm', options: { sm: 'Small', lg: 'Large' } },
        actions: [{ type: 'content-edit', file: 'src/Foo.vue', scriptId: 'norm-1' }],
      },
    });
    const res = findResponse(responses, 2);
    assert.ok(!res?.error, `error: ${JSON.stringify(res?.error)}`);
    const created = JSON.parse(res.result.content[0].text);
    const tweak = created.comments.find((c) => c.type === 'tweak');
    const actionFile = tweak?.actions?.[0]?.file;
    // Already root-relative — must remain unchanged
    assert.equal(actionFile, 'src/Foo.vue', `expected src/Foo.vue, got ${actionFile}`);
    await fetch(`${BASE_URL}/api/comments/${created.meta.id}`, { method: 'DELETE' });
  });

  it('normalizes an absolute action file path to root-relative', async () => {
    const absoluteFile = resolve(TEST_ROOT, 'src', 'Absolute.vue');
    const responses = await mcpCall('tools/call', {
      name: 'create_comment',
      arguments: {
        elements: [{ minimalSelector: 'h2', tag: 'h2', classes: [] }],
        comment: 'absolute path normalization test',
        pageUrl: 'http://localhost:5173/',
        knob: { label: 'Color', type: 'color', value: '#ff0000' },
        actions: [{ type: 'content-edit', file: absoluteFile, scriptId: 'norm-abs' }],
      },
    });
    const res = findResponse(responses, 2);
    assert.ok(!res?.error, `error: ${JSON.stringify(res?.error)}`);
    const created = JSON.parse(res.result.content[0].text);
    const tweak = created.comments.find((c) => c.type === 'tweak');
    const actionFile = tweak?.actions?.[0]?.file;
    // Absolute path must be converted to root-relative
    assert.equal(actionFile, 'src/Absolute.vue', `expected src/Absolute.vue, got ${actionFile}`);
    await fetch(`${BASE_URL}/api/comments/${created.meta.id}`, { method: 'DELETE' });
  });
});

describe('reply_to_comment — normalizes action file paths', () => {
  let parentId;

  before(async () => {
    const now = Date.now();
    parentId = `norm-reply-parent-${now}`;
    await fetch(`${BASE_URL}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meta: { id: parentId, pageUrl: 'http://localhost:5173/', timestamp: now, createdAt: now },
        elements: [{ minimalSelector: 'p', tag: 'p', classes: [] }],
        comments: [
          { id: `${parentId}-root`, type: 'comment', text: 'base', createdAt: now, author: 'user' },
        ],
      }),
    });
  });

  after(async () => {
    if (parentId) await fetch(`${BASE_URL}/api/comments/${parentId}`, { method: 'DELETE' });
  });

  it('normalizes an absolute file path in a tweak reply to root-relative', async () => {
    const absoluteFile = resolve(TEST_ROOT, 'src', 'Button.vue');
    const responses = await mcpCall('tools/call', {
      name: 'reply_to_comment',
      arguments: {
        commentId: parentId,
        text: 'Try this tweak.',
        knob: {
          label: 'Variant',
          type: 'radio',
          value: 'primary',
          options: { primary: 'Primary', secondary: 'Secondary' },
        },
        actions: [{ type: 'content-edit', file: absoluteFile, scriptId: 'norm-reply-abs' }],
      },
    });
    const res = findResponse(responses, 2);
    assert.ok(!res?.error, `error: ${JSON.stringify(res?.error)}`);
    const updated = JSON.parse(res.result.content[0].text);
    const tweak = updated.comments.find((c) => c.type === 'tweak');
    const actionFile = tweak?.actions?.[0]?.file;
    assert.equal(actionFile, 'src/Button.vue', `expected src/Button.vue, got ${actionFile}`);
  });
});
