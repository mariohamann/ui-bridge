/**
 * demo-comments.ts
 *
 * Seeds two client-side-only demo CommentThreads into the Design Bridge signal
 * store so the docs page shows realistic comment badges and panels without any
 * server round-trips.
 *
 * Comment 1 — plain comment on the <h1> headline.
 * Comment 2 — comment + agent reply + live color-picker tweak on the subtitle.
 *
 * Both threads carry  meta.demo = true  so the ws-adapter never forwards
 * them to the server (see core/client/src/browser/ws-adapter.ts).
 */

type DbComponents = {
  updateComments: (threads: unknown[]) => void;
  upsertComment: (thread: unknown) => void;
  commentsSignal: { get: () => unknown[] };
  updateKnobs: (knobs: unknown[]) => void;
  knobsSignal: { get: () => unknown[] };
  onIntent: (handler: (intent: Record<string, unknown>) => void) => () => void;
};

const SUBTITLE_COLOR_KNOB_MARKER = 'demo-comment-2';

// ── Fixture data ──────────────────────────────────────────────────────────────

function makeThread(id: string, selector: string, tag: string, comments: unknown[]): unknown {
  const now = Date.now();
  return {
    meta: { id, pageUrl: location.href, timestamp: now, createdAt: now, demo: true as const },
    elements: [{ minimalSelector: selector, tag, classes: [] }],
    comments,
  };
}

function makeTextEntry(id: string, text: string, author: 'user' | 'agent', ago = 0): unknown {
  return { id, type: 'comment', text, createdAt: Date.now() - ago, author };
}

function makeTweakEntry(id: string): unknown {
  return {
    id,
    type: 'tweak',
    text: 'Tweak subtitle color',
    createdAt: Date.now() - 1000,
    author: 'agent',
    tweakStatus: 'pending',
    knob: {
      label: 'Subtitle color',
      type: 'color',
      value: '#8888a0',
    },
    actions: [],
  };
}

const DEMO_THREAD_1 = makeThread('demo-comment-1', 'h1', 'h1', [
  makeTextEntry(
    'dc1-r1',
    'The headline could be punchier — maybe lead with the pain point instead of the tool name?',
    'user',
    120_000,
  ),
]);

const DEMO_THREAD_2 = makeThread('demo-comment-2', 'p.text-db-muted', 'p', [
  makeTextEntry(
    'dc2-r1',
    'The subtitle feels a bit generic. Can we make it more concrete?',
    'user',
    300_000,
  ),
  makeTextEntry(
    'dc2-r2',
    'Agreed. How about "Annotate, tweak, and iterate without leaving the browser"? Also — I\'ve attached a color knob so you can try different tones.',
    'agent',
    240_000,
  ),
  makeTweakEntry('dc2-tweak'),
]);

const DEMO_KNOB = {
  marker: SUBTITLE_COLOR_KNOB_MARKER,
  commentId: SUBTITLE_COLOR_KNOB_MARKER,
  label: 'Subtitle color',
  type: 'color',
  value: '#8888a0',
};

// ── Boot ──────────────────────────────────────────────────────────────────────

function waitForDb(): Promise<DbComponents> {
  return new Promise((resolve) => {
    const check = (): void => {
      const db = (window as unknown as Record<string, unknown>).__DB_COMPONENTS__ as
        | DbComponents
        | undefined;
      if (db) {
        resolve(db);
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  });
}

waitForDb().then((db) => {
  // Seed comments via upsertComment so the inspector creates DOM items
  // (db-comment elements) and positions badges against real DOM nodes.
  db.upsertComment(DEMO_THREAD_1);
  db.upsertComment(DEMO_THREAD_2);

  // Seed the color knob for comment 2 so the live knob renders immediately.
  db.updateKnobs([...(db.knobsSignal.get() as unknown[]), DEMO_KNOB]);

  // Handle intents for demo threads locally — never reaches ws-adapter.
  db.onIntent((intent) => {
    // ── tweak:change — apply color to the subtitle element ────────────────
    if (intent['type'] === 'tweak:change' && intent['marker'] === SUBTITLE_COLOR_KNOB_MARKER) {
      const el = document.querySelector<HTMLElement>('p.text-db-muted');
      if (el) el.style.color = String(intent['value']);

      // Update knob value in the signal so db-knob reflects the current selection.
      const knobs = db.knobsSignal.get() as (typeof DEMO_KNOB)[];
      db.updateKnobs(
        knobs.map((k) =>
          k.marker === SUBTITLE_COLOR_KNOB_MARKER ? { ...k, value: intent['value'] } : k,
        ),
      );
      return;
    }

    // ── tweak:accept-comment — freeze the color, mark tweak accepted ──────
    if (
      intent['type'] === 'tweak:accept-comment' &&
      intent['commentId'] === SUBTITLE_COLOR_KNOB_MARKER
    ) {
      const threads = db.commentsSignal.get() as {
        meta: { id: string };
        comments: { type: string; tweakStatus?: string }[];
      }[];
      db.updateComments(
        threads.map((t) =>
          t.meta.id === SUBTITLE_COLOR_KNOB_MARKER
            ? {
                ...t,
                comments: t.comments.map((c) =>
                  c.type === 'tweak' ? { ...c, tweakStatus: 'accepted' } : c,
                ),
              }
            : t,
        ),
      );
      // Remove the knob from the schema.
      db.updateKnobs(
        (db.knobsSignal.get() as (typeof DEMO_KNOB)[]).filter(
          (k) => k.marker !== SUBTITLE_COLOR_KNOB_MARKER,
        ),
      );
      return;
    }

    // ── tweak:discard-comment — restore original color, mark discarded ────
    if (
      intent['type'] === 'tweak:discard-comment' &&
      intent['commentId'] === SUBTITLE_COLOR_KNOB_MARKER
    ) {
      const el = document.querySelector<HTMLElement>('p.text-db-muted');
      if (el) el.style.color = '';

      const threads = db.commentsSignal.get() as {
        meta: { id: string };
        comments: { type: string; tweakStatus?: string }[];
      }[];
      db.updateComments(
        threads.map((t) =>
          t.meta.id === SUBTITLE_COLOR_KNOB_MARKER
            ? {
                ...t,
                comments: t.comments.map((c) =>
                  c.type === 'tweak' ? { ...c, tweakStatus: 'discarded' } : c,
                ),
              }
            : t,
        ),
      );
      db.updateKnobs(
        (db.knobsSignal.get() as (typeof DEMO_KNOB)[]).filter(
          (k) => k.marker !== SUBTITLE_COLOR_KNOB_MARKER,
        ),
      );
    }
  });
});
