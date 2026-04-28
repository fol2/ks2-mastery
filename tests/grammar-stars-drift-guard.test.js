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

import {
  GRAMMAR_MONSTER_CONCEPTS,
  GRAMMAR_AGGREGATE_CONCEPTS,
} from '../shared/grammar/grammar-concept-roster.js';
import {
  GRAMMAR_STAR_STAGE_THRESHOLDS,
  GRAMMAR_CONCEPT_STAR_WEIGHTS,
} from '../shared/grammar/grammar-stars.js';
import {
  GRAMMAR_REWARD_RELEASE_ID,
} from '../src/platform/game/mastery/grammar.js';

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

// ---------------------------------------------------------------------------
// P7 drift guards — value-level pins for the Grammar reward contract
// ---------------------------------------------------------------------------

test('P7 drift guard: active Grammar monster roster is 3 direct + Concordium', () => {
  assert.deepEqual(
    Object.keys(GRAMMAR_MONSTER_CONCEPTS).sort(),
    ['bracehart', 'chronalyx', 'couronnail'],
  );
  assert.equal(GRAMMAR_AGGREGATE_CONCEPTS.length, 18);
});

test('P7 drift guard: shared/grammar/grammar-stars.js has zero src/ imports', async () => {
  const { readFile } = await import('node:fs/promises');
  const content = await readFile(
    new URL('../shared/grammar/grammar-stars.js', import.meta.url),
    'utf8',
  );
  const srcImports = content.match(/from\s+['"][^'"]*src\//g);
  assert.equal(srcImports, null);
});

test('P7 drift guard: Star thresholds unchanged', () => {
  assert.deepEqual(GRAMMAR_STAR_STAGE_THRESHOLDS, {
    egg: 1,
    hatch: 15,
    evolve2: 35,
    evolve3: 65,
    mega: 100,
  });
});

test('P7 drift guard: Star weights unchanged', () => {
  assert.deepEqual(GRAMMAR_CONCEPT_STAR_WEIGHTS, {
    firstIndependentWin: 0.05,
    repeatIndependentWin: 0.10,
    variedPractice: 0.10,
    secureConfidence: 0.15,
    retainedAfterSecure: 0.60,
  });
});

test('P7 drift guard: GRAMMAR_REWARD_RELEASE_ID unchanged', () => {
  assert.equal(GRAMMAR_REWARD_RELEASE_ID, 'grammar-legacy-reviewed-2026-04-24');
});

test('P7 drift guard: concept-to-monster mapping covers all 18 aggregate concepts', () => {
  for (const conceptId of GRAMMAR_AGGREGATE_CONCEPTS) {
    assert.ok(typeof conceptId === 'string' && conceptId.length > 0);
  }
  // Direct monster concepts now cover all 18 aggregate concepts. The
  // punctuation-for-grammar bridge concepts still contribute to Concordium,
  // but they also have direct owners for child-facing progress.
  const directCount = Object.values(GRAMMAR_MONSTER_CONCEPTS).reduce(
    (sum, ids) => sum + ids.length,
    0,
  );
  assert.equal(directCount, 18);
});
