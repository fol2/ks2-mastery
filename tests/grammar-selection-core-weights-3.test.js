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
