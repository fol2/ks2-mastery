/**
 * Generate P4 characterisation baseline fixture for 18 legacy (unconverted) families.
 * Run once: node scripts/generate-p4-parity-baseline.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPunctuationGeneratedItems } from '../shared/punctuation/generators.js';
import { PUNCTUATION_CONTENT_MANIFEST } from '../shared/punctuation/content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const P3_DSL_FAMILIES = new Set([
  'gen_sentence_endings_insert',
  'gen_apostrophe_contractions_fix',
  'gen_comma_clarity_insert',
  'gen_dash_clause_fix',
  'gen_dash_clause_combine',
  'gen_hyphen_insert',
  'gen_semicolon_list_fix',
]);

const LEGACY_FAMILIES = [
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

const SEED = PUNCTUATION_CONTENT_MANIFEST.releaseId;

function snapshotItem(item) {
  return {
    id: item.id,
    generatorFamilyId: item.generatorFamilyId,
    variantSignature: item.variantSignature,
    templateId: item.templateId,
    prompt: item.prompt,
    stem: item.stem,
    model: item.model,
    validatorType: item.validator?.type || null,
    validator: item.validator || null,
    rubric: item.rubric || null,
    misconceptionTags: item.misconceptionTags,
    readiness: item.readiness,
  };
}

function generateAtDepth(perFamily) {
  const items = createPunctuationGeneratedItems({ seed: SEED, perFamily });
  const legacy = items.filter(
    (i) => !P3_DSL_FAMILIES.has(i.generatorFamilyId) && LEGACY_FAMILIES.includes(i.generatorFamilyId),
  );
  const grouped = {};
  for (const familyId of LEGACY_FAMILIES) {
    grouped[familyId] = legacy
      .filter((i) => i.generatorFamilyId === familyId)
      .map(snapshotItem);
  }
  return grouped;
}

const depth4 = generateAtDepth(4);
const depth8 = generateAtDepth(8);

// Validate we have exactly 18 families at each depth
const d4Families = Object.keys(depth4).filter((k) => depth4[k].length > 0);
const d8Families = Object.keys(depth8).filter((k) => depth8[k].length > 0);

if (d4Families.length !== 18) {
  console.error(`ERROR: depth4 has ${d4Families.length} families, expected 18`);
  process.exit(1);
}
if (d8Families.length !== 18) {
  console.error(`ERROR: depth8 has ${d8Families.length} families, expected 18`);
  process.exit(1);
}

const fixture = {
  meta: {
    generatedAt: '2026-04-29',
    purpose: 'P4 characterisation baseline for 18 legacy families before DSL conversion',
    familyCount: 18,
    seed: SEED,
  },
  depth4,
  depth8,
};

const outPath = path.join(__dirname, '..', 'tests', 'fixtures', 'punctuation-qg-p4-parity-baseline.json');
fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n', 'utf8');
console.log(`Written: ${outPath}`);
console.log(`  depth4: ${Object.values(depth4).flat().length} items across ${d4Families.length} families`);
console.log(`  depth8: ${Object.values(depth8).flat().length} items across ${d8Families.length} families`);
