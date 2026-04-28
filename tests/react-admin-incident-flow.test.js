// P5 U6: Admin incident flow stash — unit tests.
//
// Validates the stash logic (save/consume/expiry) and the integration
// surface connections (copy support summary, return navigation).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  saveIncidentStash,
  consumeIncidentStash,
  INCIDENT_STASH_KEY,
  MAX_AGE_MS,
} from '../src/platform/hubs/admin-incident-flow.js';

import {
  prepareSafeCopy,
  COPY_AUDIENCE,
} from '../src/platform/hubs/admin-safe-copy.js';

// ---------------------------------------------------------------------------
// In-memory sessionStorage mock
// ---------------------------------------------------------------------------

function createMockStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.get(key) ?? null; },
    setItem(key, value) { store.set(key, value); },
    removeItem(key) { store.delete(key); },
    get _store() { return store; },
  };
}

// =================================================================
// 1. saveIncidentStash — basic write
// =================================================================

test('saveIncidentStash writes stash to storage', () => {
  const storage = createMockStorage();
  saveIncidentStash({
    returnSection: 'accounts',
    returnAccountId: 'acct-123',
    returnScrollY: 42,
  }, storage);

  const raw = storage.getItem(INCIDENT_STASH_KEY);
  assert.ok(raw, 'stash should be written');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.returnSection, 'accounts');
  assert.equal(parsed.returnAccountId, 'acct-123');
  assert.equal(parsed.returnScrollY, 42);
  assert.equal(typeof parsed.ts, 'number');
});

// =================================================================
// 2. saveIncidentStash — defaults for missing fields
// =================================================================

test('saveIncidentStash defaults missing fields', () => {
  const storage = createMockStorage();
  saveIncidentStash({}, storage);

  const parsed = JSON.parse(storage.getItem(INCIDENT_STASH_KEY));
  assert.equal(parsed.returnSection, 'accounts');
  assert.equal(parsed.returnAccountId, '');
  assert.equal(parsed.returnScrollY, 0);
});

// =================================================================
// 3. saveIncidentStash — rejects null/undefined stash
// =================================================================

test('saveIncidentStash ignores null stash', () => {
  const storage = createMockStorage();
  saveIncidentStash(null, storage);
  assert.equal(storage.getItem(INCIDENT_STASH_KEY), null);
});

test('saveIncidentStash ignores non-object stash', () => {
  const storage = createMockStorage();
  saveIncidentStash('not-an-object', storage);
  assert.equal(storage.getItem(INCIDENT_STASH_KEY), null);
});

// =================================================================
// 4. consumeIncidentStash — happy path (read + clear)
// =================================================================

test('consumeIncidentStash reads and clears the stash', () => {
  const storage = createMockStorage();
  saveIncidentStash({
    returnSection: 'accounts',
    returnAccountId: 'acct-456',
    returnScrollY: 100,
  }, storage);

  const result = consumeIncidentStash(storage);
  assert.deepEqual(result, {
    returnSection: 'accounts',
    returnAccountId: 'acct-456',
    returnScrollY: 100,
  });

  // Consumed — subsequent read returns null
  const second = consumeIncidentStash(storage);
  assert.equal(second, null);
});

// =================================================================
// 5. consumeIncidentStash — expired stash returns null
// =================================================================

test('consumeIncidentStash returns null for expired stash', () => {
  const storage = createMockStorage();
  const expiredPayload = JSON.stringify({
    returnSection: 'accounts',
    returnAccountId: 'acct-old',
    returnScrollY: 0,
    ts: Date.now() - MAX_AGE_MS - 1,
  });
  storage.setItem(INCIDENT_STASH_KEY, expiredPayload);

  const result = consumeIncidentStash(storage);
  assert.equal(result, null, 'expired stash should return null');
  // Stash should be cleared even when expired
  assert.equal(storage.getItem(INCIDENT_STASH_KEY), null);
});

// =================================================================
// 6. consumeIncidentStash — returns null for absent stash
// =================================================================

test('consumeIncidentStash returns null when no stash exists', () => {
  const storage = createMockStorage();
  const result = consumeIncidentStash(storage);
  assert.equal(result, null);
});

// =================================================================
// 7. consumeIncidentStash — returns null for malformed JSON
// =================================================================

test('consumeIncidentStash returns null for malformed JSON', () => {
  const storage = createMockStorage();
  storage.setItem(INCIDENT_STASH_KEY, 'not-json{{{');
  const result = consumeIncidentStash(storage);
  assert.equal(result, null);
  // Should still clear the bad entry
  assert.equal(storage.getItem(INCIDENT_STASH_KEY), null);
});

// =================================================================
// 8. consumeIncidentStash — future timestamp rejected
// =================================================================

test('consumeIncidentStash rejects future timestamps (negative age)', () => {
  const storage = createMockStorage();
  const futurePayload = JSON.stringify({
    returnSection: 'accounts',
    returnAccountId: 'acct-future',
    returnScrollY: 0,
    ts: Date.now() + 100_000_000, // far in the future
  });
  storage.setItem(INCIDENT_STASH_KEY, futurePayload);
  const result = consumeIncidentStash(storage);
  assert.equal(result, null);
});

// =================================================================
// 9. consumeIncidentStash — non-object stored value
// =================================================================

test('consumeIncidentStash returns null for non-object stored value', () => {
  const storage = createMockStorage();
  storage.setItem(INCIDENT_STASH_KEY, JSON.stringify('a string'));
  const result = consumeIncidentStash(storage);
  assert.equal(result, null);
});

// =================================================================
// 10. MAX_AGE_MS is 5 minutes
// =================================================================

test('MAX_AGE_MS equals 5 minutes', () => {
  assert.equal(MAX_AGE_MS, 5 * 60 * 1000);
});

// =================================================================
// 11. Copy support summary uses PARENT_SAFE audience
// =================================================================

test('prepareSafeCopy with PARENT_SAFE strips child IDs and masks emails', () => {
  const data = {
    email: 'parent@example.com',
    learnerId: 'lrn-secret-123',
    role: 'parent',
    learnerCount: 2,
    internalNotes: 'sensitive admin note',
  };
  const result = prepareSafeCopy(data, COPY_AUDIENCE.PARENT_SAFE);
  assert.equal(result.ok, true);
  // Should not contain child ID
  assert.ok(!result.text.includes('lrn-secret-123'), 'child IDs should be stripped');
  // Should not contain internal notes
  assert.ok(!result.text.includes('sensitive admin note'), 'internal notes should be stripped');
  // Email field (key=email) should be masked
  assert.ok(!result.text.includes('parent@example.com'), 'email should be masked');
  assert.ok(result.text.includes('****le.com'), 'masked email should appear');
  assert.ok(result.redactedFields.includes('child_ids'));
  assert.ok(result.redactedFields.includes('internal_notes'));
  assert.ok(result.redactedFields.includes('emails_masked'));
});

// =================================================================
// 12. Save and consume round-trip preserves all fields
// =================================================================

test('save and consume round-trip preserves all fields', () => {
  const storage = createMockStorage();
  const stash = {
    returnSection: 'accounts',
    returnAccountId: 'acct-roundtrip',
    returnScrollY: 777,
  };
  saveIncidentStash(stash, storage);
  const result = consumeIncidentStash(storage);
  assert.deepEqual(result, stash);
});

// =================================================================
// 13. saveIncidentStash — handles storage errors gracefully
// =================================================================

test('saveIncidentStash handles storage setItem errors gracefully', () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem() {},
  };
  // Should not throw
  saveIncidentStash({ returnSection: 'accounts', returnAccountId: 'acct-1', returnScrollY: 0 }, storage);
});

// =================================================================
// 14. consumeIncidentStash — handles storage getItem errors gracefully
// =================================================================

test('consumeIncidentStash handles storage getItem errors gracefully', () => {
  const storage = {
    getItem() { throw new Error('SecurityError'); },
    setItem() {},
    removeItem() {},
  };
  const result = consumeIncidentStash(storage);
  assert.equal(result, null);
});

// =================================================================
// 15. Stash key constant value
// =================================================================

test('INCIDENT_STASH_KEY has expected value', () => {
  assert.equal(INCIDENT_STASH_KEY, 'ks2_admin_incident_stash');
});
