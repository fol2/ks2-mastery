// U10 script-shape smoke: admin-reconcile-kpis.mjs CLI entrypoint guard +
// usage string + env validation. Does NOT exercise a live reconciliation
// — that's covered by tests/worker-admin-reconcile-kpis.test.js.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U10
// Windows hygiene: spawn via `shell: true`; CRLF normalisation on stdout.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXIT_OK,
  EXIT_USAGE,
  buildRequestId,
  requireEnvCredentials,
  resolveBaseUrl,
  resolveTimeout,
  usage,
} from '../scripts/admin-reconcile-kpis.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function normaliseLineEndings(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function runScript(args = [], env = {}) {
  return new Promise((resolve) => {
    const scriptPath = path.join(rootDir, 'scripts', 'admin-reconcile-kpis.mjs');
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: rootDir,
      env: { ...process.env, ...env },
      shell: false, // CRLF-safe: explicit process.execPath avoids shell quoting drift.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (code) => {
      resolve({
        code,
        stdout: normaliseLineEndings(stdout),
        stderr: normaliseLineEndings(stderr),
      });
    });
  });
}

test('admin-reconcile-kpis usage string lists the required env vars', () => {
  const text = usage();
  assert.match(text, /KS2_SMOKE_ACCOUNT_EMAIL/);
  assert.match(text, /KS2_SMOKE_ACCOUNT_PASSWORD/);
  assert.match(text, /KS2_SMOKE_BASE_URL/);
  assert.match(text, /KS2_SMOKE_TIMEOUT_MS/);
});

test('admin-reconcile-kpis --help prints usage and exits 0 (no env required)', async () => {
  const result = await runScript(['--help']);
  assert.equal(result.code, EXIT_OK);
  assert.match(result.stdout, /Usage: node .+admin-reconcile-kpis\.mjs/);
  assert.match(result.stdout, /KS2_SMOKE_ACCOUNT_EMAIL/);
});

test('admin-reconcile-kpis -h prints usage and exits 0', async () => {
  const result = await runScript(['-h']);
  assert.equal(result.code, EXIT_OK);
  assert.match(result.stdout, /Usage: node /);
});

test('admin-reconcile-kpis without credentials exits 2 usage-error', async () => {
  // Clear the required env so the entrypoint's validator runs first.
  const result = await runScript([], {
    KS2_SMOKE_ACCOUNT_EMAIL: '',
    KS2_SMOKE_ACCOUNT_PASSWORD: '',
  });
  assert.equal(result.code, EXIT_USAGE);
  assert.match(result.stderr, /KS2_SMOKE_ACCOUNT_EMAIL/);
});

test('requireEnvCredentials rejects missing email', () => {
  assert.throws(() => requireEnvCredentials({ KS2_SMOKE_ACCOUNT_PASSWORD: 'pw' }), /KS2_SMOKE_ACCOUNT_EMAIL/);
});

test('requireEnvCredentials rejects missing password', () => {
  assert.throws(
    () => requireEnvCredentials({ KS2_SMOKE_ACCOUNT_EMAIL: 'admin@example.test' }),
    /KS2_SMOKE_ACCOUNT_PASSWORD/,
  );
});

test('resolveBaseUrl rejects http:// to avoid credential leak', () => {
  assert.throws(
    () => resolveBaseUrl({ KS2_SMOKE_BASE_URL: 'http://insecure.test' }),
    /must use https:/i,
  );
});

test('resolveBaseUrl defaults to https://ks2.eugnel.uk', () => {
  assert.equal(resolveBaseUrl({}), 'https://ks2.eugnel.uk');
});

test('resolveTimeout falls back to 15000 on non-numeric env', () => {
  assert.equal(resolveTimeout({}), 15_000);
  assert.equal(resolveTimeout({ KS2_SMOKE_TIMEOUT_MS: 'not-a-number' }), 15_000);
  assert.equal(resolveTimeout({ KS2_SMOKE_TIMEOUT_MS: '30000' }), 30_000);
});

test('buildRequestId composes reconcile-<iso>-<short-uuid>', () => {
  const date = new Date(1_700_000_000_000);
  const fixedUuid = () => '00000000-0000-0000-0000-000000000000';
  const id = buildRequestId(date, fixedUuid);
  assert.match(id, /^reconcile-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-00000000$/);
});
