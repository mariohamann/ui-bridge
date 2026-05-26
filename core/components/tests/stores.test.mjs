/**
 * Unit tests for @ui-bridge/components signal stores and intent bus.
 *
 * Runs with: node --test tests/stores.test.mjs
 * No browser, no Playwright — stores are pure JS.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Import from compiled dist so we exercise the real output
import {
  knobsSignal,
  updateKnobs,
  getKnobByMarker,
  commentsSignal,
  updateComments,
  dispatchIntent,
  onIntent,
} from '../dist/index.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeKnob(marker, overrides = {}) {
  return { marker, label: marker, type: 'string', value: 'default', ...overrides };
}

function makeComment(id, overrides = {}) {
  return {
    id,
    selectors: ['h1'],
    labels: ['h1'],
    comment: 'test',
    pageUrl: 'http://localhost/',
    timestamp: Date.now(),
    createdAt: Date.now(),
    ...overrides,
  };
}

// ── knobs store ───────────────────────────────────────────────────────────────

describe('knobs store', () => {
  beforeEach(() => updateKnobs([]));

  test('starts empty', () => {
    assert.deepEqual(knobsSignal.get(), []);
  });

  test('updateKnobs replaces the whole list', () => {
    const knobs = [makeKnob('color'), makeKnob('size')];
    updateKnobs(knobs);
    assert.deepEqual(knobsSignal.get(), knobs);
  });

  test('updateKnobs with empty array clears state', () => {
    updateKnobs([makeKnob('x')]);
    updateKnobs([]);
    assert.deepEqual(knobsSignal.get(), []);
  });

  test('getKnobByMarker returns correct knob', () => {
    updateKnobs([makeKnob('color', { value: '#ff0000' }), makeKnob('size')]);
    const knob = getKnobByMarker('color');
    assert.equal(knob?.value, '#ff0000');
  });

  test('getKnobByMarker returns undefined for unknown marker', () => {
    updateKnobs([makeKnob('color')]);
    assert.equal(getKnobByMarker('unknown'), undefined);
  });
});

// ── comments store ─────────────────────────────────────────────────────────

describe('comments store', () => {
  beforeEach(() => updateComments([]));

  test('starts empty', () => {
    assert.deepEqual(commentsSignal.get(), []);
  });

  test('updateComments replaces the list', () => {
    const list = [makeComment('a1'), makeComment('a2')];
    updateComments(list);
    assert.equal(commentsSignal.get().length, 2);
    assert.equal(commentsSignal.get()[0].id, 'a1');
  });

  test('updateComments is a full replacement, not a merge', () => {
    updateComments([makeComment('old')]);
    updateComments([makeComment('new1'), makeComment('new2')]);
    const ids = commentsSignal.get().map((a) => a.id);
    assert.deepEqual(ids, ['new1', 'new2']);
  });

  test('preserves author field on comments', () => {
    updateComments([
      makeComment('agent-1', { author: 'agent' }),
      makeComment('user-1', { author: 'user' }),
    ]);
    const comments = commentsSignal.get();
    assert.equal(comments.find((c) => c.id === 'agent-1')?.author, 'agent');
    assert.equal(comments.find((c) => c.id === 'user-1')?.author, 'user');
  });

  test('preserves tweakStatus field on comments', () => {
    updateComments([
      makeComment('t1', { tweakStatus: 'pending' }),
      makeComment('t2', { tweakStatus: 'accepted' }),
      makeComment('t3', { tweakStatus: 'discarded' }),
    ]);
    const comments = commentsSignal.get();
    assert.equal(comments.find((c) => c.id === 't1')?.tweakStatus, 'pending');
    assert.equal(comments.find((c) => c.id === 't2')?.tweakStatus, 'accepted');
    assert.equal(comments.find((c) => c.id === 't3')?.tweakStatus, 'discarded');
  });

  test('preserves author on individual replies', () => {
    const comment = makeComment('reply-test', {
      replies: [
        {
          id: 'r1',
          type: 'comment',
          text: 'User said this',
          createdAt: Date.now(),
          author: 'user',
        },
        {
          id: 'r2',
          type: 'comment',
          text: 'Agent replied',
          createdAt: Date.now(),
          author: 'agent',
        },
      ],
    });
    updateComments([comment]);
    const stored = commentsSignal.get()[0];
    assert.equal(stored.replies[0].author, 'user');
    assert.equal(stored.replies[1].author, 'agent');
  });
  test('preserves lastReadAt field on thread meta', () => {
    const now = Date.now();
    const comment = makeComment('read-test', { lastReadAt: now });
    updateComments([comment]);
    const stored = commentsSignal.get()[0];
    assert.equal(stored.lastReadAt, now);
  });
});

// ── intent bus ────────────────────────────────────────────────────────────────

describe('intent bus', () => {
  test('dispatched intent is received by a subscriber', (t, done) => {
    const unsub = onIntent((intent) => {
      unsub();
      assert.equal(intent.type, 'tweak:change');
      assert.equal(intent.marker, 'color');
      assert.equal(intent.value, '#abc');
      done();
    });
    dispatchIntent({ type: 'tweak:change', marker: 'color', value: '#abc' });
  });

  test('multiple subscribers each receive the intent', (t, done) => {
    let count = 0;
    const unsub1 = onIntent(() => {
      count++;
      if (count === 2) {
        unsub1();
        unsub2();
        done();
      }
    });
    const unsub2 = onIntent(() => {
      count++;
      if (count === 2) {
        unsub1();
        unsub2();
        done();
      }
    });
    dispatchIntent({ type: 'tweak:revert' });
  });

  test('unsubscribed handler no longer receives intents', (t, done) => {
    let fired = false;
    const unsub = onIntent(() => {
      fired = true;
    });
    unsub();
    dispatchIntent({ type: 'tweak:discard' });
    // Give event loop one tick then assert
    setImmediate(() => {
      assert.equal(fired, false);
      done();
    });
  });

  test('all intent types are dispatched correctly', (t, done) => {
    const intents = [
      { type: 'tweak:revert' },
      { type: 'tweak:apply', markers: ['a', 'b'] },
      { type: 'tweak:discard' },
      { type: 'tweak:accept-comment', commentId: 'ann1' },
      { type: 'tweak:accept-one', commentId: 'ann1', marker: 'm1' },
      { type: 'tweak:dismiss-one', commentId: 'ann1', marker: 'm1' },
      { type: 'comment:delete', id: 'ann1' },
      { type: 'comment:clear' },
      { type: 'comment:open', id: 'ann1' },
      { type: 'comment:read', id: 'ann1' },
      { type: 'panel:set-tab', tab: 'comments' },
      { type: 'panel:set-collapsed', collapsed: true },
    ];

    let idx = 0;
    const unsub = onIntent((received) => {
      assert.equal(received.type, intents[idx].type);
      idx++;
      if (idx === intents.length) {
        unsub();
        done();
      }
    });

    for (const intent of intents) dispatchIntent(intent);
  });
});
