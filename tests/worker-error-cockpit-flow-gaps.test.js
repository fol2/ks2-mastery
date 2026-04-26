// Phase E / U20 coverage: explicit regression tests for the flow-gaps
// surfaced during the planning phase. Each scenario below is a named
// edge-case from the Phase E H-LTD analysis; pinning it with a test
// here ensures the behaviour cannot silently regress.
//
// Scenarios:
//   1. build-hash-null policy — NULL release never triggers auto-reopen;
//      written to last_seen_release as NULL; resolved_in_release
//      untouched.
//   2. resolved-in-X -> silent-in-X+1 -> recurs-in-X+2 — the X+1
//      silence does not count as a fresh resolve; reopen fires at X+2
//      with a new last_status_change_at; resolved_in_release preserved
//      as X until an admin manually re-resolves.
//   3. Canary / blue-green policy — P1.5 treats all releases equally;
//      a reopen triggered by a canary release IS still a reopen. This
//      trade-off is intentional per the plan.
//   4. Manual-reopen vs auto-reopen distinction — admin transitions
//      `resolved -> investigating` manually. A later event from a new
//      release after cooldown does NOT auto-reopen (condition 1 fails,
//      status is not 'resolved'). Admin-owned state wins.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U20

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

test('U20 flow-gap — build-hash-null: NULL release never triggers auto-reopen + written as NULL to last_seen_release', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const eventId = seedResolvedEvent(server, {
      resolvedInRelease: 'abc1234',
      lastStatusChangeAt: Date.now() - (48 * ONE_HOUR_MS),
    });

    // POST with release omitted — dirty-tree / pre-injection client.
    const response = await postEvent(server, matchingBody);
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    // Condition 3 fails: incoming release is null, rule does not fire.
    assert.equal(row.status, 'resolved');
    // last_seen_release is overwritten to NULL (the observation is real;
    // the absence of release stamp is real).
    assert.equal(row.last_seen_release, null);
    // resolved_in_release is preserved — untouched by dedup path.
    assert.equal(row.resolved_in_release, 'abc1234');
    // first_seen_release preserved (it's from the seed).
    assert.equal(row.first_seen_release, 'abc1234');
  } finally {
    server.close();
  }
});

test('U20 flow-gap — resolved-in-X -> silent-in-X+1 -> recurs-in-X+2: reopen fires at X+2, resolved_in_release stays X', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // T=0: seed a resolved row with resolved_in_release=X (aged past the
    // 24h cooldown so the first eligible new-release event can reopen).
    const eventId = seedResolvedEvent(server, {
      resolvedInRelease: 'aaa1111', // X
      lastStatusChangeAt: Date.now() - (48 * ONE_HOUR_MS),
    });

    // T+1: release X+1 ships but never posts an event (silent period).
    // No POST happens here — the row's status stays 'resolved' untouched.

    // T+2: release X+2 ships and an event matching the fingerprint arrives.
    // Condition 4 requires release != resolved_in_release: X+2 != X, satisfied.
    const recurrenceResponse = await postEvent(server, { ...matchingBody, release: 'ccc3333' });
    assert.equal(recurrenceResponse.status, 200);

    const row = readEvent(server, eventId);
    // Reopen fires at X+2.
    assert.equal(row.status, 'open');
    // last_seen_release is now X+2 (the recurrence release).
    assert.equal(row.last_seen_release, 'ccc3333');
    // resolved_in_release stays X — forensic history: "this was resolved
    // in release X but regressed at X+2". An admin must re-resolve to
    // update the stamp.
    assert.equal(row.resolved_in_release, 'aaa1111');
  } finally {
    server.close();
  }
});

test('U20 flow-gap — canary release treated equally: reopen still fires from any non-matching SHA', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Seed a resolved row from release A, past cooldown.
    const eventId = seedResolvedEvent(server, {
      resolvedInRelease: 'mainabc',
      lastStatusChangeAt: Date.now() - (25 * ONE_HOUR_MS),
    });

    // Canary build X+1 ships. P1.5 has no canary-aware SHA labelling —
    // this is just a different SHA. Condition 4 is satisfied. Use a
    // hex-only literal ("ca1ea71") so the regex accepts it; the real
    // production canary tooling would stamp a genuine git SHA anyway.
    const response = await postEvent(server, { ...matchingBody, release: 'ca1ea71' });
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    // Reopen fires. If canary-aware suppression ever ships, this test
    // will need updating — but that is a deliberate future revisit per
    // the plan, not silent behaviour drift.
    assert.equal(row.status, 'open');
  } finally {
    server.close();
  }
});

test('U20 flow-gap — admin transitions resolved -> investigating manually; later new-release event does NOT auto-reopen', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Seed a row in status='investigating' with resolved_in_release set
    // (mirrors an admin who manually moved the row out of resolved).
    // Condition 1 (status === 'resolved') MUST fail even though all
    // other conditions look auto-reopen eligible.
    const now = Date.now();
    const eventId = 'evt-investigating';
    server.DB.db.prepare(`
      INSERT INTO ops_error_events (
        id, fingerprint, error_kind, message_first_line, first_frame, route_name,
        user_agent, account_id, occurrence_count, first_seen, last_seen, status,
        first_seen_release, last_seen_release, resolved_in_release, last_status_change_at
      )
      VALUES (?, ?, 'TypeError', 'x is undefined', 'at foo (bar.js:1)', '/api/foo', 'UA',
              NULL, 1, ?, ?, 'investigating', 'aaa1111', 'aaa1111', 'aaa1111', ?)
    `).run(eventId, `fp-${eventId}`, now, now, now - (48 * ONE_HOUR_MS));

    // New release posts an event. Condition 1 fails -> no reopen.
    const response = await postEvent(server, { ...matchingBody, release: 'bbb2222' });
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    assert.equal(row.status, 'investigating');
  } finally {
    server.close();
  }
});

test('U20 flow-gap — occurrence_count still bumps on dedup even when auto-reopen does not fire', async () => {
  const server = createWorkerRepositoryServer();
  try {
    // Row is 'open' from fresh seed so condition 1 fails for auto-reopen,
    // but the dedup UPDATE must still bump occurrence_count + last_seen
    // (the base case: duplicate events from the same error always
    // accumulate the counter, regardless of release-tracking columns).
    const now = Date.now();
    const eventId = 'evt-open';
    server.DB.db.prepare(`
      INSERT INTO ops_error_events (
        id, fingerprint, error_kind, message_first_line, first_frame, route_name,
        user_agent, account_id, occurrence_count, first_seen, last_seen, status
      )
      VALUES (?, ?, 'TypeError', 'x is undefined', 'at foo (bar.js:1)', '/api/foo', 'UA',
              NULL, 5, ?, ?, 'open')
    `).run(eventId, `fp-${eventId}`, now, now);

    const response = await postEvent(server, { ...matchingBody, release: 'deadbee' });
    assert.equal(response.status, 200);

    const row = readEvent(server, eventId);
    assert.equal(row.status, 'open');
    assert.equal(row.occurrence_count, 6);
    // last_seen_release reflects the incoming event.
    assert.equal(row.last_seen_release, 'deadbee');
  } finally {
    server.close();
  }
});
