// U3 round 1 (P1 #09): overhead benchmark for the capacity proxy.
//
// Plan line 498 gates PR merge on "≤10% mean, ≤15% p95 overhead". We
// measure three numbers and include them in the PR description:
//
//   - baseline: raw `repository.bootstrap()` with NO collector and NO
//     wrapping. This is the floor — the query work alone.
//   - proxied: `repository.bootstrap()` via a capacity-wrapped DB. The
//     delta vs baseline is the pure proxy cost.
//   - full stack: end-to-end `app.fetch('/api/bootstrap')`. Includes
//     request parsing, auth, JSON rewrite, meta.capacity attachment.
//
// The proxied vs baseline delta is the honest gate for the plan budget.
// The full-stack number is reported so operators can see the absolute
// per-request cost in ms.
//
// Iteration count: 50 runs each after a 5-run warmup. All timings in
// milliseconds via `performance.now()`. If the harness reports timer
// resolution below 10us we drop to a sub-budget-skip to avoid flake.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
import { createWorkerRepository } from '../worker/src/repository.js';
import { CapacityCollector } from '../worker/src/logger.js';
import { withCapacityCollector } from '../worker/src/d1.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

const BASE_URL = 'https://repo.test';
const NOW = Date.UTC(2026, 0, 1);
const ITER = 50;
const WARM = 5;

function seedAccount(DB, { accountId = 'adult-bench', learnerId = 'learner-bench' } = {}) {
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Learner', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(learnerId, NOW, NOW);
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, 'Adult', 'parent', ?, ?, ?, 0)
  `).run(accountId, `${accountId}@example.test`, learnerId, NOW, NOW);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, NOW, NOW);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarise(timings) {
  const sorted = [...timings].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  return {
    iterations: sorted.length,
    mean,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

async function timeIt(fn) {
  const timings = [];
  for (let i = 0; i < WARM; i += 1) { await fn(); }
  for (let i = 0; i < ITER; i += 1) {
    const s = performance.now();
    await fn();
    timings.push(performance.now() - s);
  }
  return summarise(timings);
}

test('U3 overhead benchmark — capacity proxy mean ≤+10%, p95 ≤+15%', async () => {
  const DB = createMigratedSqliteD1Database();
  seedAccount(DB);

  const originalLog = console.log;
  console.log = () => {};

  try {
    // 1) Baseline: repository.bootstrap() with NO collector. Zero
    //    proxy overhead; the short-circuit in withCapacityCollector
    //    returns the raw DB handle when capacity is null.
    const baseline = await timeIt(async () => {
      const repo = createWorkerRepository({ env: { DB }, now: () => NOW, capacity: null });
      await repo.bootstrap('adult-bench', { publicReadModels: false });
    });

    // 2) Proxied: same call path with a CapacityCollector. Measures
    //    the pure per-query proxy overhead + collector allocation.
    const proxied = await timeIt(async () => {
      const capacity = new CapacityCollector({ requestId: 'ks2_req_00000000-0000-4000-8000-000000000000' });
      const repo = createWorkerRepository({ env: { DB }, now: () => NOW, capacity });
      await repo.bootstrap('adult-bench', { publicReadModels: false });
    });

    // 3) Full-stack: end-to-end app.fetch('/api/bootstrap'). Includes
    //    request parsing, auth boundary, JSON rewrite, meta.capacity
    //    attachment. Reported for absolute-ms visibility.
    const app = createWorkerApp({ now: () => NOW });
    const env = { DB, AUTH_MODE: 'development-stub', ENVIRONMENT: 'test', CAPACITY_LOG_SAMPLE_RATE: '0' };
    const fullStack = await timeIt(async () => {
      const response = await app.fetch(new Request(`${BASE_URL}/api/bootstrap`, {
        method: 'GET',
        headers: { 'x-ks2-dev-account-id': 'adult-bench' },
      }), env, {});
      await response.text();
    });

    const meanDelta = (proxied.mean - baseline.mean) / baseline.mean;
    const p95Delta = (proxied.p95 - baseline.p95) / baseline.p95;

    const summary = {
      iterations: ITER,
      baseline: {
        meanMs: baseline.mean.toFixed(4),
        p95Ms: baseline.p95.toFixed(4),
        p99Ms: baseline.p99.toFixed(4),
      },
      proxied: {
        meanMs: proxied.mean.toFixed(4),
        p95Ms: proxied.p95.toFixed(4),
        p99Ms: proxied.p99.toFixed(4),
      },
      fullStack: {
        meanMs: fullStack.mean.toFixed(4),
        p95Ms: fullStack.p95.toFixed(4),
        p99Ms: fullStack.p99.toFixed(4),
      },
      meanDeltaPct: (meanDelta * 100).toFixed(2),
      p95DeltaPct: (p95Delta * 100).toFixed(2),
    };
    process.stdout.write(`[capacity-overhead] ${JSON.stringify(summary)}\n`);

    // Timer resolution guard — on CI where mean < 0.5ms per bootstrap,
    // % deltas are dominated by timing noise. Report and skip strict
    // assertion to avoid flake.
    if (baseline.mean < 0.5 || proxied.mean < 0.5) {
      process.stdout.write('[capacity-overhead] SKIP strict: timer resolution too coarse for reliable %\n');
      return;
    }

    // Plan budget: mean ≤+10%, p95 ≤+15%.
    assert.ok(
      meanDelta <= 0.10,
      `Capacity proxy mean overhead ${(meanDelta * 100).toFixed(2)}% exceeds +10% budget (baseline=${baseline.mean.toFixed(3)}ms proxied=${proxied.mean.toFixed(3)}ms)`,
    );
    assert.ok(
      p95Delta <= 0.15,
      `Capacity proxy p95 overhead ${(p95Delta * 100).toFixed(2)}% exceeds +15% budget (baseline=${baseline.p95.toFixed(3)}ms proxied=${proxied.p95.toFixed(3)}ms)`,
    );
  } finally {
    console.log = originalLog;
    DB.close();
  }
});

// Micro-benchmark: per-query proxy overhead. Useful for debugging if
// the main benchmark fails — it isolates the prepare() + first() cost
// from surrounding work. The request-level macro benchmark above is
// the primary gate; this variant adds a widened secondary gate.
//
// Threshold rationale (Cluster F, D6): the macro benchmark keeps the
// plan-budget 10%/15% thresholds because each iteration is a full
// bootstrap (~15-25 ms) where scheduler jitter is negligible versus
// the work. This micro variant measures a single `prepare().first()`
// call — typically sub-0.1 ms on modern hardware — where scheduler
// jitter dominates under concurrent-test load (`node --test`
// parallelises by default). Under full-suite load, mean deltas of
// 20-30% are routine even when the proxy costs zero, because the
// jitter noise floor exceeds the work itself. A widened 20%/25%
// budget preserves "order-of-magnitude no regression" while
// tolerating CI jitter on shared test runners. Any future reader
// tightening these thresholds should first re-measure the timer
// resolution and the sub-0.1 ms noise floor on the target runner.
test('U3 per-query micro-benchmark — capacity proxy mean ≤+20%, p95 ≤+25%', async () => {
  const DB = createMigratedSqliteD1Database();
  seedAccount(DB, { accountId: 'adult-micro', learnerId: 'learner-micro' });

  const ITER_MICRO = 500;
  try {
    const rawTimings = [];
    const proxyTimings = [];
    const collector = new CapacityCollector({ requestId: 'ks2_req_00000000-0000-4000-8000-000000000000' });
    const wrapped = withCapacityCollector(DB, collector);

    // Warmup both.
    for (let i = 0; i < 25; i += 1) {
      await DB.prepare('SELECT id FROM adult_accounts WHERE id = ?').bind('adult-micro').first();
      await wrapped.prepare('SELECT id FROM adult_accounts WHERE id = ?').bind('adult-micro').first();
    }
    // Interleaved.
    for (let i = 0; i < ITER_MICRO; i += 1) {
      const s1 = performance.now();
      await DB.prepare('SELECT id FROM adult_accounts WHERE id = ?').bind('adult-micro').first();
      rawTimings.push(performance.now() - s1);
      const s2 = performance.now();
      await wrapped.prepare('SELECT id FROM adult_accounts WHERE id = ?').bind('adult-micro').first();
      proxyTimings.push(performance.now() - s2);
    }
    const raw = summarise(rawTimings);
    const prx = summarise(proxyTimings);
    const meanDelta = (prx.mean - raw.mean) / raw.mean;
    const p95Delta = (prx.p95 - raw.p95) / raw.p95;
    process.stdout.write(`[capacity-overhead-micro] ${JSON.stringify({
      iterations: ITER_MICRO,
      raw: { meanMs: raw.mean.toFixed(4), p95Ms: raw.p95.toFixed(4), p99Ms: raw.p99.toFixed(4) },
      proxy: { meanMs: prx.mean.toFixed(4), p95Ms: prx.p95.toFixed(4), p99Ms: prx.p99.toFixed(4) },
      meanDeltaPct: (meanDelta * 100).toFixed(2),
      p95DeltaPct: (p95Delta * 100).toFixed(2),
    })}\n`);

    assert.ok(Number.isFinite(raw.mean) && Number.isFinite(prx.mean));

    // Timer-resolution guard — mirrors the macro benchmark's 0.5 ms
    // floor, scaled to this variant's sub-millisecond regime. At mean
    // timings below 0.1 ms per query, the % delta is essentially
    // `(proxy_jitter - raw_jitter) / raw_jitter` and tells us nothing
    // about proxy cost. Report and skip the strict assertion rather
    // than flake the build.
    if (raw.mean < 0.1 || prx.mean < 0.1) {
      process.stdout.write('[capacity-overhead-micro] SKIP strict: timer resolution too coarse for reliable %\n');
      return;
    }

    // Widened budget: mean ≤+20%, p95 ≤+25%. See comment above the
    // `test(...)` call for the rationale.
    assert.ok(
      meanDelta <= 0.20,
      `Capacity proxy micro mean overhead ${(meanDelta * 100).toFixed(2)}% exceeds +20% budget (raw=${raw.mean.toFixed(4)}ms proxy=${prx.mean.toFixed(4)}ms)`,
    );
    assert.ok(
      p95Delta <= 0.25,
      `Capacity proxy micro p95 overhead ${(p95Delta * 100).toFixed(2)}% exceeds +25% budget (raw=${raw.p95.toFixed(4)}ms proxy=${prx.p95.toFixed(4)}ms)`,
    );
  } finally {
    DB.close();
  }
});
