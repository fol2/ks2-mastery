// U7 (sys-hardening p1): contract tests for `/api/security/csp-report`.
//
// Covers the plan scenarios (L640 in the hardening plan):
//   - Happy path: valid `application/csp-report` body => 204 + log.
//   - Happy path: `application/reports+json` (Reporting API v2) parses.
//   - Edge: malformed JSON => 400 without crash.
//   - Edge: Content-Length > 8 KB => 413 without parsing.
//   - Edge: newline in `blocked-uri` is stripped before logging (F-02).
//   - Error: rate limit exhausted => 429 (shared limiter).
//   - Auth: endpoint accepts without a session (browser-originated).
//
// The helper captures `console.log` output so the `[ks2-csp-report]`
// line can be asserted without depending on Workers observability.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function captureLogs(fn) {
  const captured = [];
  const originalLog = console.log;
  console.log = (...args) => { captured.push(args.map(String).join(' ')); };
  return fn()
    .finally(() => { console.log = originalLog; })
    .then((value) => ({ value, captured }));
}

function sampleLegacyReport({
  blockedUri = 'https://evil.example/naughty.js',
  documentUri = 'https://repo.test/',
  violatedDirective = 'script-src',
  sourceFile = 'https://repo.test/src/bundles/app.bundle.js',
} = {}) {
  return {
    'csp-report': {
      'blocked-uri': blockedUri,
      'document-uri': documentUri,
      'violated-directive': violatedDirective,
      'source-file': sourceFile,
      'line-number': 42,
      'status-code': 0,
    },
  };
}

function sampleReportingApiPayload({ blockedURL = 'https://evil.example/naughty.js' } = {}) {
  return [
    {
      age: 0,
      type: 'csp-violation',
      url: 'https://repo.test/',
      body: {
        blockedURL,
        documentURL: 'https://repo.test/',
        effectiveDirective: 'script-src-elem',
        sourceFile: 'https://repo.test/src/bundles/app.bundle.js',
        lineNumber: 7,
        statusCode: 0,
      },
    },
  ];
}

test('POST /api/security/csp-report accepts legacy body and returns 204', async () => {
  const server = createWorkerRepositoryServer();
  const body = JSON.stringify(sampleLegacyReport());
  const { value: response, captured } = await captureLogs(() => server.fetchRaw(
    'https://repo.test/api/security/csp-report',
    {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body,
    },
  ));
  assert.equal(response.status, 204);
  assert.ok(
    captured.some((line) => line.startsWith('[ks2-csp-report] ')),
    `expected a [ks2-csp-report] log line, got: ${JSON.stringify(captured)}`,
  );
  server.close();
});

test('POST /api/security/csp-report accepts Reporting API v2 array body and returns 204', async () => {
  const server = createWorkerRepositoryServer();
  const body = JSON.stringify(sampleReportingApiPayload());
  const { value: response, captured } = await captureLogs(() => server.fetchRaw(
    'https://repo.test/api/security/csp-report',
    {
      method: 'POST',
      headers: { 'content-type': 'application/reports+json' },
      body,
    },
  ));
  assert.equal(response.status, 204);
  assert.ok(captured.some((line) => line.startsWith('[ks2-csp-report] ')));
  server.close();
});

test('POST /api/security/csp-report rejects malformed JSON with 400', async () => {
  const server = createWorkerRepositoryServer();
  const response = await server.fetchRaw(
    'https://repo.test/api/security/csp-report',
    {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: '{not-json',
    },
  );
  assert.equal(response.status, 400);
  server.close();
});

test('POST /api/security/csp-report rejects declared Content-Length above 8 KB with 413', async () => {
  const server = createWorkerRepositoryServer();
  // Supplying a matching oversize body so Content-Length is accurate.
  const oversize = JSON.stringify({
    'csp-report': { 'blocked-uri': 'x'.repeat(16384), 'document-uri': 'y' },
  });
  assert.ok(Buffer.byteLength(oversize, 'utf8') > 8192);
  const response = await server.fetchRaw(
    'https://repo.test/api/security/csp-report',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/csp-report',
        'content-length': String(Buffer.byteLength(oversize, 'utf8')),
      },
      body: oversize,
    },
  );
  assert.equal(response.status, 413);
  server.close();
});

test('POST /api/security/csp-report strips newline + control chars from logged values (F-02 log-line spoof guard)', async () => {
  const server = createWorkerRepositoryServer();
  const spoofBody = JSON.stringify(sampleLegacyReport({
    blockedUri: 'https://evil.example/poison\n[ks2-capacity] ATTACKER_INJECTED',
  }));
  const { value: response, captured } = await captureLogs(() => server.fetchRaw(
    'https://repo.test/api/security/csp-report',
    {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: spoofBody,
    },
  ));
  assert.equal(response.status, 204);
  const logLine = captured.find((line) => line.startsWith('[ks2-csp-report] ')) || '';
  assert.ok(logLine.length > 0, 'expected a CSP log line');
  // The logged line must NOT contain the literal newline — the sanitiser
  // has to turn it into whitespace before JSON encoding.
  assert.ok(
    !logLine.includes('\n[ks2-capacity]'),
    `logged value must not carry an embedded newline — got: ${JSON.stringify(logLine)}`,
  );
  // The spoofed token must still appear (sanitiser does not wipe the
  // text; it just neutralises the log-line boundary), so operators can
  // investigate what the attacker attempted.
  assert.ok(
    logLine.includes('ATTACKER_INJECTED'),
    'sanitiser must preserve the original text so operators can triage; it just neutralises newlines.',
  );
  server.close();
});

test('POST /api/security/csp-report rate-limits per IP (shared limiter)', async () => {
  const server = createWorkerRepositoryServer();
  const body = JSON.stringify(sampleLegacyReport());
  const headers = {
    'content-type': 'application/csp-report',
    'cf-connecting-ip': '203.0.113.9',
  };
  let lastStatus = 0;
  let sawLimit = false;
  // 20 per 10 minutes is the baked-in limit. Fire 25 requests; by 21
  // we must see a 429. We count transitions rather than asserting a
  // specific index in case the limiter rounds boundaries tight.
  for (let i = 0; i < 25; i += 1) {
    const response = await server.fetchRaw(
      'https://repo.test/api/security/csp-report',
      { method: 'POST', headers, body },
    );
    lastStatus = response.status;
    if (response.status === 429) sawLimit = true;
  }
  assert.equal(sawLimit, true, `expected at least one 429; last status was ${lastStatus}`);
  server.close();
});

test('POST /api/security/csp-report accepts requests without a session cookie (unauth by design)', async () => {
  // Verify no authentication challenge on a fresh server with an
  // explicitly cross-site Sec-Fetch-Site header (CSP reports are
  // browser-originated; we must not filter them on origin). The
  // response carries the standard security header set because the
  // single wrap site applies to every Worker response.
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  const response = await server.fetchRaw(
    'https://repo.test/api/security/csp-report',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/csp-report',
        'sec-fetch-site': 'cross-site',
        'sec-fetch-dest': 'report',
      },
      body: JSON.stringify(sampleLegacyReport()),
    },
  );
  assert.equal(response.status, 204, 'CSP report endpoint must not require auth');
  // Sanity check: the wrapper still stamps the security headers.
  assert.ok(response.headers.get('strict-transport-security'));
  assert.ok(response.headers.get('content-security-policy-report-only'));
  server.close();
});

test('POST /api/security/csp-report with empty body returns 400 (no payload to classify)', async () => {
  const server = createWorkerRepositoryServer();
  const response = await server.fetchRaw(
    'https://repo.test/api/security/csp-report',
    {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: '',
    },
  );
  assert.equal(response.status, 400);
  server.close();
});

// ---------------------------------------------------------------------------
// correctness-low-1: size-limited stream reader. A caller who omits or
// understates `Content-Length` must still hit the 8 KB cap via the streamed
// body reader — not by buffering the whole body first.
// ---------------------------------------------------------------------------

test('POST /api/security/csp-report enforces 8 KB cap via streamed body (no Content-Length)', async () => {
  const server = createWorkerRepositoryServer();
  // Build an oversized (~16 KB) streaming body with NO Content-Length so
  // the fast-path guard is skipped and the streamed cap must trip.
  const encoder = new TextEncoder();
  const oversizeText = JSON.stringify({
    'csp-report': { 'blocked-uri': 'x'.repeat(16384), 'document-uri': 'y' },
  });
  const encoded = encoder.encode(oversizeText);
  assert.ok(encoded.byteLength > 8192, 'test precondition: body must exceed 8 KB');
  // Emit the body in 1 KB slices so the reader loop actually iterates.
  const stream = new ReadableStream({
    start(controller) {
      const chunkSize = 1024;
      for (let i = 0; i < encoded.byteLength; i += chunkSize) {
        controller.enqueue(encoded.slice(i, Math.min(i + chunkSize, encoded.byteLength)));
      }
      controller.close();
    },
  });
  const response = await server.fetchRaw(
    'https://repo.test/api/security/csp-report',
    {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: stream,
      // Node's undici requires this flag to send a streaming body.
      duplex: 'half',
    },
  );
  assert.equal(
    response.status,
    413,
    'streamed oversized body without Content-Length must be rejected with 413',
  );
  server.close();
});

test('POST /api/security/csp-report enforces cap even when Content-Length understates the body', async () => {
  const server = createWorkerRepositoryServer();
  // Build a 12 KB body but lie with content-length=100 so the fast-path
  // preflight passes. The stream reader must still cap at 8 KB.
  const encoder = new TextEncoder();
  const oversizeText = JSON.stringify({
    'csp-report': { 'blocked-uri': 'x'.repeat(12288), 'document-uri': 'y' },
  });
  const encoded = encoder.encode(oversizeText);
  const stream = new ReadableStream({
    start(controller) {
      const chunkSize = 1024;
      for (let i = 0; i < encoded.byteLength; i += chunkSize) {
        controller.enqueue(encoded.slice(i, Math.min(i + chunkSize, encoded.byteLength)));
      }
      controller.close();
    },
  });
  const response = await server.fetchRaw(
    'https://repo.test/api/security/csp-report',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/csp-report',
        'content-length': '100',
      },
      body: stream,
      duplex: 'half',
    },
  );
  assert.equal(
    response.status,
    413,
    'understated Content-Length must not bypass the streamed cap',
  );
  server.close();
});

// ---------------------------------------------------------------------------
// testing-gap-1: the handler must not log any request header values
// (cookie, referer, x-forwarded-for). If an operator ever decides to add
// "for debugging" they will trip this regression lock.
// ---------------------------------------------------------------------------

test('POST /api/security/csp-report does NOT log request headers (cookie, referer, x-forwarded-for)', async () => {
  const server = createWorkerRepositoryServer();
  const body = JSON.stringify(sampleLegacyReport());
  const sentinels = {
    cookie: 'ks2_session=SENTINEL_COOKIE_ABC123',
    referer: 'https://sentinel.example/',
    'x-forwarded-for': '198.51.100.SENTINEL',
  };
  // Capture both stdout (console.log) and stderr (console.error/warn) so
  // any accidental logging path is caught, regardless of which channel the
  // handler chose.
  const captured = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  console.log = (...args) => { captured.push(args.map(String).join(' ')); };
  console.error = (...args) => { captured.push(args.map(String).join(' ')); };
  console.warn = (...args) => { captured.push(args.map(String).join(' ')); };
  try {
    const response = await server.fetchRaw(
      'https://repo.test/api/security/csp-report',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/csp-report',
          ...sentinels,
        },
        body,
      },
    );
    assert.equal(response.status, 204);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }
  const combined = captured.join('\n');
  assert.ok(
    !combined.includes('SENTINEL_COOKIE_ABC123'),
    `logs must not contain the cookie sentinel — captured: ${JSON.stringify(captured)}`,
  );
  assert.ok(
    !combined.includes('sentinel.example'),
    `logs must not contain the referer sentinel — captured: ${JSON.stringify(captured)}`,
  );
  assert.ok(
    !combined.includes('198.51.100.SENTINEL'),
    `logs must not contain the x-forwarded-for sentinel — captured: ${JSON.stringify(captured)}`,
  );
  server.close();
});

// ---------------------------------------------------------------------------
// testing-gap-2: a well-formed JSON body that does NOT match any CSP shape
// (legacy `csp-report` wrapper, Reporting API v2 array) must be rejected
// with 400 — otherwise the handler would log an all-empty report line.
// ---------------------------------------------------------------------------

test('POST /api/security/csp-report rejects well-formed JSON that does not match a CSP shape', async () => {
  const server = createWorkerRepositoryServer();
  const response = await server.fetchRaw(
    'https://repo.test/api/security/csp-report',
    {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: JSON.stringify({ arbitrary: 'object' }),
    },
  );
  assert.equal(
    response.status,
    400,
    'non-CSP JSON payloads must 400 so operators never see a blank log entry',
  );
  server.close();
});

test('POST /api/security/csp-report also rejects non-CSP JSON under application/json', async () => {
  const server = createWorkerRepositoryServer();
  const response = await server.fetchRaw(
    'https://repo.test/api/security/csp-report',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    },
  );
  assert.equal(response.status, 400);
  server.close();
});
