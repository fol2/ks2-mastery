// Phase E / U16 coverage: `/api/ops/error-event` accepts an optional
// `release` field validated by `/^[a-f0-9]{6,40}$/`. On fresh insert,
// `first_seen_release` and `last_seen_release` both stamp with the
// incoming value. On dedup, only `last_seen_release` updates —
// `first_seen_release` is forensic history of when the fingerprint
// was first observed.
//
// Validation regressions (per Phase B adversarial review):
//   - Lowercase spelling words like `principal` are rejected because
//     they contain `n`/`p` which are not hex digits.
//   - Uppercase (`PRINCIPAL`) is rejected because the regex has no `/i`
//     flag.
//   - Oversized (>40 chars) is rejected — no silent truncation.
//   - `null` / missing release is tolerated and stored as NULL so
//     U17's auto-reopen rule short-circuits the condition-3 check.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U16

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function selectEvent(server) {
  return server.DB.db.prepare(`
    SELECT first_seen_release, last_seen_release, resolved_in_release
    FROM ops_error_events
    ORDER BY first_seen ASC, id ASC
    LIMIT 1
  `).get();
}

async function postEvent(server, body) {
  return server.fetchRaw('https://repo.test/api/ops/error-event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('U16 release — fresh insert stamps first_seen_release and last_seen_release with the SHA', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await postEvent(server, {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstFrame: 'at foo (bar.js:1)',
      release: 'abc1234',
    });
    assert.equal(response.status, 200);
    const row = selectEvent(server);
    assert.equal(row.first_seen_release, 'abc1234');
    assert.equal(row.last_seen_release, 'abc1234');
    assert.equal(row.resolved_in_release, null);
  } finally {
    server.close();
  }
});

test('U16 release — dedup event updates last_seen_release only; first_seen_release preserved', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const body = {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstFrame: 'at foo (bar.js:1)',
    };
    await postEvent(server, { ...body, release: 'abc1234' });
    const secondResponse = await postEvent(server, { ...body, release: 'def5678' });
    assert.equal(secondResponse.status, 200);
    const payload = await secondResponse.json();
    assert.equal(payload.deduped, true);
    const row = selectEvent(server);
    // first_seen_release preserved from the first POST
    assert.equal(row.first_seen_release, 'abc1234');
    // last_seen_release overwrites
    assert.equal(row.last_seen_release, 'def5678');
  } finally {
    server.close();
  }
});

test('U16 release — null / missing release stored as NULL', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await postEvent(server, {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstFrame: 'at foo (bar.js:1)',
      // release intentionally omitted
    });
    assert.equal(response.status, 200);
    const row = selectEvent(server);
    assert.equal(row.first_seen_release, null);
    assert.equal(row.last_seen_release, null);
  } finally {
    server.close();
  }
});

test('U16 release — explicit release: null stored as NULL', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await postEvent(server, {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstFrame: 'at foo (bar.js:1)',
      release: null,
    });
    assert.equal(response.status, 200);
    const row = selectEvent(server);
    assert.equal(row.first_seen_release, null);
  } finally {
    server.close();
  }
});

test('U16 release — lowercase spelling word "principal" rejected with 400 validation_failed', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await postEvent(server, {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstFrame: 'at foo (bar.js:1)',
      release: 'principal',
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_failed');
    assert.equal(payload.field, 'release');
  } finally {
    server.close();
  }
});

test('U16 release — uppercase PRINCIPAL rejected (no /i flag)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await postEvent(server, {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstFrame: 'at foo (bar.js:1)',
      release: 'PRINCIPAL',
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_failed');
    assert.equal(payload.field, 'release');
  } finally {
    server.close();
  }
});

test('U16 release — uppercase ABCDEF (all hex but uppercase) rejected', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await postEvent(server, {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstFrame: 'at foo (bar.js:1)',
      release: 'ABCDEF',
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_failed');
  } finally {
    server.close();
  }
});

test('U16 release — oversized release rejected with 400 validation_failed', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Build a 45-char all-hex string: exceeds the 40-char cap.
    const oversized = 'a'.repeat(45);
    const response = await postEvent(server, {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstFrame: 'at foo (bar.js:1)',
      release: oversized,
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_failed');
  } finally {
    server.close();
  }
});

test('U16 release — too-short release (5 chars) rejected', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await postEvent(server, {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstFrame: 'at foo (bar.js:1)',
      release: 'abc12',
    });
    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});

test('U16 release — dot / dash separators rejected', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await postEvent(server, {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstFrame: 'at foo (bar.js:1)',
      release: '2026.04.25',
    });
    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});

test('U16 release — non-string release (number) rejected', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await postEvent(server, {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstFrame: 'at foo (bar.js:1)',
      release: 12345,
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_failed');
    assert.equal(payload.field, 'release');
  } finally {
    server.close();
  }
});

test('U16 release — minimum 6-char SHA accepted and stamped', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await postEvent(server, {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstFrame: 'at foo (bar.js:1)',
      release: 'abcdef',
    });
    assert.equal(response.status, 200);
    const row = selectEvent(server);
    assert.equal(row.first_seen_release, 'abcdef');
  } finally {
    server.close();
  }
});

test('U16 release — maximum 40-char SHA accepted and stamped', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const fullSha = 'a'.repeat(40);
    const response = await postEvent(server, {
      errorKind: 'TypeError',
      messageFirstLine: 'x is undefined',
      firstFrame: 'at foo (bar.js:1)',
      release: fullSha,
    });
    assert.equal(response.status, 200);
    const row = selectEvent(server);
    assert.equal(row.first_seen_release, fullSha);
  } finally {
    server.close();
  }
});
