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
  fillQuestionType(state, 'build', { attempts: 10, correct: 3, wrong: 7, strength: 0.3 });
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
