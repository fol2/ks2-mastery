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
