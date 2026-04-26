// Tests for the Phase 4 U2 home-hero recommendation routing.
//
// Two layers:
//   1. Pure-helper tests for `selectTodaysBestRound` in
//      `src/surfaces/home/data.js` — ranking, Spelling tiebreak, empty-state
//      fallback, malformed dashboardStats entries, missing subjects.
//   2. SSR-level integration tests that render `HomeSurface` with crafted
//      stub models and assert that the rendered CTA carries the expected
//      subject via `data-action="open-subject"` + `data-subject-id="…"` and
//      the visible copy flips between the "Today's best round" card (when a
//      recommendation exists) and the pre-U2 fresh-learner copy (when no
//      subject has any due work).
//
// The SSR helper `tests/helpers/home-surface-render.js` mirrors
// `tests/helpers/punctuation-scene-render.js` — renderToStaticMarkup via
// esbuild so tests can drive HomeSurface directly with a crafted `model`.

import test from 'node:test';
import assert from 'node:assert/strict';

import { selectTodaysBestRound } from '../src/surfaces/home/data.js';
import {
  cleanupHomeSurfaceRenderer,
  renderHomeSurfaceStandalone,
} from './helpers/home-surface-render.js';

const SUBJECTS = [
  { id: 'spelling', name: 'Spelling', blurb: 'Spelling', available: true },
  { id: 'punctuation', name: 'Punctuation', blurb: 'Punctuation', available: true },
  { id: 'grammar', name: 'Grammar', blurb: 'Grammar', available: true },
];

function baseModel(overrides = {}) {
  return {
    theme: 'light',
    learner: { id: 'learner-a', name: 'Ava' },
    learnerLabel: 'Ava · Y5',
    learnerOptions: [{ id: 'learner-a', name: 'Ava', yearGroup: 'Y5' }],
    signedInAs: null,
    subjects: SUBJECTS,
    monsterSummary: [],
    dashboardStats: {},
    dueTotal: 0,
    roundNumber: 1,
    now: new Date('2026-04-22T12:00:00Z'),
    permissions: { canOpenParentHub: true },
    persistence: { mode: 'local-only', label: 'Local-only' },
    ...overrides,
  };
}

test.after(() => {
  cleanupHomeSurfaceRenderer();
});

// ---------- Pure-helper tests ---------- //

test('selectTodaysBestRound returns null when every subject has no due work', () => {
  const stats = {
    spelling: { due: 0 },
    punctuation: { due: 0 },
    grammar: { due: 0 },
  };
  const result = selectTodaysBestRound(stats);
  assert.equal(result, null);
});

test('selectTodaysBestRound returns the subject with the highest due scalar', () => {
  const stats = {
    spelling: { due: 0 },
    punctuation: { due: 2 },
    grammar: { due: 1 },
  };
  const result = selectTodaysBestRound(stats);
  assert.equal(result.subjectId, 'punctuation');
  assert.equal(result.subjectName, 'Punctuation');
  assert.equal(result.due, 2);
});

test('selectTodaysBestRound breaks ties by Spelling-first priority order', () => {
  // All three subjects equal → Spelling wins the tiebreak (default
  // tiebreakSubjectId), matching pre-U2 behaviour for fresh learners whose
  // stats happen to collide on due counts.
  const stats = {
    spelling: { due: 1 },
    punctuation: { due: 1 },
    grammar: { due: 1 },
  };
  const result = selectTodaysBestRound(stats);
  assert.equal(result.subjectId, 'spelling');
  assert.equal(result.due, 1);
});

test('selectTodaysBestRound respects the Spelling → Punctuation → Grammar order on partial ties', () => {
  // Spelling has no signal, Punctuation and Grammar both have due=2 → the
  // priority order says Punctuation wins the tie.
  const stats = {
    spelling: { due: 0 },
    punctuation: { due: 2 },
    grammar: { due: 2 },
  };
  const result = selectTodaysBestRound(stats);
  assert.equal(result.subjectId, 'punctuation');
});

test('selectTodaysBestRound clamps missing / negative / non-numeric due values to zero', () => {
  const stats = {
    spelling: { due: null },
    punctuation: { due: -5 },
    grammar: { /* missing due */ },
  };
  const result = selectTodaysBestRound(stats);
  assert.equal(result, null);
});

test('selectTodaysBestRound copes with a completely missing dashboardStats', () => {
  const result = selectTodaysBestRound(undefined);
  assert.equal(result, null);
  const empty = selectTodaysBestRound({});
  assert.equal(empty, null);
});

test('selectTodaysBestRound honours an explicit tiebreakSubjectId option', () => {
  // If the caller asks for Punctuation-first tiebreak, an all-equal stats
  // payload should route to Punctuation. Spelling is only the default.
  const stats = {
    spelling: { due: 1 },
    punctuation: { due: 1 },
    grammar: { due: 1 },
  };
  const result = selectTodaysBestRound(stats, { tiebreakSubjectId: 'punctuation' });
  assert.equal(result.subjectId, 'punctuation');
});

test('selectTodaysBestRound surfaces the caught monster companion when one exists for the recommended subject', () => {
  const stats = { punctuation: { due: 3 } };
  const monsterSummary = [
    // A caught punctuation monster — should bubble up into the result.
    {
      monster: {
        id: 'pealark',
        name: 'Pealark',
        nameByStage: ['Pealark Egg', 'Pealark', 'Chimewing', 'Bellcrest'],
      },
      progress: { caught: true, stage: 2, branch: 'b1' },
      subjectId: 'punctuation',
    },
    // A caught spelling monster — should not pollute the punctuation result.
    {
      monster: {
        id: 'inklet',
        name: 'Inklet',
        nameByStage: ['Inklet Egg', 'Inklet'],
      },
      progress: { caught: true, stage: 1, branch: 'b1' },
      subjectId: 'spelling',
    },
  ];
  const result = selectTodaysBestRound(stats, { monsterSummary });
  assert.equal(result.subjectId, 'punctuation');
  assert.equal(result.monsterCompanion, 'Chimewing');
});

test('selectTodaysBestRound leaves monsterCompanion null when no caught monster exists for the recommended subject', () => {
  const stats = { grammar: { due: 2 } };
  const monsterSummary = [
    {
      monster: { id: 'inklet', name: 'Inklet', nameByStage: ['Inklet Egg', 'Inklet'] },
      progress: { caught: true, stage: 1, branch: 'b1' },
      subjectId: 'spelling',
    },
  ];
  const result = selectTodaysBestRound(stats, { monsterSummary });
  assert.equal(result.subjectId, 'grammar');
  assert.equal(result.monsterCompanion ?? null, null);
});

// ---------- SSR integration tests ---------- //

test('HomeSurface renders the "Today\'s best round" card and routes the CTA to the recommended subject', () => {
  const model = baseModel({
    dashboardStats: {
      spelling: { pct: 10, due: 0, streak: 0, nextUp: 'Fresh spellings' },
      punctuation: { pct: 20, due: 3, streak: 1, nextUp: 'Due review' },
      grammar: { pct: 5, due: 0, streak: 0, nextUp: 'Start Grammar retrieval' },
    },
  });

  const html = renderHomeSurfaceStandalone({ model });

  // Subject-neutral hero copy when recommendation is non-null. The
  // renderToStaticMarkup pipeline HTML-escapes apostrophes as `&#x27;`,
  // so we match on `Today&#x27;s practice` rather than the literal `Today's`.
  assert.doesNotMatch(html, /Today&#x27;s words are <em>waiting\./);
  assert.match(html, /Today&#x27;s practice is <em>waiting\.<\/em>/);
  // The new sub-card names the recommended subject and its due count.
  assert.match(html, /Today&#x27;s best round:\s*<strong>Punctuation<\/strong>/);
  assert.match(html, /3 skills due|3 skills due for you/);

  // CTA label is "Start Punctuation".
  assert.match(html, /Start Punctuation/);
  // CTA carries the correct data-action + data-subject-id so tests (and
  // any future delegated-click wiring in main.js) can observe the routing
  // without needing jsdom. The hardcoded `openSubject('spelling')` path is
  // gone.
  assert.match(html, /data-action="open-subject"\s+data-subject-id="punctuation"/);
  assert.doesNotMatch(html, /data-subject-id="spelling"[^>]*>Begin today&#x27;s round/);

  // Open codex ghost button preserved.
  assert.match(html, />\s*Open codex\s*</);
});

test('HomeSurface renders the pre-U2 copy + Spelling CTA when no subject has any due work', () => {
  const model = baseModel({
    dashboardStats: {
      spelling: { pct: 0, due: 0, streak: 0, nextUp: 'Fresh spellings' },
      punctuation: { pct: 0, due: 0, streak: 0, nextUp: 'Smart Review' },
      grammar: { pct: 0, due: 0, streak: 0, nextUp: 'Start Grammar retrieval' },
    },
    dueTotal: 0,
  });

  const html = renderHomeSurfaceStandalone({ model });

  // Regression guard: fresh-learner hero copy stays byte-identical to
  // pre-U2 output. `renderToStaticMarkup` escapes the apostrophe as
  // `&#x27;` on every rendered pass.
  assert.match(html, /Today&#x27;s words are <em>waiting\.<\/em>/);
  assert.match(html, /Begin today&#x27;s round/);
  assert.match(html, /data-action="open-subject"\s+data-subject-id="spelling"/);
  assert.doesNotMatch(html, /Today&#x27;s best round:/);
});

test('HomeSurface labels the CTA with the picked subject name when Spelling is ahead', () => {
  // Covers the Spelling-wins branch. We expect the subject-neutral hero
  // card to still appear (not the fresh-learner fallback) and the CTA to
  // read "Start Spelling".
  const model = baseModel({
    dashboardStats: {
      spelling: { pct: 50, due: 5, streak: 2, nextUp: 'Due review' },
      punctuation: { pct: 0, due: 0, streak: 0, nextUp: 'Smart Review' },
      grammar: { pct: 0, due: 0, streak: 0, nextUp: 'Start Grammar retrieval' },
    },
  });

  const html = renderHomeSurfaceStandalone({ model });

  assert.match(html, /Today&#x27;s best round:\s*<strong>Spelling<\/strong>/);
  assert.match(html, /Start Spelling/);
  assert.match(html, /data-action="open-subject"\s+data-subject-id="spelling"/);
});
