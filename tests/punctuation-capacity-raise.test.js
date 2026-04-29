import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
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

describe('Punctuation capacity raise mechanism', () => {
  it('exports PRODUCTION_DEPTH = 4', () => {
    assert.equal(PRODUCTION_DEPTH, 4);
  });

  it('exports CAPACITY_DEPTH = 8', () => {
    assert.equal(CAPACITY_DEPTH, 8);
  });

  it('default production depth produces 192 runtime items', () => {
    const manifest = createPunctuationRuntimeManifest({
      generatedPerFamily: PRODUCTION_DEPTH,
    });
    const indexes = createPunctuationContentIndexes(manifest);
    assert.equal(indexes.items.length, 192);
  });

  it('depth-6 mode produces 242 runtime items', () => {
    const manifest = createPunctuationRuntimeManifest({
      generatedPerFamily: 6,
    });
    const indexes = createPunctuationContentIndexes(manifest);
    assert.equal(indexes.items.length, 242);
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
    // 25 families * 6 = 150 generated items
    assert.equal(items.length, 150);
  });

  it('depth defaults to perFamily when not specified', () => {
    const items = createPunctuationGeneratedItems({ perFamily: 4 });
    // 25 families * 4 = 100 generated items
    assert.equal(items.length, 100);
  });

  it('capacity depth 8 produces 292 runtime items with no signature collisions', () => {
    const manifest = createPunctuationRuntimeManifest({
      generatedPerFamily: CAPACITY_DEPTH,
    });
    const indexes = createPunctuationContentIndexes(manifest);
    assert.equal(indexes.items.length, 292);

    const generated = indexes.items.filter((item) => item.source === 'generated');
    const signatures = generated.map((item) => item.variantSignature);
    const unique = new Set(signatures);
    assert.equal(unique.size, signatures.length, 'Duplicate signatures at capacity depth 8');
  });
});
