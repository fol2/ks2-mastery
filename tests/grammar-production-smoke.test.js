import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGrammarQuestion,
  evaluateGrammarQuestion,
  GRAMMAR_TEMPLATES,
} from '../worker/src/subjects/grammar/content.js';
import {
  GRAMMAR_ANSWER_SPEC_FAMILY_SMOKE_ITEMS,
  assertNoForbiddenGrammarReadModelKeys,
  correctResponseFor,
  incorrectResponseFor,
  visibleResponseForAnswerSpecFamily,
} from '../scripts/grammar-production-smoke.mjs';
import {
  FORBIDDEN_GRAMMAR_READ_MODEL_KEYS,
  FORBIDDEN_GRAMMAR_ITEM_KEYS,
} from './helpers/forbidden-keys.mjs';

function smokeQuestion() {
  const question = createGrammarQuestion({
    templateId: 'qg_modal_verb_explain',
    seed: 7,
  });
  assert.ok(question, 'Fixture question should exist.');
  return question;
}

function readItemFromQuestion(question) {
  return {
    templateId: question.templateId,
    seed: question.seed,
    promptText: question.promptText,
    inputSpec: question.inputSpec,
  };
}

test('Grammar production smoke answers from the production-visible option set', () => {
  const question = smokeQuestion();
  assert.equal(question.templateId, 'qg_modal_verb_explain');
  const readItem = readItemFromQuestion(question);
  const response = correctResponseFor(readItem);

  assert.ok(
    readItem.inputSpec.options.some((option) => option.value === response.answer),
    'Smoke response should use a value present in the read-model options.',
  );
  assert.equal(evaluateGrammarQuestion(question, response)?.correct, true);
});

test('Grammar production smoke can select an incorrect visible option for repair coverage', () => {
  const question = smokeQuestion();
  const readItem = readItemFromQuestion(question);
  const response = incorrectResponseFor(readItem);

  assert.ok(
    readItem.inputSpec.options.some((option) => option.value === response.answer),
    'Smoke response should use a value present in the read-model options.',
  );
  assert.equal(evaluateGrammarQuestion(question, response)?.correct, false);
});

test('Grammar production smoke rejects option sets that do not match the regenerated item', () => {
  const question = smokeQuestion();
  const correctOption = question.inputSpec.options.find((option) => (
    evaluateGrammarQuestion(question, { answer: option.value })?.correct
  ));
  assert.ok(correctOption, 'Fixture question should have a correct option.');

  const readItem = readItemFromQuestion(question);
  readItem.inputSpec = {
    ...readItem.inputSpec,
    options: readItem.inputSpec.options.map((option) => (
      option.value === correctOption.value
        ? { value: 'hidden-local-answer', label: 'Hidden local answer' }
        : option
    )),
  };

  assert.throws(
    () => correctResponseFor(readItem),
    /Grammar production option set did not match the regenerated question/,
  );
});

test('Grammar production smoke rejects extra production option fields', () => {
  const question = smokeQuestion();
  const readItem = readItemFromQuestion(question);
  readItem.inputSpec = {
    ...readItem.inputSpec,
    options: readItem.inputSpec.options.map((option, index) => (
      index === 0 ? { ...option, correct: true } : option
    )),
  };

  assert.throws(
    () => correctResponseFor(readItem),
    /Grammar production read model exposed option 1 with unexpected fields: correct, label, value/,
  );
});

test('Grammar production smoke scans feedback and summary models for forbidden keys', () => {
  assert.doesNotThrow(() => assertNoForbiddenGrammarReadModelKeys({
    stats: { contentStats: { total: 57, selectedResponse: 37, constructedResponse: 20, generated: 31, answerSpecEnabled: 6, thinPoolConcepts: [] } },
    session: {
      currentItem: {
        templateId: 'qg_modal_verb_explain',
        inputSpec: { type: 'single_choice', options: [{ value: 'A', label: 'A' }] },
      },
    },
  }, 'grammar.startModel'));

  assert.throws(
    () => assertNoForbiddenGrammarReadModelKeys({
      feedback: { result: { correctResponses: ['A'] } },
    }, 'grammar.feedbackModel'),
    /grammar\.feedbackModel\.feedback\.result\.correctResponses exposed a server-only field/,
  );

  assert.throws(
    () => assertNoForbiddenGrammarReadModelKeys({
      session: { currentItem: { templates: [{ id: 'fronted_adverbial_choose' }] } },
    }, 'grammar.summaryModel'),
    /grammar\.summaryModel\.session\.currentItem\.templates exposed a server-only field/,
  );

  assert.throws(
    () => assertNoForbiddenGrammarReadModelKeys({
      analytics: { recentAttempts: [{ templateId: 'qg_modal_verb_explain', variantSignature: 'grammar-v1:hidden' }] },
    }, 'grammar.recentAttempts'),
    /grammar\.recentAttempts\.analytics\.recentAttempts\[0\]\.variantSignature exposed a server-only field/,
  );

  assert.throws(
    () => assertNoForbiddenGrammarReadModelKeys({
      analytics: { recentAttempts: [{ templateId: 'qg_modal_verb_explain', generatorFamilyId: 'qg_modal_verb_explain' }] },
    }, 'grammar.recentAttempts'),
    /grammar\.recentAttempts\.analytics\.recentAttempts\[0\]\.generatorFamilyId exposed a server-only field/,
  );

  assert.throws(
    () => assertNoForbiddenGrammarReadModelKeys({
      session: { currentItem: { answerSpec: { kind: 'exact', golden: ['A'], nearMiss: [] } } },
    }, 'grammar.startModel'),
    /grammar\.startModel\.session\.currentItem\.answerSpec exposed a server-only field/,
  );
});

test('Grammar production smoke scans mini-test, support, and AI enrichment read models', () => {
  assert.doesNotThrow(() => assertNoForbiddenGrammarReadModelKeys({
    session: {
      currentItem: {
        templateId: 'fronted_adverbial_choose',
        inputSpec: { type: 'single_choice', options: [{ value: 'A', label: 'A' }] },
      },
      supportGuidance: {
        kind: 'faded',
        notices: ['Use the visible prompt only.'],
      },
    },
    aiEnrichment: {
      kind: 'explanation',
      status: 'ready',
      nonScored: true,
      explanation: { body: 'Non-scored support.' },
    },
    summary: {
      miniTestReview: {
        questions: [{
          marked: { result: { feedbackShort: 'Correct.', answerText: 'Visible after marking.' } },
        }],
      },
    },
  }, 'grammar.completenessModel'));

  assert.throws(
    () => assertNoForbiddenGrammarReadModelKeys({
      session: { supportGuidance: { workedExample: { correctResponses: ['A'] } } },
    }, 'grammar.supportModel'),
    /grammar\.supportModel\.session\.supportGuidance\.workedExample\.correctResponses exposed a server-only field/,
  );

  assert.throws(
    () => assertNoForbiddenGrammarReadModelKeys({
      aiEnrichment: { revisionDrills: [{ accepted: ['A'] }] },
    }, 'grammar.aiModel'),
    /grammar\.aiModel\.aiEnrichment\.revisionDrills\[0\]\.accepted exposed a server-only field/,
  );

  assert.throws(
    () => assertNoForbiddenGrammarReadModelKeys({
      summary: { miniTestReview: { questions: [{ marked: { result: { answers: ['A'] } } }] } },
    }, 'grammar.miniReviewModel'),
    /grammar\.miniReviewModel\.summary\.miniTestReview\.questions\[0\]\.marked\.result\.answers exposed a server-only field/,
  );
});

test('Grammar production smoke has visible-data probes for every answer-spec family', () => {
  const expectedFamilies = new Set(['exact', 'multiField', 'normalisedText', 'punctuationPattern', 'acceptedSet', 'manualReviewOnly']);
  assert.deepEqual(new Set(GRAMMAR_ANSWER_SPEC_FAMILY_SMOKE_ITEMS.map((item) => item.family)), expectedFamilies);

  for (const fixture of GRAMMAR_ANSWER_SPEC_FAMILY_SMOKE_ITEMS) {
    const question = createGrammarQuestion({ templateId: fixture.templateId, seed: fixture.seed });
    const readItem = readItemFromQuestion(question);
    const response = visibleResponseForAnswerSpecFamily(readItem);
    const result = evaluateGrammarQuestion(question, response);
    if (fixture.family === 'manualReviewOnly') {
      assert.equal(result.correct, false, fixture.family);
      assert.equal(result.nonScored, true, fixture.family);
      assert.equal(result.manualReviewOnly, true, fixture.family);
    } else {
      assert.equal(result.correct, true, fixture.family);
    }
  }
});

// ---------------------------------------------------------------------------
// P4 mixed-transfer smoke probes
// ---------------------------------------------------------------------------

const P4_TEMPLATE_IDS = GRAMMAR_TEMPLATES
  .filter((t) => t.tags && t.tags.includes('qg-p4'))
  .map((t) => t.id);

const P4_CHOOSE_TEMPLATE_IDS = GRAMMAR_TEMPLATES
  .filter((t) => t.tags && t.tags.includes('qg-p4') && t.questionType === 'choose')
  .map((t) => t.id);

const P4_CLASSIFY_TEMPLATE_IDS = GRAMMAR_TEMPLATES
  .filter((t) => t.tags && t.tags.includes('qg-p4') && t.questionType === 'classify')
  .map((t) => t.id);

const FORBIDDEN_KEYS_SET = new Set([
  ...FORBIDDEN_GRAMMAR_READ_MODEL_KEYS,
  ...FORBIDDEN_GRAMMAR_ITEM_KEYS,
]);

function deepScanForForbiddenKeys(value, forbidden, path = 'root') {
  const found = [];
  function walk(obj, currentPath) {
    if (obj == null || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((entry, index) => walk(entry, `${currentPath}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(obj)) {
      if (forbidden.has(key)) found.push(`${currentPath}.${key}`);
      walk(child, `${currentPath}.${key}`);
    }
  }
  walk(value, path);
  return found;
}

test('P4 choose template visible payload contains prompt and options', () => {
  for (const templateId of P4_CHOOSE_TEMPLATE_IDS) {
    const question = createGrammarQuestion({ templateId, seed: 1 });
    assert.ok(question, `P4 choose template ${templateId} did not generate.`);

    assert.ok(question.stemHtml, `${templateId} question is missing stemHtml.`);
    assert.equal(question.inputSpec.type, 'single_choice', `${templateId} inputSpec type is not single_choice.`);
    assert.ok(
      Array.isArray(question.inputSpec.options) && question.inputSpec.options.length >= 3,
      `${templateId} should have at least 3 options.`,
    );
    for (const option of question.inputSpec.options) {
      assert.equal(typeof option.value, 'string', `${templateId} option missing string value.`);
      assert.equal(typeof option.label, 'string', `${templateId} option missing string label.`);
    }
  }
});

test('P4 classify template visible payload contains table_choice fields', () => {
  for (const templateId of P4_CLASSIFY_TEMPLATE_IDS) {
    const question = createGrammarQuestion({ templateId, seed: 1 });
    assert.ok(question, `P4 classify template ${templateId} did not generate.`);

    assert.ok(question.stemHtml, `${templateId} question is missing stemHtml.`);
    assert.equal(question.inputSpec.type, 'table_choice', `${templateId} inputSpec type is not table_choice.`);
    assert.ok(
      Array.isArray(question.inputSpec.columns) && question.inputSpec.columns.length >= 2,
      `${templateId} should have at least 2 columns.`,
    );
    assert.ok(
      Array.isArray(question.inputSpec.rows) && question.inputSpec.rows.length >= 2,
      `${templateId} should have at least 2 rows.`,
    );
    for (const row of question.inputSpec.rows) {
      assert.equal(typeof row.key, 'string', `${templateId} row missing key.`);
      assert.equal(typeof row.label, 'string', `${templateId} row missing label.`);
    }
  }
});

test('P4 template visible payload does not contain hidden answer data', () => {
  for (const templateId of P4_TEMPLATE_IDS) {
    const question = createGrammarQuestion({ templateId, seed: 1 });
    assert.ok(question, `${templateId} did not generate.`);
    const readItem = readItemFromQuestion(question);
    const violations = deepScanForForbiddenKeys(readItem, FORBIDDEN_KEYS_SET, templateId);
    assert.deepEqual(
      violations,
      [],
      `${templateId} read item exposed forbidden keys: ${violations.join(', ')}`,
    );
  }
});

test('P4 template after answer does not leak reusable answer-key internals', () => {
  for (const templateId of P4_TEMPLATE_IDS) {
    const question = createGrammarQuestion({ templateId, seed: 1 });
    assert.ok(question, `${templateId} did not generate.`);

    // Find the correct response
    let response;
    if (question.inputSpec.type === 'single_choice') {
      const correctOpt = question.inputSpec.options.find(
        (opt) => evaluateGrammarQuestion(question, { answer: opt.value })?.correct,
      );
      assert.ok(correctOpt, `${templateId} has no correct option.`);
      response = { answer: correctOpt.value };
    } else {
      // table_choice — build correct response from rows
      response = {};
      for (const row of question.inputSpec.rows) {
        for (const col of question.inputSpec.columns) {
          const attempt = { ...response, [row.key]: col };
          const trial = evaluateGrammarQuestion(question, attempt);
          if (trial && trial.correct) {
            response[row.key] = col;
            break;
          }
        }
      }
    }

    const result = evaluateGrammarQuestion(question, response);
    assert.ok(result, `${templateId} did not return an evaluation result.`);

    // The feedback result must not expose answerSpec or golden list
    const violations = deepScanForForbiddenKeys(result, FORBIDDEN_KEYS_SET, `${templateId}.feedback`);
    assert.deepEqual(
      violations,
      [],
      `${templateId} feedback exposed forbidden keys: ${violations.join(', ')}`,
    );
  }
});

test('P4 classify template does not leak correct field values in visible metadata', () => {
  for (const templateId of P4_CLASSIFY_TEMPLATE_IDS) {
    const question = createGrammarQuestion({ templateId, seed: 1 });
    assert.ok(question, `${templateId} did not generate.`);
    const readItem = readItemFromQuestion(question);

    // The readItem.inputSpec.rows must not contain the correct answers
    for (const row of readItem.inputSpec.rows) {
      assert.equal(
        Object.hasOwn(row, 'correct'),
        false,
        `${templateId} row '${row.key}' exposed a 'correct' field in visible metadata.`,
      );
    }

    // Deep scan the full visible inputSpec for any 'correct' key
    const correctViolations = deepScanForForbiddenKeys(
      readItem.inputSpec,
      new Set(['correct']),
      `${templateId}.inputSpec`,
    );
    assert.deepEqual(
      correctViolations,
      [],
      `${templateId} inputSpec leaked 'correct' values: ${correctViolations.join(', ')}`,
    );
  }
});
