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

function thresholdValueForSkill(thresholds, globalKey, bySkillKey, skillId, fallback = 0) {
  const skillValue = Number(thresholds?.[bySkillKey]?.[skillId]);
  if (Number.isFinite(skillValue)) return skillValue;
  return thresholdValue(thresholds, globalKey, fallback);
}

function failureDetail(code, message, detail = {}) {
  return {
    code,
    message,
    ...detail,
  };
}

function buildFailureDetails({ validation, generatorFamilies, generatedDuplicates, bySkill, generatedFailures, thresholds }) {
  const failures = validation.errors.map((message) => failureDetail('manifest_validation', message));
  if (thresholds?.requireTemplatesForPublishedFamilies !== false) {
    for (const family of generatorFamilies) {
      if (family.published && family.generatedItemCount === 0) {
        failures.push(failureDetail(
          'generated_family_empty',
          `Published generator family ${family.id} produced no generated items.`,
          {
            familyId: family.id,
            skillId: family.skillId,
            actual: family.generatedItemCount,
            expected: 1,
          },
        ));
      }
    }
  }
  const minGeneratedItems = thresholdValue(thresholds, 'minGeneratedItemsPerPublishedFamily', 0);
  const minTemplates = thresholdValue(thresholds, 'minTemplatesPerPublishedFamily', 0);
  const minSignatures = thresholdValue(thresholds, 'minSignaturesPerPublishedFamily', 0);
  for (const family of generatorFamilies) {
    if (!family.published) continue;
    if (family.generatedItemCount < minGeneratedItems) {
      failures.push(failureDetail(
        'generated_family_minimum',
        `Published generator family ${family.id} has ${family.generatedItemCount} generated items; expected at least ${minGeneratedItems}.`,
        {
          familyId: family.id,
          skillId: family.skillId,
          actual: family.generatedItemCount,
          expected: minGeneratedItems,
        },
      ));
    }
    if (family.templateIds.length < minTemplates) {
      failures.push(failureDetail(
        'generated_template_minimum',
        `Published generator family ${family.id} has ${family.templateIds.length} distinct templates; expected at least ${minTemplates}.`,
        {
          familyId: family.id,
          skillId: family.skillId,
          actual: family.templateIds.length,
          expected: minTemplates,
        },
      ));
    }
    if (family.variantSignatures.length < minSignatures) {
      failures.push(failureDetail(
        'generated_signature_minimum',
        `Published generator family ${family.id} has ${family.variantSignatures.length} distinct signatures; expected at least ${minSignatures}.`,
        {
          familyId: family.id,
          skillId: family.skillId,
          actual: family.variantSignatures.length,
          expected: minSignatures,
        },
      ));
    }
  }
  if (thresholds?.failOnDuplicateGeneratedSignatures && generatedDuplicates.signatures.length) {
    failures.push(failureDetail(
      'duplicate_generated_signature',
      `Duplicate generated variant signatures: ${generatedDuplicates.signatures.length}.`,
      {
        duplicateCount: generatedDuplicates.signatures.length,
        groups: generatedDuplicates.signatures,
      },
    ));
  }
  if (thresholds?.failOnDuplicateGeneratedStems && generatedDuplicates.stems.length) {
    failures.push(failureDetail(
      'duplicate_generated_stem',
      `Duplicate generated stems: ${generatedDuplicates.stems.length}.`,
      {
        duplicateCount: generatedDuplicates.stems.length,
        groups: generatedDuplicates.stems,
      },
    ));
  }
  if (thresholds?.failOnDuplicateGeneratedModels && generatedDuplicates.models.length) {
    failures.push(failureDetail(
      'duplicate_generated_model',
      `Duplicate generated models: ${generatedDuplicates.models.length}.`,
      {
        duplicateCount: generatedDuplicates.models.length,
        groups: generatedDuplicates.models,
      },
    ));
  }
  const minGeneratedSignatures = thresholdValue(thresholds, 'minGeneratedSignaturesPerPublishedSkill', 0);
  for (const row of bySkill) {
    if (!row.published) continue;
    const skillMinGeneratedSignatures = thresholdValueForSkill(
      thresholds,
      'minGeneratedSignaturesPerPublishedSkill',
      'minGeneratedSignaturesBySkill',
      row.skillId,
      minGeneratedSignatures,
    );
    const skillMinValidatorCoverage = thresholdValueForSkill(
      thresholds,
      'minValidatorCoveragePerPublishedSkill',
      'minValidatorCoverageBySkill',
      row.skillId,
      0,
    );
    const skillMinFixedItems = thresholdValueForSkill(
      thresholds,
      'minFixedItemsPerPublishedSkill',
      'minFixedItemsBySkill',
      row.skillId,
      0,
    );
    if (row.generatedSignatureCount < skillMinGeneratedSignatures) {
      failures.push(failureDetail(
        'skill_generated_signature_minimum',
        `Published skill ${row.skillId} has ${row.generatedSignatureCount} generated signatures; expected at least ${skillMinGeneratedSignatures}.`,
        {
          skillId: row.skillId,
          actual: row.generatedSignatureCount,
          expected: skillMinGeneratedSignatures,
        },
      ));
    }
    if (row.validatorCoverageCount < skillMinValidatorCoverage) {
      failures.push(failureDetail(
        'validator_coverage_minimum',
        `Published skill ${row.skillId} has ${row.validatorCoverageCount} validator-covered runtime items; expected at least ${skillMinValidatorCoverage}.`,
        {
          skillId: row.skillId,
          actual: row.validatorCoverageCount,
          expected: skillMinValidatorCoverage,
        },
      ));
    }
    if (row.fixedItemCount < skillMinFixedItems) {
      failures.push(failureDetail(
        'fixed_anchor_minimum',
        `Published skill ${row.skillId} has ${row.fixedItemCount} fixed items; expected at least ${skillMinFixedItems}.`,
        {
          skillId: row.skillId,
          actual: row.fixedItemCount,
          expected: skillMinFixedItems,
        },
      ));
    }
  }
  if (thresholds?.requireGeneratedModelAnswersPass !== false) {
    for (const failure of generatedFailures) {
      failures.push(failureDetail(
        'generated_model_marking',
        `Generated model answer does not pass marking: ${failure.id} (${failure.familyId}/${failure.templateId}).`,
        failure,
      ));
    }
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
  const failureDetails = buildFailureDetails({
    validation,
    generatorFamilies,
    generatedDuplicates,
    bySkill,
    generatedFailures,
    thresholds,
  });
  const failures = failureDetails.map((failure) => failure.message);

  return {
    ok: failures.length === 0,
    failures,
    failureDetails,
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
    `generated duplicate signatures: ${audit.duplicates.generated.signatures.length}`,
    `generated duplicate stems: ${audit.duplicates.generated.stems.length}`,
    `generated duplicate models: ${audit.duplicates.generated.models.length}`,
    '',
    'Per-skill coverage:',
  ];
  for (const row of audit.bySkill) {
    lines.push(`- ${row.skillId}: fixed=${row.fixedItemCount}, generated=${row.generatedItemCount}, signatures=${row.generatedSignatureCount}, modes=${row.modeCoverage.join('|') || 'none'}, readiness=${row.readinessCoverage.join('|') || 'none'}, validators=${row.validatorCoverageCount}`);
  }
  lines.push('', 'Per-family generated coverage:');
  for (const row of audit.generatorFamilies) {
    lines.push(`- ${row.id}: generated=${row.generatedItemCount}, templates=${row.templateIds.length}, signatures=${row.variantSignatures.length}`);
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
  const numberAfter = (name, fallback) => {
    const index = argv.indexOf(name);
    if (index < 0 || index + 1 >= argv.length) return fallback;
    const value = Number(argv[index + 1]);
    return Number.isFinite(value) ? value : fallback;
  };
  const mapAfter = (name) => Object.fromEntries(String(valueAfter(name, '') || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [key, rawValue] = entry.split('=');
      return [key, Number(rawValue)];
    })
    .filter(([key, value]) => key && Number.isFinite(value)));
  return {
    json: args.has('--json'),
    strict: args.has('--strict'),
    failOnDuplicateGeneratedSignatures: args.has('--fail-on-duplicate-generated-signatures')
      || args.has('--fail-on-duplicate-generated-content'),
    failOnDuplicateGeneratedContent: args.has('--fail-on-duplicate-generated-content'),
    generatedPerFamily: numberAfter('--generated-per-family', 1) || 1,
    minGeneratedItemsPerPublishedFamily: numberAfter('--min-generated-per-family', null),
    minTemplatesPerPublishedFamily: numberAfter('--min-templates-per-family', null),
    minSignaturesPerPublishedFamily: numberAfter('--min-signatures-per-family', null),
    minGeneratedSignaturesPerPublishedSkill: numberAfter('--min-generated-signatures-per-skill', null),
    minValidatorCoveragePerPublishedSkill: numberAfter('--min-validator-coverage-per-skill', null),
    minFixedItemsPerPublishedSkill: numberAfter('--min-fixed-items-per-skill', null),
    minGeneratedSignaturesBySkill: mapAfter('--min-generated-signatures-by-skill'),
    minValidatorCoverageBySkill: mapAfter('--min-validator-coverage-by-skill'),
    minFixedItemsBySkill: mapAfter('--min-fixed-items-by-skill'),
  };
}

function optionalThresholds(args) {
  return Object.fromEntries([
    ['minGeneratedItemsPerPublishedFamily', args.minGeneratedItemsPerPublishedFamily],
    ['minTemplatesPerPublishedFamily', args.minTemplatesPerPublishedFamily],
    ['minSignaturesPerPublishedFamily', args.minSignaturesPerPublishedFamily],
    ['minGeneratedSignaturesPerPublishedSkill', args.minGeneratedSignaturesPerPublishedSkill],
    ['minValidatorCoveragePerPublishedSkill', args.minValidatorCoveragePerPublishedSkill],
    ['minFixedItemsPerPublishedSkill', args.minFixedItemsPerPublishedSkill],
  ].filter(([, value]) => Number.isFinite(value)));
}

function cliThresholds(args) {
  const strictThresholds = args.strict
    ? {
        failOnDuplicateGeneratedSignatures: true,
        failOnDuplicateGeneratedStems: args.failOnDuplicateGeneratedContent,
        failOnDuplicateGeneratedModels: args.failOnDuplicateGeneratedContent,
        minGeneratedItemsPerPublishedFamily: args.generatedPerFamily,
        minTemplatesPerPublishedFamily: args.generatedPerFamily,
        minSignaturesPerPublishedFamily: args.generatedPerFamily,
        minGeneratedSignaturesPerPublishedSkill: 1,
        minValidatorCoveragePerPublishedSkill: 1,
      }
    : {
        failOnDuplicateGeneratedSignatures: args.failOnDuplicateGeneratedSignatures,
        failOnDuplicateGeneratedStems: args.failOnDuplicateGeneratedContent,
        failOnDuplicateGeneratedModels: args.failOnDuplicateGeneratedContent,
      };
  return {
    ...strictThresholds,
    ...optionalThresholds(args),
    ...(Object.keys(args.minGeneratedSignaturesBySkill).length
      ? { minGeneratedSignaturesBySkill: args.minGeneratedSignaturesBySkill }
      : {}),
    ...(Object.keys(args.minValidatorCoverageBySkill).length
      ? { minValidatorCoverageBySkill: args.minValidatorCoverageBySkill }
      : {}),
    ...(Object.keys(args.minFixedItemsBySkill).length
      ? { minFixedItemsBySkill: args.minFixedItemsBySkill }
      : {}),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const audit = runPunctuationContentAudit({
    generatedPerFamily: args.generatedPerFamily,
    thresholds: cliThresholds(args),
  });
  process.stdout.write(args.json
    ? `${JSON.stringify(audit, null, 2)}\n`
    : formatPunctuationContentAudit(audit));
  if (!audit.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
