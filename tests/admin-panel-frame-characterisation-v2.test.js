// P6 Unit 1: Characterisation baseline — admin-panel-frame.js (pure logic)
//
// Exhaustive pin of decidePanelFrameState behaviour across all meaningful
// input combinations. Tests the pure logic module directly (no React/esbuild).
// The v1 characterisation test (react-admin-panel-frame-characterisation.test.js)
// covers the React wrapper; this file covers the decision function.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_STALE_THRESHOLD_MS,
  decidePanelFrameState,
} from '../src/platform/hubs/admin-panel-frame.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('DEFAULT_STALE_THRESHOLD_MS', () => {
  it('equals exactly 300,000 ms (5 minutes)', () => {
    assert.equal(DEFAULT_STALE_THRESHOLD_MS, 300_000);
    assert.equal(DEFAULT_STALE_THRESHOLD_MS, 5 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// decidePanelFrameState — fresh data (no staleness, no loading, no error)
// ---------------------------------------------------------------------------

describe('decidePanelFrameState with fresh data', () => {
  const NOW = 1_700_000_000_000;
  const FRESH_AT = NOW - 60_000; // 1 minute ago

  it('returns all-clear state', () => {
    const result = decidePanelFrameState({
      refreshedAt: FRESH_AT,
      refreshError: null,
      data: { items: [1, 2, 3] },
      loading: false,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, false);
    assert.equal(result.showLoadingSkeleton, false);
    assert.equal(result.showEmptyState, false);
    assert.equal(result.showRetry, false);
    assert.equal(result.showLastSuccessTimestamp, false);
    assert.equal(result.lastSuccessAt, FRESH_AT);
  });

  it('with array data that has entries — no empty state', () => {
    const result = decidePanelFrameState({
      refreshedAt: FRESH_AT,
      refreshError: null,
      data: [1, 2, 3],
      loading: false,
      now: NOW,
    });
    assert.equal(result.showEmptyState, false);
    assert.equal(result.showStaleWarning, false);
  });

  it('with string data — treated as present', () => {
    const result = decidePanelFrameState({
      refreshedAt: FRESH_AT,
      refreshError: null,
      data: 'some text',
      loading: false,
      now: NOW,
    });
    assert.equal(result.showEmptyState, false);
  });

  it('with number data — treated as present', () => {
    const result = decidePanelFrameState({
      refreshedAt: FRESH_AT,
      refreshError: null,
      data: 42,
      loading: false,
      now: NOW,
    });
    assert.equal(result.showEmptyState, false);
  });
});

// ---------------------------------------------------------------------------
// decidePanelFrameState — stale data (refreshedAt > threshold)
// ---------------------------------------------------------------------------

describe('decidePanelFrameState with stale data', () => {
  const NOW = 1_700_000_000_000;
  const STALE_AT = NOW - DEFAULT_STALE_THRESHOLD_MS - 1000; // 5min + 1s ago

  it('shows stale warning when data is present and age exceeds threshold', () => {
    const result = decidePanelFrameState({
      refreshedAt: STALE_AT,
      refreshError: null,
      data: { items: [1] },
      loading: false,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, true);
    assert.equal(result.showLoadingSkeleton, false);
    assert.equal(result.showEmptyState, false);
    assert.equal(result.showRetry, false);
    assert.equal(result.lastSuccessAt, STALE_AT);
  });

  it('does NOT show stale warning when loading (even if data is old)', () => {
    const result = decidePanelFrameState({
      refreshedAt: STALE_AT,
      refreshError: null,
      data: { items: [1] },
      loading: true,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, false);
  });

  it('does NOT show stale warning for empty data (contradictory)', () => {
    const result = decidePanelFrameState({
      refreshedAt: STALE_AT,
      refreshError: null,
      data: [],
      loading: false,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, false);
  });

  it('boundary: exactly at threshold is NOT stale (uses > not >=)', () => {
    const atBoundary = NOW - DEFAULT_STALE_THRESHOLD_MS;
    const result = decidePanelFrameState({
      refreshedAt: atBoundary,
      refreshError: null,
      data: { x: 1 },
      loading: false,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, false);
  });

  it('boundary: 1ms past threshold IS stale', () => {
    const pastBoundary = NOW - DEFAULT_STALE_THRESHOLD_MS - 1;
    const result = decidePanelFrameState({
      refreshedAt: pastBoundary,
      refreshError: null,
      data: { x: 1 },
      loading: false,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, true);
  });

  it('custom staleThresholdMs is respected', () => {
    const customThreshold = 10_000; // 10 seconds
    const result = decidePanelFrameState({
      refreshedAt: NOW - 11_000, // 11 seconds ago
      refreshError: null,
      data: { x: 1 },
      loading: false,
      staleThresholdMs: customThreshold,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, true);
  });

  it('custom staleThresholdMs: within threshold → not stale', () => {
    const customThreshold = 10_000;
    const result = decidePanelFrameState({
      refreshedAt: NOW - 9_000, // 9 seconds ago, within 10s threshold
      refreshError: null,
      data: { x: 1 },
      loading: false,
      staleThresholdMs: customThreshold,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, false);
  });
});

// ---------------------------------------------------------------------------
// decidePanelFrameState — loading states
// ---------------------------------------------------------------------------

describe('decidePanelFrameState loading states', () => {
  const NOW = 1_700_000_000_000;

  it('loading + no data → showLoadingSkeleton', () => {
    const result = decidePanelFrameState({
      refreshedAt: null,
      refreshError: null,
      data: null,
      loading: true,
      now: NOW,
    });
    assert.equal(result.showLoadingSkeleton, true);
    assert.equal(result.showEmptyState, false);
    assert.equal(result.showStaleWarning, false);
    assert.equal(result.showRetry, false);
  });

  it('loading + no data (empty array) → showLoadingSkeleton', () => {
    const result = decidePanelFrameState({
      refreshedAt: null,
      refreshError: null,
      data: [],
      loading: true,
      now: NOW,
    });
    assert.equal(result.showLoadingSkeleton, true);
  });

  it('loading + no data (empty object) → showLoadingSkeleton', () => {
    const result = decidePanelFrameState({
      refreshedAt: null,
      refreshError: null,
      data: {},
      loading: true,
      now: NOW,
    });
    assert.equal(result.showLoadingSkeleton, true);
  });

  it('loading + existing data → NO skeleton (data still visible)', () => {
    const result = decidePanelFrameState({
      refreshedAt: NOW - 60_000,
      refreshError: null,
      data: { items: [1, 2] },
      loading: true,
      now: NOW,
    });
    assert.equal(result.showLoadingSkeleton, false);
    assert.equal(result.showStaleWarning, false);
  });

  it('loading + existing array data → NO skeleton', () => {
    const result = decidePanelFrameState({
      refreshedAt: NOW - 60_000,
      refreshError: null,
      data: ['a', 'b'],
      loading: true,
      now: NOW,
    });
    assert.equal(result.showLoadingSkeleton, false);
  });
});

// ---------------------------------------------------------------------------
// decidePanelFrameState — error states
// ---------------------------------------------------------------------------

describe('decidePanelFrameState error states', () => {
  const NOW = 1_700_000_000_000;
  const ERROR = { message: 'Network failure', code: 500 };

  it('error + no data + no previous success → showRetry, no lastSuccessTimestamp', () => {
    const result = decidePanelFrameState({
      refreshedAt: null,
      refreshError: ERROR,
      data: null,
      loading: false,
      now: NOW,
    });
    assert.equal(result.showRetry, true);
    assert.equal(result.showEmptyState, false); // error suppresses empty state
    assert.equal(result.showLastSuccessTimestamp, false);
    assert.equal(result.lastSuccessAt, null);
  });

  it('error + no data + previous success → showRetry + showLastSuccessTimestamp', () => {
    const LAST_SUCCESS = NOW - 120_000;
    const result = decidePanelFrameState({
      refreshedAt: LAST_SUCCESS,
      refreshError: ERROR,
      data: null,
      loading: false,
      now: NOW,
    });
    assert.equal(result.showRetry, true);
    assert.equal(result.showLastSuccessTimestamp, true);
    assert.equal(result.lastSuccessAt, LAST_SUCCESS);
  });

  it('error + existing data → showRetry but no skeleton/empty', () => {
    const result = decidePanelFrameState({
      refreshedAt: NOW - 60_000,
      refreshError: ERROR,
      data: { items: [1] },
      loading: false,
      now: NOW,
    });
    assert.equal(result.showRetry, true);
    assert.equal(result.showLoadingSkeleton, false);
    assert.equal(result.showEmptyState, false);
    assert.equal(result.showLastSuccessTimestamp, true);
  });

  it('error + loading → NO retry (still in-flight)', () => {
    const result = decidePanelFrameState({
      refreshedAt: null,
      refreshError: ERROR,
      data: null,
      loading: true,
      now: NOW,
    });
    assert.equal(result.showRetry, false);
    assert.equal(result.showLoadingSkeleton, true);
  });

  it('non-object error (e.g. null) → not treated as error', () => {
    const result = decidePanelFrameState({
      refreshedAt: null,
      refreshError: null,
      data: null,
      loading: false,
      now: NOW,
    });
    assert.equal(result.showRetry, false);
    assert.equal(result.showEmptyState, true); // no data, no loading, no error
  });

  it('string error → not treated as error (must be object)', () => {
    const result = decidePanelFrameState({
      refreshedAt: null,
      refreshError: 'some error string',
      data: null,
      loading: false,
      now: NOW,
    });
    assert.equal(result.showRetry, false);
    assert.equal(result.showEmptyState, true);
  });
});

// ---------------------------------------------------------------------------
// decidePanelFrameState — empty state
// ---------------------------------------------------------------------------

describe('decidePanelFrameState empty state', () => {
  const NOW = 1_700_000_000_000;

  it('no data + no loading + no error → showEmptyState', () => {
    const result = decidePanelFrameState({
      refreshedAt: NOW - 60_000,
      refreshError: null,
      data: null,
      loading: false,
      now: NOW,
    });
    assert.equal(result.showEmptyState, true);
  });

  it('empty array + no loading + no error → showEmptyState', () => {
    const result = decidePanelFrameState({
      refreshedAt: NOW - 60_000,
      refreshError: null,
      data: [],
      loading: false,
      now: NOW,
    });
    assert.equal(result.showEmptyState, true);
  });

  it('empty object + no loading + no error → showEmptyState', () => {
    const result = decidePanelFrameState({
      refreshedAt: NOW - 60_000,
      refreshError: null,
      data: {},
      loading: false,
      now: NOW,
    });
    assert.equal(result.showEmptyState, true);
  });

  it('non-empty data → NOT empty state', () => {
    const result = decidePanelFrameState({
      refreshedAt: NOW - 60_000,
      refreshError: null,
      data: { x: 1 },
      loading: false,
      now: NOW,
    });
    assert.equal(result.showEmptyState, false);
  });

  it('false value → NOT present (dataIsPresent returns false for falsy non-null)', () => {
    // data = 0, which is falsy; but 0 is not null/undefined
    // Let's check: dataIsPresent(0) → not null, not array, not object, Boolean(0) = false
    const result = decidePanelFrameState({
      refreshedAt: NOW - 60_000,
      refreshError: null,
      data: 0,
      loading: false,
      now: NOW,
    });
    assert.equal(result.showEmptyState, true);
  });

  it('undefined data → empty state', () => {
    const result = decidePanelFrameState({
      refreshedAt: NOW - 60_000,
      refreshError: null,
      data: undefined,
      loading: false,
      now: NOW,
    });
    assert.equal(result.showEmptyState, true);
  });
});

// ---------------------------------------------------------------------------
// decidePanelFrameState — lastSuccessfulRefreshAt override
// ---------------------------------------------------------------------------

describe('decidePanelFrameState lastSuccessfulRefreshAt', () => {
  const NOW = 1_700_000_000_000;

  it('prefers lastSuccessfulRefreshAt over refreshedAt when both provided', () => {
    const EXPLICIT_SUCCESS = NOW - 30_000;
    const REFRESHED = NOW - 120_000;
    const result = decidePanelFrameState({
      refreshedAt: REFRESHED,
      refreshError: null,
      data: { x: 1 },
      loading: false,
      lastSuccessfulRefreshAt: EXPLICIT_SUCCESS,
      now: NOW,
    });
    assert.equal(result.lastSuccessAt, EXPLICIT_SUCCESS);
  });

  it('falls back to refreshedAt when lastSuccessfulRefreshAt is null', () => {
    const REFRESHED = NOW - 60_000;
    const result = decidePanelFrameState({
      refreshedAt: REFRESHED,
      refreshError: null,
      data: { x: 1 },
      loading: false,
      lastSuccessfulRefreshAt: null,
      now: NOW,
    });
    assert.equal(result.lastSuccessAt, REFRESHED);
  });

  it('falls back to refreshedAt when lastSuccessfulRefreshAt is undefined', () => {
    const REFRESHED = NOW - 60_000;
    const result = decidePanelFrameState({
      refreshedAt: REFRESHED,
      refreshError: null,
      data: { x: 1 },
      loading: false,
      now: NOW,
    });
    assert.equal(result.lastSuccessAt, REFRESHED);
  });

  it('uses lastSuccessfulRefreshAt for stale calculation', () => {
    const STALE_REFRESHED = NOW - DEFAULT_STALE_THRESHOLD_MS - 5000;
    const FRESH_SUCCESS = NOW - 60_000;
    const result = decidePanelFrameState({
      refreshedAt: STALE_REFRESHED,
      refreshError: null,
      data: { x: 1 },
      loading: false,
      lastSuccessfulRefreshAt: FRESH_SUCCESS,
      now: NOW,
    });
    // lastSuccessfulRefreshAt is fresh → NOT stale
    assert.equal(result.showStaleWarning, false);
  });
});

// ---------------------------------------------------------------------------
// decidePanelFrameState — null/missing inputs
// ---------------------------------------------------------------------------

describe('decidePanelFrameState with null/missing inputs', () => {
  const NOW = 1_700_000_000_000;

  it('no arguments at all → returns empty/defaults safely', () => {
    const result = decidePanelFrameState();
    assert.equal(result.showLoadingSkeleton, false);
    assert.equal(result.showStaleWarning, false);
    assert.equal(result.showRetry, false);
    assert.equal(result.showEmptyState, true); // no data, no loading, no error
    assert.equal(result.lastSuccessAt, null);
  });

  it('empty options object → same as no arguments', () => {
    const result = decidePanelFrameState({});
    assert.equal(result.showEmptyState, true);
    assert.equal(result.lastSuccessAt, null);
  });

  it('refreshedAt: null → lastSuccessAt is null', () => {
    const result = decidePanelFrameState({
      refreshedAt: null,
      refreshError: null,
      data: null,
      loading: false,
      now: NOW,
    });
    assert.equal(result.lastSuccessAt, null);
  });

  it('refreshedAt: 0 → treated as invalid (resolveTimestamp returns null)', () => {
    const result = decidePanelFrameState({
      refreshedAt: 0,
      refreshError: null,
      data: { x: 1 },
      loading: false,
      now: NOW,
    });
    // 0 is not > 0, so resolveTimestamp returns null
    assert.equal(result.lastSuccessAt, null);
    assert.equal(result.showStaleWarning, false); // lastSuccess must be > 0
  });

  it('refreshedAt: negative → treated as invalid', () => {
    const result = decidePanelFrameState({
      refreshedAt: -100,
      refreshError: null,
      data: { x: 1 },
      loading: false,
      now: NOW,
    });
    assert.equal(result.lastSuccessAt, null);
  });

  it('refreshedAt: NaN → treated as invalid', () => {
    const result = decidePanelFrameState({
      refreshedAt: NaN,
      refreshError: null,
      data: { x: 1 },
      loading: false,
      now: NOW,
    });
    assert.equal(result.lastSuccessAt, null);
  });

  it('refreshedAt: Infinity → treated as invalid', () => {
    const result = decidePanelFrameState({
      refreshedAt: Infinity,
      refreshError: null,
      data: { x: 1 },
      loading: false,
      now: NOW,
    });
    assert.equal(result.lastSuccessAt, null);
  });

  it('staleThresholdMs: 0 → falls back to DEFAULT_STALE_THRESHOLD_MS', () => {
    const STALE_AT = NOW - DEFAULT_STALE_THRESHOLD_MS - 1000;
    const result = decidePanelFrameState({
      refreshedAt: STALE_AT,
      refreshError: null,
      data: { x: 1 },
      loading: false,
      staleThresholdMs: 0,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, true);
  });

  it('staleThresholdMs: negative → falls back to DEFAULT_STALE_THRESHOLD_MS', () => {
    const STALE_AT = NOW - DEFAULT_STALE_THRESHOLD_MS - 1000;
    const result = decidePanelFrameState({
      refreshedAt: STALE_AT,
      refreshError: null,
      data: { x: 1 },
      loading: false,
      staleThresholdMs: -500,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, true);
  });

  it('now: not provided → uses Date.now() internally (sanity check)', () => {
    const result = decidePanelFrameState({
      refreshedAt: Date.now() - 30_000,
      refreshError: null,
      data: { x: 1 },
      loading: false,
    });
    // Should be fresh (30s < 5min threshold)
    assert.equal(result.showStaleWarning, false);
  });
});

// ---------------------------------------------------------------------------
// decidePanelFrameState — composite scenarios
// ---------------------------------------------------------------------------

describe('decidePanelFrameState composite scenarios', () => {
  const NOW = 1_700_000_000_000;
  const ERROR = { message: 'timeout' };

  it('stale data + error → shows both stale warning and retry', () => {
    const STALE_AT = NOW - DEFAULT_STALE_THRESHOLD_MS - 5000;
    const result = decidePanelFrameState({
      refreshedAt: STALE_AT,
      refreshError: ERROR,
      data: { items: [1] },
      loading: false,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, true);
    assert.equal(result.showRetry, true);
    assert.equal(result.showLastSuccessTimestamp, true);
  });

  it('fresh data + error → shows retry but NOT stale warning', () => {
    const FRESH_AT = NOW - 60_000;
    const result = decidePanelFrameState({
      refreshedAt: FRESH_AT,
      refreshError: ERROR,
      data: { items: [1] },
      loading: false,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, false);
    assert.equal(result.showRetry, true);
  });

  it('loading + error + no data → skeleton, no retry (loading suppresses retry)', () => {
    const result = decidePanelFrameState({
      refreshedAt: null,
      refreshError: ERROR,
      data: null,
      loading: true,
      now: NOW,
    });
    assert.equal(result.showLoadingSkeleton, true);
    assert.equal(result.showRetry, false);
    assert.equal(result.showEmptyState, false);
  });
});
