import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_CONTENT_MANIFEST, PUNCTUATION_ITEMS, PUNCTUATION_MANIFEST_VALIDATION } from '../shared/punctuation/content.js';
import { PUNCTUATION_FIXED_EXPANSION_ITEM_COUNT } from '../shared/punctuation/fixed-expansion-items.js';
import { GENERATED_TEMPLATE_BANK, createPunctuationGeneratedItems, PRODUCTION_DEPTH } from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

const REQUIRED_FAMILIES = 28;
const REQUIRED_GENERATED_CHOOSE_FAMILIES = 3;
const REQUIRED_TEMPLATES_PER_FAMILY = 40;

function normalise(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

test('manual expansion creates a 1000+ punctuation runtime pool', () => {
  const generated = createPunctuationGeneratedItems({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    seed: PUNCTUATION_CONTENT_MANIFEST.generatedSeed || PUNCTUATION_CONTENT_MANIFEST.releaseId || 'punctuation',
    perFamily: PRODUCTION_DEPTH,
  });

  assert.equal(PUNCTUATION_MANIFEST_VALIDATION.ok, true);
  assert.equal(PUNCTUATION_FIXED_EXPANSION_ITEM_COUNT, 56);
  assert.equal(PUNCTUATION_ITEMS.length, 148);
  assert.equal(PRODUCTION_DEPTH, REQUIRED_TEMPLATES_PER_FAMILY);
  assert.equal(generated.length, REQUIRED_FAMILIES * REQUIRED_TEMPLATES_PER_FAMILY);
  assert.equal(generated.filter((item) => item.mode === 'choose').length, REQUIRED_GENERATED_CHOOSE_FAMILIES * REQUIRED_TEMPLATES_PER_FAMILY);
  assert.equal(PUNCTUATION_ITEMS.length + generated.length, 1268);
});

test('each generator family has forty unique template stems and models', () => {
  assert.equal(Object.keys(GENERATED_TEMPLATE_BANK).length, REQUIRED_FAMILIES);

  for (const [familyId, templates] of Object.entries(GENERATED_TEMPLATE_BANK)) {
    assert.equal(templates.length, REQUIRED_TEMPLATES_PER_FAMILY, `${familyId} template count`);
    assert.equal(new Set(templates.map((template) => normalise(template.stem))).size, REQUIRED_TEMPLATES_PER_FAMILY, `${familyId} stem variety`);
    assert.equal(new Set(templates.map((template) => normalise(template.model))).size, REQUIRED_TEMPLATES_PER_FAMILY, `${familyId} model variety`);
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
