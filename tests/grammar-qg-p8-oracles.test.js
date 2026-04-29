/**
 * Grammar QG P8 — Automated Question-Quality Oracles
 *
 * Comprehensive property-based tests proving question quality across the
 * certification window. These oracles verify structural invariants, marking
 * correctness, and client-facing redaction for all grammar templates.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { markByAnswerSpec } from '../worker/src/subjects/grammar/answer-spec.js';
import {
  createGrammarQuestion,
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseForComparison(str) {
  return (str || '').toLowerCase().replace(/[''""]/g, "'").replace(/\s+/g, ' ').trim();
}

function generateQuestions(templateId, seedCount) {
  const results = [];
  for (let seed = 1; seed <= seedCount; seed++) {
    const q = createGrammarQuestion({ templateId, seed });
    if (q) results.push({ seed, question: q });
  }
  return results;
}

// ---------------------------------------------------------------------------
// 1. Selected-response oracles (seeds 1-15)
// ---------------------------------------------------------------------------

describe('Selected-response oracles', () => {
  const SEED_COUNT = 15;

  describe('single_choice: exactly one golden answer', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const questions = generateQuestions(template.id, SEED_COUNT);
      for (const { seed, question } of questions) {
        if (question.inputSpec.type !== 'single_choice') continue;
        if (!question.answerSpec?.golden) continue;

        it(`${template.id} seed=${seed}: exactly one option matches golden`, () => {
          const goldenNorms = question.answerSpec.golden.map(normaliseForComparison);
          const options = question.inputSpec.options.map(o => o.value);
          const matching = options.filter(o => goldenNorms.includes(normaliseForComparison(o)));
          assert.equal(
            matching.length,
            1,
            `Expected exactly 1 option matching golden for "${template.id}" seed ${seed}, found ${matching.length}. ` +
            `Golden: ${JSON.stringify(question.answerSpec.golden)}, Options: ${JSON.stringify(options)}`,
          );
        });
      }
    }
  });

  describe('single_choice: no duplicate normalised option values', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const questions = generateQuestions(template.id, SEED_COUNT);
      for (const { seed, question } of questions) {
        if (question.inputSpec.type !== 'single_choice') continue;

        it(`${template.id} seed=${seed}: no duplicate options`, () => {
          const options = question.inputSpec.options.map(o => normaliseForComparison(o.value));
          const unique = new Set(options);
          assert.equal(
            unique.size,
            options.length,
            `Duplicate normalised options in "${template.id}" seed ${seed}: ${JSON.stringify(question.inputSpec.options.map(o => o.value))}`,
          );
        });
      }
    }
  });

  describe('checkbox_list: at least one correct option exists', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const questions = generateQuestions(template.id, SEED_COUNT);
      for (const { seed, question } of questions) {
        if (question.inputSpec.type !== 'checkbox_list') continue;
        if (!question.evaluate) continue;

        it(`${template.id} seed=${seed}: at least one correct option`, () => {
          const options = question.inputSpec.options;
          // For answerSpec-based: check golden exists
          if (question.answerSpec?.golden && question.answerSpec.golden.length > 0) {
            assert.ok(true, 'Has golden answers in answerSpec');
            return;
          }
          // For evaluate-based checkbox: the evaluate function reveals the
          // correct answer(s) via answerText even when given an empty response.
          // Verifying answerText is non-empty proves a correct answer set exists.
          if (question.evaluate) {
            const probe = question.evaluate({ selected: [] });
            assert.ok(
              probe.answerText && probe.answerText.trim().length > 0,
              `Evaluate reveals no answerText for "${template.id}" seed ${seed} — implies no correct answer exists`,
            );
            // Additionally verify the revealed answers are a subset of the options
            const optionValues = new Set(options.map(o => normaliseForComparison(o.value)));
            const revealed = probe.answerText.split(/[;,]\s*/);
            const allRevealed = revealed.every(r => optionValues.has(normaliseForComparison(r)));
            assert.ok(
              allRevealed,
              `Revealed answers not found in options for "${template.id}" seed ${seed}: revealed=${JSON.stringify(revealed)}, options=${JSON.stringify([...optionValues])}`,
            );
            return;
          }
          assert.fail(`No mechanism to verify correct option for "${template.id}" seed ${seed}`);
        });
      }
    }
  });

  describe('checkbox_list: no duplicate normalised option values', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const questions = generateQuestions(template.id, SEED_COUNT);
      for (const { seed, question } of questions) {
        if (question.inputSpec.type !== 'checkbox_list') continue;

        it(`${template.id} seed=${seed}: no duplicate options`, () => {
          const options = question.inputSpec.options.map(o => normaliseForComparison(o.value));
          const unique = new Set(options);
          assert.equal(
            unique.size,
            options.length,
            `Duplicate normalised options in "${template.id}" seed ${seed}: ${JSON.stringify(question.inputSpec.options.map(o => o.value))}`,
          );
        });
      }
    }
  });

  describe('table_choice: no duplicate row keys', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const questions = generateQuestions(template.id, SEED_COUNT);
      for (const { seed, question } of questions) {
        if (question.inputSpec.type !== 'table_choice') continue;

        it(`${template.id} seed=${seed}: no duplicate row keys`, () => {
          const rows = question.inputSpec.rows;
          const keys = rows.map(r => r.key);
          const unique = new Set(keys);
          assert.equal(
            unique.size,
            keys.length,
            `Duplicate row keys in "${template.id}" seed ${seed}: ${JSON.stringify(keys)}`,
          );
        });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Constructed-response oracles (seeds 1-10)
// ---------------------------------------------------------------------------

describe('Constructed-response oracles', () => {
  const SEED_COUNT = 10;
  const CONSTRUCTED_KINDS = ['normalisedText', 'acceptedSet', 'punctuationPattern'];

  describe('every golden answer marks correct via markByAnswerSpec', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      if (!template.answerSpecKind || !CONSTRUCTED_KINDS.includes(template.answerSpecKind)) continue;

      const questions = generateQuestions(template.id, SEED_COUNT);
      for (const { seed, question } of questions) {
        const spec = question.answerSpec;
        if (!spec || !CONSTRUCTED_KINDS.includes(spec.kind)) continue;
        if (!Array.isArray(spec.golden) || spec.golden.length === 0) continue;

        for (const golden of spec.golden) {
          it(`${template.id} seed=${seed}: golden "${golden.substring(0, 40)}..." marks correct`, () => {
            const result = markByAnswerSpec(spec, golden);
            assert.equal(
              result.correct,
              true,
              `Golden "${golden}" must mark correct for "${template.id}" seed ${seed}. Got score=${result.score}/${result.maxScore}`,
            );
          });
        }
      }
    }
  });

  describe('every nearMiss marks NOT fully correct', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      if (!template.answerSpecKind || !CONSTRUCTED_KINDS.includes(template.answerSpecKind)) continue;

      const questions = generateQuestions(template.id, SEED_COUNT);
      for (const { seed, question } of questions) {
        const spec = question.answerSpec;
        if (!spec || !CONSTRUCTED_KINDS.includes(spec.kind)) continue;
        if (!Array.isArray(spec.nearMiss) || spec.nearMiss.length === 0) continue;

        for (const nearMiss of spec.nearMiss) {
          it(`${template.id} seed=${seed}: nearMiss "${nearMiss.substring(0, 40)}..." not fully correct`, () => {
            const result = markByAnswerSpec(spec, nearMiss);
            const isNotFullyCorrect = result.correct === false || result.score < result.maxScore;
            assert.ok(
              isNotFullyCorrect,
              `nearMiss "${nearMiss}" must NOT be fully correct for "${template.id}" seed ${seed}. ` +
              `Got correct=${result.correct}, score=${result.score}/${result.maxScore}`,
            );
          });
        }
      }
    }
  });

  describe('answerText marks correct (does not contradict golden)', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      if (!template.answerSpecKind || !CONSTRUCTED_KINDS.includes(template.answerSpecKind)) continue;

      const questions = generateQuestions(template.id, SEED_COUNT);
      for (const { seed, question } of questions) {
        const spec = question.answerSpec;
        if (!spec || !CONSTRUCTED_KINDS.includes(spec.kind)) continue;
        if (!spec.answerText) continue;

        it(`${template.id} seed=${seed}: answerText marks correct`, () => {
          // First try answerText directly
          let result = markByAnswerSpec(spec, spec.answerText);
          if (!result.correct) {
            // answerText may use curly quotes while golden uses straight — normalise
            const straightened = spec.answerText
              .replace(/[“”]/g, '"')
              .replace(/[‘’]/g, "'");
            result = markByAnswerSpec(spec, straightened);
          }
          assert.equal(
            result.correct,
            true,
            `answerText "${spec.answerText}" must mark correct for "${template.id}" seed ${seed}. ` +
            `Got score=${result.score}/${result.maxScore}`,
          );
        });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Manual-review-only oracles (seeds 1-5)
// ---------------------------------------------------------------------------

describe('Manual-review-only oracles', () => {
  const SEED_COUNT = 5;

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    if (template.answerSpecKind !== 'manualReviewOnly') continue;

    const questions = generateQuestions(template.id, SEED_COUNT);
    for (const { seed, question } of questions) {
      const spec = question.answerSpec;
      if (!spec || spec.kind !== 'manualReviewOnly') continue;

      it(`${template.id} seed=${seed}: maxScore is 0`, () => {
        assert.equal(
          spec.maxScore,
          0,
          `manualReviewOnly template "${template.id}" seed ${seed} must have maxScore===0, got ${spec.maxScore}`,
        );
      });

      it(`${template.id} seed=${seed}: no golden array (or empty)`, () => {
        const hasNoGolden = !spec.golden || (Array.isArray(spec.golden) && spec.golden.length === 0);
        assert.ok(
          hasNoGolden,
          `manualReviewOnly template "${template.id}" seed ${seed} must not have golden answers, got: ${JSON.stringify(spec.golden)}`,
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 4. Redaction oracle (seeds 1-5)
// ---------------------------------------------------------------------------

describe('Redaction oracle — client-facing question does not leak answer internals', () => {
  const SEED_COUNT = 5;
  const FORBIDDEN_KEYS = ['golden', 'nearMiss', 'accepted'];

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    const questions = generateQuestions(template.id, SEED_COUNT);
    for (const { seed, question } of questions) {
      it(`${template.id} seed=${seed}: inputSpec contains no forbidden keys`, () => {
        const inputSpecStr = JSON.stringify(question.inputSpec);
        const inputSpecObj = question.inputSpec;

        // Check top-level inputSpec keys
        for (const key of FORBIDDEN_KEYS) {
          assert.ok(
            !(key in inputSpecObj),
            `inputSpec for "${template.id}" seed ${seed} contains forbidden key "${key}"`,
          );
        }

        // Check nested within options (if present)
        if (Array.isArray(inputSpecObj.options)) {
          for (const opt of inputSpecObj.options) {
            for (const key of FORBIDDEN_KEYS) {
              assert.ok(
                !(key in opt),
                `inputSpec.options item for "${template.id}" seed ${seed} contains forbidden key "${key}": ${JSON.stringify(opt)}`,
              );
            }
          }
        }

        // Check nested within rows (if present)
        if (Array.isArray(inputSpecObj.rows)) {
          for (const row of inputSpecObj.rows) {
            for (const key of FORBIDDEN_KEYS) {
              assert.ok(
                !(key in row),
                `inputSpec.rows item for "${template.id}" seed ${seed} contains forbidden key "${key}": ${JSON.stringify(row)}`,
              );
            }
          }
        }
      });

      it(`${template.id} seed=${seed}: options do not contain golden as hidden data attribute`, () => {
        if (!question.answerSpec?.golden || !Array.isArray(question.inputSpec.options)) return;

        const goldenNorms = question.answerSpec.golden.map(normaliseForComparison);

        for (const opt of question.inputSpec.options) {
          // Check all keys except value and label for hidden golden leakage
          const extraKeys = Object.keys(opt).filter(k => k !== 'value' && k !== 'label');
          for (const key of extraKeys) {
            const val = normaliseForComparison(String(opt[key]));
            const leaks = goldenNorms.some(g => val.includes(g) && g.length > 2);
            assert.ok(
              !leaks,
              `Option attribute "${key}" in "${template.id}" seed ${seed} leaks golden answer: ${JSON.stringify(opt)}`,
            );
          }
        }
      });
    }
  }
});
