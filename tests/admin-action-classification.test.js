// Admin Console P5 / U3: classification registry unit tests.
//
// Validates that `classifyAction` returns the correct level, confirmation
// requirements, and danger copy for each registered action key across all
// four classification tiers (low, medium, high, critical).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyAction,
  LEVELS,
} from '../src/platform/hubs/admin-action-classification.js';

// =================================================================
// 1. LEVELS object is frozen and contains exactly 4 tiers
// =================================================================

test('LEVELS contains exactly low, medium, high, critical', () => {
  assert.deepEqual(Object.keys(LEVELS).sort(), ['critical', 'high', 'low', 'medium']);
  assert.equal(Object.isFrozen(LEVELS), true);
});

// =================================================================
// 2. Low-level actions: no confirmation required
// =================================================================

const LOW_ACTIONS = [
  'admin-ops-kpi-refresh',
  'admin-ops-activity-refresh',
  'account-search',
  'admin-debug-bundle-generate',
];

for (const actionKey of LOW_ACTIONS) {
  test(`low action "${actionKey}" requires no confirmation`, () => {
    const result = classifyAction(actionKey);
    assert.equal(result.level, 'low');
    assert.equal(result.requiresConfirmation, false);
    assert.equal(result.requiresTypedTarget, false);
    assert.equal(result.dangerCopy, null);
    assert.equal(result.targetDisplay, null);
  });
}

// =================================================================
// 3. Medium-level actions: no confirmation required
// =================================================================

const MEDIUM_ACTIONS = [
  'account-ops-metadata-save',
  'marketing-create',
  'admin-section-change',
];

for (const actionKey of MEDIUM_ACTIONS) {
  test(`medium action "${actionKey}" requires no confirmation`, () => {
    const result = classifyAction(actionKey);
    assert.equal(result.level, 'medium');
    assert.equal(result.requiresConfirmation, false);
    assert.equal(result.requiresTypedTarget, false);
    assert.equal(result.dangerCopy, null);
    assert.equal(result.targetDisplay, null);
  });
}

// =================================================================
// 4. High-level actions: confirmation required, no typed target
// =================================================================

const HIGH_ACTIONS = [
  'marketing-transition-published',
  'marketing-transition-scheduled',
  'monster-visual-config-publish',
  'monster-visual-config-restore',
  'grammar-transfer-admin-archive',
];

for (const actionKey of HIGH_ACTIONS) {
  test(`high action "${actionKey}" requires confirmation but not typed target`, () => {
    const result = classifyAction(actionKey);
    assert.equal(result.level, 'high');
    assert.equal(result.requiresConfirmation, true);
    assert.equal(result.requiresTypedTarget, false);
    assert.equal(typeof result.dangerCopy, 'string');
    assert.ok(result.dangerCopy.length > 0);
  });
}

// =================================================================
// 5. Critical-level actions: confirmation + typed target required
// =================================================================

const CRITICAL_ACTIONS = [
  'post-mega-seed-apply',
  'grammar-transfer-admin-delete',
  'marketing-transition-all-signed-in-publish',
];

for (const actionKey of CRITICAL_ACTIONS) {
  test(`critical action "${actionKey}" requires confirmation and typed target`, () => {
    const result = classifyAction(actionKey);
    assert.equal(result.level, 'critical');
    assert.equal(result.requiresConfirmation, true);
    assert.equal(result.requiresTypedTarget, true);
    assert.equal(typeof result.dangerCopy, 'string');
    assert.ok(result.dangerCopy.length > 0);
  });
}

// =================================================================
// 6. Context: targetLabel propagates to targetDisplay
// =================================================================

test('high action with context.targetLabel populates targetDisplay', () => {
  const result = classifyAction('monster-visual-config-publish', {
    targetLabel: 'Monster Visual Config v3',
  });
  assert.equal(result.targetDisplay, 'Monster Visual Config v3');
});

test('critical action with context.targetId populates targetDisplay', () => {
  const result = classifyAction('grammar-transfer-admin-delete', {
    targetId: 'concept-fronted-adverbials',
  });
  assert.equal(result.targetDisplay, 'concept-fronted-adverbials');
});

test('targetLabel takes precedence over targetId', () => {
  const result = classifyAction('post-mega-seed-apply', {
    targetId: 'seed-123',
    targetLabel: 'Fresh graduate seed',
  });
  assert.equal(result.targetDisplay, 'Fresh graduate seed');
});

test('low action ignores context — targetDisplay remains null', () => {
  const result = classifyAction('account-search', {
    targetLabel: 'should be ignored',
  });
  assert.equal(result.targetDisplay, null);
});

// =================================================================
// 7. Unknown action key defaults to medium (safe fallback)
// =================================================================

test('unknown action key defaults to medium classification', () => {
  const result = classifyAction('totally-unknown-action');
  assert.equal(result.level, 'medium');
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.requiresTypedTarget, false);
});

// =================================================================
// 8. Edge cases: null/undefined context handled gracefully
// =================================================================

test('null context does not throw', () => {
  const result = classifyAction('post-mega-seed-apply', null);
  assert.equal(result.level, 'critical');
  assert.equal(result.targetDisplay, null);
});

test('undefined context does not throw', () => {
  const result = classifyAction('post-mega-seed-apply', undefined);
  assert.equal(result.level, 'critical');
  assert.equal(result.targetDisplay, null);
});

test('non-object context does not throw', () => {
  const result = classifyAction('post-mega-seed-apply', 42);
  assert.equal(result.level, 'critical');
  assert.equal(result.targetDisplay, null);
});
