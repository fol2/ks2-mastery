// U9 (P7): Marketing lifecycle analytics tests.
//
// Tests cover:
//   1. Full lifecycle message shows all transition timestamps
//   2. "Not tracked yet" renders for analytics counters
//   3. Draft-only message shows no publish timestamp
//   4. Active message count computation from status + audience

import test from 'node:test';
import assert from 'node:assert/strict';

import { normaliseMarketingMessage } from '../src/platform/hubs/admin-marketing-message.js';
import {
  buildMarketingLifecycleModel,
  formatLifecycleTimestamp,
} from '../src/platform/hubs/admin-marketing-api.js';

// ---------------------------------------------------------------------------
// 1. Full lifecycle message shows all transition timestamps
// ---------------------------------------------------------------------------

test('lifecycle — full lifecycle message has publishedAt, pausedAt, archivedAt', () => {
  const raw = {
    id: 'msg-full',
    status: 'archived',
    title: 'Full lifecycle message',
    audience: 'all_signed_in',
    message_type: 'announcement',
    published_at: 1714200000000,
    paused_at: 1714300000000,
    archived_at: 1714400000000,
    created_at: 1714100000000,
    updated_at: 1714400000000,
    row_version: 4,
  };
  const normalised = normaliseMarketingMessage(raw);
  assert.equal(normalised.published_at, 1714200000000);
  assert.equal(normalised.paused_at, 1714300000000);
  assert.equal(normalised.archived_at, 1714400000000);
});

test('lifecycle — buildMarketingLifecycleModel surfaces all timestamps in lifecycleDisplayData', () => {
  const messages = [normaliseMarketingMessage({
    id: 'msg-full',
    status: 'archived',
    title: 'Full lifecycle',
    audience: 'all_signed_in',
    published_at: 1714200000000,
    paused_at: 1714300000000,
    archived_at: 1714400000000,
    created_at: 1714100000000,
  })];
  const { lifecycleDisplayData } = buildMarketingLifecycleModel(messages);
  assert.equal(lifecycleDisplayData.length, 1);
  const entry = lifecycleDisplayData[0];
  assert.equal(entry.publishedAt, 1714200000000);
  assert.equal(entry.pausedAt, 1714300000000);
  assert.equal(entry.archivedAt, 1714400000000);
  assert.equal(entry.createdAt, 1714100000000);
});

test('lifecycle — formatLifecycleTimestamp returns readable date string', () => {
  // 2024-04-27 10:00 UTC
  const ts = Date.UTC(2024, 3, 27, 10, 0, 0);
  const result = formatLifecycleTimestamp(ts);
  assert.ok(result !== null);
  assert.ok(result.includes('2024'));
  assert.ok(result.includes('04'));
  assert.ok(result.includes('27'));
});

test('lifecycle — formatLifecycleTimestamp returns null for null/undefined/NaN', () => {
  assert.equal(formatLifecycleTimestamp(null), null);
  assert.equal(formatLifecycleTimestamp(undefined), null);
  assert.equal(formatLifecycleTimestamp(NaN), null);
  assert.equal(formatLifecycleTimestamp('not-a-number'), null);
});

// ---------------------------------------------------------------------------
// 2. "Not tracked yet" renders for analytics counters
// ---------------------------------------------------------------------------

test('analytics counters — all counters report "Not tracked yet"', () => {
  const messages = [
    normaliseMarketingMessage({ id: 'msg-1', status: 'published', audience: 'all_signed_in' }),
  ];
  const { analyticsCounters } = buildMarketingLifecycleModel(messages);

  assert.equal(analyticsCounters.impressions.tracked, false);
  assert.equal(analyticsCounters.impressions.label, 'Not tracked yet');

  assert.equal(analyticsCounters.dismissals.tracked, false);
  assert.equal(analyticsCounters.dismissals.label, 'Not tracked yet');

  assert.equal(analyticsCounters.activeWindowHits.tracked, false);
  assert.equal(analyticsCounters.activeWindowHits.label, 'Not tracked yet');

  assert.equal(analyticsCounters.fetchFailures.tracked, false);
  assert.equal(analyticsCounters.fetchFailures.label, 'Not tracked yet');
});

test('analytics counters — counters are present even with empty messages list', () => {
  const { analyticsCounters } = buildMarketingLifecycleModel([]);
  assert.equal(analyticsCounters.impressions.tracked, false);
  assert.equal(analyticsCounters.dismissals.tracked, false);
  assert.equal(analyticsCounters.activeWindowHits.tracked, false);
  assert.equal(analyticsCounters.fetchFailures.tracked, false);
});

// ---------------------------------------------------------------------------
// 3. Draft-only message shows no publish timestamp
// ---------------------------------------------------------------------------

test('lifecycle — draft-only message has null publishedAt, pausedAt, archivedAt', () => {
  const raw = {
    id: 'msg-draft',
    status: 'draft',
    title: 'Draft only',
    audience: 'internal',
    message_type: 'announcement',
    published_at: null,
    paused_at: null,
    archived_at: null,
    created_at: 1714100000000,
    updated_at: 1714100000000,
    row_version: 0,
  };
  const normalised = normaliseMarketingMessage(raw);
  assert.equal(normalised.published_at, null);
  assert.equal(normalised.paused_at, null);
  assert.equal(normalised.archived_at, null);
});

test('lifecycle — draft-only in lifecycleDisplayData shows null timestamps', () => {
  const messages = [normaliseMarketingMessage({
    id: 'msg-draft',
    status: 'draft',
    title: 'Draft only',
    audience: 'internal',
    created_at: 1714100000000,
  })];
  const { lifecycleDisplayData } = buildMarketingLifecycleModel(messages);
  const entry = lifecycleDisplayData[0];
  assert.equal(entry.publishedAt, null);
  assert.equal(entry.pausedAt, null);
  assert.equal(entry.archivedAt, null);
  assert.equal(entry.createdAt, 1714100000000);
});

// ---------------------------------------------------------------------------
// 4. Active message count computation
// ---------------------------------------------------------------------------

test('active count — counts only published + all_signed_in messages', () => {
  const messages = [
    normaliseMarketingMessage({ id: 'm1', status: 'published', audience: 'all_signed_in' }),
    normaliseMarketingMessage({ id: 'm2', status: 'published', audience: 'internal' }),
    normaliseMarketingMessage({ id: 'm3', status: 'published', audience: 'all_signed_in' }),
    normaliseMarketingMessage({ id: 'm4', status: 'draft', audience: 'all_signed_in' }),
    normaliseMarketingMessage({ id: 'm5', status: 'paused', audience: 'all_signed_in' }),
    normaliseMarketingMessage({ id: 'm6', status: 'scheduled', audience: 'all_signed_in' }),
  ];
  const { activeCount } = buildMarketingLifecycleModel(messages);
  assert.equal(activeCount, 2); // only m1 and m3
});

test('active count — zero when no published all_signed_in messages', () => {
  const messages = [
    normaliseMarketingMessage({ id: 'm1', status: 'draft', audience: 'internal' }),
    normaliseMarketingMessage({ id: 'm2', status: 'published', audience: 'internal' }),
    normaliseMarketingMessage({ id: 'm3', status: 'published', audience: 'demo' }),
  ];
  const { activeCount } = buildMarketingLifecycleModel(messages);
  assert.equal(activeCount, 0);
});

test('active count — zero for empty messages array', () => {
  const { activeCount } = buildMarketingLifecycleModel([]);
  assert.equal(activeCount, 0);
});

test('active count — handles null/undefined messages gracefully', () => {
  const { activeCount } = buildMarketingLifecycleModel(null);
  assert.equal(activeCount, 0);
  const result2 = buildMarketingLifecycleModel(undefined);
  assert.equal(result2.activeCount, 0);
});

// ---------------------------------------------------------------------------
// 5. normaliseMarketingMessage — lifecycleHistory field presence
// ---------------------------------------------------------------------------

test('lifecycle — lifecycleHistory defaults to null when not present in raw', () => {
  const normalised = normaliseMarketingMessage({ id: 'msg-1', status: 'draft' });
  assert.equal(normalised.lifecycleHistory, null);
});

test('lifecycle — lifecycleHistory preserved if set on raw payload', () => {
  const history = [{ from: 'draft', to: 'scheduled', at: 1714100000000 }];
  const normalised = normaliseMarketingMessage({
    id: 'msg-1',
    status: 'scheduled',
    lifecycleHistory: history,
  });
  assert.deepEqual(normalised.lifecycleHistory, history);
});
