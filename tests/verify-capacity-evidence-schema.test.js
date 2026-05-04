import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

import {
  parseEvidenceTable,
  verifyCapacityDoc,
  verifyEvidenceRow,
  runVerify,
} from '../scripts/verify-capacity-evidence.mjs';

function makeDoc(rows) {
  const header = [
    '# docs/operations/capacity.md',
    '',
    '## Capacity Evidence',
    '',
    '| Date | Commit | Env | Plan | Learners | Burst | Rounds | P95 Bootstrap | P95 Command | Max Bytes | 5xx | Signals | Decision | Evidence |',
    '| --- | --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --- | --- | --- |',
  ];
  const body = rows.map((row) => `| ${row.join(' | ')} |`);
  return `${[...header, ...body, '', '## Next Section'].join('\n')}\n`;
}


// Produces a canonical evidence-envelope body; individual tests override fields.
// reportMeta defaults include the 10-learner/10-burst/1-round shape the
// small-pilot test rows claim, so numeric-drift cross-check passes by default.
// summary.endpoints include canonical p95 and max-byte values matching the
// row fixtures below (320 / 180 / 81000).
function evidenceEnvelope(overrides = {}) {
  const { reportMeta: reportMetaOverride, summary: summaryOverride, ...rest } = overrides;
  return {
    ok: true,
    reportMeta: {
      commit: 'abc1234567890abcdef1234567890abcdef12345',
      evidenceSchemaVersion: 1,
      learners: 10,
      bootstrapBurst: 10,
      rounds: 1,
      ...(reportMetaOverride || {}),
    },
    summary: summaryOverride || {
      ok: true,
      // Arithmetic identity: totalRequests must equal sum(endpoint.count) so
      // checkStructuralCoherence stays silent in baseline tests. Individual
      // tests exercise the arithmetic check by overriding `summary` entirely.
      totalRequests: 20,
      startedAt: '2026-04-25T00:00:00Z',
      finishedAt: '2026-04-25T00:00:30Z',
      endpoints: {
        'GET /api/bootstrap': { count: 10, p50WallMs: 100, p95WallMs: 320, maxResponseBytes: 81000 },
        'POST /api/subjects/grammar/command': { count: 10, p50WallMs: 90, p95WallMs: 180, maxResponseBytes: 5000 },
      },
      signals: {},
      failures: [],
    },
    failures: [],
    thresholds: {},
    safety: { mode: 'production', origin: 'https://example.test', authMode: 'cookie' },
    ...rest,
  };
}

function writeTempDoc(doc) {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  writeFileSync(docPath, doc);
  return docPath;
}

test('parseEvidenceTable picks up rows and skips header + divider', () => {
  const doc = makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/snapshots/run.json'],
  ]);
  const rows = parseEvidenceTable(doc);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-04-25');
  assert.equal(rows[0].decision, 'smoke-pass');
  assert.equal(rows[0].evidence, 'reports/capacity/snapshots/run.json');
});

test('placeholder row is skipped without failure', () => {
  const doc = makeDoc([
    ['_pending first run_', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—'],
  ]);
  const result = verifyCapacityDoc(writeTempDoc(doc));
  assert.equal(result.ok, true);
});

test('row with unknown decision fails verification', () => {
  const row = parseEvidenceTable(makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'looks-good-to-me', 'reports/capacity/latest-preview.json'],
  ]))[0];
  const result = verifyEvidenceRow(row);
  assert.equal(result.ok, false);
  assert.ok(result.messages[0].includes('not one of'));
});

test('non-fail decision without backing JSON fails verification', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('evidence file not found')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});


test('non-fail decision with backing JSON and matching commit passes', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope()));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', '[link](reports/capacity/latest-preview.json)'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, true, JSON.stringify(result.report));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('worker-log joined diagnostics cannot declare certification contribution', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    diagnostics: {
      workerLogJoin: {
        diagnosticOnly: true,
        certification: { contributesToCertification: true },
        samples: [],
      },
    },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('joined Cloudflare CPU/wall data must not contribute')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('worker-log joined diagnostics classify missing CPU/wall logs as insufficient', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    diagnostics: {
      workerLogJoin: {
        diagnosticOnly: true,
        certification: { contributesToCertification: false },
        samples: [{
          requestId: 'ks2_req_00000000-0000-4000-8000-000000000001',
          join: { invocation: { status: 'missing' }, capacityRequest: { status: 'matched' } },
          cloudflare: { cpuTimeMs: null, wallTimeMs: null },
          classification: 'd1-dominated',
        }],
      },
    },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('expected "unclassified-insufficient-logs"')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('worker-log joined diagnostics reject matched invocations with null CPU/wall logs', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    diagnostics: {
      workerLogJoin: {
        diagnosticOnly: true,
        certification: { contributesToCertification: false },
        samples: [{
          requestId: 'ks2_req_00000000-0000-4000-8000-000000000002',
          join: { invocation: { status: 'matched' }, capacityRequest: { status: 'matched' } },
          cloudflare: { cpuTimeMs: null, wallTimeMs: null },
          classification: 'd1-dominated',
        }],
      },
    },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('expected "unclassified-insufficient-logs"')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('tier above small-pilot-provisional requires evidenceSchemaVersion >= 2', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-production.json');
  const configPath = join(configsDir, '30-learner-beta.json');
  writeFileSync(configPath, JSON.stringify({
    tier: '30-learner-beta-certified',
    thresholds: {},
  }));
  // Evidence is a small-pilot v1 shape but the row claims classroom-tier.
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 1, learners: 30, bootstrapBurst: 30, rounds: 3 },
    tier: {
      tier: '30-learner-beta-certified',
      configPath: 'reports/capacity/configs/30-learner-beta.json',
    },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-27', 'abc1234', 'prod', 'Free', '30', '30', '3', '900', '600', '500000', '0', 'none', '30-learner-beta-certified', 'reports/capacity/latest-production.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(
      result.report.some((line) => line.includes('evidenceSchemaVersion >= 2')),
      `expected schema-version message; got: ${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('small-pilot tier row with pinned config + matching learners passes (U1 currently-shipable happy path)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, 'small-pilot.json');
  // Round 5 Finding 3 requires small-pilot-provisional configs to declare at
  // minimum max5xx, maxBootstrapP95Ms, and maxCommandP95Ms. The happy-path
  // fixture updates to reflect that minimum so the test exercises a valid
  // production-shaped config.
  writeFileSync(configPath, JSON.stringify({
    tier: 'small-pilot-provisional',
    thresholds: { max5xx: 0, maxBootstrapP95Ms: 1000, maxCommandP95Ms: 750 },
  }));
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
    tier: {
      tier: 'small-pilot-provisional',
      minEvidenceSchemaVersion: 1,
      configPath: 'reports/capacity/configs/small-pilot.json',
    },
    // Evidence thresholds must match the committed config thresholds exactly.
    thresholds: {
      max5xx: { configured: 0, observed: 0, passed: true },
      maxBootstrapP95Ms: { configured: 1000, observed: 320, passed: true },
      maxCommandP95Ms: { configured: 750, observed: 180, passed: true },
    },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'small-pilot-provisional', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, true, JSON.stringify(result.report));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('tier row rejects --config path outside reports/capacity/configs/', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-production.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 2, learners: 30, bootstrapBurst: 30, rounds: 3 },
    tier: {
      tier: '30-learner-beta-certified',
      // Adversarial: config path outside the PR-reviewed directory.
      configPath: '/tmp/loose.json',
    },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-27', 'abc1234', 'prod', 'Free', '30', '30', '3', '900', '600', '500000', '0', 'none', '30-learner-beta-certified', 'reports/capacity/latest-production.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('outside reports/capacity/configs/')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('tier row rejects missing tier.configPath entirely', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-production.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 2, learners: 30, bootstrapBurst: 30, rounds: 3 },
    tier: { tier: '30-learner-beta-certified' },  // configPath missing
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-27', 'abc1234', 'prod', 'Free', '30', '30', '3', '900', '600', '500000', '0', 'none', '30-learner-beta-certified', 'reports/capacity/latest-production.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('tier.configPath')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('numeric cells in capacity.md must match evidence reportMeta', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  // Evidence was a 10-learner run; row lies about 30 learners.
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '30', '30', '3', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('learners mismatch')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('future evidenceSchemaVersion rejected (adversarial hand-edit bump)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  // Hand-edit: bump schema to 99 to try to unlock classroom-tier claims.
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 99 },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('higher than the current tool version')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('row commit prefix shorter than 7 chars is rejected', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 1 },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('too short')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('tier above small-pilot-provisional requires evidence.tier.tier to match row decision', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-production.json');
  // Missing tier metadata — evidence was produced without --config.
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 2 },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-27', 'abc1234', 'prod', 'Free', '30', '30', '3', '900', '600', '500000', '0', 'none', '30-learner-beta-certified', 'reports/capacity/latest-production.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('missing tier.tier')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('tier mismatch between row decision and evidence tier.tier fails', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-production.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 2 },
    tier: { tier: '60-learner-stretch-certified' },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-27', 'abc1234', 'prod', 'Free', '30', '30', '3', '900', '600', '500000', '0', 'none', '30-learner-beta-certified', 'reports/capacity/latest-production.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('tier mismatch')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hand-written fabrication missing required envelope keys is rejected', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  // Exactly the adversarial-review fabrication shape.
  writeFileSync(evidencePath, JSON.stringify({
    ok: true,
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 2 },
  }));
  writeFileSync(docPath, makeDoc([
    ['2026-04-27', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('missing required key')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('row with failures in the evidence payload fails verification', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    failures: ['maxBootstrapP95Ms'],
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-27', 'abc1234', 'preview', 'Free', '10', '10', '1', '1200', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('records threshold failures')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('missing evidenceSchemaVersion fails (was silent pass via NaN gate)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  // Hand-build the envelope WITHOUT the envelope helper's defaults so the
  // reportMeta is genuinely missing the schema version (mirrors an adversarial
  // hand-edit or a truncated write).
  writeFileSync(evidencePath, JSON.stringify({
    ok: true,
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', learners: 10, bootstrapBurst: 10, rounds: 1 },
    summary: { ok: true, totalRequests: 1, endpoints: {}, signals: {}, failures: [] },
    failures: [],
    thresholds: {},
    safety: { mode: 'production', origin: 'https://example.test', authMode: 'cookie' },
  }));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('evidenceSchemaVersion is missing')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('short row with missing cells fails explicitly (adversarial drop-a-column probe)', () => {
  // Row has 13 cells instead of 14 (Evidence column dropped). Header has 14
  // cells, so downstream consumers would silently read `row.evidence` as ''
  // — the fix now records cellCount and surfaces a clear failure.
  const doc = makeDoc([]).replace(
    '| --- | --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --- | --- | --- |',
    '| --- | --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --- | --- | --- |\n'
    + '| 2026-04-25 | abc1234 | preview | Free | 10 | 10 | 1 | 320 | 180 | 81000 | 0 | none | smoke-pass |',
  );
  const docPath = writeTempDoc(doc);
  const result = verifyCapacityDoc(docPath);
  assert.equal(result.ok, false);
  assert.ok(
    result.report.some((line) => line.includes('cells; expected 14')),
    `expected 'cells; expected 14' in report; got:\n${result.report.join('\n')}`,
  );
});

test('failing evidence (report.ok=false) fails verification', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  writeFileSync(evidencePath, JSON.stringify({
    ok: false,
    reportMeta: { commit: 'abc1234', evidenceSchemaVersion: 1 },
  }));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('report.ok is not true')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('row with decision=fail does not require evidence backing', () => {
  const row = parseEvidenceTable(makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '1500', '900', '2000000', '3', 'server5xx', 'fail', '—'],
  ]))[0];
  const result = verifyEvidenceRow(row);
  assert.equal(result.ok, true);
});


test('runVerify --help returns exit code 0 without running verification', () => {
  const previousLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.map(String).join(' '));
  try {
    const code = runVerify(['--help']);
    assert.equal(code, 0);
    assert.ok(logged.some((line) => line.includes('Usage:')));
  } finally {
    console.log = previousLog;
  }
});

test('runVerify unknown flag returns exit code 2 and prints usage to stderr', () => {
  const previousError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.map(String).join(' '));
  try {
    const code = runVerify(['--bogus-flag']);
    assert.equal(code, 2);
    assert.ok(errors.some((line) => line.includes('Unknown option')));
  } finally {
    console.error = previousError;
  }
});

test('runVerify --json emits machine-readable JSON on failure', () => {
  const previousLog = console.log;
  const previousError = console.error;
  const logged = [];
  const errored = [];
  console.log = (...args) => logged.push(args.map(String).join(' '));
  console.error = (...args) => errored.push(args.map(String).join(' '));
  try {
    const code = runVerify(['--json', '/nonexistent-capacity.md']);
    assert.equal(code, 1);
    // --json prints JSON to stdout even on failure; no human-prose on stderr.
    assert.ok(logged.some((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed.ok === false && Array.isArray(parsed.messages);
      } catch {
        return false;
      }
    }));
  } finally {
    console.log = previousLog;
    console.error = previousError;
  }
});

