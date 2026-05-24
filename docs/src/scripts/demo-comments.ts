/**
 * demo-comments.ts
 *
 * Seeds client-side-only demo CommentThreads into the Design Bridge signal
 * store so the docs page shows realistic comment badges and panels without any
 * server round-trips.
 *
 * One thread per knob type:
 *   dc-color      — color    — subtitle text color
 *   dc-number     — number   — hero section padding
 *   dc-string     — string   — CTA button label
 *   dc-textarea   — textarea — setup section description
 *   dc-boolean    — boolean  — show/hide the subtitle
 *   dc-select     — select   — "How it works" heading size
 *   dc-button-group — button-group — hero text alignment
 *
 * Extra narrative variety:
 *   dc-plain      — plain text only (no tweak), resolved thread
 *   dc-resolved   — accepted tweak (shows accepted badge)
 *   dc-followup   — discarded tweak + follow-up user comment + new pending tweak
 *
 * All threads carry  meta.demo = true  so the ws-adapter never forwards
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

// ── Marker constants ──────────────────────────────────────────────────────────

const M_COLOR = 'dc-color';
const M_NUMBER = 'dc-number';
const M_STRING = 'dc-string';
const M_TEXTAREA = 'dc-textarea';
const M_BOOLEAN = 'dc-boolean';
const M_SELECT = 'dc-select';
const M_BUTTON_GROUP = 'dc-button-group';
const M_FOLLOWUP = 'dc-followup';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeThread(
  id: string,
  selector: string,
  tag: string,
  comments: unknown[],
  resolvedAt?: number,
): unknown {
  const now = Date.now();
  return {
    meta: {
      id,
      pageUrl: location.href,
      timestamp: now,
      createdAt: now,
      demo: true as const,
      ...(resolvedAt !== undefined ? { resolvedAt } : {}),
    },
    elements: [{ minimalSelector: selector, tag, classes: [] }],
    comments,
  };
}

function makeText(id: string, text: string, author: 'user' | 'agent', ago = 0): unknown {
  return { id, type: 'comment', text, createdAt: Date.now() - ago, author };
}

function makeTweak(
  id: string,
  text: string,
  knob: Record<string, unknown>,
  status: 'pending' | 'accepted' | 'discarded' = 'pending',
  ago = 0,
): unknown {
  return {
    id,
    type: 'tweak',
    text,
    createdAt: Date.now() - ago,
    author: 'agent',
    tweakStatus: status,
    knob,
    actions: [],
  };
}

// ── Thread definitions ────────────────────────────────────────────────────────

// 1. Plain — no tweak, resolved
const THREAD_PLAIN = makeThread(
  'dc-plain',
  'h1',
  'h1',
  [
    makeText(
      'dc-plain-1',
      'The headline could be punchier — maybe lead with the pain point instead of the tool name?',
      'user',
      7_200_000,
    ),
    makeText(
      'dc-plain-2',
      "Good point. Let's revisit the copy once we nail the tagline.",
      'agent',
      7_100_000,
    ),
    makeText('dc-plain-3', 'Sounds good, marking as resolved.', 'user', 7_000_000),
  ],
  Date.now() - 6_900_000,
);

// 2. Color knob — pending
const THREAD_COLOR = makeThread('dc-color', 'p.text-wa-text-quiet', 'p', [
  makeText(
    'dc-color-1',
    'The subtitle feels a bit low-contrast on dark backgrounds. Can we punch it up?',
    'user',
    300_000,
  ),
  makeText(
    'dc-color-2',
    "Here's a color knob — try a brighter tone and see what feels right.",
    'agent',
    240_000,
  ),
  makeTweak('dc-color-tweak', 'Tweak subtitle color', {
    label: 'Subtitle color',
    type: 'color',
    value: '#8888a0',
  }),
]);

// 3. Number knob — accepted (resolved tweak with follow-up)
const THREAD_NUMBER = makeThread('dc-number', '#hero', 'section', [
  makeText(
    'dc-number-1',
    'Hero section feels cramped on smaller viewports. Can we reduce the vertical padding?',
    'user',
    3_600_000,
  ),
  makeText(
    'dc-number-2',
    "I've attached a number knob — drag it down to around 60px and see how it feels.",
    'agent',
    3_500_000,
  ),
  makeTweak(
    'dc-number-tweak',
    'Tweak hero padding',
    {
      label: 'Vertical padding',
      type: 'select',
      value: 'py-20',
      options: {
        'py-10': 'Compact (40px)',
        'py-16': 'Cozy (64px)',
        'py-20': 'Comfortable (80px)',
        'py-28': 'Spacious (112px)',
        'py-36': 'Airy (144px)',
      },
    },
    'accepted',
    3_400_000,
  ),
  makeText('dc-number-3', '80px looks great — accepted. Thanks!', 'user', 3_300_000),
]);

// 4. String knob — pending
const THREAD_STRING = makeThread(
  'dc-string',
  '#hero-content wa-button[appearance="accent"]',
  'wa-button',
  [
    makeText(
      'dc-string-1',
      '"Get Started ↓" is fine but feels a bit passive. Can we test something more action-oriented?',
      'user',
      180_000,
    ),
    makeText(
      'dc-string-2',
      'Sure — use the text knob to try different labels live. I\'d suggest something like "Start in 2 minutes".',
      'agent',
      120_000,
    ),
    makeTweak('dc-string-tweak', 'Tweak CTA label', {
      label: 'Button label',
      type: 'select',
      value: 'Get Started ↓',
      options: {
        'Get Started ↓': 'Get Started ↓',
        'Start in 2 minutes': 'Start in 2 minutes',
        'Try it free': 'Try it free',
        'See it in action': 'See it in action',
        'Install now': 'Install now',
        'Get up and running': 'Get up and running',
      },
    }),
  ],
);

// 5. Textarea knob — pending
const THREAD_TEXTAREA = makeThread('dc-textarea', '#get-started p', 'p', [
  makeText(
    'dc-textarea-1',
    'The setup intro is a bit terse. Could we expand it to set expectations better?',
    'user',
    900_000,
  ),
  makeText(
    'dc-textarea-2',
    "Here's a textarea knob so you can draft and preview alternative copy directly on the page.",
    'agent',
    840_000,
  ),
  makeTweak('dc-textarea-tweak', 'Tweak setup description', {
    label: 'Setup description',
    type: 'textarea',
    value:
      'Install the package for your framework, add it to your config, and run your dev server.',
  }),
]);

// 6. Boolean knob — discarded + follow-up with new pending tweak
const THREAD_BOOLEAN = makeThread('dc-boolean', 'p.text-wa-text-quiet', 'p', [
  makeText(
    'dc-boolean-1',
    'What if we hide the subtitle entirely and let the headline carry the full weight?',
    'user',
    5_400_000,
  ),
  makeText('dc-boolean-2', "Let's try it — toggle the boolean below.", 'agent', 5_300_000),
  makeTweak(
    'dc-boolean-tweak-1',
    'Toggle subtitle visibility',
    { label: 'Show subtitle', type: 'boolean', value: true },
    'discarded',
    5_200_000,
  ),
  makeText(
    'dc-boolean-3',
    'Hiding it felt too bare. But maybe we just reduce its opacity instead?',
    'user',
    5_100_000,
  ),
  makeText(
    'dc-boolean-4',
    "Good idea — here's another knob: toggle dimmed mode (50% opacity).",
    'agent',
    5_000_000,
  ),
  makeTweak('dc-boolean-tweak-2', 'Toggle dimmed mode', {
    label: 'Dimmed subtitle',
    type: 'boolean',
    value: false,
  }),
]);

// 7. Select knob — pending
const THREAD_SELECT = makeThread('dc-select', '#how-it-works h2', 'h2', [
  makeText(
    'dc-select-1',
    '"How it works" heading feels a bit large relative to the body text. Can we try a smaller size?',
    'user',
    600_000,
  ),
  makeText(
    'dc-select-2',
    "Use the select knob to try different sizes — it'll update both section headings at once. I'd start with SM.",
    'agent',
    540_000,
  ),
  makeTweak('dc-select-tweak', 'Tweak heading size', {
    label: 'Heading size',
    type: 'select',
    value: '1.875rem',
    options: {
      '1.25rem': 'XS — 1.25rem',
      '1.5rem': 'SM — 1.5rem',
      '1.875rem': 'MD — 1.875rem',
      '2.25rem': 'LG — 2.25rem',
      '3rem': 'XL — 3rem',
    },
  }),
]);

// 8. Button-group knob — pending
const THREAD_BUTTON_GROUP = makeThread('dc-button-group', '#hero-content', 'div', [
  makeText(
    'dc-bg-1',
    'Hero text is always centered — but on wide screens a left-aligned layout might feel more editorial.',
    'user',
    420_000,
  ),
  makeText(
    'dc-bg-2',
    "Here's a button-group knob to switch alignment. Try left or right and see which feels better.",
    'agent',
    360_000,
  ),
  makeTweak('dc-bg-tweak', 'Tweak hero alignment', {
    label: 'Hero alignment',
    type: 'button-group',
    value: 'center',
    options: { left: 'Left', center: 'Center', right: 'Right' },
  }),
]);

// 9. Follow-up thread — discarded tweak already in history, new pending tweak
const THREAD_FOLLOWUP = makeThread(M_FOLLOWUP, '#get-started h2', 'h2', [
  makeText('dc-fu-1', 'Can we rename "Setup" to something more inviting?', 'user', 2_700_000),
  makeText(
    'dc-fu-2',
    'Sure — here\'s a string knob, try "Get up and running" or "Quick start".',
    'agent',
    2_600_000,
  ),
  makeTweak(
    'dc-fu-tweak-1',
    'Tweak section heading',
    { label: 'Section heading', type: 'string', value: 'Setup' },
    'discarded',
    2_500_000,
  ),
  makeText(
    'dc-fu-3',
    'Hmm, discarded — "Setup" is more scannable after all. But what about the font weight?',
    'user',
    2_400_000,
  ),
  makeText(
    'dc-fu-4',
    "Fair enough. Here's a button-group knob for the font weight.",
    'agent',
    2_300_000,
  ),
  makeTweak('dc-fu-tweak-2', 'Tweak heading font weight', {
    label: 'Font weight',
    type: 'button-group',
    value: 'semibold',
    options: { normal: 'Normal', medium: 'Medium', semibold: 'Semibold', bold: 'Bold' },
  }),
]);

// ── Initial knob state — derived from pending tweaks in threads ───────────────

type ThreadLike = {
  meta: { id: string };
  comments: { type: string; tweakStatus?: string; knob?: Record<string, unknown> }[];
};

function extractPendingKnobs(threads: unknown[]): unknown[] {
  return (threads as ThreadLike[]).flatMap((thread) => {
    const pending = [...thread.comments]
      .reverse()
      .find((c) => c.type === 'tweak' && c.tweakStatus === 'pending');
    if (!pending?.knob) return [];
    return [{ marker: thread.meta.id, commentId: thread.meta.id, ...pending.knob }];
  });
}

// ── Knob-change visual effects ────────────────────────────────────────────────

function applyKnobChange(marker: string, value: unknown): void {
  if (marker === M_COLOR) {
    const el = document.querySelector<HTMLElement>('p.text-wa-text-quiet');
    if (el) el.style.color = String(value);
    return;
  }

  if (marker === M_NUMBER) {
    const el = document.querySelector<HTMLElement>('#hero');
    if (el) {
      el.style.paddingTop = `${value}px`;
      el.style.paddingBottom = `${value}px`;
    }
    return;
  }

  if (marker === M_STRING) {
    const el = document.querySelector<HTMLElement>('#hero-content wa-button[appearance="accent"]');
    if (el) el.textContent = String(value);
    return;
  }

  if (marker === M_TEXTAREA) {
    const el = document.querySelector<HTMLElement>('#get-started p');
    if (el) el.textContent = String(value);
    return;
  }

  if (marker === M_BOOLEAN) {
    const el = document.querySelector<HTMLElement>('p.text-wa-text-quiet');
    if (el) el.style.opacity = value === true || value === 'true' ? '0.5' : '';
    return;
  }

  if (marker === M_SELECT) {
    for (const selector of ['#how-it-works h2', '#get-started h2']) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) el.style.fontSize = String(value);
    }
    return;
  }

  if (marker === M_BUTTON_GROUP) {
    const el = document.querySelector<HTMLElement>('#hero-content');
    if (el) {
      const map: Record<string, string> = {
        left: 'items-start text-left',
        center: 'items-center text-center',
        right: 'items-end text-right',
      };
      el.classList.remove(
        'items-start',
        'text-left',
        'items-center',
        'text-center',
        'items-end',
        'text-right',
      );
      const classes = map[String(value)];
      if (classes) el.classList.add(...classes.split(' '));
    }
    return;
  }

  if (marker === M_FOLLOWUP) {
    const el = document.querySelector<HTMLElement>('#get-started h2');
    if (el) {
      el.style.fontWeight =
        value === 'normal'
          ? '400'
          : value === 'medium'
            ? '500'
            : value === 'semibold'
              ? '600'
              : '700';
    }
    return;
  }
}

function revertKnob(marker: string): void {
  if (marker === M_COLOR) {
    const el = document.querySelector<HTMLElement>('p.text-wa-text-quiet');
    if (el) el.style.color = '';
  } else if (marker === M_NUMBER) {
    const el = document.querySelector<HTMLElement>('#hero');
    if (el) {
      el.style.paddingTop = '';
      el.style.paddingBottom = '';
    }
  } else if (marker === M_STRING) {
    const el = document.querySelector<HTMLElement>('#hero-content wa-button[appearance="accent"]');
    if (el) el.textContent = 'Get Started ↓';
  } else if (marker === M_TEXTAREA) {
    const el = document.querySelector<HTMLElement>('#get-started p');
    if (el)
      el.textContent =
        'Install the package for your framework, add it to your config, and run your dev server.';
  } else if (marker === M_BOOLEAN) {
    const el = document.querySelector<HTMLElement>('p.text-wa-text-quiet');
    if (el) el.style.opacity = '';
  } else if (marker === M_SELECT) {
    for (const selector of ['#how-it-works h2', '#get-started h2']) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) el.style.fontSize = '';
    }
  } else if (marker === M_BUTTON_GROUP) {
    const el = document.querySelector<HTMLElement>('#hero-content');
    if (el) {
      el.classList.remove('items-start', 'text-left', 'items-end', 'text-right');
      el.classList.add('items-center', 'text-center');
    }
  } else if (marker === M_FOLLOWUP) {
    const el = document.querySelector<HTMLElement>('#get-started h2');
    if (el) el.style.fontWeight = '';
  }
}

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
  const ALL_THREADS = [
    THREAD_COLOR,
    THREAD_NUMBER,
    THREAD_STRING,
    THREAD_TEXTAREA,
    THREAD_BOOLEAN,
    THREAD_SELECT,
    THREAD_BUTTON_GROUP,
    THREAD_FOLLOWUP,
  ];

  // Seed all threads
  for (const thread of ALL_THREADS) {
    db.upsertComment(thread);
  }

  // Seed pending knobs — derived from threads, no separate list to maintain
  db.updateKnobs([...(db.knobsSignal.get() as unknown[]), ...extractPendingKnobs(ALL_THREADS)]);

  type KnobLike = { marker: string; value: unknown };

  function updateKnobValue(marker: string, value: unknown): void {
    const knobs = db.knobsSignal.get() as KnobLike[];
    db.updateKnobs(knobs.map((k) => (k.marker === marker ? { ...k, value } : k)));
  }

  function resolveKnob(commentId: string, status: 'accepted' | 'discarded'): void {
    const threads = db.commentsSignal.get() as {
      meta: { id: string };
      comments: { type: string; tweakStatus?: string }[];
    }[];
    db.updateComments(
      threads.map((t) =>
        t.meta.id === commentId
          ? {
              ...t,
              comments: t.comments.map((c) =>
                c.type === 'tweak' && (c as { tweakStatus?: string }).tweakStatus === 'pending'
                  ? { ...c, tweakStatus: status }
                  : c,
              ),
            }
          : t,
      ),
    );
    const knobs = db.knobsSignal.get() as KnobLike[];
    db.updateKnobs(knobs.filter((k) => k.marker !== commentId));
  }

  // Handle intents for all demo threads locally
  const DEMO_IDS = new Set(ALL_THREADS.map((t) => (t as { meta: { id: string } }).meta.id));

  db.onIntent((intent) => {
    const type = intent['type'] as string;
    const marker = intent['marker'] as string | undefined;
    const commentId = intent['commentId'] as string | undefined;

    if (type === 'tweak:change' && marker && DEMO_IDS.has(marker)) {
      applyKnobChange(marker, intent['value']);
      updateKnobValue(marker, intent['value']);
      return;
    }

    if (type === 'tweak:accept-comment' && commentId && DEMO_IDS.has(commentId)) {
      resolveKnob(commentId, 'accepted');
      return;
    }

    if (type === 'tweak:discard-comment' && commentId && DEMO_IDS.has(commentId)) {
      revertKnob(commentId);
      resolveKnob(commentId, 'discarded');
    }
  });
});
