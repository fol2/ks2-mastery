import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderSpellingClozeFixture,
  renderSpellingGuardianSummaryFixture,
  renderSpellingSurfaceFixture,
} from './helpers/react-render.js';
import { createSpellingReadModelService } from '../src/subjects/spelling/client-read-models.js';

test('React spelling setup scene renders primary practice controls', async () => {
  const html = await renderSpellingSurfaceFixture({ phase: 'setup' });

  assert.match(html, /Round setup/);
  assert.match(html, /Begin 20 words/);
  assert.match(html, /data-action="spelling-start"/);
});

test('React spelling setup scene disables start while a remote start is pending', async () => {
  const html = await renderSpellingSurfaceFixture({
    phase: 'setup',
    pendingCommand: 'start-session',
  });

  assert.match(html, /Starting\.\.\./);
  assert.match(html, /<button[^>]*data-action="spelling-start"[^>]*disabled=""/);
});

test('React spelling setup scene disables start while options are saving', async () => {
  const html = await renderSpellingSurfaceFixture({
    phase: 'setup',
    pendingCommand: 'save-prefs',
  });

  assert.match(html, /Saving\.\.\./);
  assert.match(html, /<button[^>]*data-action="spelling-start"[^>]*disabled=""/);
});

test('client spelling read model preserves word-family variant preference', () => {
  const service = createSpellingReadModelService({
    getState: () => ({
      learners: { selectedId: 'learner-a' },
      subjectUi: {
        spelling: {
          subjectId: 'spelling',
          learnerId: 'learner-a',
          version: 2,
          phase: 'dashboard',
          prefs: {
            mode: 'smart',
            yearFilter: 'extra',
            roundLength: '20',
            showCloze: true,
            autoSpeak: true,
            extraWordFamilies: true,
          },
        },
      },
    }),
  });

  assert.equal(service.getPrefs('learner-a').extraWordFamilies, true);
});

// ----- U1: remote-sync fallback getPostMasteryState stub ---------------------
// The Setup scene reads `postMastery` via the runtime service. Under
// remote-sync runtime, the client shell does not have direct access to the
// learner's guardian map, so `createSpellingReadModelService#getPostMasteryState`
// returns a defensive stub until the first command response carries the
// real state. U1 adds new dashboard-gating scalars; the stub must expose
// them with safe defaults (locked state, begin disabled) so the remote-sync
// dashboard does not render with `undefined` gating scalars.

test('U1 client-read-models stub: getPostMasteryState returns locked defaults for all U1 fields', () => {
  const service = createSpellingReadModelService({
    getState: () => ({}),
  });
  const snapshot = service.getPostMasteryState('learner-a');
  assert.equal(snapshot.allWordsMega, false);
  assert.equal(snapshot.guardianDueCount, 0);
  assert.equal(snapshot.wobblingCount, 0);
  assert.equal(snapshot.nextGuardianDueDay, null);
  // U1 additions — critical: without these, the remote-sync dashboard
  // would read `undefined` for the Begin gate and stay permanently disabled.
  assert.equal(snapshot.guardianMissionState, 'locked');
  assert.equal(snapshot.guardianMissionAvailable, false);
  assert.equal(snapshot.unguardedMegaCount, 0);
  assert.equal(snapshot.guardianAvailableCount, 0);
  assert.equal(snapshot.wobblingDueCount, 0);
  assert.equal(snapshot.nonWobblingDueCount, 0);
});

test('U1 client-read-models stub: cached postMastery from app state wins over defaults', () => {
  const cached = {
    allWordsMega: true,
    guardianDueCount: 2,
    wobblingCount: 1,
    nextGuardianDueDay: 12345,
    todayDay: 18000,
    guardianMap: {},
    guardianMissionState: 'wobbling',
    guardianMissionAvailable: true,
    unguardedMegaCount: 0,
    guardianAvailableCount: 2,
    wobblingDueCount: 1,
    nonWobblingDueCount: 1,
  };
  const service = createSpellingReadModelService({
    getState: () => ({
      subjectUi: {
        spelling: {
          subjectId: 'spelling',
          learnerId: 'learner-a',
          version: 2,
          phase: 'dashboard',
          postMastery: cached,
        },
      },
    }),
  });
  const snapshot = service.getPostMasteryState('learner-a');
  assert.equal(snapshot.guardianMissionState, 'wobbling');
  assert.equal(snapshot.guardianMissionAvailable, true);
  assert.equal(snapshot.wobblingDueCount, 1);
  assert.equal(snapshot.nonWobblingDueCount, 1);
});

test('React spelling session scene preserves input, replay, and submit affordances', async () => {
  const html = await renderSpellingSurfaceFixture({ phase: 'session' });

  assert.match(html, /Spell the word you hear|Spell the dictated word/);
  assert.match(html, /name="typed"/);
  assert.match(html, /data-action="spelling-replay"/);
  assert.match(html, /data-action="spelling-submit-form"/);
});

test('React cloze renders one blank for variable-length underscore placeholders', async () => {
  const html = await renderSpellingClozeFixture({
    sentence: 'Each group wrote a prediction for the __________.',
    answer: 'experiment',
  });

  assert.match(html, /<span class="blank">/);
  assert.doesNotMatch(html, /__\./);
});

test('React spelling summary and word bank scenes render migration-critical states', async () => {
  const summaryHtml = await renderSpellingSurfaceFixture({ phase: 'summary' });
  const wordBankHtml = await renderSpellingSurfaceFixture({ phase: 'word-bank' });
  const modalHtml = await renderSpellingSurfaceFixture({ phase: 'modal' });

  assert.match(summaryHtml, /summary-card/);
  assert.match(summaryHtml, /Session summary/);
  assert.match(wordBankHtml, /Word bank progress/);
  assert.match(wordBankHtml, /data-action="spelling-analytics-status-filter"/);
  assert.match(modalHtml, /aria-labelledby="wb-modal-word"/);
  assert.match(modalHtml, /data-action="spelling-word-bank-drill-submit"/);
});

// ----- U5: post-Mega dashboard + Alt+4 shortcut --------------------------------

test('React spelling setup scene renders the legacy 3-mode row when allWordsMega is false', async () => {
  const html = await renderSpellingSurfaceFixture({ phase: 'setup' });

  assert.match(html, /Smart Review/);
  assert.match(html, /Trouble Drill/);
  assert.match(html, /SATs Test/);
  assert.doesNotMatch(html, /Guardian Mission/);
  assert.doesNotMatch(html, /The Word Vault is yours/);
  assert.doesNotMatch(html, /Graduated · Spelling Guardian/);
});

test('React spelling setup scene renders the post-Mega dashboard with Guardian Mission + 3 placeholders when allWordsMega is true and words are due', async () => {
  // Seed a guardian record that is due today so the Guardian card renders
  // with the "active duty" treatment, not the "all rested" fallback.
  const today = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const html = await renderSpellingSurfaceFixture({
    phase: 'setup',
    postMega: {
      guardian: {
        possess: {
          reviewLevel: 2,
          lastReviewedDay: today - 7,
          nextDueDay: today,
          correctStreak: 2,
          lapses: 0,
          renewals: 0,
          wobbling: false,
        },
      },
    },
  });

  assert.match(html, /Graduated · Spelling Guardian/);
  assert.match(html, /The Word Vault is yours/);
  assert.match(html, /Guardian Mission/);
  assert.match(html, /Boss Dictation/);
  assert.match(html, /Word Detective/);
  assert.match(html, /Story Challenge/);
  // Placeholder roadmap labels should show "Next 02/03/04" rather than a
  // single generic "Coming soon" shield, so the codex reads as planned steps.
  assert.match(html, /mc-badge-roadmap/);
  // The begin button explicitly routes through spelling-shortcut-start with
  // mode=guardian so the module-level gate is the one source of truth.
  assert.match(html, /data-action="spelling-shortcut-start"[^>]*data-mode="guardian"/);
  assert.match(html, /ACTIVE DUTY/);
  assert.doesNotMatch(html, /Choose today/);
});

test('U1: React setup scene shows optional-patrol copy when post-Mega but no word is due today', async () => {
  // Fresh post-Mega learner with one existing guardian record scheduled for
  // the future, and (by seeding) 212 other core Mega words not yet in the
  // guardian map. Per the U1 state machine: zero due + top-up available →
  // 'optional-patrol'. The dashboard advertises an optional patrol rather
  // than a flat "All rested" because a round CAN still be produced.
  const today = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const html = await renderSpellingSurfaceFixture({
    phase: 'setup',
    postMega: {
      guardian: {
        possess: {
          reviewLevel: 2,
          lastReviewedDay: today,
          nextDueDay: today + 5,
          correctStreak: 2,
          lapses: 0,
          renewals: 0,
          wobbling: false,
        },
      },
    },
  });

  assert.match(html, /Graduated · Spelling Guardian/);
  assert.match(html, /Guardian Mission/);
  // U1 state machine wins: the dashboard advertises an optional patrol
  // because the selector can top up from non-due + unguarded Mega slugs.
  assert.match(html, /No urgent duties\. Optional patrol available/);
  assert.match(html, /OPTIONAL PATROL/);
  assert.match(html, /data-mission-state="optional-patrol"/);
  // The Begin CTA must be enabled in optional-patrol so the learner can
  // choose to run a warm-up round.
  assert.match(html, /<button[^>]*data-action="spelling-shortcut-start"[^>]*data-mode="guardian"[^>]*>Begin Guardian Mission/);
  assert.doesNotMatch(html, /<button[^>]*data-action="spelling-shortcut-start"[^>]*data-mode="guardian"[^>]*disabled=""/);
});

// ----- U6: Summary + Word Bank Guardian surfaces -----------------------------

test('React spelling Word Bank renders the legacy 6-chip row identically when allWordsMega is false', async () => {
  // When the learner has NOT graduated, the Word Bank must look exactly
  // like it did before U6 — no Guardian chips, no hint ribbon, no
  // Guardian-flavoured aggregate cards.
  const html = await renderSpellingSurfaceFixture({ phase: 'word-bank' });

  assert.match(html, /Word bank progress/);
  assert.doesNotMatch(html, /wb-chips--guardian/);
  assert.doesNotMatch(html, /wb-chip-guardian/);
  assert.doesNotMatch(html, /wb-guardian-hint/);
  assert.doesNotMatch(html, /data-value="guardianDue"/);
  assert.doesNotMatch(html, /data-value="wobbling"/);
  assert.doesNotMatch(html, /data-value="renewedRecently"/);
  assert.doesNotMatch(html, /data-value="neverRenewed"/);
  // Legacy chips must still be present.
  assert.match(html, /data-action="spelling-analytics-status-filter"[^>]*data-value="all"/);
  assert.match(html, /data-action="spelling-analytics-status-filter"[^>]*data-value="secure"/);
});

test('React spelling Word Bank renders the 4 Guardian chips only when allWordsMega is true', async () => {
  const today = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const html = await renderSpellingSurfaceFixture({
    phase: 'word-bank',
    postMega: {
      guardian: {
        possess: {
          reviewLevel: 2,
          lastReviewedDay: today - 2,
          nextDueDay: today,
          correctStreak: 2,
          lapses: 0,
          renewals: 0,
          wobbling: true,
        },
      },
    },
  });

  assert.match(html, /wb-chips--guardian/);
  assert.match(html, /data-action="spelling-analytics-status-filter"[^>]*data-value="guardianDue"/);
  assert.match(html, /data-action="spelling-analytics-status-filter"[^>]*data-value="wobbling"/);
  assert.match(html, /data-action="spelling-analytics-status-filter"[^>]*data-value="renewedRecently"/);
  assert.match(html, /data-action="spelling-analytics-status-filter"[^>]*data-value="neverRenewed"/);
  // The legacy chip row must remain intact alongside the new chips.
  assert.match(html, /data-action="spelling-analytics-status-filter"[^>]*data-value="all"/);
  assert.match(html, /data-action="spelling-analytics-status-filter"[^>]*data-value="secure"/);
  // Guardian-flavoured aggregate card labels surface on the aggregate card strip.
  assert.match(html, /Wobbling/);
});

test('React spelling Word Bank hint ribbon surfaces only when a Guardian filter is active', async () => {
  const today = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  // First render: default filter is `all`, so no hint should appear even
  // though we are post-mega and the chips exist.
  const neutralHtml = await renderSpellingSurfaceFixture({
    phase: 'word-bank',
    postMega: {
      guardian: {
        possess: {
          reviewLevel: 2,
          lastReviewedDay: today - 2,
          nextDueDay: today,
          correctStreak: 2,
          lapses: 0,
          renewals: 0,
          wobbling: false,
        },
      },
    },
  });
  assert.match(neutralHtml, /wb-chips--guardian/);
  assert.doesNotMatch(neutralHtml, /wb-guardian-hint/, 'no hint when filter is "all"');
});

test('React spelling Summary scene renders 3 Guardian cards when summary.mode === "guardian"', async () => {
  // Use the word-bank fixture path to graduate the learner first, then run
  // a short one-word Guardian round to produce a summary with mode=guardian.
  // We have to do this inline so the fixture stays isolated to this test.
  const html = await renderSpellingGuardianSummaryFixture({ correct: true });
  assert.match(html, /Guardian round complete/);
  assert.match(html, /summary-guardian-band/);
  assert.match(html, /Vault status/);
  assert.match(html, /summary-stat--guardian-renewed/);
  assert.match(html, /summary-stat--guardian-wobbling/);
  assert.match(html, /summary-stat--guardian-next-check/);
  assert.match(html, /Words renewed/);
  assert.match(html, /Words wobbling/);
  assert.match(html, /Next check/);
});

test('React spelling Summary scene does NOT render the Guardian band for mode="smart"', async () => {
  // Default phase=summary uses mode=smart — the legacy summary must not
  // grow any Guardian affordances (byte-compatibility with the prior shell).
  const html = await renderSpellingSurfaceFixture({ phase: 'summary' });
  assert.match(html, /summary-card/);
  assert.doesNotMatch(html, /summary-guardian-band/);
  assert.doesNotMatch(html, /Vault status/);
  assert.doesNotMatch(html, /summary-stat--guardian/);
  assert.doesNotMatch(html, /Guardian round complete/);
});

// ----- U3: Guardian-safe summary drill ---------------------------------------

test('U3 characterisation: legacy non-Guardian summary must not sprout the Practice button copy', async () => {
  // Characterisation baseline: today's Smart Review summary path still reads
  // like it did pre-U3 — none of the new Guardian-origin copy leaks into a
  // non-Guardian summary, regardless of whether mistakes are present. Only
  // Guardian summaries branch to the practice-only affordance.
  const html = await renderSpellingSurfaceFixture({ phase: 'summary' });
  assert.doesNotMatch(html, /Practice wobbling words/, 'non-Guardian summary must not show the U3 practice button');
  assert.doesNotMatch(html, /Optional practice\. Mega/, 'non-Guardian summary must not show U3 help copy');
});

test('U3 happy path: Guardian summary with mistakes renders "Practice wobbling words", not "Drill all"', async () => {
  // Wrong answer path yields `summary.mistakes.length === 1`. The new branch
  // must replace legacy "Drill all" + per-word "Drill" chips with a single
  // Practice button backed by the canonical guardianPracticeActionLabel().
  const html = await renderSpellingGuardianSummaryFixture({ correct: false });
  assert.match(html, /Practice wobbling words/, 'Guardian mistakes summary must show the Practice button');
  assert.doesNotMatch(html, /Drill all 1/, 'Guardian mistakes summary must not show the legacy "Drill all" label');
  // Canonical help copy from `guardianSummaryCopy()`.
  assert.match(html, /Optional practice\./);
  assert.match(html, /schedule will not change/);
  assert.match(html, /tomorrow/i);
});

test('U3 happy path: Guardian summary with mistakes hides per-word data-action="spelling-drill-single" chips', async () => {
  // The per-word "Drill" chip dispatches `spelling-drill-single` which in
  // legacy land starts a live-learning session that can demote on wrong. In
  // Guardian origin we must hide it entirely — the single Practice button is
  // the only affordance (it routes through mode='trouble', practiceOnly=true
  // and covers all mistakes at once).
  const html = await renderSpellingGuardianSummaryFixture({ correct: false });
  assert.doesNotMatch(html, /data-action="spelling-drill-single"/, 'Guardian summary must not expose per-word drill chips');
  // The Practice button is a single new affordance with a Guardian-specific
  // data-action so telemetry can distinguish it from the legacy drill.
  assert.match(html, /data-action="spelling-drill-all"/, 'Practice button wires into the same spelling-drill-all dispatch path');
});

test('U3 edge case: Guardian summary with zero mistakes does not render the Practice button', async () => {
  // All-correct Guardian round: summary.mistakes is empty, the drill area is
  // skipped entirely (legacy code already guards on mistakes.length).
  // This matches the existing SpellingSummaryScene contract — the Practice
  // button only makes sense when there is something to practice.
  const html = await renderSpellingGuardianSummaryFixture({ correct: true });
  assert.doesNotMatch(html, /Practice wobbling words/, 'zero-mistake Guardian summary must not render the Practice button');
  assert.doesNotMatch(html, /summary-drill-chips/, 'zero-mistake Guardian summary must not render the drill chips container');
});
