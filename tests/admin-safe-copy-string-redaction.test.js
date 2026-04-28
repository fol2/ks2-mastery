// P6 Unit 3: Hostile-seeded string redaction tests for admin-safe-copy.js
//
// Verifies that `prepareSafeCopy` and `redactString` correctly detect and
// mask/strip sensitive tokens embedded in plain strings, closing the
// string-passthrough gap documented in the characterisation baseline.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  COPY_AUDIENCE,
  prepareSafeCopy,
  redactString,
  maskEmail,
  maskId,
} from '../src/platform/hubs/admin-safe-copy.js';

// ---------------------------------------------------------------------------
// redactString — direct unit tests
// ---------------------------------------------------------------------------

describe('redactString direct tests', () => {
  it('returns empty string and no redactions for null input', () => {
    const { text, appliedRedactions } = redactString(null, COPY_AUDIENCE.ADMIN_ONLY);
    assert.equal(text, '');
    assert.deepEqual(appliedRedactions, []);
  });

  it('returns empty string and no redactions for empty string input', () => {
    const { text, appliedRedactions } = redactString('', COPY_AUDIENCE.ADMIN_ONLY);
    assert.equal(text, '');
    assert.deepEqual(appliedRedactions, []);
  });

  it('normal text passes through unchanged at all audiences', () => {
    const input = 'Normal text with no sensitive content';
    for (const audience of Object.values(COPY_AUDIENCE)) {
      const { text, appliedRedactions } = redactString(input, audience);
      assert.equal(text, input, `Failed for audience: ${audience}`);
      assert.deepEqual(appliedRedactions, [], `Unexpected redactions for ${audience}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Auth tokens — redacted at ALL audiences including ADMIN_ONLY
// ---------------------------------------------------------------------------

describe('redactString auth token detection', () => {
  const BEARER_INPUT = 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature found in header';

  it('Bearer token redacted at ADMIN_ONLY', () => {
    const { text, appliedRedactions } = redactString(BEARER_INPUT, COPY_AUDIENCE.ADMIN_ONLY);
    assert.ok(!text.includes('eyJ'), 'Token must not appear in output');
    assert.ok(text.includes('[auth redacted]'));
    assert.ok(text.includes('found in header'), 'Non-sensitive text preserved');
    assert.ok(appliedRedactions.includes('auth_tokens'));
  });

  it('Bearer token redacted at OPS_SAFE', () => {
    const { text } = redactString(BEARER_INPUT, COPY_AUDIENCE.OPS_SAFE);
    assert.ok(!text.includes('eyJ'));
    assert.ok(text.includes('[auth redacted]'));
  });

  it('Bearer token redacted at PARENT_SAFE', () => {
    const { text } = redactString(BEARER_INPUT, COPY_AUDIENCE.PARENT_SAFE);
    assert.ok(!text.includes('eyJ'));
    assert.ok(text.includes('[auth redacted]'));
  });

  it('Basic auth redacted', () => {
    const input = 'Basic dXNlcjpwYXNzd29yZA== in Authorization header';
    const { text, appliedRedactions } = redactString(input, COPY_AUDIENCE.ADMIN_ONLY);
    assert.ok(!text.includes('dXNlcjpwYXNzd29yZA=='));
    assert.ok(text.includes('[auth redacted]'));
    assert.ok(appliedRedactions.includes('auth_tokens'));
  });

  it('cookie values redacted', () => {
    const input = 'Found session=abc123def456ghi789; in request';
    const { text, appliedRedactions } = redactString(input, COPY_AUDIENCE.ADMIN_ONLY);
    assert.ok(!text.includes('abc123def456ghi789'));
    assert.ok(text.includes('[cookie redacted]'));
    assert.ok(appliedRedactions.includes('cookie_values'));
  });
});

// ---------------------------------------------------------------------------
// OPS_SAFE — emails and account IDs masked
// ---------------------------------------------------------------------------

describe('redactString OPS_SAFE level', () => {
  it('email addresses masked using maskEmail()', () => {
    const input = 'User james@example.com reported issue';
    const { text, appliedRedactions } = redactString(input, COPY_AUDIENCE.OPS_SAFE);
    assert.ok(!text.includes('james@example.com'), 'Raw email must not appear');
    assert.ok(text.includes(maskEmail('james@example.com')));
    assert.ok(appliedRedactions.includes('emails_masked'));
  });

  it('multiple emails both masked', () => {
    const input = 'Multiple emails: a@b.com and c@d.org in one string';
    const { text, appliedRedactions } = redactString(input, COPY_AUDIENCE.OPS_SAFE);
    assert.ok(!text.includes('a@b.com'), 'First email must not appear');
    assert.ok(!text.includes('c@d.org'), 'Second email must not appear');
    assert.ok(appliedRedactions.includes('emails_masked'));
  });

  it('account IDs masked using maskId()', () => {
    const input = 'Account acc_abc123def456789 has issues';
    const { text, appliedRedactions } = redactString(input, COPY_AUDIENCE.OPS_SAFE);
    assert.ok(!text.includes('acc_abc123def456789'), 'Raw account ID must not appear');
    assert.ok(text.includes(maskId('acc_abc123def456789')));
    assert.ok(appliedRedactions.includes('account_ids_masked'));
  });

  it('session IDs masked', () => {
    const input = 'Session sess_xyz789abcdef expired';
    const { text, appliedRedactions } = redactString(input, COPY_AUDIENCE.OPS_SAFE);
    assert.ok(!text.includes('sess_xyz789abcdef'), 'Raw session ID must not appear');
    assert.ok(appliedRedactions.includes('session_ids_masked'));
  });

  it('UUID-shaped strings masked', () => {
    const input = 'ID is 550e8400-e29b-41d4-a716-446655440000 in the system';
    const { text, appliedRedactions } = redactString(input, COPY_AUDIENCE.OPS_SAFE);
    assert.ok(!text.includes('550e8400-e29b-41d4-a716-446655440000'));
    assert.ok(appliedRedactions.includes('session_ids_masked'));
  });
});

// ---------------------------------------------------------------------------
// PARENT_SAFE — learner IDs, stack traces, internal routes, table names
// ---------------------------------------------------------------------------

describe('redactString PARENT_SAFE level', () => {
  it('learner IDs stripped entirely', () => {
    const input = 'Learner lrn_abc123 has completed the task';
    const { text, appliedRedactions } = redactString(input, COPY_AUDIENCE.PARENT_SAFE);
    assert.ok(!text.includes('lrn_abc123'), 'Learner ID must not appear');
    assert.ok(text.includes('[redacted]'));
    assert.ok(appliedRedactions.includes('learner_ids'));
  });

  it('stack traces redacted', () => {
    const input = 'Session sess_xyz789abcdef expired\n  at Worker.fetch (worker/src/app.js:42:15)\n  at Object.handle';
    const { text, appliedRedactions } = redactString(input, COPY_AUDIENCE.PARENT_SAFE);
    assert.ok(!text.includes('Worker.fetch'), 'Stack frame must not appear');
    assert.ok(!text.includes('worker/src/app.js'));
    assert.ok(text.includes('[stack trace redacted]'));
    assert.ok(appliedRedactions.includes('stack_traces'));
  });

  it('internal admin routes redacted', () => {
    const input = 'Error in /api/admin/ops/error-events route: lookup failed';
    const { text, appliedRedactions } = redactString(input, COPY_AUDIENCE.PARENT_SAFE);
    assert.ok(!text.includes('/api/admin/ops/error-events'), 'Internal route must not appear');
    assert.ok(text.includes('[internal route redacted]'));
    assert.ok(appliedRedactions.includes('internal_routes'));
  });

  it('internal API routes (/api/internal/) redacted', () => {
    const input = 'Called /api/internal/health-check and failed';
    const { text, appliedRedactions } = redactString(input, COPY_AUDIENCE.PARENT_SAFE);
    assert.ok(!text.includes('/api/internal/health-check'));
    assert.ok(text.includes('[internal route redacted]'));
    assert.ok(appliedRedactions.includes('internal_routes'));
  });

  it('internal table/column names redacted', () => {
    const input = 'Error in /api/admin/ops/error-events route: d1.accounts table lookup failed';
    const { text, appliedRedactions } = redactString(input, COPY_AUDIENCE.PARENT_SAFE);
    assert.ok(!text.includes('d1.accounts'), 'Internal table name must not appear');
    assert.ok(text.includes('[internal reference redacted]'));
    assert.ok(appliedRedactions.includes('internal_references'));
  });

  it('d1.learner_state table name redacted', () => {
    const input = 'Query to d1.learner_state timed out';
    const { text, appliedRedactions } = redactString(input, COPY_AUDIENCE.PARENT_SAFE);
    assert.ok(!text.includes('d1.learner_state'));
    assert.ok(text.includes('[internal reference redacted]'));
    assert.ok(appliedRedactions.includes('internal_references'));
  });
});

// ---------------------------------------------------------------------------
// Combined hostile strings via prepareSafeCopy
// ---------------------------------------------------------------------------

describe('prepareSafeCopy string redaction integration', () => {
  it('email + account ID redacted at PARENT_SAFE', () => {
    const input = 'User james@example.com reported issue with account acc_abc123def456789';
    const result = prepareSafeCopy(input, COPY_AUDIENCE.PARENT_SAFE);
    assert.equal(result.ok, true);
    assert.ok(!result.text.includes('james@example.com'), 'Email must be gone');
    assert.ok(!result.text.includes('acc_abc123def456789'), 'Account ID must be gone');
  });

  it('stack trace + session ID redacted at PARENT_SAFE', () => {
    const input = 'Session sess_xyz789abcdef expired\n  at Worker.fetch (worker/src/app.js:42:15)\n  at Object.handle';
    const result = prepareSafeCopy(input, COPY_AUDIENCE.PARENT_SAFE);
    assert.equal(result.ok, true);
    assert.ok(!result.text.includes('sess_xyz789abcdef'), 'Session ID must be gone');
    assert.ok(!result.text.includes('Worker.fetch'), 'Stack trace must be gone');
  });

  it('internal route + table name redacted at PARENT_SAFE', () => {
    const input = 'Error in /api/admin/ops/error-events route: d1.accounts table lookup failed';
    const result = prepareSafeCopy(input, COPY_AUDIENCE.PARENT_SAFE);
    assert.equal(result.ok, true);
    assert.ok(!result.text.includes('/api/admin/ops/error-events'));
    assert.ok(!result.text.includes('d1.accounts'));
  });

  it('Bearer token redacted at ADMIN_ONLY', () => {
    const input = 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature found in header';
    const result = prepareSafeCopy(input, COPY_AUDIENCE.ADMIN_ONLY);
    assert.equal(result.ok, true);
    assert.ok(!result.text.includes('eyJ'));
    assert.ok(result.text.includes('[auth redacted]'));
    assert.ok(result.redactedFields.includes('auth_tokens'));
  });

  it('normal text passes through unchanged at all levels', () => {
    const input = 'Normal text with no sensitive content';
    for (const audience of Object.values(COPY_AUDIENCE)) {
      const result = prepareSafeCopy(input, audience);
      assert.equal(result.ok, true, `Failed for audience: ${audience}`);
      assert.equal(result.text, input, `Text mutated for ${audience}`);
      assert.deepEqual(result.redactedFields, [], `Unexpected redactions for ${audience}`);
    }
  });

  it('multiple emails masked at OPS_SAFE', () => {
    const input = 'Multiple emails: a@b.com and c@d.org in one string';
    const result = prepareSafeCopy(input, COPY_AUDIENCE.OPS_SAFE);
    assert.equal(result.ok, true);
    assert.ok(!result.text.includes('a@b.com'));
    assert.ok(!result.text.includes('c@d.org'));
    assert.ok(result.redactedFields.includes('emails_masked'));
  });

  it('very long string (10KB) completes without crash', () => {
    const input = 'A'.repeat(10240);
    const result = prepareSafeCopy(input, COPY_AUDIENCE.PARENT_SAFE);
    assert.equal(result.ok, true);
    assert.equal(result.text, input); // no sensitive content → unchanged
    assert.equal(result.text.length, 10240);
  });

  it('empty string returns ok: false', () => {
    const result = prepareSafeCopy('', COPY_AUDIENCE.ADMIN_ONLY);
    assert.equal(result.ok, false);
  });

  it('whitespace-only string returns ok: false', () => {
    const result = prepareSafeCopy('   ', COPY_AUDIENCE.PARENT_SAFE);
    assert.equal(result.ok, false);
  });

  it('redactedFields indicates what was applied', () => {
    const input = 'Bearer eyJhbGciOiJIUzI1NiJ9.x.y and session=abcdef123456; plus user@test.org';
    const result = prepareSafeCopy(input, COPY_AUDIENCE.OPS_SAFE);
    assert.equal(result.ok, true);
    assert.ok(result.redactedFields.includes('auth_tokens'));
    assert.ok(result.redactedFields.includes('cookie_values'));
    assert.ok(result.redactedFields.includes('emails_masked'));
  });
});
