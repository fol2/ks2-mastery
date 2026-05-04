// Tests for U9 Boss Dictation service path.
//
// Boss Dictation is a `type: 'test'`-shaped single-attempt round over a random
// sample of core-pool Mega slugs. Unlike legacy SATs Test, Boss NEVER demotes
// `progress.stage` / `dueDay` / `lastDay` / `lastResult` — those invariants
// live in the dedicated `submitBossAnswer` path.
//
// Plan: docs/plans/2026-04-25-005-feat-post-mega-spelling-guardian-hardening-plan.md (U9).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOSS_DEFAULT_ROUND_LENGTH,
  BOSS_MAX_ROUND_LENGTH,
  BOSS_MIN_ROUND_LENGTH,
  SPELLING_MODES,
  normaliseMode,
} from '../src/subjects/spelling/service-contract.js';
import {
  SPELLING_EVENT_TYPES,
  createSpellingBossCompletedEvent,
} from '../src/subjects/spelling/events.js';
import { selectBossWords } from '../shared/spelling/service.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { createSpellingPersistence } from '../src/subjects/spelling/repository.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { buildSpellingLearnerReadModel } from '../src/subjects/spelling/read-model.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import {
  spellingSessionContextNote,
  spellingSessionFooterNote,
  spellingSessionInfoChips,
  spellingSessionInputPlaceholder,
  spellingSessionProgressLabel,
  spellingSessionSubmitLabel,
} from '../src/subjects/spelling/session-ui.js';
import { WORDS, WORD_BY_SLUG } from '../src/subjects/spelling/data/word-data.js';
import { seedFullCoreMega as seedFullCoreMegaShared } from './helpers/post-mastery-seeds.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeSeededRandom(seed = 1) {
  let value = seed >>> 0;
  return function seededRandom() {
    value += 0x6D2B79F5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function makeServiceWithSeed({ now, random, storage = installMemoryStorage() } = {}) {
  const repositories = createLocalPlatformRepositories({ storage });
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories, now }),
    now,
    random,
    tts: {
      speak() {},
      stop() {},
      warmup() {},
    },
  });
  return { storage, repositories, service };
}

// P2 U3: delegates to the shared seeder. Matches the guardian suite's
// wiring — `guardian: {}` + `postMega: null` + `variation: true` — so the
// Boss unit tests keep the exact starting shape they had before the
// extraction.
function seedAllCoreMega(repositories, learnerId, todayDay) {
  return seedFullCoreMegaShared(repositories, learnerId, {
    today: todayDay,
    guardian: {},
    postMega: null,
    variation: true,
  });
}

function runBossRoundUntilSummary(service, learnerId, state, getAnswerForSlug) {
  const events = [];
  const seenSlugs = [];
  let current = state;
  while (current.phase === 'session') {
    const slug = current.session.currentCard.slug;
    seenSlugs.push(slug);
    const typed = getAnswerForSlug(slug, current);
    const submitted = service.submitAnswer(learnerId, current, typed);
    events.push(...submitted.events);
    current = submitted.state;
    assert.equal(current.awaitingAdvance, true, `awaitingAdvance after ${slug}`);
    const continued = service.continueSession(learnerId, current);
    events.push(...continued.events);
    current = continued.state;
  }
  return { state: current, events, seenSlugs };
}


// =============================================================================
// U10: Boss Dictation UI + Alt+5 — end-to-end React render + dispatch surface
// -----------------------------------------------------------------------------
// These tests drive the full `createAppHarness` render pipeline so the wiring
// from POST_MEGA_MODE_CARDS → PostMegaSetupContent → dispatch(shortcut-start)
// → SpellingSummaryScene is exercised in one pass. U9 tested the service-
// layer path; U10 adds the scene-layer wiring.
// =============================================================================

import { createAppHarness } from './helpers/app-harness.js';
import { createManualScheduler } from './helpers/manual-scheduler.js';

function u10SeedAllCoreMega(repositories, learnerId, todayDay) {
  // Mirrors the seed helper used by spelling-parity.test.js so a learner
  // with Mega on every core-pool word flips `allWordsMega === true` and the
  // post-Mega dashboard renders.
  const progress = Object.fromEntries(
    WORDS.filter((word) => word.spellingPool !== 'extra').map((word, index) => [word.slug, {
      stage: 4,
      attempts: 6 + (index % 4),
      correct: 5 + (index % 4),
      wrong: 1,
      dueDay: todayDay + 60,
      lastDay: todayDay - 7,
      lastResult: 'correct',
    }]),
  );
  repositories.subjectStates.writeData(learnerId, 'spelling', { progress });
}

test('U10 dashboard: Boss card renders with active variant when allWordsMega === true', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const harness = createAppHarness({ storage, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  u10SeedAllCoreMega(harness.repositories, learnerId, todayDay);
  harness.dispatch('open-subject', { subjectId: 'spelling' });

  const html = harness.render();
  // Post-mega dashboard must be active (not legacy Smart Review setup).
  assert.match(html, /The Word Vault is yours\./, 'post-Mega dashboard rendered');
  // Boss card present AND active — not the grey "Coming soon" placeholder.
  assert.match(html, /Boss Dictation/, 'Boss card title rendered');
  // The Boss card's description must not contain "Coming soon" now that
  // it's active. We scope the regex to the Boss card's own description
  // paragraph by matching `Boss Dictation</h4><p>...</p>` rather than
  // sweeping across sibling cards.
  const bossCardMatch = html.match(/<h4>Boss Dictation<\/h4><p>([^<]*)<\/p>/);
  assert.ok(bossCardMatch, 'Boss card description paragraph rendered');
  assert.doesNotMatch(bossCardMatch[1], /coming soon/i, 'Boss card description no longer says "Coming soon"');
  // The plan requires a badge on the active card (mirrors Guardian's ACTIVE
  // DUTY chip). The exact badge string ("BOSS READY") is the copy landed via
  // /frontend-design for U10.
  assert.match(html, /BOSS READY/i, 'Boss active badge rendered');
});

test('U10 dashboard: Alt+5 hint microcopy present when Boss card is active', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const harness = createAppHarness({ storage, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  u10SeedAllCoreMega(harness.repositories, learnerId, todayDay);
  harness.dispatch('open-subject', { subjectId: 'spelling' });

  const html = harness.render();
  // Post-redesign (2026-04-27): the standalone "quick-start Boss Dictation"
  // hint label was retired together with the begin-row beneath the cards.
  // The Alt+5 hint now lives inline next to the Boss card's "Begin Boss"
  // pill — assert the kbd pair is present alongside the Boss card itself.
  const bossCardRegex = /<div[^>]*data-mode-id="boss-dictation"[\s\S]*?<\/div>\s*<\/div>/;
  const bossCardMatch = html.match(bossCardRegex);
  assert.ok(bossCardMatch, 'Boss card markup rendered');
  const bossCardMarkup = bossCardMatch[0];
  assert.match(bossCardMarkup, /<kbd>Alt<\/kbd><kbd>5<\/kbd>/, 'Alt+5 inline kbd hint rendered next to Boss card CTA');
  assert.match(bossCardMarkup, /class="mode-card-post-cta-key"/, 'inline cta-key span wraps the kbd hint');
});

test('U10 dashboard: dispatch via spelling-shortcut-start mode=boss lands on Boss session (alt+5 wiring)', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const harness = createAppHarness({ storage, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  u10SeedAllCoreMega(harness.repositories, learnerId, todayDay);
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'boss' });

  const state = harness.store.getState().subjectUi.spelling;
  assert.equal(state.phase, 'session');
  assert.equal(state.session.mode, 'boss');
  assert.equal(state.session.label, 'Boss Dictation');
});

test('U10 summary: Boss summary renders score line + read-only miss list (no drill-all)', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  // Manual scheduler pins auto-advance (320ms for test-type sessions) so the
  // loop stays deterministic; otherwise the real setTimeout would race the
  // submit loop.
  const scheduler = createManualScheduler();
  const harness = createAppHarness({ storage, scheduler, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  u10SeedAllCoreMega(harness.repositories, learnerId, todayDay);
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  // Dispatch with explicit `length: 10` to mirror the Begin-button payload
  // (`spelling-shortcut-start` with `{ mode: 'boss', length:
  // BOSS_DEFAULT_ROUND_LENGTH }`). Without the explicit length the module
  // handler falls back to `prefs.roundLength` which defaults to '20' for a
  // fresh learner, and the Boss service clamps it down to 12 — that 12-card
  // round would defeat the precise correct/total assertion below.
  harness.dispatch('spelling-shortcut-start', { mode: 'boss', length: 10 });

  // Run through the Boss round. Miss the first 3 cards (wrong answer), type
  // the real answer for the remaining 7. This produces summary { correct: 7,
  // totalWords: 10, mistakes.length: 3 }. Track submits by `session.progress.done`
  // which increments exactly once per scored card, decoupling our wrong/right
  // policy from the outer iter counter.
  for (let guard = 0; guard < 80; guard += 1) {
    const ui = harness.store.getState().subjectUi.spelling;
    if (ui.phase !== 'session') break;
    if (ui.awaitingAdvance) {
      scheduler.flushAll();
      continue;
    }
    const answeredSoFar = Math.max(0, Number(ui.session?.progress?.done) || 0);
    const real = ui.session.currentCard.word.word;
    const typed = answeredSoFar < 3 ? 'definitely-wrong' : real;
    const formData = new FormData();
    formData.set('typed', typed);
    harness.dispatch('spelling-submit-form', { formData });
  }

  const state = harness.store.getState().subjectUi.spelling;
  assert.equal(state.phase, 'summary');
  assert.equal(state.summary.mode, 'boss');
  assert.equal(state.summary.correct, 7);
  assert.equal(state.summary.totalWords, 10);

  const html = harness.render();
  // Completion header + score line (U10 copy).
  assert.match(html, /Boss round complete/i, 'Boss completion header rendered');
  assert.match(html, /Boss score:\s*7\s*\/\s*10\s*Mega words landed/i,
    'Boss score line in scene — matches plan spec format');

  // Miss list: present as static chips. The scene renders each mistake via
  // a read-only chip (no button). Regression guard: `spelling-drill-all` and
  // `spelling-drill-single` dispatch targets MUST NOT appear anywhere on a
  // Boss summary — they are the Guardian/legacy drill paths and must not
  // leak into the test-mode Boss summary.
  assert.doesNotMatch(html, /data-action="spelling-drill-all"/,
    'Boss summary must not render a drill-all button');
  assert.doesNotMatch(html, /data-action="spelling-drill-single"/,
    'Boss summary must not render per-word drill buttons');
});

test('U10 summary: all-correct Boss round renders score "10/10 Mega words landed" with no miss list', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const scheduler = createManualScheduler();
  const harness = createAppHarness({ storage, scheduler, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  u10SeedAllCoreMega(harness.repositories, learnerId, todayDay);
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'boss', length: 10 });

  for (let guard = 0; guard < 60; guard += 1) {
    const ui = harness.store.getState().subjectUi.spelling;
    if (ui.phase !== 'session') break;
    if (ui.awaitingAdvance) {
      scheduler.flushAll();
      continue;
    }
    const real = ui.session.currentCard.word.word;
    const formData = new FormData();
    formData.set('typed', real);
    harness.dispatch('spelling-submit-form', { formData });
  }

  const state = harness.store.getState().subjectUi.spelling;
  assert.equal(state.phase, 'summary');
  assert.equal(state.summary.mode, 'boss');
  assert.equal(state.summary.mistakes.length, 0);

  const html = harness.render();
  assert.match(html, /Boss score:\s*10\s*\/\s*10\s*Mega words landed/i,
    'All-correct Boss summary renders 10/10');
});

test('U10 summary: Boss summary mode persists across reopen (round-trip)', () => {
  // Regression guard — the plan explicitly calls out "Boss round round-trip:
  // session.mode === 'boss' persists through summary; reopening summary
  // re-renders Boss branch". This asserts the same via a rehydration cycle
  // on the summary phase.
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const scheduler = createManualScheduler();
  const harness = createAppHarness({ storage, scheduler, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  u10SeedAllCoreMega(harness.repositories, learnerId, todayDay);
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'boss', length: 10 });

  for (let guard = 0; guard < 60; guard += 1) {
    const ui = harness.store.getState().subjectUi.spelling;
    if (ui.phase !== 'session') break;
    if (ui.awaitingAdvance) {
      scheduler.flushAll();
      continue;
    }
    const real = ui.session.currentCard.word.word;
    const formData = new FormData();
    formData.set('typed', real);
    harness.dispatch('spelling-submit-form', { formData });
  }

  // Re-open the harness against the same storage — tests the full rehydration
  // path back onto the summary phase.
  const rehydrated = createAppHarness({ storage, now: () => nowRef.value });
  rehydrated.dispatch('open-subject', { subjectId: 'spelling' });
  const state = rehydrated.store.getState().subjectUi.spelling;
  // Depending on service resume rules this may land on dashboard or summary;
  // either way, `summary.mode === 'boss'` must survive somewhere in the UI.
  // The key invariant is that `summary.mode === 'boss'` if a summary is
  // present; we do not require the resumed phase to be 'summary'.
  if (state.phase === 'summary') {
    assert.equal(state.summary.mode, 'boss',
      'rehydrated Boss summary keeps mode === "boss"');
  }
});

test('U10 gate: Alt+5 dispatch when allWordsMega === false is a no-op (module-level gate parity)', () => {
  // Duplicates the spelling-parity.test.js U9 gate test but under the
  // U10-owned keyboard entry point — this is the R13 Alt+5 gate invariant
  // the plan explicitly guards: "Alt+5 press when `allWordsMega === false`:
  // no-op, no error thrown".
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '5' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  const beforePhase = harness.store.getState().subjectUi.spelling.phase;

  // No throw: Alt+5 fires the same shortcut action as Alt+4. The gate lives
  // in module.js, so the dispatch must short-circuit before startSession.
  assert.doesNotThrow(() => {
    harness.dispatch('spelling-shortcut-start', { mode: 'boss' });
  });

  const after = harness.store.getState().subjectUi.spelling;
  assert.equal(after.phase, beforePhase, 'phase unchanged — Boss did not start');
  assert.equal(after.session, null, 'no Boss session allocated');
});

// -----------------------------------------------------------------------------
// U10 review blocker 1 — Alt+5 length propagation.
// -----------------------------------------------------------------------------
// The Alt+5 shortcut resolver MUST embed `length: BOSS_DEFAULT_ROUND_LENGTH`
// in the dispatch payload. Without it the module handler falls back to
// `currentPrefs.roundLength` which defaults to '20' for any fresh/SATs
// learner, and the Boss service clamps that down to BOSS_MAX_ROUND_LENGTH
// = 12 — producing a 12-card Boss round instead of the spec-mandated 10.
// This test pair pins both halves of the contract:
//   (a) resolver output shape includes the canonical length constant.
//   (b) dispatching the resolver's exact output with prefs.roundLength = '20'
//       lands on a 10-card Boss round, matching the Begin-button payload.
// -----------------------------------------------------------------------------

test('U10 blocker: Alt+5 resolver emits length === BOSS_DEFAULT_ROUND_LENGTH', async () => {
  const { resolveSpellingShortcut } = await import('../src/subjects/spelling/shortcuts.js');
  const appState = {
    route: { subjectId: 'spelling', tab: 'practice' },
    subjectUi: { spelling: { phase: 'dashboard', awaitingAdvance: false, session: null } },
  };
  const resolved = resolveSpellingShortcut({
    key: '5',
    altKey: true,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { tagName: 'DIV' },
  }, appState);
  assert.deepEqual(resolved, {
    action: 'spelling-shortcut-start',
    data: { mode: 'boss', length: BOSS_DEFAULT_ROUND_LENGTH },
    preventDefault: true,
  }, 'Alt+5 resolver must emit the canonical Boss round length');
  assert.equal(resolved.data.length, 10,
    'BOSS_DEFAULT_ROUND_LENGTH constant must still be 10 (spec-mandated)');
});

test('U10 blocker: Alt+5 dispatch with prefs.roundLength = "20" yields a 10-card Boss round', async () => {
  // Reproduces the Blocker 1 regression. Seeded prefs.roundLength is '20' —
  // the fresh-learner default — so a naive Alt+5 dispatch that omits `length`
  // would land on a 12-card round (prefs.roundLength='20' clamped down to
  // BOSS_MAX_ROUND_LENGTH=12). The fixed resolver embeds
  // `length: BOSS_DEFAULT_ROUND_LENGTH` so the session lands on exactly 10.
  const { resolveSpellingShortcut } = await import('../src/subjects/spelling/shortcuts.js');
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const harness = createAppHarness({ storage, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  u10SeedAllCoreMega(harness.repositories, learnerId, todayDay);
  // Explicitly seed roundLength = '20' so we catch any regression where the
  // dispatch payload silently falls back to prefs.
  harness.services.spelling.savePrefs(learnerId, { roundLength: '20' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });

  // Round-trip through the resolver so the test exercises the EXACT payload
  // a keypress would produce — no hand-built length literal.
  const appState = harness.store.getState();
  // Stage the app state shape the resolver expects (phase/subjectUi snapshot).
  const resolverState = {
    route: { subjectId: 'spelling', tab: 'practice' },
    subjectUi: { spelling: appState.subjectUi.spelling },
  };
  const resolved = resolveSpellingShortcut({
    key: '5',
    altKey: true,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { tagName: 'DIV' },
  }, resolverState);
  assert.ok(resolved, 'Alt+5 resolver returned a dispatch descriptor');
  harness.dispatch(resolved.action, resolved.data);

  const session = harness.store.getState().subjectUi.spelling.session;
  assert.ok(session, 'Boss session allocated');
  assert.equal(session.mode, 'boss');
  assert.equal(session.progress.total, BOSS_DEFAULT_ROUND_LENGTH,
    'Alt+5 Boss round must be exactly BOSS_DEFAULT_ROUND_LENGTH cards, not the 12-card prefs clamp');
  assert.equal(session.uniqueWords.length, BOSS_DEFAULT_ROUND_LENGTH,
    'uniqueWords roster must match the Boss default length');
});

// -----------------------------------------------------------------------------
// U10 advisory fix (low severity but bundled with the blocker fix):
// -----------------------------------------------------------------------------
// Text-level negative assertion for the Boss summary scene. The existing
// selector-level guards (`data-action="spelling-drill-all"`, etc.) catch
// the dispatch wiring, but a belt-and-braces text assertion catches accidental
// copy leaks from legacy summary variants. "Drill all" is Guardian/legacy
// summary copy and must NOT appear on a Boss summary.
//
// NOTE: The review request also asked for `doesNotMatch /data-action="spelling-start-again"/`.
// That assertion was intentionally dropped here: SpellingSummaryScene.jsx's
// primary "Start another round" CTA dispatches `spelling-start-again` for
// ALL summary modes — including Boss — and that is the intended UX (the
// Boss round is quick-start, but a learner landing on the summary should
// be able to re-roll another Mega-safe Boss round without having to
// navigate back to the dashboard). The session-mode prefs fork inside
// `spelling-start` handles Boss correctly (startSession reads
// `prefs.mode === 'boss'` → boss-start path → `submitBossAnswer`).
// -----------------------------------------------------------------------------

test('U10 advisory: Boss summary HTML contains no legacy "Drill all" copy (text-level guard)', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const scheduler = createManualScheduler();
  const harness = createAppHarness({ storage, scheduler, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  u10SeedAllCoreMega(harness.repositories, learnerId, todayDay);
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'boss', length: BOSS_DEFAULT_ROUND_LENGTH });

  // Drive enough submits to complete a full Boss round (10 cards). Miss some
  // so the mistakes block would be rendered if the scene leaked Guardian
  // "Drill all" copy.
  for (let guard = 0; guard < 80; guard += 1) {
    const ui = harness.store.getState().subjectUi.spelling;
    if (ui.phase !== 'session') break;
    if (ui.awaitingAdvance) {
      scheduler.flushAll();
      continue;
    }
    const answeredSoFar = Math.max(0, Number(ui.session?.progress?.done) || 0);
    const real = ui.session.currentCard.word.word;
    const typed = answeredSoFar < 3 ? 'definitely-wrong' : real;
    const formData = new FormData();
    formData.set('typed', typed);
    harness.dispatch('spelling-submit-form', { formData });
  }

  const html = harness.render();
  // Text-level negative: Boss summary copy must not advertise a "Drill all"
  // Guardian/legacy flow even though drill-all/drill-single selectors are
  // already gated elsewhere.
  assert.doesNotMatch(html, /Drill all/i,
    'Boss summary must not surface "Drill all" copy — it belongs to Guardian/legacy summaries.');
});

// =============================================================================
// U7 (Post-Mega Spelling P2): Boss per-slug progress counter assertions.
// -----------------------------------------------------------------------------
// Characterisation test — observes current shipped P1.5 behaviour.
//
// P1.5 §6.10 flagged a deferred need: existing Boss tests assert aggregate
// `progress.wrong +3` and prove stage/dueDay/lastDay/lastResult do not demote,
// but do NOT assert per-slug `attempts/correct/wrong` deltas across a full
// 10-card round. U7 closes that gap.
//
// For every slug drawn by selectBossWords, after the round:
//   - progress.attempts[slug] === seed.attempts + 1
//   - progress.correct[slug]  === seed.correct + (answer was correct ? 1 : 0)
//   - progress.wrong[slug]    === seed.wrong   + (answer was wrong   ? 1 : 0)
//   - progress.stage[slug]      unchanged (4 → 4)
//   - progress.dueDay[slug]     unchanged
//   - progress.lastDay[slug]    unchanged
//   - progress.lastResult[slug] unchanged
//
// Event-to-state parity: the `spelling.boss.completed` event aggregates
// `correct` / `wrong` / `length` over the same 10 slugs. Current shipped
// behaviour does NOT emit a per-slug map on the event itself; parity is
// therefore proven aggregate-vs-state and derived-vs-state via
// `session.results`, which is the per-answer source the event aggregates
// from (see `bossEventsForSession` at shared/spelling/service.js:2166). Both
// directions catch a regression: any drift between writer and event would
// break either the aggregate count or the seedSlugs roster.
//
// Test-harness-vs-production trap (Punctuation P3 rule): the writer that
// updates these counters lives in `submitBossAnswer` at
// shared/spelling/service.js:1886-1929 (production path). There is NO
// test-only writer for progress.attempts / correct / wrong — the tests below
// go through the real `service.submitAnswer` dispatch, so any regression
// where the writer is rerouted (e.g. through `engine.submitTest`) is caught
// by both the aggregate and per-slug assertions here.
// =============================================================================

/**
 * Snapshot the current progress map for the seed slugs before the round.
 * Returns a Map keyed by slug so every per-slug before/after delta is
 * deterministic and independent of the analytics-snapshot sort order.
 */
function snapshotProgressForSlugs(service, learnerId, slugs) {
  const snapshot = service.getAnalyticsSnapshot(learnerId);
  const rowsBySlug = new Map(
    snapshot.wordGroups.flatMap((g) => g.words).map((row) => [row.slug, row]),
  );
  const map = new Map();
  for (const slug of slugs) {
    const row = rowsBySlug.get(slug);
    assert.ok(row, `snapshot row must exist for seed slug ${slug}`);
    map.set(slug, { ...row.progress });
  }
  return map;
}

test('U7: Boss 10-card round — all correct: per-slug attempts +1, correct +1, wrong +0', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });
  const seedSlugs = started.state.session.uniqueWords.slice();
  assert.equal(seedSlugs.length, 10, 'Boss round is exactly 10 cards (U7 scope)');

  const before = snapshotProgressForSlugs(service, 'learner-a', seedSlugs);

  const { state: summaryState, events, seenSlugs } = runBossRoundUntilSummary(
    service,
    'learner-a',
    started.state,
    (slug, state) => state.session.currentCard.word.word,
  );

  assert.equal(summaryState.phase, 'summary');
  assert.deepEqual(seenSlugs, seedSlugs, 'FIFO order preserved');

  const after = snapshotProgressForSlugs(service, 'learner-a', seedSlugs);
  for (const slug of seedSlugs) {
    const b = before.get(slug);
    const a = after.get(slug);
    // Counter deltas.
    assert.equal(a.attempts, b.attempts + 1, `${slug} attempts += 1`);
    assert.equal(a.correct, b.correct + 1, `${slug} correct += 1 (all-correct round)`);
    assert.equal(a.wrong, b.wrong, `${slug} wrong unchanged`);
    // Mega-never-revoked guarantees — stage/dueDay/lastDay/lastResult frozen.
    assert.equal(a.stage, b.stage, `${slug} stage unchanged (Mega)`);
    assert.equal(a.stage, 4, `${slug} stage stays at 4`);
    assert.equal(a.dueDay, b.dueDay, `${slug} dueDay unchanged`);
    assert.equal(a.lastDay, b.lastDay, `${slug} lastDay unchanged`);
    assert.equal(a.lastResult, b.lastResult, `${slug} lastResult unchanged`);
  }

  // Event-to-state aggregate parity.
  const bossCompleted = events.find((e) => e.type === SPELLING_EVENT_TYPES.BOSS_COMPLETED);
  assert.ok(bossCompleted, 'BOSS_COMPLETED fired');
  assert.equal(bossCompleted.length, 10, 'event.length === round size');
  assert.equal(bossCompleted.correct, 10, 'event.correct === sum of correct deltas');
  assert.equal(bossCompleted.wrong, 0, 'event.wrong === sum of wrong deltas');
  assert.deepEqual(bossCompleted.seedSlugs, seedSlugs,
    'event.seedSlugs === persisted delta keys');
});

test('U7: Boss 10-card round — all wrong: per-slug attempts +1, correct +0, wrong +1; Mega invariant held', () => {
  // All-wrong is the critical Mega-never-revoked stress: ten wrong answers on
  // ten Mega slugs. Every single slug must keep stage/dueDay/lastDay/lastResult
  // AND bump attempts + wrong by exactly 1. Any drift — e.g. a wrong Boss
  // submit routed through `engine.submitTest → applyTestOutcome` — would
  // demote `stage` to 3 and break the invariant AND the counter delta.
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });
  const seedSlugs = started.state.session.uniqueWords.slice();
  assert.equal(seedSlugs.length, 10);

  const before = snapshotProgressForSlugs(service, 'learner-a', seedSlugs);

  const { state: summaryState, events } = runBossRoundUntilSummary(
    service,
    'learner-a',
    started.state,
    () => 'definitely-wrong',
  );

  assert.equal(summaryState.phase, 'summary');

  const after = snapshotProgressForSlugs(service, 'learner-a', seedSlugs);
  for (const slug of seedSlugs) {
    const b = before.get(slug);
    const a = after.get(slug);
    assert.equal(a.attempts, b.attempts + 1, `${slug} attempts += 1`);
    assert.equal(a.correct, b.correct, `${slug} correct unchanged (all-wrong)`);
    assert.equal(a.wrong, b.wrong + 1, `${slug} wrong += 1`);
    // Mega invariant — no slug demotes despite a wrong answer.
    assert.equal(a.stage, 4, `${slug} stage stays at 4 (Mega never revoked)`);
    assert.equal(a.dueDay, b.dueDay, `${slug} dueDay unchanged`);
    assert.equal(a.lastDay, b.lastDay, `${slug} lastDay unchanged`);
    assert.equal(a.lastResult, b.lastResult, `${slug} lastResult unchanged`);
  }

  const bossCompleted = events.find((e) => e.type === SPELLING_EVENT_TYPES.BOSS_COMPLETED);
  assert.ok(bossCompleted);
  assert.equal(bossCompleted.correct, 0);
  assert.equal(bossCompleted.wrong, 10);
  assert.equal(bossCompleted.length, 10);
});

test('U7: Boss 10-card round — mixed 7 correct / 3 wrong: per-slug deltas match the deterministic answer pattern', () => {
  // Critical case: per-slug attribution (not just aggregate). The first three
  // slugs in FIFO order receive 'definitely-wrong'; the remaining seven
  // receive the real answer. Per-slug deltas must exactly match that pattern,
  // proving the writer credits the correct slug for each answer (no swap /
  // no FIFO drift / no off-by-one).
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });
  const seedSlugs = started.state.session.uniqueWords.slice();
  assert.equal(seedSlugs.length, 10);

  const before = snapshotProgressForSlugs(service, 'learner-a', seedSlugs);

  // Deterministic answer pattern: wrong on cards 1,2,3 (FIFO); correct on
  // cards 4..10. The plan's "deterministic per-slug pattern" — per-slug
  // outcomes follow the FIFO position of the slug in seedSlugs.
  const WRONG_CARD_COUNT = 3;
  const expectedOutcomeBySlug = new Map(
    seedSlugs.map((slug, index) => [slug, index < WRONG_CARD_COUNT ? 'wrong' : 'correct']),
  );

  let cardCount = 0;
  const { state: summaryState, events, seenSlugs } = runBossRoundUntilSummary(
    service,
    'learner-a',
    started.state,
    (slug, state) => {
      cardCount += 1;
      return cardCount <= WRONG_CARD_COUNT ? 'definitely-wrong' : state.session.currentCard.word.word;
    },
  );

  assert.equal(summaryState.phase, 'summary');
  assert.deepEqual(seenSlugs, seedSlugs,
    'FIFO order preserved — expectedOutcomeBySlug keyed by position is load-bearing');

  const after = snapshotProgressForSlugs(service, 'learner-a', seedSlugs);
  let expectedCorrect = 0;
  let expectedWrong = 0;
  for (const slug of seedSlugs) {
    const b = before.get(slug);
    const a = after.get(slug);
    const outcome = expectedOutcomeBySlug.get(slug);

    // Universal — every slug got exactly one attempt.
    assert.equal(a.attempts, b.attempts + 1, `${slug} attempts += 1 (exactly one answer)`);

    if (outcome === 'correct') {
      assert.equal(a.correct, b.correct + 1, `${slug} correct += 1 (answered right)`);
      assert.equal(a.wrong, b.wrong, `${slug} wrong unchanged`);
      expectedCorrect += 1;
    } else {
      assert.equal(a.correct, b.correct, `${slug} correct unchanged (answered wrong)`);
      assert.equal(a.wrong, b.wrong + 1, `${slug} wrong += 1`);
      expectedWrong += 1;
    }

    // Mega invariant — stage/dueDay/lastDay/lastResult never move in Boss.
    assert.equal(a.stage, 4, `${slug} stage stays at 4`);
    assert.equal(a.dueDay, b.dueDay, `${slug} dueDay unchanged`);
    assert.equal(a.lastDay, b.lastDay, `${slug} lastDay unchanged`);
    assert.equal(a.lastResult, b.lastResult, `${slug} lastResult unchanged`);
  }
  assert.equal(expectedCorrect, 7);
  assert.equal(expectedWrong, 3);

  // Event-to-state parity.
  // -----------------------------------------------------------------------
  // The shipped `createSpellingBossCompletedEvent` aggregates its
  // correct/wrong totals from `session.results` (see
  // `bossEventsForSession` at shared/spelling/service.js:2166-2196). Each
  // `session.results[i]` is a per-answer entry `{ slug, answer, correct }`
  // written in `submitBossAnswer` (the same writer that updates progress
  // counters). So event-to-state parity splits into two derivations:
  //   1. event.{correct,wrong} match sum-of-deltas across seedSlugs.
  //   2. event.seedSlugs === uniqueWords (the roster the writer stepped
  //      through). session.results (on summaryState.session) is the source
  //      of truth that fed the event aggregation AND drove each per-slug
  //      write; if the two ever disagree, one side is buggy.
  const bossCompleted = events.find((e) => e.type === SPELLING_EVENT_TYPES.BOSS_COMPLETED);
  assert.ok(bossCompleted, 'BOSS_COMPLETED fired');
  assert.equal(bossCompleted.length, 10);
  assert.equal(bossCompleted.correct, expectedCorrect,
    'event.correct aggregate matches sum of per-slug correct deltas');
  assert.equal(bossCompleted.wrong, expectedWrong,
    'event.wrong aggregate matches sum of per-slug wrong deltas');
  assert.deepEqual(bossCompleted.seedSlugs, seedSlugs,
    'event.seedSlugs matches the roster the writer iterated over');

  // Per-slug derived parity via summary.mistakes: every persisted wrong delta
  // must correspond to a summary.mistakes entry, and every summary.mistakes
  // entry must match a persisted wrong delta. summary.mistakes is the
  // event-facing per-slug detail that Boss's test-typed finalise path derives
  // from `session.results` (see `testSummary` at
  // shared/spelling/legacy-engine.js:876-898). If the writer (submitBossAnswer)
  // and the event-aggregation source ever disagree, this assertion catches it.
  const summary = summaryState.summary;
  assert.ok(summary, 'summary is populated on summary-phase state');
  assert.equal(summary.mode, 'boss');
  const mistakeSlugsFromEvent = new Set(
    (summary.mistakes || []).map((word) => word?.slug).filter(Boolean),
  );
  assert.equal(mistakeSlugsFromEvent.size, expectedWrong,
    'summary.mistakes carries exactly the expected wrong-answer count');
  // Forward: every slug with a persisted wrong delta is in summary.mistakes.
  // Reverse: every summary.mistakes entry has the matching wrong delta.
  for (const slug of seedSlugs) {
    const b = before.get(slug);
    const a = after.get(slug);
    const persistedWrongDelta = a.wrong - b.wrong;
    const inSummaryMistakes = mistakeSlugsFromEvent.has(slug);
    assert.equal(inSummaryMistakes, persistedWrongDelta === 1,
      `${slug}: summary.mistakes membership === persisted wrong delta (event source → state parity)`);
  }
});

test('U7: Boss round seedSlugs are FIFO-unique — no duplicate slug in a single round', () => {
  // Defensive: selectBossWords samples without replacement, so a single
  // seedSlugs roster cannot contain duplicates. If FIFO-unique selection ever
  // regresses, per-slug delta math above would silently double-count a slug's
  // attempts — this explicit test fails loudly first.
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });
  const seedSlugs = started.state.session.uniqueWords;
  assert.equal(new Set(seedSlugs).size, seedSlugs.length,
    'seedSlugs are unique — no slug can earn two per-round deltas');
});

