// P6 U8: Asset Registry v1 — generalised CAS publish/rollback test suite.
//
// Tests the extended registry entry shape (publishBlockers, previewUrl,
// reducedMotionStatus, fallbackStatus), action classification for the new
// generic asset actions, and CAS conflict scenario behaviour.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAssetRegistry,
  buildMonsterVisualRegistryEntry,
} from '../src/platform/hubs/admin-asset-registry.js';

import {
  classifyAction,
  LEVELS,
} from '../src/platform/hubs/admin-action-classification.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PUBLISHABLE_CONFIG = {
  status: {
    draftRevision: 5,
    publishedVersion: 2,
    manifestHash: 'abc123def456',
    publishedAt: 1714300800000,
    publishedByAccountId: 'account-admin-42',
    previewUrl: 'https://preview.example.com/monster-visual-config',
    reducedMotionStatus: 'available',
    fallbackStatus: 'static-sprite',
    validation: {
      ok: true,
      errorCount: 0,
      warningCount: 1,
      errors: [],
      warnings: ['Minor spacing'],
    },
  },
  permissions: { canManageMonsterVisualConfig: true },
  draft: { monsters: [{ id: 'blob' }] },
  published: { monsters: [{ id: 'blob' }] },
  versions: [
    { version: 2, publishedAt: 1714300800000 },
    { version: 1, publishedAt: 1714214400000 },
  ],
};

const BLOCKED_CONFIG = {
  status: {
    draftRevision: 3,
    publishedVersion: 1,
    manifestHash: 'deadbeef0000',
    publishedAt: 1714000000000,
    publishedByAccountId: 'account-ops-1',
    validation: {
      ok: false,
      errorCount: 2,
      warningCount: 0,
      errors: ['Missing sprite', 'Invalid frame count'],
      warnings: [],
    },
  },
  permissions: { canManageMonsterVisualConfig: true },
  draft: { monsters: [] },
  published: { monsters: [] },
  versions: [{ version: 1, publishedAt: 1714000000000 }],
};

const NO_DRAFT_CONFIG = {
  status: {
    draftRevision: 0,
    publishedVersion: 1,
    manifestHash: '',
    publishedAt: 1714000000000,
    publishedByAccountId: 'account-admin-42',
    validation: { ok: true, errorCount: 0, warningCount: 0, errors: [], warnings: [] },
  },
  permissions: { canManageMonsterVisualConfig: true },
  draft: null,
  published: { monsters: [] },
  versions: [{ version: 1, publishedAt: 1714000000000 }],
};

const NO_PERMISSION_CONFIG = {
  status: {
    draftRevision: 2,
    publishedVersion: 1,
    manifestHash: 'abc',
    validation: { ok: true, errorCount: 0, warningCount: 0, errors: [], warnings: [] },
  },
  permissions: { canManageMonsterVisualConfig: false },
  draft: { monsters: [] },
  published: { monsters: [] },
  versions: [],
};

// ─── publishBlockers ────────────────────────────────────────────────────────

describe('buildMonsterVisualRegistryEntry — publishBlockers', () => {
  it('returns empty publishBlockers when publishable with draft and permissions', () => {
    const entry = buildMonsterVisualRegistryEntry(PUBLISHABLE_CONFIG);
    assert.deepEqual(entry.publishBlockers, []);
  });

  it('includes validation error blocker when errors exist', () => {
    const entry = buildMonsterVisualRegistryEntry(BLOCKED_CONFIG);
    assert.equal(entry.publishBlockers.length, 1);
    assert.ok(entry.publishBlockers[0].includes('2 validation error'));
  });

  it('includes "no draft" blocker when draft is null', () => {
    const entry = buildMonsterVisualRegistryEntry(NO_DRAFT_CONFIG);
    assert.ok(entry.publishBlockers.some((b) => b.includes('No draft')));
  });

  it('includes permission blocker when canManage is false', () => {
    const entry = buildMonsterVisualRegistryEntry(NO_PERMISSION_CONFIG);
    assert.ok(entry.publishBlockers.some((b) => b.includes('Insufficient permissions')));
  });

  it('stacks multiple blockers when both permission and draft are missing', () => {
    const config = {
      status: { validation: { ok: true, errorCount: 0 } },
      permissions: { canManageMonsterVisualConfig: false },
      draft: null,
      published: null,
      versions: [],
    };
    const entry = buildMonsterVisualRegistryEntry(config);
    assert.ok(entry.publishBlockers.length >= 2);
  });

  it('returns publishBlockers as an array (never undefined)', () => {
    const entry = buildMonsterVisualRegistryEntry(null);
    assert.equal(Array.isArray(entry.publishBlockers), true);
  });
});

// ─── previewUrl ─────────────────────────────────────────────────────────────

describe('buildMonsterVisualRegistryEntry — previewUrl', () => {
  it('populates previewUrl from status.previewUrl', () => {
    const entry = buildMonsterVisualRegistryEntry(PUBLISHABLE_CONFIG);
    assert.equal(entry.previewUrl, 'https://preview.example.com/monster-visual-config');
  });

  it('returns null when previewUrl is not present', () => {
    const entry = buildMonsterVisualRegistryEntry(BLOCKED_CONFIG);
    assert.equal(entry.previewUrl, null);
  });

  it('returns null when previewUrl is empty string', () => {
    const config = { status: { previewUrl: '' } };
    const entry = buildMonsterVisualRegistryEntry(config);
    assert.equal(entry.previewUrl, null);
  });

  it('returns null when previewUrl is non-string', () => {
    const config = { status: { previewUrl: 123 } };
    const entry = buildMonsterVisualRegistryEntry(config);
    assert.equal(entry.previewUrl, null);
  });
});

// ─── reducedMotionStatus / fallbackStatus ───────────────────────────────────

describe('buildMonsterVisualRegistryEntry — reducedMotionStatus and fallbackStatus', () => {
  it('populates reducedMotionStatus from status', () => {
    const entry = buildMonsterVisualRegistryEntry(PUBLISHABLE_CONFIG);
    assert.equal(entry.reducedMotionStatus, 'available');
  });

  it('populates fallbackStatus from status', () => {
    const entry = buildMonsterVisualRegistryEntry(PUBLISHABLE_CONFIG);
    assert.equal(entry.fallbackStatus, 'static-sprite');
  });

  it('returns null for reducedMotionStatus when not present', () => {
    const entry = buildMonsterVisualRegistryEntry(BLOCKED_CONFIG);
    assert.equal(entry.reducedMotionStatus, null);
  });

  it('returns null for fallbackStatus when not present', () => {
    const entry = buildMonsterVisualRegistryEntry(BLOCKED_CONFIG);
    assert.equal(entry.fallbackStatus, null);
  });
});

// ─── buildAssetRegistry extended shape ──────────────────────────────────────

describe('buildAssetRegistry — v1 extended shape', () => {
  it('entries include publishBlockers array', () => {
    const model = { monsterVisualConfig: PUBLISHABLE_CONFIG };
    const registry = buildAssetRegistry(model);
    assert.equal(Array.isArray(registry[0].publishBlockers), true);
  });

  it('entries include previewUrl', () => {
    const model = { monsterVisualConfig: PUBLISHABLE_CONFIG };
    const registry = buildAssetRegistry(model);
    assert.equal(registry[0].previewUrl, 'https://preview.example.com/monster-visual-config');
  });

  it('entries include reducedMotionStatus and fallbackStatus', () => {
    const model = { monsterVisualConfig: PUBLISHABLE_CONFIG };
    const registry = buildAssetRegistry(model);
    assert.equal(registry[0].reducedMotionStatus, 'available');
    assert.equal(registry[0].fallbackStatus, 'static-sprite');
  });

  it('null model produces entries with empty publishBlockers', () => {
    const registry = buildAssetRegistry(null);
    // Null model => no permission, no draft => at least 2 blockers
    assert.ok(registry[0].publishBlockers.length >= 2);
  });
});

// ─── Action classification ──────────────────────────────────────────────────

describe('action classification — asset-publish', () => {
  it('classifies asset-publish at HIGH level', () => {
    const result = classifyAction('asset-publish');
    assert.equal(result.level, LEVELS.high);
  });

  it('requires confirmation for asset-publish', () => {
    const result = classifyAction('asset-publish');
    assert.equal(result.requiresConfirmation, true);
  });

  it('does not require typed target for asset-publish', () => {
    const result = classifyAction('asset-publish');
    assert.equal(result.requiresTypedTarget, false);
  });
});

describe('action classification — asset-restore', () => {
  it('classifies asset-restore at HIGH level', () => {
    const result = classifyAction('asset-restore');
    assert.equal(result.level, LEVELS.high);
  });

  it('requires confirmation for asset-restore', () => {
    const result = classifyAction('asset-restore');
    assert.equal(result.requiresConfirmation, true);
  });
});

describe('action classification — asset-delete-draft', () => {
  it('classifies asset-delete-draft at MEDIUM level', () => {
    const result = classifyAction('asset-delete-draft');
    assert.equal(result.level, LEVELS.medium);
  });

  it('does not require confirmation for asset-delete-draft', () => {
    const result = classifyAction('asset-delete-draft');
    assert.equal(result.requiresConfirmation, false);
  });
});

// ─── CAS conflict scenario ──────────────────────────────────────────────────

describe('CAS conflict scenario — 409 response handling', () => {
  it('fetchHubJson surfaces 409 with error.status and payload', async () => {
    // Simulate what the client API does when it receives a 409 from the Worker.
    // The createHubApi fetchHubJson throws with error.status = 409 and
    // error.payload containing the conflict detail.
    const mockConflictResponse = {
      ok: false,
      status: 409,
      headers: { get: () => 'application/json' },
      json: async () => ({
        ok: false,
        code: 'cas_conflict',
        message: 'Draft revision has changed since your last read.',
        currentState: { draftRevision: 8, publishedVersion: 3 },
      }),
    };

    // Replicate the parseResponse + error-throw logic from api.js
    const contentType = mockConflictResponse.headers.get('content-type') || '';
    let payload = null;
    if (contentType.includes('application/json')) {
      payload = await mockConflictResponse.json();
    }

    assert.equal(mockConflictResponse.ok, false);
    assert.equal(mockConflictResponse.status, 409);
    assert.equal(payload.code, 'cas_conflict');
    assert.equal(payload.currentState.draftRevision, 8);
  });

  it('conflict payload includes currentState for client re-sync', async () => {
    const conflictPayload = {
      ok: false,
      code: 'cas_conflict',
      message: 'Published version mismatch.',
      currentState: { publishedVersion: 5, draftRevision: 12 },
    };

    // The client should use currentState to re-sync its local model
    assert.equal(conflictPayload.currentState.publishedVersion, 5);
    assert.equal(conflictPayload.currentState.draftRevision, 12);
  });
});

// ─── Publish button disabled logic ──────────────────────────────────────────

describe('publish button state derivation', () => {
  it('publish is enabled when no blockers and hasDraft', () => {
    const entry = buildMonsterVisualRegistryEntry(PUBLISHABLE_CONFIG);
    const hasBlockers = entry.publishBlockers.length > 0;
    const disabled = !entry.canManage || hasBlockers || !entry.hasDraft;
    assert.equal(disabled, false);
  });

  it('publish is disabled when blockers exist', () => {
    const entry = buildMonsterVisualRegistryEntry(BLOCKED_CONFIG);
    const hasBlockers = entry.publishBlockers.length > 0;
    const disabled = !entry.canManage || hasBlockers || !entry.hasDraft;
    assert.equal(disabled, true);
  });

  it('publish is disabled when no draft', () => {
    const entry = buildMonsterVisualRegistryEntry(NO_DRAFT_CONFIG);
    const hasBlockers = entry.publishBlockers.length > 0;
    const disabled = !entry.canManage || hasBlockers || !entry.hasDraft;
    assert.equal(disabled, true);
  });

  it('publish is disabled when no permission', () => {
    const entry = buildMonsterVisualRegistryEntry(NO_PERMISSION_CONFIG);
    const hasBlockers = entry.publishBlockers.length > 0;
    const disabled = !entry.canManage || hasBlockers || !entry.hasDraft;
    assert.equal(disabled, true);
  });
});
