/**
 * Grammar QG P8 — UX / Input-Type Support Audit
 *
 * Structural checks proving that all input families are properly represented,
 * no answer data leaks into client-facing inputSpec, and each input type
 * carries the metadata required for correct front-end rendering.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGrammarQuestion,
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateQuestions(templateId, seedCount) {
  const results = [];
  for (let seed = 1; seed <= seedCount; seed++) {
    const q = createGrammarQuestion({ templateId, seed });
    if (q) results.push({ seed, question: q });
  }
  return results;
}

// ---------------------------------------------------------------------------
// 1. Input family coverage
// ---------------------------------------------------------------------------

describe('UX input-type support audit', () => {
  const EXPECTED_TYPES = new Set([
    'single_choice',
    'checkbox_list',
    'table_choice',
    'textarea',
    'multi',
    'text',
  ]);

  describe('all 6 input families represented in corpus', () => {
    it('collects all expected inputSpec.type values across corpus', () => {
      const found = new Set();
      for (const template of GRAMMAR_TEMPLATE_METADATA) {
        const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
        if (q && q.inputSpec) found.add(q.inputSpec.type);
      }
      for (const expected of EXPECTED_TYPES) {
        assert.ok(
          found.has(expected),
          `Missing input type: ${expected}. Found: ${[...found].sort().join(', ')}`
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. No answerSpec leaks into client-facing inputSpec
  // ---------------------------------------------------------------------------

  describe('no answerSpec field leaks into client-facing inputSpec', () => {
    const BANNED_TOP_KEYS = ['golden', 'nearMiss', 'accepted', 'answerSpec', 'correct'];
    const BANNED_OPTION_KEYS = ['golden', 'nearMiss', 'correct', 'isCorrect'];

    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const questions = generateQuestions(template.id, 3);
      for (const { seed, question } of questions) {
        it(`${template.id} seed=${seed}: inputSpec has no answer-leaking keys`, () => {
          const spec = question.inputSpec;
          assert.ok(spec, 'inputSpec must exist');

          for (const banned of BANNED_TOP_KEYS) {
            assert.ok(
              !(banned in spec),
              `inputSpec contains banned key '${banned}'`
            );
          }

          if (Array.isArray(spec.options)) {
            for (const opt of spec.options) {
              for (const banned of BANNED_OPTION_KEYS) {
                assert.ok(
                  !(banned in opt),
                  `inputSpec.options item contains banned key '${banned}'`
                );
              }
            }
          }
        });
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 3. table_choice items have row metadata
  // ---------------------------------------------------------------------------

  describe('table_choice items have row metadata', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const questions = generateQuestions(template.id, 3);
      for (const { seed, question } of questions) {
        if (question.inputSpec.type !== 'table_choice') continue;

        it(`${template.id} seed=${seed}: rows and columns are well-formed`, () => {
          const spec = question.inputSpec;

          assert.ok(Array.isArray(spec.rows), 'inputSpec.rows must be an array');
          assert.ok(spec.rows.length > 0, 'inputSpec.rows must not be empty');

          for (const row of spec.rows) {
            assert.ok(
              'key' in row && typeof row.key === 'string' && row.key.length > 0,
              `Each row must have a non-empty 'key' field`
            );
            assert.ok(
              'label' in row && typeof row.label === 'string' && row.label.length > 0,
              `Each row must have a non-empty 'label' field`
            );
          }

          assert.ok(Array.isArray(spec.columns), 'inputSpec.columns must be an array');
          assert.ok(spec.columns.length > 0, 'inputSpec.columns must not be empty');
        });
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 4. textarea items have placeholder text
  // ---------------------------------------------------------------------------

  describe('textarea items have placeholder text', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const questions = generateQuestions(template.id, 3);
      for (const { seed, question } of questions) {
        if (question.inputSpec.type !== 'textarea') continue;

        it(`${template.id} seed=${seed}: placeholder is a non-empty string`, () => {
          const placeholder = question.inputSpec.placeholder;
          assert.ok(
            typeof placeholder === 'string' && placeholder.length > 0,
            'textarea inputSpec must have a non-empty placeholder string'
          );
        });
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 5. single_choice options have non-empty labels
  // ---------------------------------------------------------------------------

  describe('single_choice options have non-empty labels', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const questions = generateQuestions(template.id, 3);
      for (const { seed, question } of questions) {
        if (question.inputSpec.type !== 'single_choice') continue;

        it(`${template.id} seed=${seed}: every option has a non-empty label or value`, () => {
          const options = question.inputSpec.options;
          assert.ok(Array.isArray(options) && options.length > 0, 'options must be a non-empty array');

          for (const opt of options) {
            const hasLabel = typeof opt.label === 'string' && opt.label.length > 0;
            const hasValue = typeof opt.value === 'string' && opt.value.length > 0;
            assert.ok(
              hasLabel || hasValue,
              `Option must have a non-empty 'label' or 'value': ${JSON.stringify(opt)}`
            );
          }
        });
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 6. No hidden answer data in inputSpec options
  // ---------------------------------------------------------------------------

  describe('no hidden answer data in inputSpec options', () => {
    const BANNED_KEYS = ['isAnswer', 'correct', 'golden'];

    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const questions = generateQuestions(template.id, 3);
      for (const { seed, question } of questions) {
        if (!Array.isArray(question.inputSpec.options)) continue;

        it(`${template.id} seed=${seed}: no option carries answer-indicating keys`, () => {
          for (const opt of question.inputSpec.options) {
            for (const banned of BANNED_KEYS) {
              assert.ok(
                !(banned in opt),
                `Option has banned key '${banned}': ${JSON.stringify(opt)}`
              );
            }
          }
        });
      }
    }
  });
});
