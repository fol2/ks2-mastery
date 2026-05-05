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

test('buildGrammarPracticeQueue produces a variety of templates when pool is wide', () => {
  const queue = queueFor({ mode: 'smart', size: 12, seed: 1234 });
  assert.equal(queue.length, 12);
  const distinct = new Set(queue.map((item) => item.templateId));
  assert.ok(distinct.size >= 8, `Expected at least 8 distinct templates in a 12-item mixed queue, got ${distinct.size}`);
});

test('buildGrammarPracticeQueue avoids known P14 same-template duplicate paths', () => {
  const examples = [
    {
      seed: 27,
      repeatedTemplateId: 'identify_words_in_sentence',
    },
    {
      seed: 2,
      repeatedTemplateId: 'proc2_standard_english_choice',
    },
  ];

  for (const example of examples) {
    const queue = queueFor({ mode: 'smart', size: 5, seed: example.seed });
    assert.equal(queue.length, 5);
    assertNoDuplicateTemplates(queue, `seed ${example.seed}`);
    assert.ok(
      queue.filter((item) => item.templateId === example.repeatedTemplateId).length <= 1,
      `Seed ${example.seed} must not repeat ${example.repeatedTemplateId}.`,
    );
  }
});

test('buildGrammarPracticeQueue keeps 100 smart five-question sessions template-distinct when pool allows', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const queue = queueFor({ mode: 'smart', size: 5, seed });
    assert.equal(queue.length, 5);
    assertNoDuplicateTemplates(queue, `smart seed ${seed}`);
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
