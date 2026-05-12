/**
 * Unit tests for @design-bridge/components signal stores and intent bus.
 *
 * Runs with: node --test tests/stores.test.mjs
 * No browser, no Playwright — stores are pure JS.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Import from compiled dist so we exercise the real output
import {
  knobsSignal, updateKnobs, getKnobByMarker,
  annotationsSignal, updateAnnotations,
  activeTabSignal, collapsedSignal, snapSignal,
  setActiveTab, setCollapsed, setSnap, hydrateFromPersisted,
  dispatchIntent, onIntent,
} from '../dist/index.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeKnob(marker, overrides = {}) {
  return { marker, label: marker, type: 'string', value: 'default', ...overrides };
}

function makeAnnotation(id, overrides = {}) {
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

// ── annotations store ─────────────────────────────────────────────────────────

describe('annotations store', () => {
  beforeEach(() => updateAnnotations([]));

  test('starts empty', () => {
    assert.deepEqual(annotationsSignal.get(), []);
  });

  test('updateAnnotations replaces the list', () => {
    const list = [makeAnnotation('a1'), makeAnnotation('a2')];
    updateAnnotations(list);
    assert.equal(annotationsSignal.get().length, 2);
    assert.equal(annotationsSignal.get()[0].id, 'a1');
  });

  test('updateAnnotations is a full replacement, not a merge', () => {
    updateAnnotations([makeAnnotation('old')]);
    updateAnnotations([makeAnnotation('new1'), makeAnnotation('new2')]);
    const ids = annotationsSignal.get().map((a) => a.id);
    assert.deepEqual(ids, ['new1', 'new2']);
  });
});

// ── panel-ui store ────────────────────────────────────────────────────────────

describe('panel-ui store', () => {
  beforeEach(() => {
    setActiveTab('tweaks');
    setCollapsed(false);
    setSnap(null);
  });

  test('activeTab defaults to tweaks', () => {
    assert.equal(activeTabSignal.get(), 'tweaks');
  });

  test('setActiveTab switches to annotations', () => {
    setActiveTab('annotations');
    assert.equal(activeTabSignal.get(), 'annotations');
  });

  test('setCollapsed toggles collapsed state', () => {
    assert.equal(collapsedSignal.get(), false);
    setCollapsed(true);
    assert.equal(collapsedSignal.get(), true);
    setCollapsed(false);
    assert.equal(collapsedSignal.get(), false);
  });

  test('setSnap stores snap position', () => {
    setSnap('left');
    assert.equal(snapSignal.get(), 'left');
    setSnap(null);
    assert.equal(snapSignal.get(), null);
  });

  test('hydrateFromPersisted sets all fields', () => {
    hydrateFromPersisted({ activeTab: 'annotations', collapsed: true, snap: 'right' });
    assert.equal(activeTabSignal.get(), 'annotations');
    assert.equal(collapsedSignal.get(), true);
    assert.equal(snapSignal.get(), 'right');
  });

  test('hydrateFromPersisted with empty object leaves current values unchanged', () => {
    setActiveTab('annotations');
    hydrateFromPersisted({});
    assert.equal(activeTabSignal.get(), 'annotations');
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
    const unsub1 = onIntent(() => { count++; if (count === 2) { unsub1(); unsub2(); done(); } });
    const unsub2 = onIntent(() => { count++; if (count === 2) { unsub1(); unsub2(); done(); } });
    dispatchIntent({ type: 'tweak:revert' });
  });

  test('unsubscribed handler no longer receives intents', (t, done) => {
    let fired = false;
    const unsub = onIntent(() => { fired = true; });
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
      { type: 'tweak:accept-annotation', annotationId: 'ann1' },
      { type: 'tweak:accept-one', annotationId: 'ann1', marker: 'm1' },
      { type: 'tweak:dismiss-one', annotationId: 'ann1', marker: 'm1' },
      { type: 'annotation:delete', id: 'ann1' },
      { type: 'annotation:clear' },
      { type: 'annotation:open', id: 'ann1' },
      { type: 'panel:set-tab', tab: 'annotations' },
      { type: 'panel:set-collapsed', collapsed: true },
    ];

    let idx = 0;
    const unsub = onIntent((received) => {
      assert.equal(received.type, intents[idx].type);
      idx++;
      if (idx === intents.length) { unsub(); done(); }
    });

    for (const intent of intents) dispatchIntent(intent);
  });
});
