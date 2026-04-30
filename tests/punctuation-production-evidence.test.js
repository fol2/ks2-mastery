import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const EVIDENCE_PATH = resolve(ROOT, 'reports/punctuation/punctuation-qg-p9-production-evidence.json');

describe('Punctuation QG P9 production evidence', () => {
  it('evidence file exists and parses as valid JSON', () => {
    assert.ok(existsSync(EVIDENCE_PATH), `Evidence file not found at ${EVIDENCE_PATH}`);
    const raw = readFileSync(EVIDENCE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    assert.ok(typeof parsed === 'object' && parsed !== null);
  });

  it('has all required top-level fields', () => {
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8'));
    const requiredFields = ['releaseId', 'commitSha', 'source', 'localVerification', 'liveProductionSmoke'];
    for (const field of requiredFields) {
      assert.ok(field in evidence, `Missing required field: ${field}`);
    }
  });

  it('source has verifiedPaths array', () => {
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8'));
    assert.ok(Array.isArray(evidence.source.verifiedPaths));
    assert.ok(evidence.source.verifiedPaths.length > 0, 'verifiedPaths must not be empty');
  });

  it('localVerification has required fields', () => {
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8'));
    const lv = evidence.localVerification;
    assert.ok('node' in lv, 'Missing localVerification.node');
    assert.ok('command' in lv, 'Missing localVerification.command');
    assert.ok('status' in lv, 'Missing localVerification.status');
    assert.ok('completedAt' in lv, 'Missing localVerification.completedAt');
  });

  it('commitSha is a valid 40-char hex string', () => {
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8'));
    assert.match(evidence.commitSha, /^[0-9a-f]{40}$/, `commitSha "${evidence.commitSha}" is not a valid 40-char hex string`);
  });

  it('liveProductionSmoke.status is not "pass" unless all smoke fields populated', () => {
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8'));
    const smoke = evidence.liveProductionSmoke;
    if (smoke.status === 'pass') {
      assert.ok(smoke.environment !== null, 'If status is pass, environment must be populated');
      assert.ok(smoke.origin !== null, 'If status is pass, origin must be populated');
      assert.ok(smoke.completedAt !== null, 'If status is pass, completedAt must be populated');
      assert.ok(smoke.result !== null, 'If status is pass, result must be populated');
    }
    // If status is "not_run", the test passes (no live smoke has been run)
  });

  it('liveProductionSmoke has all required fields', () => {
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8'));
    const smoke = evidence.liveProductionSmoke;
    const requiredFields = ['status', 'environment', 'origin', 'completedAt', 'result'];
    for (const field of requiredFields) {
      assert.ok(field in smoke, `Missing liveProductionSmoke.${field}`);
    }
  });
});
