import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GENERATED_TEMPLATE_BANK,
  createPunctuationGeneratedItems,
  createPunctuationRuntimeManifest,
  PRODUCTION_DEPTH,
  CAPACITY_DEPTH,
} from '../shared/punctuation/generators.js';
import {
  PUNCTUATION_CONTENT_MANIFEST,
  createPunctuationContentIndexes,
} from '../shared/punctuation/content.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

const GENERATOR_FAMILY_COUNT = PUNCTUATION_CONTENT_MANIFEST.generatorFamilies.length;
const FIXED_ITEM_COUNT = PUNCTUATION_CONTENT_MANIFEST.items.length;
// P20: families now ship with mixed depths (legacy baseline 100; transfer and
// P20 extension families 120). Compute total honouring per-family caps and the
// actual template bank length so the expectation cannot over-count legacy banks.
const expectedRuntimeItems = (depth) => {
  let total = FIXED_ITEM_COUNT;
  for (const family of PUNCTUATION_CONTENT_MANIFEST.generatorFamilies) {
    const familyLimit = Number.isFinite(family.productionItemsLimit)
      ? family.productionItemsLimit
      : depth;
    const templateCount = GENERATED_TEMPLATE_BANK[family.id]?.length ?? depth;
    total += Math.min(depth, familyLimit, templateCount);
  }
  return total;
};

describe('Punctuation capacity raise mechanism', () => {
  it('exports PRODUCTION_DEPTH = 120 after P20 systematic expansion', () => {
    assert.equal(PRODUCTION_DEPTH, 120);
  });

  it('exports CAPACITY_DEPTH = 120 after P20 systematic expansion', () => {
    assert.equal(CAPACITY_DEPTH, 120);
  });

  it('default production depth produces the current runtime item count', () => {
    const manifest = createPunctuationRuntimeManifest({
      generatedPerFamily: PRODUCTION_DEPTH,
    });
    const indexes = createPunctuationContentIndexes(manifest);
    assert.equal(indexes.items.length, expectedRuntimeItems(PRODUCTION_DEPTH));
  });

  it('depth-6 mode produces the fixed bank plus generated depth-capped items', () => {
    const manifest = createPunctuationRuntimeManifest({
      generatedPerFamily: 6,
    });
    const indexes = createPunctuationContentIndexes(manifest);
    assert.equal(indexes.items.length, expectedRuntimeItems(6));
  });

  it('depth-6 items have no duplicate variant signatures', () => {
    const items = createPunctuationGeneratedItems({ perFamily: 6 });
    const signatures = items.map((item) => item.variantSignature);
    const unique = new Set(signatures);
    assert.equal(
      unique.size,
      signatures.length,
      `Found ${signatures.length - unique.size} duplicate signatures at depth 6`,
    );
  });

  it('depth-6 generated items all pass marking validation', () => {
    const items = createPunctuationGeneratedItems({ perFamily: 6 });
    const failures = [];
    for (const item of items) {
      const answer = item.mode === 'choose'
        ? { choiceIndex: item.correctIndex ?? 0 }
        : { typed: item.accepted?.[0] || item.model };
      const result = markPunctuationAnswer({ item, answer });
      if (!result.correct) {
        failures.push(`${item.id}: ${JSON.stringify(result)}`);
      }
    }
    assert.equal(failures.length, 0, `${failures.length} items failed marking:\n${failures.slice(0, 5).join('\n')}`);
  });

  it('depth parameter overrides perFamily when explicitly provided', () => {
    const items = createPunctuationGeneratedItems({ perFamily: 4, depth: 6 });
    // expectedRuntimeItems(6) - FIXED_ITEM_COUNT = generated total at depth 6
    assert.equal(items.length, expectedRuntimeItems(6) - FIXED_ITEM_COUNT);
  });

  it('depth defaults to perFamily when not specified', () => {
    const items = createPunctuationGeneratedItems({ perFamily: 4 });
    assert.equal(items.length, expectedRuntimeItems(4) - FIXED_ITEM_COUNT);
  });

  it('capacity depth produces the current runtime item count with no signature collisions', () => {
    const manifest = createPunctuationRuntimeManifest({
      generatedPerFamily: CAPACITY_DEPTH,
    });
    const indexes = createPunctuationContentIndexes(manifest);
    assert.equal(indexes.items.length, expectedRuntimeItems(CAPACITY_DEPTH));

    const generated = indexes.items.filter((item) => item.source === 'generated');
    const signatures = generated.map((item) => item.variantSignature);
    const unique = new Set(signatures);
    assert.equal(unique.size, signatures.length, 'Duplicate signatures at capacity depth');
  });
});
