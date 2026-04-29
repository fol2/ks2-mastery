#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

import {
  createPunctuationContentIndexes,
  PUNCTUATION_CONTENT_MANIFEST,
  validatePunctuationManifest,
} from '../shared/punctuation/content.js';
import {
  createPunctuationGeneratedItems,
  createPunctuationRuntimeManifest,
  GENERATED_TEMPLATE_BANK,
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

function hasValidatorOrRubricCoverage(item) {
  return isPlainObject(item.validator) || isPlainObject(item.rubric);
}

function hasAnswerContractCoverage(item) {
  return item.mode === 'choose' || hasValidatorOrRubricCoverage(item);
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

function thresholdValueForFamily(thresholds, globalKey, byFamilyKey, familyId, fallback = 0) {
  const familyValue = Number(thresholds?.[byFamilyKey]?.[familyId]);
  if (Number.isFinite(familyValue)) return familyValue;
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
    const familyMinGeneratedItems = thresholdValueForFamily(
      thresholds,
      'minGeneratedItemsPerPublishedFamily',
      'minGeneratedItemsByFamily',
      family.id,
      minGeneratedItems,
    );
    const familyMinTemplates = thresholdValueForFamily(
      thresholds,
      'minTemplatesPerPublishedFamily',
      'minTemplatesByFamily',
      family.id,
      minTemplates,
    );
    const familyMinSignatures = thresholdValueForFamily(
      thresholds,
      'minSignaturesPerPublishedFamily',
      'minSignaturesByFamily',
      family.id,
      minSignatures,
    );
    if (family.generatedItemCount < familyMinGeneratedItems) {
      failures.push(failureDetail(
        'generated_family_minimum',
        `Published generator family ${family.id} has ${family.generatedItemCount} generated items; expected at least ${familyMinGeneratedItems}.`,
        {
          familyId: family.id,
          skillId: family.skillId,
          actual: family.generatedItemCount,
          expected: familyMinGeneratedItems,
        },
      ));
    }
    if (family.templateIds.length < familyMinTemplates) {
      failures.push(failureDetail(
        'generated_template_minimum',
        `Published generator family ${family.id} has ${family.templateIds.length} distinct templates; expected at least ${familyMinTemplates}.`,
        {
          familyId: family.id,
          skillId: family.skillId,
          actual: family.templateIds.length,
          expected: familyMinTemplates,
        },
      ));
    }
    if (family.variantSignatures.length < familyMinSignatures) {
      failures.push(failureDetail(
        'generated_signature_minimum',
        `Published generator family ${family.id} has ${family.variantSignatures.length} distinct signatures; expected at least ${familyMinSignatures}.`,
        {
          familyId: family.id,
          skillId: family.skillId,
          actual: family.variantSignatures.length,
          expected: familyMinSignatures,
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
  contextPack = null,
  thresholds = {},
} = {}) {
  const validation = validatePunctuationManifest(manifest);
  const fixedIndexes = createPunctuationContentIndexes(manifest);
  const generatedItems = createPunctuationGeneratedItems({
    manifest,
    seed,
    perFamily: generatedPerFamily,
    contextPack,
  });
  const runtimeManifest = createPunctuationRuntimeManifest({
    manifest,
    seed,
    generatedPerFamily,
    contextPack,
    allowContextPacks: Boolean(contextPack),
  });
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
      choiceItemCount: runtimeSkillItems.filter((item) => item.mode === 'choose').length,
      answerContractCoverageCount: runtimeSkillItems.filter(hasAnswerContractCoverage).length,
      validatorCoverageCount: runtimeSkillItems.filter(hasValidatorOrRubricCoverage).length,
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
    lines.push(`- ${row.skillId}: fixed=${row.fixedItemCount}, generated=${row.generatedItemCount}, signatures=${row.generatedSignatureCount}, modes=${row.modeCoverage.join('|') || 'none'}, readiness=${row.readinessCoverage.join('|') || 'none'}, choices=${row.choiceItemCount}, answerContracts=${row.answerContractCoverageCount}, validators=${row.validatorCoverageCount}`);
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

// ─── Reviewer report helpers ────────────────────────────────────────────────

/** @typedef {'Fail' | 'Warning' | 'Info'} Severity */

function finding(severity, code, message, detail = {}) {
  return { severity, code, message, ...detail };
}

function groupByNormalisedText(items, textFn) {
  const groups = new Map();
  for (const item of items) {
    const text = normaliseAuditText(textFn(item));
    if (!text) continue;
    if (!groups.has(text)) groups.set(text, []);
    groups.get(text).push(item.id);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, ids: ids.sort(), count: ids.length }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * Group generated items into mode-scoped clusters by a text key (stem or model).
 * Returns clusters where 2+ items share the same normalised text within the same mode.
 */
function groupDuplicatesByMode(items, textFn) {
  const groups = new Map();
  for (const item of items) {
    const text = normaliseAuditText(textFn(item));
    if (!text) continue;
    const key = `${text}::${item.mode || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()]
    .filter(([, cluster]) => cluster.length > 1)
    .map(([key, cluster]) => {
      const [normText, mode] = key.split('::');
      const familyIds = [...new Set(cluster.map((item) => item.generatorFamilyId || ''))].sort();
      const templateIds = [...new Set(cluster.map((item) => item.templateId || ''))].sort();
      const variantSignatures = [...new Set(cluster.map((item) => item.variantSignature || ''))].sort();
      return {
        clusterKey: key,
        normalisedText: normText,
        mode,
        familyIds,
        templateIds,
        variantSignatures,
        itemIds: cluster.map((item) => item.id).sort(),
        count: cluster.length,
      };
    })
    .sort((a, b) => b.count - a.count || a.clusterKey.localeCompare(b.clusterKey));
}

/**
 * Build stem/model duplicate clusters at multiple depths, tracking which clusters
 * appear first at which depth.
 */
export function buildStemModelClusters({
  manifest = PUNCTUATION_CONTENT_MANIFEST,
  seed = manifest.releaseId || 'punctuation-audit',
  depths = [4, 6, 8],
} = {}) {
  const clustersByDepth = {};
  for (const depth of depths) {
    const items = createPunctuationGeneratedItems({ manifest, seed, perFamily: depth });
    clustersByDepth[depth] = {
      stems: groupDuplicatesByMode(items, (item) => item.stem),
      models: groupDuplicatesByMode(items, (item) => item.model),
    };
  }

  // Annotate each cluster with its first-appearance depth
  const allClusters = new Map(); // clusterKey -> { ...cluster, firstDepth, visibleAtDepths }
  for (const depth of depths) {
    for (const kind of ['stems', 'models']) {
      for (const cluster of clustersByDepth[depth][kind]) {
        if (!allClusters.has(`${kind}:${cluster.clusterKey}`)) {
          allClusters.set(`${kind}:${cluster.clusterKey}`, {
            ...cluster,
            kind,
            firstDepth: depth,
            visibleAtDepths: [depth],
          });
        } else {
          allClusters.get(`${kind}:${cluster.clusterKey}`).visibleAtDepths.push(depth);
        }
      }
    }
  }

  return {
    clustersByDepth,
    allClusters: [...allClusters.values()],
  };
}

/**
 * Load reviewer decisions from the fixture file.
 * Returns an empty object if the file does not exist.
 */
export function loadStemReviewDecisions() {
  const decisionPath = fileURLToPath(new URL(
    '../tests/fixtures/punctuation-duplicate-stem-decisions.json',
    import.meta.url,
  ));
  try {
    return JSON.parse(readFileSync(decisionPath, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Validate stem/model clusters against reviewer decisions.
 * Returns { ok, unreviewed } where unreviewed contains cluster keys needing a decision.
 */
export function validateStemReviewDecisions({ clusters, decisions, requestedDepth }) {
  const VALID_DECISIONS = new Set([
    'acceptable-intentional-overlap',
    'needs-rewrite',
    'acceptable-at-depth-4',
    'acceptable-at-depth-6',
    'acceptable-at-depth-8',
  ]);
  const unreviewed = [];
  for (const cluster of clusters) {
    // Only gate on clusters visible at or below the requested depth
    const isVisibleAtRequestedDepth = cluster.visibleAtDepths.some((d) => d <= requestedDepth);
    if (!isVisibleAtRequestedDepth) continue;
    const decision = decisions[cluster.clusterKey];
    if (!decision || !VALID_DECISIONS.has(decision)) {
      unreviewed.push(cluster.clusterKey);
    }
  }
  return { ok: unreviewed.length === 0, unreviewed };
}

function isDslBackedFamily(familyId) {
  const templates = GENERATED_TEMPLATE_BANK[familyId];
  if (!templates || !templates.length) return false;
  return templates.some((t) => isPlainObject(t.tests));
}

/** Check if generated items leak validator/rubric into learner-visible fields */
function redactionRiskFindings(generatedItems) {
  const LEARNER_VISIBLE_FIELDS = ['stem', 'prompt', 'explanation', 'options'];
  const risks = [];
  for (const item of generatedItems) {
    for (const field of LEARNER_VISIBLE_FIELDS) {
      const value = item[field];
      if (!value) continue;
      const text = Array.isArray(value) ? value.join(' ') : String(value);
      if (/\bvalidator\b/i.test(text) || /\brubric\b/i.test(text)) {
        risks.push({ itemId: item.id, field, snippet: text.slice(0, 80) });
      }
    }
  }
  return risks;
}

export function buildReviewerReport({
  audit,
  manifest = PUNCTUATION_CONTENT_MANIFEST,
  generatedItems = [],
  capacityDepth = 8,
  requireAllDsl = false,
  requireStemReview = false,
  requestedDepth = capacityDepth,
}) {
  const findings = [];

  // 1. Top duplicate generated stems
  const duplicateStems = groupByNormalisedText(generatedItems, (item) => item.stem).slice(0, 10);

  // 2. Top duplicate generated models
  const duplicateModels = groupByNormalisedText(generatedItems, (item) => item.model).slice(0, 10);

  // 3. Per-family spare capacity at capacityDepth
  const perFamilyCapacity = audit.generatorFamilies
    .filter((f) => f.published)
    .map((f) => {
      const productionSignatures = f.variantSignatures.length;
      // To compute capacity at depth 8 we check the template bank size
      const bankTemplates = GENERATED_TEMPLATE_BANK[f.id] || [];
      const distinctAtCapacity = Math.min(bankTemplates.length, capacityDepth);
      const spareCapacity = Math.max(0, distinctAtCapacity - productionSignatures);
      return {
        familyId: f.id,
        productionSignatures,
        capacitySignatures: distinctAtCapacity,
        spareCapacity,
        isDsl: isDslBackedFamily(f.id),
      };
    });

  // 4. Per-skill mode coverage
  const perSkillModes = audit.bySkill.map((row) => ({
    skillId: row.skillId,
    modes: row.modeCoverage,
  }));

  // 5. Per-skill validator/rubric coverage
  const perSkillValidatorCoverage = audit.bySkill.map((row) => ({
    skillId: row.skillId,
    validatorCoverageCount: row.validatorCoverageCount,
    totalRuntimeItems: row.runtimeItemCount,
    hasValidators: row.validatorCoverageCount > 0,
  }));

  // 6. Per-family template count
  const perFamilyTemplateCount = audit.generatorFamilies
    .filter((f) => f.published)
    .map((f) => ({
      familyId: f.id,
      templateCount: f.templateIds.length,
      isDsl: isDslBackedFamily(f.id),
    }));

  // 7. Per-family signature count
  const perFamilySignatureCount = audit.generatorFamilies
    .filter((f) => f.published)
    .map((f) => ({
      familyId: f.id,
      signatureCount: f.variantSignatures.length,
    }));

  // 8. Generated model-answer marking failures (already computed)
  const modelFailures = audit.generatedModelFailures || [];

  // 9. Templates missing accept/reject tests
  const templatesMissingTests = [];
  for (const [familyId, templates] of Object.entries(GENERATED_TEMPLATE_BANK)) {
    if (!isDslBackedFamily(familyId)) continue;
    for (let i = 0; i < templates.length; i += 1) {
      const t = templates[i];
      if (!isPlainObject(t.tests)) {
        templatesMissingTests.push({ familyId, templateIndex: i });
      }
    }
  }

  // 10. Templates with no alternate-answer test
  const templatesNoAlternateTest = [];
  const ALTERNATE_FAMILIES = new Set(['dash_clause', 'apostrophe', 'speech']);
  for (const [familyId, templates] of Object.entries(GENERATED_TEMPLATE_BANK)) {
    if (!isDslBackedFamily(familyId)) continue;
    const familySkillHint = familyId.replace(/^gen_/, '').replace(/_(?:fix|insert|combine)$/, '');
    const needsAlternates = [...ALTERNATE_FAMILIES].some((s) => familySkillHint.includes(s));
    if (!needsAlternates) continue;
    for (let i = 0; i < templates.length; i += 1) {
      const t = templates[i];
      if (!isPlainObject(t.tests)) continue;
      const acceptArray = Array.isArray(t.tests.accept) ? t.tests.accept : [];
      if (acceptArray.length <= 1) {
        templatesNoAlternateTest.push({
          familyId,
          templateIndex: i,
          model: t.model || '',
        });
      }
    }
  }

  // 11. Families using legacy non-DSL templates
  const legacyFamilies = Object.keys(GENERATED_TEMPLATE_BANK)
    .filter((familyId) => !isDslBackedFamily(familyId))
    .sort();

  // 12. Duplicate stem/model clusters (mode-scoped, depth-gated)
  const stemModelClusterData = buildStemModelClusters({
    manifest,
    seed: audit.seed || manifest.releaseId || 'punctuation-audit',
    depths: [4, 6, 8],
  });
  const stemModelClusters = stemModelClusterData.allClusters;
  const stemModelDecisions = loadStemReviewDecisions();
  const stemReviewValidation = requireStemReview
    ? validateStemReviewDecisions({
        clusters: stemModelClusters,
        decisions: stemModelDecisions,
        requestedDepth,
      })
    : { ok: true, unreviewed: [] };

  // ─── Severity-classified findings ───────────────────────────────────────────

  // Section 2: Duplicate variant signatures → Fail
  const allSignatures = generatedItems.map((item) => item.variantSignature).filter(Boolean);
  const signatureGroups = groupByNormalisedText(
    generatedItems.filter((item) => item.variantSignature),
    (item) => item.variantSignature,
  );
  for (const group of signatureGroups) {
    findings.push(finding('Fail', 'duplicate_variant_signature',
      `Duplicate variant signature: "${group.key}" (${group.count} items)`,
      { detail: { signature: group.key, ids: group.ids } },
    ));
  }

  // Model-answer marking failures → Fail
  for (const f of modelFailures) {
    findings.push(finding('Fail', 'model_answer_fails_marking',
      `Model answer fails marking: ${f.id} (${f.familyId}/${f.templateId})`,
      { detail: { id: f.id, familyId: f.familyId, templateId: f.templateId } },
    ));
  }

  // Missing validator/rubric (non-choose free-text skills with zero validators) → Fail
  for (const row of perSkillValidatorCoverage) {
    if (!row.hasValidators && row.totalRuntimeItems > 0) {
      const skillRow = audit.bySkill.find((s) => s.skillId === row.skillId);
      const hasNonChooseItems = skillRow && (skillRow.runtimeItemCount - skillRow.choiceItemCount) > 0;
      if (hasNonChooseItems) {
        findings.push(finding('Fail', 'missing_validator_rubric',
          `Skill "${row.skillId}" has ${row.totalRuntimeItems} runtime items but 0 validator/rubric coverage`,
          { detail: { skillId: row.skillId } },
        ));
      }
    }
  }

  // Missing golden tests for DSL template → Fail
  for (const entry of templatesMissingTests) {
    findings.push(finding('Fail', 'missing_golden_tests',
      `DSL template missing golden tests: ${entry.familyId}[${entry.templateIndex}]`,
      { detail: { familyId: entry.familyId, templateIndex: entry.templateIndex } },
    ));
  }

  // Duplicate stems → Warning
  for (const group of duplicateStems) {
    findings.push(finding('Warning', 'duplicate_stem',
      `Duplicate stem: "${group.key}" (${group.count} items)`,
      { detail: { stem: group.key, ids: group.ids } },
    ));
  }

  // Duplicate models → Warning
  for (const group of duplicateModels) {
    findings.push(finding('Warning', 'duplicate_model',
      `Duplicate model: "${group.key}" (${group.count} items)`,
      { detail: { model: group.key, ids: group.ids } },
    ));
  }

  // Thin mode coverage (skill with only 1 mode) → Warning
  for (const row of perSkillModes) {
    if (row.modes.length === 1) {
      findings.push(finding('Warning', 'thin_mode_coverage',
        `Skill "${row.skillId}" has only 1 mode: ${row.modes[0]}`,
        { detail: { skillId: row.skillId, modes: row.modes } },
      ));
    }
  }

  // Low capacity depth (spare = 0) → Warning
  for (const row of perFamilyCapacity) {
    if (row.spareCapacity === 0 && row.capacitySignatures > 0) {
      findings.push(finding('Warning', 'low_capacity_depth',
        `Family "${row.familyId}" has zero spare capacity at depth ${capacityDepth}`,
        { detail: { familyId: row.familyId, productionSignatures: row.productionSignatures, capacitySignatures: row.capacitySignatures } },
      ));
    }
  }

  // Legacy non-DSL families → Warning (or Fail with --require-all-dsl)
  const legacySeverity = requireAllDsl ? 'Fail' : 'Warning';
  for (const familyId of legacyFamilies) {
    findings.push(finding(legacySeverity, 'legacy_non_dsl_family',
      `Family "${familyId}" uses legacy non-DSL templates`,
      { detail: { familyId } },
    ));
  }

  // Redaction risk checks (Section 10) → Fail
  const redactionRisks = redactionRiskFindings(generatedItems);
  for (const risk of redactionRisks) {
    findings.push(finding('Fail', 'read_model_forbidden_field',
      `Generated item "${risk.itemId}" exposes validator/rubric in learner-visible field "${risk.field}"`,
      { detail: risk },
    ));
  }

  // Unreviewed stem/model clusters at requested depth → Fail (only when --require-stem-review)
  if (requireStemReview && !stemReviewValidation.ok) {
    for (const clusterKey of stemReviewValidation.unreviewed) {
      findings.push(finding('Fail', 'unreviewed_stem_model_cluster',
        `Unreviewed duplicate stem/model cluster at depth ${requestedDepth}: "${clusterKey}"`,
        { detail: { clusterKey, requestedDepth } },
      ));
    }
  }

  // Coverage signals → Info
  const dslFamilyCount = Object.keys(GENERATED_TEMPLATE_BANK).filter(isDslBackedFamily).length;
  const totalFamilyCount = Object.keys(GENERATED_TEMPLATE_BANK).length;
  findings.push(finding('Info', 'dsl_coverage_ratio',
    `DSL coverage: ${dslFamilyCount}/${totalFamilyCount} families are DSL-backed`,
    { detail: { dslFamilyCount, totalFamilyCount, ratio: totalFamilyCount > 0 ? dslFamilyCount / totalFamilyCount : 0 } },
  ));

  // Capacity headroom → Info
  const totalSpare = perFamilyCapacity.reduce((sum, row) => sum + row.spareCapacity, 0);
  findings.push(finding('Info', 'capacity_headroom',
    `Total spare capacity headroom across all families: ${totalSpare}`,
    { detail: { totalSpare, capacityDepth } },
  ));

  // Stem/model cluster summary → Info
  findings.push(finding('Info', 'stem_model_cluster_summary',
    `Duplicate stem/model clusters (mode-scoped): ${stemModelClusters.length} total`,
    { detail: { totalClusters: stemModelClusters.length, reviewedCount: stemModelClusters.length - stemReviewValidation.unreviewed.length } },
  ));

  // ─── Summary ────────────────────────────────────────────────────────────────

  const severityCounts = { fail: 0, warning: 0, info: 0 };
  for (const f of findings) {
    if (f.severity === 'Fail') severityCounts.fail += 1;
    else if (f.severity === 'Warning') severityCounts.warning += 1;
    else severityCounts.info += 1;
  }

  const fixedItems = audit.summary.fixedItemCount;
  const generatedItemCount = audit.summary.generatedItemCount;
  const totalItems = audit.summary.runtimeItemCount;
  const releaseId = manifest.releaseId || null;
  const publishedRewardUnits = audit.summary.publishedRewardUnitCount;
  const dslCoverage = totalFamilyCount > 0 ? dslFamilyCount / totalFamilyCount : 0;

  // Golden test coverage per DSL family/template (Section 8)
  const goldenTestCoverage = [];
  for (const [familyId, templates] of Object.entries(GENERATED_TEMPLATE_BANK)) {
    if (!isDslBackedFamily(familyId)) continue;
    const total = templates.length;
    const covered = templates.filter((t) => isPlainObject(t.tests)).length;
    goldenTestCoverage.push({ familyId, covered, total, ratio: total > 0 ? covered / total : 0 });
  }

  // Recommended reviewer actions (Section 11)
  const recommendedActions = [];
  if (severityCounts.fail > 0) {
    recommendedActions.push(`Fix ${severityCounts.fail} Fail-severity finding(s) before merging.`);
  }
  if (legacyFamilies.length > 0) {
    recommendedActions.push(`Convert ${legacyFamilies.length} legacy families to DSL-backed templates.`);
  }
  if (templatesMissingTests.length > 0) {
    recommendedActions.push(`Add golden tests to ${templatesMissingTests.length} DSL template(s) missing coverage.`);
  }
  if (modelFailures.length > 0) {
    recommendedActions.push(`Investigate ${modelFailures.length} model-answer marking failure(s).`);
  }
  if (redactionRisks.length > 0) {
    recommendedActions.push(`Review ${redactionRisks.length} generated item(s) leaking validator/rubric into learner-visible fields.`);
  }
  if (severityCounts.fail === 0 && severityCounts.warning === 0) {
    recommendedActions.push('All clear — no actionable findings.');
  }

  const summary = {
    fixedItems,
    generatedItems: generatedItemCount,
    totalItems,
    releaseId,
    rewardUnits: publishedRewardUnits,
    dslCoverage,
    severityCounts,
  };

  return {
    summary,
    findings,
    duplicateStems,
    duplicateModels,
    stemModelClusters,
    stemReviewValidation,
    perFamilyCapacity,
    perSkillModes,
    perSkillValidatorCoverage,
    perFamilyTemplateCount,
    perFamilySignatureCount,
    modelFailures,
    templatesMissingTests,
    templatesNoAlternateTest,
    legacyFamilies,
    goldenTestCoverage,
    redactionRisks,
    recommendedActions,
    capacityDepth,
  };
}

const SEVERITY_MARKERS = { Fail: '✗ Fail', Warning: '⚠ Warning', Info: 'ℹ Info' };

export function formatReviewerReport(report) {
  const lines = [
    '',
    '═══════════════════════════════════════════════════════════',
    'REVIEWER REPORT (informational — does not affect exit code)',
    '═══════════════════════════════════════════════════════════',
    '',
  ];

  // Section 1: Runtime summary
  lines.push('1. Runtime summary:');
  lines.push(`   Fixed items: ${report.summary.fixedItems}`);
  lines.push(`   Generated items: ${report.summary.generatedItems}`);
  lines.push(`   Total runtime items: ${report.summary.totalItems}`);
  lines.push(`   Reward units: ${report.summary.rewardUnits}`);
  lines.push(`   Release ID: ${report.summary.releaseId || '(none)'}`);
  lines.push(`   Severity: ${report.summary.severityCounts.fail} Fail, ${report.summary.severityCounts.warning} Warning, ${report.summary.severityCounts.info} Info`);
  lines.push('');

  // Section 2: DSL coverage ratio
  const dslInfo = report.findings.find((f) => f.code === 'dsl_coverage_ratio');
  lines.push('2. DSL coverage ratio:');
  if (dslInfo) {
    lines.push(`   ${dslInfo.detail.dslFamilyCount}/${dslInfo.detail.totalFamilyCount} families DSL-backed (${(report.summary.dslCoverage * 100).toFixed(0)}%)`);
  }
  lines.push('');

  // Section 3: Top duplicate generated stems
  lines.push('3. Top duplicate generated stems:');
  if (report.duplicateStems.length === 0) {
    lines.push('   (none)');
  } else {
    for (const entry of report.duplicateStems) {
      lines.push(`   ${SEVERITY_MARKERS.Warning} [${entry.count}x] "${entry.key}" — ${entry.ids.join(', ')}`);
    }
  }
  lines.push('');

  // Section 4: Top duplicate generated models
  lines.push('4. Top duplicate generated models:');
  if (report.duplicateModels.length === 0) {
    lines.push('   (none)');
  } else {
    for (const entry of report.duplicateModels) {
      lines.push(`   ${SEVERITY_MARKERS.Warning} [${entry.count}x] "${entry.key}" — ${entry.ids.join(', ')}`);
    }
  }
  lines.push('');

  // Section 5: Per-family spare capacity
  lines.push(`5. Per-family spare capacity at generatedPerFamily = ${report.capacityDepth}:`);
  for (const row of report.perFamilyCapacity) {
    const tag = row.isDsl ? '' : ' [legacy]';
    lines.push(`   - ${row.familyId}: production=${row.productionSignatures}, capacity=${row.capacitySignatures}, spare=${row.spareCapacity}${tag}`);
  }
  lines.push('');

  // Section 6: Per-skill mode coverage
  lines.push('6. Per-skill mode coverage:');
  for (const row of report.perSkillModes) {
    lines.push(`   - ${row.skillId}: ${row.modes.join(', ') || '(none)'}`);
  }
  lines.push('');

  // Section 7: Per-skill validator/rubric coverage
  lines.push('7. Per-skill validator/rubric coverage:');
  for (const row of report.perSkillValidatorCoverage) {
    lines.push(`   - ${row.skillId}: ${row.validatorCoverageCount}/${row.totalRuntimeItems} items`);
  }
  lines.push('');

  // Section 8: Golden test coverage per DSL family/template
  lines.push('8. Golden test coverage per DSL family:');
  if (!report.goldenTestCoverage || report.goldenTestCoverage.length === 0) {
    lines.push('   (none)');
  } else {
    for (const row of report.goldenTestCoverage) {
      lines.push(`   - ${row.familyId}: ${row.covered}/${row.total} templates covered (${(row.ratio * 100).toFixed(0)}%)`);
    }
  }
  lines.push('');

  // Section 9: Generated model-answer marking failures
  lines.push('9. Generated model-answer marking failures:');
  if (report.modelFailures.length === 0) {
    lines.push('   (none)');
  } else {
    for (const f of report.modelFailures) {
      lines.push(`   ${SEVERITY_MARKERS.Fail} ${f.id} (${f.familyId}/${f.templateId})`);
    }
  }
  lines.push('');

  // Section 10: Metadata/redaction risk checks
  lines.push('10. Metadata/redaction risk checks:');
  if (!report.redactionRisks || report.redactionRisks.length === 0) {
    lines.push('   (none)');
  } else {
    for (const risk of report.redactionRisks) {
      lines.push(`   ${SEVERITY_MARKERS.Fail} ${risk.itemId} leaks in "${risk.field}"`);
    }
  }
  lines.push('');

  // Section 11: Recommended reviewer actions
  lines.push('11. Recommended reviewer actions:');
  if (!report.recommendedActions || report.recommendedActions.length === 0) {
    lines.push('   (none)');
  } else {
    for (const action of report.recommendedActions) {
      lines.push(`   - ${action}`);
    }
  }
  lines.push('');

  // Section 12: Duplicate Stem/Model Clusters (mode-scoped, depth-gated)
  lines.push('12. Duplicate Stem/Model Clusters (mode-scoped):');
  if (!report.stemModelClusters || report.stemModelClusters.length === 0) {
    lines.push(`   0 clusters — no mode-scoped duplicate stems or models detected.`);
  } else {
    lines.push(`   ${report.stemModelClusters.length} cluster(s) detected:`);
    for (const cluster of report.stemModelClusters) {
      const textPreview = cluster.normalisedText.length > 80
        ? `${cluster.normalisedText.slice(0, 80)}...`
        : cluster.normalisedText;
      const depthFlags = [4, 6, 8].map((d) => {
        const visible = cluster.visibleAtDepths.includes(d);
        return `depth-${d}: ${visible ? 'yes' : 'no'}`;
      }).join(', ');
      lines.push(`   - [${cluster.kind}] "${textPreview}" (mode=${cluster.mode})`);
      lines.push(`     families: ${cluster.familyIds.join(', ')}`);
      lines.push(`     templates: ${cluster.templateIds.join(', ')}`);
      lines.push(`     signatures: ${cluster.variantSignatures.length}`);
      lines.push(`     ${depthFlags}`);
      const decision = report.stemReviewValidation
        ? (loadStemReviewDecisions()[cluster.clusterKey] || '(unreviewed)')
        : '(review not required)';
      lines.push(`     decision: ${decision}`);
    }
  }
  lines.push('');

  // Severity-classified findings summary
  lines.push('─── Findings ───────────────────────────────────────────────');
  lines.push('');
  if (report.findings.length === 0) {
    lines.push('   (no findings)');
  } else {
    for (const f of report.findings) {
      lines.push(`   ${SEVERITY_MARKERS[f.severity]} ${f.message}`);
    }
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

class CliUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CliUsageError';
  }
}

function cliReferenceIds(manifest = PUNCTUATION_CONTENT_MANIFEST) {
  const indexes = createPunctuationContentIndexes(manifest);
  return {
    skillIds: new Set(indexes.skills.map((skill) => skill.id)),
    familyIds: new Set(indexes.generatorFamilies.map((family) => family.id)),
  };
}

function parseThresholdMap({ name, rawValue, validKeys, keyLabel }) {
  const map = {};
  const text = String(rawValue || '').trim();
  if (!text) return map;
  for (const rawEntry of text.split(',')) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const separator = entry.indexOf('=');
    if (separator <= 0 || separator === entry.length - 1) {
      throw new CliUsageError(`Malformed ${name} entry "${entry}". Expected ${keyLabel}=number.`);
    }
    const key = entry.slice(0, separator).trim();
    const rawNumber = entry.slice(separator + 1).trim();
    const value = Number(rawNumber);
    if (!key || !Number.isFinite(value)) {
      throw new CliUsageError(`Malformed ${name} entry "${entry}". Expected ${keyLabel}=number.`);
    }
    if (!validKeys.has(key)) {
      throw new CliUsageError(`Unknown ${keyLabel} "${key}" in ${name}.`);
    }
    if (Object.hasOwn(map, key)) {
      throw new CliUsageError(`Duplicate ${keyLabel} "${key}" in ${name}.`);
    }
    map[key] = value;
  }
  return map;
}

function parseArgs(argv, { manifest = PUNCTUATION_CONTENT_MANIFEST } = {}) {
  const args = new Set(argv);
  const valueAfter = (name, fallback) => {
    const index = argv.indexOf(name);
    if (index < 0) return fallback;
    if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
      throw new CliUsageError(`Missing value for ${name}.`);
    }
    return argv[index + 1];
  };
  const numberAfter = (name, fallback) => {
    const index = argv.indexOf(name);
    if (index < 0 || index + 1 >= argv.length) return fallback;
    if (argv[index + 1].startsWith('--')) {
      throw new CliUsageError(`Missing numeric value for ${name}.`);
    }
    const value = Number(argv[index + 1]);
    if (!Number.isFinite(value)) {
      throw new CliUsageError(`Invalid numeric value for ${name}: "${argv[index + 1]}".`);
    }
    return value;
  };
  const { skillIds, familyIds } = cliReferenceIds(manifest);
  const skillMapAfter = (name) => parseThresholdMap({
    name,
    rawValue: valueAfter(name, ''),
    validKeys: skillIds,
    keyLabel: 'skill id',
  });
  const familyMapAfter = (name) => parseThresholdMap({
    name,
    rawValue: valueAfter(name, ''),
    validKeys: familyIds,
    keyLabel: 'generator family id',
  });
  return {
    json: args.has('--json'),
    strict: args.has('--strict'),
    reviewerReport: args.has('--reviewer-report'),
    requireAllDsl: args.has('--require-all-dsl'),
    requireStemReview: args.has('--require-stem-review'),
    failOnDuplicateGeneratedSignatures: args.has('--fail-on-duplicate-generated-signatures')
      || args.has('--fail-on-duplicate-generated-content'),
    failOnDuplicateGeneratedContent: args.has('--fail-on-duplicate-generated-content'),
    generatedPerFamily: numberAfter('--generated-per-family', 1),
    minGeneratedItemsPerPublishedFamily: numberAfter('--min-generated-per-family', null),
    minTemplatesPerPublishedFamily: numberAfter('--min-templates-per-family', null),
    minSignaturesPerPublishedFamily: numberAfter('--min-signatures-per-family', null),
    minGeneratedSignaturesPerPublishedSkill: numberAfter('--min-generated-signatures-per-skill', null),
    minValidatorCoveragePerPublishedSkill: numberAfter('--min-validator-coverage-per-skill', null),
    minFixedItemsPerPublishedSkill: numberAfter('--min-fixed-items-per-skill', null),
    minGeneratedSignaturesBySkill: skillMapAfter('--min-generated-signatures-by-skill'),
    minValidatorCoverageBySkill: skillMapAfter('--min-validator-coverage-by-skill'),
    minFixedItemsBySkill: skillMapAfter('--min-fixed-items-by-skill'),
    minGeneratedItemsByFamily: familyMapAfter('--min-generated-by-family'),
    minTemplatesByFamily: familyMapAfter('--min-templates-by-family'),
    minSignaturesByFamily: familyMapAfter('--min-signatures-by-family'),
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
    ...(Object.keys(args.minGeneratedItemsByFamily).length
      ? { minGeneratedItemsByFamily: args.minGeneratedItemsByFamily }
      : {}),
    ...(Object.keys(args.minTemplatesByFamily).length
      ? { minTemplatesByFamily: args.minTemplatesByFamily }
      : {}),
    ...(Object.keys(args.minSignaturesByFamily).length
      ? { minSignaturesByFamily: args.minSignaturesByFamily }
      : {}),
  };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof CliUsageError) {
      process.stderr.write(`Punctuation content audit argument error: ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }
  const audit = runPunctuationContentAudit({
    generatedPerFamily: args.generatedPerFamily,
    thresholds: cliThresholds(args),
  });
  process.stdout.write(args.json
    ? `${JSON.stringify(audit, null, 2)}\n`
    : formatPunctuationContentAudit(audit));
  if (!audit.ok) process.exitCode = 1;

  if (args.reviewerReport) {
    const generatedItems = createPunctuationGeneratedItems({
      seed: PUNCTUATION_CONTENT_MANIFEST.releaseId || 'punctuation-audit',
      perFamily: args.generatedPerFamily,
    });
    const report = buildReviewerReport({
      audit,
      generatedItems,
      capacityDepth: 8,
      requireAllDsl: args.requireAllDsl,
      requireStemReview: args.requireStemReview,
      requestedDepth: args.generatedPerFamily,
    });
    if (args.json) {
      process.stdout.write(`${JSON.stringify({ reviewerReport: report }, null, 2)}\n`);
    } else {
      process.stdout.write(formatReviewerReport(report));
    }
    if (args.requireStemReview && !report.stemReviewValidation.ok) {
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
