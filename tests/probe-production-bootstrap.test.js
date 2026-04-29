import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runProbe, parseProbeArgs } from '../scripts/probe-production-bootstrap.mjs';
import { EVIDENCE_SCHEMA_VERSION } from '../scripts/lib/capacity-evidence.mjs';

test('parseProbeArgs accepts --output <path>', () => {
  const options = parseProbeArgs(['--url', 'https://example.test', '--output', 'reports/capacity/probe.json']);
  assert.equal(options.output, 'reports/capacity/probe.json');
});

test('parseProbeArgs rejects unknown flags with clear error', () => {
  assert.throws(() => parseProbeArgs(['--unknown']), /Unknown option/);
});

test('runProbe --output persists evidence JSON with full envelope shape', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-probe-'));
  const outputPath = join(tempDir, 'probe.json');
  const previousFetch = globalThis.fetch;
  const previousLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.map(String).join(' '));

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type' ? 'application/json' : null;
      },
      getSetCookie() { return []; },
    },
    async text() {
      return JSON.stringify({
        ok: true,
        bootstrapCapacity: {
          version: 1,
          mode: 'public-bounded',
          practiceSessions: { returned: 0, bounded: true },
          eventLog: { returned: 0, bounded: true },
        },
        selectedLearner: { id: 'l1' },
        syncState: { accountRevision: 1 },
        practiceSessions: [],
        eventLog: [],
        subjectStates: {},
      });
    },
  });

  try {
    const code = await runProbe([
      '--url', 'https://ks2.eugnel.uk',
      '--cookie', 'ks2_session=fake',
      '--max-bytes', '600000',
      '--output', outputPath,
    ]);
    assert.equal(code, 0);
    const written = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.ok(written.ok);
    assert.ok(written.reportMeta, 'envelope must include reportMeta');
    assert.ok(written.summary, 'envelope must include summary');
    assert.ok(Array.isArray(written.failures), 'envelope must include failures[]');
    assert.ok(written.thresholds, 'envelope must include thresholds object');
    assert.ok(written.safety, 'envelope must include safety block');
    assert.equal(written.reportMeta.evidenceSchemaVersion, EVIDENCE_SCHEMA_VERSION);
    // Timings must be real ISO strings, not null (regression from round 1).
    assert.match(written.summary.startedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(written.summary.finishedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(written.safety.mode, 'production-probe');
  } finally {
    globalThis.fetch = previousFetch;
    console.log = previousLog;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('runProbe --output persists even when probe fails (for audit trail)', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-probe-'));
  const outputPath = join(tempDir, 'probe-fail.json');
  const previousFetch = globalThis.fetch;
  const previousLog = console.log;
  console.log = () => {};

  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    headers: {
      get() { return 'application/json'; },
      getSetCookie() { return []; },
    },
    async text() { return JSON.stringify({ error: 'server error' }); },
  });

  try {
    const code = await runProbe([
      '--url', 'https://ks2.eugnel.uk',
      '--cookie', 'ks2_session=fake',
      '--output', outputPath,
    ]);
    assert.equal(code, 1, 'failed probe should exit 1');
    const written = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(written.ok, false);
    assert.ok(written.failures.length > 0, 'failures must capture the HTTP 500');
  } finally {
    globalThis.fetch = previousFetch;
    console.log = previousLog;
    rmSync(tempDir, { recursive: true, force: true });
  }
});
