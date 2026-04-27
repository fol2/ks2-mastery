// Drift-guard test for U2 — ensures Star constants are defined in exactly
// one place: shared/grammar/grammar-stars.js.
//
// Plan: docs/plans/2026-04-27-001-feat-grammar-phase5-star-curve-landing-plan.md (U2).
//
// Pattern: grep test asserting no other file defines GRAMMAR_MONSTER_STAR_MAX
// or GRAMMAR_STAR_STAGE_THRESHOLDS. Mirrors the confidence.js drift-guard
// approach from Phase 4 U8.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// CORR-002: Detect whether ripgrep is available. If not, drift-guard tests
// must skip rather than silently passing with empty results.
let rgAvailable = false;
try {
  const canaryCmd = `rg --files-with-matches "GRAMMAR_MONSTER_STAR_MAX" --glob="*.js" --glob="!node_modules/**" --glob="!.git/**" "${rootDir}" 2>/dev/null`;
  const canaryOut = execSync(canaryCmd, { encoding: 'utf8', timeout: 15000 });
  // Expect at least 1 match (the canonical file itself).
  rgAvailable = canaryOut.trim().split('\n').filter(Boolean).length >= 1;
} catch {
  rgAvailable = false;
}

// Helper: grep for a pattern in all JS files, excluding the canonical source
// and the mastery re-export shim. Returns matching file paths.
function grepForConstant(pattern, excludeFiles = []) {
  const excludeArgs = excludeFiles
    .map((f) => `--glob=!${f}`)
    .join(' ');
  const cmd = `rg --files-with-matches "${pattern}" --glob="*.js" --glob="!node_modules/**" --glob="!.git/**" ${excludeArgs} "${rootDir}" 2>/dev/null || true`;
  const stdout = execSync(cmd, { encoding: 'utf8', timeout: 15000 });
  return stdout.trim().split('\n').filter(Boolean);
}

// Normalise Windows paths for comparison.
function normalisePath(p) {
  return p.replace(/\\/g, '/');
}

// Allowed files: the canonical source and the thin re-export.
const ALLOWED_DEFINITION_FILES = new Set([
  'shared/grammar/grammar-stars.js',
  'src/platform/game/mastery/grammar-stars.js',
].map((f) => normalisePath(resolve(rootDir, f))));

function isAllowedFile(filePath) {
  const normalised = normalisePath(filePath);
  for (const allowed of ALLOWED_DEFINITION_FILES) {
    if (normalised === allowed) return true;
  }
  return false;
}

// Allowed test files — test files that import and assert on the constants
// are fine; they do not *define* the constant.
function isTestFile(filePath) {
  const normalised = normalisePath(filePath);
  return normalised.includes('/tests/') || normalised.includes('/test/');
}

// CORR-002: Canary — verify rg can find the canonical file. If rg is
// unavailable, this test skips and documents why.
test('star drift guard: canary — ripgrep available and finds canonical file', { skip: !rgAvailable && 'ripgrep (rg) not installed — drift-guard tests cannot run' }, () => {
  const matches = grepForConstant('GRAMMAR_MONSTER_STAR_MAX');
  assert.ok(
    matches.length >= 1,
    'Canary failed: rg must find at least 1 file containing GRAMMAR_MONSTER_STAR_MAX',
  );
});

test('star drift guard: GRAMMAR_MONSTER_STAR_MAX defined only in canonical source', { skip: !rgAvailable && 'ripgrep (rg) not installed' }, () => {
  const matches = grepForConstant('GRAMMAR_MONSTER_STAR_MAX\\s*=');
  const violations = matches
    .filter((f) => !isAllowedFile(f))
    .filter((f) => !isTestFile(f));
  assert.deepEqual(
    violations,
    [],
    `GRAMMAR_MONSTER_STAR_MAX must be defined only in shared/grammar/grammar-stars.js ` +
    `(and optionally re-exported). Found extra definitions in: ${violations.join(', ')}`,
  );
});

test('star drift guard: GRAMMAR_STAR_STAGE_THRESHOLDS defined only in canonical source', { skip: !rgAvailable && 'ripgrep (rg) not installed' }, () => {
  const matches = grepForConstant('GRAMMAR_STAR_STAGE_THRESHOLDS\\s*=');
  const violations = matches
    .filter((f) => !isAllowedFile(f))
    .filter((f) => !isTestFile(f));
  assert.deepEqual(
    violations,
    [],
    `GRAMMAR_STAR_STAGE_THRESHOLDS must be defined only in shared/grammar/grammar-stars.js ` +
    `(and optionally re-exported). Found extra definitions in: ${violations.join(', ')}`,
  );
});

test('star drift guard: GRAMMAR_CONCEPT_STAR_WEIGHTS defined only in canonical source', { skip: !rgAvailable && 'ripgrep (rg) not installed' }, () => {
  const matches = grepForConstant('GRAMMAR_CONCEPT_STAR_WEIGHTS\\s*=');
  const violations = matches
    .filter((f) => !isAllowedFile(f))
    .filter((f) => !isTestFile(f));
  assert.deepEqual(
    violations,
    [],
    `GRAMMAR_CONCEPT_STAR_WEIGHTS must be defined only in shared/grammar/grammar-stars.js ` +
    `(and optionally re-exported). Found extra definitions in: ${violations.join(', ')}`,
  );
});
