import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPunctuationGeneratedItems,
  createPunctuationRuntimeManifest,
} from '../shared/punctuation/generators.js';
import {
  createPunctuationContentIndexes,
  PUNCTUATION_CONTENT_MANIFEST,
} from '../shared/punctuation/content.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

const GENERATOR_FAMILY_COUNT = PUNCTUATION_CONTENT_MANIFEST.generatorFamilies.length;
const FIXED_ITEM_COUNT = PUNCTUATION_CONTENT_MANIFEST.items.length;

function correctAnswerForGeneratedItem(item) {
  if (item.mode === 'choose' || item.inputKind === 'choice') {
    return { choiceIndex: item.correctIndex };
  }
  return { typed: item.model };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip `explanation` keys from a validator structure for baseline comparison.
 * Explanation is a P6 intentional addition that does not exist in frozen P4 baselines.
 */
function stripExplanation(value) {
  if (Array.isArray(value)) return value.map(stripExplanation);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'explanation')
        .map(([key, v]) => [key, stripExplanation(v)]),
    );
  }
  return value;
}

// ─── Fixture loading ──────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/punctuation-qg-p3-parity-baseline.json'), 'utf8'),
);
const P4_BASELINE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/punctuation-qg-p4-parity-baseline.json'), 'utf8'),
);

const PRIORITY_FAMILIES = [
  'gen_sentence_endings_insert',
  'gen_apostrophe_contractions_fix',
  'gen_comma_clarity_insert',
  'gen_dash_clause_fix',
  'gen_dash_clause_combine',
  'gen_hyphen_insert',
  'gen_semicolon_list_fix',
];

const P4_DSL_CONVERTED_FAMILIES = [
  'gen_apostrophe_possession_insert',
  'gen_apostrophe_mix_paragraph',
  'gen_speech_insert',
  'gen_fronted_speech_paragraph',
  'gen_list_commas_insert',
  'gen_list_commas_combine',
  'gen_fronted_adverbial_fix',
  'gen_fronted_adverbial_combine',
  'gen_parenthesis_fix',
  'gen_parenthesis_combine',
  'gen_parenthesis_speech_paragraph',
  'gen_colon_list_insert',
  'gen_colon_list_combine',
  'gen_semicolon_fix',
  'gen_semicolon_combine',
  'gen_colon_semicolon_paragraph',
  'gen_bullet_points_fix',
  'gen_bullet_points_paragraph',
];

const P4_LEGACY_FAMILIES = [
  // All legacy free-text families are now DSL-converted. P11 adds generated
  // choice families with an explicit option contract.
];

// ─── Parity: perFamily = 4 ───────────────────────────────────────────────────

test('P12 reviewed bank supersedes the P3 parity fixture for 7 priority families', () => {
  const items = createPunctuationGeneratedItems({
    seed: BASELINE.seed,
    perFamily: 4,
  });

  const filtered = items
    .filter((i) => PRIORITY_FAMILIES.includes(i.generatorFamilyId))
    .map((i) => ({
      id: i.id,
      generatorFamilyId: i.generatorFamilyId,
      variantSignature: i.variantSignature,
      templateId: i.templateId,
      prompt: i.prompt,
      stem: i.stem,
      model: i.model,
      validator: i.validator || null,
      misconceptionTags: i.misconceptionTags,
      readiness: i.readiness,
    }));

  assert.equal(filtered.length, BASELINE.perFamily4.length,
    `Expected ${BASELINE.perFamily4.length} items, got ${filtered.length}`);

  for (const familyId of PRIORITY_FAMILIES) {
    const familyItems = filtered.filter((item) => item.generatorFamilyId === familyId);
    assert.equal(familyItems.length, 4, familyId);
    assert.equal(new Set(familyItems.map((item) => item.templateId)).size, 4, familyId);
    assert.equal(new Set(familyItems.map((item) => item.variantSignature)).size, 4, familyId);
    assert.equal(familyItems.every((item) => item.templateId.startsWith('p12q_')), true, familyId);
    assert.notDeepEqual(
      familyItems.map((item) => item.templateId),
      BASELINE.perFamily4
        .filter((item) => item.generatorFamilyId === familyId)
        .map((item) => item.templateId),
      `${familyId} must not silently fall back to the superseded P3 fixture`,
    );
  }
});

// ─── Parity: perFamily = 8 ───────────────────────────────────────────────────

test('DSL conversion produces 8 distinct variant signatures per family at perFamily=8', () => {
  const items = createPunctuationGeneratedItems({
    seed: BASELINE.seed,
    perFamily: 8,
  });

  for (const familyId of PRIORITY_FAMILIES) {
    const familyItems = items.filter((i) => i.generatorFamilyId === familyId);
    assert.equal(familyItems.length, 8, `${familyId}: expected 8 items`);

    const signatures = new Set(familyItems.map((i) => i.variantSignature));
    assert.equal(signatures.size, 8, `${familyId}: expected 8 distinct variant signatures`);

    const templateIds = new Set(familyItems.map((i) => i.templateId));
    assert.equal(templateIds.size, 8, `${familyId}: expected 8 distinct template IDs`);
  }
});

test('DSL conversion keeps perFamily=8 priority-family output structurally valid', () => {
  const items = createPunctuationGeneratedItems({
    seed: BASELINE.seed,
    perFamily: 8,
  });

  const filtered = items
    .filter((i) => PRIORITY_FAMILIES.includes(i.generatorFamilyId))
    .map((i) => ({
      id: i.id,
      generatorFamilyId: i.generatorFamilyId,
      variantSignature: i.variantSignature,
      templateId: i.templateId,
      prompt: i.prompt,
      stem: i.stem,
      model: i.model,
      validator: i.validator || null,
      misconceptionTags: i.misconceptionTags,
      readiness: i.readiness,
    }));

  assert.equal(filtered.length, PRIORITY_FAMILIES.length * 8,
    `Expected ${PRIORITY_FAMILIES.length * 8} items, got ${filtered.length}`);

  for (const familyId of PRIORITY_FAMILIES) {
    const familyItems = filtered.filter((item) => item.generatorFamilyId === familyId);
    assert.equal(familyItems.length, 8, familyId);
    assert.equal(new Set(familyItems.map((item) => item.templateId)).size, 8, familyId);
    assert.equal(new Set(familyItems.map((item) => item.variantSignature)).size, 8, familyId);
  }
});

// ─── Runtime manifest total count ─────────────────────────────────────────────

test('runtime manifest produces 260 total items at perFamily=4', () => {
  const runtimeManifest = createPunctuationRuntimeManifest({
    seed: BASELINE.seed,
    generatedPerFamily: 4,
  });
  const indexes = createPunctuationContentIndexes(runtimeManifest);

  assert.equal(indexes.items.length, FIXED_ITEM_COUNT + (GENERATOR_FAMILY_COUNT * 4),
    `Expected ${FIXED_ITEM_COUNT + (GENERATOR_FAMILY_COUNT * 4)} runtime items, got ${indexes.items.length}`);
});

// ─── Model answers pass marking ───────────────────────────────────────────────

test('all DSL-converted family model answers pass deterministic marking at perFamily=8', () => {
  const items = createPunctuationGeneratedItems({
    seed: BASELINE.seed,
    perFamily: 8,
  });

  const priorityItems = items.filter((i) => PRIORITY_FAMILIES.includes(i.generatorFamilyId));
  assert.equal(priorityItems.length, 56);

  for (const item of priorityItems) {
    const result = markPunctuationAnswer({ item, answer: { typed: item.model } });
    assert.equal(result.correct, true, `Model answer failed marking for ${item.id}`);
  }
});

// ─── Audit function validation ────────────────────────────────────────────────

test('content audit logic passes for DSL-converted families at perFamily=4', () => {
  const runtimeManifest = createPunctuationRuntimeManifest({
    seed: BASELINE.seed,
    generatedPerFamily: 4,
  });
  const indexes = createPunctuationContentIndexes(runtimeManifest);
  const generatedItems = indexes.items.filter((i) => i.source === 'generated');

  assert.equal(generatedItems.length, GENERATOR_FAMILY_COUNT * 4);

  // Each generated item has required fields
  for (const item of generatedItems) {
    assert.ok(item.id, 'missing id');
    assert.ok(item.templateId, 'missing templateId');
    assert.ok(item.variantSignature, 'missing variantSignature');
    assert.ok(item.model, 'missing model');
    assert.ok(item.generatorFamilyId, 'missing generatorFamilyId');
    assert.match(item.variantSignature, /^puncsig_[a-z0-9]+$/);
  }

  // Generated items must NOT carry the DSL 'tests' field (metadata leak guard)
  for (const item of generatedItems) {
    assert.equal(item.tests, undefined,
      `${item.id}: 'tests' field leaked from DSL template into generated item`);
  }

  // No duplicate variant signatures within any family
  for (const familyId of PRIORITY_FAMILIES) {
    const familyItems = generatedItems.filter((i) => i.generatorFamilyId === familyId);
    const sigs = familyItems.map((i) => i.variantSignature);
    assert.equal(new Set(sigs).size, sigs.length,
      `${familyId}: duplicate variant signatures found`);
  }

  // All model answers pass marking
  for (const item of generatedItems) {
    const result = markPunctuationAnswer({ item, answer: correctAnswerForGeneratedItem(item) });
    assert.equal(result.correct, true, `Audit marking failed for ${item.id}`);
  }
});

// ─── P4 Legacy Family Characterisation Baseline ──────────────────────────────

test('P4 fixture covers exactly 18 families (all DSL-converted) and no P3-converted families', () => {
  assert.equal(P4_BASELINE.meta.familyCount, 18);

  const fixtureDepth4Families = Object.keys(P4_BASELINE.depth4);
  const fixtureDepth8Families = Object.keys(P4_BASELINE.depth8);

  assert.equal(fixtureDepth4Families.length, 18);
  assert.equal(fixtureDepth8Families.length, 18);

  // No overlap with P3-converted families
  for (const familyId of PRIORITY_FAMILIES) {
    assert.equal(
      fixtureDepth4Families.includes(familyId), false,
      `P3-converted family ${familyId} found in P4 fixture depth4`,
    );
    assert.equal(
      fixtureDepth8Families.includes(familyId), false,
      `P3-converted family ${familyId} found in P4 fixture depth8`,
    );
  }

  // All 6 legacy families present
  for (const familyId of P4_LEGACY_FAMILIES) {
    assert.ok(
      fixtureDepth4Families.includes(familyId),
      `Missing legacy family ${familyId} in P4 fixture depth4`,
    );
    assert.ok(
      fixtureDepth8Families.includes(familyId),
      `Missing legacy family ${familyId} in P4 fixture depth8`,
    );
  }

  // All 12 DSL-converted families present in baseline (depth4 still matches)
  for (const familyId of P4_DSL_CONVERTED_FAMILIES) {
    assert.ok(
      fixtureDepth4Families.includes(familyId),
      `Missing DSL-converted family ${familyId} in P4 fixture depth4`,
    );
  }
});

test('depth 4 output matches P4 baseline for legacy families (none remaining)', () => {
  const items = createPunctuationGeneratedItems({
    seed: P4_BASELINE.meta.seed,
    perFamily: 4,
  });

  for (const familyId of P4_LEGACY_FAMILIES) {
    const familyItems = items
      .filter((i) => i.generatorFamilyId === familyId)
      .map((i) => ({
        id: i.id,
        generatorFamilyId: i.generatorFamilyId,
        variantSignature: i.variantSignature,
        templateId: i.templateId,
        prompt: i.prompt,
        stem: i.stem,
        model: i.model,
        validatorType: i.validator?.type || null,
        validator: i.validator || null,
        rubric: i.rubric || null,
        misconceptionTags: i.misconceptionTags,
        readiness: i.readiness,
      }));

    const expected = P4_BASELINE.depth4[familyId];
    assert.equal(familyItems.length, expected.length,
      `${familyId}: expected ${expected.length} items at depth 4, got ${familyItems.length}`);

    for (let idx = 0; idx < familyItems.length; idx += 1) {
      assert.deepEqual(familyItems[idx], expected[idx],
        `${familyId} depth4 mismatch at index ${idx}`);
    }
  }
});

test('depth 4 output uses P12 reviewed surfaces for the former P4 DSL-converted families', () => {
  const items = createPunctuationGeneratedItems({
    seed: P4_BASELINE.meta.seed,
    perFamily: 4,
  });

  for (const familyId of P4_DSL_CONVERTED_FAMILIES) {
    const familyItems = items
      .filter((i) => i.generatorFamilyId === familyId)
      .map((i) => ({
        id: i.id,
        generatorFamilyId: i.generatorFamilyId,
        variantSignature: i.variantSignature,
        templateId: i.templateId,
        prompt: i.prompt,
        stem: i.stem,
        model: i.model,
        validatorType: i.validator?.type || null,
        validator: stripExplanation(i.validator) || null,
        rubric: i.rubric || null,
        misconceptionTags: i.misconceptionTags,
        readiness: i.readiness,
      }));

    assert.equal(familyItems.length, 4, `${familyId}: expected 4 items at depth 4`);
    assert.equal(new Set(familyItems.map((item) => item.templateId)).size, 4, familyId);
    assert.equal(new Set(familyItems.map((item) => item.variantSignature)).size, 4, familyId);
    assert.equal(familyItems.every((item) => item.templateId.startsWith('p12q_')), true, familyId);
    assert.notDeepEqual(
      familyItems.map((item) => item.templateId),
      (P4_BASELINE.depth4[familyId] || []).map((item) => item.templateId),
      `${familyId} must not silently fall back to the superseded P4 fixture`,
    );
  }
});

test('depth 8 output matches P4 baseline for legacy families (none remaining)', () => {
  const items = createPunctuationGeneratedItems({
    seed: P4_BASELINE.meta.seed,
    perFamily: 8,
  });

  for (const familyId of P4_LEGACY_FAMILIES) {
    const familyItems = items
      .filter((i) => i.generatorFamilyId === familyId)
      .map((i) => ({
        id: i.id,
        generatorFamilyId: i.generatorFamilyId,
        variantSignature: i.variantSignature,
        templateId: i.templateId,
        prompt: i.prompt,
        stem: i.stem,
        model: i.model,
        validatorType: i.validator?.type || null,
        validator: i.validator || null,
        rubric: i.rubric || null,
        misconceptionTags: i.misconceptionTags,
        readiness: i.readiness,
      }));

    const expected = P4_BASELINE.depth8[familyId];
    assert.equal(familyItems.length, expected.length,
      `${familyId}: expected ${expected.length} items at depth 8, got ${familyItems.length}`);

    for (let idx = 0; idx < familyItems.length; idx += 1) {
      assert.deepEqual(familyItems[idx], expected[idx],
        `${familyId} depth8 mismatch at index ${idx}`);
    }
  }
});

test('depth 8 produces 8 unique signatures for 18 DSL-converted families', () => {
  const items = createPunctuationGeneratedItems({
    seed: P4_BASELINE.meta.seed,
    perFamily: 8,
  });

  for (const familyId of P4_DSL_CONVERTED_FAMILIES) {
    const familyItems = items.filter((i) => i.generatorFamilyId === familyId);
    assert.equal(familyItems.length, 8,
      `${familyId}: expected 8 items at depth 8, got ${familyItems.length}`);

    const signatures = new Set(familyItems.map((i) => i.variantSignature));
    assert.equal(signatures.size, 8,
      `${familyId}: expected 8 distinct variant signatures at depth 8, got ${signatures.size}`);

    const templateIds = new Set(familyItems.map((i) => i.templateId));
    assert.equal(templateIds.size, 8,
      `${familyId}: expected 8 distinct template IDs at depth 8, got ${templateIds.size}`);
  }
});

test('all DSL-converted family model answers pass marking at depth 8', () => {
  const items = createPunctuationGeneratedItems({
    seed: P4_BASELINE.meta.seed,
    perFamily: 8,
  });

  const converted = items.filter((i) => P4_DSL_CONVERTED_FAMILIES.includes(i.generatorFamilyId));
  assert.equal(converted.length, 144); // 18 families * 8 items

  for (const item of converted) {
    const result = markPunctuationAnswer({ item, answer: { typed: item.model } });
    assert.equal(result.correct, true,
      `Model answer failed marking for ${item.id} (${item.generatorFamilyId})`);
  }
});
