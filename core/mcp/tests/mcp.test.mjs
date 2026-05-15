/**
 * MCP server tests — uses Node.js built-in test runner.
 *
 * Each test spawns the Design Bridge server on port 7383 (beforeAll), writes
 * its port to a .design-bridge/.port file, then talks to the MCP stdio server
 * by spawning it as a child process and sending JSON-RPC 2.0 messages over
 * stdin/stdout.
 *
 * Run:  node --test tests/mcp.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolveBaseUrl } from '../resolve-url.mjs';

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
  throw new Error('Design Bridge server did not start in time');
}

before(async () => {
  await rm(TEST_ROOT, { recursive: true, force: true });
  await mkdir(TEST_ROOT, { recursive: true });

  serverProc = spawn(process.execPath, [SERVER_BIN, '--root', TEST_ROOT], {
    env: { ...process.env, DESIGN_BRIDGE_PORT: String(TEST_PORT) },
    stdio: 'pipe',
  });

  serverProc.stderr.on('data', () => { });
  serverProc.stdout.on('data', () => { });

  await waitForServer();

  // The server writes the port file itself, but write a fallback to confirm
  // the MCP discovery path works independently too.
  const portFileDir = resolve(TEST_ROOT, '.design-bridge');
  await mkdir(portFileDir, { recursive: true });
  await writeFile(resolve(portFileDir, '.port'), String(TEST_PORT), 'utf-8');
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
      env: {
        ...process.env,
        DESIGN_BRIDGE_ROOT: TEST_ROOT,
        // suppress MCP SDK internal logs that go to stderr
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const responses = [];
    let buf = '';

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
    });

    proc.on('error', reject);

    const send = (obj) => {
      proc.stdin.write(JSON.stringify(obj) + '\n');
    };

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

    // Give server time to respond then collect
    setTimeout(() => {
      proc.kill();
      resolve(responses);
    }, 3_000);
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
    assert.equal(init.result?.serverInfo?.name, 'design-bridge');
    assert.ok(init.result?.capabilities?.tools, 'tools capability missing');
    assert.ok(init.result?.capabilities?.resources, 'resources capability missing');
  });
});

describe('MCP tools/list', () => {
  it('returns all 8 tools', async () => {
    const responses = await mcpCall('tools/list', {});
    const res = findResponse(responses, 2);
    assert.ok(res?.result?.tools, 'tools missing');
    const names = res.result.tools.map((t) => t.name);
    const expected = [
      'list_comments',
      'get_comment',
      'create_comment',
      'reply_to_comment',
      'update_own_comment',
      'close_tweak',
      'get_tweaks',
      'get_server_info',
    ];
    for (const name of expected) {
      assert.ok(names.includes(name), `tool "${name}" missing`);
    }
    assert.equal(names.length, 8);
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
    assert.ok(uris.includes('design-bridge://guide/workflow'), 'workflow guide missing');
  });

  it('includes the write-scripts guide resource', async () => {
    const responses = await mcpCall('resources/list', {});
    const res = findResponse(responses, 2);
    const uris = res.result.resources.map((r) => r.uri);
    assert.ok(uris.includes('design-bridge://guide/write-scripts'), 'write-scripts guide missing');
  });
});

describe('MCP resources/read', () => {
  it('returns markdown content for the workflow guide', async () => {
    const responses = await mcpCall('resources/read', {
      uri: 'design-bridge://guide/workflow',
    });
    const res = findResponse(responses, 2);
    const text = res?.result?.contents?.[0]?.text;
    assert.ok(typeof text === 'string' && text.length > 0, 'guide content empty');
    assert.ok(text.includes('tweak'), 'guide should mention "tweak"');
  });

  it('returns markdown content for the write-scripts guide', async () => {
    const responses = await mcpCall('resources/read', {
      uri: 'design-bridge://guide/write-scripts',
    });
    const res = findResponse(responses, 2);
    const text = res?.result?.contents?.[0]?.text;
    assert.ok(typeof text === 'string' && text.length > 0, 'guide content empty');
    assert.ok(text.includes('export default'), 'guide should show export default pattern');
  });
});

describe('MCP tools/call — list_comments', () => {
  it('returns an array', async () => {
    const responses = await mcpCall('tools/call', {
      name: 'list_comments',
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
  const ANN_ID_PREFIX = 'mcp-create-test';

  it('creates an agent-authored comment', async () => {
    const responses = await mcpCall('tools/call', {
      name: 'create_comment',
      arguments: {
        selectors: ['h1'],
        labels: ['h1'],
        comment: 'Agent created this thread',
        pageUrl: 'http://localhost:5173/',
      },
    });
    const res = findResponse(responses, 2);
    assert.ok(!res?.error, `error: ${JSON.stringify(res?.error)}`);

    // Verify at least one agent-authored comment exists
    const httpRes = await fetch(`${BASE_URL}/api/comments`);
    const body = await httpRes.json();
    const agentComments = body.comments.filter((c) => c.author === 'agent');
    assert.ok(agentComments.length > 0, 'no agent-authored comments found');
    const created = agentComments.find((c) => c.comment === 'Agent created this thread');
    assert.ok(created, 'created comment not found');
    assert.equal(created.author, 'agent');
    assert.ok(Array.isArray(created.replies) && created.replies.length > 0, 'missing initial reply');
    assert.equal(created.replies[0].author, 'agent');

    // Cleanup
    await fetch(`${BASE_URL}/api/comments/${created.id}`, { method: 'DELETE' });
  });

  it('creates an agent comment with a knob (tweakStatus = pending)', async () => {
    const responses = await mcpCall('tools/call', {
      name: 'create_comment',
      arguments: {
        selectors: ['h1'],
        labels: ['h1'],
        comment: 'Try this tweak',
        pageUrl: 'http://localhost:5173/',
        knob: { label: 'Variant', type: 'select', value: 'A', options: { A: 'A', B: 'B' } },
        actions: [{ type: 'content-edit', file: 'src/App.vue', scriptId: 'test-variant' }],
      },
    });
    const res = findResponse(responses, 2);
    assert.ok(!res?.error, `error: ${JSON.stringify(res?.error)}`);

    const httpRes = await fetch(`${BASE_URL}/api/comments`);
    const body = await httpRes.json();
    const created = body.comments.find(
      (c) => c.author === 'agent' && c.comment === 'Try this tweak',
    );
    assert.ok(created, 'tweak comment not found');
    assert.equal(created.tweakStatus, 'pending');
    assert.ok(created.knob, 'knob missing');

    await fetch(`${BASE_URL}/api/comments/${created.id}`, { method: 'DELETE' });
  });
});

describe('MCP tools/call — reply_to_comment', () => {
  let parentId;

  before(async () => {
    // Create a parent comment via HTTP to reply to
    const now = Date.now();
    parentId = `mcp-reply-parent-${now}`;
    const ann = {
      id: parentId,
      selectors: ['p'],
      labels: ['p'],
      comment: 'User comment needing response',
      author: 'user',
      pageUrl: 'http://localhost:5173/',
      timestamp: now,
      createdAt: now,
      replies: [{ id: `${parentId}-root`, type: 'comment', text: 'User comment needing response', createdAt: now, author: 'user' }],
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

    const httpRes = await fetch(`${BASE_URL}/api/comments/${parentId}`);
    const body = await httpRes.json();
    const agentReply = body.replies?.find((r) => r.author === 'agent');
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

    const httpRes = await fetch(`${BASE_URL}/api/comments/${parentId}`);
    const body = await httpRes.json();
    assert.equal(body.tweakStatus, 'pending', 'tweakStatus should be pending');
    assert.ok(body.knob, 'knob should be set');
    assert.equal(body.knob.label, 'Color');
  });
});

describe('MCP tools/call — update_own_comment', () => {
  let agentCommentId;
  let userCommentId;

  before(async () => {
    const now = Date.now();
    agentCommentId = `mcp-agent-own-${now}`;
    userCommentId = `mcp-user-other-${now}`;

    await fetch(`${BASE_URL}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: agentCommentId, selectors: ['h1'], labels: ['h1'], comment: 'Original agent text',
        author: 'agent', pageUrl: 'http://localhost:5173/', timestamp: now, createdAt: now, replies: [],
      }),
    });
    await fetch(`${BASE_URL}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: userCommentId, selectors: ['p'], labels: ['p'], comment: 'User comment',
        author: 'user', pageUrl: 'http://localhost:5173/', timestamp: now, createdAt: now, replies: [],
      }),
    });
  });

  after(async () => {
    await fetch(`${BASE_URL}/api/comments/${agentCommentId}`, { method: 'DELETE' });
    await fetch(`${BASE_URL}/api/comments/${userCommentId}`, { method: 'DELETE' });
  });

  it('updates an agent-authored comment text', async () => {
    const responses = await mcpCall('tools/call', {
      name: 'update_own_comment',
      arguments: { id: agentCommentId, comment: 'Updated agent text' },
    });
    const res = findResponse(responses, 2);
    assert.ok(!res?.error, `error: ${JSON.stringify(res?.error)}`);

    const httpRes = await fetch(`${BASE_URL}/api/comments/${agentCommentId}`);
    const body = await httpRes.json();
    assert.equal(body.comment, 'Updated agent text');
  });

  it('refuses to update a user-authored comment', async () => {
    const responses = await mcpCall('tools/call', {
      name: 'update_own_comment',
      arguments: { id: userCommentId, comment: 'Attempted hijack' },
    });
    const res = findResponse(responses, 2);
    // Should return an error
    assert.ok(
      res?.error || res?.result?.isError,
      'expected an error when updating user comment',
    );
  });
});

describe('MCP tools/call — get_comment (backward compat)', () => {
  const ANN_ID = 'mcp-getcomment-test';

  before(async () => {
    const now = Date.now();
    await fetch(`${BASE_URL}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: ANN_ID, selectors: ['h1'], labels: ['h1'], comment: 'MCP test comment',
        pageUrl: 'http://localhost:5173/', timestamp: now, createdAt: now, replies: [],
      }),
    });
  });

  after(async () => {
    await fetch(`${BASE_URL}/api/comments/${ANN_ID}`, { method: 'DELETE' });
  });

  it('gets the comment via get_comment', async () => {
    const responses = await mcpCall('tools/call', {
      name: 'get_comment',
      arguments: { id: ANN_ID },
    });
    const res = findResponse(responses, 2);
    const text = res?.result?.content?.[0]?.text;
    const parsed = JSON.parse(text);
    assert.equal(parsed.id, ANN_ID);
    assert.equal(parsed.comment, 'MCP test comment');
  });
});

describe('MCP tools/call — get_server_info + get_tweaks', () => {
  const ANN_ID = 'mcp-tweak-comment';

  it('get_server_info returns port, root, scriptsDir, commentsDir', async () => {
    const responses = await mcpCall('tools/call', {
      name: 'get_server_info',
      arguments: {},
    });
    const res = findResponse(responses, 2);
    assert.ok(!res?.error, `error: ${JSON.stringify(res?.error)}`);
    const body = JSON.parse(res?.result?.content?.[0]?.text);
    assert.ok(typeof body.port === 'number', 'port should be a number');
    assert.ok(typeof body.root === 'string', 'root should be a string');
    assert.ok(body.scriptsDir.includes('.design-bridge/scripts'), 'scriptsDir incorrect');
    assert.ok(body.commentsDir.includes('.design-bridge/comments'), 'commentsDir incorrect');
  });

  it('upserts a tweak comment and it appears in get_tweaks', async () => {
    const ann = {
      id: ANN_ID,
      selectors: ['h1'],
      labels: ['h1'],
      comment: 'Icon tweak',
      pageUrl: 'http://localhost:5173/',
      timestamp: Date.now(),
      createdAt: Date.now(),
      replies: [],
      knob: {
        label: 'Feature icon',
        type: 'select',
        value: '🎨',
        options: { Palette: '🎨', Fire: '🔥' },
      },
      actions: [
        {
          type: 'content-edit',
          file: 'src/components/FeaturesSection.vue',
          scriptId: 'mcp-icon-script',
        },
      ],
    };

    // Upsert via HTTP directly for simplicity (comment creation already tested above)
    const httpRes = await fetch(`${BASE_URL}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ann),
    });
    assert.equal(httpRes.status, 200);

    const responses = await mcpCall('tools/call', {
      name: 'get_tweaks',
      arguments: {},
    });
    const res = findResponse(responses, 2);
    const body = JSON.parse(res?.result?.content?.[0]?.text);
    const knob = body.knobs.find((k) => k.marker === ANN_ID);
    assert.ok(knob, 'knob not found in schema');
    assert.equal(knob.value, '🎨');
  });

  it('cleans up the tweak comment', async () => {
    const httpRes = await fetch(`${BASE_URL}/api/comments/${ANN_ID}`, { method: 'DELETE' });
    assert.ok(httpRes.status === 200 || httpRes.status === 204 || httpRes.status === 404);
  });
});

// ── Port discovery unit tests ─────────────────────────────────────────────────

describe('resolveBaseUrl — port discovery', () => {
  it('uses DESIGN_BRIDGE_URL when set', async () => {
    const url = await resolveBaseUrl({ DESIGN_BRIDGE_URL: 'http://localhost:9999' });
    assert.equal(url, 'http://localhost:9999');
  });

  it('strips trailing slash from DESIGN_BRIDGE_URL', async () => {
    const url = await resolveBaseUrl({ DESIGN_BRIDGE_URL: 'http://localhost:9999/' });
    assert.equal(url, 'http://localhost:9999');
  });

  it('uses DESIGN_BRIDGE_PORT when set', async () => {
    const url = await resolveBaseUrl({ DESIGN_BRIDGE_PORT: '8888' });
    assert.equal(url, 'http://localhost:8888');
  });

  it('DESIGN_BRIDGE_URL takes precedence over DESIGN_BRIDGE_PORT', async () => {
    const url = await resolveBaseUrl({
      DESIGN_BRIDGE_URL: 'http://localhost:9999',
      DESIGN_BRIDGE_PORT: '8888',
    });
    assert.equal(url, 'http://localhost:9999');
  });

  it('reads the .port file from DESIGN_BRIDGE_ROOT', async () => {
    const url = await resolveBaseUrl({ DESIGN_BRIDGE_ROOT: TEST_ROOT });
    assert.equal(url, `http://localhost:${TEST_PORT}`);
  });

  it('walks up the directory tree to find a .port file', async () => {
    // Create a subdirectory two levels deep inside TEST_ROOT with no .port file
    const subDir = resolve(TEST_ROOT, 'src', 'components');
    await mkdir(subDir, { recursive: true });
    // Pass the subdirectory as cwd with no DESIGN_BRIDGE_ROOT set
    const url = await resolveBaseUrl({}, subDir);
    assert.equal(url, `http://localhost:${TEST_PORT}`);
  });

  it('falls back to default URL when no discovery method succeeds', async () => {
    // Use os.tmpdir() as cwd — it is guaranteed to have no .design-bridge/.port
    // file anywhere in its ancestry.
    const url = await resolveBaseUrl({}, tmpdir());
    assert.equal(url, 'http://localhost:7378');
  });
});

// ── Integration: MCP uses .port file to reach the server ─────────────────────

describe('Port discovery integration — MCP server finds Design Bridge via .port file', () => {
  it('list_comments succeeds when discovered via DESIGN_BRIDGE_ROOT (port file)', async () => {
    // mcpCall already uses DESIGN_BRIDGE_ROOT=TEST_ROOT; the .port file was written
    // by the server on startup. This test explicitly verifies the end-to-end path.
    const responses = await mcpCall('tools/call', {
      name: 'list_comments',
      arguments: {},
    });
    const res = findResponse(responses, 2);
    assert.ok(!res?.error, `unexpected error: ${JSON.stringify(res?.error)}`);
    const body = JSON.parse(res.result.content[0].text);
    assert.ok(Array.isArray(body.comments), 'expected comments array from discovered server');
  });

  it('list_comments succeeds when discovered via DESIGN_BRIDGE_PORT env var', async () => {
    const proc = spawn(process.execPath, [MCP_BIN], {
      env: { ...process.env, DESIGN_BRIDGE_PORT: String(TEST_PORT) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const responses = [];
    let buf = '';
    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (t) {
          try {
            responses.push(JSON.parse(t));
          } catch {
            /* ignore */
          }
        }
      }
    });
    proc.stderr.on('data', () => { });

    const send = (obj) => proc.stdin.write(JSON.stringify(obj) + '\n');
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'list_comments', arguments: {} },
    });

    await new Promise((r) => setTimeout(r, 3_000));
    proc.kill();

    const res = responses.find((r) => r.id === 2);
    assert.ok(!res?.error, `unexpected error: ${JSON.stringify(res?.error)}`);
    const body = JSON.parse(res.result.content[0].text);
    assert.ok(Array.isArray(body.comments), 'expected comments array');
  });

  it('list_comments succeeds when discovered via DESIGN_BRIDGE_URL env var', async () => {
    const proc = spawn(process.execPath, [MCP_BIN], {
      env: { ...process.env, DESIGN_BRIDGE_URL: BASE_URL },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const responses = [];
    let buf = '';
    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (t) {
          try {
            responses.push(JSON.parse(t));
          } catch {
            /* ignore */
          }
        }
      }
    });
    proc.stderr.on('data', () => { });

    const send = (obj) => proc.stdin.write(JSON.stringify(obj) + '\n');
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'list_comments', arguments: {} },
    });

    await new Promise((r) => setTimeout(r, 3_000));
    proc.kill();

    const res = responses.find((r) => r.id === 2);
    assert.ok(!res?.error, `unexpected error: ${JSON.stringify(res?.error)}`);
    const body = JSON.parse(res.result.content[0].text);
    assert.ok(Array.isArray(body.comments), 'expected comments array');
  });
});
