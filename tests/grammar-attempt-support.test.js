import test from 'node:test';
import assert from 'node:assert/strict';

import {
  composeAttemptSupport,
  deriveAttemptSupport,
  normaliseStoredAttempt,
  SUPPORT_CONTRACT_VERSION,
  SUPPORT_USED_VALUES,
  supportLevelForSessionWithContract,
} from '../worker/src/subjects/grammar/attempt-support.js';
import {
  applyGrammarAttemptToState,
  createInitialGrammarState,
  normaliseServerGrammarData,
} from '../worker/src/subjects/grammar/engine.js';
import {
  createGrammarQuestion,
  evaluateGrammarQuestion,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

function independentCorrectAnswer() {
  const question = createGrammarQuestion({ templateId: 'fronted_adverbial_choose', seed: 100 });
  const correctOption = question.inputSpec.options.find(
    (option) => evaluateGrammarQuestion(question, { answer: option.value }).correct,
  );
  return {
    item: serialiseGrammarQuestion(question),
    answer: { answer: correctOption.value },
  };
}

test('SUPPORT_CONTRACT_VERSION is the new default (v2)', () => {
  assert.equal(SUPPORT_CONTRACT_VERSION, 2);
});

test('SUPPORT_USED_VALUES includes all five legal attributions', () => {
  assert.deepEqual(SUPPORT_USED_VALUES.slice().sort(), [
    'ai-explanation-after-marking',
    'faded',
    'none',
    'nudge',
    'worked',
  ]);
});

test('deriveAttemptSupport maps every legacy (mode, supportLevel, attempts) combo', () => {
  const modes = ['worked', 'faded', 'smart', 'learn', 'trouble', 'surgery', 'builder', 'satsset'];
  const supportLevels = [0, 1, 2];
  const attemptCounts = [1, 2, 3];

  for (const mode of modes) {
    for (const supportLevel of supportLevels) {
      for (const attempts of attemptCounts) {
        const derived = deriveAttemptSupport({ mode, supportLevel, attempts });
        assert.ok(
          SUPPORT_USED_VALUES.includes(derived.supportUsed),
          `${mode}/${supportLevel}/${attempts} => unknown supportUsed ${derived.supportUsed}`,
        );
        assert.ok([0, 1, 2].includes(derived.supportLevelAtScoring));
        assert.equal(typeof derived.firstAttemptIndependent, 'boolean');
        // Invariant: firstAttemptIndependent requires attempts===1 AND supportUsed==='none'
        if (derived.firstAttemptIndependent) {
          assert.equal(attempts, 1);
          assert.equal(derived.supportUsed, 'none');
        }
      }
    }
  }
});

test('deriveAttemptSupport: worked mode always attributes `worked`', () => {
  const derived = deriveAttemptSupport({ mode: 'worked', supportLevel: 2, attempts: 1 });
  assert.equal(derived.supportUsed, 'worked');
  assert.equal(derived.supportLevelAtScoring, 2);
  assert.equal(derived.firstAttemptIndependent, false);
});

test('deriveAttemptSupport: faded mode always attributes `faded`', () => {
  const derived = deriveAttemptSupport({ mode: 'faded', supportLevel: 1, attempts: 1 });
  assert.equal(derived.supportUsed, 'faded');
  assert.equal(derived.supportLevelAtScoring, 1);
});

test('deriveAttemptSupport: faded+level=1+attempts=2 resolves to faded not nudge', () => {
  const derived = deriveAttemptSupport({ mode: 'faded', supportLevel: 1, attempts: 2 });
  assert.equal(derived.supportUsed, 'faded', 'Mode-based attribution takes precedence over retry signal.');
});

test('deriveAttemptSupport: retry without worked/faded mode attributes `nudge`', () => {
  const derived = deriveAttemptSupport({ mode: 'smart', supportLevel: 0, attempts: 2 });
  assert.equal(derived.supportUsed, 'nudge');
  assert.equal(derived.supportLevelAtScoring, 0);
  assert.equal(derived.firstAttemptIndependent, false);
});

test('deriveAttemptSupport: independent correct returns firstAttemptIndependent=true', () => {
  const derived = deriveAttemptSupport({ mode: 'smart', supportLevel: 0, attempts: 1 });
  assert.equal(derived.supportUsed, 'none');
  assert.equal(derived.supportLevelAtScoring, 0);
  assert.equal(derived.firstAttemptIndependent, true);
});

test('deriveAttemptSupport: legacy Smart + session-level promotion (supportLevel=1) infers faded', () => {
  // Under contract v1, Smart + allowTeachingItems forced supportLevel=1 session-wide.
  // For a legacy attempt stamped with supportLevel=1 and mode=smart, the learner
  // was shown faded content, so we conservatively attribute 'faded' rather than erase
  // evidence with 'none'.
  const derived = deriveAttemptSupport({ mode: 'smart', supportLevel: 1, attempts: 1 });
  assert.equal(derived.supportUsed, 'faded');
  assert.equal(derived.supportLevelAtScoring, 1);
  assert.equal(derived.firstAttemptIndependent, false);
});

test('composeAttemptSupport: post-marking enrichment never reduces mastery gain', () => {
  const composed = composeAttemptSupport({
    mode: 'smart',
    sessionSupportLevel: 1,
    attempts: 1,
    postMarkingEnrichment: true,
  });
  assert.equal(composed.supportUsed, 'ai-explanation-after-marking');
  assert.equal(composed.supportLevelAtScoring, 0, 'Post-marking enrichment does not reduce mastery gain.');
  assert.equal(composed.firstAttemptIndependent, true);
});

test('composeAttemptSupport: explicit supportUsed takes precedence over session-derived', () => {
  const composed = composeAttemptSupport({
    mode: 'smart',
    sessionSupportLevel: 0,
    attempts: 1,
    supportUsed: 'faded',
  });
  assert.equal(composed.supportUsed, 'faded');
  assert.equal(composed.supportLevelAtScoring, 1);
});

test('composeAttemptSupport: invalid supportUsed falls back to session-derived', () => {
  const composed = composeAttemptSupport({
    mode: 'worked',
    sessionSupportLevel: 2,
    attempts: 1,
    supportUsed: 'garbage-value',
  });
  assert.equal(composed.supportUsed, 'worked', 'Invalid supportUsed should not poison the attribution.');
  assert.equal(composed.supportLevelAtScoring, 2);
});

test('normaliseStoredAttempt: a legacy attempt without new fields gains them on load', () => {
  const legacy = {
    templateId: 'fronted_adverbial_choose',
    supportLevel: 1,
    attempts: 1,
    mode: 'smart',
  };
  const normalised = normaliseStoredAttempt(legacy);
  assert.equal(normalised.supportUsed, 'faded');
  assert.equal(normalised.supportLevelAtScoring, 1);
  assert.equal(normalised.firstAttemptIndependent, false);
  // Legacy fields preserved
  assert.equal(normalised.supportLevel, 1);
  assert.equal(normalised.attempts, 1);
});

test('normaliseStoredAttempt is idempotent on already-U3-shaped records', () => {
  const u3Shape = {
    templateId: 'fronted_adverbial_choose',
    supportLevel: 0,
    attempts: 1,
    mode: 'smart',
    firstAttemptIndependent: true,
    supportUsed: 'none',
    supportLevelAtScoring: 0,
  };
  const normalised = normaliseStoredAttempt(u3Shape);
  assert.equal(normalised.supportUsed, 'none');
  assert.equal(normalised.firstAttemptIndependent, true);
  assert.equal(normalised.supportLevelAtScoring, 0);
});

test('supportLevelForSessionWithContract: contract v2 drops Smart+teaching promotion', () => {
  // v1 legacy behaviour preserved for in-flight sessions stamped v1.
  assert.equal(
    supportLevelForSessionWithContract({ mode: 'smart', prefs: { allowTeachingItems: true }, contractVersion: 1 }),
    1,
  );
  // v2 default behaviour: Smart + teaching items no longer forces session-level 1.
  assert.equal(
    supportLevelForSessionWithContract({ mode: 'smart', prefs: { allowTeachingItems: true }, contractVersion: 2 }),
    0,
  );
  // worked/faded modes still force session level regardless of contract.
  assert.equal(supportLevelForSessionWithContract({ mode: 'worked', contractVersion: 2 }), 2);
  assert.equal(supportLevelForSessionWithContract({ mode: 'faded', contractVersion: 2 }), 1);
});

test('applyGrammarAttemptToState: Smart Review independent correct gets full credit under v2', () => {
  const { item, answer } = independentCorrectAnswer();
  const state = createInitialGrammarState();
  state.prefs.allowTeachingItems = true;
  const applied = applyGrammarAttemptToState(state, {
    learnerId: 'learner-a',
    item,
    response: answer,
    supportLevel: 0, // The session's modeSupportLevel under contract v2 with Smart + allowTeachingItems
    attempts: 1,
    mode: 'smart',
    now: 1_777_000_000_000,
  });
  assert.equal(applied.quality, 5, 'Independent first-attempt correct must get quality 5, not downgraded.');
  const attempt = state.recentAttempts.at(-1);
  assert.equal(attempt.firstAttemptIndependent, true);
  assert.equal(attempt.supportUsed, 'none');
  assert.equal(attempt.supportLevelAtScoring, 0);
  assert.equal(attempt.mode, 'smart');
});

test('applyGrammarAttemptToState: worked mode attempt attributes worked + quality reduced', () => {
  const { item, answer } = independentCorrectAnswer();
  const state = createInitialGrammarState();
  const applied = applyGrammarAttemptToState(state, {
    learnerId: 'learner-a',
    item,
    response: answer,
    supportLevel: 2,
    attempts: 1,
    mode: 'worked',
    now: 1_777_000_000_000,
  });
  assert.equal(applied.quality, 3, 'worked-mode correctness is quality 3.');
  const attempt = state.recentAttempts.at(-1);
  assert.equal(attempt.supportUsed, 'worked');
  assert.equal(attempt.supportLevelAtScoring, 2);
  assert.equal(attempt.firstAttemptIndependent, false);
});

test('applyGrammarAttemptToState: event dual-writes legacy and new support fields', () => {
  const { item, answer } = independentCorrectAnswer();
  const state = createInitialGrammarState();
  const applied = applyGrammarAttemptToState(state, {
    learnerId: 'learner-a',
    item,
    response: answer,
    supportLevel: 0,
    attempts: 1,
    mode: 'smart',
    now: 1_777_000_000_000,
  });
  const answerEvent = applied.events.find((event) => event.type === 'grammar.answer-submitted');
  assert.ok(answerEvent, 'answer-submitted event must be emitted');
  // Legacy fields still present
  assert.equal(typeof answerEvent.supportLevel, 'number');
  assert.equal(typeof answerEvent.attempts, 'number');
  // New fields present
  assert.equal(answerEvent.firstAttemptIndependent, true);
  assert.equal(answerEvent.supportUsed, 'none');
  assert.equal(answerEvent.supportLevelAtScoring, 0);
  assert.equal(answerEvent.mode, 'smart');
  assert.equal(answerEvent.supportContractVersion, 2);
});

test('normaliseServerGrammarData: pre-U3 stored attempts get normalised on load', () => {
  const rawState = {
    contentReleaseId: 'grammar-legacy-reviewed-2026-04-24',
    recentAttempts: [
      {
        templateId: 'fronted_adverbial_choose',
        itemId: 'fronted_adverbial_choose::100',
        seed: 100,
        questionType: 'choose',
        conceptIds: ['adverbials'],
        response: { answer: 'x' },
        result: { correct: true, score: 1, maxScore: 1 },
        supportLevel: 1,
        attempts: 1,
        mode: 'smart',
        createdAt: 1_700_000_000_000,
        // NO firstAttemptIndependent / supportUsed / supportLevelAtScoring fields
      },
    ],
  };
  const normalised = normaliseServerGrammarData(rawState);
  const attempt = normalised.recentAttempts[0];
  assert.equal(attempt.supportUsed, 'faded');
  assert.equal(attempt.supportLevelAtScoring, 1);
  assert.equal(attempt.firstAttemptIndependent, false);
});

test('event-log replay: pre-U3 events project consistently with post-U3 events', () => {
  // Pre-U3 event: only `supportLevel` + `attempts` + `mode`
  const preU3Event = {
    type: 'grammar.answer-submitted',
    supportLevel: 1,
    attempts: 1,
    mode: 'smart',
  };
  // Post-U3 event: both shapes dual-written
  const postU3Event = {
    type: 'grammar.answer-submitted',
    supportLevel: 1,
    attempts: 1,
    mode: 'smart',
    firstAttemptIndependent: false,
    supportUsed: 'faded',
    supportLevelAtScoring: 1,
    supportContractVersion: 2,
  };

  // A replayer-side projection would use deriveAttemptSupport on the legacy event
  // and read the new fields directly from the post-U3 event.
  const preU3Projected = deriveAttemptSupport({
    mode: preU3Event.mode,
    supportLevel: preU3Event.supportLevel,
    attempts: preU3Event.attempts,
  });
  const postU3Projected = {
    firstAttemptIndependent: postU3Event.firstAttemptIndependent,
    supportUsed: postU3Event.supportUsed,
    supportLevelAtScoring: postU3Event.supportLevelAtScoring,
  };

  assert.deepEqual(preU3Projected, postU3Projected,
    'Pre-U3 and post-U3 events must project to identical new-field triples for the same semantic case.');
});
