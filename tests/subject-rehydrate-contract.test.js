// SH2-U2 (R2): cross-subject rehydrate-sanitiser contract.
//
// After a learner completes a session, browser Back / Refresh on a summary
// screen MUST NOT resurrect the Summary scene's "Start another round"
// CTA from a round they thought was finished. The sanitiser runs on the
// three rehydrate entrypoints plumbed through
// `src/platform/core/store.js`:
//
//   1. Bootstrap (`createStore`) — `stateFromRepositories` → `sanitiseState`
//      with `rehydrate: true`.
//   2. Reload (`reloadFromRepositories`) — re-reads persisted UI, same
//      sanitisation path as bootstrap (adv-219-006 locked the hot paths:
//      persistence-retry, learner-deletion, settings-sync, clear-all-progress,
//      import-snapshot, Punctuation command response adapter).
//   3. Learner switch (`selectLearner` / `createLearner` / `deleteLearner`)
//      — `subjectUiForLearner` reads the new learner's persisted UI.
//
// Live dispatches (`updateSubjectUi`) pass `rehydrate: false` so the
// sanitiser does NOT fire — active sessions keep their summary state
// during the round-to-summary transition. The F-05 live-setState test
// below pins this invariant (mandatory per plan line 380).
//
// What drops:
//   - `summary` — the round-completion screen. Its "Start another round"
//     button fires a fresh `start-session` reusing the prior round's
//     mode, so a zombie summary after reload can silently re-enter a
//     round the learner thought they had finished. This is the core R2
//     hazard.
//   - `transientUi` — subject-local transient UI state.
//
// What stays:
//   - `session`, `feedback`, `awaitingAdvance`, `pendingCommand` — all
//     part of the resume contract for an in-flight session. A learner
//     who reloads mid-round (or mid-feedback) picks up where they left
//     off.
//       - `session` locked by `tests/store.test.js::serialisable
//         spelling state survives store persistence for resume`.
//       - `awaitingAdvance` locked by
//         `tests/spelling-parity.test.js::restored completed spelling
//         card caps progress and resumes auto-advance`.
//       - `pendingCommand` locked by
//         `tests/subject-expansion.test.js::Punctuation production
//         subject keeps a live session when switching learners`.
//       - `feedback` surfaces alongside `awaitingAdvance` on the
//         mid-round feedback card; dropping it would strand a reloading
//         learner on a Continue-awaiting view with no feedback.
//   - Everything else (preferences, settings, subject-level static data,
//     version markers, analytics concepts, saved writing evidence) is
//     preserved.
//
// Subjects without the hook fall back to the generic
// `{ ...DEFAULT_SUBJECT_UI, ...initState, ...persisted }` merge — all
// fields echo through.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../src/platform/core/store.js';
import { SUBJECTS } from '../src/platform/core/subject-registry.js';
import { buildSubjectRegistry, dropSessionEphemeralFields, SESSION_EPHEMERAL_FIELDS } from '../src/platform/core/subject-contract.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { spellingModule } from '../src/subjects/spelling/module.js';
import { grammarModule } from '../src/subjects/grammar/module.js';
import { punctuationModule } from '../src/subjects/punctuation/module.js';
import { sanitisePunctuationUiOnRehydrate } from '../src/subjects/punctuation/service-contract.js';
import { installMemoryStorage } from './helpers/memory-storage.js';

const SUBJECT_MODULES = { spelling: spellingModule, grammar: grammarModule, punctuation: punctuationModule };

function bootstrapWithSeededUi(subjectId, persistedEntry) {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  // Boot once so a default learner is seeded.
  const bootStore = createStore(SUBJECTS, { repositories });
  const learnerId = bootStore.getState().learners.selectedId;
  // Write the fixture straight onto the persistence layer, then create a
  // fresh store over the same repositories so the rehydrate path fires.
  repositories.subjectStates.writeUi(learnerId, subjectId, persistedEntry);
  const store = createStore(SUBJECTS, { repositories });
  return { store, learnerId, repositories };
}

// ---------------------------------------------------------------------------
// Scenario 1 -- Happy path across all three subjects: zombie-phase + summary
// fixture. This is the core R2 hazard (plan line 378, adversarial
// adv-sh2u2-001 / adv-sh2u2-002): the persisted entry has
// `phase: 'summary'` with summary populated plus a non-empty
// pendingCommand. After rehydrate:
//
//   1. `summary` must drop -- core R2 hazard.
//   2. `phase` must NOT be `'summary'` -- zombie-phase coercion.
//      Grammar + Spelling coerce to `'dashboard'`; Punctuation coerces
//      to `'setup'` (its dashboard-equivalent rest phase).
//   3. `pendingCommand` must be `''` -- stranding recovery (adv-sh2u2-003).
//
// Without (2) the SummaryScene re-renders once the learner re-opens
// the subject card with an empty `summary = ui.summary || {}` payload
// and a live "Start another round" CTA. Without (3) a tab crash
// mid-command latches the setup scene's "Starting..." disabled state
// with no recovery.
// ---------------------------------------------------------------------------

const EXPECTED_REST_PHASE_BY_SUBJECT = Object.freeze({
  spelling: 'dashboard',
  grammar: 'dashboard',
  punctuation: 'setup',
});

test('SH2-U2 zombie-phase: rehydrate coerces phase=\'summary\' + drops summary + resets pendingCommand for all subjects', () => {
  for (const subjectId of Object.keys(SUBJECT_MODULES)) {
    const { store } = bootstrapWithSeededUi(subjectId, {
      phase: 'summary',
      summary: { total: 20, correct: 15, mistakes: [{ slug: 'because' }] },
      pendingCommand: 'start-session',
      session: null,
    });
    const ui = store.getState().subjectUi[subjectId];
    // Zombie-phase coercion: phase must NOT be 'summary'.
    assert.notEqual(ui.phase, 'summary',
      `${subjectId}: phase='summary' must be coerced away on rehydrate (zombie-phase hazard)`);
    assert.equal(ui.phase, EXPECTED_REST_PHASE_BY_SUBJECT[subjectId],
      `${subjectId}: phase coerces to '${EXPECTED_REST_PHASE_BY_SUBJECT[subjectId]}'`);
    // Summary drop: core R2 hazard.
    assert.equal(ui.summary, null, `${subjectId}: summary must drop -- R2 core hazard`);
    // pendingCommand reset: stranding recovery. Spelling does not carry
    // pendingCommand inside its subject UI (it lives on top-level
    // `transientUi.spellingPendingCommand`), so the key is absent after
    // the merge. Grammar + Punctuation re-default to '' via their
    // initState / normaliseGrammarReadModel contracts.
    assert.notEqual(ui.pendingCommand, 'start-session',
      `${subjectId}: stranded pendingCommand must NOT survive rehydrate`);
    if (subjectId !== 'spelling') {
      assert.equal(ui.pendingCommand, '',
        `${subjectId}: pendingCommand re-defaults to '' on rehydrate merge`);
    }
  }
});

// ---------------------------------------------------------------------------
// Scenario 2 — Happy path across all three subjects: fixture with
// `summary: {...}` is stripped. The cross-subject loop asserts no future
// subject can forget to implement the hook.
// ---------------------------------------------------------------------------

test('SH2-U2 cross-subject: summary stripped on all three subjects', () => {
  const fixture = {
    summary: { total: 8, correct: 6 },
  };

  for (const subjectId of Object.keys(SUBJECT_MODULES)) {
    const { store } = bootstrapWithSeededUi(subjectId, fixture);
    const ui = store.getState().subjectUi[subjectId];
    assert.equal(ui.summary, null, `${subjectId}: summary must drop — R2 core hazard`);
  }
});

// ---------------------------------------------------------------------------
// Scenario 3 — F-05 live-setState preservation (MANDATORY per plan line 380).
//
// Seed `summary: {...}` + `awaitingAdvance: true` via a LIVE `setState`
// (`rehydrate: false`) → values MUST survive unchanged. Proves the
// sanitiser is NOT over-stripping active-session state. If this test is
// missing, the adversarial reviewer will block.
// ---------------------------------------------------------------------------

test('SH2-U2 F-05: live setState preserves summary / awaitingAdvance for all three subjects', () => {
  for (const subjectId of Object.keys(SUBJECT_MODULES)) {
    const storage = installMemoryStorage();
    const repositories = createLocalPlatformRepositories({ storage });
    const store = createStore(SUBJECTS, { repositories });

    const seedSummary = { total: 12, correct: 10, mistakes: [] };
    const seedFeedback = { kind: 'success', headline: 'Live feedback!' };
    const seedSession = { id: 'live-session', progress: { answered: 10 } };

    // Live dispatch path: store.updateSubjectUi uses setState with
    // rehydrate: false (see store.js lines 327-334), so the sanitiser MUST
    // NOT fire and our seeded fields must pass through the merge untouched.
    store.updateSubjectUi(subjectId, (current) => ({
      ...current,
      summary: seedSummary,
      feedback: seedFeedback,
      awaitingAdvance: true,
      session: seedSession,
    }));

    const ui = store.getState().subjectUi[subjectId];
    assert.deepEqual(ui.summary, seedSummary, `${subjectId}: live summary must survive setState`);
    assert.deepEqual(ui.feedback, seedFeedback, `${subjectId}: live feedback must survive setState`);
    assert.equal(ui.awaitingAdvance, true, `${subjectId}: live awaitingAdvance must survive setState`);
    assert.deepEqual(ui.session, seedSession, `${subjectId}: live session must survive setState`);
  }
});

// ---------------------------------------------------------------------------
// Scenario 4 — Rehydrate on a LIVE mid-flight session: the session payload
// + feedback + awaitingAdvance are ALL PRESERVED so the learner's active
// round resumes where they left off. Only `summary` drops — R2's core
// post-completion hazard. Locked by
// `tests/store.test.js::serialisable spelling state survives store
// persistence for resume` + `tests/spelling-parity.test.js::restored
// completed spelling card caps progress and resumes auto-advance`.
// Proves the sanitiser does NOT over-strip active-session state.
// ---------------------------------------------------------------------------

test('SH2-U2 rehydrate: mid-flight session + feedback + awaitingAdvance are ALL preserved, only summary drops', () => {
  for (const subjectId of Object.keys(SUBJECT_MODULES)) {
    const session = { id: 'mid-session', cards: [{ id: 1 }], progress: { done: 1 } };
    const feedback = { kind: 'success', headline: 'live feedback' };
    const { store } = bootstrapWithSeededUi(subjectId, {
      phase: 'session',
      session,
      feedback,
      summary: { total: 10, correct: 8 },
      awaitingAdvance: true,
    });
    const ui = store.getState().subjectUi[subjectId];
    // Active-session state preserved — resume contract.
    assert.deepEqual(ui.session, session,
      `${subjectId}: mid-flight session MUST survive rehydrate (resume contract)`);
    assert.deepEqual(ui.feedback, feedback,
      `${subjectId}: mid-flight feedback MUST survive rehydrate (resume contract)`);
    assert.equal(ui.awaitingAdvance, true,
      `${subjectId}: mid-flight awaitingAdvance MUST survive rehydrate (resume contract)`);
    // Summary drops — R2 core hazard.
    assert.equal(ui.summary, null, `${subjectId}: summary must NOT survive rehydrate`);
  }
});

// ---------------------------------------------------------------------------
// Scenario 5 — Subject manifest without `sanitiseUiOnRehydrate` falls back
// to the generic shallow-merge path. This locks the plan's "preserve
// backwards compatibility" clause (line 382) so adding a new subject with
// only static data does not force the subject to implement the hook.
// ---------------------------------------------------------------------------

test('SH2-U2 fallback: subject without sanitiseUiOnRehydrate uses the generic shallow-merge path', () => {
  // testing-02 nit follow-up: exercise the real `buildSubjectUiState`
  // path via createStore rather than a hand-rolled merge. The mock
  // subject opts out of the hook, so the store must fall back to the
  // plain `{...DEFAULT, ...initState, ...persisted}` merge with NO
  // silent stripping -- this locks the plan's "preserve backwards
  // compatibility" clause (line 382). A hand-rolled merge in the test
  // is tautological (testing-02); wiring through createStore ensures
  // any drift in store.js's fallback branch actually surfaces here.

  // Track whether our mock's hook is called. We install a spy-hook on
  // a second mock subject to positively assert the hook-present branch
  // fires while this test's hook-absent branch does NOT.
  const mockSubject = {
    id: 'spelling', // reuse spelling slot so the local platform
                    // repositories seed a learner + subjectStates adapter
                    // without requiring a custom repository wiring.
    name: 'Mock',
    blurb: 'test-fixture subject with no rehydrate sanitiser',
    reactPractice: true,
    initState() {
      return { phase: 'dashboard', session: null, feedback: null, summary: null, error: '' };
    },
    getDashboardStats() { return { pct: 0, due: 0, streak: 0, nextUp: 'Start' }; },
    handleAction() { return false; },
    // Deliberately no `sanitiseUiOnRehydrate`.
  };

  assert.equal(typeof mockSubject.sanitiseUiOnRehydrate, 'undefined',
    'mock subject must NOT have a sanitiseUiOnRehydrate hook');

  // Stand up a store with just the mock subject + a seeded persisted
  // entry. If the fallback path were silently stripping, `ui.summary`
  // would come back null; if it's preserving (expected), the persisted
  // summary should echo through unchanged.
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const bootStore = createStore(buildSubjectRegistry([mockSubject]), { repositories });
  const learnerId = bootStore.getState().learners.selectedId;
  const persisted = {
    phase: 'dashboard',
    session: { id: 'legacy' },
    summary: { total: 3 },
    awaitingAdvance: true,
  };
  repositories.subjectStates.writeUi(learnerId, 'spelling', persisted);

  // Bring up a fresh store over the same repositories so the rehydrate
  // path fires against a subject with no hook.
  const store = createStore(buildSubjectRegistry([mockSubject]), { repositories });
  const ui = store.getState().subjectUi.spelling;

  // All fields from `persisted` echo through -- this is the legacy
  // behaviour subjects opt out of by implementing the hook.
  assert.deepEqual(ui.session, persisted.session,
    'fallback: persisted session echoes through (no sanitiser)');
  assert.deepEqual(ui.summary, persisted.summary,
    'fallback: persisted summary echoes through (no sanitiser)');
  assert.equal(ui.awaitingAdvance, true,
    'fallback: persisted awaitingAdvance echoes through (no sanitiser)');

  // Positive control: assert the hook-present branch of store.js:62-64
  // actually fires when the subject opts in. Install a spy hook on a
  // fresh mock and prove it gets called with the persisted entry.
  let hookCalledWithEntry = null;
  const spyMockSubject = {
    ...mockSubject,
    sanitiseUiOnRehydrate(entry) {
      hookCalledWithEntry = entry;
      return { ...entry, summary: null }; // strip summary to prove the
                                            // hook's return value wins.
    },
  };
  const storage2 = installMemoryStorage();
  const repositories2 = createLocalPlatformRepositories({ storage: storage2 });
  const bootStore2 = createStore(buildSubjectRegistry([spyMockSubject]), { repositories: repositories2 });
  const learnerId2 = bootStore2.getState().learners.selectedId;
  repositories2.subjectStates.writeUi(learnerId2, 'spelling', persisted);
  const store2 = createStore(buildSubjectRegistry([spyMockSubject]), { repositories: repositories2 });
  assert.notEqual(hookCalledWithEntry, null,
    'spy hook: sanitiseUiOnRehydrate MUST be invoked on rehydrate when defined');
  // The persisted entry may be augmented with defaults (feedback: null,
  // error: '') by the local platform repositories before reaching the
  // hook. Assert the fields we explicitly seeded survive verbatim.
  assert.deepEqual(hookCalledWithEntry.session, persisted.session,
    'spy hook: sanitiser receives persisted session verbatim');
  assert.deepEqual(hookCalledWithEntry.summary, persisted.summary,
    'spy hook: sanitiser receives persisted summary verbatim');
  assert.equal(hookCalledWithEntry.awaitingAdvance, true,
    'spy hook: sanitiser receives persisted awaitingAdvance verbatim');
  assert.equal(store2.getState().subjectUi.spelling.summary, null,
    'spy hook: the sanitiser\'s return value wins over the raw persisted entry');
});

// ---------------------------------------------------------------------------
// Scenario 6 — Punctuation subject-specific mapUi strip still works (no
// regression on U5's existing sanitiser). This test is the safety-net for
// the extension: we are expanding the baseline sanitiser without
// removing the Map phase coercion.
// ---------------------------------------------------------------------------

test('SH2-U2 punctuation: existing Map phase + mapUi strip still works (no U5 regression)', () => {
  const { store } = bootstrapWithSeededUi('punctuation', {
    phase: 'map',
    mapUi: { statusFilter: 'weak', monsterFilter: 'pealark', detailOpenSkillId: 'speech' },
    summary: { total: 10, correct: 8 },
  });
  const ui = store.getState().subjectUi.punctuation;
  // U5 contract: Map phase coerces to 'setup' and mapUi is stripped.
  assert.notEqual(ui.phase, 'map', 'U5: phase=map must NOT survive rehydrate');
  assert.equal(ui.phase, 'setup', 'U5: phase coerces to "setup"');
  // SH2-U2 contract: summary drops.
  assert.equal(ui.summary, null, 'SH2-U2: summary must drop');
});

// ---------------------------------------------------------------------------
// Scenario 7 — Parser-level sanitiser unit tests. These run without any
// store / harness plumbing so a regression in the pure function surfaces
// independently of the store integration. Covers each subject hook in
// isolation plus the shared helper.
// ---------------------------------------------------------------------------

test('SH2-U2 dropSessionEphemeralFields: strips every baseline field and preserves everything else', () => {
  const entry = {
    // Post-session-ephemeral (must drop):
    summary: { total: 5 },
    transientUi: { someKey: 'value' },
    pendingCommand: 'start-session',
    // Active-session state (must preserve):
    session: { id: 'live-session' },
    feedback: { kind: 'success' },
    awaitingAdvance: true,
    // Other non-ephemeral fields (must preserve):
    phase: 'setup',
    prefs: { mode: 'smart', roundLength: '10' },
    version: 2,
    error: '',
    extraStaticField: 'preserved',
  };
  const next = dropSessionEphemeralFields(entry);
  for (const field of SESSION_EPHEMERAL_FIELDS) {
    assert.equal(Object.prototype.hasOwnProperty.call(next, field), false, `${field} must drop`);
  }
  // Active-session resume contract fields:
  assert.deepEqual(next.session, entry.session,
    'session is NOT in the ephemeral baseline -- it must be preserved (resume contract)');
  assert.deepEqual(next.feedback, entry.feedback,
    'feedback is NOT in the ephemeral baseline -- it must be preserved (resume contract)');
  assert.equal(next.awaitingAdvance, true,
    'awaitingAdvance is NOT in the ephemeral baseline -- it must be preserved (resume contract)');
  // Other non-ephemeral fields:
  assert.equal(next.phase, 'setup', 'non-ephemeral phase must be preserved');
  assert.deepEqual(next.prefs, entry.prefs, 'non-ephemeral prefs must be preserved');
  assert.equal(next.version, 2, 'non-ephemeral version must be preserved');
  assert.equal(next.extraStaticField, 'preserved', 'unknown non-ephemeral fields must be preserved');
});

// ---------------------------------------------------------------------------
// Scenario adv-sh2u2-003: pendingCommand stranding recovery. A tab that
// crashes between "write pendingCommand" and "Worker responds + clear"
// must NOT leave a non-empty `pendingCommand` echoing across reload -- the
// setup / session scenes gate `setupDisabled = Boolean(pendingCommand)`,
// so a stranded value latches "Starting..." permanently.
// ---------------------------------------------------------------------------

test('SH2-U2 pendingCommand stranding: non-empty pendingCommand is dropped on rehydrate for all subjects', () => {
  const fixture = {
    phase: 'dashboard',
    pendingCommand: 'start-session',
    session: null,
  };
  for (const subjectId of Object.keys(SUBJECT_MODULES)) {
    const { store } = bootstrapWithSeededUi(subjectId, fixture);
    const ui = store.getState().subjectUi[subjectId];
    // The rehydrate merge re-defaults pendingCommand via
    // `{...DEFAULT, ...initState, ...sanitised}` -- initState supplies
    // `pendingCommand: ''` for Grammar (normaliseGrammarReadModel) and
    // Punctuation (createInitialPunctuationState) explicitly. Spelling
    // does not carry pendingCommand inside its subject UI (it lives on
    // the top-level `transientUi.spellingPendingCommand`), so the key
    // is absent.
    assert.notEqual(ui.pendingCommand, 'start-session',
      `${subjectId}: stranded pendingCommand must NOT survive rehydrate`);
    // Grammar + Punctuation re-default to ''. Spelling: field is absent
    // (undefined is acceptable; downstream reads are Boolean() guarded).
    if (subjectId !== 'spelling') {
      assert.equal(ui.pendingCommand, '',
        `${subjectId}: pendingCommand re-defaults to '' on merge`);
    }
  }
});

test('SH2-U2 SESSION_EPHEMERAL_FIELDS list: does NOT include any resume-contract field', () => {
  // Locks the resume contract: `session`, `feedback`, `awaitingAdvance`
  // are deliberately NOT in the ephemeral baseline so the pre-existing
  // resume invariants stay green:
  //   - `tests/store.test.js::serialisable spelling state survives store
  //     persistence for resume` -- `session` must preserve.
  //   - `tests/spelling-parity.test.js::restored completed spelling card
  //     caps progress and resumes auto-advance` -- `awaitingAdvance` must
  //     preserve so the auto-advance scheduler fires on rehydrate.
  //   - `feedback` surfaces alongside `awaitingAdvance` on the mid-round
  //     feedback card; dropping it would strand a reloading learner on a
  //     Continue-awaiting view with no feedback.
  //
  // `pendingCommand` IS in the ephemeral list (adv-sh2u2-003 stranding
  // recovery). `tests/subject-expansion.test.js::keeps a live session
  // when switching learners` captures a post-response snapshot where
  // pendingCommand is already `''`, and each subject's initState() re-
  // defaults the field on merge, so the deepEqual round-trip stays green
  // even with the drop.
  for (const resumeField of ['session', 'feedback', 'awaitingAdvance']) {
    assert.equal(SESSION_EPHEMERAL_FIELDS.includes(resumeField), false,
      `${resumeField} must NOT be in SESSION_EPHEMERAL_FIELDS (resume contract)`);
  }
  // Positive assertion: pendingCommand IS in the ephemeral list.
  assert.equal(SESSION_EPHEMERAL_FIELDS.includes('pendingCommand'), true,
    'pendingCommand MUST be in SESSION_EPHEMERAL_FIELDS (adv-sh2u2-003 stranding recovery)');
});

test('SH2-U2 dropSessionEphemeralFields: pass-through on non-plain-object inputs', () => {
  assert.equal(dropSessionEphemeralFields(null), null);
  assert.equal(dropSessionEphemeralFields(undefined), undefined);
  const arr = [1, 2, 3];
  assert.equal(dropSessionEphemeralFields(arr), arr, 'arrays pass through unchanged');
});

test('SH2-U2 spelling.sanitiseUiOnRehydrate: drops summary + pendingCommand, coerces phase=summary, preserves resume-contract fields', () => {
  const entry = {
    phase: 'summary',
    session: { id: 'live-session' },
    summary: { total: 5 },
    feedback: { kind: 'success' },
    awaitingAdvance: true,
    pendingCommand: 'start-session',
    prefs: { mode: 'smart' },
  };
  const next = spellingModule.sanitiseUiOnRehydrate(entry);
  assert.equal(Object.prototype.hasOwnProperty.call(next, 'summary'), false,
    'summary must drop (R2 core hazard)');
  assert.equal(Object.prototype.hasOwnProperty.call(next, 'pendingCommand'), false,
    'pendingCommand must drop (adv-sh2u2-003 stranding recovery)');
  assert.equal(next.phase, 'dashboard',
    'phase=summary must coerce to dashboard (adv-sh2u2-001 zombie-phase)');
  assert.deepEqual(next.session, entry.session, 'session preserved (resume contract)');
  assert.deepEqual(next.feedback, entry.feedback, 'feedback preserved (resume contract)');
  assert.equal(next.awaitingAdvance, true, 'awaitingAdvance preserved (resume contract)');
  assert.deepEqual(next.prefs, { mode: 'smart' }, 'prefs preserved');
});

test('SH2-U2 grammar.sanitiseUiOnRehydrate: drops summary + pendingCommand, coerces phase=summary, preserves resume-contract fields', () => {
  const entry = {
    phase: 'summary',
    session: { id: 'live-session' },
    summary: { total: 5 },
    feedback: { kind: 'success' },
    awaitingAdvance: true,
    pendingCommand: 'start-session',
    prefs: { mode: 'learn', roundLength: 8 },
    analytics: { concepts: [] },
  };
  const next = grammarModule.sanitiseUiOnRehydrate(entry);
  assert.equal(Object.prototype.hasOwnProperty.call(next, 'summary'), false,
    'summary must drop (R2 core hazard)');
  assert.equal(Object.prototype.hasOwnProperty.call(next, 'pendingCommand'), false,
    'pendingCommand must drop (adv-sh2u2-003 stranding recovery)');
  assert.equal(next.phase, 'dashboard',
    'phase=summary must coerce to dashboard (adv-sh2u2-001 zombie-phase)');
  assert.deepEqual(next.session, entry.session, 'session preserved (resume contract)');
  assert.deepEqual(next.feedback, entry.feedback, 'feedback preserved (resume contract)');
  assert.equal(next.awaitingAdvance, true, 'awaitingAdvance preserved (resume contract)');
  assert.deepEqual(next.prefs, { mode: 'learn', roundLength: 8 }, 'prefs are preserved');
  assert.deepEqual(next.analytics, { concepts: [] }, 'analytics are preserved');
});

test('SH2-U2 sanitisePunctuationUiOnRehydrate: drops summary + pendingCommand + Map phase + mapUi, preserves resume-contract fields', () => {
  const entry = {
    phase: 'map',
    mapUi: { statusFilter: 'weak' },
    session: { id: 'live-session' },
    summary: { total: 3 },
    feedback: { kind: 'success' },
    awaitingAdvance: true,
    pendingCommand: 'start-session',
    prefs: { mode: 'smart' },
    prefsMigrated: true,
  };
  const next = sanitisePunctuationUiOnRehydrate(entry);
  // SH2-U2 baseline drops:
  assert.equal(Object.prototype.hasOwnProperty.call(next, 'summary'), false,
    'summary must drop (R2 core hazard)');
  assert.equal(Object.prototype.hasOwnProperty.call(next, 'pendingCommand'), false,
    'pendingCommand must drop (adv-sh2u2-003 stranding recovery)');
  // U5 layer:
  assert.equal(next.phase, 'setup', 'Map phase coerced to setup');
  assert.equal(Object.prototype.hasOwnProperty.call(next, 'mapUi'), false, 'mapUi stripped');
  // Preserved:
  assert.deepEqual(next.session, entry.session, 'session preserved (resume contract)');
  assert.deepEqual(next.feedback, entry.feedback, 'feedback preserved (resume contract)');
  assert.equal(next.awaitingAdvance, true, 'awaitingAdvance preserved (resume contract)');
  assert.deepEqual(next.prefs, { mode: 'smart' }, 'prefs preserved');
  assert.equal(next.prefsMigrated, true, 'prefsMigrated latch preserved (persists by design)');
});

test('SH2-U2 sanitisePunctuationUiOnRehydrate: phase=summary coerces to setup', () => {
  // adv-sh2u2-002: phase='summary' without coercion would re-render the
  // Summary scene's active "Start another round" CTA after re-opening
  // the subject. The Punctuation sanitiser coerces phase=summary to
  // 'setup' (its dashboard-equivalent rest phase) to close the hazard.
  const entry = {
    phase: 'summary',
    summary: { total: 10, correct: 9 },
    feedback: { kind: 'success' },
    awaitingAdvance: true,
    prefs: { mode: 'smart' },
  };
  const next = sanitisePunctuationUiOnRehydrate(entry);
  assert.equal(next.phase, 'setup',
    'Summary phase coerced to setup (adv-sh2u2-002 zombie-phase)');
  assert.equal(Object.prototype.hasOwnProperty.call(next, 'summary'), false,
    'summary must drop (R2 core hazard)');
});

test('SH2-U2 sanitisePunctuationUiOnRehydrate: non-Map non-Summary phase still drops summary but preserves active-session state', () => {
  // Covers the case where the prior sanitiser bailed out early via the
  // `if (!needsCoerce) return entry;` short-circuit. After SH2-U2 the
  // sanitiser must ALWAYS drop the summary baseline, whether or not the
  // entry happens to be in the Map phase.
  const entry = {
    phase: 'active-item',
    summary: { total: 10, correct: 9 },
    feedback: { kind: 'success' },
    awaitingAdvance: true,
    prefs: { mode: 'smart' },
  };
  const next = sanitisePunctuationUiOnRehydrate(entry);
  assert.equal(Object.prototype.hasOwnProperty.call(next, 'summary'), false,
    'summary must drop (R2 core hazard)');
  assert.deepEqual(next.feedback, entry.feedback, 'feedback preserved (resume contract)');
  assert.equal(next.awaitingAdvance, true, 'awaitingAdvance preserved (resume contract)');
  assert.equal(next.phase, 'active-item', 'non-Map non-Summary phase is preserved');
  assert.deepEqual(next.prefs, { mode: 'smart' }, 'prefs preserved');
});

// ---------------------------------------------------------------------------
// Scenario adv-sh2u2-004 drift: the Punctuation sanitiser must stay in
// sync with `SESSION_EPHEMERAL_FIELDS` -- inline field lists can drift
// when the baseline grows. The sanitiser loops the shared list, but this
// test asserts the set equivalence directly via a probe fixture carrying
// every baseline field.
// ---------------------------------------------------------------------------

test('SH2-U2 sanitisePunctuationUiOnRehydrate: drop set matches SESSION_EPHEMERAL_FIELDS exactly (adv-sh2u2-004)', () => {
  const probe = {};
  for (const field of SESSION_EPHEMERAL_FIELDS) {
    probe[field] = `probe-${field}`;
  }
  // Include a couple of non-ephemeral fields to make sure the sanitiser
  // does NOT silently strip anything outside the baseline.
  probe.phase = 'active-item';
  probe.awaitingAdvance = true;
  const next = sanitisePunctuationUiOnRehydrate(probe);
  for (const field of SESSION_EPHEMERAL_FIELDS) {
    assert.equal(Object.prototype.hasOwnProperty.call(next, field), false,
      `Punctuation sanitiser must drop '${field}' (SESSION_EPHEMERAL_FIELDS baseline)`);
  }
  assert.equal(next.phase, 'active-item', 'non-baseline phase preserved');
  assert.equal(next.awaitingAdvance, true, 'non-baseline awaitingAdvance preserved');
});

// ---------------------------------------------------------------------------
// Scenario 8 — Rehydrate preserves preferences / persistent settings.
// Preferences are the primary non-ephemeral state that MUST survive
// rehydrate; a sanitiser that over-strips would wipe a learner's mode /
// round-length / year filter on every page reload.
// ---------------------------------------------------------------------------

test('SH2-U2 preferences survive rehydrate for all three subjects', () => {
  const subjectPrefs = {
    spelling: { mode: 'trouble', yearFilter: 'y5-6', roundLength: '40' },
    grammar: { mode: 'trouble', roundLength: 20, goalType: 'secure' },
    punctuation: { mode: 'weak', roundLength: '12' },
  };

  for (const subjectId of Object.keys(subjectPrefs)) {
    const { store } = bootstrapWithSeededUi(subjectId, {
      prefs: subjectPrefs[subjectId],
      summary: { total: 10, correct: 8 },
    });
    const ui = store.getState().subjectUi[subjectId];
    // Summary stripped (re-check of scenario 2).
    assert.equal(ui.summary, null, `${subjectId}: summary stripped`);
    // Preferences survive. The subject normalisers may add defaults
    // around them; we assert only that every explicit preference we
    // seeded echoes through.
    assert.equal(ui.prefs.mode, subjectPrefs[subjectId].mode,
      `${subjectId}: prefs.mode survives rehydrate`);
    if ('yearFilter' in subjectPrefs[subjectId]) {
      assert.equal(ui.prefs.yearFilter, subjectPrefs[subjectId].yearFilter,
        `${subjectId}: prefs.yearFilter survives rehydrate`);
    }
    if ('goalType' in subjectPrefs[subjectId]) {
      assert.equal(ui.prefs.goalType, subjectPrefs[subjectId].goalType,
        `${subjectId}: prefs.goalType survives rehydrate`);
    }
  }
});

// ---------------------------------------------------------------------------
// Scenario 9 — Learner-switch path (`subjectUiForLearner`) sanitises too.
// Plan line 363-364 requires the rehydrate flag to flow through all three
// entry-points. Bootstrap + reloadFromRepositories are exercised elsewhere;
// this test locks the selectLearner path specifically.
// ---------------------------------------------------------------------------

test('SH2-U2 learner switch: selecting a different learner rehydrates with the sanitiser', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const bootStore = createStore(SUBJECTS, { repositories });
  const originalLearnerId = bootStore.getState().learners.selectedId;

  // Create a second learner and seed a completed-session polluted spelling
  // UI under them: summary populated, session: null.
  const second = bootStore.createLearner({ name: 'Second' });
  repositories.subjectStates.writeUi(second.id, 'spelling', {
    phase: 'dashboard',
    summary: { total: 99, correct: 10, mistakes: [] },
    session: null,
  });

  // Switch away and back — the selectLearner hop re-reads Second's
  // persisted UI via subjectUiForLearner, which is a rehydrate path.
  bootStore.selectLearner(originalLearnerId);
  bootStore.selectLearner(second.id);

  const ui = bootStore.getState().subjectUi.spelling;
  assert.equal(ui.summary, null,
    'learner-switch: summary must be stripped (rehydrate path)');
});
