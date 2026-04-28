// U9 (Admin Console P6): characterisation test suite for admin-asset-registry.
//
// Purpose: pin the current behaviour of the pure asset registry adapter so
// that subsequent refactoring or P6 units are regression-safe. Tests exercise
// the exported functions directly without needing DOM or SSR harness since the
// module is a pure logic leaf.
//
// Scenarios:
//   1. buildMonsterVisualRegistryEntry — full valid config (draft + published)
//   2. buildMonsterVisualRegistryEntry — null/undefined config
//   3. buildMonsterVisualRegistryEntry — partial config (missing status)
//   4. buildMonsterVisualRegistryEntry — validation ok:true => publishable
//   5. buildMonsterVisualRegistryEntry — validation ok:false with errors => has-blockers
//   6. buildMonsterVisualRegistryEntry — validation ok:false without errors => clean
//   7. buildMonsterVisualRegistryEntry — validation missing ok key => unknown
//   8. buildMonsterVisualRegistryEntry — permissions canManage true/false
//   9. buildMonsterVisualRegistryEntry — versions array passthrough
//  10. buildAssetRegistry — full model produces single-entry array
//  11. buildAssetRegistry — null model returns safe defaults
//  12. buildAssetRegistry — empty model returns safe defaults
//  13. buildAssetRegistry — model with no monsterVisualConfig key

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAssetRegistry,
  buildMonsterVisualRegistryEntry,
} from '../src/platform/hubs/admin-asset-registry.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FULL_MONSTER_VISUAL_CONFIG = {
  status: {
    draftRevision: 7,
    publishedVersion: 3,
    manifestHash: 'abc123def456',
    publishedAt: 1714300800000,
    publishedByAccountId: 'account-admin-42',
    validation: {
      ok: true,
      errorCount: 0,
      warningCount: 2,
      errors: [],
      warnings: ['Minor spacing issue', 'Deprecated colour name'],
    },
  },
  permissions: {
    canManageMonsterVisualConfig: true,
  },
  draft: { monsters: [{ id: 'blob' }] },
  published: { monsters: [{ id: 'blob' }] },
  versions: [
    { version: 3, publishedAt: 1714300800000 },
    { version: 2, publishedAt: 1714214400000 },
  ],
};

const BLOCKER_VALIDATION_CONFIG = {
  status: {
    draftRevision: 2,
    publishedVersion: 1,
    manifestHash: 'deadbeef',
    publishedAt: 1714000000000,
    publishedByAccountId: 'account-ops-1',
    validation: {
      ok: false,
      errorCount: 3,
      warningCount: 1,
      errors: ['Missing sprite', 'Invalid frame count', 'Duplicate ID'],
      warnings: ['Deprecated field'],
    },
  },
  permissions: { canManageMonsterVisualConfig: false },
  draft: { monsters: [] },
  published: { monsters: [] },
  versions: [{ version: 1, publishedAt: 1714000000000 }],
};

const CLEAN_VALIDATION_CONFIG = {
  status: {
    draftRevision: 1,
    publishedVersion: 0,
    manifestHash: '',
    validation: {
      ok: false,
      errorCount: 0,
      warningCount: 0,
      errors: [],
      warnings: [],
    },
  },
  permissions: {},
  draft: { monsters: [] },
  versions: [],
};

// ─── buildMonsterVisualRegistryEntry ─────────────────────────────────────────

describe('buildMonsterVisualRegistryEntry', () => {
  it('produces a complete registry entry from full config', () => {
    const entry = buildMonsterVisualRegistryEntry(FULL_MONSTER_VISUAL_CONFIG);

    assert.equal(entry.assetId, 'monster-visual-config');
    assert.equal(entry.category, 'visual');
    assert.equal(entry.displayName, 'Monster Visual & Effect Config');
    assert.equal(entry.draftVersion, 7);
    assert.equal(entry.publishedVersion, 3);
    assert.equal(entry.manifestHash, 'abc123def456');
    assert.equal(entry.reviewStatus, 'publishable');
    assert.equal(entry.lastPublishedAt, 1714300800000);
    assert.equal(entry.lastPublishedBy, 'account-admin-42');
    assert.equal(entry.canManage, true);
    assert.equal(entry.hasDraft, true);
    assert.equal(entry.hasPublished, true);
  });

  it('includes validationState with correct shape', () => {
    const entry = buildMonsterVisualRegistryEntry(FULL_MONSTER_VISUAL_CONFIG);

    assert.equal(entry.validationState.ok, true);
    assert.equal(entry.validationState.errorCount, 0);
    assert.equal(entry.validationState.warningCount, 2);
    assert.deepEqual(entry.validationState.errors, []);
    assert.deepEqual(entry.validationState.warnings, ['Minor spacing issue', 'Deprecated colour name']);
  });

  it('passes through versions array', () => {
    const entry = buildMonsterVisualRegistryEntry(FULL_MONSTER_VISUAL_CONFIG);

    assert.equal(entry.versions.length, 2);
    assert.equal(entry.versions[0].version, 3);
    assert.equal(entry.versions[1].version, 2);
  });

  it('returns safe defaults for null input', () => {
    const entry = buildMonsterVisualRegistryEntry(null);

    assert.equal(entry.assetId, 'monster-visual-config');
    assert.equal(entry.category, 'visual');
    assert.equal(entry.displayName, 'Monster Visual & Effect Config');
    assert.equal(entry.draftVersion, 0);
    assert.equal(entry.publishedVersion, 0);
    assert.equal(entry.manifestHash, '');
    assert.equal(entry.reviewStatus, 'unknown');
    assert.equal(entry.lastPublishedAt, 0);
    assert.equal(entry.lastPublishedBy, '');
    assert.equal(entry.canManage, false);
    assert.equal(entry.hasDraft, false);
    assert.equal(entry.hasPublished, false);
    assert.deepEqual(entry.versions, []);
  });

  it('returns safe defaults for undefined input', () => {
    const entry = buildMonsterVisualRegistryEntry(undefined);

    assert.equal(entry.draftVersion, 0);
    assert.equal(entry.publishedVersion, 0);
    assert.equal(entry.reviewStatus, 'unknown');
    assert.equal(entry.canManage, false);
  });

  it('handles config with missing status object', () => {
    const entry = buildMonsterVisualRegistryEntry({ permissions: { canManageMonsterVisualConfig: true } });

    assert.equal(entry.draftVersion, 0);
    assert.equal(entry.publishedVersion, 0);
    assert.equal(entry.manifestHash, '');
    assert.equal(entry.reviewStatus, 'unknown');
    assert.equal(entry.canManage, true);
  });

  it('handles config with missing permissions object', () => {
    const entry = buildMonsterVisualRegistryEntry({ status: { draftRevision: 5 } });

    assert.equal(entry.draftVersion, 5);
    assert.equal(entry.canManage, false);
  });

  it('derives reviewStatus "publishable" when validation.ok is true', () => {
    const entry = buildMonsterVisualRegistryEntry(FULL_MONSTER_VISUAL_CONFIG);
    assert.equal(entry.reviewStatus, 'publishable');
  });

  it('derives reviewStatus "has-blockers" when validation.ok is false with errors', () => {
    const entry = buildMonsterVisualRegistryEntry(BLOCKER_VALIDATION_CONFIG);
    assert.equal(entry.reviewStatus, 'has-blockers');
  });

  it('derives reviewStatus "clean" when validation.ok is false without errors', () => {
    const entry = buildMonsterVisualRegistryEntry(CLEAN_VALIDATION_CONFIG);
    assert.equal(entry.reviewStatus, 'clean');
  });

  it('derives reviewStatus "unknown" when validation has no ok key', () => {
    const config = {
      status: {
        validation: { errorCount: 0, warningCount: 0 },
      },
    };
    const entry = buildMonsterVisualRegistryEntry(config);
    assert.equal(entry.reviewStatus, 'unknown');
  });

  it('derives reviewStatus "unknown" when validation is empty object', () => {
    const config = { status: { validation: {} } };
    const entry = buildMonsterVisualRegistryEntry(config);
    assert.equal(entry.reviewStatus, 'unknown');
  });

  it('sets hasDraft false when draft is null', () => {
    const config = { ...FULL_MONSTER_VISUAL_CONFIG, draft: null };
    const entry = buildMonsterVisualRegistryEntry(config);
    assert.equal(entry.hasDraft, false);
  });

  it('sets hasPublished false when published is null', () => {
    const config = { ...FULL_MONSTER_VISUAL_CONFIG, published: null };
    const entry = buildMonsterVisualRegistryEntry(config);
    assert.equal(entry.hasPublished, false);
  });

  it('sets hasDraft false when draft is a non-object value', () => {
    const config = { ...FULL_MONSTER_VISUAL_CONFIG, draft: 'string-value' };
    const entry = buildMonsterVisualRegistryEntry(config);
    assert.equal(entry.hasDraft, false);
  });

  it('sets hasPublished false when published is an array', () => {
    const config = { ...FULL_MONSTER_VISUAL_CONFIG, published: [1, 2, 3] };
    const entry = buildMonsterVisualRegistryEntry(config);
    assert.equal(entry.hasPublished, false);
  });

  it('defaults versions to empty array when not present', () => {
    const config = { status: {}, permissions: {} };
    const entry = buildMonsterVisualRegistryEntry(config);
    assert.deepEqual(entry.versions, []);
  });

  it('defaults versions to empty array when not an array', () => {
    const config = { ...FULL_MONSTER_VISUAL_CONFIG, versions: 'not-array' };
    const entry = buildMonsterVisualRegistryEntry(config);
    assert.deepEqual(entry.versions, []);
  });

  it('coerces string draftRevision to number', () => {
    const config = { status: { draftRevision: '12' } };
    const entry = buildMonsterVisualRegistryEntry(config);
    assert.equal(entry.draftVersion, 12);
  });

  it('defaults draftVersion to 0 for negative revision', () => {
    const config = { status: { draftRevision: -5 } };
    const entry = buildMonsterVisualRegistryEntry(config);
    assert.equal(entry.draftVersion, 0);
  });

  it('defaults publishedVersion to 0 for NaN', () => {
    const config = { status: { publishedVersion: 'abc' } };
    const entry = buildMonsterVisualRegistryEntry(config);
    assert.equal(entry.publishedVersion, 0);
  });

  it('includes validation errors and warnings arrays', () => {
    const entry = buildMonsterVisualRegistryEntry(BLOCKER_VALIDATION_CONFIG);

    assert.equal(entry.validationState.errorCount, 3);
    assert.equal(entry.validationState.warningCount, 1);
    assert.equal(entry.validationState.errors.length, 3);
    assert.equal(entry.validationState.warnings.length, 1);
    assert.equal(entry.validationState.errors[0], 'Missing sprite');
  });

  it('defaults validation arrays when not present', () => {
    const config = { status: { validation: { ok: true } } };
    const entry = buildMonsterVisualRegistryEntry(config);

    assert.deepEqual(entry.validationState.errors, []);
    assert.deepEqual(entry.validationState.warnings, []);
  });
});

// ─── buildAssetRegistry ──────────────────────────────────────────────────────

describe('buildAssetRegistry', () => {
  it('returns an array with one entry for a model with monsterVisualConfig', () => {
    const model = { monsterVisualConfig: FULL_MONSTER_VISUAL_CONFIG };
    const registry = buildAssetRegistry(model);

    assert.equal(Array.isArray(registry), true);
    assert.equal(registry.length, 1);
    assert.equal(registry[0].assetId, 'monster-visual-config');
    assert.equal(registry[0].category, 'visual');
  });

  it('passes through full config data to the registry entry', () => {
    const model = { monsterVisualConfig: FULL_MONSTER_VISUAL_CONFIG };
    const registry = buildAssetRegistry(model);

    assert.equal(registry[0].draftVersion, 7);
    assert.equal(registry[0].publishedVersion, 3);
    assert.equal(registry[0].reviewStatus, 'publishable');
    assert.equal(registry[0].canManage, true);
  });

  it('returns safe-defaulted entry for null model', () => {
    const registry = buildAssetRegistry(null);

    assert.equal(registry.length, 1);
    assert.equal(registry[0].assetId, 'monster-visual-config');
    assert.equal(registry[0].draftVersion, 0);
    assert.equal(registry[0].publishedVersion, 0);
    assert.equal(registry[0].reviewStatus, 'unknown');
  });

  it('returns safe-defaulted entry for undefined model', () => {
    const registry = buildAssetRegistry(undefined);

    assert.equal(registry.length, 1);
    assert.equal(registry[0].reviewStatus, 'unknown');
    assert.equal(registry[0].canManage, false);
  });

  it('returns safe-defaulted entry for empty model', () => {
    const registry = buildAssetRegistry({});

    assert.equal(registry.length, 1);
    assert.equal(registry[0].draftVersion, 0);
    assert.equal(registry[0].manifestHash, '');
  });

  it('returns safe-defaulted entry when monsterVisualConfig is not plain object', () => {
    const registry = buildAssetRegistry({ monsterVisualConfig: 'invalid' });

    assert.equal(registry.length, 1);
    assert.equal(registry[0].draftVersion, 0);
    assert.equal(registry[0].reviewStatus, 'unknown');
  });

  it('returns array (not scalar) even for single asset category', () => {
    const registry = buildAssetRegistry({ monsterVisualConfig: FULL_MONSTER_VISUAL_CONFIG });
    assert.equal(Array.isArray(registry), true);
  });

  it('blocker validation model propagates through buildAssetRegistry', () => {
    const model = { monsterVisualConfig: BLOCKER_VALIDATION_CONFIG };
    const registry = buildAssetRegistry(model);

    assert.equal(registry[0].reviewStatus, 'has-blockers');
    assert.equal(registry[0].validationState.errorCount, 3);
    assert.equal(registry[0].canManage, false);
  });
});
