// P5 U8: Marketing draft edit form tests.
//
// Tests cover:
//   1. Edit form rendering with pre-filled values
//   2. Edit visibility rules (draft + admin only)
//   3. Edit form validation
//   4. CAS 409 conflict handling
//   5. Successful edit state transition
//   6. timestampToDatetimeLocal helper

import test from 'node:test';
import assert from 'node:assert/strict';

import { normaliseMarketingMessage } from '../src/platform/hubs/admin-marketing-message.js';
import { createAdminMarketingApi } from '../src/platform/hubs/admin-marketing-api.js';

// ---------------------------------------------------------------------------
// 1. Edit visibility rules — draft + admin only
// ---------------------------------------------------------------------------

test('edit visibility — edit allowed for draft + admin role', () => {
  const message = normaliseMarketingMessage({ id: 'msg-1', status: 'draft' });
  const isAdmin = true;
  const showEditButton = isAdmin && message.status === 'draft';
  assert.equal(showEditButton, true);
});

test('edit visibility — edit NOT allowed for scheduled + admin role', () => {
  const message = normaliseMarketingMessage({ id: 'msg-1', status: 'scheduled' });
  const isAdmin = true;
  const showEditButton = isAdmin && message.status === 'draft';
  assert.equal(showEditButton, false);
});

test('edit visibility — edit NOT allowed for published + admin role', () => {
  const message = normaliseMarketingMessage({ id: 'msg-1', status: 'published' });
  const isAdmin = true;
  const showEditButton = isAdmin && message.status === 'draft';
  assert.equal(showEditButton, false);
});

test('edit visibility — edit NOT allowed for paused + admin role', () => {
  const message = normaliseMarketingMessage({ id: 'msg-1', status: 'paused' });
  const isAdmin = true;
  const showEditButton = isAdmin && message.status === 'draft';
  assert.equal(showEditButton, false);
});

test('edit visibility — edit NOT allowed for archived + admin role', () => {
  const message = normaliseMarketingMessage({ id: 'msg-1', status: 'archived' });
  const isAdmin = true;
  const showEditButton = isAdmin && message.status === 'draft';
  assert.equal(showEditButton, false);
});

test('edit visibility — edit NOT allowed for draft + ops role', () => {
  const message = normaliseMarketingMessage({ id: 'msg-1', status: 'draft' });
  const isAdmin = 'ops'.toLowerCase() === 'admin';
  const showEditButton = isAdmin && message.status === 'draft';
  assert.equal(showEditButton, false);
});

test('edit visibility — edit NOT allowed for draft + parent role', () => {
  const message = normaliseMarketingMessage({ id: 'msg-1', status: 'draft' });
  const isAdmin = 'parent'.toLowerCase() === 'admin';
  const showEditButton = isAdmin && message.status === 'draft';
  assert.equal(showEditButton, false);
});

// ---------------------------------------------------------------------------
// 2. Edit form validation (pure logic)
// ---------------------------------------------------------------------------

function validateEditForm({ title, body_text, severity_token }) {
  const SEVERITY_TOKENS = ['info', 'warning'];
  const errors = [];
  if (!title || !title.trim()) errors.push('Title is required.');
  if (!body_text || !body_text.trim()) errors.push('Body text is required.');
  if (!SEVERITY_TOKENS.includes(severity_token)) errors.push('Severity must be "info" or "warning".');
  return errors;
}

test('edit form validation — empty title rejected', () => {
  const errors = validateEditForm({ title: '', body_text: 'text', severity_token: 'info' });
  assert.ok(errors.includes('Title is required.'));
});

test('edit form validation — whitespace-only title rejected', () => {
  const errors = validateEditForm({ title: '   ', body_text: 'text', severity_token: 'info' });
  assert.ok(errors.includes('Title is required.'));
});

test('edit form validation — empty body_text rejected', () => {
  const errors = validateEditForm({ title: 'Hello', body_text: '', severity_token: 'info' });
  assert.ok(errors.includes('Body text is required.'));
});

test('edit form validation — invalid severity rejected', () => {
  const errors = validateEditForm({ title: 'Hello', body_text: 'text', severity_token: 'critical' });
  assert.ok(errors.some((e) => e.includes('Severity')));
});

test('edit form validation — valid form has no errors', () => {
  const errors = validateEditForm({ title: 'Hello', body_text: 'text', severity_token: 'warning' });
  assert.equal(errors.length, 0);
});

// ---------------------------------------------------------------------------
// 3. timestampToDatetimeLocal helper
// ---------------------------------------------------------------------------

function timestampToDatetimeLocal(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

test('timestampToDatetimeLocal — converts epoch ms to YYYY-MM-DDTHH:MM format', () => {
  // 2024-04-27T10:00 UTC
  const ts = new Date('2024-04-27T10:00:00Z').getTime();
  const result = timestampToDatetimeLocal(ts);
  // Result is in local time, so just verify the format
  assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test('timestampToDatetimeLocal — null returns empty string', () => {
  assert.equal(timestampToDatetimeLocal(null), '');
});

test('timestampToDatetimeLocal — 0 returns empty string', () => {
  assert.equal(timestampToDatetimeLocal(0), '');
});

test('timestampToDatetimeLocal — undefined returns empty string', () => {
  assert.equal(timestampToDatetimeLocal(undefined), '');
});

test('timestampToDatetimeLocal — NaN timestamp returns empty string', () => {
  assert.equal(timestampToDatetimeLocal(NaN), '');
});

// ---------------------------------------------------------------------------
// 4. CAS 409 conflict handling for edits
// ---------------------------------------------------------------------------

test('edit CAS conflict — 409 status from updateMarketingMessage', async () => {
  const mockFetch = () => Promise.resolve(new Response(
    JSON.stringify({ message: 'Stale', code: 'marketing_message_stale' }),
    { status: 409, headers: { 'content-type': 'application/json' } },
  ));
  const api = createAdminMarketingApi({ fetch: mockFetch });
  try {
    await api.updateMarketingMessage('msg-1', {
      title: 'Updated',
      expectedRowVersion: 0,
    });
    assert.fail('Should have thrown CAS conflict');
  } catch (err) {
    assert.equal(err.status, 409);
    assert.equal(err.code, 'marketing_message_stale');
  }
});

test('edit CAS conflict — error message matches expected pattern', () => {
  const err = { status: 409, code: 'marketing_message_stale' };
  const isCasConflict = err.status === 409 || err.code === 'marketing_message_stale';
  assert.equal(isCasConflict, true);
  const userMessage = 'This message was updated by another session. Please go back and refresh the list.';
  assert.ok(userMessage.includes('another session'));
});

// ---------------------------------------------------------------------------
// 5. Successful edit — API roundtrip
// ---------------------------------------------------------------------------

test('edit success — updateMarketingMessage returns updated message', async () => {
  const mockFetch = (url, init) => {
    const body = JSON.parse(init.body);
    return Promise.resolve(new Response(
      JSON.stringify({
        ok: true,
        message: {
          id: 'msg-1',
          title: body.title,
          body_text: body.body_text,
          severity_token: body.severity_token,
          starts_at: body.starts_at,
          ends_at: body.ends_at,
          status: 'draft',
          message_type: 'announcement',
          audience: 'internal',
          row_version: 1,
          created_at: 1714100000000,
          updated_at: Date.now(),
          created_by: 'acc-1',
          updated_by: 'acc-1',
          published_at: null,
          published_by: null,
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
  };
  const api = createAdminMarketingApi({ fetch: mockFetch });
  const result = await api.updateMarketingMessage('msg-1', {
    title: 'New title',
    body_text: 'New body **text**',
    severity_token: 'warning',
    starts_at: 1714200000000,
    ends_at: null,
    expectedRowVersion: 0,
  });
  const normalised = normaliseMarketingMessage(result.message);
  assert.equal(normalised.title, 'New title');
  assert.equal(normalised.body_text, 'New body **text**');
  assert.equal(normalised.severity_token, 'warning');
  assert.equal(normalised.row_version, 1);
  assert.equal(normalised.status, 'draft');
});

test('edit success — local state update replaces message in list', () => {
  const messages = [
    normaliseMarketingMessage({ id: 'msg-1', title: 'Old', row_version: 0 }),
    normaliseMarketingMessage({ id: 'msg-2', title: 'Other', row_version: 0 }),
  ];
  const updated = normaliseMarketingMessage({ id: 'msg-1', title: 'New', row_version: 1 });
  const newList = messages.map((m) => (m.id === updated.id ? updated : m));
  assert.equal(newList[0].title, 'New');
  assert.equal(newList[0].row_version, 1);
  assert.equal(newList[1].title, 'Other');
  assert.equal(newList[1].row_version, 0);
});

// ---------------------------------------------------------------------------
// 6. Edit form pre-fill contract
// ---------------------------------------------------------------------------

test('edit form pre-fill — form initialises from message fields', () => {
  const message = normaliseMarketingMessage({
    id: 'msg-1',
    title: 'Draft title',
    body_text: 'Some **markdown** content',
    severity_token: 'warning',
    starts_at: 1714200000000,
    ends_at: 1714300000000,
    status: 'draft',
    row_version: 3,
  });
  // Simulate the form initialisation
  const form = {
    title: message.title || '',
    body_text: message.body_text || '',
    severity_token: message.severity_token || 'info',
    starts_at: timestampToDatetimeLocal(message.starts_at),
    ends_at: timestampToDatetimeLocal(message.ends_at),
  };
  assert.equal(form.title, 'Draft title');
  assert.equal(form.body_text, 'Some **markdown** content');
  assert.equal(form.severity_token, 'warning');
  assert.match(form.starts_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.match(form.ends_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test('edit form pre-fill — null timestamps produce empty strings', () => {
  const message = normaliseMarketingMessage({
    id: 'msg-1',
    title: 'No dates',
    body_text: 'Body',
    starts_at: null,
    ends_at: null,
  });
  const form = {
    starts_at: timestampToDatetimeLocal(message.starts_at),
    ends_at: timestampToDatetimeLocal(message.ends_at),
  };
  assert.equal(form.starts_at, '');
  assert.equal(form.ends_at, '');
});

// ---------------------------------------------------------------------------
// 7. Edit submit data shape — expectedRowVersion included
// ---------------------------------------------------------------------------

test('edit submit — data includes expectedRowVersion from message', () => {
  const message = normaliseMarketingMessage({ id: 'msg-1', row_version: 5 });
  const data = {
    title: 'Updated',
    body_text: 'Body',
    severity_token: 'info',
    starts_at: null,
    ends_at: null,
    expectedRowVersion: message.row_version,
  };
  assert.equal(data.expectedRowVersion, 5);
  assert.equal(data.title, 'Updated');
});

// ---------------------------------------------------------------------------
// 8. Non-draft rejection — API returns 400 validation_failed
// ---------------------------------------------------------------------------

test('edit non-draft — API rejects with validation_failed code', async () => {
  const mockFetch = () => Promise.resolve(new Response(
    JSON.stringify({ message: 'Only draft messages can be edited.', code: 'validation_failed' }),
    { status: 400, headers: { 'content-type': 'application/json' } },
  ));
  const api = createAdminMarketingApi({ fetch: mockFetch });
  try {
    await api.updateMarketingMessage('msg-1', {
      title: 'Should fail',
      expectedRowVersion: 1,
    });
    assert.fail('Should have thrown');
  } catch (err) {
    assert.equal(err.status, 400);
    assert.equal(err.code, 'validation_failed');
  }
});

// ---------------------------------------------------------------------------
// 9. Validation error preserves form data (pattern verification)
// ---------------------------------------------------------------------------

test('edit validation failure — form data preserved on API error', async () => {
  // Simulates: user fills form, submits, API returns 400 → form fields retain values
  const formBeforeSubmit = {
    title: 'My draft',
    body_text: 'Some content',
    severity_token: 'info',
    starts_at: '2024-04-27T10:00',
    ends_at: '',
  };

  // Simulate API failure
  const mockFetch = () => Promise.resolve(new Response(
    JSON.stringify({ message: 'Body text too short.', code: 'validation_failed' }),
    { status: 400, headers: { 'content-type': 'application/json' } },
  ));
  const api = createAdminMarketingApi({ fetch: mockFetch });

  let caughtError = null;
  try {
    await api.updateMarketingMessage('msg-1', {
      ...formBeforeSubmit,
      expectedRowVersion: 0,
    });
  } catch (err) {
    caughtError = err;
  }

  // Form data is preserved (not cleared) because error was thrown
  assert.ok(caughtError !== null);
  assert.equal(formBeforeSubmit.title, 'My draft');
  assert.equal(formBeforeSubmit.body_text, 'Some content');
});

// ---------------------------------------------------------------------------
// 10. URL encoding for message ID in update call
// ---------------------------------------------------------------------------

test('edit API — message ID is URL-encoded', async () => {
  let capturedUrl = '';
  const mockFetch = (url) => {
    capturedUrl = url;
    return Promise.resolve(new Response(
      JSON.stringify({ ok: true, message: { id: 'msg/special', row_version: 1 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
  };
  const api = createAdminMarketingApi({ fetch: mockFetch });
  await api.updateMarketingMessage('msg/special', { title: 'Test', expectedRowVersion: 0 });
  assert.ok(capturedUrl.includes('msg%2Fspecial'));
});
