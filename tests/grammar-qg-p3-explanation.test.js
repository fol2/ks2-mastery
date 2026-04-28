import test from 'node:test';
import assert from 'node:assert/strict';

import { validateAnswerSpec } from '../worker/src/subjects/grammar/answer-spec.js';
import { createServerGrammarEngine } from '../worker/src/subjects/grammar/engine.js';
import { buildGrammarReadModel } from '../worker/src/subjects/grammar/read-models.js';
import {
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
  evaluateGrammarQuestion,
  grammarQuestionVariantSignature,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';
import { assertNoForbiddenGrammarReadModelKeys } from '../scripts/grammar-production-smoke.mjs';

const P3_TEMPLATE_IDS = Object.freeze([
  'qg_p3_sentence_functions_explain',
  'qg_p3_word_classes_explain',
  'qg_p3_noun_phrases_explain',
  'qg_p3_clauses_explain',
  'qg_p3_relative_clauses_explain',
  'qg_p3_tense_aspect_explain',
  'qg_p3_pronouns_cohesion_explain',
  'qg_p3_formality_explain',
  'qg_p3_active_passive_explain',
  'qg_p3_subject_object_explain',
  'qg_p3_parenthesis_commas_explain',
  'qg_p3_speech_punctuation_explain',
  'qg_p3_apostrophe_possession_explain',
]);

const P3_CONCEPT_IDS = Object.freeze([
  'active_passive',
  'apostrophes_possession',
  'clauses',
  'formality',
  'noun_phrases',
  'parenthesis_commas',
  'pronouns_cohesion',
  'relative_clauses',
  'sentence_functions',
  'speech_punctuation',
  'subject_object',
  'tense_aspect',
  'word_classes',
]);

test('Grammar QG P3 templates declare selected-response explanation metadata', () => {
  const templates = GRAMMAR_TEMPLATE_METADATA.filter((template) => (template.tags || []).includes('qg-p3'));
  assert.deepEqual(templates.map((template) => template.id).sort(), P3_TEMPLATE_IDS.slice().sort());
  assert.deepEqual(
    [...new Set(templates.flatMap((template) => template.skillIds || []))].sort(),
    P3_CONCEPT_IDS.slice().sort(),
  );

  for (const template of templates) {
    assert.equal(template.questionType, 'explain', template.id);
    assert.equal(template.isSelectedResponse, true, template.id);
    assert.equal(template.generative, true, template.id);
    assert.equal(template.requiresAnswerSpec, true, template.id);
    assert.equal(template.answerSpecKind, 'exact', template.id);
    assert.equal(template.generatorFamilyId, template.id, template.id);
    assert.ok((template.tags || []).includes('explain'), template.id);
    assert.equal(template.skillIds.length, 1, template.id);
  }
});

test('Grammar QG P3 explanation questions auto-score exactly one visible option', () => {
  for (const templateId of P3_TEMPLATE_IDS) {
    for (const seed of [1, 2, 3, 4, 5, 6, 13]) {
      const question = createGrammarQuestion({ templateId, seed });
      assert.ok(question, `${templateId}:${seed} should build`);
      assert.equal(question.answerSpec?.kind, 'exact', templateId);
      assert.ok(validateAnswerSpec(question.answerSpec), templateId);
      assert.equal(question.inputSpec?.type, 'single_choice', templateId);
      assert.equal(question.inputSpec.options.length, 4, templateId);

      const optionValues = question.inputSpec.options.map((option) => option.value);
      assert.equal(new Set(optionValues).size, optionValues.length, `${templateId}:${seed} has duplicate options.`);
      assert.equal(
        question.inputSpec.options.filter((option) => option.label === option.value).length,
        question.inputSpec.options.length,
        `${templateId}:${seed} should keep option labels aligned with values.`,
      );

      const outcomes = question.inputSpec.options.map((option) => ({
        option,
        result: evaluateGrammarQuestion(question, { answer: option.value }),
      }));
      const correctOutcomes = outcomes.filter((entry) => entry.result.correct);
      assert.equal(correctOutcomes.length, 1, `${templateId}:${seed} should have exactly one correct option.`);
      assert.equal(correctOutcomes[0].option.value, question.answerSpec.golden[0], templateId);
      assert.equal(correctOutcomes[0].result.score, correctOutcomes[0].result.maxScore, templateId);

      const wrongOutcome = outcomes.find((entry) => !entry.result.correct);
      assert.ok(wrongOutcome, `${templateId}:${seed} should include a distractor.`);
      assert.equal(wrongOutcome.result.score, 0, templateId);
      assert.equal(typeof wrongOutcome.result.feedbackLong, 'string', templateId);
      assert.ok(wrongOutcome.result.feedbackLong.length > 0, templateId);

      const serialised = serialiseGrammarQuestion(question);
      assert.equal(serialised.contentReleaseId, GRAMMAR_CONTENT_RELEASE_ID, templateId);
      assert.equal(serialised.templateId, templateId, templateId);
      assert.equal(serialised.promptText.length > 0, true, templateId);
      assert.ok(serialised.solutionLines.length > 0, `${templateId}:${seed} keeps internal solution lines for feedback.`);
      assert.equal(Object.hasOwn(serialised, 'answerSpec'), false, templateId);
      assert.equal(Object.hasOwn(serialised, 'generatorFamilyId'), false, templateId);
      assert.equal(Object.hasOwn(serialised, 'variantSignature'), false, templateId);
      assert.doesNotMatch(JSON.stringify(serialised), /"golden"|"nearMiss"|"misconception"/, templateId);
    }
  }
});

test('Grammar QG P3 learner read models redact internal explanation answers', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });

  for (const [index, templateId] of P3_TEMPLATE_IDS.entries()) {
    const start = engine.apply({
      learnerId: 'learner-a',
      subjectRecord: {},
      command: 'start-session',
      requestId: `p3-redaction-${index}`,
      payload: {
        mode: 'smart',
        roundLength: 1,
        templateId,
        seed: index + 1,
      },
    });

    assert.equal(start.state.session.currentItem.templateId, templateId, templateId);
    assert.ok(start.state.session.currentItem.solutionLines.length > 0, `${templateId} has internal solution lines.`);

    const readModel = buildGrammarReadModel({
      learnerId: 'learner-a',
      state: start.state,
      now: 1_777_000_000_000,
    });
    assert.equal(readModel.session.currentItem.templateId, templateId, templateId);
    assert.equal(readModel.session.currentItem.solutionLines, undefined, templateId);
    assert.equal(readModel.session.currentItem.answerSpec, undefined, templateId);
    assert.equal(readModel.session.currentItem.generatorFamilyId, undefined, templateId);
    assert.equal(readModel.session.currentItem.variantSignature, undefined, templateId);
    assertNoForbiddenGrammarReadModelKeys(readModel, `grammar.qgP3.${templateId}`);
  }
});

test('Grammar QG P3 variant signatures ignore choice order but not visible explanations', () => {
  for (const templateId of P3_TEMPLATE_IDS) {
    const byPrompt = new Map();
    let duplicatePromptSeen = false;
    for (let seed = 1; seed <= 30; seed += 1) {
      const question = createGrammarQuestion({ templateId, seed });
      const promptText = serialiseGrammarQuestion(question).promptText;
      const existing = byPrompt.get(promptText);
      if (existing) {
        duplicatePromptSeen = true;
        assert.equal(
          grammarQuestionVariantSignature(existing),
          grammarQuestionVariantSignature(question),
          `${templateId} should treat shuffled options for the same visible prompt as the same variant.`,
        );
        break;
      }
      byPrompt.set(promptText, question);
    }
    assert.equal(duplicatePromptSeen, true, `${templateId} should repeat a visible case across different shuffle seeds.`);

    const [firstPrompt, firstQuestion] = byPrompt.entries().next().value;
    const differentQuestion = Array.from(byPrompt.entries())
      .find(([promptText]) => promptText !== firstPrompt)?.[1];
    assert.ok(differentQuestion, `${templateId} should generate more than one visible explanation.`);
    assert.notEqual(
      grammarQuestionVariantSignature(firstQuestion),
      grammarQuestionVariantSignature(differentQuestion),
      `${templateId} should keep materially different explanation prompts distinct.`,
    );
  }
});
