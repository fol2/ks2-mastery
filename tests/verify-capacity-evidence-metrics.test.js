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

test('dangling evidence commit present in local object database fails closed (p2 provenance)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-dangling-provenance-'));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    execSync('git init -q');
    execSync('git config user.email test@example.com');
    execSync('git config user.name Test');
    mkdirSync(join(tempDir, 'reports', 'capacity', 'configs'), { recursive: true });
    writeFileSync(
      join(tempDir, 'reports', 'capacity', 'configs', 'small-pilot.json'),
      JSON.stringify({
        tier: 'small-pilot-provisional',
        minEvidenceSchemaVersion: 1,
        thresholds: { max5xx: 0, maxBootstrapP95Ms: 1000, maxCommandP95Ms: 750, maxResponseBytes: 600000 },
      }, null, 2),
    );
    execSync('git add reports/capacity/configs/small-pilot.json');
    execSync('git commit -q -m "initial config"');
    const danglingSha = execSync('git commit-tree HEAD^{tree} -m "dangling evidence"', {
      encoding: 'utf8',
    }).trim();
    const evidencePath = join(tempDir, 'reports', 'capacity', 'latest.json');
    writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
      reportMeta: { commit: danglingSha, evidenceSchemaVersion: 1 },
      tier: {
        tier: 'small-pilot-provisional',
        configPath: 'reports/capacity/configs/small-pilot.json',
      },
      thresholds: {
        max5xx: { configured: 0, observed: 0, passed: true },
        maxBootstrapP95Ms: { configured: 1000, observed: 320, passed: true },
        maxCommandP95Ms: { configured: 750, observed: 180, passed: true },
        maxResponseBytes: { configured: 600000, observed: 81000, passed: true },
      },
    })));
    const row = parseEvidenceTable(makeDoc([
      ['2026-04-25', danglingSha.slice(0, 7), 'preview', 'small-pilot-provisional', '10', '10', '1', '320', '180', '81000', '0', 'none', 'small-pilot-provisional', 'reports/capacity/latest.json'],
    ]))[0];

    const previousSkip = process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
    delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
    try {
      const result = verifyEvidenceRow(row);
      assert.equal(result.ok, false);
      assert.ok(
        result.messages.some((line) => line.includes('not reachable from HEAD')),
        `expected dangling provenance failure; got:\n${result.messages.join('\n')}`,
      );
    } finally {
      if (previousSkip === undefined) delete process.env.CAPACITY_VERIFY_SKIP_ANCESTRY;
      else process.env.CAPACITY_VERIFY_SKIP_ANCESTRY = previousSkip;
    }
  } finally {
    process.chdir(cwd);
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

// ===========================================================================
// P4 U8: Evidence provenance and anti-fabrication guard
// ---------------------------------------------------------------------------
// Certifiable tiers (30-learner-beta-certified, 60-learner-stretch-certified,
// 100-plus-certified) MUST carry a provenance block. Lower tiers (smoke-pass,
// small-pilot-provisional) tolerate missing provenance.
// ===========================================================================

// Helper: build evidence with provenance.
function evidenceWithProvenance(provenanceOverrides = {}, envelopeOverrides = {}) {
  const { reportMeta: rmOverride, ...rest } = envelopeOverrides;
  return evidenceEnvelope({
    reportMeta: {
      commit: 'abc1234567890abcdef1234567890abcdef12345',
      evidenceSchemaVersion: 2,
      learners: 30,
      bootstrapBurst: 30,
      rounds: 3,
      provenance: {
        workflowRunUrl: 'https://github.com/fol2/ks2-mastery/actions/runs/12345',
        workflowName: 'Capacity CI',
        gitSha: 'abc1234567890abcdef1234567890abcdef12345',
        dirtyTreeFlag: false,
        thresholdConfigHash: 'none',
        loadDriverVersion: '0.1.0',
        operator: 'ci-bot',
        rawLogArtifactPath: 'none',
        ...provenanceOverrides,
      },
      ...(rmOverride || {}),
    },
    ...rest,
  });
}

test('classroom tier without provenance fails verification (P4-U8)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-u8-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-production.json');
  const configPath = join(configsDir, '30-learner-beta.json');
  writeFileSync(configPath, JSON.stringify({
    tier: '30-learner-beta-certified',
    thresholds: { max5xx: 0, maxBootstrapP95Ms: 1000, maxCommandP95Ms: 750, maxResponseBytes: 600000 },
  }));
  // Evidence WITHOUT provenance block.
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: {
      commit: 'abc1234567890abcdef1234567890abcdef12345',
      evidenceSchemaVersion: 2,
      learners: 30,
      bootstrapBurst: 30,
      rounds: 3,
      // provenance intentionally absent
    },
    summary: {
      ok: true,
      totalRequests: 20,
      startedAt: '2026-04-27T00:00:00Z',
      finishedAt: '2026-04-27T00:00:30Z',
      endpoints: {
        'GET /api/bootstrap': { count: 10, p50WallMs: 100, p95WallMs: 320, maxResponseBytes: 81000, queryCount: 5, d1RowsRead: 42 },
        'POST /api/subjects/grammar/command': { count: 10, p50WallMs: 90, p95WallMs: 180, maxResponseBytes: 5000 },
      },
      signals: {},
      failures: [],
    },
    tier: {
      tier: '30-learner-beta-certified',
      configPath: 'reports/capacity/configs/30-learner-beta.json',
    },
    thresholds: {
      max5xx: { configured: 0, observed: 0, passed: true },
      maxBootstrapP95Ms: { configured: 1000, observed: 320, passed: true },
      maxCommandP95Ms: { configured: 750, observed: 180, passed: true },
      maxResponseBytes: { configured: 600000, observed: 81000, passed: true },
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
      result.report.some((line) => line.includes('provenance') && line.includes('certification')),
      `expected provenance requirement message; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('smoke-pass without provenance still passes (P4-U8)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-u8-smoke-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  // Evidence WITHOUT provenance — smoke-pass must still pass.
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope()));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'smoke-pass', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, true, `smoke-pass without provenance should pass; got: ${JSON.stringify(result.report)}`);
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('small-pilot-provisional without provenance still passes (P4-U8)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-u8-pilot-'));
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
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, true, `small-pilot without provenance should pass; got: ${JSON.stringify(result.report)}`);
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('classroom tier with provenance.gitSha=unknown fails (P4-U8)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-u8-sha-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-production.json');
  const configPath = join(configsDir, '30-learner-beta.json');
  writeFileSync(configPath, JSON.stringify({
    tier: '30-learner-beta-certified',
    thresholds: { max5xx: 0, maxBootstrapP95Ms: 1000, maxCommandP95Ms: 750, maxResponseBytes: 600000 },
  }));
  writeFileSync(evidencePath, JSON.stringify(evidenceWithProvenance(
    { gitSha: 'unknown' },
    {
      summary: {
        ok: true,
        totalRequests: 20,
        startedAt: '2026-04-27T00:00:00Z',
        finishedAt: '2026-04-27T00:00:30Z',
        endpoints: {
          'GET /api/bootstrap': { count: 10, p50WallMs: 100, p95WallMs: 320, maxResponseBytes: 81000, queryCount: 5, d1RowsRead: 42 },
          'POST /api/subjects/grammar/command': { count: 10, p50WallMs: 90, p95WallMs: 180, maxResponseBytes: 5000 },
        },
        signals: {},
        failures: [],
      },
      tier: {
        tier: '30-learner-beta-certified',
        configPath: 'reports/capacity/configs/30-learner-beta.json',
      },
      thresholds: {
        max5xx: { configured: 0, observed: 0, passed: true },
        maxBootstrapP95Ms: { configured: 1000, observed: 320, passed: true },
        maxCommandP95Ms: { configured: 750, observed: 180, passed: true },
        maxResponseBytes: { configured: 600000, observed: 81000, passed: true },
      },
    },
  )));
  writeFileSync(docPath, makeDoc([
    ['2026-04-27', 'abc1234', 'prod', 'Free', '30', '30', '3', '320', '180', '81000', '0', 'none', '30-learner-beta-certified', 'reports/capacity/latest-production.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(
      result.report.some((line) => line.includes('provenance.gitSha')),
      `expected provenance.gitSha failure; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('classroom tier with provenance.dirtyTreeFlag=true fails (P4-U8)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-u8-dirty-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-production.json');
  const configPath = join(configsDir, '30-learner-beta.json');
  writeFileSync(configPath, JSON.stringify({
    tier: '30-learner-beta-certified',
    thresholds: { max5xx: 0, maxBootstrapP95Ms: 1000, maxCommandP95Ms: 750, maxResponseBytes: 600000 },
  }));
  writeFileSync(evidencePath, JSON.stringify(evidenceWithProvenance(
    { dirtyTreeFlag: true },
    {
      summary: {
        ok: true,
        totalRequests: 20,
        startedAt: '2026-04-27T00:00:00Z',
        finishedAt: '2026-04-27T00:00:30Z',
        endpoints: {
          'GET /api/bootstrap': { count: 10, p50WallMs: 100, p95WallMs: 320, maxResponseBytes: 81000, queryCount: 5, d1RowsRead: 42 },
          'POST /api/subjects/grammar/command': { count: 10, p50WallMs: 90, p95WallMs: 180, maxResponseBytes: 5000 },
        },
        signals: {},
        failures: [],
      },
      tier: {
        tier: '30-learner-beta-certified',
        configPath: 'reports/capacity/configs/30-learner-beta.json',
      },
      thresholds: {
        max5xx: { configured: 0, observed: 0, passed: true },
        maxBootstrapP95Ms: { configured: 1000, observed: 320, passed: true },
        maxCommandP95Ms: { configured: 750, observed: 180, passed: true },
        maxResponseBytes: { configured: 600000, observed: 81000, passed: true },
      },
    },
  )));
  writeFileSync(docPath, makeDoc([
    ['2026-04-27', 'abc1234', 'prod', 'Free', '30', '30', '3', '320', '180', '81000', '0', 'none', '30-learner-beta-certified', 'reports/capacity/latest-production.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(
      result.report.some((line) => line.includes('dirtyTreeFlag')),
      `expected dirtyTreeFlag failure; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('thresholdConfigHash mismatch between provenance and committed config fails (P4-U8)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-u8-hash-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, 'small-pilot.json');

  // Write config with specific content.
  const configContent = JSON.stringify({
    tier: 'small-pilot-provisional',
    thresholds: { max5xx: 0, maxBootstrapP95Ms: 1000, maxCommandP95Ms: 750 },
  });
  writeFileSync(configPath, configContent);
  const configHash = createHash('sha256').update(configContent).digest('hex');

  // Evidence claims a DIFFERENT hash (simulates config tampered after run).
  const fakeHash = createHash('sha256').update('something else entirely').digest('hex');
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: {
      commit: 'abc1234567890abcdef1234567890abcdef12345',
      evidenceSchemaVersion: 1,
      learners: 10,
      bootstrapBurst: 10,
      rounds: 1,
      provenance: {
        workflowRunUrl: 'unknown',
        workflowName: 'unknown',
        gitSha: 'abc1234567890abcdef1234567890abcdef12345',
        dirtyTreeFlag: false,
        thresholdConfigHash: fakeHash,
        loadDriverVersion: '0.1.0',
        operator: 'test',
        rawLogArtifactPath: 'none',
      },
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
      result.report.some((line) => line.includes('thresholdConfigHash mismatch')),
      `expected thresholdConfigHash mismatch failure; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('matching thresholdConfigHash passes provenance hash check (P4-U8)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-u8-hashok-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-preview.json');
  const configPath = join(configsDir, 'small-pilot.json');

  const configContent = JSON.stringify({
    tier: 'small-pilot-provisional',
    thresholds: { max5xx: 0, maxBootstrapP95Ms: 1000, maxCommandP95Ms: 750 },
  });
  writeFileSync(configPath, configContent);
  const configHash = createHash('sha256').update(configContent).digest('hex');

  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: {
      commit: 'abc1234567890abcdef1234567890abcdef12345',
      evidenceSchemaVersion: 1,
      learners: 10,
      bootstrapBurst: 10,
      rounds: 1,
      provenance: {
        workflowRunUrl: 'unknown',
        workflowName: 'unknown',
        gitSha: 'abc1234567890abcdef1234567890abcdef12345',
        dirtyTreeFlag: false,
        thresholdConfigHash: configHash,
        loadDriverVersion: '0.1.0',
        operator: 'test',
        rawLogArtifactPath: 'none',
      },
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
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-25', 'abc1234', 'preview', 'Free', '10', '10', '1', '320', '180', '81000', '0', 'none', 'small-pilot-provisional', 'reports/capacity/latest-preview.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, true, `matching hash should pass; got: ${JSON.stringify(result.report)}`);
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('certifiable tier with thresholdConfigHash=unknown and configPath present fails (ADV-002)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-adv002-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-production.json');
  const configPath = join(configsDir, '30-learner-beta.json');
  writeFileSync(configPath, JSON.stringify({
    tier: '30-learner-beta-certified',
    thresholds: { max5xx: 0, maxBootstrapP95Ms: 1000, maxCommandP95Ms: 750, maxResponseBytes: 600000 },
  }));
  // Evidence with provenance that has thresholdConfigHash='unknown' — simulates
  // an attacker hand-editing the hash to bypass tamper detection.
  writeFileSync(evidencePath, JSON.stringify(evidenceWithProvenance(
    { thresholdConfigHash: 'unknown' },
    {
      summary: {
        ok: true,
        totalRequests: 20,
        startedAt: '2026-04-27T00:00:00Z',
        finishedAt: '2026-04-27T00:00:30Z',
        endpoints: {
          'GET /api/bootstrap': { count: 10, p50WallMs: 100, p95WallMs: 320, maxResponseBytes: 81000, queryCount: 5, d1RowsRead: 42 },
          'POST /api/subjects/grammar/command': { count: 10, p50WallMs: 90, p95WallMs: 180, maxResponseBytes: 5000 },
        },
        signals: {},
        failures: [],
      },
      tier: {
        tier: '30-learner-beta-certified',
        configPath: 'reports/capacity/configs/30-learner-beta.json',
      },
      thresholds: {
        max5xx: { configured: 0, observed: 0, passed: true },
        maxBootstrapP95Ms: { configured: 1000, observed: 320, passed: true },
        maxCommandP95Ms: { configured: 750, observed: 180, passed: true },
        maxResponseBytes: { configured: 600000, observed: 81000, passed: true },
      },
    },
  )));
  writeFileSync(docPath, makeDoc([
    ['2026-04-27', 'abc1234', 'prod', 'Free', '30', '30', '3', '320', '180', '81000', '0', 'none', '30-learner-beta-certified', 'reports/capacity/latest-production.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(
      result.report.some((line) => line.includes('thresholdConfigHash is unknown')),
      `expected thresholdConfigHash unknown rejection; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('100-plus-certified without provenance fails (P4-U8 — all certifiable tiers)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-verify-u8-100-'));
  const docPath = join(tempDir, 'capacity.md');
  const evidenceDir = join(tempDir, 'reports', 'capacity');
  const configsDir = join(evidenceDir, 'configs');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(configsDir, { recursive: true });
  const evidencePath = join(evidenceDir, 'latest-production.json');
  const configPath = join(configsDir, '100-plus.json');
  writeFileSync(configPath, JSON.stringify({
    tier: '100-plus-certified',
    thresholds: { max5xx: 0, maxBootstrapP95Ms: 1000, maxCommandP95Ms: 750, maxResponseBytes: 600000 },
  }));
  writeFileSync(evidencePath, JSON.stringify(evidenceEnvelope({
    reportMeta: {
      commit: 'abc1234567890abcdef1234567890abcdef12345',
      evidenceSchemaVersion: 2,
      learners: 100,
      bootstrapBurst: 100,
      rounds: 3,
      // provenance intentionally absent
    },
    summary: {
      ok: true,
      totalRequests: 20,
      startedAt: '2026-04-27T00:00:00Z',
      finishedAt: '2026-04-27T00:00:30Z',
      endpoints: {
        'GET /api/bootstrap': { count: 10, p50WallMs: 100, p95WallMs: 320, maxResponseBytes: 81000, queryCount: 5, d1RowsRead: 42 },
        'POST /api/subjects/grammar/command': { count: 10, p50WallMs: 90, p95WallMs: 180, maxResponseBytes: 5000 },
      },
      signals: {},
      failures: [],
    },
    tier: {
      tier: '100-plus-certified',
      configPath: 'reports/capacity/configs/100-plus.json',
    },
    thresholds: {
      max5xx: { configured: 0, observed: 0, passed: true },
      maxBootstrapP95Ms: { configured: 1000, observed: 320, passed: true },
      maxCommandP95Ms: { configured: 750, observed: 180, passed: true },
      maxResponseBytes: { configured: 600000, observed: 81000, passed: true },
    },
  })));
  writeFileSync(docPath, makeDoc([
    ['2026-04-27', 'abc1234', 'prod', 'Free', '100', '100', '3', '320', '180', '81000', '0', 'none', '100-plus-certified', 'reports/capacity/latest-production.json'],
  ]));
  const cwd = process.cwd();
  try {
    process.chdir(tempDir);
    const result = verifyCapacityDoc(docPath);
    assert.equal(result.ok, false);
    assert.ok(
      result.report.some((line) => line.includes('provenance')),
      `expected provenance failure for 100-plus-certified; got:\n${result.report.join('\n')}`,
    );
  } finally {
    process.chdir(cwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

