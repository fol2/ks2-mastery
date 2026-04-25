import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
      commit: 'abc1234567890',
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 1, learners: 30, bootstrapBurst: 30, rounds: 3 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 2, learners: 30, bootstrapBurst: 30, rounds: 3 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 2, learners: 30, bootstrapBurst: 30, rounds: 3 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 99 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 1 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 2 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 2 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 2 },
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
    reportMeta: { commit: 'abc1234567890', learners: 10, bootstrapBurst: 10, rounds: 1 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 1, learners: 30, bootstrapBurst: 30, rounds: 3 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 1, learners: 30, bootstrapBurst: 30, rounds: 3 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
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
    reportMeta: { commit: 'abc1234567890', evidenceSchemaVersion: 1, learners: 10, bootstrapBurst: 10, rounds: 1 },
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
