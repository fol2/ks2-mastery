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

test('buildGrammarPracticeQueue applies generated variant freshness during focus saturation', () => {
  const templateId = 'qg_hyphen_ambiguity_explain';
  const staleFocusSlotSeed = (1 + 3 * 104729) >>> 0;
  const recentAttempts = [1, 2, 3, staleFocusSlotSeed].map((seed) => (
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

test('buildGrammarMiniPack falls back gracefully when focus pool is smaller than size', () => {
  const focusConceptId = 'hyphen_ambiguity';
  const pack = buildGrammarMiniPack({ size: 8, focusConceptId, seed: 1234 });
  assert.equal(pack.length, 8);
  const focusCount = pack.filter((item) => (item.skillIds || []).includes(focusConceptId)).length;
  assert.ok(focusCount >= 2, `Should saturate the narrow focus pool; got ${focusCount}`);
});

test('buildGrammarMiniPack applies generated variant freshness during focus saturation', () => {
  const templateId = 'qg_hyphen_ambiguity_explain';
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

// --- QG P4 mixed-transfer selection regression ---

test('P4 mixed-transfer template can appear in practice queue when both concepts are active', () => {
  const state = emptyState();
  fillConcept(state, 'sentence_functions', { attempts: 3, correct: 2, wrong: 1, strength: 0.5 });
  fillConcept(state, 'speech_punctuation', { attempts: 3, correct: 2, wrong: 1, strength: 0.5 });

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

  let totalItems = 0;
  let p4Items = 0;
  for (let seed = 1; seed <= 10; seed += 1) {
    const queue = queueFor({ mode: 'smart', focusConceptId, size: 12, seed });
    totalItems += queue.length;
    p4Items += queue.filter((item) => p4MultiIds.includes(item.templateId)).length;
    const singleConceptPicks = queue.filter(
      (item) => !p4MultiIds.includes(item.templateId) && (item.skillIds || []).includes(focusConceptId),
    );
    assert.ok(
      singleConceptPicks.length >= 1,
      `Seed ${seed}: focus mode must still include single-concept templates; got 0 out of ${queue.length} items.`,
    );
  }
  assert.ok(
    p4Items < totalItems * 0.5,
    `P4 multi-concept templates dominate focus queue: ${p4Items}/${totalItems} (${Math.round(p4Items / totalItems * 100)}%).`,
  );
});

test('variant freshness prevents same P4 template appearing twice in one queue', () => {
  const templateId = 'qg_p4_sentence_speech_transfer';
  const recentAttempts = [recentGeneratedAttempt(templateId, 1, ['sentence_functions', 'speech_punctuation'])];

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
