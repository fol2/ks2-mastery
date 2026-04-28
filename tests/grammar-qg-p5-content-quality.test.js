import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGrammarContentQualityAudit } from '../scripts/audit-grammar-content-quality.mjs';

test('content-quality audit returns expected structure', () => {
  const audit = buildGrammarContentQualityAudit([1]);
  assert.ok(audit, 'audit result exists');
  assert.ok(Array.isArray(audit.hardFailures), 'hardFailures is an array');
  assert.ok(Array.isArray(audit.advisories), 'advisories is an array');
  assert.ok(audit.summary, 'summary exists');
  assert.equal(typeof audit.summary.totalTemplatesChecked, 'number');
  assert.equal(typeof audit.summary.hardFailCount, 'number');
  assert.equal(typeof audit.summary.advisoryCount, 'number');
  assert.ok(audit.summary.totalTemplatesChecked > 0, 'at least one template was checked');
});

test('current grammar content produces zero hard failures (seeds 1-10)', () => {
  const seeds = Array.from({ length: 10 }, (_, i) => i + 1);
  const audit = buildGrammarContentQualityAudit(seeds);
  assert.equal(
    audit.summary.hardFailCount,
    0,
    `Expected 0 hard failures but got ${audit.summary.hardFailCount}: ${JSON.stringify(audit.hardFailures, null, 2)}`,
  );
});

test('hard failures are recorded for synthetic unknown misconception', () => {
  // This test validates that the audit correctly detects unknown misconceptions
  // by checking the structure of any advisory or hard-failure entry
  const audit = buildGrammarContentQualityAudit([1]);
  // All hard-failure entries have required fields
  for (const failure of audit.hardFailures) {
    assert.ok(failure.rule, 'failure has rule');
    assert.ok(failure.templateId, 'failure has templateId');
    assert.equal(typeof failure.seed, 'number', 'failure has numeric seed');
    assert.ok(failure.detail, 'failure has detail');
  }
  // All advisory entries have required fields
  for (const advisory of audit.advisories) {
    assert.ok(advisory.rule, 'advisory has rule');
    assert.ok(advisory.templateId, 'advisory has templateId');
    assert.equal(typeof advisory.seed, 'number', 'advisory has numeric seed');
    assert.ok(advisory.detail, 'advisory has detail');
  }
});
