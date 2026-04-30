import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SMOKE_EVIDENCE_REQUIRED_FIELDS } from '../scripts/validate-grammar-qg-certification-evidence.mjs';

/**
 * P12 contract: all fields that a production smoke evidence JSON MUST contain.
 * This is the single source of truth for test assertions below.
 */
const P12_CONTRACT_FIELDS = [
  'ok',
  'releaseId',
  'evidenceOrigin',
  'environment',
  'deployedUrl',
  'timestamp',
  'command',
  'learnerFixtureType',
  'itemCreationResult',
  'answerSubmissionResult',
  'readModelUpdateResult',
  'noAnswerLeakAssertion',
  'semanticCueAssertion',
  'promptCueAssertion',
  'readAloudAssertion',
  'releaseIdAssertion',
  'failureDetails',
];

describe('Grammar QG P12 — smoke evidence contract', () => {
  it('SMOKE_EVIDENCE_REQUIRED_FIELDS covers all P12-contract-required fields', () => {
    for (const field of P12_CONTRACT_FIELDS) {
      assert.ok(
        SMOKE_EVIDENCE_REQUIRED_FIELDS.includes(field),
        `SMOKE_EVIDENCE_REQUIRED_FIELDS is missing P12-required field: "${field}"`
      );
    }
  });

  it('SMOKE_EVIDENCE_REQUIRED_FIELDS does not contain duplicates', () => {
    const seen = new Set();
    for (const field of SMOKE_EVIDENCE_REQUIRED_FIELDS) {
      assert.ok(!seen.has(field), `Duplicate field in SMOKE_EVIDENCE_REQUIRED_FIELDS: "${field}"`);
      seen.add(field);
    }
  });

  it('semanticCueAssertion is present in the validator (new in P12)', () => {
    assert.ok(
      SMOKE_EVIDENCE_REQUIRED_FIELDS.includes('semanticCueAssertion'),
      'SMOKE_EVIDENCE_REQUIRED_FIELDS must include semanticCueAssertion (P12 addition)'
    );
  });

  it('releaseIdAssertion is present in the validator (new in P12)', () => {
    assert.ok(
      SMOKE_EVIDENCE_REQUIRED_FIELDS.includes('releaseIdAssertion'),
      'SMOKE_EVIDENCE_REQUIRED_FIELDS must include releaseIdAssertion (P12 addition)'
    );
  });

  it('evidenceOrigin is present in the validator (new in P12)', () => {
    assert.ok(
      SMOKE_EVIDENCE_REQUIRED_FIELDS.includes('evidenceOrigin'),
      'SMOKE_EVIDENCE_REQUIRED_FIELDS must include evidenceOrigin (P12 addition)'
    );
  });

  it('environment is present in the validator (new in P12)', () => {
    assert.ok(
      SMOKE_EVIDENCE_REQUIRED_FIELDS.includes('environment'),
      'SMOKE_EVIDENCE_REQUIRED_FIELDS must include environment (P12 addition)'
    );
  });

  it('P12 contract field list matches SMOKE_EVIDENCE_REQUIRED_FIELDS exactly', () => {
    assert.deepEqual(
      [...SMOKE_EVIDENCE_REQUIRED_FIELDS].sort(),
      [...P12_CONTRACT_FIELDS].sort(),
      'SMOKE_EVIDENCE_REQUIRED_FIELDS and P12_CONTRACT_FIELDS must contain the same fields'
    );
  });

  it('all P12-contract fields are non-empty strings', () => {
    for (const field of P12_CONTRACT_FIELDS) {
      assert.equal(typeof field, 'string', `Field must be a string: ${field}`);
      assert.ok(field.length > 0, `Field must not be empty`);
    }
  });
});
