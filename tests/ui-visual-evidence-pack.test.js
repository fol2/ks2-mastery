import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyUiRefactorVisualEvidence } from '../scripts/verify-ui-refactor-visual-evidence.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productionManifestPath = path.join(
  rootDir,
  'reports/ui-refactor/ui-refactor-p4-production-visual-evidence-2026-05-01.json',
);

function writeManifest(dir, screenshots) {
  const manifestPath = path.join(dir, 'visual-evidence.json');
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        ok: true,
        origin: 'https://ks2.eugnel.uk',
        screenshots,
      },
      null,
      2,
    ),
  );
  return manifestPath;
}

function createFixtureDir() {
  return mkdtempSync(path.join(tmpdir(), 'ks2-ui-visual-evidence-'));
}

test('visual evidence verifier passes when captured screenshots are present', () => {
  const dir = createFixtureDir();
  mkdirSync(path.join(dir, 'output'), { recursive: true });
  writeFileSync(path.join(dir, 'output/present.png'), 'png');

  const manifestPath = writeManifest(dir, [
    {
      name: 'home',
      status: 'captured',
      path: 'output/present.png',
    },
  ]);

  const result = verifyUiRefactorVisualEvidence(manifestPath, { baseDir: dir });
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test('visual evidence verifier fails when a captured screenshot path is missing', () => {
  const dir = createFixtureDir();
  const manifestPath = writeManifest(dir, [
    {
      name: 'grammar-session',
      status: 'captured',
      path: 'output/missing.png',
    },
  ]);

  const result = verifyUiRefactorVisualEvidence(manifestPath, { baseDir: dir });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    'grammar-session: missing screenshot file output/missing.png',
  ]);
});

test('visual evidence verifier accepts external screenshots with durable evidence links', () => {
  const dir = createFixtureDir();
  const manifestPath = writeManifest(dir, [
    {
      name: 'admin-visual-engine',
      status: 'external',
      externalUrl: 'https://evidence.example/admin-visual-engine.png',
      reason: 'Stored in a durable external review evidence pack.',
    },
  ]);

  const result = verifyUiRefactorVisualEvidence(manifestPath, { baseDir: dir });
  assert.equal(result.ok, true);
});

test('visual evidence verifier accepts omitted screenshots only with durable reasons', () => {
  const dir = createFixtureDir();
  const manifestPath = writeManifest(dir, [
    {
      name: 'spelling-summary',
      status: 'omitted',
      reason: 'Lean ZIP did not include this screenshot, so no bundled-image claim is made.',
    },
    {
      name: 'punctuation-summary',
      status: 'omitted',
      reason: '',
    },
  ]);

  const result = verifyUiRefactorVisualEvidence(manifestPath, { baseDir: dir });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    'punctuation-summary: omitted screenshot entries require a durable reason',
  ]);
});

test('committed UI refactor production visual pack contains captured screenshots only', () => {
  const manifest = JSON.parse(readFileSync(productionManifestPath, 'utf8'));
  const screenshots = Array.isArray(manifest.screenshots) ? manifest.screenshots : [];

  assert.equal(screenshots.length, 12);

  for (const entry of screenshots) {
    assert.equal(entry.status, 'captured', `${entry.name} must be captured`);
    assert.equal(entry.reason, undefined, `${entry.name} must not carry an omitted reason`);
    assert.ok(entry.path, `${entry.name} must have a screenshot path`);
    assert.ok(existsSync(path.join(rootDir, entry.path)), `${entry.name} file must exist`);
  }

  const result = verifyUiRefactorVisualEvidence(productionManifestPath);
  assert.equal(result.ok, true);
});
