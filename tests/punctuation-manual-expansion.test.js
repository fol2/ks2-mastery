import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_CONTENT_MANIFEST, PUNCTUATION_ITEMS, PUNCTUATION_MANIFEST_VALIDATION } from '../shared/punctuation/content.js';
import { PUNCTUATION_FIXED_EXPANSION_ITEM_COUNT } from '../shared/punctuation/fixed-expansion-items.js';
import { GENERATED_TEMPLATE_BANK, createPunctuationGeneratedItems, PRODUCTION_DEPTH } from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

const REQUIRED_FAMILIES = 28;
const REQUIRED_TRANSFER_FAMILIES = 14;
const TOTAL_FAMILIES = REQUIRED_FAMILIES + REQUIRED_TRANSFER_FAMILIES;
const REQUIRED_GENERATED_CHOOSE_FAMILIES = 3;
const REQUIRED_TEMPLATES_PER_FAMILY = 100;
const TRANSFER_TEMPLATES_PER_FAMILY = 18;
const TRANSFER_GENERATED_ITEMS = REQUIRED_TRANSFER_FAMILIES * TRANSFER_TEMPLATES_PER_FAMILY;

function normalise(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

test('manual expansion creates a 3000+ punctuation runtime pool', () => {
  // P14 Gate 4: 28 baseline families × 100 templates + 14 transfer families ×
  // 18 templates (capped via productionItemsLimit) = 2800 + 252 = 3052
  // generated. Plus 512 fixed = 3564 total runtime items.
  const generated = createPunctuationGeneratedItems({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    seed: PUNCTUATION_CONTENT_MANIFEST.generatedSeed || PUNCTUATION_CONTENT_MANIFEST.releaseId || 'punctuation',
    perFamily: PRODUCTION_DEPTH,
  });

  assert.equal(PUNCTUATION_MANIFEST_VALIDATION.ok, true);
  assert.equal(PUNCTUATION_FIXED_EXPANSION_ITEM_COUNT, 420);
  assert.equal(PUNCTUATION_ITEMS.length, 512);
  assert.equal(PRODUCTION_DEPTH, REQUIRED_TEMPLATES_PER_FAMILY);
  assert.equal(
    generated.length,
    REQUIRED_FAMILIES * REQUIRED_TEMPLATES_PER_FAMILY + TRANSFER_GENERATED_ITEMS,
  );
  assert.equal(
    generated.filter((item) => item.mode === 'choose').length,
    REQUIRED_GENERATED_CHOOSE_FAMILIES * REQUIRED_TEMPLATES_PER_FAMILY,
  );
  assert.equal(
    generated.filter((item) => item.mode === 'transfer').length,
    TRANSFER_GENERATED_ITEMS,
  );
  assert.equal(PUNCTUATION_ITEMS.length + generated.length, 3564);
});

test('each generator family has the expected template count and model variety', () => {
  assert.equal(Object.keys(GENERATED_TEMPLATE_BANK).length, TOTAL_FAMILIES);

  for (const [familyId, templates] of Object.entries(GENERATED_TEMPLATE_BANK)) {
    const isTransferFamily = /_transfer$/.test(familyId);
    const expectedCount = isTransferFamily
      ? TRANSFER_TEMPLATES_PER_FAMILY
      : REQUIRED_TEMPLATES_PER_FAMILY;
    assert.equal(templates.length, expectedCount, `${familyId} template count`);
    // Transfer items have empty stems by design (the prompt carries the
    // question), so use prompt for variety; closed modes still use stem.
    const distinguisher = isTransferFamily
      ? (template) => normalise(template.prompt)
      : (template) => normalise(template.stem);
    assert.equal(
      new Set(templates.map(distinguisher)).size,
      expectedCount,
      `${familyId} ${isTransferFamily ? 'prompt' : 'stem'} variety`,
    );
    assert.equal(
      new Set(templates.map((template) => normalise(template.model))).size,
      expectedCount,
      `${familyId} model variety`,
    );
  }
});

test('all generated model answers and new fixed choices mark correctly', () => {
  const generated = createPunctuationGeneratedItems({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    seed: PUNCTUATION_CONTENT_MANIFEST.generatedSeed || PUNCTUATION_CONTENT_MANIFEST.releaseId || 'punctuation',
    perFamily: PRODUCTION_DEPTH,
  });

  for (const item of generated) {
    const answer = item.mode === 'choose' || item.inputKind === 'choice'
      ? { choiceIndex: item.correctIndex }
      : { typed: item.model };
    const result = markPunctuationAnswer({ item, answer });
    assert.equal(result.correct, true, `${item.id} model should mark correct`);
  }

  for (const item of PUNCTUATION_ITEMS.filter((entry) => entry.id?.startsWith('fx_'))) {
    const result = markPunctuationAnswer({ item, answer: String(item.correctIndex) });
    assert.equal(result.correct, true, `${item.id} correct choice should mark correct`);
  }
});
