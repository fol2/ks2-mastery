#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import {
  createPunctuationContentIndexes,
  PUNCTUATION_CONTENT_MANIFEST,
  validatePunctuationManifest,
} from '../shared/punctuation/content.js';
import {
  createPunctuationGeneratedItems,
  createPunctuationRuntimeManifest,
} from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normaliseAuditText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function groupDuplicates(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.id);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, ids: ids.sort() }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function hasValidatorCoverage(item) {
  if (item.mode === 'choose') return true;
  return isPlainObject(item.validator) || isPlainObject(item.rubric);
}

function readinessRowsFor(items) {
  const rows = new Set();
  for (const item of items) {
    for (const row of Array.isArray(item.readiness) ? item.readiness : []) rows.add(row);
    if (Array.isArray(item.misconceptionTags) && item.misconceptionTags.length) rows.add('misconception');
  }
  return [...rows].sort();
}

function generatedModelFailures(generatedItems) {
  const failures = [];
  for (const item of generatedItems) {
    const result = markPunctuationAnswer({ item, answer: { typed: item.model } });
    if (!result.correct) {
      failures.push({
        id: item.id,
        familyId: item.generatorFamilyId || '',
        templateId: item.templateId || '',
        variantSignature: item.variantSignature || '',
        misconceptionTags: result.misconceptionTags || [],
      });
    }
  }
  return failures;
}

function thresholdValue(thresholds, key, fallback = 0) {
  const value = Number(thresholds?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function buildFailures({ validation, generatorFamilies, generatedDuplicates, bySkill, generatedFailures, thresholds }) {
  const failures = [...validation.errors];
  if (thresholds?.requireTemplatesForPublishedFamilies !== false) {
    for (const family of generatorFamilies) {
      if (family.published && family.generatedItemCount === 0) {
        failures.push(`Published generator family ${family.id} produced no generated items.`);
      }
    }
  }
  if (thresholds?.failOnDuplicateGeneratedSignatures && generatedDuplicates.signatures.length) {
    failures.push(`Duplicate generated variant signatures: ${generatedDuplicates.signatures.length}.`);
  }
  if (thresholds?.failOnDuplicateGeneratedStems && generatedDuplicates.stems.length) {
    failures.push(`Duplicate generated stems: ${generatedDuplicates.stems.length}.`);
  }
  if (thresholds?.failOnDuplicateGeneratedModels && generatedDuplicates.models.length) {
    failures.push(`Duplicate generated models: ${generatedDuplicates.models.length}.`);
  }
  const minGeneratedSignatures = thresholdValue(thresholds, 'minGeneratedSignaturesPerPublishedSkill', 0);
  const minValidatorCoverage = thresholdValue(thresholds, 'minValidatorCoveragePerPublishedSkill', 0);
  for (const row of bySkill) {
    if (!row.published) continue;
    if (row.generatedSignatureCount < minGeneratedSignatures) {
      failures.push(`Published skill ${row.skillId} has ${row.generatedSignatureCount} generated signatures; expected at least ${minGeneratedSignatures}.`);
    }
    if (row.validatorCoverageCount < minValidatorCoverage) {
      failures.push(`Published skill ${row.skillId} has ${row.validatorCoverageCount} validator-covered runtime items; expected at least ${minValidatorCoverage}.`);
    }
  }
  for (const failure of generatedFailures) {
    failures.push(`Generated model answer does not pass marking: ${failure.id} (${failure.familyId}/${failure.templateId}).`);
  }
  return failures;
}

export function runPunctuationContentAudit({
  manifest = PUNCTUATION_CONTENT_MANIFEST,
  seed = manifest.releaseId || 'punctuation-audit',
  generatedPerFamily = 1,
  thresholds = {},
} = {}) {
  const validation = validatePunctuationManifest(manifest);
  const fixedIndexes = createPunctuationContentIndexes(manifest);
  const generatedItems = createPunctuationGeneratedItems({ manifest, seed, perFamily: generatedPerFamily });
  const runtimeManifest = createPunctuationRuntimeManifest({ manifest, seed, generatedPerFamily });
  const runtimeIndexes = createPunctuationContentIndexes(runtimeManifest);
  const fixedItems = fixedIndexes.items;
  const runtimeItems = runtimeIndexes.items;
  const generatedByFamily = new Map();
  for (const item of generatedItems) {
    const familyId = item.generatorFamilyId || '';
    if (!generatedByFamily.has(familyId)) generatedByFamily.set(familyId, []);
    generatedByFamily.get(familyId).push(item);
  }

  const bySkill = fixedIndexes.skills.map((skill) => {
    const fixedSkillItems = fixedItems.filter((item) => item.skillIds?.includes(skill.id));
    const runtimeSkillItems = runtimeItems.filter((item) => item.skillIds?.includes(skill.id));
    const generatedSkillItems = generatedItems.filter((item) => item.skillIds?.includes(skill.id));
    return {
      skillId: skill.id,
      published: skill.published === true,
      fixedItemCount: fixedSkillItems.length,
      runtimeItemCount: runtimeSkillItems.length,
      generatedItemCount: generatedSkillItems.length,
      generatedFamilyCount: fixedIndexes.generatorFamilies.filter((family) => family.published && family.skillId === skill.id).length,
      generatedSignatureCount: new Set(generatedSkillItems.map((item) => item.variantSignature).filter(Boolean)).size,
      modeCoverage: [...new Set(runtimeSkillItems.map((item) => item.mode).filter(Boolean))].sort(),
      readinessCoverage: readinessRowsFor(runtimeSkillItems),
      validatorCoverageCount: runtimeSkillItems.filter(hasValidatorCoverage).length,
    };
  });

  const generatorFamilies = fixedIndexes.generatorFamilies.map((family) => {
    const rows = generatedByFamily.get(family.id) || [];
    return {
      id: family.id,
      skillId: family.skillId,
      rewardUnitId: family.rewardUnitId,
      mode: family.mode,
      published: family.published === true,
      generatedItemCount: rows.length,
      templateIds: [...new Set(rows.map((item) => item.templateId).filter(Boolean))].sort(),
      variantSignatures: [...new Set(rows.map((item) => item.variantSignature).filter(Boolean))].sort(),
    };
  });

  const fixedDuplicates = {
    stems: groupDuplicates(fixedItems, (item) => normaliseAuditText(item.stem)),
    models: groupDuplicates(fixedItems, (item) => normaliseAuditText(item.model)),
  };
  const generatedDuplicates = {
    stems: groupDuplicates(generatedItems, (item) => normaliseAuditText(item.stem)),
    models: groupDuplicates(generatedItems, (item) => normaliseAuditText(item.model)),
    signatures: groupDuplicates(generatedItems, (item) => item.variantSignature || ''),
  };
  const generatedFailures = generatedModelFailures(generatedItems);
  const failures = buildFailures({
    validation,
    generatorFamilies,
    generatedDuplicates,
    bySkill,
    generatedFailures,
    thresholds,
  });

  return {
    ok: failures.length === 0,
    failures,
    seed,
    generatedPerFamily,
    summary: {
      fixedItemCount: fixedItems.length,
      generatorFamilyCount: fixedIndexes.generatorFamilies.length,
      generatedItemCount: generatedItems.length,
      runtimeItemCount: runtimeItems.length,
      publishedRewardUnitCount: fixedIndexes.publishedRewardUnits.length,
      publishedSkillCount: fixedIndexes.publishedSkillIds.length,
    },
    bySkill,
    generatorFamilies,
    duplicates: {
      fixed: fixedDuplicates,
      generated: generatedDuplicates,
    },
    generatedModelFailures: generatedFailures,
  };
}

export function formatPunctuationContentAudit(audit) {
  const lines = [
    'Punctuation content audit',
    `fixed items: ${audit.summary.fixedItemCount}`,
    `generator families: ${audit.summary.generatorFamilyCount}`,
    `generated items: ${audit.summary.generatedItemCount}`,
    `runtime items: ${audit.summary.runtimeItemCount}`,
    `published reward units: ${audit.summary.publishedRewardUnitCount}`,
    '',
    'Per-skill coverage:',
  ];
  for (const row of audit.bySkill) {
    lines.push(`- ${row.skillId}: fixed=${row.fixedItemCount}, generated=${row.generatedItemCount}, signatures=${row.generatedSignatureCount}, modes=${row.modeCoverage.join('|') || 'none'}, readiness=${row.readinessCoverage.join('|') || 'none'}, validators=${row.validatorCoverageCount}`);
  }
  if (audit.failures.length) {
    lines.push('', 'Failures:');
    for (const failure of audit.failures) lines.push(`- ${failure}`);
  }
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const args = new Set(argv);
  const valueAfter = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 && index + 1 < argv.length ? argv[index + 1] : fallback;
  };
  return {
    json: args.has('--json'),
    strict: args.has('--strict'),
    failOnDuplicateGeneratedSignatures: args.has('--fail-on-duplicate-generated-signatures')
      || args.has('--fail-on-duplicate-generated-content'),
    failOnDuplicateGeneratedContent: args.has('--fail-on-duplicate-generated-content'),
    generatedPerFamily: Number(valueAfter('--generated-per-family', 1)) || 1,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const audit = runPunctuationContentAudit({
    generatedPerFamily: args.generatedPerFamily,
    thresholds: args.strict
      ? {
          failOnDuplicateGeneratedSignatures: true,
          failOnDuplicateGeneratedStems: args.failOnDuplicateGeneratedContent,
          failOnDuplicateGeneratedModels: args.failOnDuplicateGeneratedContent,
          minGeneratedSignaturesPerPublishedSkill: 1,
          minValidatorCoveragePerPublishedSkill: 1,
        }
      : {
          failOnDuplicateGeneratedSignatures: args.failOnDuplicateGeneratedSignatures,
          failOnDuplicateGeneratedStems: args.failOnDuplicateGeneratedContent,
          failOnDuplicateGeneratedModels: args.failOnDuplicateGeneratedContent,
        },
  });
  process.stdout.write(args.json
    ? `${JSON.stringify(audit, null, 2)}\n`
    : formatPunctuationContentAudit(audit));
  if (!audit.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
