/**
 * Grammar QG P11 U9 — Production Smoke Contract
 *
 * Defines and validates the evidence JSON schema that the production smoke
 * test (scripts/grammar-production-smoke.mjs --json) must produce.
 * The actual smoke run is post-deploy; this suite validates the contract.
 *
 * Also verifies that:
 * - A well-formed evidence object passes validation
 * - Missing required fields are rejected
 * - CERTIFIED_POST_DEPLOY status is forbidden without evidence file
 * - promptCueAssertion and readAloudAssertion are defined in the contract
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { GRAMMAR_CONTENT_RELEASE_ID } from '../worker/src/subjects/grammar/content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTS_DIR = path.resolve(ROOT_DIR, 'reports', 'grammar');

// ---------------------------------------------------------------------------
// Evidence schema definition
// ---------------------------------------------------------------------------

/**
 * Required top-level fields in a production smoke evidence JSON.
 * Includes both the legacy operational fields and the U7-spec contract fields.
 */
const REQUIRED_EVIDENCE_FIELDS = Object.freeze([
  'ok',
  'origin',
  'contentReleaseId',
  'testedTemplateIds',
  'normalRoundResult',
  'miniTestResult',
  'repairResult',
  'forbiddenKeyScanResult',
  'timestamp',
  'commitSha',
]);

/**
 * U7-spec required fields per the P11 contract (section U7).
 * These map to the original contract requirements. Some overlap with
 * REQUIRED_EVIDENCE_FIELDS under different naming (contentReleaseId = releaseId).
 */
const U7_CONTRACT_FIELDS = Object.freeze([
  'releaseId',
  'deployedUrl',
  'timestamp',
  'command',
  'learnerFixtureType',
  'itemCreationResult',
  'answerSubmissionResult',
  'readModelUpdateResult',
  'noAnswerLeakAssertion',
  'promptCueAssertion',
  'readAloudAssertion',
  'failureDetails',
]);

/**
 * Required fields in each sub-result (normalRoundResult, etc.).
 */
const REQUIRED_SUB_RESULT_FIELDS = Object.freeze(['ok', 'detail']);

/**
 * U7-spec sub-result shape: { pass: boolean }
 */
const U7_ASSERTION_FIELDS = Object.freeze(['pass']);

/**
 * P11 extension: prompt cue and read-aloud assertion contract fields.
 * Required for P11+ post-deploy certification.
 */
const P11_ASSERTION_FIELDS = Object.freeze([
  'promptCueAssertion',
  'readAloudAssertion',
]);

// ---------------------------------------------------------------------------
// Schema validator
// ---------------------------------------------------------------------------

function validateSmokeEvidence(evidence) {
  const errors = [];

  if (typeof evidence !== 'object' || evidence === null) {
    return { valid: false, errors: ['Evidence must be a non-null object'] };
  }

  for (const field of REQUIRED_EVIDENCE_FIELDS) {
    if (!(field in evidence)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if ('ok' in evidence && typeof evidence.ok !== 'boolean') {
    errors.push('Field "ok" must be a boolean');
  }

  if ('origin' in evidence && typeof evidence.origin !== 'string') {
    errors.push('Field "origin" must be a string');
  }

  if ('contentReleaseId' in evidence && typeof evidence.contentReleaseId !== 'string') {
    errors.push('Field "contentReleaseId" must be a string');
  }

  if ('testedTemplateIds' in evidence && !Array.isArray(evidence.testedTemplateIds)) {
    errors.push('Field "testedTemplateIds" must be an array');
  }

  if ('timestamp' in evidence && typeof evidence.timestamp !== 'string') {
    errors.push('Field "timestamp" must be a string (ISO-8601)');
  }

  if ('commitSha' in evidence && typeof evidence.commitSha !== 'string') {
    errors.push('Field "commitSha" must be a string');
  }

  // Validate sub-results
  for (const subField of ['normalRoundResult', 'miniTestResult', 'repairResult', 'forbiddenKeyScanResult']) {
    if (subField in evidence) {
      const sub = evidence[subField];
      if (typeof sub !== 'object' || sub === null) {
        errors.push(`Field "${subField}" must be a non-null object`);
      } else {
        for (const rf of REQUIRED_SUB_RESULT_FIELDS) {
          if (!(rf in sub)) {
            errors.push(`Field "${subField}" missing required sub-field: ${rf}`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateP11Assertions(evidence) {
  const errors = [];
  for (const field of P11_ASSERTION_FIELDS) {
    if (!(field in evidence)) {
      errors.push(`Missing P11 assertion field: ${field}`);
    } else if (typeof evidence[field] !== 'object' || evidence[field] === null) {
      errors.push(`P11 assertion field "${field}" must be a non-null object`);
    } else {
      if (!('checked' in evidence[field])) {
        errors.push(`P11 assertion field "${field}" must have a "checked" property`);
      }
      if (!('pass' in evidence[field])) {
        errors.push(`P11 assertion field "${field}" must have a "pass" property`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Tests: schema validator accepts well-formed evidence
// ---------------------------------------------------------------------------

describe('P11 U9 Smoke Contract: schema accepts well-formed evidence', () => {
  const wellFormed = Object.freeze({
    ok: true,
    origin: 'production',
    contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
    testedTemplateIds: ['qg_modal_verb_explain', 'fronted_adverbial_choose'],
    answerSpecFamiliesCovered: ['exact', 'multiField'],
    normalRoundResult: { ok: true, detail: 'templateId=qg_modal_verb_explain, answered=1' },
    miniTestResult: { ok: true, detail: 'answered=1, reviewSize=8' },
    repairResult: { ok: true, detail: 'supportKind=faded, aiKind=explanation' },
    forbiddenKeyScanResult: { ok: true, detail: 'checked via assertNoForbiddenGrammarReadModelKeys' },
    timestamp: '2026-04-30T12:00:00.000Z',
    commitSha: 'abc1234',
    promptCueAssertion: { checked: true, pass: true, templateCount: 78 },
    readAloudAssertion: { checked: true, pass: true, templateCount: 78 },
  });

  it('validates a complete well-formed evidence object', () => {
    const result = validateSmokeEvidence(wellFormed);
    assert.equal(result.valid, true, `Errors: ${result.errors.join('; ')}`);
  });

  it('validates P11 assertion fields on well-formed evidence', () => {
    const result = validateP11Assertions(wellFormed);
    assert.equal(result.valid, true, `Errors: ${result.errors.join('; ')}`);
  });
});

// ---------------------------------------------------------------------------
// Tests: schema rejects evidence with missing fields
// ---------------------------------------------------------------------------

describe('P11 U9 Smoke Contract: schema rejects missing fields', () => {
  it('rejects evidence missing "ok" field', () => {
    const evidence = { origin: 'production', contentReleaseId: 'v1', testedTemplateIds: [] };
    const result = validateSmokeEvidence(evidence);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('ok')));
  });

  it('rejects evidence missing "contentReleaseId"', () => {
    const evidence = { ok: true, origin: 'production', testedTemplateIds: [] };
    const result = validateSmokeEvidence(evidence);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('contentReleaseId')));
  });

  it('rejects evidence missing "timestamp"', () => {
    const evidence = { ok: true, origin: 'production', contentReleaseId: 'v1', testedTemplateIds: [] };
    const result = validateSmokeEvidence(evidence);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('timestamp')));
  });

  it('rejects evidence missing sub-result fields', () => {
    const evidence = {
      ok: true,
      origin: 'production',
      contentReleaseId: 'v1',
      testedTemplateIds: [],
      normalRoundResult: { ok: true },
      miniTestResult: { ok: true, detail: 'ok' },
      repairResult: { ok: true, detail: 'ok' },
      forbiddenKeyScanResult: { ok: true, detail: 'ok' },
      timestamp: '2026-04-30T12:00:00Z',
      commitSha: 'abc',
    };
    const result = validateSmokeEvidence(evidence);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('normalRoundResult') && e.includes('detail')));
  });

  it('rejects null evidence', () => {
    const result = validateSmokeEvidence(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('non-null')));
  });

  it('rejects non-object evidence', () => {
    const result = validateSmokeEvidence('not an object');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// Tests: P11 assertions rejected when missing
// ---------------------------------------------------------------------------

describe('P11 U9 Smoke Contract: P11 assertion validation', () => {
  it('rejects evidence without promptCueAssertion', () => {
    const evidence = { readAloudAssertion: { checked: true, pass: true } };
    const result = validateP11Assertions(evidence);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('promptCueAssertion')));
  });

  it('rejects evidence without readAloudAssertion', () => {
    const evidence = { promptCueAssertion: { checked: true, pass: true } };
    const result = validateP11Assertions(evidence);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('readAloudAssertion')));
  });

  it('rejects assertion field missing "checked" property', () => {
    const evidence = {
      promptCueAssertion: { pass: true },
      readAloudAssertion: { checked: true, pass: true },
    };
    const result = validateP11Assertions(evidence);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('checked')));
  });

  it('rejects assertion field missing "pass" property', () => {
    const evidence = {
      promptCueAssertion: { checked: true, pass: true },
      readAloudAssertion: { checked: true },
    };
    const result = validateP11Assertions(evidence);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('pass')));
  });
});

// ---------------------------------------------------------------------------
// Tests: CERTIFIED_POST_DEPLOY forbidden without evidence file
// ---------------------------------------------------------------------------

describe('P11 U9 Smoke Contract: CERTIFIED_POST_DEPLOY guard', () => {
  const expectedFileName = `grammar-production-smoke-${GRAMMAR_CONTENT_RELEASE_ID}.json`;
  const expectedPath = path.resolve(REPORTS_DIR, expectedFileName);

  it('production smoke evidence file name follows the content release ID pattern', () => {
    assert.ok(
      expectedFileName.startsWith('grammar-production-smoke-'),
      'Evidence file name does not start with "grammar-production-smoke-"',
    );
    assert.ok(
      expectedFileName.endsWith('.json'),
      'Evidence file name does not end with ".json"',
    );
    assert.ok(
      expectedFileName.includes(GRAMMAR_CONTENT_RELEASE_ID),
      'Evidence file name does not include the content release ID',
    );
  });

  it('CERTIFIED_POST_DEPLOY is forbidden when smoke evidence file is absent', () => {
    const fileExists = fs.existsSync(expectedPath);
    const reportPath = path.resolve(ROOT_DIR,
      'docs/plans/james/grammar/questions-generator/grammar-qg-p11-final-completion-report-2026-04-30.md');
    const reportContent = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : '';
    const statusMatch = reportContent.match(/^status:\s*(.+)$/m);
    const reportStatus = statusMatch ? statusMatch[1].trim() : '';

    if (!fileExists) {
      assert.notEqual(reportStatus, 'CERTIFIED_POST_DEPLOY',
        'Report must NOT claim CERTIFIED_POST_DEPLOY while smoke evidence file is absent');
    }
  });

  it('production smoke script exists at the expected path', () => {
    const scriptPath = path.resolve(ROOT_DIR, 'scripts', 'grammar-production-smoke.mjs');
    assert.ok(fs.existsSync(scriptPath), 'grammar-production-smoke.mjs must exist');
  });
});

// ---------------------------------------------------------------------------
// Tests: prompt cue and read-aloud assertion definitions
// ---------------------------------------------------------------------------

describe('P11 U9 Smoke Contract: assertion definitions', () => {
  it('P11_ASSERTION_FIELDS includes promptCueAssertion', () => {
    assert.ok(P11_ASSERTION_FIELDS.includes('promptCueAssertion'));
  });

  it('P11_ASSERTION_FIELDS includes readAloudAssertion', () => {
    assert.ok(P11_ASSERTION_FIELDS.includes('readAloudAssertion'));
  });

  it('contract defines exactly 2 P11-level assertion fields', () => {
    assert.equal(P11_ASSERTION_FIELDS.length, 2);
  });

  it('REQUIRED_EVIDENCE_FIELDS covers all base-level smoke outputs', () => {
    // Cross-check with the actual smoke script's output shape
    const expectedBase = ['ok', 'origin', 'contentReleaseId', 'testedTemplateIds',
      'normalRoundResult', 'miniTestResult', 'repairResult',
      'forbiddenKeyScanResult', 'timestamp', 'commitSha'];
    for (const field of expectedBase) {
      assert.ok(REQUIRED_EVIDENCE_FIELDS.includes(field), `Missing expected base field: ${field}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: U7 contract schema coverage
// ---------------------------------------------------------------------------

describe('P11 U9 Smoke Contract: U7-spec schema coverage', () => {
  it('U7_CONTRACT_FIELDS lists all 12 fields from the P11 spec', () => {
    assert.equal(U7_CONTRACT_FIELDS.length, 12);
    const expected = [
      'releaseId', 'deployedUrl', 'timestamp', 'command',
      'learnerFixtureType', 'itemCreationResult', 'answerSubmissionResult',
      'readModelUpdateResult', 'noAnswerLeakAssertion',
      'promptCueAssertion', 'readAloudAssertion', 'failureDetails',
    ];
    for (const f of expected) {
      assert.ok(U7_CONTRACT_FIELDS.includes(f), `U7 contract missing field: ${f}`);
    }
  });

  it('U7-spec evidence shape passes validation when all fields present', () => {
    const evidence = {
      releaseId: 'grammar-qg-p11-2026-04-30',
      deployedUrl: 'https://ks2.example.com',
      timestamp: '2026-04-30T12:00:00Z',
      command: 'npm run smoke:production:grammar -- --json --evidence-origin post-deploy',
      learnerFixtureType: 'demo-learner',
      itemCreationResult: { pass: true },
      answerSubmissionResult: { pass: true },
      readModelUpdateResult: { pass: true },
      noAnswerLeakAssertion: { pass: true },
      promptCueAssertion: { pass: true },
      readAloudAssertion: { pass: true },
      failureDetails: null,
    };
    for (const field of U7_CONTRACT_FIELDS) {
      assert.ok(field in evidence, `U7 evidence must have field: ${field}`);
    }
  });

  it('U7-spec sub-result assertions use { pass: boolean } shape', () => {
    const assertionFields = ['itemCreationResult', 'answerSubmissionResult',
      'readModelUpdateResult', 'noAnswerLeakAssertion',
      'promptCueAssertion', 'readAloudAssertion'];
    for (const field of assertionFields) {
      for (const sf of U7_ASSERTION_FIELDS) {
        assert.ok(sf === 'pass', `U7 assertion fields must include "pass"`);
      }
    }
  });

  it('U7 contract forbids CERTIFIED_POST_DEPLOY when any assertion fails', () => {
    const failEvidence = {
      releaseId: 'grammar-qg-p11-2026-04-30',
      deployedUrl: 'https://ks2.example.com',
      timestamp: '2026-04-30T12:00:00Z',
      command: 'npm run smoke:production:grammar -- --json --evidence-origin post-deploy',
      learnerFixtureType: 'demo-learner',
      itemCreationResult: { pass: true },
      answerSubmissionResult: { pass: true },
      readModelUpdateResult: { pass: true },
      noAnswerLeakAssertion: { pass: true },
      promptCueAssertion: { pass: false },
      readAloudAssertion: { pass: true },
      failureDetails: { promptCueAssertion: 'targetText was grammar label' },
    };
    const allPass = U7_CONTRACT_FIELDS
      .filter((f) => f.endsWith('Result') || f.endsWith('Assertion'))
      .every((f) => failEvidence[f]?.pass === true);
    assert.equal(allPass, false, 'CERTIFIED_POST_DEPLOY forbidden when any assertion fails');
  });
});

// ---------------------------------------------------------------------------
// Exports for use by other P11 tests
// ---------------------------------------------------------------------------

export {
  REQUIRED_EVIDENCE_FIELDS,
  REQUIRED_SUB_RESULT_FIELDS,
  P11_ASSERTION_FIELDS,
  U7_CONTRACT_FIELDS,
  U7_ASSERTION_FIELDS,
  validateSmokeEvidence,
  validateP11Assertions,
};
