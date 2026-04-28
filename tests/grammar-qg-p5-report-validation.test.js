import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateGrammarCompletionReport } from '../scripts/validate-grammar-qg-completion-report.mjs';
import { buildGrammarQuestionGeneratorAudit } from '../scripts/audit-grammar-question-generator.mjs';
import { buildGrammarContentQualityAudit } from '../scripts/audit-grammar-content-quality.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Build a valid mock report that matches the given audit values.
 */
function buildValidMockReport(audit, contentQuality) {
  return `---
title: "Grammar QG P5 completion report"
type: final-completion-report
contentReleaseId: ${audit.releaseId}
---

# Grammar QG P5 Completion Report

## Final Denominator Comparison

| Measure | Value |
|---|---|
| Concepts | ${audit.conceptCount} |
| Templates | ${audit.templateCount} |
| Selected-response templates | ${audit.selectedResponseCount} |
| Constructed-response templates | ${audit.constructedResponseCount} |
| Generated templates | ${audit.generatedTemplateCount} |
| Fixed templates | ${audit.fixedTemplateCount} |
| Answer-spec templates | ${audit.answerSpecTemplateCount} |
| Constructed-response answer-spec templates | ${audit.constructedResponseAnswerSpecTemplateCount}/${audit.constructedResponseCount} |
| Manual-review-only templates | ${audit.manualReviewOnlyTemplateCount} |
| Explanation templates | ${audit.explainTemplateCount} |
| Concepts with explanation coverage | ${audit.conceptsWithExplainCoverage.length}/${audit.conceptCount} |
| Mixed-transfer templates | ${audit.mixedTransferTemplateCount} |
| Concepts with mixed-transfer coverage | ${audit.conceptsWithMixedTransferCoverage.length}/${audit.conceptCount} |
| Legacy repeated variants (default window) | ${audit.legacyRepeatedGeneratedVariants.length} |
| Cross-template signature collisions | ${audit.generatedSignatureCollisions.length} |

## Production Smoke Status

**Repository smoke:** PASSED.

**Post-deploy production smoke:** NOT RUN.

## Content Quality

Content-quality hard failures: 0
`;
}

test('valid report matching current audit passes validation', () => {
  const seeds = [1, 2, 3];
  const deepSeeds = Array.from({ length: 30 }, (_, i) => i + 1);
  const audit = buildGrammarQuestionGeneratorAudit({ seeds, deepSeeds });
  const contentQuality = buildGrammarContentQualityAudit(seeds);

  const report = buildValidMockReport(audit, contentQuality);
  const result = validateGrammarCompletionReport(report, {
    rootDir: ROOT_DIR,
    seeds,
    deepSeeds,
    auditOverride: audit,
    contentQualityOverride: contentQuality,
  });

  assert.equal(result.pass, true, `Expected pass but got mismatches: ${JSON.stringify(result.mismatches, null, 2)}`);
  assert.equal(result.mismatches.length, 0);
});

test('report with wrong template count fails with specific mismatch', () => {
  const seeds = [1, 2, 3];
  const deepSeeds = Array.from({ length: 30 }, (_, i) => i + 1);
  const audit = buildGrammarQuestionGeneratorAudit({ seeds, deepSeeds });
  const contentQuality = buildGrammarContentQualityAudit(seeds);

  // Build a valid report then corrupt the template count
  const wrongCount = audit.templateCount + 5;
  const report = buildValidMockReport(audit, contentQuality)
    .replace(
      `| Templates | ${audit.templateCount} |`,
      `| Templates | ${wrongCount} |`,
    );

  const result = validateGrammarCompletionReport(report, {
    rootDir: ROOT_DIR,
    seeds,
    deepSeeds,
    auditOverride: audit,
    contentQualityOverride: contentQuality,
  });

  assert.equal(result.pass, false);
  const templateMismatch = result.mismatches.find((m) => m.field === 'templateCount');
  assert.ok(templateMismatch, 'Should have a templateCount mismatch');
  assert.equal(templateMismatch.claimed, wrongCount);
  assert.equal(templateMismatch.actual, audit.templateCount);
  assert.ok(templateMismatch.message.includes('templateCount'));
});

test('report claiming post-deploy smoke passed without evidence file fails', () => {
  const seeds = [1, 2, 3];
  const deepSeeds = Array.from({ length: 30 }, (_, i) => i + 1);
  const audit = buildGrammarQuestionGeneratorAudit({ seeds, deepSeeds });
  const contentQuality = buildGrammarContentQualityAudit(seeds);

  // Build a report that claims post-deploy smoke passed
  const report = buildValidMockReport(audit, contentQuality)
    .replace(
      '**Post-deploy production smoke:** NOT RUN.',
      '**Post-deploy production smoke:** passed.',
    );

  const result = validateGrammarCompletionReport(report, {
    rootDir: ROOT_DIR,
    seeds,
    deepSeeds,
    auditOverride: audit,
    contentQualityOverride: contentQuality,
  });

  assert.equal(result.pass, false);
  const evidenceMismatch = result.mismatches.find((m) => m.field === 'productionSmokeEvidence');
  assert.ok(evidenceMismatch, 'Should have a productionSmokeEvidence mismatch');
  assert.ok(evidenceMismatch.message.includes('evidence file does not exist'));
});

test('report claiming zero low-depth families when deep audit has some fails', () => {
  const seeds = [1, 2, 3];
  const deepSeeds = Array.from({ length: 30 }, (_, i) => i + 1);
  const audit = buildGrammarQuestionGeneratorAudit({ seeds, deepSeeds });
  const contentQuality = buildGrammarContentQualityAudit(seeds);

  // Create an audit override with a synthetic low-depth family
  const auditWithLowDepth = {
    ...audit,
    lowDepthGeneratedTemplates: [
      { familyId: 'fake_low_depth_family', uniqueSignatures: 2, totalSampled: 30, depth: 2 },
    ],
  };

  // Report claims zero low-depth
  const report = buildValidMockReport(audit, contentQuality) +
    '\nLow-depth families: 0\n';

  const result = validateGrammarCompletionReport(report, {
    rootDir: ROOT_DIR,
    seeds,
    deepSeeds,
    auditOverride: auditWithLowDepth,
    contentQualityOverride: contentQuality,
  });

  assert.equal(result.pass, false);
  const lowDepthMismatch = result.mismatches.find(
    (m) => m.field === 'zeroLowDepthClaim' || m.field === 'lowDepthFamilyCount',
  );
  assert.ok(lowDepthMismatch, 'Should have a low-depth mismatch');
  assert.ok(lowDepthMismatch.actual > 0, 'Actual should be > 0');
});

test('end-to-end pipeline: generate audit, construct valid report, validate passes', () => {
  // Run real audits
  const seeds = [1, 2, 3];
  const deepSeeds = Array.from({ length: 30 }, (_, i) => i + 1);
  const audit = buildGrammarQuestionGeneratorAudit({ seeds, deepSeeds });
  const contentQuality = buildGrammarContentQualityAudit(seeds);

  // Construct a report directly from audit data (simulating correct report authoring)
  const report = `---
title: "Grammar QG P5 completion report"
type: final-completion-report
contentReleaseId: ${audit.releaseId}
---

# Grammar QG P5 Final Completion Report

\`\`\`text
Content release id:                      ${audit.releaseId}
Concepts:                                ${audit.conceptCount}
Templates:                               ${audit.templateCount}
Selected-response templates:             ${audit.selectedResponseCount}
Constructed-response templates:          ${audit.constructedResponseCount}
Generated templates:                     ${audit.generatedTemplateCount}
Fixed templates:                         ${audit.fixedTemplateCount}
Answer-spec templates:                   ${audit.answerSpecTemplateCount}
Constructed-response answer-spec count:  ${audit.constructedResponseAnswerSpecTemplateCount} / ${audit.constructedResponseCount}
Manual-review-only templates:            ${audit.manualReviewOnlyTemplateCount}
Explanation templates:                   ${audit.explainTemplateCount}
Concepts with explanation coverage:      ${audit.conceptsWithExplainCoverage.length} / ${audit.conceptCount}
Mixed-transfer templates:                ${audit.mixedTransferTemplateCount}
Concepts with mixed-transfer coverage:   ${audit.conceptsWithMixedTransferCoverage.length} / ${audit.conceptCount}
Legacy repeated variants (default):      ${audit.legacyRepeatedGeneratedVariants.length}
Cross-template signature collisions:     ${audit.generatedSignatureCollisions.length}
\`\`\`

## Production Smoke Status

**Repository smoke:** PASSED.

**Post-deploy production smoke:** NOT RUN.

Low-depth families: ${audit.lowDepthGeneratedTemplates.length}

Content-quality hard failures: ${contentQuality.summary.hardFailCount}
`;

  // Validate using live audit (not override) to prove end-to-end correctness
  const result = validateGrammarCompletionReport(report, {
    rootDir: ROOT_DIR,
    seeds,
    deepSeeds,
  });

  assert.equal(
    result.pass,
    true,
    `End-to-end validation failed with mismatches: ${JSON.stringify(result.mismatches, null, 2)}`,
  );
  assert.equal(result.mismatches.length, 0);
  assert.equal(result.audit.releaseId, audit.releaseId);
});
