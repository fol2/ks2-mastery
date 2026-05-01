import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(
  rootDir,
  'docs/plans/james/ui-refactor/ui-refactor-p4-completion-report.md',
);

function readReport() {
  return readFileSync(reportPath, 'utf8');
}

function hasTimestampedDeployedEvidence(source) {
  return /(?:deployed smoke|screenshot)[^\n]*20\d{2}-\d{2}-\d{2}[\s\S]*https:\/\/ks2\.eugnel\.uk/i.test(source);
}

const PRODUCTION_CLAIM_PATTERNS = [
  /\bproduction visual correctness\s+(?:is\s+)?(?:verified|proven|confirmed)\b/i,
  /\bdeployed production smoke\s+(?:passed|verified|proven|confirmed)\b/i,
  /\bproduction-proven\s*:\s*(?:yes|true|passed|verified)\b/i,
];

test('P4 completion report records the source/GitHub/ZIP/production boundary', () => {
  const report = readReport();
  assert.match(report, /Source boundary:/);
  assert.match(report, /GitHub boundary:/);
  assert.match(report, /ZIP boundary:/);
  assert.match(report, /Production boundary:/);
});

test('P4 completion report cannot claim production readiness without deployed evidence', () => {
  const report = readReport();
  const hasEvidence = hasTimestampedDeployedEvidence(report);

  if (!hasEvidence) {
    assert.match(
      report,
      /Production evidence:\s*not production-proven/i,
      'Without timestamped deployed evidence, the report must carry an explicit non-claim.',
    );
  }

  for (const pattern of PRODUCTION_CLAIM_PATTERNS) {
    assert.ok(
      hasEvidence || !pattern.test(report),
      'Production readiness claims require timestamped deployed smoke or screenshot evidence.',
    );
  }
});
