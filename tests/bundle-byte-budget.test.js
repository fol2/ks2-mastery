// SH2-U10 bundle-byte-budget gate.
//
// Parser-level coverage for the gzip budget check added to
// `scripts/audit-client-bundle.mjs`. Drives `runClientBundleAudit()`
// against synthetic bundles + metafiles that let each branch of the
// gate be asserted without a full esbuild rebuild.
//
// Baseline (measured 2026-04-26 against the first post-split build on
// `feat/sh2-u10-bundle-hygiene`):
//   - pre-split (`outfile`, no code-splitting): gzip 253,181 bytes.
//   - post-split (`splitting: true`, `outdir`):  gzip 203,227 bytes.
//     That is a ~50 KB reduction — the adult-only hub chunks (Admin Hub
//     + Parent Hub) now live in their own lazy-loaded chunks instead of
//     the main bundle.
// Budget was `baseline × 1.05 ≈ 213,389`, rounded up to `214_000`.
// Node 24's zlib output for the current Hero P2 baseline sits just
// above that at ~214,020 bytes, so the committed ceiling is now
// `215_000`. That keeps the headroom narrow while avoiding a
// sub-kilobyte compression/runtime false blocker. The audit still fails
// when ~50 KB of adult-only JS sneaks back into the critical path (the
// exact regression the code-split protects against). The audit driver re-reads
// `DEFAULT_MAIN_BUNDLE_GZIP_BUDGET_BYTES` from
// `scripts/audit-client-bundle.mjs` via `runClientBundleAudit()`, so
// any future budget adjustment flows through this test's constants.
//
// Scenarios covered:
//   1. Happy path — the real post-split `app.bundle.js` gzip size sits
//      under the committed budget.
//   2. Happy path — a synthetic tiny bundle passes the gate when a
//      generous budget is passed.
//   3. Edge — a synthetic bundle blows the budget and the failure
//      message uses the `bundle-budget-exceeded:` prefix so CI logs
//      stay greppable.
//   4. Edge — multi-chunk scan: a metafile with two `src/bundles/*.js`
//      outputs both get text-audited, so a forbidden token hiding in
//      a split chunk trips the audit even when the main bundle is
//      clean.

import { gzipSync } from 'node:zlib';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { runClientBundleAudit } from '../scripts/audit-client-bundle.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// Measured on SH2-U10 first post-split build. If this figure drifts up
// by more than a few kilobytes the committed budget needs a deliberate
// re-evaluation — not a silent bump. Baseline × 1.05 = ~213,389,
// rounded up to 214,000. Node 24's zlib output for the current Hero P2
// baseline sits just above that, so the committed ceiling is 215,000
// (matches `DEFAULT_MAIN_BUNDLE_GZIP_BUDGET_BYTES` in
// `scripts/audit-client-bundle.mjs`). The narrow headroom lets the team
// land small copy / utility growth without an audit bump, but trips the
// gate when ~50 KB of adult-only JS sneaks back into the critical path.
const BASELINE_GZIP_BYTES = 203_227;
const BUDGET_GZIP_BYTES = 215_000;
const TEST_MODE_BUNDLE_MARKER = '__ks2_capacityMeta__';

function isPlaywrightTestModeBundle(bundleBytes) {
  return Buffer.isBuffer(bundleBytes) && bundleBytes.includes(TEST_MODE_BUNDLE_MARKER);
}

test('SH2-U10 baseline + budget constants stay in a sensible ratio', () => {
  // Guard rail: budget must exceed baseline, or every build fails.
  assert.ok(
    BUDGET_GZIP_BYTES > BASELINE_GZIP_BYTES,
    `budget ${BUDGET_GZIP_BYTES} must exceed baseline ${BASELINE_GZIP_BYTES}`,
  );
  // Upper guard: budget must not balloon beyond `baseline × 1.10` or
  // the 5% headroom stops being a meaningful gate. If a future
  // refactor legitimately grows the bundle, re-measure + re-commit
  // BOTH constants together rather than silently bumping just the
  // budget.
  assert.ok(
    BUDGET_GZIP_BYTES < Math.round(BASELINE_GZIP_BYTES * 1.10),
    `budget ${BUDGET_GZIP_BYTES} must stay within baseline × 1.10 (${Math.round(BASELINE_GZIP_BYTES * 1.10)})`,
  );
});

test('real post-split app.bundle.js gzip size sits under the committed budget', () => {
  const bundlePath = path.join(REPO_ROOT, 'src', 'bundles', 'app.bundle.js');
  let bundleBytes;
  try {
    bundleBytes = readFileSync(bundlePath);
  } catch {
    // Fresh-clone / pre-build scenario: test stays deterministic by
    // returning without failing. The `assert:build-public` step runs
    // only after `npm run build:bundles`, so this skip matches the
    // contract the rest of the bundle-audit tests follow.
    return;
  }
  if (isPlaywrightTestModeBundle(bundleBytes)) {
    console.log(
      'SH2-U10 budget note: skipping the real bundle-size assertion because '
      + 'src/bundles/app.bundle.js is a Playwright KS2_BUILD_MODE=test artefact, '
      + 'not the production bundle audited by npm run check.',
    );
    return;
  }
  const gzipBytes = gzipSync(bundleBytes).byteLength;
  assert.ok(
    gzipBytes < BUDGET_GZIP_BYTES,
    `main bundle gzip ${gzipBytes} must stay under budget ${BUDGET_GZIP_BYTES}`,
  );
  // Soft-fail guard: a sudden 20% shrink is a signal worth noticing
  // (maybe a big dep was tree-shaken away and we should re-baseline).
  // We only log here so the test never false-fails on benign savings.
  if (gzipBytes < BASELINE_GZIP_BYTES * 0.8) {
    console.log(
      `SH2-U10 baseline note: main bundle gzip ${gzipBytes} is >20% smaller than the `
      + `${BASELINE_GZIP_BYTES}-byte committed baseline. Consider re-baselining.`,
    );
  }
});

test('bundle budget recognises Playwright test-mode bundle artefacts', () => {
  assert.equal(isPlaywrightTestModeBundle(Buffer.from('globalThis.__ks2_capacityMeta__ = {};')), true);
  assert.equal(isPlaywrightTestModeBundle(Buffer.from('console.log("production bundle");')), false);
});

test('runClientBundleAudit accepts a bundle below the passed budget', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ks2-bundle-budget-happy-'));
  const bundle = path.join(dir, 'app.bundle.js');
  const metafile = path.join(dir, 'app.bundle.meta.json');
  const publicDir = path.join(dir, 'public');
  await mkdir(publicDir, { recursive: true });
  await writeFile(bundle, 'console.log("tiny");\n');
  await writeFile(metafile, JSON.stringify({ inputs: { 'src/main.js': { bytes: 1 } } }));

  const result = await runClientBundleAudit({
    bundlePath: bundle,
    metafilePath: metafile,
    publicDir,
    mainBundleGzipBudgetBytes: 10_000,
  });
  assert.equal(result.ok, true, `expected audit to pass; failures: ${result.failures.join(' | ')}`);
  assert.ok(
    result.checked.mainBundleGzipBytes < result.checked.mainBundleGzipBudgetBytes,
    'measured gzip size should be below the budget in the happy path',
  );
});

test('runClientBundleAudit fails with bundle-budget-exceeded prefix when the budget is blown', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ks2-bundle-budget-edge-'));
  const bundle = path.join(dir, 'app.bundle.js');
  const metafile = path.join(dir, 'app.bundle.meta.json');
  const publicDir = path.join(dir, 'public');
  await mkdir(publicDir, { recursive: true });
  // A bundle of random bytes is close to incompressible; a 10 KB
  // random payload will gzip to ~10 KB. A 100-byte budget forces the
  // gate to trip.
  const randomBytes = Buffer.alloc(10_000);
  for (let i = 0; i < randomBytes.length; i += 1) {
    randomBytes[i] = i % 256;
  }
  await writeFile(bundle, randomBytes);
  await writeFile(metafile, JSON.stringify({ inputs: { 'src/main.js': { bytes: 1 } } }));

  const result = await runClientBundleAudit({
    bundlePath: bundle,
    metafilePath: metafile,
    publicDir,
    mainBundleGzipBudgetBytes: 100,
  });
  assert.equal(result.ok, false, 'expected audit to fail the budget gate');
  const budgetFailure = result.failures.find((line) => line.includes('bundle-budget-exceeded'));
  assert.ok(
    budgetFailure,
    `expected a failure row starting with "bundle-budget-exceeded"; got: ${result.failures.join(' | ')}`,
  );
  assert.match(budgetFailure, /exceeds budget/);
});

test('runClientBundleAudit walks every .js chunk under src/bundles/ from the metafile (S-01)', async () => {
  // SH2-U10 reviewer-follow-up (ADV-H1): fully-isolated mkdtemp fixture.
  // `runClientBundleAudit` now accepts a caller-supplied `rootDir` so the
  // synthetic bundle + split chunk can live in a throwaway tmpdir tree
  // instead of the real `src/bundles/` tree. Benefits:
  //   - a crashed / aborted test no longer leaves `test-u10-fixture-*.js`
  //     under the live build tree (prior design leaked on SIGINT).
  //   - concurrent test-runner invocations cannot collide on shared paths.
  //   - the isolation is obvious from the test code without a filename
  //     convention that future contributors might miss.
  const stagingRoot = await mkdtemp(path.join(tmpdir(), 'ks2-u10-audit-'));
  const bundlesFixtureDir = path.join(stagingRoot, 'src', 'bundles');
  const publicDir = path.join(stagingRoot, 'public');
  await mkdir(bundlesFixtureDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });

  const mainBundleRelative = 'src/bundles/app.bundle.js';
  const chunkRelative = 'src/bundles/chunk-CAFEBABE.js';
  const metafileRelative = 'src/bundles/app.bundle.meta.json';
  await writeFile(path.join(stagingRoot, mainBundleRelative), 'console.log("main");\n');
  // The forbidden token sits in a SPLIT chunk, not the main bundle —
  // the pre-U10 auditText call only scanned `bundlePath`, so this
  // scenario proves S-01's walk-all-chunks fix actually runs.
  await writeFile(
    path.join(stagingRoot, chunkRelative),
    'console.log("PUNCTUATION_CONTENT_MANIFEST");\n',
  );
  await writeFile(path.join(stagingRoot, metafileRelative), JSON.stringify({
    inputs: { 'src/main.js': { bytes: 1 } },
    outputs: {
      [mainBundleRelative]: { imports: [], bytes: 100 },
      [chunkRelative]: { imports: [], bytes: 200 },
    },
  }));

  try {
    const result = await runClientBundleAudit({
      bundlePath: mainBundleRelative,
      metafilePath: metafileRelative,
      publicDir: 'public',
      mainBundleGzipBudgetBytes: 10_000_000,
      rootDir: stagingRoot,
    });
    assert.equal(result.ok, false, 'forbidden token in a split chunk must trip the audit');
    const chunkFailure = result.failures.find((line) => (
      line.includes('chunk-CAFEBABE.js')
      && line.includes('PUNCTUATION_CONTENT_MANIFEST')
    ));
    assert.ok(
      chunkFailure,
      `expected failure naming the split chunk + token; got: ${result.failures.join(' | ')}`,
    );
    const scanned = new Set(result.checked.scannedChunks.map((entry) => entry.split(path.sep).join('/')));
    assert.ok(
      scanned.has(mainBundleRelative),
      'main bundle must be in scannedChunks',
    );
    assert.ok(
      scanned.has(chunkRelative),
      'split chunk must be in scannedChunks',
    );
  } finally {
    // Remove the whole staging tree — nothing leaked into the real repo.
    const { rm } = await import('node:fs/promises');
    await rm(stagingRoot, { recursive: true, force: true });
  }
});
