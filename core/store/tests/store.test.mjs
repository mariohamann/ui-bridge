/**
 * @ui-bridge/store unit tests — Node.js built-in test runner.
 *
 * Run:  node --test tests/store.test.mjs
 */

import { describe, it as nodeIt, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createCommentStore } from '../comment-store.mjs';
import { resolveRoot } from '../resolve-root.mjs';
import { uiBridgeDir, commentsDir, scriptsDir, filesDir, cacheDir } from '../paths.mjs';

const TEST_TIMEOUT_MS = 5_000;
const it = (name, fn) => nodeIt(name, { timeout: TEST_TIMEOUT_MS }, fn);

// ── Helpers ───────────────────────────────────────────────────────────────────

let testRoot;

function makeAnn(id, text = 'Test comment') {
  const now = Date.now();
  return {
    meta: { id, pageUrl: 'http://localhost:5173/', timestamp: now, createdAt: now },
    elements: [{ minimalSelector: 'h1', tag: 'h1', classes: [] }],
    comments: [{ id: `${id}-root`, type: 'comment', text, createdAt: now, author: 'user' }],
  };
}

// ── paths.mjs ─────────────────────────────────────────────────────────────────

describe('paths', () => {
  const root = '/project';

  it('uiBridgeDir returns .ui-bridge under root', () => {
    assert.equal(uiBridgeDir(root), '/project/.ui-bridge');
  });

  it('commentsDir returns comments subdir', () => {
    assert.equal(commentsDir(root), '/project/.ui-bridge/comments');
  });

  it('scriptsDir returns scripts subdir', () => {
    assert.equal(scriptsDir(root), '/project/.ui-bridge/scripts');
  });

  it('filesDir returns files subdir', () => {
    assert.equal(filesDir(root), '/project/.ui-bridge/files');
  });

  it('cacheDir returns .cache subdir', () => {
    assert.equal(cacheDir(root), '/project/.ui-bridge/.cache');
  });
});

// ── resolveRoot ───────────────────────────────────────────────────────────────

describe('resolveRoot', () => {
  let root;

  before(async () => {
    root = resolve(tmpdir(), `uib-resolveroot-${Date.now()}`);
    await mkdir(resolve(root, '.ui-bridge'), { recursive: true });
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds .ui-bridge dir by walking up from a nested cwd', async () => {
    const subDir = resolve(root, 'src', 'deep');
    await mkdir(subDir, { recursive: true });
    const found = await resolveRoot(subDir);
    assert.equal(found, root);
  });

  it('returns cwd itself when .ui-bridge is directly in it', async () => {
    const found = await resolveRoot(root);
    assert.equal(found, root);
  });

  it('falls back to cwd when no .ui-bridge dir found', async () => {
    const found = await resolveRoot(tmpdir());
    assert.equal(found, tmpdir());
  });
});

// ── createCommentStore ────────────────────────────────────────────────────────

describe('createCommentStore — in-memory state', () => {
  beforeEach(async () => {
    testRoot = resolve(tmpdir(), `uib-store-${Date.now()}`);
    await mkdir(resolve(testRoot, '.ui-bridge', 'comments'), { recursive: true });
  });

  after(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it('starts empty before load()', () => {
    const store = createCommentStore(testRoot);
    assert.deepEqual(store.all(), []);
  });

  it('all() returns upserted comments', async () => {
    const store = createCommentStore(testRoot);
    const ann = makeAnn('test-1');
    await store.upsert(ann);
    assert.equal(store.all().length, 1);
    assert.equal(store.get('test-1')?.meta.id, 'test-1');
  });

  it('has() returns true for existing, false for unknown', async () => {
    const store = createCommentStore(testRoot);
    await store.upsert(makeAnn('test-has'));
    assert.ok(store.has('test-has'));
    assert.ok(!store.has('nonexistent'));
  });

  it('del() removes from memory', async () => {
    const store = createCommentStore(testRoot);
    await store.upsert(makeAnn('test-del'));
    await store.del('test-del');
    assert.ok(!store.has('test-del'));
  });

  it('clear() removes all comments from memory', async () => {
    const store = createCommentStore(testRoot);
    await store.upsert(makeAnn('a'));
    await store.upsert(makeAnn('b'));
    await store.clear();
    assert.deepEqual(store.all(), []);
  });

  it('updateInMemory() updates without triggering disk write', async () => {
    const store = createCommentStore(testRoot);
    const ann = makeAnn('test-inmem');
    await store.upsert(ann);
    const updated = { ...ann, meta: { ...ann.meta, lastReadAt: 12345 } };
    store.updateInMemory(updated);
    assert.equal(store.get('test-inmem')?.meta.lastReadAt, 12345);
  });
});

describe('createCommentStore — persistence', () => {
  beforeEach(async () => {
    testRoot = resolve(tmpdir(), `uib-store-${Date.now()}`);
    await mkdir(resolve(testRoot, '.ui-bridge', 'comments'), { recursive: true });
  });

  after(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it('upsert() writes a JSON file to disk', async () => {
    const store = createCommentStore(testRoot);
    const ann = makeAnn('persist-1');
    await store.upsert(ann);
    const filePath = resolve(testRoot, '.ui-bridge', 'comments', 'persist-1.json');
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.meta.id, 'persist-1');
  });

  it('load() reads comments written to disk', async () => {
    const ann = makeAnn('load-1');
    await writeFile(
      resolve(testRoot, '.ui-bridge', 'comments', 'load-1.json'),
      JSON.stringify(ann, null, 2),
      'utf-8',
    );
    const store = createCommentStore(testRoot);
    await store.load();
    assert.equal(store.get('load-1')?.meta.id, 'load-1');
  });

  it('load() ignores non-JSON files and invalid JSON', async () => {
    await writeFile(resolve(testRoot, '.ui-bridge', 'comments', 'readme.txt'), 'not json', 'utf-8');
    await writeFile(
      resolve(testRoot, '.ui-bridge', 'comments', 'broken.json'),
      '{invalid}',
      'utf-8',
    );
    const store = createCommentStore(testRoot);
    await store.load(); // should not throw
    assert.deepEqual(store.all(), []);
  });

  it('reload() replaces in-memory state from disk', async () => {
    const store = createCommentStore(testRoot);
    await store.upsert(makeAnn('stale'));
    // Write a different comment to disk directly
    const fresh = makeAnn('fresh');
    await writeFile(
      resolve(testRoot, '.ui-bridge', 'comments', 'fresh.json'),
      JSON.stringify(fresh, null, 2),
      'utf-8',
    );
    // Remove stale from disk
    await rm(resolve(testRoot, '.ui-bridge', 'comments', 'stale.json'), { force: true });
    await store.reload();
    assert.ok(!store.has('stale'), 'stale should be gone after reload');
    assert.ok(store.has('fresh'), 'fresh should be present after reload');
  });

  it('del() removes the file from disk', async () => {
    const store = createCommentStore(testRoot);
    await store.upsert(makeAnn('del-disk'));
    await store.del('del-disk');
    let threw = false;
    try {
      await readFile(resolve(testRoot, '.ui-bridge', 'comments', 'del-disk.json'), 'utf-8');
    } catch (e) {
      if (e.code === 'ENOENT') threw = true;
    }
    assert.ok(threw, 'file should be deleted from disk');
  });

  it('clear() removes all files from disk', async () => {
    const store = createCommentStore(testRoot);
    await store.upsert(makeAnn('c1'));
    await store.upsert(makeAnn('c2'));
    await store.clear();
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(resolve(testRoot, '.ui-bridge', 'comments'));
    assert.deepEqual(
      files.filter((f) => f.endsWith('.json')),
      [],
    );
  });
});

describe('createCommentStore — reloadOne', () => {
  beforeEach(async () => {
    testRoot = resolve(tmpdir(), `uib-store-${Date.now()}`);
    await mkdir(resolve(testRoot, '.ui-bridge', 'comments'), { recursive: true });
  });

  after(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it('reloadOne() picks up an updated file', async () => {
    const store = createCommentStore(testRoot);
    const ann = makeAnn('reload-one');
    await store.upsert(ann);
    // Overwrite file externally
    const updated = { ...ann, meta: { ...ann.meta, timestamp: 99999 } };
    await writeFile(
      resolve(testRoot, '.ui-bridge', 'comments', 'reload-one.json'),
      JSON.stringify(updated, null, 2),
      'utf-8',
    );
    await store.reloadOne('reload-one');
    assert.equal(store.get('reload-one')?.meta.timestamp, 99999);
  });

  it('reloadOne() removes entry when file is deleted (ENOENT)', async () => {
    const store = createCommentStore(testRoot);
    await store.upsert(makeAnn('reload-del'));
    await rm(resolve(testRoot, '.ui-bridge', 'comments', 'reload-del.json'), { force: true });
    await store.reloadOne('reload-del');
    assert.ok(!store.has('reload-del'));
  });
});

describe('createCommentStore — consumeSelfWrite', () => {
  beforeEach(async () => {
    testRoot = resolve(tmpdir(), `uib-store-${Date.now()}`);
    await mkdir(resolve(testRoot, '.ui-bridge', 'comments'), { recursive: true });
  });

  after(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it('returns false before any upsert', () => {
    const store = createCommentStore(testRoot);
    assert.equal(store.consumeSelfWrite('no-such-id'), false);
  });

  it('returns true once after upsert, then false', async () => {
    const store = createCommentStore(testRoot);
    await store.upsert(makeAnn('self-write-1'));
    assert.equal(store.consumeSelfWrite('self-write-1'), true);
    assert.equal(store.consumeSelfWrite('self-write-1'), false);
  });

  it('counts multiple upserts correctly', async () => {
    const store = createCommentStore(testRoot);
    const ann = makeAnn('self-write-2');
    await store.upsert(ann);
    await store.upsert(ann);
    assert.equal(store.consumeSelfWrite('self-write-2'), true);
    assert.equal(store.consumeSelfWrite('self-write-2'), true);
    assert.equal(store.consumeSelfWrite('self-write-2'), false);
  });
});
