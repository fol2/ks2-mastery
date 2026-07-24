#!/usr/bin/env node
/**
 * Staggered multi-learner spelling hammer — closer to 5 humans playing
 * concurrently than lockstep Promise.all starts.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createDemoSession, loadBootstrap, createRequestId } from './lib/production-smoke.mjs';

const origin = process.env.ORIGIN || 'https://ks2.eugnel.uk';
const paceMs = Number(process.env.PACE_MS || 100);
const staggerMs = Number(process.env.STAGGER_MS || 250);
const maxRounds = Number(process.env.MAX_ROUNDS || 10);
const learners = Math.max(1, Number(process.env.LEARNERS || 5));
const label = process.env.HAMMER_LABEL || `staggered-${learners}-pace-${paceMs}-stagger-${staggerMs}`;
const outDir = process.env.OUT_DIR || 'reports/capacity/evidence';
const slugs = (process.env.SLUGS || [
  'possess', 'position', 'possible', 'probably', 'promise', 'purpose',
  'quarter', 'question', 'recent', 'regular', 'reign', 'remember',
  'sentence', 'separate', 'special', 'straight', 'strange', 'strength',
].join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rawCommand({ cookie, learnerId, revision, command, payload }) {
  const requestId = createRequestId(`hammer-${command}`);
  const started = performance.now();
  let response; let text = ''; let payloadJson = null; let error = null;
  try {
    response = await fetch(new URL('/api/subjects/spelling/command', origin), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin,
        cookie,
      },
      body: JSON.stringify({
        subjectId: 'spelling',
        learnerId,
        command,
        requestId,
        correlationId: requestId,
        expectedLearnerRevision: revision,
        payload,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    text = await response.text();
    try { payloadJson = text ? JSON.parse(text) : null; } catch { payloadJson = null; }
  } catch (err) {
    error = String(err?.message || err);
  }
  const applied = Number(payloadJson?.mutation?.appliedRevision);
  const title = (!payloadJson && text) ? (text.match(/<title>([^<]+)<\/title>/i)?.[1] || null) : null;
  const cf1102 = Boolean(
    payloadJson?.error_code === 1102
    || /1102/i.test(String(title || ''))
    || /worker_exceeded_resource/i.test(text || '')
    || /Error 1102/i.test(text || ''),
  );
  return {
    status: response?.status ?? 0,
    wallMs: Number((performance.now() - started).toFixed(1)),
    bytes: text?.length || 0,
    body: text || null,
    error,
    title,
    cf1102,
    ok: payloadJson?.ok === true,
    payload: payloadJson,
    nextRevision: Number.isFinite(applied) ? applied : revision,
    ray: response?.headers?.get('cf-ray') || null,
    requestId: response?.headers?.get('x-ks2-request-id') || null,
    capacity: payloadJson?.meta?.capacity || null,
  };
}

async function runOneLearner(learnerIndex) {
  await sleep(learnerIndex * staggerMs);
  const { cookie, session } = await createDemoSession(origin);
  const boot = await loadBootstrap(origin, cookie, { expectedSession: session });
  let revision = boot.revision;
  const log = [];
  const hardFails = [];
  const statuses = {};
  let completedRounds = 0;
  let stoppedReason = 'max-rounds';
  const d1Reads = [];
  const serverWalls = [];

  for (let round = 0; round < maxRounds; round += 1) {
    const slug = slugs[(round + learnerIndex) % slugs.length];
    const steps = [
      { step: 'start', command: 'start-session', payload: { mode: 'single', slug, length: 1 } },
      { step: 'wrong', command: 'submit-answer', payload: { typed: `${slug}x` } },
      { step: 'correct', command: 'submit-answer', payload: { typed: slug } },
      { step: 'continue', command: 'continue-session', payload: {} },
    ];
    let failed = false;
    for (const entry of steps) {
      if (paceMs > 0) await sleep(paceMs);
      const result = await rawCommand({
        cookie,
        learnerId: boot.learnerId,
        revision,
        command: entry.command,
        payload: entry.payload,
      });
      statuses[String(result.status)] = (statuses[String(result.status)] || 0) + 1;
      revision = result.nextRevision;
      if (entry.step === 'wrong' && result.payload?.subjectReadModel?.feedback?.answer) {
        steps[2].payload = { typed: result.payload.subjectReadModel.feedback.answer };
      }
      if (typeof result.capacity?.d1RowsRead === 'number') d1Reads.push(result.capacity.d1RowsRead);
      if (typeof result.capacity?.wallMs === 'number') serverWalls.push(result.capacity.wallMs);
      const row = {
        learnerIndex,
        learnerId: boot.learnerId,
        step: entry.step,
        round,
        slug,
        status: result.status,
        wallMs: result.wallMs,
        ray: result.ray,
        requestId: result.requestId,
        title: result.title,
        cf1102: result.cf1102,
        signals: result.capacity?.signals || [],
        serverWallMs: result.capacity?.wallMs ?? null,
        d1RowsRead: result.capacity?.d1RowsRead ?? null,
        code: result.payload?.code || null,
        bodySnippet: (result.status >= 400 || result.cf1102) ? (result.body || '').slice(0, 400) : null,
      };
      log.push(row);
      if (result.status >= 500 || result.cf1102 || Boolean(result.error)) {
        hardFails.push(row);
        stoppedReason = `hard-fail-${entry.step}:${result.status || 'network'}`;
        failed = true;
        break;
      }
      if (result.status === 400 && result.payload?.code === 'demo_rate_limited') {
        stoppedReason = 'demo_rate_limited';
        failed = true;
        break;
      }
    }
    if (failed) break;
    completedRounds += 1;
  }

  const sorted = [...d1Reads].sort((a, b) => a - b);
  const walls = [...serverWalls].sort((a, b) => a - b);
  const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : null);
  return {
    learnerIndex,
    learnerId: boot.learnerId,
    accountId: session.accountId,
    completedRounds,
    stoppedReason,
    statuses,
    hardFails,
    html1102Or503: log.filter((r) => r.cf1102 || r.status === 503).length,
    d1RowsRead: sorted.length ? {
      n: sorted.length, min: sorted[0], p50: pct(sorted, 0.5), p95: pct(sorted, 0.95), max: sorted.at(-1),
    } : null,
    serverWallMs: walls.length ? {
      n: walls.length, min: walls[0], p50: pct(walls, 0.5), p95: pct(walls, 0.95), max: walls.at(-1),
    } : null,
    log,
  };
}

mkdirSync(outDir, { recursive: true });
const startedAt = new Date().toISOString();
const results = await Promise.all(Array.from({ length: learners }, (_, i) => runOneLearner(i)));
const finishedAt = new Date().toISOString();
const allLogs = results.flatMap((r) => r.log);
const statusTotals = {};
for (const row of allLogs) statusTotals[String(row.status)] = (statusTotals[String(row.status)] || 0) + 1;
const summary = {
  buildIdExpected: '6c6f6f4',
  method: 'staggered-demo-api',
  paceMs,
  staggerMs,
  maxRounds,
  learners,
  label,
  origin,
  startedAt,
  finishedAt,
  statuses: statusTotals,
  html1102Or503: results.reduce((n, r) => n + r.html1102Or503, 0),
  hardFailLearners: results.filter((r) => r.hardFails.length).map((r) => ({
    learnerId: r.learnerId,
    stoppedReason: r.stoppedReason,
    firstHard: r.hardFails[0],
  })),
  perLearner: results.map(({ log, ...rest }) => rest),
};
const path = `${outDir}/spelling-hammer-${label}.json`;
writeFileSync(path, JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log('wrote', path);
process.exit(summary.html1102Or503 ? 1 : 0);
