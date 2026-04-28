// P6 Unit 4: Panel freshness contract test.
//
// Verifies that the decidePanelFrameState function correctly derives all
// freshness-related display signals, and that the normalised worker endpoint
// contract exposes meaningful refreshedAt values.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_STALE_THRESHOLD_MS,
  decidePanelFrameState,
} from '../src/platform/hubs/admin-panel-frame.js';

// ---------------------------------------------------------------------------
// Freshness display states: stale/unknown/fresh
// ---------------------------------------------------------------------------

describe('panel freshness — stale detection', () => {
  const NOW = 1_700_000_000_000;

  it('panel shows "stale" when refreshedAt > 5 minutes old', () => {
    const staleAt = NOW - DEFAULT_STALE_THRESHOLD_MS - 1;
    const result = decidePanelFrameState({
      refreshedAt: staleAt,
      refreshError: null,
      data: { items: [1, 2] },
      loading: false,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, true);
    assert.equal(result.lastSuccessAt, staleAt);
  });

  it('panel shows fresh (no stale warning) when refreshedAt < 5 minutes old', () => {
    const freshAt = NOW - 60_000; // 1 minute ago
    const result = decidePanelFrameState({
      refreshedAt: freshAt,
      refreshError: null,
      data: { items: [1, 2] },
      loading: false,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, false);
    assert.equal(result.lastSuccessAt, freshAt);
  });

  it('panel shows "freshness unknown" when refreshedAt is null', () => {
    const result = decidePanelFrameState({
      refreshedAt: null,
      refreshError: null,
      data: { items: [1, 2] },
      loading: false,
      now: NOW,
    });
    // When refreshedAt is null, lastSuccessAt is null and stale warning cannot fire
    assert.equal(result.lastSuccessAt, null);
    assert.equal(result.showStaleWarning, false);
    // Importantly, no skeleton or empty state either — data is present
    assert.equal(result.showLoadingSkeleton, false);
    assert.equal(result.showEmptyState, false);
  });

  it('panel shows "freshness unknown" when refreshedAt is undefined', () => {
    const result = decidePanelFrameState({
      refreshedAt: undefined,
      refreshError: null,
      data: [1],
      loading: false,
      now: NOW,
    });
    assert.equal(result.lastSuccessAt, null);
    assert.equal(result.showStaleWarning, false);
  });
});

// ---------------------------------------------------------------------------
// Loading + existing data: data visible with loading indicator (no skeleton)
// ---------------------------------------------------------------------------

describe('panel freshness — loading with existing data', () => {
  const NOW = 1_700_000_000_000;

  it('loading + existing data shows data (no skeleton)', () => {
    const result = decidePanelFrameState({
      refreshedAt: NOW - 120_000,
      refreshError: null,
      data: { accounts: [{ id: 'a1' }] },
      loading: true,
      now: NOW,
    });
    assert.equal(result.showLoadingSkeleton, false);
    assert.equal(result.showEmptyState, false);
    // Stale warning suppressed during loading
    assert.equal(result.showStaleWarning, false);
  });

  it('loading + empty data shows skeleton', () => {
    const result = decidePanelFrameState({
      refreshedAt: null,
      refreshError: null,
      data: [],
      loading: true,
      now: NOW,
    });
    assert.equal(result.showLoadingSkeleton, true);
    assert.equal(result.showEmptyState, false);
  });

  it('loading + stale data: no stale warning during refresh', () => {
    const staleAt = NOW - DEFAULT_STALE_THRESHOLD_MS - 5000;
    const result = decidePanelFrameState({
      refreshedAt: staleAt,
      refreshError: null,
      data: { x: 1 },
      loading: true,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, false);
    assert.equal(result.showLoadingSkeleton, false);
  });
});

// ---------------------------------------------------------------------------
// Error + lastSuccessfulRefreshAt: data with error banner
// ---------------------------------------------------------------------------

describe('panel freshness — error with last success memory', () => {
  const NOW = 1_700_000_000_000;
  const ERROR = { message: 'Network error', code: 'fetch_failed' };

  it('error + lastSuccessfulRefreshAt shows data with error banner', () => {
    const lastSuccess = NOW - 120_000;
    const result = decidePanelFrameState({
      refreshedAt: lastSuccess,
      refreshError: ERROR,
      data: { items: [1, 2, 3] },
      loading: false,
      lastSuccessfulRefreshAt: lastSuccess,
      now: NOW,
    });
    assert.equal(result.showRetry, true);
    assert.equal(result.showLastSuccessTimestamp, true);
    assert.equal(result.lastSuccessAt, lastSuccess);
    // Data is still showing — no skeleton, no empty
    assert.equal(result.showLoadingSkeleton, false);
    assert.equal(result.showEmptyState, false);
  });

  it('error + no data + lastSuccessfulRefreshAt shows retry + timestamp', () => {
    const lastSuccess = NOW - 60_000;
    const result = decidePanelFrameState({
      refreshedAt: null,
      refreshError: ERROR,
      data: null,
      loading: false,
      lastSuccessfulRefreshAt: lastSuccess,
      now: NOW,
    });
    assert.equal(result.showRetry, true);
    assert.equal(result.showLastSuccessTimestamp, true);
    assert.equal(result.lastSuccessAt, lastSuccess);
  });

  it('error + no data + no prior success: retry only, no timestamp', () => {
    const result = decidePanelFrameState({
      refreshedAt: null,
      refreshError: ERROR,
      data: null,
      loading: false,
      now: NOW,
    });
    assert.equal(result.showRetry, true);
    assert.equal(result.showLastSuccessTimestamp, false);
    assert.equal(result.lastSuccessAt, null);
  });

  it('error + stale data: shows both stale warning and retry', () => {
    const staleAt = NOW - DEFAULT_STALE_THRESHOLD_MS - 5000;
    const result = decidePanelFrameState({
      refreshedAt: staleAt,
      refreshError: ERROR,
      data: { items: [1] },
      loading: false,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, true);
    assert.equal(result.showRetry, true);
    assert.equal(result.showLastSuccessTimestamp, true);
    assert.equal(result.lastSuccessAt, staleAt);
  });
});

// ---------------------------------------------------------------------------
// partialFailure encoding: showRetry + data present is partial failure
// ---------------------------------------------------------------------------

describe('panel freshness — partial failure (no dedicated field needed)', () => {
  const NOW = 1_700_000_000_000;
  const ERROR = { message: 'timeout' };

  it('partial failure = error + data present: showRetry=true with data still shown', () => {
    const result = decidePanelFrameState({
      refreshedAt: NOW - 60_000,
      refreshError: ERROR,
      data: { accounts: [{ id: 'x' }] },
      loading: false,
      now: NOW,
    });
    // The combination of showRetry=true and data being present IS the
    // partial failure state. No separate `partialFailure` flag is needed.
    assert.equal(result.showRetry, true);
    assert.equal(result.showLoadingSkeleton, false);
    assert.equal(result.showEmptyState, false);
    assert.equal(result.showLastSuccessTimestamp, true);
  });

  it('full failure = error + no data: skeleton-free, retry only', () => {
    const result = decidePanelFrameState({
      refreshedAt: null,
      refreshError: ERROR,
      data: null,
      loading: false,
      now: NOW,
    });
    assert.equal(result.showRetry, true);
    assert.equal(result.showLoadingSkeleton, false);
    assert.equal(result.showEmptyState, false); // error suppresses empty state
    assert.equal(result.showLastSuccessTimestamp, false);
  });
});

// ---------------------------------------------------------------------------
// Worker endpoint mock: refreshedAt in responses
// ---------------------------------------------------------------------------

describe('panel freshness — worker endpoint contract', () => {
  it('mock KPI response includes refreshedAt as ISO string', () => {
    const mockResponse = {
      ok: true,
      refreshedAt: '2026-04-28T14:00:00.000Z',
      generatedAt: 1745848800000,
      accounts: { total: 10, real: 8, demo: 2 },
    };
    assert.equal(typeof mockResponse.refreshedAt, 'string');
    const parsed = new Date(mockResponse.refreshedAt).getTime();
    assert.equal(Number.isFinite(parsed), true);
    assert.ok(parsed > 0, 'refreshedAt parses to a valid positive timestamp');
  });

  it('mock activity response includes refreshedAt as ISO string', () => {
    const mockResponse = {
      ok: true,
      refreshedAt: '2026-04-28T14:05:00.000Z',
      generatedAt: 1745849100000,
      entries: [],
    };
    assert.equal(typeof mockResponse.refreshedAt, 'string');
    const parsed = new Date(mockResponse.refreshedAt).getTime();
    assert.ok(parsed > 0);
  });

  it('mock content-overview response includes refreshedAt as ISO string', () => {
    const mockResponse = {
      ok: true,
      refreshedAt: '2026-04-28T14:10:00.000Z',
      generatedAt: 1745849400000,
      subjects: [
        { subjectKey: 'spelling', displayName: 'Spelling', status: 'live' },
      ],
    };
    assert.equal(typeof mockResponse.refreshedAt, 'string');
    const parsed = new Date(mockResponse.refreshedAt).getTime();
    assert.ok(parsed > 0);
  });

  it('mock marketing-messages response includes refreshedAt as ISO string', () => {
    const mockResponse = {
      ok: true,
      refreshedAt: '2026-04-28T14:15:00.000Z',
      messages: [],
      schedulingSemantics: 'manual_publish_required',
    };
    assert.equal(typeof mockResponse.refreshedAt, 'string');
    const parsed = new Date(mockResponse.refreshedAt).getTime();
    assert.ok(parsed > 0);
  });

  it('mock accounts-metadata response includes refreshedAt as ISO string', () => {
    const mockResponse = {
      ok: true,
      refreshedAt: '2026-04-28T14:20:00.000Z',
      generatedAt: 1745850000000,
      accounts: [],
    };
    assert.equal(typeof mockResponse.refreshedAt, 'string');
    const parsed = new Date(mockResponse.refreshedAt).getTime();
    assert.ok(parsed > 0);
  });

  it('mock production-evidence response includes refreshedAt as ISO string', () => {
    const mockResponse = {
      ok: true,
      refreshedAt: '2026-04-28T14:25:00.000Z',
      schema: 2,
      metrics: {},
      generatedAt: '2026-04-28T10:00:00.000Z',
    };
    assert.equal(typeof mockResponse.refreshedAt, 'string');
    const parsed = new Date(mockResponse.refreshedAt).getTime();
    assert.ok(parsed > 0);
  });
});

// ---------------------------------------------------------------------------
// decidePanelFrameState — all state combinations summary
// ---------------------------------------------------------------------------

describe('panel freshness — complete state matrix', () => {
  const NOW = 1_700_000_000_000;
  const FRESH = NOW - 60_000;
  const STALE = NOW - DEFAULT_STALE_THRESHOLD_MS - 1;
  const ERROR = { message: 'error' };

  // Matrix: [data, loading, error, refreshedAt] → expected outputs
  const matrix = [
    // Fresh happy path
    { data: [1], loading: false, error: null, refreshedAt: FRESH, expect: { stale: false, skeleton: false, empty: false, retry: false, lastTs: false } },
    // Stale data
    { data: [1], loading: false, error: null, refreshedAt: STALE, expect: { stale: true, skeleton: false, empty: false, retry: false, lastTs: false } },
    // Empty fresh
    { data: [], loading: false, error: null, refreshedAt: FRESH, expect: { stale: false, skeleton: false, empty: true, retry: false, lastTs: false } },
    // Loading no data
    { data: null, loading: true, error: null, refreshedAt: null, expect: { stale: false, skeleton: true, empty: false, retry: false, lastTs: false } },
    // Loading with data
    { data: [1], loading: true, error: null, refreshedAt: FRESH, expect: { stale: false, skeleton: false, empty: false, retry: false, lastTs: false } },
    // Error no data no prior
    { data: null, loading: false, error: ERROR, refreshedAt: null, expect: { stale: false, skeleton: false, empty: false, retry: true, lastTs: false } },
    // Error no data with prior
    { data: null, loading: false, error: ERROR, refreshedAt: FRESH, expect: { stale: false, skeleton: false, empty: false, retry: true, lastTs: true } },
    // Error with data (partial failure)
    { data: [1], loading: false, error: ERROR, refreshedAt: FRESH, expect: { stale: false, skeleton: false, empty: false, retry: true, lastTs: true } },
    // Error + stale data
    { data: [1], loading: false, error: ERROR, refreshedAt: STALE, expect: { stale: true, skeleton: false, empty: false, retry: true, lastTs: true } },
    // Error + loading (in-flight retry)
    { data: null, loading: true, error: ERROR, refreshedAt: null, expect: { stale: false, skeleton: true, empty: false, retry: false, lastTs: false } },
    // Unknown freshness (null) with data
    { data: { x: 1 }, loading: false, error: null, refreshedAt: null, expect: { stale: false, skeleton: false, empty: false, retry: false, lastTs: false } },
  ];

  matrix.forEach(({ data, loading, error, refreshedAt, expect }, idx) => {
    it(`state combination ${idx}: data=${JSON.stringify(data)?.slice(0, 20)}, loading=${loading}, error=${!!error}, refreshedAt=${refreshedAt ? 'set' : 'null'}`, () => {
      const result = decidePanelFrameState({
        refreshedAt,
        refreshError: error,
        data,
        loading,
        now: NOW,
      });
      assert.equal(result.showStaleWarning, expect.stale, 'showStaleWarning');
      assert.equal(result.showLoadingSkeleton, expect.skeleton, 'showLoadingSkeleton');
      assert.equal(result.showEmptyState, expect.empty, 'showEmptyState');
      assert.equal(result.showRetry, expect.retry, 'showRetry');
      assert.equal(result.showLastSuccessTimestamp, expect.lastTs, 'showLastSuccessTimestamp');
    });
  });
});

// ---------------------------------------------------------------------------
// ISO string conversion: panels that receive ISO from the worker
// ---------------------------------------------------------------------------

describe('panel freshness — ISO string to ms conversion', () => {
  it('ISO string refreshedAt converts to valid ms for decidePanelFrameState', () => {
    const isoString = '2026-04-28T14:00:00.000Z';
    const ms = new Date(isoString).getTime();
    const NOW = ms + 60_000; // 1 minute later
    const result = decidePanelFrameState({
      refreshedAt: ms,
      refreshError: null,
      data: { x: 1 },
      loading: false,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, false);
    assert.equal(result.lastSuccessAt, ms);
  });

  it('stale ISO string triggers stale warning', () => {
    const isoString = '2026-04-28T14:00:00.000Z';
    const ms = new Date(isoString).getTime();
    const NOW = ms + DEFAULT_STALE_THRESHOLD_MS + 1; // just past threshold
    const result = decidePanelFrameState({
      refreshedAt: ms,
      refreshError: null,
      data: { x: 1 },
      loading: false,
      now: NOW,
    });
    assert.equal(result.showStaleWarning, true);
    assert.equal(result.lastSuccessAt, ms);
  });

  it('invalid ISO string (empty) results in null lastSuccessAt', () => {
    const ms = new Date('').getTime(); // NaN
    const result = decidePanelFrameState({
      refreshedAt: ms,
      refreshError: null,
      data: { x: 1 },
      loading: false,
      now: Date.now(),
    });
    assert.equal(result.lastSuccessAt, null);
  });
});
