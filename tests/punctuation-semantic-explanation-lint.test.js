/**
 * Semantic explanation lint tests for punctuation DSL templates (P7-U6).
 *
 * Verifies that each generated explanation is semantically matched to its
 * rule family via explanationRuleId, not just "not generic".
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createPunctuationGeneratedItems } from '../shared/punctuation/generators.js';
import { lintExplanation, lintExplanationBatch } from '../shared/punctuation/explanation-lint.js';

const GENERIC_FALLBACK = 'This generated item practises the same published punctuation skill.';

/** Generate items at a given depth and return them. */
function generateAtDepth(depth) {
  return createPunctuationGeneratedItems({ depth });
}

// ─── explanationRuleId presence ───────────────────────────────────────────────

test('semantic lint: every generated item at depth 4 has explanationRuleId', () => {
  const items = generateAtDepth(4);
  assert.ok(items.length > 0, 'depth 4 must produce items');
  for (const item of items) {
    assert.ok(
      typeof item.explanationRuleId === 'string' && item.explanationRuleId.length > 0,
      `Item ${item.id} (family: ${item.generatorFamilyId}) is missing explanationRuleId`,
    );
  }
});

test('semantic lint: every generated item at depth 6 has explanationRuleId', () => {
  const items = generateAtDepth(6);
  assert.ok(items.length > 0, 'depth 6 must produce items');
  for (const item of items) {
    assert.ok(
      typeof item.explanationRuleId === 'string' && item.explanationRuleId.length > 0,
      `Item ${item.id} (family: ${item.generatorFamilyId}) is missing explanationRuleId`,
    );
  }
});

test('semantic lint: every generated item at depth 8 has explanationRuleId', () => {
  const items = generateAtDepth(8);
  assert.ok(items.length > 0, 'depth 8 must produce items');
  for (const item of items) {
    assert.ok(
      typeof item.explanationRuleId === 'string' && item.explanationRuleId.length > 0,
      `Item ${item.id} (family: ${item.generatorFamilyId}) is missing explanationRuleId`,
    );
  }
});

// ─── Semantic lint pass at all depths ─────────────────────────────────────────

test('semantic lint: all families pass lint at depth 4', () => {
  const items = generateAtDepth(4);
  const { allPass, results } = lintExplanationBatch(items);
  const failures = results.filter((r) => !r.pass);
  assert.ok(
    allPass,
    `${failures.length} item(s) failed semantic lint at depth 4:\n` +
    failures.map((f) => `  ${f.id}: ${f.violations.join('; ')}`).join('\n'),
  );
});

test('semantic lint: all families pass lint at depth 6', () => {
  const items = generateAtDepth(6);
  const { allPass, results } = lintExplanationBatch(items);
  const failures = results.filter((r) => !r.pass);
  assert.ok(
    allPass,
    `${failures.length} item(s) failed semantic lint at depth 6:\n` +
    failures.map((f) => `  ${f.id}: ${f.violations.join('; ')}`).join('\n'),
  );
});

test('semantic lint: all families pass lint at depth 8', () => {
  const items = generateAtDepth(8);
  const { allPass, results } = lintExplanationBatch(items);
  const failures = results.filter((r) => !r.pass);
  assert.ok(
    allPass,
    `${failures.length} item(s) failed semantic lint at depth 8:\n` +
    failures.map((f) => `  ${f.id}: ${f.violations.join('; ')}`).join('\n'),
  );
});

// ─── Generic fallback still blocked ──────────────────────────────────────────

test('semantic lint: generic fallback blocked at depth 4', () => {
  const items = generateAtDepth(4);
  for (const item of items) {
    assert.notStrictEqual(
      item.explanation,
      GENERIC_FALLBACK,
      `Item ${item.id} uses the generic fallback`,
    );
  }
});

test('semantic lint: generic fallback blocked at depth 6', () => {
  const items = generateAtDepth(6);
  for (const item of items) {
    assert.notStrictEqual(
      item.explanation,
      GENERIC_FALLBACK,
      `Item ${item.id} uses the generic fallback`,
    );
  }
});

test('semantic lint: generic fallback blocked at depth 8', () => {
  const items = generateAtDepth(8);
  for (const item of items) {
    assert.notStrictEqual(
      item.explanation,
      GENERIC_FALLBACK,
      `Item ${item.id} uses the generic fallback`,
    );
  }
});

// ─── Negative tests: wrong explanation fails lint ─────────────────────────────

test('semantic lint: deliberately wrong explanation fails', () => {
  // A speech rule with no mention of speech marks / inverted commas
  const result = lintExplanation(
    'A comma separates two clauses.',
    'speech.inverted-comma-enclosure',
  );
  assert.strictEqual(result.pass, false, 'Wrong explanation should fail lint');
  assert.ok(result.violations.length > 0);
});

test('semantic lint: explanation contradicting rule category fails', () => {
  // Semicolon rule with no mention of semicolons or related concepts
  const result = lintExplanation(
    'Use a comma to join these two sentences together.',
    'semicolon.independent-clauses',
  );
  assert.strictEqual(result.pass, false, 'Contradicting explanation should fail lint');
  assert.ok(result.violations.length > 0);
});

test('semantic lint: colon rule without introducing concept fails', () => {
  const result = lintExplanation(
    'A colon is a punctuation mark.',
    'colon.complete-introduction',
  );
  assert.strictEqual(result.pass, false, 'Colon without "introduces"/"complete" should fail');
  assert.ok(result.violations.length > 0);
});

test('semantic lint: bullet rule without consistency concept fails', () => {
  const result = lintExplanation(
    'Use capital letters at the start of each line.',
    'bullet.stem-consistency',
  );
  assert.strictEqual(result.pass, false, 'Bullet without consistency keyword should fail');
  assert.ok(result.violations.length > 0);
});

// ─── Correct explanations pass lint ──────────────────────────────────────────

test('semantic lint: correct speech explanation passes', () => {
  const result = lintExplanation(
    'Inverted commas wrap the spoken words, and the end punctuation stays inside the closing speech mark.',
    'speech.inverted-comma-enclosure',
  );
  assert.strictEqual(result.pass, true);
  assert.deepStrictEqual(result.violations, []);
});

test('semantic lint: correct semicolon explanation passes', () => {
  const result = lintExplanation(
    'A semicolon joins two complete sentences that are closely related in meaning.',
    'semicolon.independent-clauses',
  );
  assert.strictEqual(result.pass, true);
  assert.deepStrictEqual(result.violations, []);
});

test('semantic lint: correct colon explanation passes', () => {
  const result = lintExplanation(
    'A colon introduces the list after a complete sentence that sets it up.',
    'colon.complete-introduction',
  );
  assert.strictEqual(result.pass, true);
  assert.deepStrictEqual(result.violations, []);
});

test('semantic lint: correct bullet explanation passes', () => {
  const result = lintExplanation(
    'Every bullet in a list must follow the same punctuation pattern so the reader knows the list is consistent.',
    'bullet.stem-consistency',
  );
  assert.strictEqual(result.pass, true);
  assert.deepStrictEqual(result.violations, []);
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

test('semantic lint: missing ruleId fails', () => {
  const result = lintExplanation('Some explanation.', '');
  assert.strictEqual(result.pass, false);
});

test('semantic lint: empty explanation fails', () => {
  const result = lintExplanation('', 'speech.inverted-comma-enclosure');
  assert.strictEqual(result.pass, false);
});

test('semantic lint: unknown ruleId passes gracefully', () => {
  const result = lintExplanation('Any text at all.', 'future.unknown-rule');
  assert.strictEqual(result.pass, true, 'Unknown rules should pass to allow extension');
});
