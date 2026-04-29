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
];

const P4_LEGACY_FAMILIES = [
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

// ─── Parity: perFamily = 4 ───────────────────────────────────────────────────

test('DSL conversion produces identical output at perFamily=4 for 7 priority families', () => {
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

  for (let idx = 0; idx < filtered.length; idx += 1) {
    assert.deepEqual(filtered[idx], BASELINE.perFamily4[idx],
      `Mismatch at index ${idx} (${filtered[idx]?.generatorFamilyId})`);
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

test('DSL conversion produces identical output at perFamily=8 for 7 priority families', () => {
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

  assert.equal(filtered.length, BASELINE.perFamily8.length,
    `Expected ${BASELINE.perFamily8.length} items, got ${filtered.length}`);

  for (let idx = 0; idx < filtered.length; idx += 1) {
    assert.deepEqual(filtered[idx], BASELINE.perFamily8[idx],
      `Mismatch at index ${idx} (${filtered[idx]?.generatorFamilyId})`);
  }
});

// ─── Runtime manifest total count ─────────────────────────────────────────────

test('runtime manifest produces 192 total items at perFamily=4', () => {
  const runtimeManifest = createPunctuationRuntimeManifest({
    seed: BASELINE.seed,
    generatedPerFamily: 4,
  });
  const indexes = createPunctuationContentIndexes(runtimeManifest);

  assert.equal(indexes.items.length, 192,
    `Expected 192 runtime items, got ${indexes.items.length}`);
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

  // 25 families * 4 = 100 generated items
  assert.equal(generatedItems.length, 100);

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
    const result = markPunctuationAnswer({ item, answer: { typed: item.model } });
    assert.equal(result.correct, true, `Audit marking failed for ${item.id}`);
  }
});

// ─── P4 Legacy Family Characterisation Baseline ──────────────────────────────

test('P4 fixture covers exactly 18 families (12 legacy + 6 DSL-converted) and no P3-converted families', () => {
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

  // All 12 legacy families present
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

  // All 6 DSL-converted families present in baseline (depth4 still matches)
  for (const familyId of P4_DSL_CONVERTED_FAMILIES) {
    assert.ok(
      fixtureDepth4Families.includes(familyId),
      `Missing DSL-converted family ${familyId} in P4 fixture depth4`,
    );
  }
});

test('depth 4 output matches P4 baseline for 12 legacy families', () => {
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

test('depth 4 output matches P4 baseline for 6 DSL-converted families', () => {
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

test('depth 8 output matches P4 baseline for 12 legacy families', () => {
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

test('depth 8 produces 8 unique signatures for 6 DSL-converted families', () => {
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
  assert.equal(converted.length, 48); // 6 families * 8 items

  for (const item of converted) {
    const result = markPunctuationAnswer({ item, answer: { typed: item.model } });
    assert.equal(result.correct, true,
      `Model answer failed marking for ${item.id} (${item.generatorFamilyId})`);
  }
});
