// Tests for U1 — Grammar QG P12 manifest contract shape.
//
// Plan: docs/plans/2026-04-30-grammar-qg-p12-delivery-plan.md (U1).
//
// Verifies that the P12 certification manifest generator outputs all
// required fields: artefacts map, certificationPhase, seedWindowPerEvidenceType
// (including semantic-prompt-cue-audit), and postDeployRequiredForPostDeployCertification.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.resolve(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p11-certification-manifest.json');
const GENERATOR_SCRIPT = path.resolve(ROOT_DIR, 'scripts', 'generate-grammar-qg-certification-manifest.mjs');

describe('Grammar QG P12 manifest shape', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  it('has all required top-level fields', () => {
    const requiredFields = [
      'contentReleaseId',
      'certificationPhase',
      'templateDenominator',
      'seedWindow',
      'seedWindowPerEvidenceType',
      'expectedItemCount',
      'expectedOutputPaths',
      'artefacts',
      'generatorScript',
      'generatorScriptHash',
      'generationCommand',
      'generatedAt',
      'answerInternalsIncluded',
      'answerInternalsRedacted',
      'postDeployRequiredForPostDeployCertification',
    ];
    for (const field of requiredFields) {
      assert.ok(field in manifest, `Missing required field: ${field}`);
    }
  });

  it('artefacts map contains all 8 required keys', () => {
    const requiredKeys = [
      'renderInventory',
      'renderInventoryRedacted',
      'qualityRegister',
      'distractorAudit',
      'markingMatrix',
      'certificationStatusMap',
      'semanticAuditScript',
      'productionSmoke',
    ];
    assert.equal(Object.keys(manifest.artefacts).length, 8);
    for (const key of requiredKeys) {
      assert.ok(key in manifest.artefacts, `Missing artefact key: ${key}`);
      assert.equal(typeof manifest.artefacts[key], 'string');
    }
  });

  it('seedWindowPerEvidenceType contains semantic-prompt-cue-audit with range 1..30', () => {
    assert.equal(manifest.seedWindowPerEvidenceType['semantic-prompt-cue-audit'], '1..30');
  });

  it('certificationPhase equals grammar-qg-p12', () => {
    assert.equal(manifest.certificationPhase, 'grammar-qg-p12');
  });

  it('contentReleaseId equals grammar-qg-p11-2026-04-30', () => {
    assert.equal(manifest.contentReleaseId, 'grammar-qg-p11-2026-04-30');
  });

  it('postDeployRequiredForPostDeployCertification is true', () => {
    assert.equal(manifest.postDeployRequiredForPostDeployCertification, true);
  });

  it('--phase CLI arg overrides default certificationPhase', () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'grammar-qg-manifest-'));
    try {
      execSync(`node "${GENERATOR_SCRIPT}" --phase=grammar-qg-p99 --output-dir="${tmpDir}"`, { cwd: ROOT_DIR });

      // The manifest filename is derived from content release, not the phase override.
      const generatedPath = path.join(tmpDir, 'grammar-qg-p11-certification-manifest.json');
      const regenManifest = JSON.parse(fs.readFileSync(generatedPath, 'utf8'));
      assert.equal(regenManifest.certificationPhase, 'grammar-qg-p99');

      execSync(`node "${GENERATOR_SCRIPT}" --phase=grammar-qg-p12 --output-dir="${tmpDir}"`, { cwd: ROOT_DIR });
      const restored = JSON.parse(fs.readFileSync(generatedPath, 'utf8'));
      assert.equal(restored.certificationPhase, 'grammar-qg-p12');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
