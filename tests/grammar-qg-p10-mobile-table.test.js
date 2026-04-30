/**
 * Grammar QG P10 U9 — Mobile-Width Table Rendering Test
 *
 * Validates that table_choice templates render safely at mobile viewport widths
 * (375px, iPhone SE). Since the project does not have a full Playwright browser
 * harness for grammar sessions, this uses jsdom to verify:
 *
 * 1. The `.grammar-table-wrap` wrapper class is present (which carries
 *    `overflow-x: auto` in styles/app.css, enabling horizontal scroll)
 * 2. No inline `style` attribute on any table element sets a `min-width`
 *    exceeding 390px (which would force clipping on a 375px viewport)
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
const MOBILE_MAX_WIDTH_PX = 390;

after(() => {
  cleanupGrammarRenderHarness();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseHtml(html) {
  const dom = new JSDOM(html);
  return dom.window.document;
}

/**
 * Extract all inline min-width values (in px) from a DOM tree.
 * Returns an array of { element, value } where value is the numeric px amount.
 */
function extractInlineMinWidths(doc) {
  const results = [];
  const allElements = doc.querySelectorAll('[style]');
  for (const el of allElements) {
    const style = el.getAttribute('style') || '';
    const match = style.match(/min-width\s*:\s*(\d+(?:\.\d+)?)\s*px/i);
    if (match) {
      results.push({ element: el.tagName.toLowerCase(), value: parseFloat(match[1]) });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Table templates to verify at mobile width
// ---------------------------------------------------------------------------

const TABLE_TEMPLATES = [
  'qg_p4_voice_roles_transfer',
  'sentence_type_table',
];

for (const templateId of TABLE_TEMPLATES) {
  describe(`P10 Mobile Table — ${templateId}`, () => {
    const items = [];

    for (let seed = 1; seed <= SEED_COUNT; seed++) {
      const q = createGrammarQuestion({ templateId, seed });
      if (q && q.inputSpec?.type === 'table_choice') {
        items.push({ seed, question: q, serialised: serialiseGrammarQuestion(q) });
      }
    }

    it('generates >0 table_choice items (empty-fails invariant)', () => {
      assert.ok(
        items.length > 0,
        `Expected >0 table_choice items for "${templateId}" but got ${items.length}`,
      );
    });

    for (const { seed, serialised } of items) {
      it(`seed=${seed}: rendered HTML includes .grammar-table-wrap class`, () => {
        const html = renderGrammarItem(serialised);
        const doc = parseHtml(html);
        const wrapper = doc.querySelector('.grammar-table-wrap');
        assert.ok(
          wrapper,
          `Expected .grammar-table-wrap element in rendered output for "${templateId}" seed=${seed}`,
        );
      });

      it(`seed=${seed}: no inline min-width exceeds ${MOBILE_MAX_WIDTH_PX}px`, () => {
        const html = renderGrammarItem(serialised);
        const doc = parseHtml(html);
        const minWidths = extractInlineMinWidths(doc);
        const oversized = minWidths.filter((mw) => mw.value > MOBILE_MAX_WIDTH_PX);
        assert.equal(
          oversized.length,
          0,
          `Found ${oversized.length} element(s) with inline min-width > ${MOBILE_MAX_WIDTH_PX}px: ` +
          oversized.map((o) => `<${o.element}> min-width:${o.value}px`).join(', '),
        );
      });
    }
  });
}
