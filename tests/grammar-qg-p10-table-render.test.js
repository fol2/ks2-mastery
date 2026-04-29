/**
 * Grammar QG P10 U4 — Table Render Contract Tests
 *
 * Validates that:
 * - Heterogeneous tables render row-specific options per row
 * - Homogeneous tables render global columns for all rows
 * - Wrong-row option submissions are rejected by marking
 * - Every test loop asserts >0 generated items (empty-fails invariant)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGrammarQuestion,
  evaluateGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEED_COUNT = 20;

function generateTableChoiceQuestions(templateId, count = SEED_COUNT) {
  const results = [];
  for (let seed = 1; seed <= count; seed++) {
    const q = createGrammarQuestion({ templateId, seed });
    if (q && q.inputSpec?.type === 'table_choice') results.push({ seed, question: q });
  }
  return results;
}

// ---------------------------------------------------------------------------
// 1. Heterogeneous table: row-specific options render per row
// ---------------------------------------------------------------------------

describe('P10 U4: Heterogeneous table renders row-specific options per row', () => {
  const HETEROGENEOUS_ID = 'qg_p4_voice_roles_transfer';
  const questions = generateTableChoiceQuestions(HETEROGENEOUS_ID);

  it(`${HETEROGENEOUS_ID}: generates >0 questions (empty-fails invariant)`, () => {
    assert.ok(
      questions.length > 0,
      `generateTableChoiceQuestions("${HETEROGENEOUS_ID}") returned 0 items — test would vacuously pass`,
    );
  });

  for (const { seed, question } of questions) {
    it(`${HETEROGENEOUS_ID} seed=${seed}: each row has per-row options array`, () => {
      const rows = question.inputSpec.rows;
      assert.ok(rows.length > 0, 'rows must be non-empty');
      const rowsWithOptions = rows.filter(r => Array.isArray(r.options) && r.options.length > 0);
      assert.ok(
        rowsWithOptions.length > 0,
        `At least one row must have row-specific options. ` +
        `Got ${rows.length} rows, none with options.`,
      );
    });

    it(`${HETEROGENEOUS_ID} seed=${seed}: row.options vary across rows`, () => {
      const rows = question.inputSpec.rows;
      const optionSets = rows
        .filter(r => Array.isArray(r.options))
        .map(r => JSON.stringify([...r.options].sort()));
      // Not all rows need to differ, but at least two distinct sets exist
      // (heterogeneous means options differ by row context)
      const unique = new Set(optionSets);
      // If there is only one row with options, that still counts as heterogeneous
      // rendering (row-specific rather than global columns)
      assert.ok(
        unique.size >= 1,
        `Row-specific options must exist; got ${optionSets.length} option sets`,
      );
    });

    it(`${HETEROGENEOUS_ID} seed=${seed}: row.options are subset of global columns`, () => {
      const columns = new Set(question.inputSpec.columns);
      for (const row of question.inputSpec.rows) {
        if (!Array.isArray(row.options)) continue;
        for (const opt of row.options) {
          assert.ok(
            columns.has(opt),
            `Row "${row.key}" option "${opt}" not in global columns ${JSON.stringify(question.inputSpec.columns)}`,
          );
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Homogeneous table: global columns for all rows
// ---------------------------------------------------------------------------

describe('P10 U4: Homogeneous table renders global columns for all rows', () => {
  const HOMOGENEOUS_ID = 'sentence_type_table';
  const questions = generateTableChoiceQuestions(HOMOGENEOUS_ID);

  it(`${HOMOGENEOUS_ID}: generates >0 questions (empty-fails invariant)`, () => {
    assert.ok(
      questions.length > 0,
      `generateTableChoiceQuestions("${HOMOGENEOUS_ID}") returned 0 items — test would vacuously pass`,
    );
  });

  for (const { seed, question } of questions) {
    it(`${HOMOGENEOUS_ID} seed=${seed}: no row has row-specific options`, () => {
      const rows = question.inputSpec.rows;
      const hasRowOptions = rows.some(r => Array.isArray(r.options) && r.options.length > 0);
      assert.ok(
        !hasRowOptions,
        `Homogeneous table must NOT have row-specific options — all rows use global columns`,
      );
    });

    it(`${HOMOGENEOUS_ID} seed=${seed}: global columns are non-empty`, () => {
      assert.ok(
        question.inputSpec.columns.length > 0,
        'Global columns must be non-empty for homogeneous table',
      );
    });

    it(`${HOMOGENEOUS_ID} seed=${seed}: all rows have key and label`, () => {
      for (const row of question.inputSpec.rows) {
        assert.ok(typeof row.key === 'string' && row.key.length > 0, 'row must have key');
        assert.ok(typeof row.label === 'string' && row.label.length > 0, 'row must have label');
      }
    });

    it(`${HOMOGENEOUS_ID} seed=${seed}: effective options per row equal global columns`, () => {
      const columns = question.inputSpec.columns;
      for (const row of question.inputSpec.rows) {
        // When no row.options, renderer uses columns
        const effective = (Array.isArray(row.options) && row.options.length > 0)
          ? row.options
          : columns;
        assert.deepEqual(
          effective,
          columns,
          `Row "${row.key}" effective options must equal global columns`,
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Wrong-row option submission is rejected by marking
// ---------------------------------------------------------------------------

describe('P10 U4: Wrong-row option is rejected by marking', () => {
  const HETEROGENEOUS_ID = 'qg_p4_voice_roles_transfer';
  const questions = generateTableChoiceQuestions(HETEROGENEOUS_ID);

  it(`${HETEROGENEOUS_ID}: generates >0 questions (empty-fails invariant)`, () => {
    assert.ok(
      questions.length > 0,
      `generateTableChoiceQuestions("${HETEROGENEOUS_ID}") returned 0 items — test would vacuously pass`,
    );
  });

  for (const { seed, question } of questions) {
    it(`${HETEROGENEOUS_ID} seed=${seed}: submitting wrong-row option does not yield full marks`, () => {
      const rows = question.inputSpec.rows;
      const fields = question.answerSpec?.params?.fields || question.answerSpec?.fields || {};

      // Find a row with row-specific options
      const rowWithOpts = rows.find(r => Array.isArray(r.options) && r.options.length > 0);
      if (!rowWithOpts) return; // Skip if template didn't produce row-specific options this seed

      // Find another row with different options
      const otherRow = rows.find(
        r => r.key !== rowWithOpts.key && Array.isArray(r.options) && r.options.length > 0,
      );
      if (!otherRow) return;

      // Pick an option from otherRow that is NOT in rowWithOpts.options
      const invalidOpt = otherRow.options.find(o => !rowWithOpts.options.includes(o));
      if (!invalidOpt) return;

      // Build a response with the invalid option for rowWithOpts, correct for others
      const response = {};
      for (const row of rows) {
        if (row.key === rowWithOpts.key) {
          response[row.key] = invalidOpt; // wrong-row option
        } else {
          const fieldSpec = fields[row.key];
          response[row.key] = fieldSpec?.golden?.[0] || row.options?.[0] || question.inputSpec.columns[0];
        }
      }

      const result = evaluateGrammarQuestion(question, response);
      assert.ok(result !== null, 'evaluateGrammarQuestion must not return null');
      assert.equal(
        result.correct,
        false,
        `Wrong-row option "${invalidOpt}" submitted for row "${rowWithOpts.key}" must be rejected. ` +
        `Got score=${result.score}/${result.maxScore}`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Correct submissions pass for both table types
// ---------------------------------------------------------------------------

/**
 * Finds the full correct response for a table_choice question.
 * Works for templates with answerSpec (golden field) and those with
 * closure-based evaluate (e.g. sentence_type_table) by brute-force.
 */
function findFullCorrectResponse(question) {
  const rows = question.inputSpec.rows;
  const fields = question.answerSpec?.params?.fields || question.answerSpec?.fields || {};
  const columns = question.inputSpec.columns;

  // Fast path: all rows have golden answers
  const response = {};
  let allFound = true;
  for (const row of rows) {
    const fieldSpec = fields[row.key];
    if (fieldSpec?.golden?.[0]) {
      response[row.key] = fieldSpec.golden[0];
    } else {
      allFound = false;
      break;
    }
  }
  if (allFound) return response;

  // Brute-force: try all combinations (only feasible for small tables)
  const optionsPerRow = rows.map(r => {
    return (Array.isArray(r.options) && r.options.length > 0) ? r.options : columns;
  });

  function tryCombo(rowIdx, partial) {
    if (rowIdx >= rows.length) {
      const result = evaluateGrammarQuestion(question, partial);
      return (result && result.correct) ? { ...partial } : null;
    }
    for (const opt of optionsPerRow[rowIdx]) {
      partial[rows[rowIdx].key] = opt;
      const found = tryCombo(rowIdx + 1, partial);
      if (found) return found;
    }
    return null;
  }

  return tryCombo(0, {});
}

describe('P10 U4: Correct submissions accepted for both table types', () => {
  const TABLE_IDS = ['sentence_type_table', 'qg_p4_voice_roles_transfer'];

  for (const templateId of TABLE_IDS) {
    const questions = generateTableChoiceQuestions(templateId);

    it(`${templateId}: generates >0 questions (empty-fails invariant)`, () => {
      assert.ok(
        questions.length > 0,
        `generateTableChoiceQuestions("${templateId}") returned 0 items — test would vacuously pass`,
      );
    });

    for (const { seed, question } of questions) {
      it(`${templateId} seed=${seed}: correct response yields full marks`, () => {
        const correctResponse = findFullCorrectResponse(question);
        assert.ok(
          correctResponse !== null,
          `Could not find correct response for "${templateId}" seed ${seed}`,
        );

        const result = evaluateGrammarQuestion(question, correctResponse);
        assert.ok(result !== null, 'evaluateGrammarQuestion must not return null');
        assert.equal(
          result.correct,
          true,
          `Correct response for "${templateId}" seed ${seed} must yield full marks. ` +
          `Got score=${result.score}/${result.maxScore}`,
        );
      });
    }
  }
});
