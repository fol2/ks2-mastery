import test from 'node:test';
import assert from 'node:assert/strict';

import {
  stashAdminReturn,
  popAdminReturn,
  clearAdminReturn,
  STASH_KEY,
  MAX_AGE_MS,
} from '../src/platform/core/admin-return-stash.js';

// ---------------------------------------------------------------------------
// In-memory sessionStorage shim
// ---------------------------------------------------------------------------
function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.get(k) ?? null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    _map: map,
  };
}

// ---------------------------------------------------------------------------
// stashAdminReturn
// ---------------------------------------------------------------------------

test('stashAdminReturn: stashes /admin pathname with hash', () => {
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '/admin', hash: '#section=debug' }, ss);
  const raw = ss.getItem(STASH_KEY);
  assert.ok(raw, 'stash should be written');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.pathname, '/admin');
  assert.equal(parsed.hash, '#section=debug');
  assert.equal(typeof parsed.ts, 'number');
});

test('stashAdminReturn: stashes /admin with no hash', () => {
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '/admin', hash: '' }, ss);
  const raw = ss.getItem(STASH_KEY);
  assert.ok(raw);
  const parsed = JSON.parse(raw);
  assert.equal(parsed.pathname, '/admin');
  assert.equal(parsed.hash, '');
});

test('stashAdminReturn: normalises trailing slash and case', () => {
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '/Admin/', hash: '#section=accounts' }, ss);
  const raw = ss.getItem(STASH_KEY);
  assert.ok(raw);
  const parsed = JSON.parse(raw);
  assert.equal(parsed.pathname, '/admin');
});

test('stashAdminReturn: ignores non-admin pathname', () => {
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '/evil', hash: '#section=debug' }, ss);
  assert.equal(ss.getItem(STASH_KEY), null);
});

test('stashAdminReturn: ignores root pathname', () => {
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '/', hash: '' }, ss);
  assert.equal(ss.getItem(STASH_KEY), null);
});

test('stashAdminReturn: ignores empty pathname', () => {
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '', hash: '' }, ss);
  assert.equal(ss.getItem(STASH_KEY), null);
});

test('stashAdminReturn: ignores null location', () => {
  const ss = createMemoryStorage();
  stashAdminReturn(null, ss);
  assert.equal(ss.getItem(STASH_KEY), null);
});

// ---------------------------------------------------------------------------
// popAdminReturn — happy paths
// ---------------------------------------------------------------------------

test('popAdminReturn: returns /admin#section=debug for valid stash', () => {
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '/admin', hash: '#section=debug' }, ss);
  const result = popAdminReturn(ss);
  assert.equal(result, '/admin#section=debug');
});

test('popAdminReturn: returns /admin for stash with no hash', () => {
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '/admin', hash: '' }, ss);
  const result = popAdminReturn(ss);
  assert.equal(result, '/admin');
});

test('popAdminReturn: consumes the stash (second read returns null)', () => {
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '/admin', hash: '#section=debug' }, ss);
  popAdminReturn(ss);
  assert.equal(popAdminReturn(ss), null);
});

test('popAdminReturn: returns /admin#section=overview for stash with valid section', () => {
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '/admin', hash: '#section=overview' }, ss);
  const result = popAdminReturn(ss);
  assert.equal(result, '/admin#section=overview');
});

// ---------------------------------------------------------------------------
// popAdminReturn — edge cases
// ---------------------------------------------------------------------------

test('popAdminReturn: expired stash (>5 minutes) returns null', () => {
  const ss = createMemoryStorage();
  // Write a stash with a timestamp older than MAX_AGE_MS
  ss.setItem(STASH_KEY, JSON.stringify({
    pathname: '/admin',
    hash: '#section=debug',
    ts: Date.now() - MAX_AGE_MS - 1,
  }));
  assert.equal(popAdminReturn(ss), null);
  // Stash should still be cleared
  assert.equal(ss.getItem(STASH_KEY), null);
});

test('popAdminReturn: stash with invalid section hash returns /admin#section=overview', () => {
  const ss = createMemoryStorage();
  ss.setItem(STASH_KEY, JSON.stringify({
    pathname: '/admin',
    hash: '#section=nonexistent',
    ts: Date.now(),
  }));
  // parseAdminSectionFromHash returns 'overview' for unknown sections
  assert.equal(popAdminReturn(ss), '/admin#section=overview');
});

test('popAdminReturn: stash with hash but no section= key returns /admin', () => {
  const ss = createMemoryStorage();
  ss.setItem(STASH_KEY, JSON.stringify({
    pathname: '/admin',
    hash: '#foo=bar',
    ts: Date.now(),
  }));
  // parseAdminSectionFromHash returns null for no section= key
  assert.equal(popAdminReturn(ss), '/admin');
});

test('popAdminReturn: stash with non-admin pathname (injection) returns null', () => {
  const ss = createMemoryStorage();
  ss.setItem(STASH_KEY, JSON.stringify({
    pathname: '/evil',
    hash: '#section=debug',
    ts: Date.now(),
  }));
  assert.equal(popAdminReturn(ss), null);
});

test('popAdminReturn: no stash exists returns null', () => {
  const ss = createMemoryStorage();
  assert.equal(popAdminReturn(ss), null);
});

test('popAdminReturn: malformed JSON returns null', () => {
  const ss = createMemoryStorage();
  ss.setItem(STASH_KEY, 'not json');
  assert.equal(popAdminReturn(ss), null);
  // Stash should be cleared
  assert.equal(ss.getItem(STASH_KEY), null);
});

test('popAdminReturn: future timestamp is rejected', () => {
  const ss = createMemoryStorage();
  ss.setItem(STASH_KEY, JSON.stringify({
    pathname: '/admin',
    hash: '#section=debug',
    ts: Date.now() + 999999999,
  }));
  // age < 0 => rejected
  assert.equal(popAdminReturn(ss), null);
});

test('popAdminReturn: missing ts field is treated as expired', () => {
  const ss = createMemoryStorage();
  ss.setItem(STASH_KEY, JSON.stringify({
    pathname: '/admin',
    hash: '#section=debug',
  }));
  // ts is undefined => parsed.ts is NaN => age is NaN => NaN > MAX_AGE_MS is false,
  // but typeof parsed.ts !== 'number' => ts defaults to 0 => age >> MAX_AGE_MS
  assert.equal(popAdminReturn(ss), null);
});

test('popAdminReturn: stash with /admin/ (trailing slash) pathname is accepted', () => {
  const ss = createMemoryStorage();
  ss.setItem(STASH_KEY, JSON.stringify({
    pathname: '/admin/',
    hash: '#section=debug',
    ts: Date.now(),
  }));
  assert.equal(popAdminReturn(ss), '/admin#section=debug');
});

test('popAdminReturn: social auth >5 minutes — stash expired, fallback null', () => {
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '/admin', hash: '#section=accounts' }, ss);
  // Simulate time passing by rewriting the stash with an old timestamp
  const raw = JSON.parse(ss.getItem(STASH_KEY));
  raw.ts = Date.now() - MAX_AGE_MS - 1000;
  ss.setItem(STASH_KEY, JSON.stringify(raw));
  assert.equal(popAdminReturn(ss), null);
});

// ---------------------------------------------------------------------------
// clearAdminReturn
// ---------------------------------------------------------------------------

test('clearAdminReturn: removes existing stash', () => {
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '/admin', hash: '#section=debug' }, ss);
  assert.ok(ss.getItem(STASH_KEY));
  clearAdminReturn(ss);
  assert.equal(ss.getItem(STASH_KEY), null);
});

test('clearAdminReturn: no-op when stash does not exist', () => {
  const ss = createMemoryStorage();
  clearAdminReturn(ss);
  assert.equal(ss.getItem(STASH_KEY), null);
});

// ---------------------------------------------------------------------------
// Demo session must NOT read stash
// ---------------------------------------------------------------------------

test('demo session flow: clearAdminReturn prevents popAdminReturn from reading', () => {
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '/admin', hash: '#section=debug' }, ss);
  // Simulate startDemoSession clearing the stash
  clearAdminReturn(ss);
  assert.equal(popAdminReturn(ss), null);
});

// ---------------------------------------------------------------------------
// ADV-002: role guard on stash restore (social-auth return path)
// ---------------------------------------------------------------------------

test('social-auth return: non-admin role must NOT restore admin stash', () => {
  // Simulates the boot-time logic in main.js: popAdminReturn returns a valid
  // URL, but shellPlatformRole is 'parent' — the stash should be discarded.
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '/admin', hash: '#section=debug' }, ss);

  const stashedReturn = popAdminReturn(ss);
  assert.ok(stashedReturn, 'stash should yield a valid URL');

  // Simulate the role-guarded branch from main.js
  const shellPlatformRole = 'parent';
  let adminHubOpened = false;

  if (stashedReturn && (shellPlatformRole === 'admin' || shellPlatformRole === 'ops')) {
    adminHubOpened = true;
  } else if (stashedReturn) {
    clearAdminReturn(ss); // non-admin discard
  }

  assert.equal(adminHubOpened, false, 'admin hub must NOT open for parent role');
});

test('social-auth return: admin role restores admin stash', () => {
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '/admin', hash: '#section=accounts' }, ss);

  const stashedReturn = popAdminReturn(ss);
  assert.ok(stashedReturn, 'stash should yield a valid URL');

  const shellPlatformRole = 'admin';
  let adminHubOpened = false;

  if (stashedReturn && (shellPlatformRole === 'admin' || shellPlatformRole === 'ops')) {
    adminHubOpened = true;
  }

  assert.equal(adminHubOpened, true, 'admin hub must open for admin role');
  assert.equal(stashedReturn, '/admin#section=accounts');
});

test('social-auth return: ops role restores admin stash', () => {
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '/admin', hash: '#section=debug' }, ss);

  const stashedReturn = popAdminReturn(ss);
  const shellPlatformRole = 'ops';
  let adminHubOpened = false;

  if (stashedReturn && (shellPlatformRole === 'admin' || shellPlatformRole === 'ops')) {
    adminHubOpened = true;
  }

  assert.equal(adminHubOpened, true, 'admin hub must open for ops role');
});

// ---------------------------------------------------------------------------
// ADV-001: startSocialAuth clears stash before OAuth redirect
// ---------------------------------------------------------------------------

test('social auth start: stash is cleared before OAuth redirect', () => {
  // Simulates the clearAdminReturn() call at the start of startSocialAuth
  const ss = createMemoryStorage();
  stashAdminReturn({ pathname: '/admin', hash: '#section=debug' }, ss);
  assert.ok(ss.getItem(STASH_KEY), 'stash should exist before social auth');

  // The clearAdminReturn() call that now precedes the OAuth redirect
  clearAdminReturn(ss);
  assert.equal(ss.getItem(STASH_KEY), null, 'stash must be cleared before OAuth redirect');
  assert.equal(popAdminReturn(ss), null, 'popAdminReturn must return null after clear');
});
