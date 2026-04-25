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

function writeTempDoc(doc) {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  writeFileSync(docPath, doc);
  return docPath;
}

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

test('committed tier config threshold tampering is caught (local-tamper-don\'t-push adversarial route)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, 'small-pilot.json');

  // Committed config has strict thresholds.
  writeFileSync(configPath, JSON.stringify({
    tier: 'small-pilot-provisional',
    thresholds: { max5xx: 0, maxNetworkFailures: 0, maxBootstrapP95Ms: 1000 },
  }));

  // Evidence records LOOSE thresholds (simulates operator locally relaxing
  // the config, running, then committing only the evidence file without the
  // tampered config).
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
    tier: {
      tier: 'small-pilot-provisional',
      configPath: 'reports/capacity/configs/small-pilot.json',
    },
    thresholds: {
      max5xx: { configured: 999, observed: 0, passed: true },  // LOOSE
      maxNetworkFailures: { configured: 999, observed: 0, passed: true },
      maxBootstrapP95Ms: { configured: 99999, observed: 320, passed: true },
    },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'small-pilot-provisional', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(
      result.report.some((line) => line.includes('local-tamper-without-pushing')),
      `expected local-tamper message; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('committed config tier mismatch with row decision is caught', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, '100-plus.json');

  // Committed config is for the 100-plus tier.
  writeFileSync(configPath, JSON.stringify({
    tier: '100-plus-certified',
    thresholds: {},
  }));

  // Evidence points to the 100-plus config but claims small-pilot tier.
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
    tier: {
      tier: 'small-pilot-provisional',
      configPath: 'reports/capacity/configs/100-plus.json',
    },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'small-pilot-provisional', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(
      result.report.some((line) => line.includes('declares tier') && line.includes('100-plus-certified')),
      `expected tier mismatch message; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('P95 and maxBytes cells in row must match evidence.summary.endpoints', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');

  // Evidence records realistic values.
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope()));
  // Row lies about P95 bootstrap (claims 250, evidence says 320).
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '250', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('p95Bootstrap mismatch')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('failures-array laundering is caught by recomputation (adv-4)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');

  // Evidence summary shows server5xx=3 (a real failure).
  // Threshold says max5xx=0, passed=true, failures=[] (hand-edited).
  // Recomputation from summary + threshold.configured will yield failures=[max5xx].
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    summary: {
      ok: false,
      totalRequests: 10,
      endpoints: { 'GET /api/bootstrap': { count: 10, p50WallMs: 100, p95WallMs: 320, maxResponseBytes: 81000 } },
      signals: { server5xx: 3 },
      failures: [],
    },
    failures: [],  // laundered
    thresholds: {
      max5xx: { configured: 0, observed: 3, passed: true },  // hand-flipped
      maxNetworkFailures: { configured: 0, observed: 0, passed: true },
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
    assert.ok(
      result.report.some((line) => line.includes('tampered with') || line.includes('recomputation says passed=false')),
      `expected recomputation to catch the lie; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('threshold in evidence not in committed config is flagged (adv-1 reverse direction)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, 'small-pilot.json');

  // Committed config only has max5xx. Evidence has an extra maxNetworkFailures.
  writeFileSync(configPath, JSON.stringify({
    tier: 'small-pilot-provisional',
    thresholds: { max5xx: 0 },
  }));
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
    tier: {
      tier: 'small-pilot-provisional',
      configPath: 'reports/capacity/configs/small-pilot.json',
    },
    thresholds: {
      max5xx: { configured: 0, observed: 0, passed: true },
      maxNetworkFailures: { configured: 0, observed: 0, passed: true },  // NOT in config
    },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'small-pilot-provisional', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('committed config omits it')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('minEvidenceSchemaVersion declared in config is honoured (adv-2)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, 'small-pilot.json');

  // Config declares minEvidenceSchemaVersion: 2, but tool only knows v1 and
  // evidence is v1. The cross-check must honour the config's declared minimum.
  writeFileSync(configPath, JSON.stringify({
    tier: 'small-pilot-provisional',
    minEvidenceSchemaVersion: 2,
    thresholds: {},
  }));
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
    tier: {
      tier: 'small-pilot-provisional',
      configPath: 'reports/capacity/configs/small-pilot.json',
    },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'small-pilot-provisional', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('minEvidenceSchemaVersion 2')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('config without top-level tier field is rejected (adv-3)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, 'pilot-override.json');

  // Committed config has no `tier` field — would otherwise be usable from
  // any tier row without a mismatch check firing.
  writeFileSync(configPath, JSON.stringify({
    thresholds: { max5xx: 999 },  // intentionally loose
  }));
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
    tier: {
      tier: 'small-pilot-provisional',
      configPath: 'reports/capacity/configs/pilot-override.json',
    },
    thresholds: {
      max5xx: { configured: 999, observed: 0, passed: true },
    },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'small-pilot-provisional', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(result.report.some((line) => line.includes('missing a top-level `tier` field')));
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('runVerify empty tier object does not satisfy tier cross-check', () => {
  // tier: {} has no `tier` field — should behave identically to missing tier.
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-production.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 1, learners: 30, bootstrapBurst: 30, rounds: 3 },
    tier: {},  // empty object — edge case round 2 testing flagged
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

// Round 5 Finding 1 [High]: dryRun:true cannot back a cert-tier decision.
// Trigger: operator sets payload.dryRun=true, nulls latency fields, then claims
// a tier above smoke-pass. gateUpperBound gives passed:true on null observed in
// dry-run, which is correct semantics for true dry-run previews but must not
// launder a real certification claim. Verify rejects.
test('dryRun:true cannot back a decision above smoke-pass (adv-r5-f1)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, 'small-pilot.json');
  writeFileSync(configPath, JSON.stringify({
    tier: 'small-pilot-provisional',
    thresholds: { max5xx: 0, maxBootstrapP95Ms: 1000, maxCommandP95Ms: 750 },
  }));
  // Evidence: dryRun:true, null latency observed. recomputeFailures would
  // otherwise accept this because dryRun:true makes null-observed pass.
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    dryRun: true,
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
    tier: {
      tier: 'small-pilot-provisional',
      configPath: 'reports/capacity/configs/small-pilot.json',
    },
    thresholds: {
      max5xx: { configured: 0, observed: 0, passed: true },
      maxBootstrapP95Ms: { configured: 1000, observed: null, passed: true },
      maxCommandP95Ms: { configured: 750, observed: null, passed: true },
    },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '—', '—', '81000', '0', 'none', 'small-pilot-provisional', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(
      result.report.some((line) => line.includes('dryRun:true cannot back')),
      `expected dryRun rejection message; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('dryRun:true on smoke-pass row still allowed (dryRun preview legitimate)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    dryRun: true,
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, true, `smoke-pass dryRun row should still pass; got: ${JSON.stringify(result.report)}`);
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// Round 5 Finding 2 [Medium]: structural coherence.
// totalRequests must equal the sum of perEndpoint.sampleCount across endpoints,
// and timings must be monotonic. If coherence fails we short-circuit and emit a
// failure rather than blindly trusting the fabricated summary.
test('inconsistent totalRequests vs endpoint sampleCount fails (adv-r5-f2a)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    summary: {
      ok: true,
      totalRequests: 999,  // claims 999 but endpoints sum to 20
      endpoints: {
        'GET /api/bootstrap': { count: 10, sampleCount: 10, p50WallMs: 100, p95WallMs: 320, maxResponseBytes: 81000 },
        'POST /api/subjects/grammar/command': { count: 10, sampleCount: 10, p50WallMs: 90, p95WallMs: 180, maxResponseBytes: 5000 },
      },
      startedAt: '2026-04-25T00:00:00Z',
      finishedAt: '2026-04-25T00:00:30Z',
      signals: {},
      failures: [],
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
    assert.ok(
      result.report.some((line) => line.includes('totalRequests')),
      `expected totalRequests coherence message; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('non-ISO timestamps in summary fail structural coherence (adv-r5-f2b)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    summary: {
      ok: true,
      totalRequests: 20,
      endpoints: {
        'GET /api/bootstrap': { count: 10, sampleCount: 10, p50WallMs: 100, p95WallMs: 320, maxResponseBytes: 81000 },
        'POST /api/subjects/grammar/command': { count: 10, sampleCount: 10, p50WallMs: 90, p95WallMs: 180, maxResponseBytes: 5000 },
      },
      startedAt: 'not-a-timestamp',
      finishedAt: '2026-04-25T00:00:30Z',
      signals: {},
      failures: [],
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
    assert.ok(
      result.report.some((line) => line.includes('startedAt') || line.includes('ISO timestamp')),
      `expected timestamp parse failure; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('finishedAt earlier than startedAt fails structural coherence (adv-r5-f2c)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    summary: {
      ok: true,
      totalRequests: 20,
      endpoints: {
        'GET /api/bootstrap': { count: 10, sampleCount: 10, p50WallMs: 100, p95WallMs: 320, maxResponseBytes: 81000 },
        'POST /api/subjects/grammar/command': { count: 10, sampleCount: 10, p50WallMs: 90, p95WallMs: 180, maxResponseBytes: 5000 },
      },
      startedAt: '2026-04-25T00:00:30Z',
      finishedAt: '2026-04-25T00:00:00Z',  // before startedAt
      signals: {},
      failures: [],
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
    assert.ok(
      result.report.some((line) => line.includes('finishedAt') && line.includes('startedAt')),
      `expected timing ordering failure; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// Round 5 Finding 3 [Medium]: minimum threshold keys per tier.
// A committed config with tier small-pilot-provisional must declare at minimum
// max5xx, p95BootstrapMs, p95CommandMs (here: max5xx, maxBootstrapP95Ms,
// maxCommandP95Ms). Empty thresholds:{} no longer passes.
test('small-pilot-provisional config with empty thresholds:{} fails verify (adv-r5-f3)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, 'small-pilot.json');
  writeFileSync(configPath, JSON.stringify({
    tier: 'small-pilot-provisional',
    thresholds: {},  // empty — now invalid per plan's minimum-thresholds rule
  }));
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
    tier: {
      tier: 'small-pilot-provisional',
      configPath: 'reports/capacity/configs/small-pilot.json',
    },
    thresholds: {},
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'small-pilot-provisional', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(
      result.report.some((line) => line.includes('minimum threshold')
        || line.includes('required threshold')
        || line.includes('must declare')),
      `expected minimum-threshold failure; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('30-learner-beta config requires maxBootstrapBytes in addition to base 3 (adv-r5-f3b)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-production.json');
  const configPath = join(configsDir, '30-learner-beta.json');
  // Missing the bytes cap that classroom-tier rules mandate.
  writeFileSync(configPath, JSON.stringify({
    tier: '30-learner-beta-certified',
    thresholds: {
      max5xx: 0,
      maxBootstrapP95Ms: 1000,
      maxCommandP95Ms: 750,
    },
  }));
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    // Schema v1 here because the tool ceiling is v1; the schemaVersion>=2
    // gate for classroom tiers fires separately and is not what this test
    // is exercising. The minimum-threshold-keys check must run BEFORE the
    // schema-version check in verifyEvidenceRow so the message is emitted.
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 1, learners: 30, bootstrapBurst: 30, rounds: 3 },
    tier: {
      tier: '30-learner-beta-certified',
      configPath: 'reports/capacity/configs/30-learner-beta.json',
    },
    thresholds: {
      max5xx: { configured: 0, observed: 0, passed: true },
      maxBootstrapP95Ms: { configured: 1000, observed: 320, passed: true },
      maxCommandP95Ms: { configured: 750, observed: 180, passed: true },
    },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-27', 'abc1234', 'prod', 'Free', '30', '30', '3', '320', '180', '81000', '0', 'none', '30-learner-beta-certified', 'reports/capacity/latest-production.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(
      result.report.some((line) => line.includes('maxResponseBytes')
        || line.includes('maxBootstrapBytes')
        || line.includes('bytes')),
      `expected bytes-threshold failure for classroom tier; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// Round 5 Finding 4 [Low]: git ancestry check on committed config.
// The default env.CAPACITY_VERIFY_SKIP_ANCESTRY guard is not set, so the check
// runs; but in the test repo we cannot fabricate a non-ancestor relationship
// without mutating the git tree. We therefore exercise two branches:
// (a) env skip honoured → passes cleanly (no warning)
// (b) git failure path (unknown commit SHA in evidence) → WARNING emitted but
//     verification does not fail ok:false only on the ancestry issue; this
//     keeps CI-without-history safe.
test('CAPACITY_VERIFY_SKIP_ANCESTRY=1 skips ancestry check (adv-r5-f4a)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, 'small-pilot.json');
  writeFileSync(configPath, JSON.stringify({
    tier: 'small-pilot-provisional',
    thresholds: { max5xx: 0, maxBootstrapP95Ms: 1000, maxCommandP95Ms: 750 },
  }));
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
    tier: {
      tier: 'small-pilot-provisional',
      configPath: 'reports/capacity/configs/small-pilot.json',
    },
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
  const previousSkip = process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = '1';
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    // With the escape hatch set, the ancestry check never fires and the rest
    // of the checks pass cleanly.
    assert.equal(result.ok, true, `skip-ancestry path should pass; got: ${JSON.stringify(result.report)}`);
  } finally {
    process.chdir(cwd);
    if (previousSkip === undefined) delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
    else process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = previousSkip;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ancestry check on git-less tempdir degrades to warning, not failure (adv-r5-f4b)', () => {
  // tempdir is not a git repo, so `git log` fails. The ancestry helper must
  // emit a WARNING rather than fail verification. ok should still be true for
  // the otherwise-clean payload.
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, 'small-pilot.json');
  writeFileSync(configPath, JSON.stringify({
    tier: 'small-pilot-provisional',
    thresholds: { max5xx: 0, maxBootstrapP95Ms: 1000, maxCommandP95Ms: 750 },
  }));
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: 'abc1234567890abcdef1234567890abcdef12345', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
    tier: {
      tier: 'small-pilot-provisional',
      configPath: 'reports/capacity/configs/small-pilot.json',
    },
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
  const previousSkip = process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    // Git cannot resolve in a non-repo tempdir — helper degrades to warning.
    // Verification stays ok:true because the other checks all pass.
    assert.equal(result.ok, true, `git-less dir should stay ok:true via warning path; got: ${JSON.stringify(result.report)}`);
  } finally {
    process.chdir(cwd);
    if (previousSkip === undefined) delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
    else process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = previousSkip;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ===========================================================================
// Round 6 adversarial findings
// ---------------------------------------------------------------------------
// Two P1 blockers + one docs-anchor invariant. See
// .context/compound-engineering/ce-code-review/round6/ for the probe runners.
// ===========================================================================

// Helpers: build a throwaway git repo with the canonical evidence layout so
// each round 6 test can reason about ancestry independently. Kept inline
// rather than factored to a top-level helper because only round 6 tests need
// real git state on disk; other tests stay isolated from git.
function writeSmallPilotConfig(configPath) {
  writeFileSync(configPath, JSON.stringify({
    tier: 'small-pilot-provisional',
    thresholds: { max5xx: 0, maxBootstrapP95Ms: 1000, maxCommandP95Ms: 750 },
  }));
}

function writeSmallPilotDoc(docPath, commitPrefix) {
  writeFileSync(docPath, makeDoc([
    [
      '2026-04-25',
      commitPrefix,
      'preview',
      'Free',
      '10',
      '10',
      '1',
      '320',
      '180',
      '81000',
      '0',
      'none',
      'small-pilot-provisional',
      'reports/capacity/latest-preview.json',
    ],
  ]));
}

function writeSmallPilotEvidence(evidencePath, commitSha) {
  writeFileSync(evidencePath, JSON.stringify({
    ok: true,
    reportMeta: {
      commit: commitSha,
      evidenceSchemaVersion: 1,
      learners: 10,
      bootstrapBurst: 10,
      rounds: 1,
    },
    safety: { mode: 'production', origin: 'https://example.test', authMode: 'cookie' },
    summary: {
      ok: true,
      totalRequests: 20,
      startedAt: '2026-04-25T00:00:00Z',
      finishedAt: '2026-04-25T00:00:30Z',
      endpoints: {
        'GET /api/bootstrap': { sampleCount: 10, count: 10, p50WallMs: 100, p95WallMs: 320, maxResponseBytes: 81000 },
        'POST /api/subjects/grammar/command': { sampleCount: 10, count: 10, p50WallMs: 90, p95WallMs: 180, maxResponseBytes: 5000 },
      },
      signals: {},
      failures: [],
    },
    tier: {
      tier: 'small-pilot-provisional',
      configPath: 'reports/capacity/configs/small-pilot.json',
    },
    thresholds: {
      max5xx: { configured: 0, observed: 0, passed: true },
      maxBootstrapP95Ms: { configured: 1000, observed: 320, passed: true },
      maxCommandP95Ms: { configured: 750, observed: 180, passed: true },
    },
    failures: [],
  }));
}

// r6-probe-c (P1): CAPACITY_VERIFY_SKIP_ANCESTRY=1 must leave an audit trail.
// The env-escape path previously returned `{failures:[], warnings:[]}` silently.
// After the fix it must push a warning naming the env var so the --json
// envelope and stderr carry a record that ancestry was bypassed.
test('CAPACITY_VERIFY_SKIP_ANCESTRY=1 emits an audit warning in verify output (r6-probe-c)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-r6c-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, 'small-pilot.json');
  writeSmallPilotConfig(configPath);
  writeSmallPilotEvidence(evidencePath, 'abc1234567890abcdef1234567890abcdef12345');
  writeSmallPilotDoc(docPath, 'abc1234');

  const cwd = process.cwd();
  const previousSkip = process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = '1';
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, true, `skip path should pass; got: ${JSON.stringify(result.report)}`);
    assert.ok(Array.isArray(result.warnings), 'warnings array must be present on envelope');
    assert.ok(
      result.warnings.some((w) => w.includes('CAPACITY_VERIFY_SKIP_ANCESTRY')),
      `expected warning naming the env var; got:\n${JSON.stringify(result.warnings, null, 2)}`,
    );
  } finally {
    process.chdir(cwd);
    if (previousSkip === undefined) delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
    else process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = previousSkip;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// r6-probe-c (P1): docs-anchor invariant — docs/operations/capacity.md must
// name the escape hatch explicitly. Locks docs-code invariant so that future
// removals of the docs section break this test and force rewiring.
test('docs/operations/capacity.md names CAPACITY_VERIFY_SKIP_ANCESTRY escape hatch (r6-probe-c docs anchor)', () => {
  const docPath = resolve(process.cwd(), 'docs/operations/capacity.md');
  const markdown = readFileSync(docPath, 'utf8');
  assert.ok(
    markdown.includes('CAPACITY_VERIFY_SKIP_ANCESTRY'),
    'docs/operations/capacity.md must document the CAPACITY_VERIFY_SKIP_ANCESTRY escape hatch.',
  );
});

// r6-probe-e (P1): fabricated evidence commit in a FULL clone must fail closed.
// Previously the ancestry helper degraded to a warning whenever
// `git merge-base --is-ancestor` errored — including when the evidenceCommit
// did not exist. Operators could thus fabricate a plausible 40-char hex SHA
// and sail through with warnings only. After the fix, commit existence is
// probed via `git cat-file -e` first and a non-shallow repo rejects unknown
// SHAs outright.
test('fabricated evidence commit on a full clone fails closed (r6-probe-e)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-r6e-full-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, 'small-pilot.json');
  writeSmallPilotConfig(configPath);

  // Build a full (non-shallow) git repo so the config gets a real SHA and
  // the shallow-detection branch stays false.
  execSync('git init -q', { cwd: tempDir });
  execSync('git config user.email r6probe@example.test', { cwd: tempDir });
  execSync('git config user.name R6Probe', { cwd: tempDir });
  execSync('git add reports/capacity/configs/small-pilot.json', { cwd: tempDir });
  execSync('git commit -q -m "initial config"', { cwd: tempDir });

  // Evidence cites a fabricated SHA that does not exist in this repo.
  const fabricatedSha = 'f00dbabe1234567890abcdef1234567890abcdef';
  writeSmallPilotEvidence(evidencePath, fabricatedSha);
  writeSmallPilotDoc(docPath, fabricatedSha.slice(0, 7));

  const cwd = process.cwd();
  const previousSkip = process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(
      result.ok,
      false,
      `fabricated SHA on full clone must fail closed; got ok:true with report=${JSON.stringify(result.report)}`,
    );
    assert.ok(
      result.report.some((line) => line.includes('does not exist')),
      `expected "does not exist" failure; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    if (previousSkip === undefined) delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
    else process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = previousSkip;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// r6-probe-e (P1): shallow-clone tolerance. In a shallow clone the evidence
// commit may legitimately be outside the fetched depth. When commit existence
// cannot be probed AND the repo is shallow, the ancestry check degrades to a
// warning (not a failure) so shallow CI shards keep working.
test('fabricated evidence commit on a shallow clone degrades to warning (r6-probe-e shallow-tolerance)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-r6e-shallow-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, 'small-pilot.json');
  writeSmallPilotConfig(configPath);

  // Build a repo and mark it shallow via the sentinel file git recognises.
  execSync('git init -q', { cwd: tempDir });
  execSync('git config user.email r6probe@example.test', { cwd: tempDir });
  execSync('git config user.name R6Probe', { cwd: tempDir });
  execSync('git add reports/capacity/configs/small-pilot.json', { cwd: tempDir });
  execSync('git commit -q -m "initial config"', { cwd: tempDir });
  // Forge a shallow marker so `git rev-parse --is-shallow-repository` returns
  // true. Git treats any non-empty .git/shallow as a shallow repo marker.
  const gitDir = execSync('git rev-parse --git-dir', { cwd: tempDir }).toString().trim();
  const absoluteGitDir = resolve(tempDir, gitDir);
  writeFileSync(join(absoluteGitDir, 'shallow'), 'deadbeef1234567890abcdef1234567890abcdef\n');

  const fabricatedSha = 'f00dbabe1234567890abcdef1234567890abcdef';
  writeSmallPilotEvidence(evidencePath, fabricatedSha);
  writeSmallPilotDoc(docPath, fabricatedSha.slice(0, 7));

  const cwd = process.cwd();
  const previousSkip = process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(
      result.ok,
      true,
      `shallow clone should tolerate unknown SHA via warning; got ok:false report=${JSON.stringify(result.report)}`,
    );
    assert.ok(
      Array.isArray(result.warnings) && result.warnings.length > 0,
      'shallow-clone path must emit at least one warning about the unknown evidence commit.',
    );
  } finally {
    process.chdir(cwd);
    if (previousSkip === undefined) delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
    else process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = previousSkip;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// r6-probe-e (regression): on a full clone with a real ancestry relationship
// verification continues to pass without warnings — the fabrication detector
// must not break the happy path.
test('full clone + real ancestor commit + real ancestry still passes (r6-probe-e regression)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-r6e-regression-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, 'small-pilot.json');
  writeSmallPilotConfig(configPath);

  // Build a full repo, commit the config, then add a later empty commit whose
  // SHA is used as the evidence commit — the config SHA is therefore an
  // ancestor of the evidence SHA (the legitimate production shape).
  execSync('git init -q', { cwd: tempDir });
  execSync('git config user.email r6probe@example.test', { cwd: tempDir });
  execSync('git config user.name R6Probe', { cwd: tempDir });
  execSync('git add reports/capacity/configs/small-pilot.json', { cwd: tempDir });
  execSync('git commit -q -m "initial config"', { cwd: tempDir });
  execSync('git commit -q --allow-empty -m "evidence commit"', { cwd: tempDir });
  const evidenceSha = execSync('git rev-parse HEAD', { cwd: tempDir }).toString().trim();

  writeSmallPilotEvidence(evidencePath, evidenceSha);
  writeSmallPilotDoc(docPath, evidenceSha.slice(0, 7));

  const cwd = process.cwd();
  const previousSkip = process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, true, `regression: real ancestor must pass; got: ${JSON.stringify(result.report)}`);
    // No ancestry warnings on the happy path.
    assert.ok(
      !(result.warnings || []).some((w) => w.includes('does not exist') || w.includes('could not resolve')),
      `unexpected ancestry warnings on the happy path: ${JSON.stringify(result.warnings)}`,
    );
  } finally {
    process.chdir(cwd);
    if (previousSkip === undefined) delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
    else process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = previousSkip;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ===========================================================================
// Round 7 adversarial findings
// ---------------------------------------------------------------------------
// Two P1 blockers (abbreviated-commit bypass, smoke-pass ancestry skip) and a
// P3 docs-anchor advisory. See
// .context/compound-engineering/ce-code-review/round7/ for the probe runners.
// ===========================================================================

// r7-01 (P1): reportMeta.commit must be a 40-char hex SHA. A 7-char abbreviation
// of a real commit previously passed `git cat-file -e <abbrev>^{commit}` because
// git honours abbreviation resolution. The new format check rejects anything
// shorter than 40 hex characters before any git helper runs.
test('reportMeta.commit of 7 hex chars is rejected as non-full-SHA (r7-01 T1)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-r7-01-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    // Exactly the adversarial shape: 7-char prefix in place of a full SHA.
    reportMeta: { commit: 'c99406a', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'c99406a', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(
      result.report.some((line) => line.includes('must be a 40-char hex SHA')),
      `expected 40-char hex SHA rejection; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// r7-01 (P1): non-hex garbage in reportMeta.commit is rejected by the same
// format gate. Catches ref syntax (e.g. "HEAD~1"), placeholders, and any
// value that slipped past the shape guard but is not a real SHA.
test('reportMeta.commit of non-hex garbage is rejected (r7-01 T2)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-r7-01b-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: {
      commit: 'not-a-sha-just-words-here-pretend-sha-x-x',
      evidenceSchemaVersion: 1,
      learners: 10,
      bootstrapBurst: 10,
      rounds: 1,
    },
  })));
  // Row commit must be valid hex so the format-gate firing is on the evidence
  // commit, not the row commit (that's a separate test below).
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(
      result.report.some((line) => line.includes('must be a 40-char hex SHA')),
      `expected 40-char hex SHA rejection on non-hex value; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// r7-01 (P1): row commit cell is tightened to /^[0-9a-f]{7,40}$/i. Values like
// "HEAD123" satisfy the legacy length>=7 check but are not valid git SHAs (or
// SHA abbreviations); the new format gate rejects them as ref syntax/garbage.
// Uses a 7-char mixed-case non-hex string so the old length-only check would
// have let it through.
test('row commit cell with ref-shaped 7-char value is rejected (r7-01 T3)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-r7-01c-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    // Evidence commit must be a valid 40-char hex so the only failing check
    // is the row-commit format gate, not the reportMeta.commit gate.
    reportMeta: {
      commit: 'abcdef0123456789abcdef0123456789abcdef01',
      evidenceSchemaVersion: 1,
      learners: 10,
      bootstrapBurst: 10,
      rounds: 1,
    },
  })));
  // Row commit: 7 chars, passes the legacy length check, contains non-hex 'H',
  // 'E', 'A', 'D'. The new format gate must reject it.
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'HEAD123', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(
      result.report.some((line) => line.includes('row commit') && line.includes('hex')),
      `expected row commit hex-format rejection; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// r7-02 (P1): smoke-pass rows never require a configPath, so the configPath-
// gated ancestry block silently skipped probeCommitExists. Operators could
// forge any well-formed 40-char hex as reportMeta.commit and sail through on
// smoke-pass even on a full clone. After the hoist, commit existence is
// probed for every non-placeholder non-fail row whose commit passes the
// format gate.
test('smoke-pass row with forged 40-char hex on full clone fails closed (r7-02 T4)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-r7-02-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');

  // Build a full (non-shallow) git repo so the shallow-detection branch
  // stays false and the "does not exist" failure path fires.
  execSync('git init -q', { cwd: tempDir });
  execSync('git config user.email r7probe@example.test', { cwd: tempDir });
  execSync('git config user.name R7Probe', { cwd: tempDir });
  execSync('git commit -q --allow-empty -m "initial"', { cwd: tempDir });

  // Fabricated 40-char hex that does not exist in the repo.
  const forgedSha = 'f00dbabe1234567890abcdef1234567890abcdef';
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: forgedSha, evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
    // smoke-pass deliberately has no tier.configPath.
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', forgedSha.slice(0, 7), 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  const previousSkip = process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(
      result.ok,
      false,
      `smoke-pass + forged SHA on full clone must fail; got ok:true report=${JSON.stringify(result.report)}`,
    );
    assert.ok(
      result.report.some((line) => line.includes('does not exist')),
      `expected "does not exist" failure on smoke-pass; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    if (previousSkip === undefined) delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
    else process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = previousSkip;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// r7-02 (regression): smoke-pass row whose reportMeta.commit IS a real commit
// in the local git object database continues to pass. Keeps the happy path
// intact when ancestry-probing is hoisted.
test('smoke-pass row with real 40-char commit still passes (r7-02 T5 regression)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-r7-02-happy-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');

  execSync('git init -q', { cwd: tempDir });
  execSync('git config user.email r7probe@example.test', { cwd: tempDir });
  execSync('git config user.name R7Probe', { cwd: tempDir });
  execSync('git commit -q --allow-empty -m "initial"', { cwd: tempDir });
  const realSha = execSync('git rev-parse HEAD', { cwd: tempDir }).toString().trim();

  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: realSha, evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', realSha.slice(0, 7), 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  const previousSkip = process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(
      result.ok,
      true,
      `smoke-pass + real commit must still pass; got ok:false report=${JSON.stringify(result.report)}`,
    );
  } finally {
    process.chdir(cwd);
    if (previousSkip === undefined) delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
    else process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = previousSkip;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// r7 P3 advisory: docs-anchor upgrade. The round 6 version used substring
// inclusion on the whole doc, which could be satisfied by a stray token in an
// unrelated HTML comment. The strengthened form asserts that
// docs/operations/capacity.md has a heading "## Evidence Verification Escape
// Hatches" AND within that section's body the token CAPACITY_VERIFY_SKIP_ANCESTRY
// appears. Gutting the section while leaving the token in a comment no longer
// satisfies the test.
test('docs anchor: CAPACITY_VERIFY_SKIP_ANCESTRY is documented inside the Escape Hatches section body (r7 P3 T6)', () => {
  const docPath = resolve(process.cwd(), 'docs/operations/capacity.md');
  const markdown = readFileSync(docPath, 'utf8');
  // Section heading must exist exactly as "## Evidence Verification Escape Hatches".
  const headingRegex = /^##\s+Evidence Verification Escape Hatches\s*$/m;
  assert.ok(
    headingRegex.test(markdown),
    'docs/operations/capacity.md must contain a "## Evidence Verification Escape Hatches" heading.',
  );
  // Slice from the heading to the next top-level H2 (or EOF). The token must
  // appear inside that section body. An HTML comment containing the token
  // outside the section no longer counts; a comment INSIDE the section still
  // counts because an in-section comment is at least co-located with the
  // documentation — the real weakness the r6 form invited was treating the
  // whole file as one undifferentiated blob.
  const headingMatch = markdown.match(/^##\s+Evidence Verification Escape Hatches\s*$/m);
  const startIndex = headingMatch.index + headingMatch[0].length;
  const remainder = markdown.slice(startIndex);
  const nextHeadingMatch = remainder.match(/^##\s+/m);
  const sectionBody = nextHeadingMatch ? remainder.slice(0, nextHeadingMatch.index) : remainder;
  assert.ok(
    sectionBody.includes('CAPACITY_VERIFY_SKIP_ANCESTRY'),
    'Escape Hatches section body must name CAPACITY_VERIFY_SKIP_ANCESTRY so reviewers see it in context.',
  );
});

// ===========================================================================
// Round 8 adversarial findings
// ---------------------------------------------------------------------------
// One P1 blocker: the r7 hoist placed `probeEvidenceCommitPresence` behind the
// same `CAPACITY_VERIFY_SKIP_ANCESTRY` env gate that originally scoped ONLY
// the merge-base rebase-race check. Setting the env var therefore now also
// disables the fabricated-SHA detector — a full-clone CI job can silently
// accept a forged 40-char hex SHA by setting the env var. See
// .context/compound-engineering/ce-code-review/round8/probes/probe-d-env-bypass.mjs
// for the reproduction.
//
// Fix scope (narrow): the existence probe is gated ONLY by `isShallowClone()`.
// `requireConfigAncestry` continues to honour the env var for its merge-base
// check (and continues to emit its audit warning when the env var is set AND
// a configPath is present).
// ===========================================================================

// r8-01 T1 (P1 primary): smoke-pass row with a forged 40-char hex commit on a
// FULL clone must fail closed EVEN WHEN `CAPACITY_VERIFY_SKIP_ANCESTRY=1` is
// set. The env var was originally the shallow-clone escape hatch for the
// merge-base ancestry check only; after r7 it incidentally also disabled the
// fabricated-SHA detector. This test pins the new, narrowed semantics.
test('smoke-pass + forged SHA + SKIP_ANCESTRY=1 + full clone fails closed (r8-01 T1)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-r8-01-full-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');

  // Full (non-shallow) git repo so the shallow-detection branch stays false.
  execSync('git init -q', { cwd: tempDir });
  execSync('git config user.email r8probe@example.test', { cwd: tempDir });
  execSync('git config user.name R8Probe', { cwd: tempDir });
  execSync('git commit -q --allow-empty -m "initial"', { cwd: tempDir });

  const forgedSha = 'f00dbabe1234567890abcdef1234567890abcdef';
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: forgedSha, evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
    // smoke-pass deliberately has no tier.configPath.
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', forgedSha.slice(0, 7), 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));

  const cwd = process.cwd();
  const previousSkip = process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = '1';
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(
      result.ok,
      false,
      `smoke-pass + forged SHA + SKIP_ANCESTRY on full clone must fail; got ok:true report=${JSON.stringify(result.report)}`,
    );
    assert.ok(
      result.report.some((line) => line.includes('does not exist')),
      `expected "does not exist" failure even with SKIP_ANCESTRY=1; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    if (previousSkip === undefined) delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
    else process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = previousSkip;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// r8-01 T2 (P1 shallow tolerance): smoke-pass row with a forged 40-char hex
// commit on a SHALLOW clone with `CAPACITY_VERIFY_SKIP_ANCESTRY=1` set must
// still pass with a warning. The existence probe degrades to a warning on a
// shallow clone (legitimate depth-limit), so the escape hatch for shallow CI
// shards is preserved.
test('smoke-pass + forged SHA + SKIP_ANCESTRY=1 + shallow clone warns but passes (r8-01 T2)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-r8-01-shallow-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');

  execSync('git init -q', { cwd: tempDir });
  execSync('git config user.email r8probe@example.test', { cwd: tempDir });
  execSync('git config user.name R8Probe', { cwd: tempDir });
  execSync('git commit -q --allow-empty -m "initial"', { cwd: tempDir });
  // Mark the repo shallow via the `.git/shallow` sentinel file. Git treats any
  // non-empty `.git/shallow` as the shallow-repo marker, which is what
  // `git rev-parse --is-shallow-repository` reads.
  const gitDir = execSync('git rev-parse --git-dir', { cwd: tempDir }).toString().trim();
  const absoluteGitDir = resolve(tempDir, gitDir);
  writeFileSync(join(absoluteGitDir, 'shallow'), 'deadbeef1234567890abcdef1234567890abcdef\n');

  const forgedSha = 'f00dbabe1234567890abcdef1234567890abcdef';
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: { commit: forgedSha, evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', forgedSha.slice(0, 7), 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));

  const cwd = process.cwd();
  const previousSkip = process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = '1';
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(
      result.ok,
      true,
      `shallow clone + SKIP_ANCESTRY must tolerate unknown SHA via warning; got ok:false report=${JSON.stringify(result.report)}`,
    );
    assert.ok(
      Array.isArray(result.warnings) && result.warnings.length > 0,
      'shallow-clone path must emit at least one warning about the unknown evidence commit.',
    );
  } finally {
    process.chdir(cwd);
    if (previousSkip === undefined) delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
    else process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = previousSkip;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// r8-01 T3 (P1 tier symmetry): small-pilot row (configPath present) with a
// forged 40-char hex commit on a FULL clone with `CAPACITY_VERIFY_SKIP_ANCESTRY=1`
// must fail closed via the existence probe, even though the merge-base skip
// is active inside `requireConfigAncestry`. Symmetry check: SKIP_ANCESTRY
// stops ONLY the merge-base ancestry check regardless of tier; the existence
// probe fires for every tier that passes the format gate.
test('small-pilot + forged SHA + SKIP_ANCESTRY=1 + full clone fails closed (r8-01 T3)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-r8-01-smallpilot-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, 'small-pilot.json');
  writeSmallPilotConfig(configPath);

  execSync('git init -q', { cwd: tempDir });
  execSync('git config user.email r8probe@example.test', { cwd: tempDir });
  execSync('git config user.name R8Probe', { cwd: tempDir });
  execSync('git add reports/capacity/configs/small-pilot.json', { cwd: tempDir });
  execSync('git commit -q -m "initial config"', { cwd: tempDir });

  const forgedSha = 'f00dbabe1234567890abcdef1234567890abcdef';
  writeSmallPilotEvidence(evidencePath, forgedSha);
  writeSmallPilotDoc(docPath, forgedSha.slice(0, 7));

  const cwd = process.cwd();
  const previousSkip = process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
  process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = '1';
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(
      result.ok,
      false,
      `small-pilot + forged SHA + SKIP_ANCESTRY on full clone must fail via existence probe; got ok:true report=${JSON.stringify(result.report)}`,
    );
    assert.ok(
      result.report.some((line) => line.includes('does not exist')),
      `expected "does not exist" failure from existence probe; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    if (previousSkip === undefined) delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
    else process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = previousSkip;
    rmSync(tempDir, { recursive: true, force: true });
  }
});
