/**
 * Grammar QG P9 U4 — Table Choice Contract Tests
 *
 * Validates heterogeneous table_choice behaviour:
 * - Row-specific options render and validate correctly
 * - Global-column fallback is preserved for homogeneous tables
 * - Invalid submissions against row-specific options are rejected
 * - No duplicate row keys across all table_choice templates
 * - All table_choice templates produce proper row structure
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGrammarQuestion,
  evaluateGrammarQuestion,
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEED_COUNT = 15;

function generateTableChoiceQuestions(templateId, count = SEED_COUNT) {
  const results = [];
  for (let seed = 1; seed <= count; seed++) {
    const q = createGrammarQuestion({ templateId, seed });
    if (q && q.inputSpec?.type === 'table_choice') results.push({ seed, question: q });
  }
  return results;
}

function allTableChoiceTemplates() {
  return GRAMMAR_TEMPLATE_METADATA.filter(t => {
    const q = createGrammarQuestion({ templateId: t.id, seed: 1 });
    return q && q.inputSpec?.type === 'table_choice';
  });
}

// ---------------------------------------------------------------------------
// 1. Heterogeneous table renders row-specific options
// ---------------------------------------------------------------------------

describe('Heterogeneous table_choice: row-specific options', () => {
  const MIXED_TRANSFER_IDS = [
    'qg_p4_word_class_noun_phrase_transfer',
    'qg_p4_voice_roles_transfer',
  ];

  for (const templateId of MIXED_TRANSFER_IDS) {
    const questions = generateTableChoiceQuestions(templateId);

    for (const { seed, question } of questions) {
      it(`${templateId} seed=${seed}: rows include per-row options`, () => {
        const rows = question.inputSpec.rows;
        const hasRowOptions = rows.some(r => Array.isArray(r.options) && r.options.length > 0);
        assert.ok(
          hasRowOptions,
          `Mixed-transfer template "${templateId}" seed ${seed} must have row-specific options. ` +
          `Rows: ${JSON.stringify(rows.map(r => ({ key: r.key, options: r.options })))}`,
        );
      });

      it(`${templateId} seed=${seed}: row.options are subset of global columns`, () => {
        const columns = new Set(question.inputSpec.columns);
        for (const row of question.inputSpec.rows) {
          if (!Array.isArray(row.options)) continue;
          for (const opt of row.options) {
            assert.ok(
              columns.has(opt),
              `Row "${row.key}" option "${opt}" is not in global columns ${JSON.stringify(question.inputSpec.columns)}`,
            );
          }
        }
      });

      it(`${templateId} seed=${seed}: rows have ariaLabel`, () => {
        for (const row of question.inputSpec.rows) {
          assert.ok(
            typeof row.ariaLabel === 'string' && row.ariaLabel.length > 0,
            `Row "${row.key}" must have a non-empty ariaLabel`,
          );
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Global-column tables still work unchanged (no row.options = uses columns)
// ---------------------------------------------------------------------------

describe('Homogeneous table_choice: global columns preserved', () => {
  // sentence_function is a homogeneous table_choice (all rows share same columns)
  const HOMOGENEOUS_ID = 'sentence_function_classify';
  const questions = generateTableChoiceQuestions(HOMOGENEOUS_ID);

  for (const { seed, question } of questions) {
    it(`${HOMOGENEOUS_ID} seed=${seed}: no row.options present (uses global columns)`, () => {
      const rows = question.inputSpec.rows;
      const hasRowOptions = rows.some(r => Array.isArray(r.options) && r.options.length > 0);
      assert.ok(
        !hasRowOptions,
        `Homogeneous template "${HOMOGENEOUS_ID}" seed ${seed} must NOT have row-specific options`,
      );
    });

    it(`${HOMOGENEOUS_ID} seed=${seed}: columns array is non-empty`, () => {
      assert.ok(
        question.inputSpec.columns.length > 0,
        `Global columns must be non-empty for "${HOMOGENEOUS_ID}" seed ${seed}`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Valid row-specific submission accepted
// ---------------------------------------------------------------------------

describe('Valid row-specific submission: accepted', () => {
  const templateId = 'qg_p4_voice_roles_transfer';
  const questions = generateTableChoiceQuestions(templateId);

  for (const { seed, question } of questions) {
    it(`${templateId} seed=${seed}: correct answer per row-specific options evaluates`, () => {
      // Build the correct response from the answerSpec
      const rows = question.inputSpec.rows;
      const fields = question.answerSpec?.params?.fields || question.answerSpec?.fields || {};
      const response = {};
      for (const row of rows) {
        const fieldSpec = fields[row.key];
        if (fieldSpec?.golden?.[0]) {
          response[row.key] = fieldSpec.golden[0];
        }
      }
      const result = evaluateGrammarQuestion(question, response);
      assert.ok(
        result !== null,
        `Evaluate must not return null for correct row-specific response`,
      );
      assert.equal(
        result.correct,
        true,
        `Correct row-specific response must mark as correct. Got score=${result.score}/${result.maxScore}`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Invalid row-specific submission rejected
// ---------------------------------------------------------------------------

describe('Invalid row-specific submission: value NOT in row.options but in global columns', () => {
  const templateId = 'qg_p4_word_class_noun_phrase_transfer';
  const questions = generateTableChoiceQuestions(templateId);

  for (const { seed, question } of questions) {
    it(`${templateId} seed=${seed}: answer from wrong row's options is invalid`, () => {
      const rows = question.inputSpec.rows;
      const fields = question.answerSpec?.params?.fields || question.answerSpec?.fields || {};
      // Find a row with options and use an option from a DIFFERENT row
      const rowWithOpts = rows.find(r => Array.isArray(r.options) && r.options.length > 0);
      if (!rowWithOpts) return; // Skip if no row-specific options

      const otherRow = rows.find(r => r.key !== rowWithOpts.key && Array.isArray(r.options));
      if (!otherRow) return;

      // Pick an option from otherRow that is NOT in rowWithOpts.options
      const invalidOpt = otherRow.options.find(o => !rowWithOpts.options.includes(o));
      if (!invalidOpt) return;

      // This option IS in global columns but NOT in rowWithOpts.options
      assert.ok(
        question.inputSpec.columns.includes(invalidOpt),
        `"${invalidOpt}" must be in global columns for this test to be meaningful`,
      );
      assert.ok(
        !rowWithOpts.options.includes(invalidOpt),
        `"${invalidOpt}" must NOT be in rowWithOpts.options for this test`,
      );

      // Submit with this invalid value — evaluate should not give full marks
      const response = {};
      for (const row of rows) {
        if (row.key === rowWithOpts.key) {
          response[row.key] = invalidOpt; // invalid for this row
        } else {
          // Use a valid option for other rows
          const fieldSpec = fields[row.key];
          response[row.key] = fieldSpec?.golden?.[0] || row.options?.[0] || question.inputSpec.columns[0];
        }
      }

      const result = evaluateGrammarQuestion(question, response);
      assert.ok(result !== null, 'Evaluate must not return null');
      assert.equal(
        result.correct,
        false,
        `Invalid row-specific value "${invalidOpt}" for row "${rowWithOpts.key}" must not produce full marks. ` +
        `Got score=${result.score}/${result.maxScore}`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 5. P8 oracle compatibility: existing table_choice templates still generate valid questions
// ---------------------------------------------------------------------------

describe('P8 oracle: all table_choice templates generate valid questions', () => {
  const templates = allTableChoiceTemplates();

  for (const template of templates) {
    const questions = generateTableChoiceQuestions(template.id);

    for (const { seed, question } of questions) {
      it(`${template.id} seed=${seed}: has valid inputSpec structure`, () => {
        assert.equal(question.inputSpec.type, 'table_choice');
        assert.ok(Array.isArray(question.inputSpec.columns), 'columns must be an array');
        assert.ok(question.inputSpec.columns.length > 0, 'columns must be non-empty');
        assert.ok(Array.isArray(question.inputSpec.rows), 'rows must be an array');
        assert.ok(question.inputSpec.rows.length > 0, 'rows must be non-empty');
      });

      it(`${template.id} seed=${seed}: each row has key and label`, () => {
        for (const row of question.inputSpec.rows) {
          assert.ok(typeof row.key === 'string' && row.key.length > 0, `row must have key`);
          assert.ok(typeof row.label === 'string' && row.label.length > 0, `row must have label`);
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 6. No duplicate row keys in any table_choice question
// ---------------------------------------------------------------------------

describe('No duplicate row keys in table_choice questions', () => {
  const templates = allTableChoiceTemplates();

  for (const template of templates) {
    const questions = generateTableChoiceQuestions(template.id);

    for (const { seed, question } of questions) {
      it(`${template.id} seed=${seed}: no duplicate row keys`, () => {
        const keys = question.inputSpec.rows.map(r => r.key);
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

// ---------------------------------------------------------------------------
// 7. All table_choice templates have proper row structure
// ---------------------------------------------------------------------------

describe('All table_choice templates: proper row structure', () => {
  const templates = allTableChoiceTemplates();

  for (const template of templates) {
    const questions = generateTableChoiceQuestions(template.id, 5);

    for (const { seed, question } of questions) {
      it(`${template.id} seed=${seed}: row.options (if present) has no duplicates and no empty strings`, () => {
        for (const row of question.inputSpec.rows) {
          if (!Array.isArray(row.options)) continue;
          assert.ok(row.options.length > 0, `row.options must be non-empty when present`);
          const unique = new Set(row.options);
          assert.equal(unique.size, row.options.length, `row.options has duplicates: ${JSON.stringify(row.options)}`);
          for (const opt of row.options) {
            assert.ok(typeof opt === 'string' && opt.length > 0, `option must be non-empty string, got: "${opt}"`);
          }
        }
      });

      it(`${template.id} seed=${seed}: row.ariaLabel (if present) is non-empty string`, () => {
        for (const row of question.inputSpec.rows) {
          if (row.ariaLabel === undefined) continue;
          assert.ok(
            typeof row.ariaLabel === 'string' && row.ariaLabel.length > 0,
            `row.ariaLabel must be non-empty string when present`,
          );
        }
      });
    }
  }
});
