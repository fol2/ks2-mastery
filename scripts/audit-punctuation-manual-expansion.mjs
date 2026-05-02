#!/usr/bin/env node

import { PUNCTUATION_CONTENT_MANIFEST, PUNCTUATION_ITEMS, PUNCTUATION_MANIFEST_VALIDATION } from '../shared/punctuation/content.js';
import { PUNCTUATION_FIXED_EXPANSION_ITEM_COUNT } from '../shared/punctuation/fixed-expansion-items.js';
import { GENERATED_TEMPLATE_BANK, createPunctuationGeneratedItems, PRODUCTION_DEPTH, CAPACITY_DEPTH } from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

const jsonMode = process.argv.includes('--json');
const REQUIRED_FAMILIES = 28;
const REQUIRED_GENERATED_CHOOSE_FAMILIES = 3;
const REQUIRED_TEMPLATES_PER_FAMILY = 100;
const REQUIRED_GENERATED_ITEMS = REQUIRED_FAMILIES * REQUIRED_TEMPLATES_PER_FAMILY;
const REQUIRED_TOTAL_POOL = 3000;

function normalise(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function answerForItem(item) {
  if (item.mode === 'choose' || item.inputKind === 'choice') {
    return { choiceIndex: item.correctIndex };
  }
  return { typed: item.model };
}

function duplicateGroups(values) {
  const map = new Map();
  for (const value of values) {
    const key = normalise(value);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }
  return [...map.entries()].filter(([, entries]) => entries.length > 1);
}

const familyStats = Object.entries(GENERATED_TEMPLATE_BANK).map(([familyId, templates]) => {
  const stems = templates.map((template) => template.stem || '');
  const models = templates.map((template) => template.model || '');
  return {
    familyId,
    templates: templates.length,
    uniqueStems: new Set(stems.map(normalise)).size,
    uniqueModels: new Set(models.map(normalise)).size,
  };
});

const generatedItems = createPunctuationGeneratedItems({
  manifest: PUNCTUATION_CONTENT_MANIFEST,
  seed: PUNCTUATION_CONTENT_MANIFEST.generatedSeed || PUNCTUATION_CONTENT_MANIFEST.releaseId || 'punctuation',
  perFamily: PRODUCTION_DEPTH,
});

const generatedModelFailures = [];
for (const item of generatedItems) {
  const result = markPunctuationAnswer({ item, answer: answerForItem(item) });
  if (!result.correct) {
    generatedModelFailures.push({
      itemId: item.id,
      familyId: item.generatorFamilyId,
      mode: item.mode,
      model: item.model,
      note: result.note,
    });
  }
}

const fixedExpansionChoiceFailures = [];
for (const item of PUNCTUATION_ITEMS.filter((entry) => entry.id?.startsWith('fx_'))) {
  const result = markPunctuationAnswer({ item, answer: String(item.correctIndex) });
  if (!result.correct) {
    fixedExpansionChoiceFailures.push({
      itemId: item.id,
      correctIndex: item.correctIndex,
      note: result.note,
    });
  }
}

const generatedModelDuplicates = duplicateGroups(generatedItems.map((item) => item.model));
const generatedStemDuplicates = duplicateGroups(generatedItems.map((item) => item.stem));
const generatedChooseFamilies = new Set(generatedItems
  .filter((item) => item.mode === 'choose')
  .map((item) => item.generatorFamilyId)
  .filter(Boolean));
const familyTemplateProblems = familyStats.filter((family) => (
  family.templates !== REQUIRED_TEMPLATES_PER_FAMILY
    || family.uniqueStems !== REQUIRED_TEMPLATES_PER_FAMILY
    || family.uniqueModels !== REQUIRED_TEMPLATES_PER_FAMILY
));

const summary = {
  ok: PUNCTUATION_MANIFEST_VALIDATION.ok
    && familyStats.length === REQUIRED_FAMILIES
    && familyTemplateProblems.length === 0
    && PRODUCTION_DEPTH === REQUIRED_TEMPLATES_PER_FAMILY
    && CAPACITY_DEPTH >= REQUIRED_TEMPLATES_PER_FAMILY
    && generatedItems.length === REQUIRED_GENERATED_ITEMS
    && generatedChooseFamilies.size >= REQUIRED_GENERATED_CHOOSE_FAMILIES
    && (PUNCTUATION_ITEMS.length + generatedItems.length) >= REQUIRED_TOTAL_POOL
    && generatedModelFailures.length === 0
    && fixedExpansionChoiceFailures.length === 0,
  fixedItems: PUNCTUATION_ITEMS.length,
  fixedExpansionItems: PUNCTUATION_FIXED_EXPANSION_ITEM_COUNT,
  generatedFamilies: familyStats.length,
  generatedChooseFamilies: generatedChooseFamilies.size,
  templatesPerFamilyMin: Math.min(...familyStats.map((family) => family.templates)),
  templatesPerFamilyMax: Math.max(...familyStats.map((family) => family.templates)),
  productionDepth: PRODUCTION_DEPTH,
  capacityDepth: CAPACITY_DEPTH,
  generatedItems: generatedItems.length,
  totalRuntimePool: PUNCTUATION_ITEMS.length + generatedItems.length,
  uniqueGeneratedModels: new Set(generatedItems.map((item) => normalise(item.model))).size,
  generatedModelDuplicateGroups: generatedModelDuplicates.length,
  uniqueGeneratedStems: new Set(generatedItems.map((item) => normalise(item.stem))).size,
  generatedStemDuplicateGroups: generatedStemDuplicates.length,
  manifestErrors: PUNCTUATION_MANIFEST_VALIDATION.errors,
  familyTemplateProblems,
  generatedModelFailures: generatedModelFailures.slice(0, 25),
  fixedExpansionChoiceFailures: fixedExpansionChoiceFailures.slice(0, 25),
};

if (jsonMode) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('Punctuation QG manual content expansion audit');
  console.log(`  status: ${summary.ok ? 'PASS' : 'FAIL'}`);
  console.log(`  fixed items: ${summary.fixedItems} (${summary.fixedExpansionItems} new manual fixed items)`);
  console.log(`  generated families: ${summary.generatedFamilies}`);
  console.log(`  generated choose families: ${summary.generatedChooseFamilies}`);
  console.log(`  templates per family: ${summary.templatesPerFamilyMin}-${summary.templatesPerFamilyMax}`);
  console.log(`  production depth: ${summary.productionDepth}`);
  console.log(`  generated items: ${summary.generatedItems}`);
  console.log(`  total runtime pool: ${summary.totalRuntimePool}`);
  console.log(`  unique generated stems/models: ${summary.uniqueGeneratedStems}/${summary.uniqueGeneratedModels}`);
}

if (!summary.ok) {
  process.exitCode = 1;
}
