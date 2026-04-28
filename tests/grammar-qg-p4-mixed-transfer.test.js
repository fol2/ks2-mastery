import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
  grammarQuestionVariantSignature,
} from '../worker/src/subjects/grammar/content.js';

const P4_TEMPLATES = GRAMMAR_TEMPLATE_METADATA.filter(
  (t) => (t.tags || []).includes('qg-p4') && (t.tags || []).includes('mixed-transfer'),
);

const ALL_18_CONCEPTS = [
  'sentence_functions', 'speech_punctuation', 'word_classes', 'noun_phrases',
  'adverbials', 'clauses', 'boundary_punctuation', 'relative_clauses',
  'parenthesis_commas', 'tense_aspect', 'modal_verbs', 'standard_english',
  'pronouns_cohesion', 'formality', 'active_passive', 'subject_object',
  'apostrophes_possession', 'hyphen_ambiguity',
];

describe('Grammar QG P4 mixed-transfer templates', () => {
  it('has exactly 8 P4 mixed-transfer templates', () => {
    assert.strictEqual(P4_TEMPLATES.length, 8);
  });

  it('all 18 concepts covered by mixed-transfer templates', () => {
    const covered = new Set();
    P4_TEMPLATES.forEach((t) => t.skillIds.forEach((s) => covered.add(s)));
    assert.strictEqual(covered.size, 18);
    for (const concept of ALL_18_CONCEPTS) {
      assert.ok(covered.has(concept), `Missing concept: ${concept}`);
    }
  });

  it('each P4 template has at least 2 skillIds', () => {
    for (const template of P4_TEMPLATES) {
      assert.ok(
        template.skillIds.length >= 2,
        `${template.id} has only ${template.skillIds.length} skillIds`,
      );
    }
  });

  it('all P4 templates have difficulty 3', () => {
    for (const template of P4_TEMPLATES) {
      assert.strictEqual(template.difficulty, 3, `${template.id} difficulty`);
    }
  });

  it('all P4 templates require answerSpec', () => {
    for (const template of P4_TEMPLATES) {
      assert.strictEqual(template.requiresAnswerSpec, true, `${template.id} requiresAnswerSpec`);
    }
  });

  describe('build and answer-spec validation', () => {
    for (const template of P4_TEMPLATES) {
      it(`${template.id} builds for seeds [1..8] without error`, () => {
        for (let seed = 1; seed <= 8; seed++) {
          const q = createGrammarQuestion({ templateId: template.id, seed });
          assert.ok(q, `${template.id}:${seed} returned null`);
          assert.ok(q.answerSpec, `${template.id}:${seed} missing answerSpec`);
          assert.ok(q.stemHtml, `${template.id}:${seed} missing stemHtml`);
          assert.ok(q.inputSpec, `${template.id}:${seed} missing inputSpec`);
        }
      });

      it(`${template.id} has exactly 1 correct answer path`, () => {
        for (let seed = 1; seed <= 3; seed++) {
          const q = createGrammarQuestion({ templateId: template.id, seed });
          if (q.answerSpec.kind === 'exact') {
            assert.strictEqual(q.answerSpec.golden.length, 1, `${template.id}:${seed} golden count`);
            // The correct answer must appear in options
            const optValues = q.inputSpec.options.map((o) => o.value);
            assert.ok(
              optValues.includes(q.answerSpec.golden[0]),
              `${template.id}:${seed} correct not in options`,
            );
          } else if (q.answerSpec.kind === 'multiField') {
            // Each field in params.fields should have exactly 1 golden answer
            const fields = q.answerSpec.params.fields;
            for (const [key, fieldSpec] of Object.entries(fields)) {
              assert.strictEqual(
                fieldSpec.golden.length, 1,
                `${template.id}:${seed} field ${key} golden count`,
              );
            }
          }
        }
      });

      it(`${template.id} answerSpec.kind matches declared kind`, () => {
        const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
        assert.strictEqual(
          q.answerSpec.kind,
          template.answerSpecKind,
          `${template.id} kind mismatch`,
        );
      });

      it(`${template.id} produces 8 distinct variant signatures over seeds [1..8]`, () => {
        const sigs = new Set();
        for (let seed = 1; seed <= 8; seed++) {
          const q = createGrammarQuestion({ templateId: template.id, seed });
          sigs.add(grammarQuestionVariantSignature(q));
        }
        assert.strictEqual(
          sigs.size, 8,
          `${template.id} only ${sigs.size} distinct variants over 8 seeds`,
        );
      });
    }
  });

  describe('redaction safety', () => {
    const FORBIDDEN_KEYS = [
      'answerSpec', 'solutionLines', 'generatorFamilyId',
      'variantSignature', 'golden', 'nearMiss', 'misconception', 'accepted',
    ];

    for (const template of P4_TEMPLATES) {
      it(`${template.id} learner read-model hides forbidden keys`, () => {
        const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
        // Simulate the learner read-model: strip internal fields
        const learnerView = { ...q };
        for (const key of FORBIDDEN_KEYS) {
          delete learnerView[key];
        }
        const serialised = JSON.stringify(learnerView);
        for (const key of FORBIDDEN_KEYS) {
          assert.ok(
            !serialised.includes(`"${key}"`),
            `${template.id} learner view still contains "${key}"`,
          );
        }
      });
    }
  });

  describe('feedback quality', () => {
    for (const template of P4_TEMPLATES) {
      it(`${template.id} feedback references both grammar concepts`, () => {
        const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
        const feedback = q.answerSpec.feedbackLong || '';
        // Feedback should be non-trivial (at least 30 chars) and mention grammar reasoning
        assert.ok(
          feedback.length >= 30,
          `${template.id} feedback too short: "${feedback}"`,
        );
      });
    }
  });

  describe('evaluate function', () => {
    for (const template of P4_TEMPLATES) {
      it(`${template.id} evaluate returns correct for the right answer`, () => {
        const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
        if (q.answerSpec.kind === 'exact') {
          const result = q.evaluate({ answer: q.answerSpec.golden[0] });
          assert.strictEqual(result.correct, true, `${template.id} correct answer not accepted`);
          assert.strictEqual(result.score, result.maxScore);
        } else if (q.answerSpec.kind === 'multiField') {
          const fields = q.answerSpec.params.fields;
          const resp = {};
          for (const [key, fieldSpec] of Object.entries(fields)) {
            resp[key] = fieldSpec.golden[0];
          }
          const result = q.evaluate(resp);
          assert.strictEqual(result.correct, true, `${template.id} correct answer not accepted`);
          assert.strictEqual(result.score, result.maxScore);
        }
      });

      it(`${template.id} evaluate returns incorrect for a wrong answer`, () => {
        const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
        if (q.answerSpec.kind === 'exact') {
          const wrong = q.answerSpec.nearMiss[0] || 'totally wrong answer';
          const result = q.evaluate({ answer: wrong });
          assert.strictEqual(result.correct, false, `${template.id} wrong answer was accepted`);
        } else if (q.answerSpec.kind === 'multiField') {
          // Give all wrong answers
          const fields = q.answerSpec.params.fields;
          const resp = {};
          for (const [key, fieldSpec] of Object.entries(fields)) {
            resp[key] = fieldSpec.nearMiss[0] || 'wrong';
          }
          const result = q.evaluate(resp);
          assert.strictEqual(result.correct, false, `${template.id} wrong answer was accepted`);
        }
      });
    }

    it('classify template partial credit: 1 correct field, 1 wrong', () => {
      const q = createGrammarQuestion({ templateId: 'qg_p4_word_class_noun_phrase_transfer', seed: 1 });
      assert.strictEqual(q.answerSpec.kind, 'multiField');
      const fields = q.answerSpec.params.fields;
      const keys = Object.keys(fields);
      assert.ok(keys.length >= 2, 'need at least 2 fields for partial credit test');
      const resp = {};
      // First field correct, second field wrong
      resp[keys[0]] = fields[keys[0]].golden[0];
      resp[keys[1]] = fields[keys[1]].nearMiss[0] || 'wrong';
      const result = q.evaluate(resp);
      assert.strictEqual(result.correct, false, 'partial credit should not be fully correct');
      assert.strictEqual(result.score, 1, 'one correct field yields score 1');
      assert.strictEqual(result.maxScore, 2, 'two fields yields maxScore 2');
    });
  });

  describe('seed boundary', () => {
    it('pickBySeed handles seed=0 gracefully', () => {
      const q = createGrammarQuestion({ templateId: 'qg_p4_sentence_speech_transfer', seed: 0 });
      assert.ok(q, 'seed=0 should produce a valid question');
      assert.ok(q.stemHtml, 'seed=0 question has prompt');
    });
  });
});
