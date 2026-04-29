/**
 * Comprehensive explanation quality audit for punctuation items (P8-U7).
 *
 * Covers ALL fixed and generated items across production depths.
 * Verifies: no internal IDs, no mandatory claims for flexible policies,
 * rule-specific, child-readable, and helpful after incorrect answers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_CONTENT_MANIFEST, PUNCTUATION_ITEMS } from '../shared/punctuation/content.js';
import { createPunctuationGeneratedItems } from '../shared/punctuation/generators.js';
import { lintExplanation, lintExplanationBatch } from '../shared/punctuation/explanation-lint.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Patterns that indicate leaked internal IDs (validator.type names, dotted paths). */
const INTERNAL_ID_PATTERNS = [
  /\bvalidator\b/i,
  /\brubric\b/i,
  /\b(requiresListCommas|requiresTokens|combineListSentence|startsWithWordQuestion|startsWithPhraseComma|requiresHyphenatedPhrase|speechWithWords|frontedAdverbialWithSpeech)\b/,
  /\b[a-z]+\.[a-z_]+_[a-z_]+\b/,  // dotted paths like 'speech.reporting_comma_missing'
  /\bclusterId\b/i,
  /\bskillIds?\b/i,
  /\brewardUnitId\b/i,
  /\bgeneratorFamilyId\b/i,
  /\bmisconceptionTags?\b/i,
  /\breadiness\b/i,
];

/** Code/variable name patterns. */
const CODE_CONCEPT_PATTERNS = [
  /\b(const|let|var|function|return|import|export|null|undefined|true|false)\b/,
  /\b[a-z]+[A-Z][a-zA-Z]*(Id|Key|Tag|Index)\b/,  // camelCase identifiers
  /\b(array|object|string|boolean|number)\b/i,
  /[{}[\]]/,  // braces/brackets (not in apostrophe contexts)
];

/** Pattern for "The correct answer is..." openers (unhelpful restatement). */
const RESTATEMENT_OPENERS = [
  /^The correct answer is/i,
  /^The right answer is/i,
  /^The answer is/i,
  /^Answer:/i,
];

function generateAtDepth(depth) {
  return createPunctuationGeneratedItems({ depth });
}

// ─── Fixed bank: non-empty explanations ──────────────────────────────────────

test('fixed bank: every item has a non-empty explanation', () => {
  assert.ok(PUNCTUATION_ITEMS.length >= 92, `Expected ≥92 fixed items, got ${PUNCTUATION_ITEMS.length}`);
  const missing = PUNCTUATION_ITEMS.filter(
    (item) => !item.explanation || typeof item.explanation !== 'string' || item.explanation.trim().length === 0,
  );
  assert.strictEqual(
    missing.length,
    0,
    `${missing.length} fixed item(s) missing explanation:\n${missing.map((i) => `  ${i.id}`).join('\n')}`,
  );
});

// ─── Fixed bank: no internal IDs ─────────────────────────────────────────────

test('fixed bank: no explanation contains internal IDs', () => {
  const failures = [];
  for (const item of PUNCTUATION_ITEMS) {
    for (const pattern of INTERNAL_ID_PATTERNS) {
      if (pattern.test(item.explanation)) {
        failures.push(`  ${item.id}: matches ${pattern}`);
        break;
      }
    }
  }
  assert.strictEqual(
    failures.length,
    0,
    `${failures.length} fixed item(s) leak internal IDs:\n${failures.join('\n')}`,
  );
});

// ─── Fixed bank: no code concepts ────────────────────────────────────────────

test('fixed bank: no explanation references code concepts', () => {
  const failures = [];
  for (const item of PUNCTUATION_ITEMS) {
    for (const pattern of CODE_CONCEPT_PATTERNS) {
      // Skip brace check for items with apostrophes in explanations (e.g. "didn't")
      if (pattern.source.includes('[{}') && /[''']/.test(item.explanation)) continue;
      if (pattern.test(item.explanation)) {
        failures.push(`  ${item.id}: matches ${pattern}`);
        break;
      }
    }
  }
  assert.strictEqual(
    failures.length,
    0,
    `${failures.length} fixed item(s) reference code concepts:\n${failures.join('\n')}`,
  );
});

// ─── Generated items: lint pass at all depths ────────────────────────────────

test('generated items: all pass semantic lint at depth 4', () => {
  const items = generateAtDepth(4);
  assert.ok(items.length > 0, 'depth 4 must produce items');
  const { allPass, results } = lintExplanationBatch(items);
  const failures = results.filter((r) => !r.pass);
  assert.ok(
    allPass,
    `${failures.length} item(s) failed lint at depth 4:\n` +
    failures.map((f) => `  ${f.id}: ${f.violations.join('; ')}`).join('\n'),
  );
});

test('generated items: all pass semantic lint at depth 6', () => {
  const items = generateAtDepth(6);
  assert.ok(items.length > 0, 'depth 6 must produce items');
  const { allPass, results } = lintExplanationBatch(items);
  const failures = results.filter((r) => !r.pass);
  assert.ok(
    allPass,
    `${failures.length} item(s) failed lint at depth 6:\n` +
    failures.map((f) => `  ${f.id}: ${f.violations.join('; ')}`).join('\n'),
  );
});

test('generated items: all pass semantic lint at depth 8', () => {
  const items = generateAtDepth(8);
  assert.ok(items.length > 0, 'depth 8 must produce items');
  const { allPass, results } = lintExplanationBatch(items);
  const failures = results.filter((r) => !r.pass);
  assert.ok(
    allPass,
    `${failures.length} item(s) failed lint at depth 8:\n` +
    failures.map((f) => `  ${f.id}: ${f.violations.join('; ')}`).join('\n'),
  );
});

// ─── Generated items: no internal IDs ────────────────────────────────────────

test('generated items: no explanation contains internal IDs (depth 4)', () => {
  const items = generateAtDepth(4);
  const failures = [];
  for (const item of items) {
    for (const pattern of INTERNAL_ID_PATTERNS) {
      if (pattern.test(item.explanation)) {
        failures.push(`  ${item.id}: matches ${pattern}`);
        break;
      }
    }
  }
  assert.strictEqual(
    failures.length,
    0,
    `${failures.length} generated item(s) leak internal IDs:\n${failures.join('\n')}`,
  );
});

test('generated items: no explanation contains internal IDs (depth 8)', () => {
  const items = generateAtDepth(8);
  const failures = [];
  for (const item of items) {
    for (const pattern of INTERNAL_ID_PATTERNS) {
      if (pattern.test(item.explanation)) {
        failures.push(`  ${item.id}: matches ${pattern}`);
        break;
      }
    }
  }
  assert.strictEqual(
    failures.length,
    0,
    `${failures.length} generated item(s) leak internal IDs:\n${failures.join('\n')}`,
  );
});

// ─── Oxford comma: flexible policy must not be claimed as mandatory ──────────

test('fixed bank: Oxford comma flexible items do not claim mandatory comma', () => {
  const listCommaItems = PUNCTUATION_ITEMS.filter(
    (item) => item.skillIds?.includes('list_commas'),
  );
  assert.ok(listCommaItems.length > 0, 'must have list comma items');

  const failures = [];
  for (const item of listCommaItems) {
    const validator = item.validator || {};
    // If allowFinalComma is not explicitly false, the Oxford comma is flexible
    if (validator.allowFinalComma !== false) {
      const explanation = item.explanation.toLowerCase();
      if (
        explanation.includes('you must use a comma before') ||
        explanation.includes('you must put a comma before') ||
        explanation.includes('always need a comma before and') ||
        explanation.includes('always put a comma before and')
      ) {
        failures.push(`  ${item.id}: claims Oxford comma mandatory when policy is flexible`);
      }
    }
  }
  assert.strictEqual(
    failures.length,
    0,
    `${failures.length} item(s) claim Oxford comma is mandatory:\n${failures.join('\n')}`,
  );
});

// ─── Reporting position: flexible items must not insist on one position ──────

test('fixed bank: speech items with reportingPosition any do not insist on one', () => {
  const speechItems = PUNCTUATION_ITEMS.filter(
    (item) => item.rubric?.reportingPosition === 'any',
  );
  assert.ok(speechItems.length > 0, 'must have speech items with reportingPosition any');

  const failures = [];
  for (const item of speechItems) {
    const explanation = item.explanation.toLowerCase();
    if (
      explanation.includes('you must put the reporting clause before') ||
      explanation.includes('you must put the reporting clause after') ||
      explanation.includes('the reporting clause must come before') ||
      explanation.includes('the reporting clause must come after')
    ) {
      failures.push(`  ${item.id}: insists on position when policy is 'any'`);
    }
  }
  assert.strictEqual(
    failures.length,
    0,
    `${failures.length} item(s) insist on one reporting position:\n${failures.join('\n')}`,
  );
});

// ─── Possession: explanations distinguish singular vs plural ─────────────────

test('fixed bank: possession explanations align with singular vs plural', () => {
  const possessionItems = PUNCTUATION_ITEMS.filter(
    (item) => item.skillIds?.includes('apostrophe_possession'),
  );
  assert.ok(possessionItems.length > 0, 'must have possession items');

  const failures = [];
  for (const item of possessionItems) {
    const explanation = item.explanation.toLowerCase();
    const model = (item.model || '').toLowerCase();

    // If the model clearly has plural possession (s'), check explanation doesn't say singular
    if (model.includes("s' ") || model.includes("s'.")) {
      if (
        explanation.includes('the apostrophe goes before the s') &&
        !explanation.includes('after the s') &&
        !explanation.includes("more than one") &&
        !explanation.includes('plural') &&
        !explanation.includes("teachers'") &&
        !explanation.includes("children's")
      ) {
        // Only flag if the explanation ONLY talks about before-s (singular) for a plural item
        // Skip items that mention both singular and plural
        if (!explanation.includes('irregular') && !explanation.includes('both')) {
          failures.push(`  ${item.id}: uses singular explanation for plural possession`);
        }
      }
    }
  }
  assert.strictEqual(
    failures.length,
    0,
    `${failures.length} item(s) have mismatched possession explanations:\n${failures.join('\n')}`,
  );
});

// ─── Explanations help after incorrect answer ────────────────────────────────

test('fixed bank: no explanation starts with "The correct answer is..."', () => {
  const failures = [];
  for (const item of PUNCTUATION_ITEMS) {
    for (const pattern of RESTATEMENT_OPENERS) {
      if (pattern.test(item.explanation)) {
        failures.push(`  ${item.id}: starts with restatement (${item.explanation.slice(0, 40)}...)`);
        break;
      }
    }
  }
  assert.strictEqual(
    failures.length,
    0,
    `${failures.length} fixed item(s) merely restate the answer:\n${failures.join('\n')}`,
  );
});

test('generated items: no explanation starts with "The correct answer is..." (depth 4)', () => {
  const items = generateAtDepth(4);
  const failures = [];
  for (const item of items) {
    for (const pattern of RESTATEMENT_OPENERS) {
      if (pattern.test(item.explanation)) {
        failures.push(`  ${item.id}: starts with restatement`);
        break;
      }
    }
  }
  assert.strictEqual(
    failures.length,
    0,
    `${failures.length} generated item(s) merely restate the answer:\n${failures.join('\n')}`,
  );
});

// ─── Explanations reference the rule ─────────────────────────────────────────

test('fixed bank: explanations reference the punctuation rule (not just the model)', () => {
  // At minimum, each explanation should contain a punctuation term
  const PUNCTUATION_TERMS = [
    'comma', 'apostrophe', 'capital', 'letter', 'full stop', 'question mark',
    'exclamation mark', 'inverted comma', 'speech mark', 'speech', 'colon',
    'semicolon', 'semi-colon', 'dash', 'hyphen', 'bracket', 'parenthesis',
    'bullet', 'punctuation', 'contraction', 'possession', 'end mark',
    'mark', 'sentence', 'clause', 'phrase', 'opening',
  ];

  const failures = [];
  for (const item of PUNCTUATION_ITEMS) {
    const lower = item.explanation.toLowerCase();
    const hasTerm = PUNCTUATION_TERMS.some((term) => lower.includes(term));
    if (!hasTerm) {
      failures.push(`  ${item.id}: "${item.explanation.slice(0, 60)}..." — no punctuation rule term`);
    }
  }
  assert.strictEqual(
    failures.length,
    0,
    `${failures.length} fixed item(s) lack punctuation rule reference:\n${failures.join('\n')}`,
  );
});

// ─── Generated items: no code concepts ───────────────────────────────────────

test('generated items: no explanation references code concepts (depth 4)', () => {
  const items = generateAtDepth(4);
  const failures = [];
  for (const item of items) {
    for (const pattern of CODE_CONCEPT_PATTERNS) {
      if (pattern.source.includes('[{}') && /[''']/.test(item.explanation)) continue;
      if (pattern.test(item.explanation)) {
        failures.push(`  ${item.id}: matches ${pattern}`);
        break;
      }
    }
  }
  assert.strictEqual(
    failures.length,
    0,
    `${failures.length} generated item(s) reference code concepts:\n${failures.join('\n')}`,
  );
});

test('generated items: no explanation references code concepts (depth 8)', () => {
  const items = generateAtDepth(8);
  const failures = [];
  for (const item of items) {
    for (const pattern of CODE_CONCEPT_PATTERNS) {
      if (pattern.source.includes('[{}') && /[''']/.test(item.explanation)) continue;
      if (pattern.test(item.explanation)) {
        failures.push(`  ${item.id}: matches ${pattern}`);
        break;
      }
    }
  }
  assert.strictEqual(
    failures.length,
    0,
    `${failures.length} generated item(s) reference code concepts:\n${failures.join('\n')}`,
  );
});

// ─── All items: explanation length sanity ────────────────────────────────────

test('all items: explanations are between 15 and 300 characters', () => {
  const allItems = [
    ...PUNCTUATION_ITEMS,
    ...generateAtDepth(4),
  ];
  const failures = [];
  for (const item of allItems) {
    const len = (item.explanation || '').length;
    if (len < 15) {
      failures.push(`  ${item.id}: too short (${len} chars)`);
    } else if (len > 300) {
      failures.push(`  ${item.id}: too long (${len} chars)`);
    }
  }
  assert.strictEqual(
    failures.length,
    0,
    `${failures.length} item(s) have explanation length issues:\n${failures.join('\n')}`,
  );
});

// ─── Cross-check: generated items have non-generic explanations ──────────────

test('generated items: no item uses the generic fallback (depth 4)', () => {
  const items = generateAtDepth(4);
  const GENERIC = 'This generated item practises the same published punctuation skill.';
  const failures = items.filter((item) => item.explanation === GENERIC);
  assert.strictEqual(
    failures.length,
    0,
    `${failures.length} generated item(s) use generic fallback:\n${failures.map((i) => `  ${i.id}`).join('\n')}`,
  );
});

test('generated items: no item uses the generic fallback (depth 8)', () => {
  const items = generateAtDepth(8);
  const GENERIC = 'This generated item practises the same published punctuation skill.';
  const failures = items.filter((item) => item.explanation === GENERIC);
  assert.strictEqual(
    failures.length,
    0,
    `${failures.length} generated item(s) use generic fallback:\n${failures.map((i) => `  ${i.id}`).join('\n')}`,
  );
});

// ─── Fixed bank: total item count gate ───────────────────────────────────────

test('fixed bank: item count matches expected (92)', () => {
  assert.strictEqual(PUNCTUATION_ITEMS.length, 92, `Expected 92 fixed items, got ${PUNCTUATION_ITEMS.length}`);
});
