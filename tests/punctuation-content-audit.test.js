import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  PUNCTUATION_CONTENT_MANIFEST,
  validatePunctuationManifest,
} from '../shared/punctuation/content.js';
import {
  createPunctuationGeneratedItems,
} from '../shared/punctuation/generators.js';
import {
  runPunctuationContentAudit,
  buildReviewerReport,
  formatReviewerReport,
} from '../scripts/audit-punctuation-content.mjs';

const auditCliPath = fileURLToPath(new URL('../scripts/audit-punctuation-content.mjs', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const workflowPath = fileURLToPath(new URL('../.github/workflows/punctuation-content-audit.yml', import.meta.url));

const P2_U3_FIXED_THRESHOLDS = Object.freeze({
  sentence_endings: 8,
  apostrophe_contractions: 8,
  comma_clarity: 8,
  semicolon_list: 8,
  hyphen: 8,
  dash_clause: 8,
});

const P2_U6_PRIORITY_CAPACITY_FAMILIES = Object.freeze([
  'gen_sentence_endings_insert',
  'gen_apostrophe_contractions_fix',
  'gen_apostrophe_possession_insert',
  'gen_apostrophe_mix_paragraph',
  'gen_comma_clarity_insert',
  'gen_dash_clause_fix',
  'gen_dash_clause_combine',
  'gen_fronted_speech_paragraph',
  'gen_hyphen_insert',
  'gen_list_commas_insert',
  'gen_list_commas_combine',
  'gen_semicolon_list_fix',
  'gen_speech_insert',
]);

const P2_U6_PRIORITY_CAPACITY_FAMILY_IDS = new Set(P2_U6_PRIORITY_CAPACITY_FAMILIES);

const P2_U6_EXPECTED_CAPACITY_DUPLICATE_RESIDUALS = Object.freeze({
  stems: {
    groupCount: 7,
    priorityGroupCount: 0,
    priorityFamilies: [],
    familyGroupCounts: {
      gen_fronted_adverbial_combine: 7,
      gen_fronted_adverbial_fix: 7,
    },
  },
  models: {
    groupCount: 38,
    priorityGroupCount: 8,
    priorityFamilies: [
      'gen_dash_clause_combine',
      'gen_dash_clause_fix',
    ],
    familyGroupCounts: {
      gen_bullet_points_fix: 7,
      gen_bullet_points_paragraph: 7,
      gen_colon_list_combine: 8,
      gen_colon_list_insert: 8,
      gen_fronted_adverbial_combine: 7,
      gen_fronted_adverbial_fix: 7,
      gen_parenthesis_combine: 8,
      gen_parenthesis_fix: 8,
      gen_semicolon_combine: 8,
      gen_semicolon_fix: 8,
    },
  },
  signatures: {
    groupCount: 0,
    priorityGroupCount: 0,
    priorityFamilies: [],
    familyGroupCounts: {},
  },
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fixedThresholdArg(thresholds = P2_U3_FIXED_THRESHOLDS) {
  return Object.entries(thresholds)
    .map(([skillId, count]) => `${skillId}=${count}`)
    .join(',');
}

function generatedFamilyIdFromItemId(id) {
  return String(id || '').replace(/_[a-z0-9]+_\d+$/, '');
}

function capacityDuplicateResidualSummary(groups = []) {
  const familyGroupCounts = {};
  const priorityFamilies = new Set();
  let groupCount = 0;
  let priorityGroupCount = 0;

  for (const group of groups) {
    const families = [...new Set((group.ids || []).map(generatedFamilyIdFromItemId))].sort();
    const nonPriorityFamilies = families.filter((familyId) => !P2_U6_PRIORITY_CAPACITY_FAMILY_IDS.has(familyId));
    const groupPriorityFamilies = families.filter((familyId) => P2_U6_PRIORITY_CAPACITY_FAMILY_IDS.has(familyId));

    if (nonPriorityFamilies.length) {
      groupCount += 1;
      for (const familyId of nonPriorityFamilies) {
        familyGroupCounts[familyId] = (familyGroupCounts[familyId] || 0) + 1;
      }
    }
    if (groupPriorityFamilies.length) {
      priorityGroupCount += 1;
      for (const familyId of groupPriorityFamilies) priorityFamilies.add(familyId);
    }
  }

  return {
    groupCount,
    priorityGroupCount,
    priorityFamilies: [...priorityFamilies].sort(),
    familyGroupCounts: Object.fromEntries(Object.entries(familyGroupCounts).sort()),
  };
}

function runAuditCli(args) {
  return spawnSync(process.execPath, [auditCliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('punctuation content audit reports the current fixed and generated baseline', () => {
  const audit = runPunctuationContentAudit({
    seed: 'audit-baseline',
    generatedPerFamily: 1,
  });

  assert.equal(audit.ok, true, audit.failures.join('\n'));
  assert.deepEqual(audit.summary, {
    fixedItemCount: 92,
    generatorFamilyCount: 25,
    generatedItemCount: 25,
    runtimeItemCount: 117,
    publishedRewardUnitCount: 14,
    publishedSkillCount: 14,
  });
  assert.equal(audit.bySkill.length, 14);
  assert.equal(audit.bySkill.every((row) => row.generatedFamilyCount >= 1), true);
});

test('punctuation content audit reports per-skill coverage and generated signatures', () => {
  const audit = runPunctuationContentAudit({
    seed: 'audit-coverage',
    generatedPerFamily: 1,
  });
  const sentenceEndings = audit.bySkill.find((row) => row.skillId === 'sentence_endings');
  const speech = audit.bySkill.find((row) => row.skillId === 'speech');

  assert.equal(sentenceEndings.fixedItemCount, 8);
  assert.equal(sentenceEndings.generatedItemCount, 1);
  assert.equal(sentenceEndings.generatedSignatureCount, 1);
  assert.ok(sentenceEndings.readinessCoverage.includes('insertion'));
  assert.equal(sentenceEndings.choiceItemCount, 2);
  assert.equal(sentenceEndings.answerContractCoverageCount, 4);
  assert.equal(sentenceEndings.validatorCoverageCount, 2);
  assert.ok(speech.generatedItemCount >= 2);
  assert.ok(speech.validatorCoverageCount > 0);
});

test('punctuation content audit proves P2 U3 runtime growth comes from fixed anchors only', () => {
  const audit = runPunctuationContentAudit({
    seed: 'audit-p2-u3-runtime-depth',
    generatedPerFamily: 4,
    thresholds: {
      failOnDuplicateGeneratedSignatures: true,
      minGeneratedItemsPerPublishedFamily: 4,
      minTemplatesPerPublishedFamily: 4,
      minSignaturesPerPublishedFamily: 4,
      minFixedItemsBySkill: P2_U3_FIXED_THRESHOLDS,
    },
  });

  assert.equal(audit.ok, true, audit.failures.join('\n'));
  assert.deepEqual(
    audit.failureDetails.filter((failure) => failure.code === 'generated_model_marking'),
    [],
  );
  assert.equal(audit.summary.fixedItemCount, 92);
  assert.equal(audit.summary.generatedItemCount, 100);
  assert.equal(audit.summary.runtimeItemCount, 192);
  assert.equal(audit.summary.publishedRewardUnitCount, 14);

  for (const [skillId, expected] of Object.entries(P2_U3_FIXED_THRESHOLDS)) {
    const row = audit.bySkill.find((entry) => entry.skillId === skillId);
    assert.equal(row.fixedItemCount, expected, `${skillId} fixed anchors`);
  }
});

test('punctuation content audit can prove expanded deterministic bank variety', () => {
  const audit = runPunctuationContentAudit({
    seed: 'audit-expanded-bank',
    generatedPerFamily: 4,
    thresholds: {
      failOnDuplicateGeneratedSignatures: true,
      minGeneratedItemsPerPublishedFamily: 4,
      minTemplatesPerPublishedFamily: 4,
      minSignaturesPerPublishedFamily: 4,
    },
  });

  assert.equal(audit.ok, true, audit.failures.join('\n'));
  assert.deepEqual(audit.failureDetails, []);
  for (const row of audit.generatorFamilies.filter((entry) => entry.published)) {
    assert.equal(row.generatedItemCount, 4, row.id);
    assert.equal(row.variantSignatures.length, 4, row.id);
    assert.equal(row.templateIds.length, 4, row.id);
  }
});

test('punctuation content audit proves spare priority capacity without raising production runtime', () => {
  const capacityThresholds = Object.fromEntries(P2_U6_PRIORITY_CAPACITY_FAMILIES.map((familyId) => [familyId, 8]));
  const productionAudit = runPunctuationContentAudit({
    seed: 'audit-p2-u6-production-runtime',
    generatedPerFamily: 4,
  });
  const capacityAudit = runPunctuationContentAudit({
    seed: 'audit-p2-u6-priority-capacity',
    generatedPerFamily: 8,
    thresholds: {
      minGeneratedItemsByFamily: capacityThresholds,
      minTemplatesByFamily: capacityThresholds,
      minSignaturesByFamily: capacityThresholds,
    },
  });

  assert.equal(productionAudit.ok, true, productionAudit.failures.join('\n'));
  assert.equal(productionAudit.summary.generatedItemCount, 100);
  assert.equal(productionAudit.summary.runtimeItemCount, 192);
  assert.equal(capacityAudit.ok, true, capacityAudit.failures.join('\n'));
  assert.deepEqual(
    capacityAudit.failureDetails.filter((failure) => failure.code === 'generated_model_marking'),
    [],
  );
  assert.equal(capacityAudit.summary.generatedItemCount, 200);
  assert.equal(capacityAudit.summary.runtimeItemCount, 292);
  for (const familyId of P2_U6_PRIORITY_CAPACITY_FAMILIES) {
    const row = capacityAudit.generatorFamilies.find((entry) => entry.id === familyId);
    assert.equal(row.generatedItemCount, 8, familyId);
    assert.equal(row.templateIds.length, 8, familyId);
    assert.equal(row.variantSignatures.length, 8, familyId);
  }
});

test('punctuation content audit guards expected capacity duplicate residuals', () => {
  const capacityAudit = runPunctuationContentAudit({
    seed: 'audit-p2-u6-priority-capacity',
    generatedPerFamily: 8,
  });
  const duplicateResiduals = Object.fromEntries(
    Object.entries(capacityAudit.duplicates.generated)
      .map(([kind, groups]) => [kind, capacityDuplicateResidualSummary(groups)]),
  );

  assert.equal(capacityAudit.ok, true, capacityAudit.failures.join('\n'));
  assert.deepEqual(
    duplicateResiduals,
    P2_U6_EXPECTED_CAPACITY_DUPLICATE_RESIDUALS,
  );
});

test('punctuation content audit guards dash display and strict final-comma copy', () => {
  const validation = validatePunctuationManifest(PUNCTUATION_CONTENT_MANIFEST);
  assert.equal(validation.ok, true, validation.errors.join('\n'));

  const dashItems = PUNCTUATION_CONTENT_MANIFEST.items.filter((item) => item.skillIds?.includes('dash_clause'));
  assert.ok(dashItems.length > 0);
  for (const item of dashItems) {
    assert.match(item.model, /\s–\s/, item.id);
    assert.doesNotMatch(item.model, /\s-\s/, item.id);
  }

  const strictFinalCommaItems = PUNCTUATION_CONTENT_MANIFEST.items.filter((item) => (
    item.validator?.allowFinalComma === false
  ));
  assert.ok(strictFinalCommaItems.length > 0);
  for (const item of strictFinalCommaItems) {
    assert.doesNotMatch(`${item.prompt} ${item.explanation}`, /house style/i, item.id);
    assert.match(`${item.prompt} ${item.explanation}`, /do not put a comma before the final and/i, item.id);
  }

  const fixedFreeTextListCommaItems = PUNCTUATION_CONTENT_MANIFEST.items.filter((item) => (
    item.skillIds?.includes('list_commas')
      && ['insert', 'fix'].includes(item.mode)
      && item.validator?.allowFinalComma !== false
  ));
  assert.ok(fixedFreeTextListCommaItems.length > 0);
  for (const item of fixedFreeTextListCommaItems) {
    assert.equal(item.validator?.type, 'requiresListCommas', item.id);
  }
});

test('punctuation content audit rejects strict final-comma items without visible policy context', () => {
  const manifest = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    items: PUNCTUATION_CONTENT_MANIFEST.items.map((item) => (
      item.id === 'lc_transfer_bake_sale'
        ? {
            ...item,
            prompt: 'Write one sentence using this exact stem and list: For the bake sale we needed eggs, flour, butter and sugar.',
            explanation: 'The sentence keeps the stem and separates the list items with commas.',
          }
        : item
    )),
  };
  const audit = runPunctuationContentAudit({
    manifest,
    seed: 'strict-final-comma-policy-copy',
    generatedPerFamily: 1,
  });

  assert.equal(audit.ok, false);
  assert.match(audit.failures.join('\n'), /lc_transfer_bake_sale forbids the final comma without visible no-final-comma context/);
});

test('punctuation content audit rejects dash-clause items without dash-teaching display text', () => {
  const manifest = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    items: PUNCTUATION_CONTENT_MANIFEST.items.map((item) => (
      item.id === 'dc_insert_door_froze'
        ? {
            ...item,
            model: 'The door creaked open we froze.',
          }
        : item
    )),
  };
  const validation = validatePunctuationManifest(manifest);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /dc_insert_door_froze must use a spaced en dash in model display/);
});

test('punctuation content audit rejects dash-clause display with spaced hyphen', () => {
  const manifest = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    items: PUNCTUATION_CONTENT_MANIFEST.items.map((item) => (
      item.id === 'dc_choose_flooded_route'
        ? {
            ...item,
            options: item.options.map((option, index) => (
              index === item.correctIndex
                ? 'The path was flooded - we took the longer route.'
                : option
            )),
          }
        : item
    )),
  };
  const validation = validatePunctuationManifest(manifest);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /dc_choose_flooded_route must use a spaced en dash in model display/);
});

test('punctuation content audit detects crafted duplicate generated signatures', () => {
  const audit = runPunctuationContentAudit({
    seed: 'audit-crafted-duplicate-signatures',
    generatedPerFamily: 2,
    contextPack: {
      stems: ['the crew checked the ropes', 'we found another path'],
    },
    thresholds: {
      failOnDuplicateGeneratedSignatures: true,
    },
  });

  assert.equal(audit.ok, false);
  assert.match(audit.failures.join('\n'), /Duplicate generated variant signatures/);
  assert.ok(audit.failureDetails.some((failure) => (
    failure.code === 'duplicate_generated_signature'
      && failure.groups.some((group) => group.ids.length > 1)
  )));
});

test('punctuation content audit detects missing generated family coverage', () => {
  const manifest = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    generatorFamilies: [
      ...PUNCTUATION_CONTENT_MANIFEST.generatorFamilies,
      {
        id: 'gen_sentence_endings_missing_templates',
        skillId: 'sentence_endings',
        rewardUnitId: 'sentence-endings-core',
        published: true,
        mode: 'insert',
        deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
      },
    ],
  };
  const audit = runPunctuationContentAudit({
    manifest,
    seed: 'missing-family',
    generatedPerFamily: 1,
    thresholds: {
      minGeneratedItemsPerPublishedFamily: 1,
    },
  });

  assert.equal(audit.ok, false);
  assert.match(audit.failures.join('\n'), /gen_sentence_endings_missing_templates produced no generated items/);
  assert.ok(audit.failureDetails.some((failure) => (
    failure.code === 'generated_family_minimum'
      && failure.familyId === 'gen_sentence_endings_missing_templates'
  )));
});

test('punctuation content audit threshold failures are machine-readable', () => {
  const audit = runPunctuationContentAudit({
    seed: 'strict-audit',
    generatedPerFamily: 1,
    thresholds: {
      minGeneratedSignaturesPerPublishedSkill: 3,
      minValidatorCoveragePerPublishedSkill: 1,
    },
  });

  assert.equal(audit.ok, false);
  assert.match(audit.failures.join('\n'), /sentence_endings has 1 generated signatures/);
  assert.equal(Array.isArray(audit.bySkill), true);
  assert.equal(Array.isArray(audit.generatorFamilies), true);
  assert.ok(audit.failureDetails.some((failure) => (
    failure.code === 'skill_generated_signature_minimum'
      && failure.skillId === 'sentence_endings'
  )));
});

test('punctuation content audit leaves duplicate generated stems and models review-visible by default', () => {
  const audit = runPunctuationContentAudit({
    seed: 'audit-review-visible-duplicates',
    generatedPerFamily: 9,
    thresholds: {
      failOnDuplicateGeneratedSignatures: false,
    },
  });

  assert.equal(audit.ok, true, audit.failures.join('\n'));
  assert.ok(audit.duplicates.generated.stems.length > 0);
  assert.ok(audit.duplicates.generated.models.length > 0);
  assert.ok(audit.duplicates.generated.signatures.length > 0);
});

test('punctuation content audit detects a P2 fixed-anchor regression', () => {
  const regressionManifest = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    items: PUNCTUATION_CONTENT_MANIFEST.items.filter((item) => ![
      'se_choose_direct_question',
      'se_insert_quiet_command',
      'se_fix_excited_statement',
      'se_transfer_where',
    ].includes(item.id)),
  };
  const audit = runPunctuationContentAudit({
    manifest: regressionManifest,
    seed: 'audit-p2-fixed-anchor-depth',
    generatedPerFamily: 4,
    thresholds: {
      minFixedItemsBySkill: P2_U3_FIXED_THRESHOLDS,
    },
  });

  assert.equal(audit.ok, false);
  assert.match(audit.failures.join('\n'), /Published skill sentence_endings has 4 fixed items; expected at least 8/);
  assert.ok(audit.failureDetails.some((failure) => (
    failure.code === 'fixed_anchor_minimum'
      && failure.skillId === 'sentence_endings'
      && failure.actual === 4
      && failure.expected === 8
  )));
});

test('punctuation content audit fails generated model-answer marking with family and template context', () => {
  const manifest = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    generatorFamilies: PUNCTUATION_CONTENT_MANIFEST.generatorFamilies.map((family) => (
      family.id === 'gen_sentence_endings_insert'
        ? { ...family, mode: 'choose' }
        : family
    )),
  };
  const audit = runPunctuationContentAudit({
    manifest,
    seed: 'audit-generated-model-marking',
    generatedPerFamily: 1,
  });

  assert.equal(audit.ok, false);
  assert.match(audit.failures.join('\n'), /Generated model answer does not pass marking/);
  assert.ok(audit.failureDetails.some((failure) => (
    failure.code === 'generated_model_marking'
      && failure.familyId === 'gen_sentence_endings_insert'
      && failure.templateId
  )));
});

test('punctuation content audit CLI applies by-skill fixed-anchor thresholds', () => {
  const result = runAuditCli([
    '--strict',
    '--generated-per-family',
    '4',
    '--min-fixed-items-per-skill',
    '1',
    '--min-fixed-items-by-skill',
    fixedThresholdArg(),
    '--json',
  ]);
  const audit = JSON.parse(result.stdout);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(audit.ok, true, audit.failures.join('\n'));
  assert.deepEqual(
    audit.failureDetails.filter((failure) => failure.code === 'fixed_anchor_minimum'),
    [],
  );
});

test('punctuation content audit workflow enforces P2 fixed-anchor thresholds', () => {
  const workflow = readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /--min-fixed-items-by-skill/);
  for (const entry of fixedThresholdArg().split(',')) {
    assert.match(workflow, new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('punctuation content audit CLI rejects malformed by-skill threshold entries', () => {
  const result = runAuditCli([
    '--min-fixed-items-by-skill',
    'sentence_endings=not-a-number',
  ]);

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Malformed --min-fixed-items-by-skill entry "sentence_endings=not-a-number"/);
});

test('punctuation content audit CLI rejects unknown by-skill threshold ids', () => {
  const result = runAuditCli([
    '--min-fixed-items-by-skill',
    'unknown_skill=8',
  ]);

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Unknown skill id "unknown_skill" in --min-fixed-items-by-skill/);
});

test('punctuation content audit CLI rejects unknown by-family threshold ids', () => {
  const result = runAuditCli([
    '--min-generated-by-family',
    'unknown_family=4',
  ]);

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Unknown generator family id "unknown_family" in --min-generated-by-family/);
});

test('punctuation content audit --reviewer-report passes strict gate AND produces reviewer section', () => {
  const result = runAuditCli([
    '--strict',
    '--generated-per-family',
    '4',
    '--reviewer-report',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /REVIEWER REPORT/);
  assert.match(result.stdout, /Runtime summary/);
  assert.match(result.stdout, /DSL coverage ratio/);
  assert.match(result.stdout, /Top duplicate generated stems/);
  assert.match(result.stdout, /Top duplicate generated models/);
  assert.match(result.stdout, /Per-family spare capacity/);
  assert.match(result.stdout, /Per-skill mode coverage/);
  assert.match(result.stdout, /Per-skill validator\/rubric coverage/);
  assert.match(result.stdout, /Golden test coverage per DSL family/);
  assert.match(result.stdout, /Generated model-answer marking failures/);
  assert.match(result.stdout, /Metadata\/redaction risk checks/);
  assert.match(result.stdout, /Recommended reviewer actions/);
  assert.match(result.stdout, /Findings/);
});

test('punctuation content audit reviewer report shows capacity at depth 8 for converted families', () => {
  const audit = runPunctuationContentAudit({
    seed: 'reviewer-capacity-depth',
    generatedPerFamily: 4,
    thresholds: {
      failOnDuplicateGeneratedSignatures: true,
      minGeneratedItemsPerPublishedFamily: 4,
      minSignaturesPerPublishedFamily: 4,
    },
  });
  const generatedItems = createPunctuationGeneratedItems({
    seed: 'reviewer-capacity-depth',
    perFamily: 4,
  });
  const report = buildReviewerReport({
    audit,
    generatedItems,
    capacityDepth: 8,
  });

  assert.equal(audit.ok, true, audit.failures.join('\n'));

  // DSL-backed priority families have 8 templates, so capacity >= 8
  for (const familyId of P2_U6_PRIORITY_CAPACITY_FAMILIES) {
    const row = report.perFamilyCapacity.find((entry) => entry.familyId === familyId);
    assert.ok(row, `${familyId} must be in capacity report`);
    assert.equal(row.isDsl, true, `${familyId} must be DSL-backed`);
    assert.ok(row.capacitySignatures >= 8, `${familyId} capacity must be >= 8, got ${row.capacitySignatures}`);
  }
});

test('punctuation content audit reviewer report shows 0 legacy families (25/25 DSL coverage)', () => {
  const audit = runPunctuationContentAudit({
    seed: 'reviewer-legacy-detect',
    generatedPerFamily: 1,
  });
  const generatedItems = createPunctuationGeneratedItems({
    seed: 'reviewer-legacy-detect',
    perFamily: 1,
  });
  const report = buildReviewerReport({
    audit,
    generatedItems,
    capacityDepth: 8,
  });

  // All 25 families are now DSL-backed — 0 legacy families remain
  assert.equal(report.legacyFamilies.length, 0, 'All families are DSL-backed');
  // Every family has isDsl = true
  for (const row of report.perFamilyCapacity) {
    assert.equal(row.isDsl, true, `${row.familyId} must be flagged as DSL`);
  }
});

test('punctuation content audit reviewer report does not crash with empty generated items', () => {
  const audit = runPunctuationContentAudit({
    seed: 'reviewer-no-dupes',
    generatedPerFamily: 1,
  });
  // Pass an empty generated items array to guarantee zero duplicates
  const report = buildReviewerReport({
    audit,
    generatedItems: [],
    capacityDepth: 8,
  });

  // Zero items means zero duplicates
  assert.deepEqual(report.duplicateStems, []);
  assert.deepEqual(report.duplicateModels, []);

  // Ensure all section arrays are present (no crash on empty)
  assert.ok(Array.isArray(report.perFamilyCapacity));
  assert.ok(Array.isArray(report.perSkillModes));
  assert.ok(Array.isArray(report.perSkillValidatorCoverage));
  assert.ok(Array.isArray(report.perFamilyTemplateCount));
  assert.ok(Array.isArray(report.perFamilySignatureCount));
  assert.ok(Array.isArray(report.modelFailures));
  assert.ok(Array.isArray(report.templatesMissingTests));
  assert.ok(Array.isArray(report.templatesNoAlternateTest));
  assert.ok(Array.isArray(report.legacyFamilies));
  assert.ok(Array.isArray(report.findings));
  assert.ok(Array.isArray(report.goldenTestCoverage));
  assert.ok(Array.isArray(report.redactionRisks));
  assert.ok(Array.isArray(report.recommendedActions));
  assert.ok(isPlainObject(report.summary));

  // Formatting does not throw
  const text = formatReviewerReport(report);
  assert.match(text, /REVIEWER REPORT/);
  assert.match(text, /\(none\)/);
});

test('punctuation content audit --min-signatures-by-family passes for converted families at depth 8', () => {
  const signatureThresholds = Object.fromEntries(
    P2_U6_PRIORITY_CAPACITY_FAMILIES.map((familyId) => [familyId, 8]),
  );
  const audit = runPunctuationContentAudit({
    seed: 'reviewer-sig-by-family',
    generatedPerFamily: 8,
    thresholds: {
      minSignaturesByFamily: signatureThresholds,
    },
  });

  assert.equal(audit.ok, true, audit.failures.join('\n'));
  for (const familyId of P2_U6_PRIORITY_CAPACITY_FAMILIES) {
    const row = audit.generatorFamilies.find((entry) => entry.id === familyId);
    assert.ok(row.variantSignatures.length >= 8, `${familyId} signatures must be >= 8, got ${row.variantSignatures.length}`);
  }
});

// ─── P4-U1: Reviewer report severity classification tests ─────────────────────

test('punctuation content audit reviewer report JSON schema valid (has summary.severityCounts, findings array)', () => {
  const audit = runPunctuationContentAudit({
    seed: 'reviewer-json-schema',
    generatedPerFamily: 1,
  });
  const generatedItems = createPunctuationGeneratedItems({
    seed: 'reviewer-json-schema',
    perFamily: 1,
  });
  const report = buildReviewerReport({
    audit,
    generatedItems,
    capacityDepth: 8,
  });

  // summary structure
  assert.ok(isPlainObject(report.summary), 'report.summary must be an object');
  assert.equal(typeof report.summary.fixedItems, 'number');
  assert.equal(typeof report.summary.generatedItems, 'number');
  assert.equal(typeof report.summary.totalItems, 'number');
  assert.ok('releaseId' in report.summary);
  assert.equal(typeof report.summary.dslCoverage, 'number');
  assert.ok(isPlainObject(report.summary.severityCounts));
  assert.equal(typeof report.summary.severityCounts.fail, 'number');
  assert.equal(typeof report.summary.severityCounts.warning, 'number');
  assert.equal(typeof report.summary.severityCounts.info, 'number');

  // findings array
  assert.ok(Array.isArray(report.findings), 'report.findings must be an array');
  for (const f of report.findings) {
    assert.ok(['Fail', 'Warning', 'Info'].includes(f.severity), `Invalid severity: ${f.severity}`);
    assert.equal(typeof f.code, 'string');
    assert.equal(typeof f.message, 'string');
  }

  // severity counts match findings
  const failCount = report.findings.filter((f) => f.severity === 'Fail').length;
  const warningCount = report.findings.filter((f) => f.severity === 'Warning').length;
  const infoCount = report.findings.filter((f) => f.severity === 'Info').length;
  assert.equal(report.summary.severityCounts.fail, failCount);
  assert.equal(report.summary.severityCounts.warning, warningCount);
  assert.equal(report.summary.severityCounts.info, infoCount);
});

test('punctuation content audit reviewer report classifies duplicate variant signature as Fail', () => {
  const audit = runPunctuationContentAudit({
    seed: 'reviewer-dup-sig-severity',
    generatedPerFamily: 2,
    contextPack: {
      stems: ['the crew checked the ropes', 'we found another path'],
    },
  });
  const generatedItems = createPunctuationGeneratedItems({
    seed: 'reviewer-dup-sig-severity',
    perFamily: 2,
    contextPack: {
      stems: ['the crew checked the ropes', 'we found another path'],
    },
  });
  const report = buildReviewerReport({
    audit,
    generatedItems,
    capacityDepth: 8,
  });

  const dupSigFindings = report.findings.filter((f) => f.code === 'duplicate_variant_signature');
  assert.ok(dupSigFindings.length > 0, 'Must detect duplicate variant signatures');
  for (const f of dupSigFindings) {
    assert.equal(f.severity, 'Fail');
  }
});

test('punctuation content audit reviewer report classifies model answer failure as Fail', () => {
  const manifest = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    generatorFamilies: PUNCTUATION_CONTENT_MANIFEST.generatorFamilies.map((family) => (
      family.id === 'gen_sentence_endings_insert'
        ? { ...family, mode: 'choose' }
        : family
    )),
  };
  const audit = runPunctuationContentAudit({
    manifest,
    seed: 'reviewer-model-fail-severity',
    generatedPerFamily: 1,
  });
  const generatedItems = createPunctuationGeneratedItems({
    manifest,
    seed: 'reviewer-model-fail-severity',
    perFamily: 1,
  });
  const report = buildReviewerReport({
    audit,
    manifest,
    generatedItems,
    capacityDepth: 8,
  });

  const modelFailFindings = report.findings.filter((f) => f.code === 'model_answer_fails_marking');
  assert.ok(modelFailFindings.length > 0, 'Must detect model answer failures');
  for (const f of modelFailFindings) {
    assert.equal(f.severity, 'Fail');
  }
});

test('punctuation content audit reviewer report classifies duplicate stem as Warning', () => {
  const audit = runPunctuationContentAudit({
    seed: 'reviewer-dup-stem-severity',
    generatedPerFamily: 5,
  });
  const generatedItems = createPunctuationGeneratedItems({
    seed: 'reviewer-dup-stem-severity',
    perFamily: 5,
  });
  const report = buildReviewerReport({
    audit,
    generatedItems,
    capacityDepth: 8,
  });

  const dupStemFindings = report.findings.filter((f) => f.code === 'duplicate_stem');
  assert.ok(dupStemFindings.length > 0, 'Must detect duplicate stems at perFamily=5');
  for (const f of dupStemFindings) {
    assert.equal(f.severity, 'Warning');
  }
});

test('punctuation content audit reviewer report produces 0 legacy Warning findings (25/25 DSL coverage)', () => {
  const audit = runPunctuationContentAudit({
    seed: 'reviewer-legacy-warning',
    generatedPerFamily: 1,
  });
  const generatedItems = createPunctuationGeneratedItems({
    seed: 'reviewer-legacy-warning',
    perFamily: 1,
  });
  const report = buildReviewerReport({
    audit,
    generatedItems,
    capacityDepth: 8,
    requireAllDsl: false,
  });

  const legacyFindings = report.findings.filter((f) => f.code === 'legacy_non_dsl_family');
  assert.equal(legacyFindings.length, 0, 'All 25 families are DSL-backed — no legacy families remain');
});

test('punctuation content audit reviewer report --require-all-dsl produces 0 legacy Fail findings (25/25 DSL coverage)', () => {
  const audit = runPunctuationContentAudit({
    seed: 'reviewer-legacy-fail',
    generatedPerFamily: 1,
  });
  const generatedItems = createPunctuationGeneratedItems({
    seed: 'reviewer-legacy-fail',
    perFamily: 1,
  });
  const report = buildReviewerReport({
    audit,
    generatedItems,
    capacityDepth: 8,
    requireAllDsl: true,
  });

  const legacyFindings = report.findings.filter((f) => f.code === 'legacy_non_dsl_family');
  assert.equal(legacyFindings.length, 0, 'All 25 families are DSL-backed — no legacy families remain');
});

test('punctuation content audit reviewer report all-green content produces 0 Fail findings', () => {
  const audit = runPunctuationContentAudit({
    seed: 'reviewer-all-green',
    generatedPerFamily: 1,
  });
  const generatedItems = createPunctuationGeneratedItems({
    seed: 'reviewer-all-green',
    perFamily: 1,
  });
  const report = buildReviewerReport({
    audit,
    generatedItems,
    capacityDepth: 8,
  });

  // At perFamily=1 there are no duplicate signatures, model failures pass in healthy state
  const failFindings = report.findings.filter((f) => f.severity === 'Fail');
  assert.equal(failFindings.length, 0, `Expected 0 Fail findings, got: ${failFindings.map((f) => f.code).join(', ')}`);
});

test('punctuation content audit reviewer report text output includes severity markers', () => {
  const audit = runPunctuationContentAudit({
    seed: 'reviewer-text-markers',
    generatedPerFamily: 5,
  });
  const generatedItems = createPunctuationGeneratedItems({
    seed: 'reviewer-text-markers',
    perFamily: 5,
  });
  const report = buildReviewerReport({
    audit,
    generatedItems,
    capacityDepth: 8,
  });
  const text = formatReviewerReport(report);

  // Must include at least one severity marker in the output
  const hasAnyMarker = text.includes('✗ Fail') || text.includes('⚠ Warning') || text.includes('ℹ Info');
  assert.ok(hasAnyMarker, 'Text output must include severity markers');
  // The findings section header must be present
  assert.match(text, /Findings/);
});
