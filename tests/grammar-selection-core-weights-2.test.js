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

  for (let i = 0; i < 5; i += 1) {
    pushRecentAttempt(state, { templateId: repeatedTemplateId, createdAt: 1_777_000_000_000 - i * 1000 });
  }

  const queue = queueFor({ state, mode: 'smart', size: 12, seed: 1234 });
  const repeated = queue.filter((item) => item.templateId === repeatedTemplateId).length;
  assert.ok(repeated <= 1, `Recent-repeat penalty should keep the hammered template near 0-1 picks in a 12-item queue; got ${repeated}`);
});
