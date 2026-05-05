import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_CONTENT_MANIFEST, PUNCTUATION_ITEMS, PUNCTUATION_MANIFEST_VALIDATION } from '../shared/punctuation/content.js';
import { PUNCTUATION_FIXED_EXPANSION_ITEM_COUNT } from '../shared/punctuation/fixed-expansion-items.js';
import { GENERATED_TEMPLATE_BANK, createPunctuationGeneratedItems, PRODUCTION_DEPTH } from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

const LEGACY_BASELINE_FAMILIES = 28;
const LEGACY_TRANSFER_FAMILIES = 14;
const P20_EXTENSION_FAMILIES = 84;
const TOTAL_FAMILIES = LEGACY_BASELINE_FAMILIES + LEGACY_TRANSFER_FAMILIES + P20_EXTENSION_FAMILIES;
const LEGACY_TEMPLATES_PER_BASELINE_FAMILY = 100;
const P20_TEMPLATES_PER_FULL_DEPTH_FAMILY = 120;
const P20_GENERATED_ITEMS =
  LEGACY_BASELINE_FAMILIES * LEGACY_TEMPLATES_PER_BASELINE_FAMILY
  + LEGACY_TRANSFER_FAMILIES * P20_TEMPLATES_PER_FULL_DEPTH_FAMILY
  + P20_EXTENSION_FAMILIES * P20_TEMPLATES_PER_FULL_DEPTH_FAMILY;

function normalise(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

test('P20 systematic expansion creates a 15000+ punctuation runtime pool', () => {
  // P20: 28 legacy baseline families × 100 templates + 14 legacy transfer
  // families × 120 templates + 84 systematic extension families × 120
  // templates = 14,560 generated. Plus 512 fixed = 15,072 runtime items.
  const generated = createPunctuationGeneratedItems({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    seed: PUNCTUATION_CONTENT_MANIFEST.generatedSeed || PUNCTUATION_CONTENT_MANIFEST.releaseId || 'punctuation',
    perFamily: PRODUCTION_DEPTH,
  });

  assert.equal(PUNCTUATION_MANIFEST_VALIDATION.ok, true);
  assert.equal(PUNCTUATION_FIXED_EXPANSION_ITEM_COUNT, 420);
  assert.equal(PUNCTUATION_ITEMS.length, 512);
  assert.equal(PRODUCTION_DEPTH, P20_TEMPLATES_PER_FULL_DEPTH_FAMILY);
  assert.equal(
    generated.length,
    P20_GENERATED_ITEMS,
  );
  assert.ok(
    generated.filter((item) => item.mode === 'choose').length >= 1900,
    'P20 should retain a broad closed choice pool',
  );
  assert.ok(
    generated.filter((item) => item.mode === 'transfer').length >= 3000,
    'P20 should materially expand transfer/open production coverage',
  );
  assert.equal(PUNCTUATION_ITEMS.length + generated.length, 15072);
});

test('each generator family has the expected template count and surface variety', () => {
  assert.equal(Object.keys(GENERATED_TEMPLATE_BANK).length, TOTAL_FAMILIES);

  for (const [familyId, templates] of Object.entries(GENERATED_TEMPLATE_BANK)) {
    const isP20Family = familyId.startsWith('gen_p20_');
    const isTransferFamily = /_transfer$/.test(familyId);
    const expectedCount = isP20Family || isTransferFamily
      ? P20_TEMPLATES_PER_FULL_DEPTH_FAMILY
      : LEGACY_TEMPLATES_PER_BASELINE_FAMILY;
    assert.equal(templates.length, expectedCount, `${familyId} template count`);

    const surface = (template) => normalise([template.prompt, template.stem, template.model].join(' '));
    assert.equal(new Set(templates.map((template) => template.templateId)).size, expectedCount, `${familyId} template id variety`);
    assert.equal(new Set(templates.map(surface)).size, expectedCount, `${familyId} learner surface variety`);

    if (!isP20Family && !isTransferFamily) {
      assert.equal(
        new Set(templates.map((template) => normalise(template.model))).size,
        expectedCount,
        `${familyId} legacy model variety`,
      );
    }
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
