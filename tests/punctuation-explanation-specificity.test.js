/**
 * Explanation specificity tests for punctuation DSL templates.
 *
 * Ensures every generated item carries a rule-specific explanation rather than
 * the generic fallback, and that explanations are child-readable without
 * internal identifiers leaking through.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createPunctuationGeneratedItems } from '../shared/punctuation/generators.js';

const GENERIC_FALLBACK = 'This generated item practises the same published punctuation skill.';

// Internal identifier patterns that must never appear in child-facing explanations
const INTERNAL_PATTERNS = [
  /dsl_/i,
  /gen_/i,
  /v\d+$/,
  /familyId/i,
  /templateId/i,
  /validator/i,
  /misconceptionTag/i,
  /clusterId/i,
  /rewardUnitId/i,
  /requiresTokens/i,
  /requiresBoundary/i,
  /requiresParenthetical/i,
  /requiresColonBeforeList/i,
  /requiresHyphenatedPhrase/i,
  /requiresBulletStemAndItems/i,
  /requiresApostropheForms/i,
  /startsWithPhraseComma/i,
  /combineColonList/i,
  /combineBoundaryBetweenClauses/i,
  /combineFrontedAdverbial/i,
  /combineParentheticalPhrase/i,
  /combineListSentence/i,
  /paragraphRepair/i,
  /speechWithWords/i,
  /requiresSemicolonList/i,
  /requiresListCommas/i,
];

/** Generate items at a given depth and return them. */
function generateAtDepth(depth) {
  return createPunctuationGeneratedItems({ depth });
}

test('explanation specificity: no item uses the generic fallback at depth 4', () => {
  const items = generateAtDepth(4);
  assert.ok(items.length > 0, 'depth 4 must produce items');
  for (const item of items) {
    assert.notStrictEqual(
      item.explanation,
      GENERIC_FALLBACK,
      `Item ${item.id} (family: ${item.generatorFamilyId}) still has the generic fallback explanation`,
    );
  }
});

test('explanation specificity: no item uses the generic fallback at depth 6', () => {
  const items = generateAtDepth(6);
  assert.ok(items.length > 0, 'depth 6 must produce items');
  for (const item of items) {
    assert.notStrictEqual(
      item.explanation,
      GENERIC_FALLBACK,
      `Item ${item.id} (family: ${item.generatorFamilyId}) still has the generic fallback explanation`,
    );
  }
});

test('explanation specificity: no item uses the generic fallback at depth 8', () => {
  const items = generateAtDepth(8);
  assert.ok(items.length > 0, 'depth 8 must produce items');
  for (const item of items) {
    assert.notStrictEqual(
      item.explanation,
      GENERIC_FALLBACK,
      `Item ${item.id} (family: ${item.generatorFamilyId}) still has the generic fallback explanation`,
    );
  }
});

test('explanation length: all explanations are between 10 and 150 characters', () => {
  const items = generateAtDepth(8);
  for (const item of items) {
    const len = item.explanation.length;
    assert.ok(
      len >= 10 && len <= 150,
      `Item ${item.id} explanation length ${len} is outside 10-150 range: "${item.explanation}"`,
    );
  }
});

test('explanation content: no internal IDs or validator names leak into explanations', () => {
  const items = generateAtDepth(8);
  for (const item of items) {
    for (const pattern of INTERNAL_PATTERNS) {
      assert.ok(
        !pattern.test(item.explanation),
        `Item ${item.id} explanation matches forbidden pattern ${pattern}: "${item.explanation}"`,
      );
    }
  }
});

test('explanation coverage: every generator family produces a specific explanation', () => {
  const items = generateAtDepth(8);
  const familyExplanations = new Map();
  for (const item of items) {
    if (!familyExplanations.has(item.generatorFamilyId)) {
      familyExplanations.set(item.generatorFamilyId, new Set());
    }
    familyExplanations.get(item.generatorFamilyId).add(item.explanation);
  }
  for (const [familyId, explanations] of familyExplanations) {
    assert.ok(
      !explanations.has(GENERIC_FALLBACK),
      `Family ${familyId} still contains the generic fallback explanation`,
    );
    for (const exp of explanations) {
      assert.ok(
        exp.length >= 10,
        `Family ${familyId} has a too-short explanation: "${exp}"`,
      );
    }
  }
});
