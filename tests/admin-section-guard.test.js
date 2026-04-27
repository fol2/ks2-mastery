// U4 review follower — unit tests for the pure guard function extracted
// from AdminHubSurface's handleTabChange.
//
// shouldBlockSectionChange() decides whether a tab switch should be blocked
// BEFORE the UI-layer confirm() runs. These tests exercise the decision
// logic directly without needing a DOM or SSR harness.
import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldBlockSectionChange } from '../src/platform/hubs/admin-section-guard.js';
import { createAccountOpsMetadataDirtyRegistry } from '../src/platform/hubs/admin-metadata-dirty-registry.js';

test('same section returns blocked with reason "same-section"', () => {
  const registry = createAccountOpsMetadataDirtyRegistry();
  const result = shouldBlockSectionChange(registry, 'overview', 'overview');
  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'same-section');
});

test('dirty rows returns blocked with reason "dirty-rows"', () => {
  const registry = createAccountOpsMetadataDirtyRegistry();
  registry.setDirty('account-1', true);
  const result = shouldBlockSectionChange(registry, 'accounts', 'overview');
  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'dirty-rows');
});

test('clean state returns not blocked', () => {
  const registry = createAccountOpsMetadataDirtyRegistry();
  const result = shouldBlockSectionChange(registry, 'accounts', 'overview');
  assert.equal(result.blocked, false);
  assert.equal(result.reason, undefined);
});

test('after clear(), returns not blocked', () => {
  const registry = createAccountOpsMetadataDirtyRegistry();
  registry.setDirty('account-1', true);
  registry.setDirty('account-2', true);
  // Confirm dirty state is active.
  assert.equal(shouldBlockSectionChange(registry, 'debug', 'overview').blocked, true);
  // Clear the registry.
  registry.clear();
  const result = shouldBlockSectionChange(registry, 'debug', 'overview');
  assert.equal(result.blocked, false);
});
