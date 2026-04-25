import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseEvidenceTable,
  verifyCapacityDoc,
  verifyEvidenceRow,
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

test('non-fail decision with backing JSON and matching commit passes', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  writeFileSync(evidencePath, JSON.stringify({
    ok: true,
    reportMeta: { commit: 'abc1234', evidenceSchemaVersion: 1 },
  }));
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
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-production.json');
  writeFileSync(evidencePath, JSON.stringify({
    ok: true,
    reportMeta: { commit: 'abc1234', evidenceSchemaVersion: 1 },
  }));
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

test('tier above small-pilot-provisional with schema version 2 passes', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-production.json');
  writeFileSync(evidencePath, JSON.stringify({
    ok: true,
    reportMeta: { commit: 'abc1234', evidenceSchemaVersion: 2 },
  }));
  writeFileSync(docPath, makeDoc([
    ['2026-04-27', 'abc1234', 'prod', 'Free', '30', '30', '3', '900', '600', '500000', '0', 'none', '30-learner-beta-certified', 'reports/capacity/latest-production.json'],
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
