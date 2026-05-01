/**
 * Grammar QG P13 — runtime certification authority.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';
import {
  CERTIFICATION_STATUS_MAP,
  GRAMMAR_RUNTIME_CERTIFICATION_RELEASE_ID,
  GRAMMAR_RUNTIME_CERTIFICATION_STATUS_COUNTS,
  GRAMMAR_RUNTIME_CERTIFICATION_TEMPLATE_COUNT,
  getTemplateCertificationStatus,
  isTemplateBlocked,
} from '../worker/src/subjects/grammar/certification-status.js';
import {
  buildGeneratedSource,
  buildRuntimeCertificationStatus,
} from '../scripts/generate-grammar-qg-runtime-certification-status.mjs';
import {
  validateManifestExpectedOutputPaths,
  validateNoLegacyRuntimeAuthorityReferences,
  validateRuntimeCertificationAuthority,
} from '../scripts/validate-grammar-qg-certification-evidence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const STATUS_MAP_PATH = path.resolve(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p14-certification-status-map.json');
const GENERATED_PATH = path.resolve(ROOT_DIR, 'worker', 'src', 'subjects', 'grammar', 'certification-status.generated.js');
const MANIFEST_PATH = path.resolve(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p14-certification-manifest.json');

const statusMap = JSON.parse(fs.readFileSync(STATUS_MAP_PATH, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

function cloneStatusMap(overrides = {}) {
  return {
    ...structuredClone(statusMap),
    ...overrides,
  };
}

describe('P13 runtime certification source', () => {
  it('uses the active P14 content release', () => {
    assert.equal(GRAMMAR_CONTENT_RELEASE_ID, 'grammar-qg-p14-2026-05-01');
    assert.equal(GRAMMAR_RUNTIME_CERTIFICATION_RELEASE_ID, GRAMMAR_CONTENT_RELEASE_ID);
  });

  it('contains exactly one runtime entry for each current template', () => {
    assert.equal(GRAMMAR_RUNTIME_CERTIFICATION_TEMPLATE_COUNT, 110);
    assert.equal(Object.keys(CERTIFICATION_STATUS_MAP).length, GRAMMAR_TEMPLATE_METADATA.length);
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      assert.ok(CERTIFICATION_STATUS_MAP[template.id], `Missing runtime status entry: ${template.id}`);
    }
  });

  it('preserves approved_with_limitation diagnostics instead of flattening them', () => {
    assert.deepEqual(GRAMMAR_RUNTIME_CERTIFICATION_STATUS_COUNTS, {
      approved: 106,
      approved_with_limitation: 4,
    });

    const limitedIds = Object.entries(CERTIFICATION_STATUS_MAP)
      .filter(([, entry]) => entry.status === 'approved_with_limitation')
      .map(([templateId]) => templateId)
      .sort();
    assert.equal(limitedIds.length, 4);
    for (const templateId of limitedIds) {
      assert.equal(getTemplateCertificationStatus(templateId).status, 'approved_with_limitation');
      assert.equal(isTemplateBlocked(templateId), false);
    }
  });

  it('fails closed for invalid or unknown template IDs', () => {
    assert.equal(isTemplateBlocked('__unknown_new_template__'), true);
    assert.equal(isTemplateBlocked(''), true);
    assert.equal(isTemplateBlocked(undefined), true);
    assert.equal(isTemplateBlocked(null), true);
  });

  it('has no active P10 or dynamic Node runtime authority references', () => {
    const result = validateNoLegacyRuntimeAuthorityReferences({ rootDir: ROOT_DIR });
    assert.equal(result.pass, true, JSON.stringify(result.mismatches, null, 2));
  });
});

describe('P13 runtime certification generator', () => {
  it('committed generated source is byte-for-byte fresh', () => {
    const expectedRuntime = buildRuntimeCertificationStatus(statusMap, { statusMapPath: STATUS_MAP_PATH });
    const expectedSource = buildGeneratedSource(expectedRuntime);
    const committedSource = fs.readFileSync(GENERATED_PATH, 'utf8');
    assert.equal(committedSource, expectedSource);
  });

  it('rejects a missing current metadata template', () => {
    const firstTemplateId = GRAMMAR_TEMPLATE_METADATA[0].id;
    const brokenStatusMap = cloneStatusMap({
      entries: statusMap.entries.filter((entry) => entry.templateId !== firstTemplateId),
    });

    assert.throws(
      () => buildRuntimeCertificationStatus(brokenStatusMap, { statusMapPath: STATUS_MAP_PATH }),
      /missing from status map/,
    );
  });

  it('rejects unknown active entries', () => {
    const brokenStatusMap = cloneStatusMap({
      entries: [
        ...statusMap.entries,
        {
          templateId: '__future_template_without_metadata__',
          decision: 'approved',
          severity: 'none',
          evidence: ['oracle'],
        },
      ],
    });

    assert.throws(
      () => buildRuntimeCertificationStatus(brokenStatusMap, { statusMapPath: STATUS_MAP_PATH }),
      /unknown active template IDs/,
    );
  });

  it('allows explicitly retired historical entries but excludes them from runtime scheduling', () => {
    const historicalStatusMap = cloneStatusMap({
      entries: [
        ...statusMap.entries,
        {
          templateId: '__historical_retired_template__',
          decision: 'retire_candidate',
          severity: 'none',
          evidence: ['historical-release'],
          retired: true,
        },
      ],
    });

    const runtimeStatus = buildRuntimeCertificationStatus(historicalStatusMap, { statusMapPath: STATUS_MAP_PATH });
    assert.equal(runtimeStatus.templateCount, 110);
    assert.equal('__historical_retired_template__' in runtimeStatus.entries, false);
  });
});

describe('P13 validator runtime authority gate', () => {
  it('passes against the committed P14 manifest and runtime source', () => {
    const result = validateRuntimeCertificationAuthority(manifest, { rootDir: ROOT_DIR });
    assert.equal(result.pass, true, JSON.stringify(result.mismatches, null, 2));
  });

  it('fails clearly when manifest expectedOutputPaths names a missing file', () => {
    const brokenManifest = {
      ...manifest,
      expectedOutputPaths: ['reports/grammar/__missing-p13-output.json'],
    };

    const result = validateManifestExpectedOutputPaths(brokenManifest, { rootDir: ROOT_DIR });
    assert.equal(result.pass, false);
    assert.match(result.mismatches[0].message, /does not exist/);
  });
});
