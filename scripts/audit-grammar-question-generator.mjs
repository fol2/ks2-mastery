#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateAnswerSpec } from '../worker/src/subjects/grammar/answer-spec.js';
import {
  GRAMMAR_CONCEPTS,
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
  grammarQuestionVariantSignature,
} from '../worker/src/subjects/grammar/content.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SEEDS = Object.freeze([1, 2, 3]);

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean).map(String))).sort();
}

function buildConceptCoverage() {
  const coverage = new Map(GRAMMAR_CONCEPTS.map((concept) => [concept.id, {
    conceptId: concept.id,
    total: 0,
    generated: 0,
    fixed: 0,
    selectedResponse: 0,
    constructedResponse: 0,
    questionTypes: new Set(),
    templateIds: [],
  }]));

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    for (const conceptId of template.skillIds || []) {
      const row = coverage.get(conceptId);
      if (!row) continue;
      row.total += 1;
      if (template.generative) row.generated += 1;
      else row.fixed += 1;
      if (template.isSelectedResponse) row.selectedResponse += 1;
      else row.constructedResponse += 1;
      row.questionTypes.add(template.questionType);
      row.templateIds.push(template.id);
    }
  }

  return Array.from(coverage.values()).map((row) => ({
    ...row,
    questionTypes: uniqueSorted(Array.from(row.questionTypes)),
    templateIds: uniqueSorted(row.templateIds),
  })).sort((a, b) => a.conceptId.localeCompare(b.conceptId));
}

function buildSignatureAudit(seeds) {
  const seen = new Map();
  const missing = [];
  const collisions = [];
  const repeatedVariants = [];
  const legacyRepeatedVariants = [];
  const samples = [];

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    if (!template.generative) continue;
    if (!template.generatorFamilyId) missing.push(template.id);
    const strictVariantTemplate = (template.tags || []).includes('qg-p1');
    for (const seed of seeds) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      const signature = grammarQuestionVariantSignature(question);
      if (!signature) {
        missing.push(`${template.id}:${seed}`);
        continue;
      }
      const key = `${signature}`;
      const entry = {
        templateId: template.id,
        generatorFamilyId: template.generatorFamilyId,
        seed,
        signature,
      };
      samples.push(entry);
      const previous = seen.get(key);
      if (previous && previous.templateId !== template.id) {
        collisions.push({ signature, first: previous, second: entry });
      } else if (previous && previous.seed !== seed) {
        const repeated = { signature, first: previous, second: entry };
        if (strictVariantTemplate) repeatedVariants.push(repeated);
        else legacyRepeatedVariants.push(repeated);
      } else {
        seen.set(key, entry);
      }
    }
  }

  return {
    sampledSeeds: seeds.slice(),
    missingGeneratorMetadata: uniqueSorted(missing),
    generatedSignatureCollisions: collisions,
    repeatedGeneratedVariants: repeatedVariants,
    legacyRepeatedGeneratedVariants: legacyRepeatedVariants,
    sampleCount: samples.length,
    samples,
  };
}

function buildAnswerSpecAudit(seeds) {
  const required = GRAMMAR_TEMPLATE_METADATA.filter((template) => template.requiresAnswerSpec);
  const constructed = GRAMMAR_TEMPLATE_METADATA.filter((template) => !template.isSelectedResponse);
  const missing = [];
  const invalid = [];
  const kindCounts = {};
  for (const template of required) {
    const kind = template.answerSpecKind || 'missing';
    kindCounts[kind] = (kindCounts[kind] || 0) + 1;
  }

  for (const template of required) {
    for (const seed of seeds) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      if (!question?.answerSpec) {
        missing.push(`${template.id}:${seed}`);
        continue;
      }
      if (template.answerSpecKind && question.answerSpec.kind !== template.answerSpecKind) {
        invalid.push({
          templateId: template.id,
          seed,
          reason: `expected kind ${template.answerSpecKind}, got ${question.answerSpec.kind || 'missing'}`,
        });
        continue;
      }
      try {
        validateAnswerSpec(question.answerSpec);
      } catch (err) {
        invalid.push({
          templateId: template.id,
          seed,
          reason: err?.message || String(err),
        });
      }
    }
  }

  return {
    answerSpecTemplateCount: required.length,
    answerSpecKindCounts: Object.fromEntries(Object.entries(kindCounts).sort(([a], [b]) => a.localeCompare(b))),
    constructedResponseTemplateCount: constructed.length,
    constructedResponseAnswerSpecTemplateCount: constructed.filter((template) => template.requiresAnswerSpec).length,
    legacyAdapterTemplateCount: constructed.filter((template) => !template.requiresAnswerSpec).length,
    manualReviewOnlyTemplateCount: required.filter((template) => template.answerSpecKind === 'manualReviewOnly').length,
    p2MigrationComplete: constructed.every((template) => template.requiresAnswerSpec),
    templatesMissingAnswerSpecs: uniqueSorted(missing),
    invalidAnswerSpecs: invalid,
  };
}

export function buildGrammarQuestionGeneratorAudit({ seeds = DEFAULT_SEEDS } = {}) {
  const selectedResponseCount = GRAMMAR_TEMPLATE_METADATA.filter((template) => template.isSelectedResponse).length;
  const generatedTemplateCount = GRAMMAR_TEMPLATE_METADATA.filter((template) => template.generative).length;
  const conceptCoverage = buildConceptCoverage();
  const signatureAudit = buildSignatureAudit(seeds.map((seed) => Number(seed)).filter(Number.isFinite));
  const answerSpecAudit = buildAnswerSpecAudit(seeds.map((seed) => Number(seed)).filter(Number.isFinite));
  const templateIds = GRAMMAR_TEMPLATE_METADATA.map((template) => template.id);
  const duplicateTemplateIds = templateIds.filter((id, index) => templateIds.indexOf(id) !== index);

  return {
    releaseId: GRAMMAR_CONTENT_RELEASE_ID,
    conceptCount: GRAMMAR_CONCEPTS.length,
    templateCount: GRAMMAR_TEMPLATE_METADATA.length,
    selectedResponseCount,
    constructedResponseCount: GRAMMAR_TEMPLATE_METADATA.length - selectedResponseCount,
    generatedTemplateCount,
    fixedTemplateCount: GRAMMAR_TEMPLATE_METADATA.length - generatedTemplateCount,
    questionTypes: uniqueSorted(GRAMMAR_TEMPLATE_METADATA.map((template) => template.questionType)),
    duplicateTemplateIds: uniqueSorted(duplicateTemplateIds),
    thinPoolConcepts: conceptCoverage.filter((row) => row.total <= 2),
    singleQuestionTypeConcepts: conceptCoverage.filter((row) => row.questionTypes.length <= 1),
    conceptCoverage,
    ...signatureAudit,
    ...answerSpecAudit,
  };
}

function formatSummary(audit) {
  const lines = [
    `Grammar generator audit: ${audit.releaseId}`,
    `Templates: ${audit.templateCount} (${audit.generatedTemplateCount} generated, ${audit.fixedTemplateCount} fixed)`,
    `Response surface: ${audit.selectedResponseCount} selected-response, ${audit.constructedResponseCount} constructed-response`,
    `Thin pools: ${audit.thinPoolConcepts.map((row) => `${row.conceptId}:${row.total}`).join(', ') || 'none'}`,
    `Single-type pools: ${audit.singleQuestionTypeConcepts.map((row) => `${row.conceptId}:${row.questionTypes.join('/')}`).join(', ') || 'none'}`,
    `Generated signature samples: ${audit.sampleCount}`,
    `Cross-template signature collisions: ${audit.generatedSignatureCollisions.length}`,
    `Repeated strict P1 variants within a template: ${audit.repeatedGeneratedVariants.length}`,
    `Legacy/advisory repeated variants within a template: ${audit.legacyRepeatedGeneratedVariants.length}`,
    `Answer-spec templates: ${audit.answerSpecTemplateCount}`,
    `Constructed-response answer-spec templates: ${audit.constructedResponseAnswerSpecTemplateCount}/${audit.constructedResponseTemplateCount}`,
    `Legacy adapter templates: ${audit.legacyAdapterTemplateCount}`,
    `Manual-review-only templates: ${audit.manualReviewOnlyTemplateCount}`,
  ];
  if (audit.duplicateTemplateIds.length) lines.push(`Duplicate template ids: ${audit.duplicateTemplateIds.join(', ')}`);
  if (audit.missingGeneratorMetadata.length) lines.push(`Missing generator metadata: ${audit.missingGeneratorMetadata.join(', ')}`);
  if (audit.templatesMissingAnswerSpecs.length) lines.push(`Missing answerSpecs: ${audit.templatesMissingAnswerSpecs.join(', ')}`);
  if (audit.invalidAnswerSpecs.length) lines.push(`Invalid answerSpecs: ${audit.invalidAnswerSpecs.map((row) => `${row.templateId}:${row.seed}`).join(', ')}`);
  return lines.join('\n');
}

async function main(argv) {
  const seedArg = argv.find((arg) => arg.startsWith('--seeds='));
  const seeds = seedArg ? seedArg.slice('--seeds='.length).split(',').map(Number).filter(Number.isFinite) : DEFAULT_SEEDS;
  const audit = buildGrammarQuestionGeneratorAudit({ seeds });
  const writeFixtureIndex = argv.indexOf('--write-fixture');
  if (writeFixtureIndex >= 0) {
    const targetArg = argv[writeFixtureIndex + 1] || 'tests/fixtures/grammar-legacy-oracle/grammar-qg-p1-baseline.json';
    const target = path.resolve(rootDir, targetArg);
    await writeFile(target, `${JSON.stringify(audit, null, 2)}\n`);
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify(audit, null, 2));
  } else {
    console.log(formatSummary(audit));
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
