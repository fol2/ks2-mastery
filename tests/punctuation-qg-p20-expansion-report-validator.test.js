import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUNCTUATION_CURRENT_RELEASE_ID } from '../src/subjects/punctuation/service-contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const VALIDATOR = resolve(ROOT, 'scripts/validate-punctuation-qg-p20-expansion-report.mjs');
const CURRENT_REPORT = resolve(ROOT, 'reports/punctuation/punctuation-qg-p20-expansion-audit.json');

function readJsonReport(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function ensureCurrentP20Report() {
  const existing = readJsonReport(CURRENT_REPORT);
  if (existing?.status === 'PASS' && existing.releaseId === PUNCTUATION_CURRENT_RELEASE_ID) return;
  execFileSync(process.execPath, ['scripts/build-punctuation-qg-p20-evidence.mjs'], { cwd: ROOT, stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/simulate-punctuation-qg-p20-heavy-play.mjs'], { cwd: ROOT, stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/audit-punctuation-qg-p20-expansion.mjs', '--out', CURRENT_REPORT], { cwd: ROOT, stdio: 'inherit' });
}

function runValidator(reportPath) {
  return spawnSync(process.execPath, [VALIDATOR, reportPath], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

function writeTempReport(prefix, report) {
  const tempDir = mkdtempSync(join(tmpdir(), prefix));
  const reportPath = join(tempDir, 'report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

test('P20 expansion report validator accepts the current duplicate-free and hyphen-clean report', () => {
  ensureCurrentP20Report();
  const result = runValidator(CURRENT_REPORT);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /P20 expansion report validation: PASS/);
});

test('P20 expansion report validator rejects stale fixed-bank duplicate reports', () => {
  ensureCurrentP20Report();
  const report = readJsonReport(CURRENT_REPORT);
  assert.ok(report, 'current P20 report must exist before synthesising stale duplicate fixture');
  const duplicateReport = {
    ...report,
    counts: {
      ...report.counts,
      duplicateSurfaceGroups: 6,
      fixedDuplicateSurfaceGroups: 6,
      legacyFixedDuplicateSurfaceGroups: 6,
    },
  };
  const duplicatePath = writeTempReport('punctuation-p20-duplicate-report-', duplicateReport);

  const result = runValidator(duplicatePath);

  assert.notEqual(result.status, 0, 'baseline duplicate report unexpectedly passed validation');
  assert.match(result.stderr, /runtime duplicate surface groups must be zero|fixed-bank duplicate surface groups must be zero|legacy fixed-bank duplicate surface groups must be zero/);
  assert.match(result.stderr, /"legacyFixedDuplicateSurfaceGroups": 6/);
});

test('P20 expansion report validator rejects hyphen quality gate failures and counters', () => {
  ensureCurrentP20Report();
  const report = readJsonReport(CURRENT_REPORT);
  assert.ok(report, 'current P20 report must exist before synthesising hyphen quality fixture');
  const hyphenFailureReport = {
    ...report,
    gates: {
      ...report.gates,
      hyphenCompoundQuality: {
        ...report.gates.hyphenCompoundQuality,
        ok: false,
        adverbialLyFindingCount: 1,
        malformedCompoundFindingCount: 1,
        articleAgreementFindingCount: 1,
      },
    },
    counts: {
      ...report.counts,
      hyphenAdverbialLyHyphenFindings: 1,
      hyphenMalformedCompoundFindings: 1,
      hyphenArticleAgreementFindings: 1,
    },
  };
  const hyphenFailurePath = writeTempReport('punctuation-p20-hyphen-quality-report-', hyphenFailureReport);

  const result = runValidator(hyphenFailurePath);

  assert.notEqual(result.status, 0, 'hyphen quality failure report unexpectedly passed validation');
  assert.match(result.stderr, /hyphen compound quality gate failed/);
  assert.match(result.stderr, /"adverbialLyFindingCount": 1/);
  assert.match(result.stderr, /"malformedCompoundFindingCount": 1/);
  assert.match(result.stderr, /"articleAgreementFindingCount": 1/);
});
