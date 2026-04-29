// P5-U3 — Punctuation QG learning-health report tests.
//
// Verifies the health report script produces correct output in all modes
// and does not expose sensitive data.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

const SCRIPT_PATH = 'scripts/punctuation-qg-health-report.mjs';

test('--json mode produces valid JSON with all expected top-level keys', () => {
  const output = execSync(`node ${SCRIPT_PATH} --json --fixture synthetic`, {
    encoding: 'utf-8',
    cwd: process.cwd(),
  });
  const report = JSON.parse(output);

  const expectedKeys = [
    'signatureExposure',
    'signatureRepeatRate',
    'schedulerReasonDistribution',
    'misconceptionRetryRate',
    'spacedReturnRate',
    'retentionAfterSecureRate',
    'starEvidenceDedup',
    'depthValues',
    'duplicateSignatureCount',
    'duplicateStemModelClusters',
    'unsupportedReservedEvents',
    'emittedEventCount',
  ];

  for (const key of expectedKeys) {
    assert.ok(Object.hasOwn(report, key), `Missing top-level key: ${key}`);
  }
});

test('--strict mode passes with current setup (all emitted events have tests)', () => {
  // Should not throw (exit 0)
  const output = execSync(`node ${SCRIPT_PATH} --strict --fixture synthetic`, {
    encoding: 'utf-8',
    cwd: process.cwd(),
  });
  assert.ok(output.length > 0, 'strict mode must produce output');
});

test('report does not include reserved events in emitted count section', () => {
  const output = execSync(`node ${SCRIPT_PATH} --json --fixture synthetic`, {
    encoding: 'utf-8',
    cwd: process.cwd(),
  });
  const report = JSON.parse(output);

  // emittedEventCount should be 10 (not 11, since 1 is reserved)
  assert.equal(report.emittedEventCount, 10);

  // Reserved events listed separately
  assert.ok(report.unsupportedReservedEvents.reserved.length >= 1);
  const reservedKeys = report.unsupportedReservedEvents.reserved.map((e) => e.key);
  assert.ok(reservedKeys.includes('STAR_EVIDENCE_DEDUPED_BY_TEMPLATE'));
});

test('empty synthetic fixture (zero attempts) produces report without crash', () => {
  // No --fixture flag means empty fixture
  const output = execSync(`node ${SCRIPT_PATH} --json`, {
    encoding: 'utf-8',
    cwd: process.cwd(),
  });
  const report = JSON.parse(output);

  // All sections present even with zero attempts
  assert.equal(report.schedulerReasonDistribution.totalAttempts, 0);
  assert.equal(report.misconceptionRetryRate.scheduled, 0);
  assert.equal(report.misconceptionRetryRate.rate, null);
  assert.equal(report.spacedReturnRate.scheduled, 0);
  assert.equal(report.retentionAfterSecureRate.scheduled, 0);
});

test('human-readable mode produces non-empty string output', () => {
  const output = execSync(`node ${SCRIPT_PATH} --fixture synthetic`, {
    encoding: 'utf-8',
    cwd: process.cwd(),
  });

  assert.ok(output.length > 0, 'human-readable output must be non-empty');
  assert.ok(output.includes('Punctuation QG Learning-Health Report'), 'must contain report title');
  assert.ok(output.includes('Signature Exposure'), 'must contain signature exposure section');
  assert.ok(output.includes('Scheduler Reason Distribution'), 'must contain scheduler reason section');
  assert.ok(output.includes('Misconception Retry'), 'must contain misconception retry section');
  assert.ok(output.includes('Spaced Return'), 'must contain spaced return section');
  assert.ok(output.includes('Retention After Secure'), 'must contain retention section');
});

test('report never contains sensitive field values', () => {
  const output = execSync(`node ${SCRIPT_PATH} --json --fixture synthetic`, {
    encoding: 'utf-8',
    cwd: process.cwd(),
  });

  const FORBIDDEN_KEYS = [
    'answerText', 'typed', 'answer', 'promptText', 'validator', 'validators',
    'accepted', 'acceptedAnswers', 'rubric', 'rawResponse', 'rawGenerator',
  ];

  // Check the top-level JSON keys do not contain forbidden fields
  const report = JSON.parse(output);
  const reportStr = JSON.stringify(report);
  for (const key of FORBIDDEN_KEYS) {
    // Check that the key does not appear as a JSON property key in the output
    assert.ok(
      !reportStr.includes(`"${key}":`),
      `Report must not contain sensitive field "${key}"`,
    );
  }
});

test('--json --fixture synthetic scheduler reasons include all REASON_TAGS', async () => {
  const { REASON_TAGS } = await import('../shared/punctuation/scheduler-manifest.js');
  const output = execSync(`node ${SCRIPT_PATH} --json --fixture synthetic`, {
    encoding: 'utf-8',
    cwd: process.cwd(),
  });
  const report = JSON.parse(output);

  for (const tag of Object.values(REASON_TAGS)) {
    assert.ok(
      Object.hasOwn(report.schedulerReasonDistribution.reasonCounts, tag),
      `Missing reason tag in distribution: ${tag}`,
    );
    assert.ok(
      report.schedulerReasonDistribution.reasonCounts[tag] > 0,
      `Reason tag ${tag} must have count > 0 in synthetic fixture`,
    );
  }
});

test('depth values are correct constants', () => {
  const output = execSync(`node ${SCRIPT_PATH} --json --fixture synthetic`, {
    encoding: 'utf-8',
    cwd: process.cwd(),
  });
  const report = JSON.parse(output);

  assert.equal(report.depthValues.productionDepth, 4);
  assert.equal(report.depthValues.capacityDepth, 8);
});
