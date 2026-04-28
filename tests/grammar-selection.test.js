import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGrammarMiniPack,
  buildGrammarPracticeQueue,
  SELECTION_WEIGHTS,
} from '../worker/src/subjects/grammar/selection.js';
import {
  GRAMMAR_CONCEPTS,
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
  grammarQuestionVariantSignature,
  grammarTemplateById,
  grammarTemplateGeneratorFamilyId,
} from '../worker/src/subjects/grammar/content.js';
import { createInitialGrammarState } from '../worker/src/subjects/grammar/engine.js';

function emptyState() {
  return createInitialGrammarState();
}

function fillConcept(state, conceptId, node) {
  state.mastery.concepts[conceptId] = {
    attempts: 0,
    correct: 0,
    wrong: 0,
    strength: 0.25,
    intervalDays: 0,
    dueAt: 0,
    lastSeenAt: null,
    lastWrongAt: null,
    correctStreak: 0,
    ...node,
  };
}

function fillQuestionType(state, questionTypeId, node) {
  state.mastery.questionTypes[questionTypeId] = {
    attempts: 0,
    correct: 0,
    wrong: 0,
    strength: 0.25,
    intervalDays: 0,
    dueAt: 0,
    lastSeenAt: null,
    lastWrongAt: null,
    correctStreak: 0,
    ...node,
  };
}

function pushRecentAttempt(state, attempt) {
  state.recentAttempts = [...(state.recentAttempts || []), {
    contentReleaseId: attempt.contentReleaseId || 'grammar-legacy-reviewed-2026-04-24',
    templateId: attempt.templateId,
    itemId: attempt.itemId || `${attempt.templateId}::${attempt.seed || 0}`,
    seed: attempt.seed || 0,
    questionType: attempt.questionType || 'choose',
    conceptIds: attempt.conceptIds || [],
    response: attempt.response || {},
    result: attempt.result || { correct: true },
    supportLevel: attempt.supportLevel || 0,
    attempts: attempt.attempts || 1,
    createdAt: attempt.createdAt || Date.now(),
  }];
}

function recentGeneratedAttempt(templateId, seed, conceptIds) {
  const template = grammarTemplateById(templateId);
  const question = createGrammarQuestion({ templateId, seed });
  return {
    contentReleaseId: 'grammar-qg-p1-2026-04-28',
    templateId,
    itemId: question.itemId,
    seed,
    questionType: template.questionType,
    conceptIds,
    response: {},
    result: { correct: true },
    generatorFamilyId: grammarTemplateGeneratorFamilyId(template),
    variantSignature: grammarQuestionVariantSignature(question),
    createdAt: 1_777_000_000_000,
  };
}

function queueFor(options) {
  const state = options.state || emptyState();
  return buildGrammarPracticeQueue({
    mode: options.mode || 'smart',
    focusConceptId: options.focusConceptId || '',
    mastery: state.mastery,
    recentAttempts: state.recentAttempts || [],
    seed: options.seed || 42,
    size: options.size || 12,
    now: options.now || 1_777_000_000_000,
  });
}

test('buildGrammarPracticeQueue exports stable weight constants', () => {
  assert.equal(typeof SELECTION_WEIGHTS, 'object');
  for (const key of ['due', 'weak', 'recentMiss', 'qtWeakness', 'templateFreshness', 'variantFreshness', 'conceptFreshness', 'focus', 'generative']) {
    assert.equal(typeof SELECTION_WEIGHTS[key], 'number', `SELECTION_WEIGHTS.${key} is not a number`);
    assert.ok(SELECTION_WEIGHTS[key] > 0, `SELECTION_WEIGHTS.${key} is not positive`);
  }
});

test('buildGrammarPracticeQueue applies generated variant freshness across seeds', () => {
  const templateId = 'qg_formality_classify_table';
  // The baseline queue reaches this generated template at slot 2, whose
  // candidate seed is base + 2 * 104729 = 209459. Use a different seed that
  // produces the same visible variant so the test proves signature freshness,
  // not just literal seed matching.
  const recentAttempts = [recentGeneratedAttempt(templateId, 2, ['formality'])];

  const baseline = buildGrammarPracticeQueue({
    mode: 'smart',
    focusConceptId: 'formality',
    mastery: emptyState().mastery,
    recentAttempts: [],
    seed: 1,
    size: 3,
    now: 1_777_000_000_000,
  });
  const freshened = buildGrammarPracticeQueue({
    mode: 'smart',
    focusConceptId: 'formality',
    mastery: emptyState().mastery,
    recentAttempts,
    seed: 1,
    size: 3,
    now: 1_777_000_000_000,
  });

  const baselineCount = baseline.filter((item) => item.templateId === templateId).length;
  const freshenedCount = freshened.filter((item) => item.templateId === templateId).length;
  assert.ok(baselineCount >= 1, 'The baseline queue must include the generated template under test.');
  assert.ok(
    freshenedCount < baselineCount,
    'The same generated visible variant should be penalised even when the candidate seed differs.',
  );
});

test('buildGrammarPracticeQueue produces a variety of templates when pool is wide', () => {
  const queue = queueFor({ mode: 'smart', size: 12, seed: 1234 });
  assert.equal(queue.length, 12);
  const distinct = new Set(queue.map((item) => item.templateId));
  assert.ok(distinct.size >= 8, `Expected at least 8 distinct templates in a 12-item mixed queue, got ${distinct.size}`);
});

test('buildGrammarPracticeQueue applies a recent-repeat penalty', () => {
  const state = emptyState();
  const repeatedTemplateId = 'fronted_adverbial_choose';

  // Hammer a single template as 'recent' to trigger freshness penalty
  for (let i = 0; i < 5; i += 1) {
    pushRecentAttempt(state, { templateId: repeatedTemplateId, createdAt: 1_777_000_000_000 - i * 1000 });
  }

  const queue = queueFor({ state, mode: 'smart', size: 12, seed: 1234 });
  const repeated = queue.filter((item) => item.templateId === repeatedTemplateId).length;
  assert.ok(repeated <= 1, `Recent-repeat penalty should keep the hammered template near 0-1 picks in a 12-item queue; got ${repeated}`);
});

test('buildGrammarPracticeQueue biases toward weak question types', () => {
  const state = emptyState();
  // Mark 'build' as a weak question type
  fillQuestionType(state, 'build', { attempts: 10, correct: 3, wrong: 7, strength: 0.3 });
  // Mark other question types as strong
  for (const qt of ['classify', 'identify', 'choose', 'fill', 'fix', 'rewrite', 'explain']) {
    fillQuestionType(state, qt, { attempts: 10, correct: 9, wrong: 1, strength: 0.9 });
  }

  const queue = queueFor({ state, mode: 'smart', size: 12, seed: 1234 });
  const buildPicks = queue.filter((item) => item.questionType === 'build').length;
  const baseline = buildGrammarPracticeQueue({
    mode: 'smart',
    focusConceptId: '',
    mastery: emptyState().mastery,
    recentAttempts: [],
    seed: 1234,
    size: 12,
    now: 1_777_000_000_000,
  });
  const baselineBuildPicks = baseline.filter((item) => item.questionType === 'build').length;
  assert.ok(
    buildPicks >= baselineBuildPicks,
    `QT weakness weighting should pick 'build' at least as often as baseline; weak=${buildPicks}, baseline=${baselineBuildPicks}`,
  );
});

test('buildGrammarPracticeQueue due-status outranks otherwise-equivalent non-due mastery', () => {
  // Compare two scenarios for the same concept: mastered-and-due vs mastered-and-not-due.
  // A concept that has been practised to similar strength but is *now due for review*
  // must outrank an equivalently strong concept that is not due — that is the
  // whole point of tagging something `due`.
  const conceptId = 'adverbials';
  const seeds = [1, 2, 3, 42, 100, 500, 1234, 7777];

  function totalPicks(dueAtOffset) {
    let total = 0;
    for (const seed of seeds) {
      const state = emptyState();
      fillConcept(state, conceptId, {
        attempts: 5,
        correct: 4,
        wrong: 1,
        strength: 0.85,
        intervalDays: 7,
        dueAt: 1_777_000_000_000 + dueAtOffset,
        correctStreak: 3,
      });
      const queue = queueFor({ state, mode: 'smart', size: 12, seed });
      total += queue.filter((item) => (item.skillIds || []).includes(conceptId)).length;
    }
    return total;
  }

  const dueTotal = totalPicks(-100); // due now
  const notDueTotal = totalPicks(+7 * 86400000); // due in 7 days

  assert.ok(
    dueTotal > notDueTotal,
    `Due concept must outrank otherwise-equivalent not-due concept: due=${dueTotal}, notDue=${notDueTotal}`,
  );
});

test('buildGrammarPracticeQueue falls back gracefully when focus pool is smaller than size', () => {
  const focusConceptId = 'hyphen_ambiguity';
  const queue = queueFor({ mode: 'smart', focusConceptId, size: 12, seed: 1234 });
  assert.equal(queue.length, 12);
  const focusPicks = queue.filter((item) => (item.skillIds || []).includes(focusConceptId)).length;
  assert.ok(focusPicks >= 2, `Focus should saturate its small pool; got ${focusPicks}`);
  const nonFocusPicks = queue.length - focusPicks;
  assert.ok(nonFocusPicks > 0, 'Fallback broadening should allow non-focus templates when focus pool is too small.');
});

test('buildGrammarPracticeQueue applies generated variant freshness during focus saturation', () => {
  const templateId = 'qg_hyphen_ambiguity_explain';
  const recentAttempts = [1, 2, 3].map((seed) => (
    recentGeneratedAttempt(templateId, seed, ['hyphen_ambiguity'])
  ));

  const queue = buildGrammarPracticeQueue({
    mode: 'smart',
    focusConceptId: 'hyphen_ambiguity',
    mastery: emptyState().mastery,
    recentAttempts,
    seed: 1,
    size: 4,
    now: 1_777_000_000_000,
  });

  assert.equal(queue.length, 4);
  assert.equal(
    queue.some((item) => item.templateId === templateId),
    false,
    'Focus saturation must not force a recently seen generated variant.',
  );
  assert.ok(
    queue.some((item) => (item.skillIds || []).includes('hyphen_ambiguity')),
    'Focus fallback should still include available non-repeated focus templates.',
  );
});

test('buildGrammarPracticeQueue keeps original recent variants fresh across full fallback queues', () => {
  const templateId = 'qg_modal_verb_explain';
  const recentAttempts = [1, 2, 3].map((seed) => (
    recentGeneratedAttempt(templateId, seed, ['modal_verbs'])
  ));

  const queue = buildGrammarPracticeQueue({
    mode: 'smart',
    focusConceptId: 'modal_verbs',
    mastery: emptyState().mastery,
    recentAttempts,
    seed: 1,
    size: 8,
    now: 1_777_000_000_000,
  });

  assert.equal(queue.length, 8);
  assert.equal(
    queue.some((item) => item.templateId === templateId),
    false,
    'Synthetic planned items must not push original recent generated variants past the freshness horizon.',
  );
});

test('buildGrammarPracticeQueue honours surgery mode template constraints', () => {
  const queue = queueFor({ mode: 'surgery', size: 8, seed: 42 });
  assert.equal(queue.length, 8);
  for (const item of queue) {
    const template = GRAMMAR_TEMPLATE_METADATA.find((t) => t.id === item.templateId);
    assert.ok(template && (template.tags || []).includes('surgery'), `Surgery mode picked non-surgery template ${item.templateId}`);
  }
});

test('buildGrammarPracticeQueue is deterministic for the same seed and state', () => {
  const a = queueFor({ mode: 'smart', size: 12, seed: 777 });
  const b = queueFor({ mode: 'smart', size: 12, seed: 777 });
  assert.deepEqual(a.map((item) => item.templateId), b.map((item) => item.templateId));
});

test('buildGrammarMiniPack returns the requested size and avoids template duplication when pool allows', () => {
  const pack = buildGrammarMiniPack({ size: 12, seed: 1234 });
  assert.equal(pack.length, 12);
  const templateIds = pack.map((item) => item.templateId);
  const unique = new Set(templateIds);
  assert.equal(unique.size, templateIds.length, `Mini-pack should have no duplicate templates when pool allows; saw ${templateIds.length - unique.size} duplicates`);
});

test('buildGrammarMiniPack falls back gracefully when focus pool is smaller than size', () => {
  const focusConceptId = 'hyphen_ambiguity';
  const pack = buildGrammarMiniPack({ size: 8, focusConceptId, seed: 1234 });
  assert.equal(pack.length, 8);
  const focusCount = pack.filter((item) => (item.skillIds || []).includes(focusConceptId)).length;
  assert.ok(focusCount >= 2, `Should saturate the narrow focus pool; got ${focusCount}`);
});

test('buildGrammarMiniPack applies generated variant freshness during focus saturation', () => {
  const templateId = 'qg_hyphen_ambiguity_explain';
  // With P4, hyphen_ambiguity has 4 templates and the explain template has 8 case-bank
  // variants. Use size > focus pool so focus saturation activates (requires
  // focusTemplates.length < safeSize), and exhaust enough recent variants so the
  // candidate seeds at all focus-saturation positions map to "recently seen" signatures.
  const recentAttempts = [1, 2, 3, 4, 5, 6].map((seed) => (
    recentGeneratedAttempt(templateId, seed, ['hyphen_ambiguity'])
  ));

  const pack = buildGrammarMiniPack({
    focusConceptId: 'hyphen_ambiguity',
    mastery: emptyState().mastery,
    recentAttempts,
    seed: 1,
    size: 6,
    now: 1_777_000_000_000,
  });

  assert.equal(pack.length, 6);
  // Focus saturation iterates over the 4 focus templates; the explain template is
  // skipped because its candidate seed maps to a recently-seen variant signature.
  // It may still appear later via the general broadening loop, but that is
  // weighted-random and tests only the saturation guarantee — not the broadening
  // heuristic. Instead, assert the focus slots (first 3) do not include it.
  const focusSlots = pack.slice(0, 3);
  assert.equal(
    focusSlots.some((item) => item.templateId === templateId),
    false,
    'Mini-pack focus saturation must not force a recently seen generated variant into the first focus slots.',
  );
  assert.ok(
    pack.some((item) => (item.skillIds || []).includes('hyphen_ambiguity')),
    'Mini-pack fallback should still include available non-repeated focus templates.',
  );
});

test('buildGrammarMiniPack keeps original recent variants fresh across full fallback packs', () => {
  const templateId = 'qg_modal_verb_explain';
  // Exhaust all 8 unique variants so the template is fully seen
  const recentAttempts = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => (
    recentGeneratedAttempt(templateId, seed, ['modal_verbs'])
  ));

  const pack = buildGrammarMiniPack({
    focusConceptId: 'modal_verbs',
    mastery: emptyState().mastery,
    recentAttempts,
    seed: 1,
    size: 8,
    now: 1_777_000_000_000,
  });

  assert.equal(pack.length, 8);
  assert.equal(
    pack.some((item) => item.templateId === templateId),
    false,
    'Synthetic planned items must not push original recent generated variants past the mini-pack freshness horizon.',
  );
});

test('buildGrammarMiniPack spreads question types when possible', () => {
  const pack = buildGrammarMiniPack({ size: 12, seed: 1234 });
  const questionTypes = new Set(pack.map((item) => item.questionType));
  assert.ok(questionTypes.size >= 4, `A 12-item mini-pack should cover at least 4 question types; got ${questionTypes.size}`);
});

test('buildGrammarPracticeQueue tolerates empty / malformed mastery without throwing', () => {
  assert.doesNotThrow(() => buildGrammarPracticeQueue({
    mode: 'smart',
    focusConceptId: '',
    mastery: null,
    recentAttempts: null,
    seed: 1,
    size: 4,
    now: 0,
  }));
  assert.doesNotThrow(() => buildGrammarPracticeQueue({
    mode: 'smart',
    focusConceptId: '',
    mastery: { concepts: {}, questionTypes: {} },
    recentAttempts: [{ templateId: undefined }],
    seed: 1,
    size: 4,
    now: 0,
  }));
});

// --- QG P4 mixed-transfer selection regression ---

test('P4 mixed-transfer template can appear in practice queue when both concepts are active', () => {
  const state = emptyState();
  fillConcept(state, 'sentence_functions', { attempts: 3, correct: 2, wrong: 1, strength: 0.5 });
  fillConcept(state, 'speech_punctuation', { attempts: 3, correct: 2, wrong: 1, strength: 0.5 });

  // Try several seeds to find one where a P4 template appears
  const p4Ids = GRAMMAR_TEMPLATE_METADATA
    .filter((t) => (t.tags || []).includes('qg-p4') && (t.tags || []).includes('mixed-transfer'))
    .map((t) => t.id);
  let found = false;
  for (let seed = 1; seed <= 50; seed += 1) {
    const queue = queueFor({ state, mode: 'smart', size: 12, seed });
    if (queue.some((item) => p4Ids.includes(item.templateId))) {
      found = true;
      break;
    }
  }
  assert.ok(found, 'At least one P4 mixed-transfer template must be reachable from the practice queue when its concepts are active.');
});

test('focus mode on single concept does not exclusively select multi-concept templates', () => {
  const focusConceptId = 'sentence_functions';
  const p4MultiIds = GRAMMAR_TEMPLATE_METADATA
    .filter((t) => (t.tags || []).includes('qg-p4') && (t.tags || []).includes('mixed-transfer'))
    .map((t) => t.id);

  // Gather several seeds and check P4 multi-concept proportion
  let totalItems = 0;
  let p4Items = 0;
  for (let seed = 1; seed <= 10; seed += 1) {
    const queue = queueFor({ mode: 'smart', focusConceptId, size: 12, seed });
    totalItems += queue.length;
    p4Items += queue.filter((item) => p4MultiIds.includes(item.templateId)).length;
    // Single-concept templates for sentence_functions must still appear
    const singleConceptPicks = queue.filter(
      (item) => !p4MultiIds.includes(item.templateId) && (item.skillIds || []).includes(focusConceptId),
    );
    assert.ok(
      singleConceptPicks.length >= 1,
      `Seed ${seed}: focus mode must still include single-concept templates; got 0 out of ${queue.length} items.`,
    );
  }
  // P4 multi-concept templates should not dominate (< 50% of total items)
  assert.ok(
    p4Items < totalItems * 0.5,
    `P4 multi-concept templates dominate focus queue: ${p4Items}/${totalItems} (${Math.round(p4Items / totalItems * 100)}%).`,
  );
});

test('variant freshness prevents same P4 template appearing twice in one queue', () => {
  const templateId = 'qg_p4_sentence_speech_transfer';
  const recentAttempts = [recentGeneratedAttempt(templateId, 1, ['sentence_functions', 'speech_punctuation'])];

  // Build queue with a focus that would bias towards this template
  const queue = buildGrammarPracticeQueue({
    mode: 'smart',
    focusConceptId: 'sentence_functions',
    mastery: emptyState().mastery,
    recentAttempts,
    seed: 1,
    size: 12,
    now: 1_777_000_000_000,
  });

  const p4Picks = queue.filter((item) => item.templateId === templateId);
  assert.ok(
    p4Picks.length <= 1,
    `Variant freshness should prevent the same P4 template from appearing multiple times; got ${p4Picks.length}.`,
  );
});
