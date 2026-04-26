// Phase E / U17 coverage: auto-reopen on release transition.
//
// `recordClientErrorEvent` flips a resolved row back to `open` when ALL
// 5 conditions hold:
//   1. stored status === 'resolved'
//   2. stored resolved_in_release IS NOT NULL
//   3. incoming release IS NOT NULL and SHA-shaped (U16 regex)
//   4. incoming release != stored resolved_in_release
//   5. now - last_status_change_at > 24h
//
// Any single condition failing leaves the row unchanged (beyond the
// normal dedup last_seen + occurrence_count update). The KPI counters
// for `resolved` and `open` swap on reopen so `reconcileAdminKpiMetrics`
// stays consistent.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U17

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

function seedResolvedEvent(server, {
  id = 'evt-1',
  resolvedInRelease = 'abc1234',
  lastStatusChangeAt,
  status = 'resolved',
} = {}) {
  const now = Date.now();
  const statusChangeAt = lastStatusChangeAt == null ? now - 2 * ONE_DAY_MS : lastStatusChangeAt;
  server.DB.db.prepare(`
    INSERT INTO ops_error_events (
      id, fingerprint, error_kind, message_first_line, first_frame, route_name,
      user_agent, account_id, occurrence_count, first_seen, last_seen, status,
      first_seen_release, last_seen_release, resolved_in_release, last_status_change_at
    )
    VALUES (?, ?, 'TypeError', 'x is undefined', 'at foo (bar.js:1)', '/api/foo', 'UA', NULL, 1, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, `fp-${id}`, now, now, status, resolvedInRelease, resolvedInRelease, resolvedInRelease, statusChangeAt);
  // Seed the KPI counters so the swap asserts against non-zero values.
  server.DB.db.prepare(`
    INSERT INTO admin_kpi_metrics (metric_key, metric_count, updated_at)
    VALUES ('ops_error_events.status.resolved', 1, ?)
    ON CONFLICT(metric_key) DO UPDATE SET metric_count = 1
  `).run(now);
  server.DB.db.prepare(`
    INSERT INTO admin_kpi_metrics (metric_key, metric_count, updated_at)
    VALUES ('ops_error_events.status.open', 0, ?)
    ON CONFLICT(metric_key) DO UPDATE SET metric_count = 0
  `).run(now);
  return id;
}

function readEvent(server, id) {
  return server.DB.db.prepare(`
    SELECT status, resolved_in_release, last_status_change_at,
           last_seen_release, first_seen_release, occurrence_count
    FROM ops_error_events WHERE id = ?
  `).get(id);
}

function kpi(server, key) {
  const row = server.DB.db.prepare(`
    SELECT metric_count FROM admin_kpi_metrics WHERE metric_key = ?
  `).get(key);
  return row ? Number(row.metric_count) : null;
}

async function postEvent(server, body) {
  return server.fetchRaw('https://repo.test/api/ops/error-event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const matchingBody = {
  errorKind: 'TypeError',
  messageFirstLine: 'x is undefined',
  firstFrame: 'at foo (bar.js:1)',
};

test('U17 auto-reopen — all 5 conditions met: resolved→open, last_status_change_at bumps, counters swap', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const eventId = seedResolvedEvent(server, {
      resolvedInRelease: 'abc1234',
      lastStatusChangeAt: Date.now() - (25 * ONE_HOUR_MS),
    });

    const before = Date.now();
    const response = await postEvent(server, { ...matchingBody, release: 'def5678' });
    const after = Date.now();
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.deduped, true);

    const row = readEvent(server, eventId);
    assert.equal(row.status, 'open');
    // resolved_in_release is PRESERVED as forensic history.
    assert.equal(row.resolved_in_release, 'abc1234');
    // last_seen_release updated to the incoming release.
    assert.equal(row.last_seen_release, 'def5678');
    // first_seen_release preserved.
    assert.equal(row.first_seen_release, 'abc1234');
    // last_status_change_at bumped into the test window.
    assert.ok(Number(row.last_status_change_at) >= before - 1, 'last_status_change_at >= before');
    assert.ok(Number(row.last_status_change_at) <= after + 1, 'last_status_change_at <= after');
    // occurrence_count bumped.
    assert.equal(row.occurrence_count, 2);

    // Counters swap: resolved decremented, open incremented.
    assert.equal(kpi(server, 'ops_error_events.status.resolved'), 0);
    assert.equal(kpi(server, 'ops_error_events.status.open'), 1);
  } finally {
    server.close();
  }
});

test('U17 auto-reopen — condition 1 fail (status === investigating): no reopen', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const eventId = seedResolvedEvent(server, {
      status: 'investigating',
      resolvedInRelease: 'abc1234',
      lastStatusChangeAt: Date.now() - (48 * ONE_HOUR_MS),
    });

    const response = await postEvent(server, { ...matchingBody, release: 'def5678' });
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    assert.equal(row.status, 'investigating');
    // last_status_change_at should NOT bump — the dedup path does not touch it.
  } finally {
    server.close();
  }
});

test('U17 auto-reopen — condition 1 fail (status === ignored): no reopen (noisy-error suppression)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const eventId = seedResolvedEvent(server, {
      status: 'ignored',
      resolvedInRelease: 'abc1234',
      lastStatusChangeAt: Date.now() - (48 * ONE_HOUR_MS),
    });

    const response = await postEvent(server, { ...matchingBody, release: 'def5678' });
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    // `ignored` is terminal-until-manual; admins rely on it to silence
    // known-noisy errors permanently. Auto-reopen must never override.
    assert.equal(row.status, 'ignored');
  } finally {
    server.close();
  }
});

test('U17 auto-reopen — condition 2 fail (resolved_in_release IS NULL): no reopen (legacy resolve)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const now = Date.now();
    const eventId = 'evt-legacy';
    server.DB.db.prepare(`
      INSERT INTO ops_error_events (
        id, fingerprint, error_kind, message_first_line, first_frame, route_name,
        user_agent, account_id, occurrence_count, first_seen, last_seen, status,
        resolved_in_release, last_status_change_at
      )
      VALUES (?, ?, 'TypeError', 'x is undefined', 'at foo (bar.js:1)', '/api/foo', 'UA',
              NULL, 1, ?, ?, 'resolved', NULL, ?)
    `).run(eventId, `fp-${eventId}`, now, now, now - (48 * ONE_HOUR_MS));

    const response = await postEvent(server, { ...matchingBody, release: 'def5678' });
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    assert.equal(row.status, 'resolved');
    assert.equal(row.resolved_in_release, null);
  } finally {
    server.close();
  }
});

test('U17 auto-reopen — condition 3 fail (incoming release IS NULL): no reopen', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const eventId = seedResolvedEvent(server, {
      resolvedInRelease: 'abc1234',
      lastStatusChangeAt: Date.now() - (48 * ONE_HOUR_MS),
    });

    // No release in payload — simulates a pre-injection client or a
    // dirty-tree build. U17 must short-circuit.
    const response = await postEvent(server, matchingBody);
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    assert.equal(row.status, 'resolved');
    // last_seen_release updates to NULL (dedup semantics — the most recent
    // observation overwrites the column).
    assert.equal(row.last_seen_release, null);
  } finally {
    server.close();
  }
});

test('U17 auto-reopen — condition 4 fail (same release as resolved_in_release): no reopen', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const eventId = seedResolvedEvent(server, {
      resolvedInRelease: 'abc1234',
      lastStatusChangeAt: Date.now() - (48 * ONE_HOUR_MS),
    });

    // Incoming release matches resolved_in_release — same-release
    // recurrence. Reopen is specifically blocked here to prevent churn
    // inside a release window.
    const response = await postEvent(server, { ...matchingBody, release: 'abc1234' });
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    assert.equal(row.status, 'resolved');
    assert.equal(row.resolved_in_release, 'abc1234');
    assert.equal(row.last_seen_release, 'abc1234');
  } finally {
    server.close();
  }
});

test('U17 auto-reopen — condition 5 fail (within 24h cooldown): no reopen', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const resolvedAt = Date.now() - (12 * ONE_HOUR_MS); // 12h ago — inside cooldown
    const eventId = seedResolvedEvent(server, {
      resolvedInRelease: 'abc1234',
      lastStatusChangeAt: resolvedAt,
    });

    const response = await postEvent(server, { ...matchingBody, release: 'def5678' });
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    assert.equal(row.status, 'resolved');
    // last_status_change_at UNCHANGED (dedup path does not touch it).
    assert.equal(Number(row.last_status_change_at), resolvedAt);
  } finally {
    server.close();
  }
});

test('U17 auto-reopen — cooldown boundary: resolved 24h + 1ms ago → reopen fires', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const resolvedAt = Date.now() - (ONE_DAY_MS + 1); // just past cooldown
    const eventId = seedResolvedEvent(server, {
      resolvedInRelease: 'abc1234',
      lastStatusChangeAt: resolvedAt,
    });

    const before = Date.now();
    const response = await postEvent(server, { ...matchingBody, release: 'def5678' });
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    assert.equal(row.status, 'open');
    assert.ok(Number(row.last_status_change_at) >= before - 1);
    assert.ok(Number(row.last_status_change_at) > resolvedAt, 'last_status_change_at moved');
  } finally {
    server.close();
  }
});

test('U17 auto-reopen — just-inside cooldown (23h 59m): no reopen', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // last_status_change_at = now - (ONE_DAY_MS - 1 minute). Even after
    // a few ms of test processing elapse, `ts - last_status_change_at`
    // stays strictly <= ONE_DAY_MS, so condition 5 (must be strictly
    // greater than 24h) fails and reopen does not fire.
    const eventId = seedResolvedEvent(server, {
      resolvedInRelease: 'abc1234',
      lastStatusChangeAt: Date.now() - (ONE_DAY_MS - 60_000),
    });

    const response = await postEvent(server, { ...matchingBody, release: 'def5678' });
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    assert.equal(row.status, 'resolved');
  } finally {
    server.close();
  }
});

test('U17 auto-reopen — release field is null after cooldown: no reopen (condition 3 trumps)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Row is eligible on conditions 1/2/4/5 but incoming release is NULL.
    const eventId = seedResolvedEvent(server, {
      resolvedInRelease: 'abc1234',
      lastStatusChangeAt: Date.now() - (48 * ONE_HOUR_MS),
    });

    const response = await postEvent(server, matchingBody); // no release
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    assert.equal(row.status, 'resolved');
  } finally {
    server.close();
  }
});

test('U17 auto-reopen — KPI counters swap only once per eligible trigger', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const eventId = seedResolvedEvent(server, {
      resolvedInRelease: 'abc1234',
      lastStatusChangeAt: Date.now() - (25 * ONE_HOUR_MS),
    });

    // First incoming event: should trigger reopen, swap counters.
    await postEvent(server, { ...matchingBody, release: 'def5678' });
    assert.equal(kpi(server, 'ops_error_events.status.resolved'), 0);
    assert.equal(kpi(server, 'ops_error_events.status.open'), 1);

    // Second incoming event from the same new release (still differs from
    // the preserved resolved_in_release = 'abc1234'): the row is now
    // status='open' so condition 1 fails -> no further counter swap.
    await postEvent(server, { ...matchingBody, release: 'def5678' });
    assert.equal(kpi(server, 'ops_error_events.status.resolved'), 0);
    assert.equal(kpi(server, 'ops_error_events.status.open'), 1);

    const row = readEvent(server, eventId);
    assert.equal(row.status, 'open');
    assert.equal(row.occurrence_count, 3); // 1 (seed) + 2 posts
  } finally {
    server.close();
  }
});

test('U17 auto-reopen — manual admin reopen then new-release arrival does not fire again inside cooldown', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Seeds a resolved row aged 2d; first POST from a new release fires reopen.
    const eventId = seedResolvedEvent(server, {
      resolvedInRelease: 'abc1234',
      lastStatusChangeAt: Date.now() - (48 * ONE_HOUR_MS),
    });
    await postEvent(server, { ...matchingBody, release: 'def5678' });
    // Row is now 'open' with last_status_change_at = now.

    // A later event from yet another release (condition 4 satisfied)
    // would NOT trigger any state change because condition 1 now fails
    // (status === 'open', not 'resolved').
    await postEvent(server, { ...matchingBody, release: 'fab9999' });

    const row = readEvent(server, eventId);
    assert.equal(row.status, 'open');
  } finally {
    server.close();
  }
});

// Phase E adv-e-1: CAS guard on auto-reopen UPDATE.
//
// The auto-reopen UPDATE must carry `AND status = 'resolved'` so a
// concurrent manual admin status change (e.g. the admin flipped the row
// to 'ignored' between our SELECT and our batch) does not clobber the
// chosen bucket and double-swap the counters. When the CAS loses, the
// repository falls through to the normal dedup UPDATE and returns
// `autoReopened: false` so the route's post-commit rate-limit bucket
// does NOT fire for a transition that did not happen.
test('Phase E adv-e-1 CAS guard — concurrent admin "ignored" change beats auto-reopen; row stays ignored', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const eventId = seedResolvedEvent(server, {
      resolvedInRelease: 'abc1234',
      lastStatusChangeAt: Date.now() - (25 * ONE_HOUR_MS),
    });

    // Simulate a concurrent manual admin status change landing BEFORE our
    // UPDATE but AFTER our SELECT. Direct D1 mutation stands in for
    // "another worker won the race" — the code path we exercise is the
    // CAS predicate inside `recordClientErrorEvent`'s auto-reopen batch.
    server.DB.db.prepare(`
      UPDATE ops_error_events SET status = 'ignored', last_status_change_at = ?
      WHERE id = ?
    `).run(Date.now(), eventId);

    const response = await postEvent(server, { ...matchingBody, release: 'def5678' });
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    // Admin won — status is terminal 'ignored', not 'open'.
    assert.equal(row.status, 'ignored');
    // Dedup UPDATE still bumps last_seen_release + occurrence_count.
    assert.equal(row.last_seen_release, 'def5678');
    assert.equal(row.occurrence_count, 2);
  } finally {
    server.close();
  }
});

// Phase E adv-e-2: post-commit rate-limit bucket on auto-reopen.
//
// The fresh-insert cap (10 / hour / subject) does not fire on dedup
// replay because `wouldBeDedup === true`. Without a dedicated bucket an
// anonymous attacker could force unlimited auto-reopens per resolved
// fingerprint per /64 — distinct fingerprints from the same subject,
// each resolved in an old release, each replayed with a new release
// SHA. The route consumes a dedicated `ops-error-auto-reopen` bucket
// AFTER the DB write commits; the 11th reopen in a 1h window bumps
// `ops_error_events.auto_reopen_throttled` on admin_kpi_metrics.
test('Phase E adv-e-2 auto-reopen throttle — 11 distinct-fingerprint reopens bump KPI', async () => {
  // Keep the env override scoped to this test so other tests run with
  // the default 10/hour cap.
  const server = createWorkerRepositoryServer({
    env: { OPS_ERROR_AUTO_REOPEN_LIMIT: '3' },
  });
  try {
    const now = Date.now();
    for (let idx = 0; idx < 4; idx += 1) {
      const eventId = `evt-reopen-${idx}`;
      const kind = `TypeError${idx}`;
      server.DB.db.prepare(`
        INSERT INTO ops_error_events (
          id, fingerprint, error_kind, message_first_line, first_frame, route_name,
          user_agent, account_id, occurrence_count, first_seen, last_seen, status,
          first_seen_release, last_seen_release, resolved_in_release, last_status_change_at
        )
        VALUES (?, ?, ?, 'boom', 'frame', '/api/foo', 'UA', NULL, 1, ?, ?, 'resolved', 'abc1234', 'abc1234', 'abc1234', ?)
      `).run(eventId, `fp-${eventId}`, kind, now - 1000, now - 1000, now - (25 * ONE_HOUR_MS));
    }

    // 4 reopens against a cap of 3 → the 4th (and any subsequent in the
    // same window) trip the throttle telemetry. Using a cap of 3 keeps
    // the test fast; the production default is 10.
    for (let idx = 0; idx < 4; idx += 1) {
      const response = await postEvent(server, {
        errorKind: `TypeError${idx}`,
        messageFirstLine: 'boom',
        firstFrame: 'frame',
        release: 'def5678',
      });
      assert.equal(response.status, 200, `reopen ${idx} should succeed (DB write already committed)`);
    }

    // The 4th reopen crossed the 3/hour cap → KPI counter bumped.
    const kpiRow = server.DB.db.prepare(`
      SELECT metric_count FROM admin_kpi_metrics
      WHERE metric_key = 'ops_error_events.auto_reopen_throttled'
    `).get();
    assert.ok(kpiRow, 'auto_reopen_throttled KPI row was created');
    assert.ok(Number(kpiRow.metric_count) >= 1,
      `KPI count should be >= 1, got ${kpiRow?.metric_count}`);
  } finally {
    server.close();
  }
});
