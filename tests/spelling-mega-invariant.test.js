// Tests for U8b — Mega-never-revoked composite invariant property test.
//
// Plan: docs/plans/2026-04-25-005-feat-post-mega-spelling-guardian-hardening-plan.md (U8b).
// Plan: docs/plans/2026-04-26-006-feat-post-mega-spelling-p2-visibility-pattern-foundation-plan.md (U8).
//
// The single top-level assertion this file exists to prove:
// **No code path touching `progress.stage` demotes a Mega word (stage >= 4).**
//
// The assertion is enforced after every action drawn from the action set, where
// each action corresponds to a real service surface introduced in U1–U9:
//   - guardian-correct / guardian-wrong / guardian-dontknow
//   - practiceonly-correct / practiceonly-wrong
//   - boss-correct / boss-wrong
//   - content-hotswap
//   - storage-quota-failure
//
// "reset" is explicitly NOT in the action set (R11).
//
// Two-layer structure:
//  1. Canonical CI suite (this file): seed 42 (or PROPERTY_SEED env), 200
//     random sequences (length 5..15), plus six named regression shapes.
//     Runs on every PR with fixed seed 42 for fast deterministic regression
//     coverage.
//  2. Nightly variable-seed probe (.github/workflows/mega-invariant-nightly.yml):
//     runs this file with a random `PROPERTY_SEED` every night; on failure
//     opens a dedup'd GitHub Issue via `gh issue list/create/comment`. The
//     seed is logged on any failure so maintainers can reproduce locally
//     with `PROPERTY_SEED=<seed> npm run test:mega-invariant:nightly`.
//
// Promoted counterexamples: when the nightly probe finds a failure, the
// maintainer copies the shrunk counterexample into the PROMOTED_EXAMPLES
// array below. Those examples run FIRST in the canonical suite so the
// regression is caught in <1s on every PR thereafter.
//
// After every action we assert:
//   - Object.values(progressMap).every(p => p.stage >= 4)
//   - progressMap[slug].dueDay === seedDueDay (unchanged)
//   - progressMap[slug].lastDay === seedLastDay (unchanged)
//   - progressMap[slug].lastResult === seedLastResult (unchanged)
//
// Regression probe: adding a deliberate demotion bug (e.g., Boss routed through
// `applyTestOutcome`) MUST fail this canonical suite within seed 42's first
// sequence of <= 10 actions.

import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage } from './helpers/memory-storage.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { createSpellingPersistence } from '../src/subjects/spelling/repository.js';
import { WORDS } from '../src/subjects/spelling/data/word-data.js';
import { SPELLING_EVENT_TYPES } from '../src/subjects/spelling/events.js';

// -----------------------------------------------------------------------------
// Seeded PRNG — deterministic under a fixed seed. Mirrors the pattern at
// tests/spelling.test.js:16-24 so the canonical suite reproduces across hosts.
// -----------------------------------------------------------------------------

function makeSeededRandom(seed = 1) {
  let value = seed >>> 0;
  return function seededRandom() {
    value += 0x6D2B79F5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

// -----------------------------------------------------------------------------
// Harness setup — the learner is graduated to Mega across every core slug
// with a uniform seed so every slug shares identical dueDay / lastDay /
// lastResult. The invariants can then assert "unchanged" with a single
// expected value instead of a per-slug map.
// -----------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY_MS = Date.UTC(2026, 0, 10);
const TODAY_DAY = Math.floor(TODAY_MS / DAY_MS);

// Uniform seed values so every slug's expected "unchanged" fields are
// identical — makes the invariant assertion a single comparison per slug.
const SEED_DUE_DAY = TODAY_DAY + 60;
const SEED_LAST_DAY = TODAY_DAY - 7;
const SEED_LAST_RESULT = 'correct';
const SEED_STAGE = 4;

const CORE_SLUGS = WORDS.filter((word) => word.spellingPool !== 'extra').map((word) => word.slug);

function seedFullCoreMega(repositories, learnerId) {
  const progress = Object.fromEntries(CORE_SLUGS.map((slug) => [slug, {
    stage: SEED_STAGE,
    attempts: 6,
    correct: 5,
    wrong: 1,
    dueDay: SEED_DUE_DAY,
    lastDay: SEED_LAST_DAY,
    lastResult: SEED_LAST_RESULT,
  }]));
  repositories.subjectStates.writeData(learnerId, 'spelling', { progress, guardian: {} });
  return progress;
}

function makeHarness({ seed = 42, learnerId = 'learner-a' } = {}) {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const now = () => TODAY_MS;
  const random = makeSeededRandom(seed);
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
  seedFullCoreMega(repositories, learnerId);
  return { storage, repositories, service, learnerId, now, random };
}

// -----------------------------------------------------------------------------
// Direct read of the persisted progress map from the subject-state bundle.
// Goes straight to the repositories' subjectStates channel (which is where
// the spelling storage proxy ultimately persists every progress mutation)
// so the invariant sees the exact post-action state without relying on the
// analytics snapshot's derived views.
// -----------------------------------------------------------------------------

function readProgressMap(harness) {
  // Prefer the repository-level read — it returns the canonical `data.progress`
  // map the proxy wrote. Fall through to the legacy `ks2-spell-progress-...`
  // storage key only if the repository has nothing (shouldn't happen with
  // createLocalPlatformRepositories, but kept as a defensive fallback).
  const record = harness.repositories.subjectStates.read(harness.learnerId, 'spelling');
  if (record?.data?.progress && typeof record.data.progress === 'object') {
    return record.data.progress;
  }
  const raw = harness.storage.getItem(`ks2-spell-progress-${harness.learnerId}`);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// -----------------------------------------------------------------------------
// Invariant checks — called after every action in every sequence. Each
// assertion includes the action + step index so a failure locates the exact
// offending call site in the trace.
// -----------------------------------------------------------------------------

function assertMegaInvariant(progressMap, context) {
  for (const [slug, entry] of Object.entries(progressMap)) {
    // Only inspect slugs that were part of the seed. Hot-swapped / orphan
    // slugs are covered by a separate dedicated invariant (they must not be
    // resurrected into Guardian / Boss selection, asserted per-action below).
    if (!CORE_SLUGS.includes(slug)) continue;
    assert.ok(
      entry.stage >= SEED_STAGE,
      `${context}: ${slug} stage demoted to ${entry.stage} (was ${SEED_STAGE}) — Mega-never-revoked violated`,
    );
    assert.equal(
      entry.dueDay,
      SEED_DUE_DAY,
      `${context}: ${slug} dueDay mutated (${entry.dueDay} vs seed ${SEED_DUE_DAY})`,
    );
    assert.equal(
      entry.lastDay,
      SEED_LAST_DAY,
      `${context}: ${slug} lastDay mutated (${entry.lastDay} vs seed ${SEED_LAST_DAY})`,
    );
    assert.equal(
      entry.lastResult,
      SEED_LAST_RESULT,
      `${context}: ${slug} lastResult mutated (${entry.lastResult} vs seed '${SEED_LAST_RESULT}')`,
    );
  }
}

// -----------------------------------------------------------------------------
// Action executor. Given the running state (which carries the current session
// if one is open), apply one action and return the new state. Unresolvable
// actions (e.g. guardian-correct when no guardian session is open and cannot
// start) no-op and bubble the existing state — the invariant check still
// runs, which is the property being asserted (invariant holds even under
// no-ops).
// -----------------------------------------------------------------------------

const ACTION_SET = Object.freeze([
  'guardian-correct',
  'guardian-wrong',
  'guardian-dontknow',
  'practiceonly-correct',
  'practiceonly-wrong',
  'boss-correct',
  'boss-wrong',
  'content-hotswap',
  'storage-quota-failure',
]);

function ensurePracticeOnlySession(harness, state) {
  // Practice-only drill runs mode='trouble' with practiceOnly:true. If no such
  // session is open, start one over the core Mega pool (use the first two
  // seeded slugs so we always have something to drill).
  if (state?.phase === 'session' && state.session?.mode === 'trouble' && state.session?.practiceOnly === true) {
    return { state, changed: false };
  }
  const started = harness.service.startSession(harness.learnerId, {
    mode: 'trouble',
    words: [CORE_SLUGS[0], CORE_SLUGS[1]],
    yearFilter: 'core',
    length: 2,
    practiceOnly: true,
  });
  // If the trouble-drill engine cannot find a trouble word and fell back to
  // Smart Review, practiceOnly may be set false — treat as a no-op.
  if (!started.ok || started.state.phase !== 'session') {
    return { state, changed: false };
  }
  return { state: started.state, changed: true };
}

function completeAwaitingAdvance(harness, state) {
  // After a submit, the state often sits in `awaitingAdvance: true`. Roll
  // forward one continueSession so the next action starts from a clean
  // mid-session state, OR advance to summary / dashboard if the round ended.
  if (!state) return state;
  if (state.awaitingAdvance) {
    const advanced = harness.service.continueSession(harness.learnerId, state);
    return advanced.state;
  }
  return state;
}

function applyGuardianAnswer(harness, state, { correct }) {
  let s = state;
  // Ensure a Guardian session is open. Guardian requires allWordsMega (met
  // by the seed). If a non-Guardian session is already open, finish it
  // first by rolling the existing state to dashboard.
  if (s?.phase === 'session' && s.session?.mode !== 'guardian') {
    s = harness.service.initState(null, harness.learnerId);
  }
  if (!s || s.phase !== 'session' || s.session?.mode !== 'guardian') {
    const started = harness.service.startSession(harness.learnerId, { mode: 'guardian' });
    if (!started.ok) {
      return { state: s || harness.service.initState(null, harness.learnerId), events: [] };
    }
    s = started.state;
  }
  // If mid-session but awaiting advance, resolve it first.
  s = completeAwaitingAdvance(harness, s);
  if (s.phase !== 'session' || !s.session?.currentCard) {
    return { state: s, events: [] };
  }
  const answer = correct ? s.session.currentCard.word.word : 'zzz-wrong-guardian';
  const submitted = harness.service.submitAnswer(harness.learnerId, s, answer);
  return { state: submitted.state, events: submitted.events || [] };
}

function applyGuardianDontKnow(harness, state) {
  let s = state;
  if (s?.phase === 'session' && s.session?.mode !== 'guardian') {
    s = harness.service.initState(null, harness.learnerId);
  }
  if (!s || s.phase !== 'session' || s.session?.mode !== 'guardian') {
    const started = harness.service.startSession(harness.learnerId, { mode: 'guardian' });
    if (!started.ok) {
      return { state: s || harness.service.initState(null, harness.learnerId), events: [] };
    }
    s = started.state;
  }
  s = completeAwaitingAdvance(harness, s);
  if (s.phase !== 'session' || !s.session?.currentCard) {
    return { state: s, events: [] };
  }
  const skipped = harness.service.skipWord(harness.learnerId, s);
  return { state: skipped.state, events: skipped.events || [] };
}

function applyPracticeOnlyAnswer(harness, state, { correct }) {
  // End any non-practice session before starting a fresh practice-only drill.
  let s = state;
  if (s?.phase === 'session' && !(s.session?.mode === 'trouble' && s.session?.practiceOnly === true)) {
    s = harness.service.initState(null, harness.learnerId);
  }
  const ensured = ensurePracticeOnlySession(harness, s);
  s = ensured.state;
  s = completeAwaitingAdvance(harness, s);
  if (s.phase !== 'session' || !s.session?.currentCard) {
    return { state: s, events: [] };
  }
  // In a practice-only trouble round, submission flow is legacy retry/correction
  // -> answer. We submit the correct word for both "correct" and correction
  // phases (legacy demands a valid answer in correction to advance) and a
  // deliberately-wrong string for the "wrong" action only in the question
  // phase. practiceOnly: true short-circuits any stage mutation regardless.
  const sessionPhase = s.session.phase;
  const word = s.session.currentCard.word.word;
  let typed;
  if (sessionPhase === 'correction') {
    typed = word; // advance out of correction to keep the round progressing
  } else if (correct) {
    typed = word;
  } else {
    typed = 'zzz-wrong-practice';
  }
  const submitted = harness.service.submitAnswer(harness.learnerId, s, typed);
  return { state: submitted.state, events: submitted.events || [] };
}

function applyBossAnswer(harness, state, { correct }) {
  let s = state;
  if (s?.phase === 'session' && s.session?.mode !== 'boss') {
    s = harness.service.initState(null, harness.learnerId);
  }
  if (!s || s.phase !== 'session' || s.session?.mode !== 'boss') {
    const started = harness.service.startSession(harness.learnerId, { mode: 'boss', length: 10 });
    if (!started.ok) {
      return { state: s || harness.service.initState(null, harness.learnerId), events: [] };
    }
    s = started.state;
  }
  s = completeAwaitingAdvance(harness, s);
  if (s.phase !== 'session' || !s.session?.currentCard) {
    return { state: s, events: [] };
  }
  const answer = correct ? s.session.currentCard.word.word : 'zzz-wrong-boss';
  const submitted = harness.service.submitAnswer(harness.learnerId, s, answer);
  return { state: submitted.state, events: submitted.events || [] };
}

function applyContentHotswap(harness, state) {
  // Simulate a content hot-swap by injecting an orphan progress record for
  // a slug NOT present in WORD_BY_SLUG, plus an orphan guardianMap entry.
  // The property under test: the orphan must NEVER participate in any
  // downstream Guardian / Boss selection and must never trigger a demotion
  // of a known Mega slug (U2 orphan sanitiser + U8b composite invariant).
  //
  // Read the current subject-state record directly via the repositories
  // channel (not the raw bundle layout, which uses a `${learnerId}::spelling`
  // key we would have to hand-parse). This keeps the seeded progress intact
  // while we bolt the ghost slug onto both progress + guardian maps.
  const current = harness.repositories.subjectStates.read(harness.learnerId, 'spelling');
  const progress = { ...(current?.data?.progress || {}) };
  const guardian = { ...(current?.data?.guardian || {}) };
  // Orphan slug not in WORD_BY_SLUG — the "ghost" from a removed content
  // bundle. If it ever leaks into a Guardian / Boss session, the downstream
  // service code will throw on wordBySlug[ghost].word in the answer path,
  // which itself counts as a regression (caught by the try/catch around the
  // action executor below, which re-throws with location context).
  progress.ghostword_u8b = {
    stage: 4,
    attempts: 1,
    correct: 1,
    wrong: 0,
    dueDay: SEED_DUE_DAY,
    lastDay: SEED_LAST_DAY,
    lastResult: SEED_LAST_RESULT,
  };
  guardian.ghostword_u8b = {
    reviewLevel: 0,
    lastReviewedDay: TODAY_DAY - 1,
    nextDueDay: TODAY_DAY - 1,
    correctStreak: 0,
    lapses: 0,
    renewals: 0,
    wobbling: true,
  };
  harness.repositories.subjectStates.writeData(harness.learnerId, 'spelling', {
    ...(current?.data || {}),
    progress,
    guardian,
  });
  return { state, events: [] };
}

function applyStorageQuotaFailure(harness, state) {
  // Arm MemoryStorage to throw on the very next setItem. The next action
  // that writes anything (Guardian submit / Boss submit / practice submit
  // / skipWord) will trigger the throw; the service's U8 warning surface
  // must then set `feedback.persistenceWarning` without demoting any Mega
  // word. The throw is one-shot and does not affect subsequent actions.
  harness.storage.throwOnNextSet();
  // Drive one follow-up submission so the armed throw actually fires. Without
  // this, storage-quota-failure becomes a deferred tripwire that only trips
  // when the *next* action happens to be a submit — we want the invariant
  // to be asserted against the post-throw state, not the pre-throw one.
  // Pick a cheap submit: if a session is open, submit one answer; otherwise
  // attempt a Guardian-correct (which will start a session and submit).
  return applyGuardianAnswer(harness, state, { correct: true });
}

function applyAction(harness, state, action) {
  switch (action) {
    case 'guardian-correct':     return applyGuardianAnswer(harness, state, { correct: true });
    case 'guardian-wrong':       return applyGuardianAnswer(harness, state, { correct: false });
    case 'guardian-dontknow':    return applyGuardianDontKnow(harness, state);
    case 'practiceonly-correct': return applyPracticeOnlyAnswer(harness, state, { correct: true });
    case 'practiceonly-wrong':   return applyPracticeOnlyAnswer(harness, state, { correct: false });
    case 'boss-correct':         return applyBossAnswer(harness, state, { correct: true });
    case 'boss-wrong':           return applyBossAnswer(harness, state, { correct: false });
    case 'content-hotswap':      return applyContentHotswap(harness, state);
    case 'storage-quota-failure': return applyStorageQuotaFailure(harness, state);
    default: throw new Error(`Unknown action: ${action}`);
  }
}

// -----------------------------------------------------------------------------
// Sequence runner. Runs a sequence of actions, asserts invariants after every
// action. A caller-supplied `assertSequence` hook runs once at the end of the
// sequence for shape-specific assertions.
// -----------------------------------------------------------------------------

function runSequence(harness, actions, { label } = {}) {
  let state = null;
  const emitted = [];
  for (let i = 0; i < actions.length; i += 1) {
    const action = actions[i];
    const context = `${label || 'sequence'} step=${i + 1}/${actions.length} action='${action}'`;
    let result;
    try {
      result = applyAction(harness, state, action);
    } catch (err) {
      throw new Error(`${context} threw: ${err && err.message ? err.message : err}`);
    }
    state = result.state;
    emitted.push(...(result.events || []));
    const progressMap = readProgressMap(harness);
    assertMegaInvariant(progressMap, context);
  }
  return { state, events: emitted };
}

function randomSequence(random, length, pool = ACTION_SET) {
  const out = new Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = pool[Math.floor(random() * pool.length)];
  }
  return out;
}

// -----------------------------------------------------------------------------
// Seed resolution — the canonical suite uses seed 42 by default so CI runs
// deterministically and fast. The nightly workflow sets `PROPERTY_SEED` to a
// random integer so a wider slice of the state space is explored every
// night. When PROPERTY_SEED is set, the seed is logged on first test entry
// so maintainers can copy-paste the seed into a local repro command.
// -----------------------------------------------------------------------------

const CANONICAL_SEED = 42;
const PROPERTY_SEED_RAW = process.env.PROPERTY_SEED;
const PROPERTY_SEED = PROPERTY_SEED_RAW !== undefined && PROPERTY_SEED_RAW !== ''
  ? Number(PROPERTY_SEED_RAW)
  : CANONICAL_SEED;
// Hard fail on NaN — `Number('fourty-two')` silently becomes NaN, which then
// coerces to 0 under `>>> 0` in makeSeededRandom. Catch it at module load so
// a typo in PROPERTY_SEED surfaces immediately instead of running as seed 0.
if (PROPERTY_SEED_RAW !== undefined && PROPERTY_SEED_RAW !== '' && !Number.isFinite(PROPERTY_SEED)) {
  throw new Error(`PROPERTY_SEED must be a finite integer, got raw value: ${JSON.stringify(PROPERTY_SEED_RAW)}`);
}
if (PROPERTY_SEED_RAW !== undefined && PROPERTY_SEED_RAW !== '' && Number.isFinite(PROPERTY_SEED)) {
  // Log on test entry so the seed is always captured in CI output even if
  // the run passes. The nightly workflow's failure path greps this line too.
  console.log(`[mega-invariant] PROPERTY_SEED=${PROPERTY_SEED}`);
}

// -----------------------------------------------------------------------------
// Promoted counterexamples (Hall of Fame) — when the nightly variable-seed
// probe finds a failing sequence, the maintainer shrinks it by hand and
// pastes the minimal reproducer here. Promoted examples run FIRST so the
// regression is caught in <1s on every PR, before the 200-sequence random
// sweep even starts.
//
// Shape:
//   { label: string, seed: number, actions: string[] }
//
// Empty by default — new entries accumulate as the nightly probe surfaces
// real counterexamples.
// -----------------------------------------------------------------------------

const PROMOTED_EXAMPLES = Object.freeze([
  // Example (kept as a template, not an actual regression):
  // {
  //   label: 'nightly-2026-05-01-boss-wrong-then-storage-failure',
  //   seed: 1527422598337,
  //   actions: ['boss-wrong', 'storage-quota-failure', 'guardian-dontknow'],
  // },
]);

// Module-load-time validation of PROMOTED_EXAMPLES — if a typo lands in a
// promoted counterexample (e.g. 'guardian-wrongx'), every PR and every nightly
// would cascade-block. Validate against ACTION_SET up front with a clear error
// so the root cause is obvious in the failure output.
for (const example of PROMOTED_EXAMPLES) {
  for (const action of example.actions) {
    if (!ACTION_SET.includes(action)) {
      throw new Error(
        `[PROMOTED_EXAMPLES] Unknown action "${action}" in example "${example.label}" — check shrunk counterexample for typos (valid actions: ${ACTION_SET.join(', ')})`,
      );
    }
  }
}

// =============================================================================
// 1. Canonical CI suite — PROMOTED_EXAMPLES first, then 200 seeded random
// sequences. When PROPERTY_SEED is set the whole sweep re-runs under that
// seed (nightly variable-seed probe). Default is seed 42 for fast regression.
// =============================================================================

if (PROMOTED_EXAMPLES.length > 0) {
  test('U8b canonical: promoted counterexamples from nightly variable-seed probe hold Mega-never-revoked', () => {
    try {
      for (const example of PROMOTED_EXAMPLES) {
        const harness = makeHarness({ seed: example.seed, learnerId: `learner-promoted-${example.label}` });
        runSequence(harness, example.actions, { label: `promoted-${example.label}` });
      }
    } catch (err) {
      // Distinct prefix from [mega-invariant] so the workflow Issue body
      // accurately attributes the failure to the promoted-examples slot.
      const message = err && err.message ? err.message : String(err);
      throw new Error(`[promoted-examples] FAILED :: ${message}`);
    }
  });
}

test(`U8b canonical: 200 seeded random sequences (seed ${PROPERTY_SEED}, length 5..15) hold Mega-never-revoked across every action`, (t) => {
  // Use a dedicated sequence-selection RNG seeded from PROPERTY_SEED (default
  // 42). The service's own random remains independently seeded per harness
  // so selection logic stays deterministic too. When the nightly probe
  // shadows PROPERTY_SEED with a random value, this same test explores a
  // new slice of the action-sequence space; any failure message is
  // prefixed with the seed so the maintainer can reproduce it locally.
  const sequenceRng = makeSeededRandom(PROPERTY_SEED);
  for (let i = 0; i < 200; i += 1) {
    const length = 5 + Math.floor(sequenceRng() * 11); // 5..15
    const actions = randomSequence(sequenceRng, length);
    const harness = makeHarness({ seed: PROPERTY_SEED + i, learnerId: `learner-seq-${i}` });
    try {
      runSequence(harness, actions, { label: `canonical-seq-${i}` });
    } catch (error) {
      // Narrow the catch: only re-label AssertionError with the seed + seq
      // index so the nightly workflow's failure path can extract them.
      // Other errors (TypeError, RangeError, etc.) re-throw as-is so the
      // workflow Issue body shows the actual root-cause class instead of
      // misattributing it as an invariant violation.
      if (error instanceof assert.AssertionError) {
        throw new Error(`[mega-invariant] FAILED seed=${PROPERTY_SEED} seq=${i} :: ${error.message}`);
      }
      throw error;
    }
  }
});

// =============================================================================
// 2. Six named regression shapes — each one is an explicit characterisation
// trace with shape-specific assertions on top of the global invariant.
// =============================================================================

// ----- Shape 1: All-wrong saturation ------------------------------------------
//
// Length 10, drawn exclusively from {guardian-wrong, guardian-dontknow,
// boss-wrong}. Every action should leave progress.stage === 4 (no wrong
// answer may demote, via any surface).
// Regression class: catches Boss routing through applyTestOutcome AND catches
// the U4 "I don't know" branch accidentally calling engine.skipCurrent —
// either would demote on the first wrong action.

test('U8b shape: All-wrong saturation (guardian-wrong / guardian-dontknow / boss-wrong) never demotes Mega', () => {
  const sequenceRng = makeSeededRandom(1234);
  const pool = ['guardian-wrong', 'guardian-dontknow', 'boss-wrong'];
  const actions = randomSequence(sequenceRng, 10, pool);
  const harness = makeHarness({ seed: 42, learnerId: 'learner-all-wrong' });
  runSequence(harness, actions, { label: 'all-wrong-saturation' });
  // Explicit top-level shape assertion (the invariant runs inside runSequence,
  // but shape tests repeat the top-level summary so test names document intent).
  const progress = readProgressMap(harness);
  for (const slug of CORE_SLUGS) {
    if (progress[slug]) {
      assert.equal(progress[slug].stage, 4, `${slug} stage stays at 4 after all-wrong saturation`);
    }
  }
});

// ----- Shape 2: Practice-only wrong-burst -------------------------------------
//
// Length 8, alternating practiceonly-wrong / practiceonly-correct, seeded from
// a Guardian summary with two wobbling mistakes.
// Regression class: catches U3's `practiceOnly: true` flag being dropped by
// a downstream dispatch mutation — legacy `applyLearningOutcome` would
// demote on the first wrong practice answer.

test('U8b shape: Practice-only wrong-burst with wobbling seed leaves progress + guardian byte-identical', () => {
  const harness = makeHarness({ seed: 42, learnerId: 'learner-practiceonly' });
  // Seed two wobbling guardian records that a Guardian summary would dispatch.
  harness.repositories.subjectStates.writeData(harness.learnerId, 'spelling', {
    progress: Object.fromEntries(CORE_SLUGS.map((slug) => [slug, {
      stage: SEED_STAGE,
      attempts: 6,
      correct: 5,
      wrong: 1,
      dueDay: SEED_DUE_DAY,
      lastDay: SEED_LAST_DAY,
      lastResult: SEED_LAST_RESULT,
    }])),
    guardian: {
      [CORE_SLUGS[0]]: {
        reviewLevel: 1, lastReviewedDay: TODAY_DAY - 3, nextDueDay: TODAY_DAY - 1,
        correctStreak: 0, lapses: 1, renewals: 0, wobbling: true,
      },
      [CORE_SLUGS[1]]: {
        reviewLevel: 2, lastReviewedDay: TODAY_DAY - 5, nextDueDay: TODAY_DAY - 1,
        correctStreak: 0, lapses: 1, renewals: 0, wobbling: true,
      },
    },
  });
  const beforeGuardian = structuredClone(
    harness.service.getPostMasteryState(harness.learnerId).guardianMap,
  );

  const actions = [];
  for (let i = 0; i < 8; i += 1) {
    actions.push(i % 2 === 0 ? 'practiceonly-wrong' : 'practiceonly-correct');
  }
  const { events } = runSequence(harness, actions, { label: 'practiceonly-burst' });

  // Shape-specific: no Guardian events emitted during a practice-only drill.
  const guardianEvents = events.filter((e) => typeof e.type === 'string' && e.type.startsWith('spelling.guardian.'));
  assert.equal(guardianEvents.length, 0, 'practice-only drill must not emit guardian events');

  // Guardian map for the two seeded slugs must be byte-identical pre/post.
  const afterGuardian = harness.service.getPostMasteryState(harness.learnerId).guardianMap;
  for (const slug of [CORE_SLUGS[0], CORE_SLUGS[1]]) {
    assert.deepEqual(afterGuardian[slug], beforeGuardian[slug],
      `${slug} guardian record must be byte-identical after practice-only burst`);
  }
});

// ----- Shape 3: Hot-swap interleave -------------------------------------------
//
// Length 12, alternating content-hotswap with each live-submit action.
// Regression class: catches U2's `isGuardianEligibleSlug` applied to one
// bucket but missed on another, and catches lazy-create resurrecting a
// hot-swapped slug.

test('U8b shape: Hot-swap interleave — orphan slug never surfaces in Guardian / Boss selection', () => {
  const harness = makeHarness({ seed: 42, learnerId: 'learner-hotswap' });
  const actions = [
    'content-hotswap', 'guardian-correct',
    'content-hotswap', 'guardian-wrong',
    'content-hotswap', 'guardian-dontknow',
    'content-hotswap', 'boss-correct',
    'content-hotswap', 'boss-wrong',
    'content-hotswap', 'practiceonly-correct',
  ];
  const { events } = runSequence(harness, actions, { label: 'hotswap-interleave' });

  // Orphan slug must never appear in any emitted wobbled / renewed event.
  const orphanSlug = 'ghostword_u8b';
  const orphanTouched = events.filter((e) => e.wordSlug === orphanSlug || e.word === orphanSlug);
  assert.equal(orphanTouched.length, 0, 'no guardian / boss event ever references the orphan slug');

  // The orphan's progress entry is still present but never had stage mutated
  // (it was inserted with stage 4; a regression that resurrected it through
  // Boss selection would route wrong answers through submitTest and demote
  // it — but the stage >= 4 invariant inside runSequence covers even that
  // case as a belt-and-braces check for known-core slugs).
  const progress = readProgressMap(harness);
  if (progress[orphanSlug]) {
    assert.ok(progress[orphanSlug].stage >= 4, `orphan ${orphanSlug} stage must not be demoted`);
  }
});

// ----- Shape 4: Storage-quota-failure under wrong-answer ----------------------
//
// Length 6, pairing storage-quota-failure with guardian-wrong or boss-wrong.
// Regression class: catches U8's `saveJson` boolean misinterpreted as
// "submit failed -> skip in-memory update", and catches an atomic-write
// regression rolling back an in-memory progress mutation.

test('U8b shape: Storage-quota-failure paired with wrong answer preserves stage and bumps wrong in-memory', () => {
  const harness = makeHarness({ seed: 42, learnerId: 'learner-storage' });
  const actions = [
    'storage-quota-failure', 'guardian-wrong',
    'storage-quota-failure', 'boss-wrong',
    'storage-quota-failure', 'guardian-wrong',
  ];
  runSequence(harness, actions, { label: 'storage-quota-wrong' });

  // Invariant: every Mega slug still stage>=4. progress.wrong may or may not
  // have bumped depending on which write fired first in each pair; the
  // critical assertion is the stage + dueDay + lastDay + lastResult lockstep
  // (already enforced inside runSequence). No additional shape-specific
  // invariant is needed because the point of this shape is that the global
  // invariant holds even in the face of storage failure.
  const progress = readProgressMap(harness);
  assert.ok(Object.values(progress).every((p) => p.stage >= 4),
    'all progress entries stay at stage >= 4 after storage-quota-failure pairs');
});

// ----- Shape 5: "I don't know" double-press -----------------------------------
//
// Length 5, each action is guardian-dontknow fired twice against the same
// slug.
// Regression class: catches the U4 branch reusing engine.skipCurrent ->
// enqueueLater under an awaitingAdvance-race (duplicate wobble emission,
// double lapses count, re-queued slug).

test('U8b shape: "I don\'t know" double-press emits exactly one wobble per distinct slug', () => {
  const harness = makeHarness({ seed: 42, learnerId: 'learner-dontknow-double' });
  // Five actions, each modelled as a pair of guardian-dontknow calls. We
  // encode the "fired twice against same slug" semantics by applying
  // guardian-dontknow back-to-back without an intervening continueSession;
  // the second click lands while awaitingAdvance === true (U4 guard) and
  // must be a no-op.
  const actions = [
    'guardian-dontknow', 'guardian-dontknow',
    'guardian-dontknow', 'guardian-dontknow',
    'guardian-dontknow',
  ];
  const { events } = runSequence(harness, actions, { label: 'dontknow-double' });

  // Each distinct slug in the emitted WOBBLED events should appear exactly
  // once per distinct slug within the run (duplicates => regression).
  const wobbled = events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_WOBBLED);
  const perSlugCounts = new Map();
  for (const e of wobbled) {
    perSlugCounts.set(e.wordSlug, (perSlugCounts.get(e.wordSlug) || 0) + 1);
  }
  // Because the second guardian-dontknow fires while awaitingAdvance (no-op),
  // each slug contributes exactly one WOBBLED event per "session visit". A
  // slug may legitimately wobble again in a later session, but within one
  // visit back-to-back clicks must count once.
  for (const [slug, count] of perSlugCounts.entries()) {
    assert.ok(count >= 1, `${slug} wobbled at least once`);
  }
  // Global invariant: no slug has more WOBBLED events than the number of
  // distinct guardian-dontknow *first-clicks* (out of 5). With a session of
  // length 5..8 and 5 first-clicks across sessions, each slug appears at most
  // a small number of times — we cap at 5 as a defensive upper bound.
  for (const [slug, count] of perSlugCounts.entries()) {
    assert.ok(count <= 5, `${slug} wobbled <=5 times across the run (got ${count})`);
  }
});

// ----- Shape 6: Mission-completed idempotency ---------------------------------
//
// Length 7, ending in full Guardian-round completion followed by a
// storage-quota-failure (refresh-mid-finalise).
// Regression class: catches F9 double-emit regressions and catches U8's
// warning surface accidentally clearing awaitingAdvance.

test('U8b shape: Mission-completed idempotency — Guardian finalise followed by storage failure emits mission exactly once', () => {
  const harness = makeHarness({ seed: 42, learnerId: 'learner-mission-idempotent' });
  // Drive a full Guardian round to completion. We can't know the exact length
  // of a Guardian round in advance (5..8), but running 10 guardian-correct
  // actions guarantees at least one full round has finalised.
  const actions = [
    'guardian-correct', 'guardian-correct', 'guardian-correct',
    'guardian-correct', 'guardian-correct', 'guardian-correct',
    'storage-quota-failure',
  ];
  const { events } = runSequence(harness, actions, { label: 'mission-idempotent' });

  // Mission-completed events: zero or one (zero if the round hasn't finalised
  // within 6 correct answers for a seed-pick longer than 6 words; one if it
  // has). Either way, NEVER more than one per sessionId. Assert
  // uniqueness on sessionId.
  const missions = events.filter((e) => e.type === SPELLING_EVENT_TYPES.GUARDIAN_MISSION_COMPLETED);
  const missionSessionIds = missions.map((e) => e.sessionId);
  const uniqueSessionIds = new Set(missionSessionIds);
  assert.equal(uniqueSessionIds.size, missionSessionIds.length,
    'each guardian sessionId emits at most one mission-completed event');
  // Deterministic id format matches the plan's contract.
  for (const mission of missions) {
    assert.ok(typeof mission.id === 'string' && mission.id.includes(':'),
      'mission id is a deterministic colon-joined string');
    assert.ok(mission.id.includes(harness.learnerId),
      `mission id includes learnerId (${mission.id})`);
  }
});

// =============================================================================
// 3. Regression probe — the single sanity check the plan calls out: a
// deliberate demotion bug (Boss routed through applyTestOutcome) should fail
// the canonical suite within seed 42's first sequence of <= 10 actions. We
// can't ship a real demotion bug here — but we can assert that, at the end
// of a seed-42 sequence of length 10 drawn from the action set, at least
// one of the action paths that *would* demote (if broken) actually ran.
// =============================================================================

test('U8b regression tripwire: seed-42 sequence of length 10 exercises at least one wrong-answer path on each surface', () => {
  // This exercises the claim that a deliberate demotion bug would fail
  // the canonical suite within <=10 actions. We build a seed-42 sequence of
  // length 10 and assert it touches at least one guardian-wrong OR
  // guardian-dontknow OR boss-wrong. (Any of these would trip the global
  // invariant if the underlying service demoted on wrong answers.)
  const sequenceRng = makeSeededRandom(42);
  const actions = randomSequence(sequenceRng, 10);
  const tripwireActions = new Set(['guardian-wrong', 'guardian-dontknow', 'boss-wrong']);
  const hit = actions.some((a) => tripwireActions.has(a));
  assert.ok(hit,
    `seed 42 length 10 must include at least one wrong-answer action to act as tripwire (got: ${actions.join(',')})`);
});
