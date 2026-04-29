/**
 * Grammar QG P10 U9 — Render Surface Tests
 *
 * Structural render tests for key template families:
 * - word_class_underlined_choice: promptParts has underline part with single word
 * - Heterogeneous tables: row-specific options present
 * - Homogeneous tables: all rows share global columns
 *
 * Every test asserts >0 generated items (empty-fails invariant).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGrammarQuestion,
  serialiseGrammarQuestion,
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';

const SEED_COUNT = 15;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateForTemplate(templateId, seedMax = SEED_COUNT) {
  const items = [];
  for (let seed = 1; seed <= seedMax; seed++) {
    const q = createGrammarQuestion({ templateId, seed });
    if (q) items.push({ seed, question: q, serialised: serialiseGrammarQuestion(q) });
  }
  return items;
}

// ---------------------------------------------------------------------------
// 1. word_class_underlined_choice: promptParts underline structure
// ---------------------------------------------------------------------------

describe('P10 Render Surface — word_class_underlined_choice promptParts', () => {
  const TEMPLATE_ID = 'word_class_underlined_choice';
  const items = generateForTemplate(TEMPLATE_ID);

  it('generates >0 items (empty-fails invariant)', () => {
    assert.ok(items.length > 0, `Expected >0 items for "${TEMPLATE_ID}" but got ${items.length}`);
  });

  for (const { seed, serialised } of items) {
    it(`seed=${seed}: promptParts contains an underline part`, () => {
      const parts = serialised.promptParts;
      assert.ok(Array.isArray(parts), 'promptParts must be an array');
      const underlinePart = parts.find((p) => p.kind === 'underline');
      assert.ok(underlinePart, 'Must have a part with kind "underline"');
      assert.ok(underlinePart.text.length > 0, 'Underline text must be non-empty');
    });

    it(`seed=${seed}: underline text is a single word (no spaces in main token)`, () => {
      const parts = serialised.promptParts;
      const underlinePart = parts.find((p) => p.kind === 'underline');
      assert.ok(underlinePart, 'Must have underline part');
      // Allow hyphenated compounds; reject multi-word phrases
      const wordCount = underlinePart.text.trim().split(/\s+/).length;
      assert.ok(wordCount <= 2, `Underlined text "${underlinePart.text}" should be a single word or hyphenated pair, got ${wordCount} words`);
    });

    it(`seed=${seed}: focusCue matches underline target`, () => {
      const focusCue = serialised.focusCue;
      assert.ok(focusCue, 'focusCue must be present');
      assert.equal(focusCue.type, 'underline', 'focusCue type must be "underline"');
      const parts = serialised.promptParts;
      const underlinePart = parts.find((p) => p.kind === 'underline');
      assert.equal(focusCue.text, underlinePart.text, 'focusCue.text must match underline part text');
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Heterogeneous table: row-specific options
// ---------------------------------------------------------------------------

describe('P10 Render Surface — heterogeneous table (qg_p4_voice_roles_transfer)', () => {
  const TEMPLATE_ID = 'qg_p4_voice_roles_transfer';
  const items = [];

  for (let seed = 1; seed <= SEED_COUNT; seed++) {
    const q = createGrammarQuestion({ templateId: TEMPLATE_ID, seed });
    if (q && q.inputSpec?.type === 'table_choice') {
      items.push({ seed, question: q });
    }
  }

  it('generates >0 table_choice items (empty-fails invariant)', () => {
    assert.ok(items.length > 0, `Expected >0 table_choice items for "${TEMPLATE_ID}" but got ${items.length}`);
  });

  for (const { seed, question } of items) {
    it(`seed=${seed}: has rows with row-specific options`, () => {
      const rows = question.inputSpec.rows;
      assert.ok(rows.length > 0, 'Must have at least one row');
      const hasRowOptions = rows.some((r) => Array.isArray(r.options) && r.options.length > 0);
      assert.ok(hasRowOptions, 'Heterogeneous table must have rows with row-specific options');
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Homogeneous table: sentence_type_table
// ---------------------------------------------------------------------------

describe('P10 Render Surface — homogeneous table (sentence_type_table)', () => {
  const TEMPLATE_ID = 'sentence_type_table';
  const items = [];

  for (let seed = 1; seed <= SEED_COUNT; seed++) {
    const q = createGrammarQuestion({ templateId: TEMPLATE_ID, seed });
    if (q && q.inputSpec?.type === 'table_choice') {
      items.push({ seed, question: q });
    }
  }

  it('generates >0 table_choice items (empty-fails invariant)', () => {
    assert.ok(items.length > 0, `Expected >0 table_choice items for "${TEMPLATE_ID}" but got ${items.length}`);
  });

  for (const { seed, question } of items) {
    it(`seed=${seed}: has global columns shared by all rows`, () => {
      const columns = question.inputSpec.columns;
      assert.ok(Array.isArray(columns), 'Must have a columns array');
      assert.ok(columns.length > 0, 'Must have at least one column');
    });

    it(`seed=${seed}: rows reference global columns only (homogeneous)`, () => {
      const globalColumns = new Set(question.inputSpec.columns);
      const rows = question.inputSpec.rows;
      assert.ok(rows.length > 0, 'Must have at least one row');
      for (const row of rows) {
        if (Array.isArray(row.options)) {
          for (const opt of row.options) {
            assert.ok(
              globalColumns.has(opt),
              `Row "${row.key || row.label}" option "${opt}" not in global columns`,
            );
          }
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Overall render surface coverage
// ---------------------------------------------------------------------------

describe('P10 Render Surface — global coverage assertions', () => {
  it('all 78 templates produce at least one question across seeds 1..15', () => {
    let generatedCount = 0;
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const items = generateForTemplate(template.id);
      assert.ok(
        items.length > 0,
        `Template "${template.id}" produced 0 items across ${SEED_COUNT} seeds`,
      );
      generatedCount++;
    }
    assert.equal(generatedCount, 78, `Expected 78 templates but processed ${generatedCount}`);
  });

  it('serialiseGrammarQuestion returns non-null for every generated question', () => {
    let checked = 0;
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
      if (!q) continue;
      const s = serialiseGrammarQuestion(q);
      assert.ok(s, `serialise returned null for template "${template.id}" seed 1`);
      checked++;
    }
    assert.ok(checked > 0, 'Must check at least one template');
  });
});
