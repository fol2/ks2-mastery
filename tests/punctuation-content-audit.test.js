import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  PUNCTUATION_CONTENT_MANIFEST,
} from '../shared/punctuation/content.js';
import {
  runPunctuationContentAudit,
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

function fixedThresholdArg(thresholds = P2_U3_FIXED_THRESHOLDS) {
  return Object.entries(thresholds)
    .map(([skillId, count]) => `${skillId}=${count}`)
    .join(',');
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
    generatedPerFamily: 5,
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
