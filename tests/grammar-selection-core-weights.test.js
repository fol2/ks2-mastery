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

function assertNoDuplicateTemplates(queue, label) {
  const templateIds = queue.map((item) => item.templateId);
  const uniqueTemplateIds = new Set(templateIds);
  assert.equal(
    uniqueTemplateIds.size,
    templateIds.length,
    `${label} repeated template(s): ${templateIds.join(', ')}`,
  );
}

test('buildGrammarPracticeQueue exports stable weight constants', () => {
  assert.equal(typeof SELECTION_WEIGHTS, 'object');
  for (const key of ['due', 'weak', 'recentMiss', 'qtWeakness', 'templateFreshness', 'variantFreshness', 'conceptFreshness', 'focus', 'generative']) {
    assert.equal(typeof SELECTION_WEIGHTS[key], 'number', `SELECTION_WEIGHTS.${key} is not a number`);
    assert.ok(SELECTION_WEIGHTS[key] > 0, `SELECTION_WEIGHTS.${key} is not positive`);
  }
});

test('buildGrammarPracticeQueue applies generated variant freshness across seeds', () => {
  const templateId = 'proc_semicolon_choice';
  const focusConceptId = 'boundary_punctuation';
  const recentAttempts = [recentGeneratedAttempt(templateId, 10, [focusConceptId])];

  const baseline = buildGrammarPracticeQueue({
    mode: 'smart',
    focusConceptId,
    mastery: emptyState().mastery,
    recentAttempts: [],
    seed: 1,
    size: 3,
    now: 1_777_000_000_000,
  });
  const freshened = buildGrammarPracticeQueue({
    mode: 'smart',
    focusConceptId,
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

test('buildGrammarPracticeQueue biases toward weak question types', () => {
  const state = emptyState();
  // Mark 'build' as a weak question type
  fillQuestionType(state, 'build', { attempts: 10, correct: 3, wrong: 7, strength: 0.3 });
  // Mark other question types as strong
  for (const qt of ['classify', 'identify', 'choose', 'fill', 'fix', 'rewrite', 'explain']) {
    fillQuestionType(state, qt, { attempts: 10, correct: 9, wrong: 1, strength: 0.9 });
  }

  let buildPicks = 0;
  let baselineBuildPicks = 0;
  for (let seed = 1; seed <= 100; seed += 1) {
    const queue = queueFor({ state, mode: 'smart', size: 12, seed });
    buildPicks += queue.filter((item) => item.questionType === 'build').length;
    const baseline = buildGrammarPracticeQueue({
      mode: 'smart',
      focusConceptId: '',
      mastery: emptyState().mastery,
      recentAttempts: [],
      seed,
      size: 12,
      now: 1_777_000_000_000,
    });
    baselineBuildPicks += baseline.filter((item) => item.questionType === 'build').length;
  }
  assert.ok(
    buildPicks >= baselineBuildPicks,
    `QT weakness weighting should pick 'build' at least as often as baseline; weak=${buildPicks}, baseline=${baselineBuildPicks}`,
  );
});

test('buildGrammarPracticeQueue due-status outranks otherwise-equivalent non-due mastery', () => {
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

test('buildGrammarPracticeQueue broadens focus sessions before repeating a planned focus template', () => {
  const focusConceptId = 'hyphen_ambiguity';
  const focusPoolSize = GRAMMAR_TEMPLATE_METADATA.filter((template) => (template.skillIds || []).includes(focusConceptId)).length;
  const queue = queueFor({ mode: 'smart', focusConceptId, size: focusPoolSize + 3, seed: 1234 });
  assert.equal(queue.length, focusPoolSize + 3);
  assertNoDuplicateTemplates(queue, 'hyphen_ambiguity focus seed 1234');
  assert.ok(
    queue.some((item) => !(item.skillIds || []).includes(focusConceptId)),
    'A narrow focus pool should broaden before repeating an already planned template.',
  );
});

test('buildGrammarPracticeQueue falls back gracefully when focus pool is smaller than size', () => {
  const focusConceptId = 'hyphen_ambiguity';
  const focusPoolSize = GRAMMAR_TEMPLATE_METADATA.filter((template) => (template.skillIds || []).includes(focusConceptId)).length;
  const queue = queueFor({ mode: 'smart', focusConceptId, size: focusPoolSize + 5, seed: 1234 });
  assert.equal(queue.length, focusPoolSize + 5);
  const focusPicks = queue.filter((item) => (item.skillIds || []).includes(focusConceptId)).length;
  assert.ok(focusPicks >= 2, `Focus should saturate its small pool; got ${focusPicks}`);
  const nonFocusPicks = queue.length - focusPicks;
  assert.ok(nonFocusPicks > 0, 'Fallback broadening should allow non-focus templates when focus pool is too small.');
});
