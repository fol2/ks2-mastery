import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppHarness } from './helpers/app-harness.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import {
  renderPunctuationMapSceneStandalone,
  renderPunctuationSetupSceneStandalone,
  renderPunctuationSummarySceneStandalone,
} from './helpers/punctuation-scene-render.js';
import { SUBJECT_EXPOSURE_GATES } from '../src/platform/core/subject-availability.js';
import { buildCodexEntries, buildSubjectCards } from '../src/surfaces/home/data.js';
import { activePunctuationMonsterSummaryFromState } from '../src/platform/game/mastery/punctuation.js';
import { PUNCTUATION_RELEASE_ID, createPunctuationMasteryKey } from '../shared/punctuation/content.js';

// Phase 4 U5 — PunctuationSummaryScene UX rebuild + 5-surface reward parity.
//
// U5 ships visible learner feedback on the Summary result card (correct count,
// per-skill chips, next-review hint, monster-progress teaser) plus a parity
// proof that seeds one `monster-codex` write and re-renders every surface
// that derives Punctuation reward display from it — Setup, Summary, Map, Home
// SubjectCard, Codex — showing each projection lands coherent output in the
// same render tick.
//
// SSR blind spots (learning #6): every behavioural assertion is paired with
// either a state-level post-dispatch check or a DOM-match regex so a silent
// no-op can't pass (learning #7).

function createPunctuationHarness() {
  return createAppHarness({
    storage: installMemoryStorage(),
    subjectExposureGates: { [SUBJECT_EXPOSURE_GATES.punctuation]: true },
  });
}

function openSummaryScene(harness, extraSummary = {}) {
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'summary',
    summary: {
      label: 'Punctuation session summary',
      message: 'Session complete.',
      total: 4,
      correct: 3,
      accuracy: 75,
      focus: [],
      ...extraSummary,
    },
  });
}

// ---------------------------------------------------------------------------
// 1. Correct-count copy line ("4 out of 5 correct") — visible child feedback.
// ---------------------------------------------------------------------------

test('U5 Summary: result card shows a "N out of M correct" copy line', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness, { total: 5, correct: 4, accuracy: 80 });
  const html = harness.render();
  // The copy line sits alongside the existing stat chips and carries a
  // dedicated `data-punctuation-summary-correct-count` hook so a future
  // re-layout keeps the child-facing summary locatable.
  assert.match(html, /data-punctuation-summary-correct-count/);
  assert.match(html, /4 out of 5 correct/);
});

test('U5 Summary: correct-count line handles zero-total without a divide-by-zero leak', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness, { total: 0, correct: 0, accuracy: 0 });
  const html = harness.render();
  // A zero-round must not emit "0 out of 0 correct" — the scene hides the
  // line rather than surfacing a nonsense string.
  assert.doesNotMatch(html, /0 out of 0 correct/);
  assert.doesNotMatch(html, /data-punctuation-summary-correct-count/);
});

// ---------------------------------------------------------------------------
// 2. Per-skill chips for skills exercised this round.
// ---------------------------------------------------------------------------

test('U5 Summary: per-skill chip row renders a chip for every skill exercised this round', () => {
  // `summary.skillsExercised` is the scene's input for the exercised-skill
  // chip row. Three skills supplied → three chips with child-register labels
  // from `PUNCTUATION_CLIENT_SKILLS.name`; raw skill ids must not leak.
  const harness = createPunctuationHarness();
  openSummaryScene(harness, {
    skillsExercised: ['speech', 'comma_clarity', 'apostrophe_contractions'],
    focus: ['speech'],
  });
  const html = harness.render();
  assert.match(html, /data-punctuation-summary-skill-row/);
  assert.match(html, /data-skill-chip-id="speech"/);
  assert.match(html, /data-skill-chip-id="comma_clarity"/);
  assert.match(html, /data-skill-chip-id="apostrophe_contractions"/);
  // Child-register labels surface (not raw ids).
  assert.match(html, /Inverted commas and speech punctuation/);
  assert.match(html, /Commas for clarity/);
  assert.match(html, /Apostrophes for contraction/);
  // Skills in `focus` carry a "needs practice" badge; skills not in `focus`
  // but exercised carry a "secure" badge so the learner reads outcome per
  // skill.
  assert.match(html, /data-skill-chip-id="speech"[^>]*data-skill-status="needs-practice"/);
  assert.match(html, /data-skill-chip-id="comma_clarity"[^>]*data-skill-status="secure"/);
  assert.match(html, /data-skill-chip-id="apostrophe_contractions"[^>]*data-skill-status="secure"/);
});

test('U5 Summary: per-skill chip row hides when no skillsExercised provided', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness);
  const html = harness.render();
  // Scene degrades gracefully when a round doesn't carry the field (legacy
  // sessions or a degraded payload). The existing wobbly chip row stays.
  assert.doesNotMatch(html, /data-punctuation-summary-skill-row/);
});

// ---------------------------------------------------------------------------
// 3. Next-review hint.
// ---------------------------------------------------------------------------

test('U5 Summary: next-review hint renders "Tomorrow" when stats.due === 0 (all secure)', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness);
  harness.store.updateSubjectUi('punctuation', {
    stats: { due: 0, secure: 14, fresh: 0, weak: 0 },
  });
  const html = harness.render();
  assert.match(html, /data-punctuation-summary-review-hint/);
  assert.match(html, /Back tomorrow for the next round/);
});

test('U5 Summary: next-review hint renders "more due today" when stats.due > 0', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness);
  harness.store.updateSubjectUi('punctuation', {
    stats: { due: 3, secure: 2, fresh: 5, weak: 0 },
  });
  const html = harness.render();
  assert.match(html, /data-punctuation-summary-review-hint/);
  assert.match(html, /More practice is ready for you today/);
});

// ---------------------------------------------------------------------------
// 4. Monster-progress teaser (only renders when a stage advanced).
// ---------------------------------------------------------------------------

test('U5 Summary: monster-progress teaser renders when summary.monsterProgress carries a stage delta', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness, {
    monsterProgress: { monsterId: 'pealark', stageFrom: 0, stageTo: 1 },
  });
  const html = harness.render();
  assert.match(html, /data-punctuation-summary-monster-teaser/);
  assert.match(html, /data-teaser-monster-id="pealark"/);
  // Child-register celebration copy — no adult "stage" language in the
  // headline, but the from/to is encoded as data attributes for
  // telemetry / test use.
  assert.match(html, /Pealark levelled up/);
});

test('U5 Summary: monster-progress teaser is absent when no stage advanced this round', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness);
  const html = harness.render();
  assert.doesNotMatch(html, /data-punctuation-summary-monster-teaser/);
});

test('U5 Summary: monster-progress teaser is suppressed for a reserved monster id', () => {
  // Defence-in-depth: even if an upstream payload carries a reserved monster
  // id (`colisk` / `hyphang` / `carillon`), the teaser must never render it.
  // Mirrors the U2 subjectId-annotation fix — the iterator is
  // `ACTIVE_PUNCTUATION_MONSTER_IDS`, full stop.
  const harness = createPunctuationHarness();
  openSummaryScene(harness, {
    monsterProgress: { monsterId: 'colisk', stageFrom: 0, stageTo: 1 },
  });
  const html = harness.render();
  assert.doesNotMatch(html, /data-teaser-monster-id="colisk"/);
  assert.doesNotMatch(html, /data-punctuation-summary-monster-teaser/);
});

// ---------------------------------------------------------------------------
// 5. Reward parity proof across five surfaces.
// ---------------------------------------------------------------------------

test('U5 Reward parity: one secured speech-core unit surfaces coherent progress on all five surfaces', () => {
  // R6 parity: a single seeded `monster-codex` state (the canonical
  // repository write produced by the Punctuation reward subscriber) feeds
  // all five learner-facing reads:
  //   - Setup's active-monster strip (direct `rewardState`)
  //   - Summary's monster-progress strip (direct `rewardState`)
  //   - Map's monster-group iterator (direct `rewardState`)
  //   - Home SubjectCard.progress (scalar `pct` projection via `getDashboardStats`)
  //   - Codex entry's caught/mastered fields (projection via monsterSummary)
  //
  // The three shapes derive from the same underlying write — the test locks
  // the invariant that each projection reads a real value, not a stale dead
  // path.
  const releaseId = PUNCTUATION_RELEASE_ID;
  const speechKey = createPunctuationMasteryKey({
    releaseId,
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
  });
  const monsterCodexState = {
    pealark: {
      releaseId,
      mastered: [speechKey],
      masteredCount: 1,
      publishedTotal: 5,
      caught: true,
      branch: 'b1',
    },
    // Reserved monsters seeded deliberately so each surface's filter is
    // exercised at the same time as parity.
    colisk: {
      releaseId,
      mastered: [speechKey],
      masteredCount: 1,
      publishedTotal: 5,
      caught: true,
      branch: 'b1',
    },
  };

  // Setup — standalone render with the seeded rewardState.
  const setupHtml = renderPunctuationSetupSceneStandalone({
    ui: { availability: { status: 'ready' } },
    actions: { dispatch() {}, updateSubjectUi() {} },
    prefs: { mode: 'smart', roundLength: '4' },
    stats: {},
    learner: null,
    rewardState: monsterCodexState,
  });
  assert.match(setupHtml, /data-monster-id="pealark"/);
  assert.match(setupHtml, /1\/5 secure/);
  assert.doesNotMatch(setupHtml, /data-monster-id="colisk"/);

  // Summary — same rewardState prop; the strip reads pealark's stage.
  const summaryHtml = renderPunctuationSummarySceneStandalone({
    ui: { availability: { status: 'ready' } },
    actions: { dispatch() {} },
    rewardState: monsterCodexState,
  });
  assert.match(summaryHtml, /data-monster-id="pealark"/);
  // 1 of 5 secured → stage 1 (>0 but <1/3 of 5 (~1.67)).
  assert.match(summaryHtml, /aria-label="Pealark stage 1 of 4"/);
  assert.doesNotMatch(summaryHtml, /data-monster-id="colisk"/);

  // Map — rewardState feeds the MonsterGroup mastered-count.
  const mapHtml = renderPunctuationMapSceneStandalone({
    ui: { availability: { status: 'ready' }, rewardState: monsterCodexState },
    actions: { dispatch() {} },
  });
  assert.match(mapHtml, /aria-label="Pealark skills"/);
  // Mastered count surfaces on the group header — 1 from the seeded key.
  const pealarkGroup = mapHtml.match(/data-monster-id="pealark"[\s\S]*?class="punctuation-map-skill-grid"/);
  assert.ok(pealarkGroup && /1 mastered/.test(pealarkGroup[0]), 'Map Pealark group should show 1 mastered');
  assert.doesNotMatch(mapHtml, /data-monster-id="colisk"/);

  // Home SubjectCard.progress — the scalar `pct` projection derived from
  // the subject's `getDashboardStats`. Seed via buildSubjectCards.
  const subjectCards = buildSubjectCards(
    [
      {
        id: 'punctuation',
        name: 'Punctuation',
        blurb: 'Punctuation practice',
        available: true,
      },
    ],
    { punctuation: { pct: 7, due: 0, streak: 1, nextUp: 'Smart Review' } },
  );
  // pct 7% reflects 1 of 14 total published reward units — the canonical
  // Home scalar projection. Non-zero under the same seeded write.
  assert.equal(subjectCards[0].id, 'punctuation');
  assert.equal(Math.round((subjectCards[0].progress || 0) * 100), 7);

  // Codex entry — projection via `activePunctuationMonsterSummaryFromState`
  // + `buildCodexEntries`. Pealark should surface as caught with
  // mastered >= 1; reserved monsters must not appear in the projection.
  const summary = activePunctuationMonsterSummaryFromState(monsterCodexState);
  const pealarkSummary = summary.find((entry) => entry?.monster?.id === 'pealark');
  assert.ok(pealarkSummary, 'Pealark must appear in active monster summary');
  assert.equal(pealarkSummary.progress.caught, true);
  assert.equal(pealarkSummary.progress.mastered, 1);
  assert.equal(pealarkSummary.progress.publishedTotal, 5);
  // Reserved monster does NOT appear in the active-only projection.
  assert.equal(summary.some((entry) => entry?.monster?.id === 'colisk'), false);
  const codexEntries = buildCodexEntries(summary);
  const pealarkCodex = codexEntries.find((entry) => entry.id === 'pealark');
  assert.ok(pealarkCodex, 'Pealark must appear in codex entries');
  assert.equal(pealarkCodex.subjectId, 'punctuation');
});

// ---------------------------------------------------------------------------
// 6. Reserved-monster filter on Summary strip (regression guard).
// ---------------------------------------------------------------------------

test('U5 Summary: reserved monsters never render in the Summary strip even when seeded in rewardState', () => {
  // The Summary strip iterates `ACTIVE_PUNCTUATION_MONSTER_IDS` (not the
  // seeded rewardState keys). Seeding reserved monsters must be a no-op
  // on every learner-facing surface (plan R6 reserved-monster clause).
  const reservedRewardState = {
    pealark: { mastered: [], caught: false },
    colisk: { mastered: ['junk-1', 'junk-2'], caught: true },
    hyphang: { mastered: ['junk-3'], caught: true },
    carillon: { mastered: ['junk-4', 'junk-5'], caught: true },
  };
  const html = renderPunctuationSummarySceneStandalone({
    ui: { availability: { status: 'ready' }, summary: { total: 0, correct: 0, accuracy: 0, focus: [] } },
    actions: { dispatch() {} },
    rewardState: reservedRewardState,
  });
  for (const reserved of ['colisk', 'hyphang', 'carillon']) {
    assert.doesNotMatch(
      html,
      new RegExp(`data-monster-id="${reserved}"`),
      `reserved monster ${reserved} must never surface on the Summary strip`,
    );
  }
  // Sanity: the four active monsters all render.
  for (const active of ['pealark', 'claspin', 'curlune', 'quoral']) {
    assert.match(html, new RegExp(`data-monster-id="${active}"`));
  }
});

// ---------------------------------------------------------------------------
// 7. Telemetry — summary-reached + feedback-rendered fire once per mount.
// ---------------------------------------------------------------------------

test('U5 Summary telemetry: summary-reached and feedback-rendered fire exactly once per mount', () => {
  const calls = [];
  const actions = {
    dispatch(action, data) {
      calls.push({ action, data });
    },
  };
  renderPunctuationSummarySceneStandalone({
    ui: {
      availability: { status: 'ready' },
      session: { id: 'sess-u5-1', mode: 'smart' },
      summary: {
        sessionId: 'sess-u5-1',
        total: 4,
        correct: 3,
        accuracy: 75,
        focus: [],
      },
    },
    actions,
    rewardState: {},
  });
  const recordEvents = calls.filter((entry) => entry.action === 'punctuation-record-event');
  const summaryReached = recordEvents.filter((entry) => entry.data.kind === 'summary-reached');
  const feedbackRendered = recordEvents.filter((entry) => entry.data.kind === 'feedback-rendered');
  assert.strictEqual(
    summaryReached.length,
    1,
    `Summary mount must emit exactly ONE summary-reached event; saw ${summaryReached.length}`,
  );
  assert.strictEqual(
    feedbackRendered.length,
    1,
    `Summary mount must emit exactly ONE feedback-rendered event; saw ${feedbackRendered.length}`,
  );
  // Payload shape — `summary-reached` carries sessionId / total / correct /
  // accuracy; `feedback-rendered` carries sessionId / itemId / correct.
  assert.equal(summaryReached[0].data.payload.sessionId, 'sess-u5-1');
  assert.equal(summaryReached[0].data.payload.total, 4);
  assert.equal(summaryReached[0].data.payload.correct, 3);
  assert.equal(summaryReached[0].data.payload.accuracy, 75);
  assert.equal(summaryReached[0].data.mutates, false);
  assert.equal(feedbackRendered[0].data.mutates, false);
});

// ---------------------------------------------------------------------------
// 8. Telemetry — monster-progress-changed fires when a stage advances.
// ---------------------------------------------------------------------------

test('U5 Summary telemetry: monster-progress-changed fires on mount when monsterProgress is present', () => {
  const calls = [];
  const actions = {
    dispatch(action, data) {
      calls.push({ action, data });
    },
  };
  renderPunctuationSummarySceneStandalone({
    ui: {
      availability: { status: 'ready' },
      session: { id: 'sess-u5-2', mode: 'smart' },
      summary: {
        sessionId: 'sess-u5-2',
        total: 4,
        correct: 4,
        accuracy: 100,
        focus: [],
        monsterProgress: { monsterId: 'pealark', stageFrom: 0, stageTo: 1 },
      },
    },
    actions,
    rewardState: {},
  });
  const recordEvents = calls.filter((entry) => entry.action === 'punctuation-record-event');
  const monsterProgressChanged = recordEvents.filter(
    (entry) => entry.data.kind === 'monster-progress-changed',
  );
  assert.strictEqual(
    monsterProgressChanged.length,
    1,
    `stage-advance must emit exactly ONE monster-progress-changed event; saw ${monsterProgressChanged.length}`,
  );
  assert.deepEqual(monsterProgressChanged[0].data.payload, {
    monsterId: 'pealark',
    stageFrom: 0,
    stageTo: 1,
  });
  assert.equal(monsterProgressChanged[0].data.mutates, false);
});

test('U5 Summary telemetry: monster-progress-changed does NOT fire when monsterProgress is absent', () => {
  const calls = [];
  const actions = {
    dispatch(action, data) {
      calls.push({ action, data });
    },
  };
  renderPunctuationSummarySceneStandalone({
    ui: {
      availability: { status: 'ready' },
      summary: { total: 4, correct: 3, accuracy: 75, focus: [] },
    },
    actions,
    rewardState: {},
  });
  const recordEvents = calls.filter((entry) => entry.action === 'punctuation-record-event');
  const monsterProgressChanged = recordEvents.filter(
    (entry) => entry.data.kind === 'monster-progress-changed',
  );
  assert.strictEqual(
    monsterProgressChanged.length,
    0,
    'no stage advance → no monster-progress-changed emission',
  );
});

test('U5 Summary telemetry: monster-progress-changed is suppressed for reserved monster ids', () => {
  // A malformed `monsterProgress.monsterId` pointing at a reserved id must
  // not emit (the teaser does not render either — paired with test above).
  const calls = [];
  const actions = {
    dispatch(action, data) {
      calls.push({ action, data });
    },
  };
  renderPunctuationSummarySceneStandalone({
    ui: {
      availability: { status: 'ready' },
      session: { id: 'sess-u5-3' },
      summary: {
        sessionId: 'sess-u5-3',
        total: 4,
        correct: 4,
        accuracy: 100,
        focus: [],
        monsterProgress: { monsterId: 'colisk', stageFrom: 0, stageTo: 1 },
      },
    },
    actions,
    rewardState: {},
  });
  const recordEvents = calls.filter((entry) => entry.action === 'punctuation-record-event');
  const monsterProgressChanged = recordEvents.filter(
    (entry) => entry.data.kind === 'monster-progress-changed',
  );
  assert.strictEqual(
    monsterProgressChanged.length,
    0,
    'reserved monster id → no monster-progress-changed emission',
  );
});

// ---------------------------------------------------------------------------
// 9. U6 invariant regression guard — Back button stays enabled under U5 add-ons.
// ---------------------------------------------------------------------------

test('U5 regression: Summary Back button still renders aria-disabled="false" under pendingCommand after U5 additions', () => {
  const harness = createPunctuationHarness();
  openSummaryScene(harness, {
    skillsExercised: ['speech', 'comma_clarity'],
    focus: ['speech'],
    monsterProgress: { monsterId: 'pealark', stageFrom: 0, stageTo: 1 },
  });
  harness.store.updateSubjectUi('punctuation', {
    pendingCommand: 'punctuation-submit-form',
  });
  const html = harness.render();
  // U6 invariant: Back to dashboard stays enabled under pendingCommand.
  assert.match(
    html,
    /<button[^>]*aria-disabled="false"[^>]*data-action="punctuation-back"|<button[^>]*data-action="punctuation-back"[^>]*aria-disabled="false"/,
    'Summary Back must render aria-disabled="false" under pendingCommand even with U5 additions (plan R7 / U6)',
  );
});
