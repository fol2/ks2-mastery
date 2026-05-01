#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports', 'grammar');
const SOURCE_INVENTORY = path.join(REPORTS_DIR, 'grammar-qg-p11-render-inventory.json');
const JSON_OUT = path.join(REPORTS_DIR, 'grammar-qg-p14-diversity-baseline.json');
const MD_OUT = path.join(REPORTS_DIR, 'grammar-qg-p14-diversity-baseline.md');

const PRE_P14_SELECTION_BASELINE = Object.freeze({
  source: 'legacy pre-P14 selection simulation from HEAD before P14 scheduler changes',
  coldStart: Object.freeze({
    mode: 'smart',
    size: 5,
    sessions: 200,
    duplicateSessions: 11,
    duplicateRate: 0.055,
    adjacentSessionOverlapRate: 0.0744,
    duplicateExamples: Object.freeze([
      Object.freeze({ seed: 53, duplicateTemplateIds: Object.freeze(['build_noun_phrase']) }),
      Object.freeze({ seed: 69, duplicateTemplateIds: Object.freeze(['qg_p3_active_passive_explain']) }),
      Object.freeze({ seed: 87, duplicateTemplateIds: Object.freeze(['identify_words_in_sentence']) }),
      Object.freeze({ seed: 95, duplicateTemplateIds: Object.freeze(['explain_reason_choice']) }),
      Object.freeze({ seed: 111, duplicateTemplateIds: Object.freeze(['qg_p4_possession_hyphen_clarity_transfer']) }),
      Object.freeze({ seed: 143, duplicateTemplateIds: Object.freeze(['proc2_standard_english_choice']) }),
    ]),
    mostFrequentSelectedTemplates: Object.freeze([
      Object.freeze({ templateId: 'proc3_parenthesis_commas_fix', count: 21 }),
      Object.freeze({ templateId: 'proc2_boundary_punctuation_explain', count: 20 }),
      Object.freeze({ templateId: 'qg_active_passive_choice', count: 20 }),
      Object.freeze({ templateId: 'tense_rewrite', count: 20 }),
      Object.freeze({ templateId: 'qg_p3_noun_phrases_explain', count: 19 }),
      Object.freeze({ templateId: 'qg_p3_pronouns_cohesion_explain', count: 19 }),
      Object.freeze({ templateId: 'qg_p3_subject_object_explain', count: 19 }),
      Object.freeze({ templateId: 'fronted_adverbial_choose', count: 18 }),
      Object.freeze({ templateId: 'proc2_passive_to_active', count: 18 }),
      Object.freeze({ templateId: 'proc3_hyphen_fix_meaning', count: 18 }),
    ]),
  }),
  returningLearner: Object.freeze({
    mode: 'smart',
    size: 5,
    sessions: 200,
    duplicateSessions: 13,
    duplicateRate: 0.065,
    adjacentSessionOverlapRate: 0.1246,
    duplicateExamples: Object.freeze([
      Object.freeze({ seed: 3, duplicateTemplateIds: Object.freeze(['qg_p3_tense_aspect_explain']) }),
      Object.freeze({ seed: 9, duplicateTemplateIds: Object.freeze(['tense_rewrite']) }),
      Object.freeze({ seed: 12, duplicateTemplateIds: Object.freeze(['tense_rewrite']) }),
      Object.freeze({ seed: 15, duplicateTemplateIds: Object.freeze(['proc2_standard_english_fix']) }),
      Object.freeze({ seed: 16, duplicateTemplateIds: Object.freeze(['qg_p3_tense_aspect_explain']) }),
      Object.freeze({ seed: 116, duplicateTemplateIds: Object.freeze(['qg_p4_verb_form_register_transfer']) }),
    ]),
    mostFrequentSelectedTemplates: Object.freeze([
      Object.freeze({ templateId: 'qg_p3_tense_aspect_explain', count: 68 }),
      Object.freeze({ templateId: 'tense_rewrite', count: 55 }),
      Object.freeze({ templateId: 'proc2_tense_aspect_choice', count: 54 }),
      Object.freeze({ templateId: 'qg_p4_verb_form_register_transfer', count: 54 }),
      Object.freeze({ templateId: 'tense_form_choice', count: 31 }),
      Object.freeze({ templateId: 'proc3_apostrophe_rewrite', count: 21 }),
      Object.freeze({ templateId: 'qg_p3_parenthesis_commas_explain', count: 20 }),
      Object.freeze({ templateId: 'qg_p4_possession_hyphen_clarity_transfer', count: 18 }),
      Object.freeze({ templateId: 'proc3_sentence_function_choice', count: 17 }),
      Object.freeze({ templateId: 'qg_p3_apostrophe_possession_explain', count: 16 }),
    ]),
  }),
});

function visibleSurfaceFor(item) {
  return JSON.stringify({
    promptText: item.promptText || '',
    inputType: item.inputType || '',
    visibleOptions: item.visibleOptions || null,
    rowSpecificOptions: item.rowSpecificOptions || null,
  });
}

function answerShapeFor(item) {
  return item?._answerSpec?.kind || item.inputType || 'legacy-evaluator';
}

function buildBaseline(inventory) {
  const items = Array.isArray(inventory.items) ? inventory.items : [];
  const byTemplate = new Map();
  const byConcept = new Map();
  const uniqueSurfaces = new Set();
  const uniquePrompts = new Set();
  const uniqueAnswerShapes = new Set();

  for (const item of items) {
    const templateId = item.templateId;
    if (!templateId) continue;
    const surface = visibleSurfaceFor(item);
    const prompt = item.promptText || '';
    const answerShape = answerShapeFor(item);

    uniqueSurfaces.add(surface);
    uniquePrompts.add(prompt);
    uniqueAnswerShapes.add(answerShape);

    const templateRow = byTemplate.get(templateId) || {
      templateId,
      conceptIds: new Set(),
      uniqueSurfaces: new Set(),
      uniquePromptTexts: new Set(),
      uniqueAnswerShapes: new Set(),
    };
    for (const conceptId of item.conceptIds || []) templateRow.conceptIds.add(conceptId);
    templateRow.uniqueSurfaces.add(surface);
    templateRow.uniquePromptTexts.add(prompt);
    templateRow.uniqueAnswerShapes.add(answerShape);
    byTemplate.set(templateId, templateRow);

    for (const conceptId of item.conceptIds || []) {
      const conceptRow = byConcept.get(conceptId) || {
        conceptId,
        templateIds: new Set(),
        uniqueSurfaces: new Set(),
      };
      conceptRow.templateIds.add(templateId);
      conceptRow.uniqueSurfaces.add(surface);
      byConcept.set(conceptId, conceptRow);
    }
  }

  const perTemplate = [...byTemplate.values()]
    .map((row) => ({
      templateId: row.templateId,
      conceptIds: [...row.conceptIds].sort(),
      uniqueSurfaceCount: row.uniqueSurfaces.size,
      uniquePromptTextCount: row.uniquePromptTexts.size,
      uniqueAnswerShapeCount: row.uniqueAnswerShapes.size,
    }))
    .sort((a, b) => a.templateId.localeCompare(b.templateId));

  const lowDiversityTemplates = perTemplate
    .filter((row) => row.uniqueSurfaceCount <= 3)
    .map((row) => row.templateId);

  const perConcept = [...byConcept.values()]
    .map((row) => ({
      conceptId: row.conceptId,
      templateCount: row.templateIds.size,
      uniqueSurfaceCount: row.uniqueSurfaces.size,
    }))
    .sort((a, b) => a.conceptId.localeCompare(b.conceptId));

  return {
    reportId: 'grammar-qg-p14-diversity-baseline',
    baselineKind: 'pre-p14-comparator',
    sourceInventory: 'reports/grammar/grammar-qg-p11-render-inventory.json',
    contentReleaseId: inventory.metadata?.contentReleaseId || 'grammar-qg-p11-2026-04-30',
    generatedAt: new Date().toISOString(),
    seedWindow: inventory.metadata?.seedRange || '1..30',
    totals: {
      totalTemplates: byTemplate.size,
      totalInventoryInstances: items.length,
      uniqueLearnerVisibleSurfaces: uniqueSurfaces.size,
      uniquePromptTexts: uniquePrompts.size,
      uniqueAnswerShapes: uniqueAnswerShapes.size,
    },
    perTemplate,
    perConcept,
    lowDiversityTemplates,
    sessionSelection: PRE_P14_SELECTION_BASELINE,
    interpretation: {
      seedCountIsNotVariety: true,
      note: 'This is the pre-P14 comparator baseline used to quantify the P14 depth gap. It intentionally uses the P11 render inventory and must not be read as active P14 runtime certification evidence.',
    },
  };
}

function markdownFor(report) {
  const totals = report.totals;
  const lines = [
    '# Grammar QG P14 Pre-P14 Diversity Baseline',
    '',
    'Baseline kind: pre-p14-comparator',
    `Source release: ${report.contentReleaseId}`,
    `Source inventory: ${report.sourceInventory}`,
    `Seed window: ${report.seedWindow}`,
    '',
    'This report is a comparator baseline for P14 planning. It intentionally uses the P11 render inventory and is not active P14 runtime certification evidence.',
    '',
    '## Totals',
    '',
    `- Total templates: ${totals.totalTemplates}`,
    `- Total inventory instances: ${totals.totalInventoryInstances}`,
    `- Unique learner-visible surfaces: ${totals.uniqueLearnerVisibleSurfaces}`,
    `- Unique prompt texts: ${totals.uniquePromptTexts}`,
    `- Unique answer shapes: ${totals.uniqueAnswerShapes}`,
    `- Low-diversity templates (1-3 surfaces): ${report.lowDiversityTemplates.length}`,
    '',
    '## Session Selection Baseline',
    '',
    `- Cold-start smart 5q duplicate sessions: ${report.sessionSelection.coldStart.duplicateSessions}/${report.sessionSelection.coldStart.sessions} (${report.sessionSelection.coldStart.duplicateRate})`,
    `- Returning smart 5q duplicate sessions: ${report.sessionSelection.returningLearner.duplicateSessions}/${report.sessionSelection.returningLearner.sessions} (${report.sessionSelection.returningLearner.duplicateRate})`,
    `- Cold-start adjacent-session overlap: ${report.sessionSelection.coldStart.adjacentSessionOverlapRate}`,
    `- Returning adjacent-session overlap: ${report.sessionSelection.returningLearner.adjacentSessionOverlapRate}`,
    '',
    '## Low-Diversity Templates',
    '',
    ...report.lowDiversityTemplates.map((templateId) => `- ${templateId}`),
    '',
    '## Most Frequent Cold-Start Templates',
    '',
    '| Template | Selections |',
    '| --- | ---: |',
    ...report.sessionSelection.coldStart.mostFrequentSelectedTemplates.map((row) => `| ${row.templateId} | ${row.count} |`),
    '',
    '## Most Frequent Returning-Learner Templates',
    '',
    '| Template | Selections |',
    '| --- | ---: |',
    ...report.sessionSelection.returningLearner.mostFrequentSelectedTemplates.map((row) => `| ${row.templateId} | ${row.count} |`),
    '',
    '## Per-Concept Surface Counts',
    '',
    '| Concept | Templates | Unique surfaces |',
    '| --- | ---: | ---: |',
    ...report.perConcept.map((row) => `| ${row.conceptId} | ${row.templateCount} | ${row.uniqueSurfaceCount} |`),
    '',
    '## Interpretation',
    '',
    report.interpretation.note,
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const inventory = JSON.parse(await fs.readFile(SOURCE_INVENTORY, 'utf8'));
  const report = buildBaseline(inventory);
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(MD_OUT, markdownFor(report), 'utf8');
  console.log(`Wrote ${path.relative(ROOT_DIR, JSON_OUT)}`);
  console.log(`Wrote ${path.relative(ROOT_DIR, MD_OUT)}`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}

export { buildBaseline };
