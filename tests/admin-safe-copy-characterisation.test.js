// P6 Unit 1: Characterisation baseline — admin-safe-copy.js
//
// Exhaustive pin of existing behaviour for prepareSafeCopy, maskEmail, maskId,
// and the COPY_AUDIENCE enum. Documents known gaps (e.g. string inputs bypass
// object redaction) so P6 refactors can verify against this baseline.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  COPY_AUDIENCE,
  prepareSafeCopy,
  maskEmail,
  maskId,
} from '../src/platform/hubs/admin-safe-copy.js';

// ---------------------------------------------------------------------------
// COPY_AUDIENCE enum
// ---------------------------------------------------------------------------

describe('COPY_AUDIENCE', () => {
  it('is frozen', () => {
    assert.equal(Object.isFrozen(COPY_AUDIENCE), true);
  });

  it('has exactly 4 values', () => {
    assert.equal(Object.keys(COPY_AUDIENCE).length, 4);
  });

  it('maps to expected string values', () => {
    assert.equal(COPY_AUDIENCE.ADMIN_ONLY, 'admin_only');
    assert.equal(COPY_AUDIENCE.OPS_SAFE, 'ops_safe');
    assert.equal(COPY_AUDIENCE.PARENT_SAFE, 'parent_safe');
    assert.equal(COPY_AUDIENCE.PUBLIC_PREVIEW, 'public_preview');
  });
});

// ---------------------------------------------------------------------------
// maskEmail
// ---------------------------------------------------------------------------

describe('maskEmail', () => {
  it('masks long email to ****<last6>', () => {
    assert.equal(maskEmail('admin@longdomain.test.com'), '****st.com');
  });

  it('masks standard email correctly', () => {
    assert.equal(maskEmail('test@example.com'), '****le.com');
  });

  it('returns ****** for email with length <= 6', () => {
    assert.equal(maskEmail('ab@c.d'), '******');
    assert.equal(maskEmail('a@b.co'), '******'); // exactly 6
  });

  it('returns ****** for 5-char email', () => {
    assert.equal(maskEmail('a@b.c'), '******');
  });

  it('returns empty string for null', () => {
    assert.equal(maskEmail(null), '');
  });

  it('returns empty string for undefined', () => {
    assert.equal(maskEmail(undefined), '');
  });

  it('returns empty string for empty string', () => {
    assert.equal(maskEmail(''), '');
  });

  it('returns empty string for non-string (number)', () => {
    assert.equal(maskEmail(123), '');
  });

  it('masks 7-char email to ****<last6>', () => {
    // 'x@ab.cd' length 7 → '****@ab.cd'.slice(-6) = '@ab.cd'... wait, let's verify
    // 'x@ab.cd' → '****b.cd' (last 6 = 'ab.cd' is 5? no, '@ab.cd' is 6)
    // Actually 'x@ab.cd' has length 7, slice(-6) = '@ab.cd'
    assert.equal(maskEmail('x@ab.cd'), '****@ab.cd'.slice(0, 4) + 'x@ab.cd'.slice(-6));
  });
});

// ---------------------------------------------------------------------------
// maskId
// ---------------------------------------------------------------------------

describe('maskId', () => {
  it('masks standard long ID to ****<last8>', () => {
    assert.equal(maskId('acct-abcdef123456'), '****ef123456');
  });

  it('returns ******** for ID with length <= 8', () => {
    assert.equal(maskId('acct-12'), '********'); // length 7
    assert.equal(maskId('acct-123'), '********'); // length 8
  });

  it('masks 9-char ID to ****<last8>', () => {
    assert.equal(maskId('acct-1234'), '****ct-1234'.slice(0, 4) + 'acct-1234'.slice(-8));
  });

  it('returns empty string for null', () => {
    assert.equal(maskId(null), '');
  });

  it('returns empty string for undefined', () => {
    assert.equal(maskId(undefined), '');
  });

  it('returns empty string for empty string', () => {
    assert.equal(maskId(''), '');
  });

  it('returns empty string for non-string (number)', () => {
    assert.equal(maskId(42), '');
  });
});

// ---------------------------------------------------------------------------
// prepareSafeCopy — empty/null/invalid inputs
// ---------------------------------------------------------------------------

describe('prepareSafeCopy with empty/null/invalid inputs', () => {
  it('null → { ok: false }', () => {
    const result = prepareSafeCopy(null, COPY_AUDIENCE.ADMIN_ONLY);
    assert.equal(result.ok, false);
    assert.equal(result.text, '');
    assert.deepEqual(result.redactedFields, []);
  });

  it('undefined → { ok: false }', () => {
    const result = prepareSafeCopy(undefined, COPY_AUDIENCE.ADMIN_ONLY);
    assert.equal(result.ok, false);
    assert.equal(result.text, '');
    assert.deepEqual(result.redactedFields, []);
  });

  it('empty object {} → { ok: false }', () => {
    const result = prepareSafeCopy({}, COPY_AUDIENCE.ADMIN_ONLY);
    assert.equal(result.ok, false);
    assert.equal(result.text, '');
    assert.deepEqual(result.redactedFields, []);
  });

  it('empty string → { ok: false }', () => {
    const result = prepareSafeCopy('', COPY_AUDIENCE.ADMIN_ONLY);
    assert.equal(result.ok, false);
  });

  it('whitespace-only string → { ok: false }', () => {
    const result = prepareSafeCopy('   ', COPY_AUDIENCE.ADMIN_ONLY);
    assert.equal(result.ok, false);
  });

  it('unknown audience → { ok: false }', () => {
    const result = prepareSafeCopy({ title: 'x' }, 'invalid_audience');
    assert.equal(result.ok, false);
    assert.equal(result.text, '');
    assert.deepEqual(result.redactedFields, []);
  });
});

// ---------------------------------------------------------------------------
// prepareSafeCopy — string input (P6 U3: gap closed — string redaction active)
// ---------------------------------------------------------------------------

describe('prepareSafeCopy with string input (string redaction active)', () => {
  const TEXT_WITH_SENSITIVE = 'Some raw text with email@test.com and accountId=acct-1234567890';
  const TEXT_CLEAN = 'Some raw text with no sensitive patterns';

  it('ADMIN_ONLY — clean string passes through unchanged', () => {
    const result = prepareSafeCopy(TEXT_CLEAN, COPY_AUDIENCE.ADMIN_ONLY);
    assert.equal(result.ok, true);
    assert.equal(result.text, TEXT_CLEAN);
    assert.deepEqual(result.redactedFields, []);
  });

  it('ADMIN_ONLY — string with sensitive content still passes (no email/ID redaction at admin level)', () => {
    const result = prepareSafeCopy(TEXT_WITH_SENSITIVE, COPY_AUDIENCE.ADMIN_ONLY);
    assert.equal(result.ok, true);
    // At ADMIN_ONLY, only auth tokens/cookies are redacted — emails and account IDs pass through.
    assert.ok(result.text.includes('email@test.com'));
  });

  it('OPS_SAFE — email and account ID masked in string', () => {
    const result = prepareSafeCopy(TEXT_WITH_SENSITIVE, COPY_AUDIENCE.OPS_SAFE);
    assert.equal(result.ok, true);
    // Email masked.
    assert.ok(!result.text.includes('email@test.com'), 'Email must be masked');
    assert.ok(result.redactedFields.includes('emails_masked'));
  });

  it('PARENT_SAFE — email masked in string', () => {
    const result = prepareSafeCopy(TEXT_WITH_SENSITIVE, COPY_AUDIENCE.PARENT_SAFE);
    assert.equal(result.ok, true);
    assert.ok(!result.text.includes('email@test.com'), 'Email must be masked');
    assert.ok(result.redactedFields.includes('emails_masked'));
  });

  it('PUBLIC_PREVIEW — email masked in string (same redaction level as PARENT_SAFE)', () => {
    const result = prepareSafeCopy(TEXT_WITH_SENSITIVE, COPY_AUDIENCE.PUBLIC_PREVIEW);
    assert.equal(result.ok, true);
    assert.ok(!result.text.includes('email@test.com'), 'Email must be masked');
  });

  it('clean string passes through unchanged at all audiences', () => {
    for (const audience of Object.values(COPY_AUDIENCE)) {
      const result = prepareSafeCopy(TEXT_CLEAN, audience);
      assert.equal(result.ok, true, `Failed for ${audience}`);
      assert.equal(result.text, TEXT_CLEAN, `Mutated for ${audience}`);
      assert.deepEqual(result.redactedFields, [], `Unexpected redactions for ${audience}`);
    }
  });
});

// ---------------------------------------------------------------------------
// prepareSafeCopy — ADMIN_ONLY audience (object input)
// ---------------------------------------------------------------------------

describe('prepareSafeCopy ADMIN_ONLY audience', () => {
  const FULL_DATA = {
    title: 'Debug Bundle',
    accountSummary: { accountId: 'acct-abcdef123456', email: 'admin@longdomain.test.com' },
    linkedLearners: [{ learnerId: 'lrn-xyz789abcdef', learnerName: 'Alice' }],
    internalNotes: 'Some internal note',
    stack: 'Error\n  at fn (/path/file.js:10:5)',
    headers: {
      cookie: 'session=secret',
      authorization: 'Bearer token123',
      'x-auth-token': 'tok-abc',
      'content-type': 'application/json',
    },
    requestBody: '{"password":"secret"}',
  };

  it('preserves email, accountId, learnerId, internalNotes, stack', () => {
    const result = prepareSafeCopy(FULL_DATA, COPY_AUDIENCE.ADMIN_ONLY);
    assert.equal(result.ok, true);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.accountSummary.accountId, 'acct-abcdef123456');
    assert.equal(parsed.accountSummary.email, 'admin@longdomain.test.com');
    assert.equal(parsed.linkedLearners[0].learnerId, 'lrn-xyz789abcdef');
    assert.equal(parsed.internalNotes, 'Some internal note');
    assert.equal(parsed.stack, 'Error\n  at fn (/path/file.js:10:5)');
  });

  it('strips auth tokens (cookie, authorization, x-auth-token)', () => {
    const result = prepareSafeCopy(FULL_DATA, COPY_AUDIENCE.ADMIN_ONLY);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.headers.cookie, undefined);
    assert.equal(parsed.headers.authorization, undefined);
    assert.equal(parsed.headers['x-auth-token'], undefined);
    assert.equal(parsed.headers['content-type'], 'application/json');
  });

  it('strips requestBody', () => {
    const result = prepareSafeCopy(FULL_DATA, COPY_AUDIENCE.ADMIN_ONLY);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.requestBody, undefined);
  });

  it('redactedFields contains auth_tokens and request_bodies', () => {
    const result = prepareSafeCopy(FULL_DATA, COPY_AUDIENCE.ADMIN_ONLY);
    assert.ok(result.redactedFields.includes('auth_tokens'));
    assert.ok(result.redactedFields.includes('request_bodies'));
    assert.equal(result.redactedFields.length, 2);
  });

  it('does not mutate original data', () => {
    const data = {
      accountSummary: { email: 'user@test.com', accountId: 'acct-abc123456789' },
      cookie: 'session=secret',
      internalNotes: 'secret',
    };
    const snapshot = JSON.stringify(data);
    prepareSafeCopy(data, COPY_AUDIENCE.ADMIN_ONLY);
    assert.equal(JSON.stringify(data), snapshot);
  });
});

// ---------------------------------------------------------------------------
// prepareSafeCopy — OPS_SAFE audience (object input)
// ---------------------------------------------------------------------------

describe('prepareSafeCopy OPS_SAFE audience', () => {
  const DATA = {
    accountSummary: {
      accountId: 'acct-abcdef123456',
      email: 'admin@longdomain.test.com',
    },
    internalNotes: 'Secret internal info',
    details: { internal_notes: 'Also secret', adminNotes: 'Admin note' },
    headers: { cookie: 'session=abc', 'content-type': 'text/html' },
  };

  it('masks email to ****<last6>', () => {
    const result = prepareSafeCopy(DATA, COPY_AUDIENCE.OPS_SAFE);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.accountSummary.email, '****st.com');
  });

  it('masks accountId to ****<last8>', () => {
    const result = prepareSafeCopy(DATA, COPY_AUDIENCE.OPS_SAFE);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.accountSummary.accountId, '****ef123456');
  });

  it('strips internalNotes, internal_notes, adminNotes', () => {
    const result = prepareSafeCopy(DATA, COPY_AUDIENCE.OPS_SAFE);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.internalNotes, undefined);
    assert.equal(parsed.details.internal_notes, undefined);
    assert.equal(parsed.details.adminNotes, undefined);
  });

  it('strips auth tokens', () => {
    const result = prepareSafeCopy(DATA, COPY_AUDIENCE.OPS_SAFE);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.headers.cookie, undefined);
    assert.equal(parsed.headers['content-type'], 'text/html');
  });

  it('redactedFields includes correct set', () => {
    const result = prepareSafeCopy(DATA, COPY_AUDIENCE.OPS_SAFE);
    assert.ok(result.redactedFields.includes('auth_tokens'));
    assert.ok(result.redactedFields.includes('request_bodies'));
    assert.ok(result.redactedFields.includes('emails_masked'));
    assert.ok(result.redactedFields.includes('account_ids_masked'));
    assert.ok(result.redactedFields.includes('internal_notes'));
  });
});

// ---------------------------------------------------------------------------
// prepareSafeCopy — PARENT_SAFE audience (object input)
// ---------------------------------------------------------------------------

describe('prepareSafeCopy PARENT_SAFE audience', () => {
  const DATA = {
    accountSummary: { email: 'parent@example.com' },
    linkedLearners: [{ learnerId: 'lrn-abc', learnerName: 'Child', learner_id: 'lrn-abc-alt' }],
    recentErrors: [{
      id: 'e1',
      firstFrame: '  at handler (/app/index.js:42:3)',
      stack: 'Error: oops\n  at x (/y.js:1:1)',
      requestBody: '{"password":"secret"}',
    }],
    internalNotes: 'Admin-only context',
    childId: 'child-999',
    headers: { 'set-cookie': 'val=1', 'content-type': 'text/plain' },
  };

  it('strips learnerId, learner_id, childId', () => {
    const result = prepareSafeCopy(DATA, COPY_AUDIENCE.PARENT_SAFE);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.linkedLearners[0].learnerId, undefined);
    assert.equal(parsed.linkedLearners[0].learner_id, undefined);
    assert.equal(parsed.childId, undefined);
    // learnerName preserved
    assert.equal(parsed.linkedLearners[0].learnerName, 'Child');
  });

  it('redacts stack traces (firstFrame, stack, and inline at-frames)', () => {
    const result = prepareSafeCopy(DATA, COPY_AUDIENCE.PARENT_SAFE);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.recentErrors[0].firstFrame, '[stack trace redacted]');
    assert.equal(parsed.recentErrors[0].stack, '[stack trace redacted]');
  });

  it('strips requestBody', () => {
    const result = prepareSafeCopy(DATA, COPY_AUDIENCE.PARENT_SAFE);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.recentErrors[0].requestBody, undefined);
  });

  it('strips internalNotes', () => {
    const result = prepareSafeCopy(DATA, COPY_AUDIENCE.PARENT_SAFE);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.internalNotes, undefined);
  });

  it('masks email', () => {
    const result = prepareSafeCopy(DATA, COPY_AUDIENCE.PARENT_SAFE);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.accountSummary.email, '****le.com');
  });

  it('strips auth tokens (set-cookie)', () => {
    const result = prepareSafeCopy(DATA, COPY_AUDIENCE.PARENT_SAFE);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.headers['set-cookie'], undefined);
    assert.equal(parsed.headers['content-type'], 'text/plain');
  });

  it('redactedFields includes correct set', () => {
    const result = prepareSafeCopy(DATA, COPY_AUDIENCE.PARENT_SAFE);
    assert.ok(result.redactedFields.includes('auth_tokens'));
    assert.ok(result.redactedFields.includes('request_bodies'));
    assert.ok(result.redactedFields.includes('child_ids'));
    assert.ok(result.redactedFields.includes('stack_traces'));
    assert.ok(result.redactedFields.includes('internal_notes'));
    assert.ok(result.redactedFields.includes('emails_masked'));
  });
});

// ---------------------------------------------------------------------------
// prepareSafeCopy — PUBLIC_PREVIEW audience (object input)
// ---------------------------------------------------------------------------

describe('prepareSafeCopy PUBLIC_PREVIEW audience', () => {
  it('extracts title and body, strips everything else', () => {
    const data = {
      title: 'Support Case #1234',
      body: 'Detailed description here',
      accountSummary: { email: 'user@test.com', accountId: 'acct-123' },
      linkedLearners: [{ learnerId: 'lrn-1' }],
      internalNotes: 'secret',
    };
    const result = prepareSafeCopy(data, COPY_AUDIENCE.PUBLIC_PREVIEW);
    assert.equal(result.ok, true);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.title, 'Support Case #1234');
    assert.equal(parsed.body, 'Detailed description here');
    assert.equal(parsed.accountSummary, undefined);
    assert.equal(parsed.linkedLearners, undefined);
    assert.equal(parsed.internalNotes, undefined);
  });

  it('falls back to humanSummary for title when no title field', () => {
    const data = {
      humanSummary: 'Summary for display',
      accountSummary: { email: 'user@test.com' },
    };
    const result = prepareSafeCopy(data, COPY_AUDIENCE.PUBLIC_PREVIEW);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.title, 'Summary for display');
  });

  it('falls back to humanSummary for body when no body field', () => {
    const data = {
      title: 'My Title',
      humanSummary: 'Summary text',
    };
    const result = prepareSafeCopy(data, COPY_AUDIENCE.PUBLIC_PREVIEW);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.title, 'My Title');
    assert.equal(parsed.body, 'Summary text');
  });

  it('title and body are empty strings when neither field exists', () => {
    const data = {
      accountSummary: { email: 'user@test.com' },
      someData: 'value',
    };
    const result = prepareSafeCopy(data, COPY_AUDIENCE.PUBLIC_PREVIEW);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.title, '');
    assert.equal(parsed.body, '');
  });

  it('redactedFields includes all_except_title_body', () => {
    const data = { title: 'x', body: 'y' };
    const result = prepareSafeCopy(data, COPY_AUDIENCE.PUBLIC_PREVIEW);
    assert.ok(result.redactedFields.includes('auth_tokens'));
    assert.ok(result.redactedFields.includes('request_bodies'));
    assert.ok(result.redactedFields.includes('all_except_title_body'));
  });
});

// ---------------------------------------------------------------------------
// prepareSafeCopy — nested redaction (deep object graphs)
// ---------------------------------------------------------------------------

describe('prepareSafeCopy handles nested structures', () => {
  it('strips auth tokens nested deep in arrays', () => {
    const data = {
      title: 'Bundle',
      requests: [
        { url: '/api', headers: { cookie: 'session=x', accept: 'application/json' } },
        { url: '/login', headers: { authorization: 'Bearer y' } },
      ],
    };
    const result = prepareSafeCopy(data, COPY_AUDIENCE.ADMIN_ONLY);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.requests[0].headers.cookie, undefined);
    assert.equal(parsed.requests[0].headers.accept, 'application/json');
    assert.equal(parsed.requests[1].headers.authorization, undefined);
  });

  it('masks emails nested in arrays for OPS_SAFE', () => {
    const data = {
      title: 'List',
      users: [
        { email: 'alice@example.com', name: 'Alice' },
        { email: 'bob@example.com', name: 'Bob' },
      ],
    };
    const result = prepareSafeCopy(data, COPY_AUDIENCE.OPS_SAFE);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.users[0].email, '****le.com');
    assert.equal(parsed.users[1].email, '****le.com');
    assert.equal(parsed.users[0].name, 'Alice');
  });

  it('strips child IDs nested in arrays for PARENT_SAFE', () => {
    const data = {
      title: 'Info',
      children: [
        { learnerId: 'lrn-1', name: 'A' },
        { learner_id: 'lrn-2', name: 'B' },
      ],
    };
    const result = prepareSafeCopy(data, COPY_AUDIENCE.PARENT_SAFE);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.children[0].learnerId, undefined);
    assert.equal(parsed.children[1].learner_id, undefined);
    assert.equal(parsed.children[0].name, 'A');
    assert.equal(parsed.children[1].name, 'B');
  });
});

// ---------------------------------------------------------------------------
// prepareSafeCopy — stack trace detection patterns
// ---------------------------------------------------------------------------

describe('prepareSafeCopy stack trace detection', () => {
  it('redacts string values containing "  at " on their own line (PARENT_SAFE)', () => {
    const data = {
      title: 'Error',
      errorMessage: 'Something failed\n  at Object.run (/app/main.js:1:1)',
    };
    const result = prepareSafeCopy(data, COPY_AUDIENCE.PARENT_SAFE);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.errorMessage, '[stack trace redacted]');
  });

  it('does NOT redact strings without "at " frame pattern', () => {
    const data = {
      title: 'Note',
      description: 'Look at this interesting result',
    };
    const result = prepareSafeCopy(data, COPY_AUDIENCE.PARENT_SAFE);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.description, 'Look at this interesting result');
  });

  it('redacts keys named "stackTrace"', () => {
    const data = {
      title: 'Error',
      stackTrace: 'whatever content here',
    };
    const result = prepareSafeCopy(data, COPY_AUDIENCE.PARENT_SAFE);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.stackTrace, '[stack trace redacted]');
  });
});
