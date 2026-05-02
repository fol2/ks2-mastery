import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { verifyUiRefactorVisualEvidence } from '../scripts/verify-ui-refactor-visual-evidence.mjs';

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
