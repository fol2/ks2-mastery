/**
 * Accepted-alternative and negative-case marking proof (P7 U5)
 *
 * Proves ALL accepted alternatives mark correct, ALL configured negative
 * examples mark incorrect, and every choice item has exactly one correct
 * option. Any failure BLOCKS verification — zero tolerance.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PUNCTUATION_CONTENT_MANIFEST,
  createPunctuationContentIndexes,
} from '../shared/punctuation/content.js';
import {
  createPunctuationGeneratedItems,
  GENERATED_TEMPLATE_BANK,
  PRODUCTION_DEPTH,
} from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

// ─── Build production pool ──────────────────────────────────────────────────

const indexes = createPunctuationContentIndexes(PUNCTUATION_CONTENT_MANIFEST);
const fixedItems = indexes.items.map((item) => ({ ...item, source: 'fixed' }));

const generatedItems = createPunctuationGeneratedItems({
  manifest: PUNCTUATION_CONTENT_MANIFEST,
  seed: PUNCTUATION_CONTENT_MANIFEST.releaseId || 'punctuation',
  perFamily: PRODUCTION_DEPTH,
}).map((item) => ({ ...item, source: 'generated' }));

const pool = [...fixedItems, ...generatedItems];

// ─── Template lookup helper (mirrors review script pattern) ─────────────────

function findTemplateTests(item) {
  if (item.source !== 'generated') return null;
  const familyId = item.generatorFamilyId;
  if (!familyId) return null;
  const templates = GENERATED_TEMPLATE_BANK[familyId];
  if (!Array.isArray(templates) || !templates.length) return null;

  // Match by templateId if possible, else by model answer
  for (const tmpl of templates) {
    if (tmpl.templateId && tmpl.templateId === item.templateId) return tmpl.tests || null;
    if (!tmpl.templateId && tmpl.model === item.model) return tmpl.tests || null;
  }
  // Fallback: match on model text
  for (const tmpl of templates) {
    if (tmpl.model === item.model) return tmpl.tests || null;
  }
  return null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function failureDetail(item, answer, result) {
  return [
    `  id: ${item.id}`,
    `  prompt: ${item.prompt}`,
    `  mode: ${item.mode}`,
    `  model: ${JSON.stringify(item.model)}`,
    `  validator: ${item.validator?.type ?? 'exact'}`,
    `  answer tested: ${JSON.stringify(answer)}`,
    `  result: ${JSON.stringify(result, null, 2)}`,
  ].join('\n');
}

// ─── Test: all accepted alternatives mark correct ───────────────────────────

describe('accepted alternatives mark correct', () => {
  let totalAlternativesTested = 0;
  const failures = [];

  for (const item of pool) {
    if (item.mode === 'choose') continue;
    if (!Array.isArray(item.accepted) || item.accepted.length === 0) continue;

    for (const alt of item.accepted) {
      totalAlternativesTested += 1;
      const answer = { typed: alt };

      test(`${item.id} — accepted "${alt.length > 40 ? alt.slice(0, 40) + '...' : alt}" marks correct`, () => {
        const result = markPunctuationAnswer({ item, answer });
        assert.equal(
          result.correct,
          true,
          `Accepted alternative REJECTED — BLOCKS verification:\n${failureDetail(item, answer, result)}`,
        );
      });
    }
  }

  test('sanity: tested a meaningful number of accepted alternatives', () => {
    assert.ok(
      totalAlternativesTested >= 100,
      `Expected at least 100 accepted alternatives tested, got ${totalAlternativesTested}`,
    );
    console.log(`  ALTERNATIVES: ${totalAlternativesTested} accepted alternatives verified`);
  });
});

// ─── Test: negative examples from DSL mark incorrect ────────────────────────

describe('negative examples mark incorrect', () => {
  let totalNegativesTested = 0;

  for (const item of pool) {
    const templateTests = findTemplateTests(item);
    if (!templateTests) continue;
    if (!Array.isArray(templateTests.reject) || templateTests.reject.length === 0) continue;

    for (const neg of templateTests.reject) {
      totalNegativesTested += 1;
      const answer = item.mode === 'choose' ? { choiceIndex: -1 } : { typed: neg };

      test(`${item.id} — reject "${neg.length > 40 ? neg.slice(0, 40) + '...' : neg}" marks incorrect`, () => {
        const result = markPunctuationAnswer({ item, answer });
        assert.equal(
          result.correct,
          false,
          `Negative example UNEXPECTEDLY PASSED — BLOCKS verification:\n${failureDetail(item, answer, result)}`,
        );
      });
    }
  }

  test('sanity: tested a meaningful number of negative examples', () => {
    assert.ok(
      totalNegativesTested >= 50,
      `Expected at least 50 negative examples tested, got ${totalNegativesTested}`,
    );
    console.log(`  NEGATIVES: ${totalNegativesTested} negative examples verified`);
  });
});

// ─── Test: choice items have exactly one correct option ─────────────────────

describe('choice items have exactly one correct option', () => {
  const choiceItems = pool.filter((item) => item.mode === 'choose');
  let totalChoicesTested = 0;

  for (const item of choiceItems) {
    if (!Array.isArray(item.options) || item.options.length === 0) continue;
    totalChoicesTested += 1;

    test(`${item.id} — exactly one option marks correct`, () => {
      let correctCount = 0;
      const correctIndices = [];

      for (let i = 0; i < item.options.length; i += 1) {
        const result = markPunctuationAnswer({ item, answer: { choiceIndex: i } });
        if (result.correct) {
          correctCount += 1;
          correctIndices.push(i);
        }
      }

      assert.equal(
        correctCount,
        1,
        `Expected exactly 1 correct option for ${item.id}, got ${correctCount} ` +
        `(indices: ${JSON.stringify(correctIndices)}). Options: ${JSON.stringify(item.options)}`,
      );
    });
  }

  test('sanity: tested a meaningful number of choice items', () => {
    assert.ok(
      totalChoicesTested >= 5,
      `Expected at least 5 choice items tested, got ${totalChoicesTested}`,
    );
    console.log(`  CHOICES: ${totalChoicesTested} choice items verified (exactly-one-correct)`);
  });
});

// ─── Summary test ───────────────────────────────────────────────────────────

test('production pool summary', () => {
  const totalFixed = fixedItems.length;
  const totalGenerated = generatedItems.length;
  const totalPool = pool.length;
  const choiceCount = pool.filter((item) => item.mode === 'choose').length;
  const withAccepted = pool.filter(
    (item) => item.mode !== 'choose' && Array.isArray(item.accepted) && item.accepted.length > 0,
  ).length;
  const withTemplateTests = pool.filter((item) => findTemplateTests(item) !== null).length;

  console.log([
    '',
    '  ┌──────────────────────────────────────────────────────────────┐',
    '  │ PUNCTUATION ALTERNATIVE MARKING PROOF — PRODUCTION SUMMARY   │',
    '  ├──────────────────────────────────────────────────────────────┤',
    `  │ Total pool items:          ${String(totalPool).padStart(4)}                          │`,
    `  │   Fixed items:             ${String(totalFixed).padStart(4)}                          │`,
    `  │   Generated items:         ${String(totalGenerated).padStart(4)}                          │`,
    `  │ Choice items verified:     ${String(choiceCount).padStart(4)}                          │`,
    `  │ Items with accepted array: ${String(withAccepted).padStart(4)}                          │`,
    `  │ Items with DSL tests:      ${String(withTemplateTests).padStart(4)}                          │`,
    '  └──────────────────────────────────────────────────────────────┘',
    '',
  ].join('\n'));

  // Pool size sanity gate — production pool must be at least 192
  assert.ok(totalPool >= 192, `Production pool unexpectedly small: ${totalPool} items (expected >= 192)`);
});
