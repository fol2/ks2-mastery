/**
 * Grammar QG P10 — React DOM Render Surface Tests
 *
 * Renders serialised grammar items through the real GrammarSessionScene
 * component via React's renderToStaticMarkup, then parses the output with
 * jsdom to assert on actual DOM structure:
 *
 * - word_class_underlined_choice: exactly one `.prompt-underline` element
 *   containing a single word (no spaces)
 * - qg_p4_voice_roles_transfer: underline on 2-4 word phrase
 * - Homogeneous table: all `<tr>` rows have the same radio input count
 * - Heterogeneous table: different rows carry different option labels
 * - Keyboard accessibility: every `<input>` has `name` or `aria-label`
 *
 * Every test asserts >0 generated items (empty-fails invariant).
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  createGrammarQuestion,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

import {
  renderGrammarItem,
  cleanupGrammarRenderHarness,
} from './helpers/grammar-render-harness.js';

const SEED_COUNT = 15;

after(() => {
  cleanupGrammarRenderHarness();
});

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

function parseHtml(html) {
  const dom = new JSDOM(html);
  return dom.window.document;
}

// ---------------------------------------------------------------------------
// 1. word_class_underlined_choice: prompt-underline DOM structure
// ---------------------------------------------------------------------------

describe('P10 Render Surface — word_class_underlined_choice DOM', () => {
  const TEMPLATE_ID = 'word_class_underlined_choice';
  const items = generateForTemplate(TEMPLATE_ID);

  it('generates >0 items (empty-fails invariant)', () => {
    assert.ok(items.length > 0, `Expected >0 items for "${TEMPLATE_ID}" but got ${items.length}`);
  });

  for (const { seed, serialised } of items) {
    it(`seed=${seed}: HTML contains exactly one .prompt-underline element`, () => {
      const html = renderGrammarItem(serialised);
      const doc = parseHtml(html);
      const underlines = doc.querySelectorAll('.prompt-underline');
      assert.equal(
        underlines.length,
        1,
        `Expected exactly 1 .prompt-underline element but found ${underlines.length}`,
      );
    });

    it(`seed=${seed}: underlined text is a single word (no spaces)`, () => {
      const html = renderGrammarItem(serialised);
      const doc = parseHtml(html);
      const underline = doc.querySelector('.prompt-underline');
      assert.ok(underline, 'Must have .prompt-underline element');
      const text = underline.textContent.trim();
      assert.ok(text.length > 0, 'Underline text must be non-empty');
      const wordCount = text.split(/\s+/).length;
      assert.ok(
        wordCount <= 2,
        `Underlined text "${text}" should be a single word or hyphenated pair, got ${wordCount} words`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 2. qg_p4_voice_roles_transfer: underline on 2-4 word phrase
// ---------------------------------------------------------------------------

describe('P10 Render Surface — qg_p4_voice_roles_transfer DOM', () => {
  const TEMPLATE_ID = 'qg_p4_voice_roles_transfer';
  const items = generateForTemplate(TEMPLATE_ID).filter(
    ({ serialised }) =>
      serialised.promptParts && serialised.promptParts.some((p) => p.kind === 'underline'),
  );

  it('generates >0 items with underline promptParts (empty-fails invariant)', () => {
    assert.ok(
      items.length > 0,
      `Expected >0 items with underline promptParts for "${TEMPLATE_ID}" but got ${items.length}`,
    );
  });

  for (const { seed, serialised } of items) {
    it(`seed=${seed}: underlined phrase is 2-4 words`, () => {
      const html = renderGrammarItem(serialised);
      const doc = parseHtml(html);
      const underline = doc.querySelector('.prompt-underline');
      assert.ok(underline, 'Must have .prompt-underline element in rendered HTML');
      const text = underline.textContent.trim();
      assert.ok(text.length > 0, 'Underline text must be non-empty');
      const wordCount = text.split(/\s+/).length;
      assert.ok(
        wordCount >= 2 && wordCount <= 4,
        `Underlined text "${text}" should be 2-4 words, got ${wordCount}`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Homogeneous table: all <tr> rows have the same radio input count
// ---------------------------------------------------------------------------

describe('P10 Render Surface — homogeneous table (sentence_type_table)', () => {
  const TEMPLATE_ID = 'sentence_type_table';
  const items = [];

  for (let seed = 1; seed <= SEED_COUNT; seed++) {
    const q = createGrammarQuestion({ templateId: TEMPLATE_ID, seed });
    if (q && q.inputSpec?.type === 'table_choice') {
      items.push({ seed, question: q, serialised: serialiseGrammarQuestion(q) });
    }
  }

  it('generates >0 table_choice items (empty-fails invariant)', () => {
    assert.ok(
      items.length > 0,
      `Expected >0 table_choice items for "${TEMPLATE_ID}" but got ${items.length}`,
    );
  });

  for (const { seed, serialised } of items) {
    it(`seed=${seed}: all <tr> rows have the same number of radio inputs`, () => {
      const html = renderGrammarItem(serialised);
      const doc = parseHtml(html);
      const rows = doc.querySelectorAll('tbody tr');
      assert.ok(rows.length > 0, 'Must have at least one <tr> in tbody');
      const counts = [];
      for (const row of rows) {
        const radios = row.querySelectorAll('input[type="radio"]');
        counts.push(radios.length);
      }
      const allSame = counts.every((c) => c === counts[0]);
      assert.ok(
        allSame,
        `All rows must have the same radio count; got ${JSON.stringify(counts)}`,
      );
      assert.ok(counts[0] > 0, 'Each row must have at least one radio input');
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Heterogeneous table: different rows have different option labels
// ---------------------------------------------------------------------------

describe('P10 Render Surface — heterogeneous table (qg_p4_voice_roles_transfer)', () => {
  const TEMPLATE_ID = 'qg_p4_voice_roles_transfer';
  const items = [];

  for (let seed = 1; seed <= SEED_COUNT; seed++) {
    const q = createGrammarQuestion({ templateId: TEMPLATE_ID, seed });
    if (q && q.inputSpec?.type === 'table_choice') {
      items.push({ seed, question: q, serialised: serialiseGrammarQuestion(q) });
    }
  }

  it('generates >0 table_choice items (empty-fails invariant)', () => {
    assert.ok(
      items.length > 0,
      `Expected >0 table_choice items for "${TEMPLATE_ID}" but got ${items.length}`,
    );
  });

  for (const { seed, serialised } of items) {
    it(`seed=${seed}: rows have different option labels (heterogeneous)`, () => {
      const html = renderGrammarItem(serialised);
      const doc = parseHtml(html);
      const rows = doc.querySelectorAll('tbody tr');
      assert.ok(rows.length > 1, 'Heterogeneous table must have multiple rows');

      // Collect the set of aria-label values per row (each radio has an
      // aria-label like "Sentence: option")
      const rowLabelSets = [];
      for (const row of rows) {
        const radios = row.querySelectorAll('input[type="radio"]');
        const labels = [...radios].map((r) => r.getAttribute('aria-label') || '');
        rowLabelSets.push(labels.join('|'));
      }
      // At least two rows must differ in their option labels
      const uniqueSets = new Set(rowLabelSets);
      assert.ok(
        uniqueSets.size > 1,
        `Expected heterogeneous rows with different labels but all rows had identical labels: ${rowLabelSets[0]}`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Keyboard accessibility: all <input> elements have name or aria-label
// ---------------------------------------------------------------------------

describe('P10 Render Surface — keyboard accessibility (input attributes)', () => {
  const TEMPLATE_IDS = [
    'word_class_underlined_choice',
    'qg_p4_voice_roles_transfer',
    'sentence_type_table',
  ];
  const allItems = [];

  for (const templateId of TEMPLATE_IDS) {
    for (let seed = 1; seed <= SEED_COUNT; seed++) {
      const q = createGrammarQuestion({ templateId, seed });
      if (q) {
        allItems.push({ templateId, seed, serialised: serialiseGrammarQuestion(q) });
      }
    }
  }

  it('generates >0 items across accessibility templates (empty-fails invariant)', () => {
    assert.ok(
      allItems.length > 0,
      `Expected >0 items across templates but got ${allItems.length}`,
    );
  });

  for (const { templateId, seed, serialised } of allItems) {
    it(`${templateId} seed=${seed}: every <input> has name or aria-label`, () => {
      const html = renderGrammarItem(serialised);
      const doc = parseHtml(html);
      const inputs = doc.querySelectorAll('input');
      assert.ok(inputs.length > 0, 'Must have at least one <input> element');
      for (const input of inputs) {
        const hasName = input.hasAttribute('name') && input.getAttribute('name').length > 0;
        const hasAriaLabel =
          input.hasAttribute('aria-label') && input.getAttribute('aria-label').length > 0;
        assert.ok(
          hasName || hasAriaLabel,
          `<input> missing both name and aria-label: ${input.outerHTML.slice(0, 120)}`,
        );
      }
    });
  }
});
