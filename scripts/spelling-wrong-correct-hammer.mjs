#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createDemoSession, loadBootstrap, createRequestId } from './lib/production-smoke.mjs';

const origin = process.env.ORIGIN || 'https://ks2.eugnel.uk';
const paceMs = Number(process.env.PACE_MS || 0);
const maxRounds = Number(process.env.MAX_ROUNDS || 40);
const label = process.env.HAMMER_LABEL || (paceMs > 0 ? `paced-${paceMs}` : 'burst');
const cookieFile = process.env.COOKIE_FILE || '';
const forcedLearnerId = process.env.LEARNER_ID || '';
const slugs = (process.env.SLUGS || [
  'possess', 'position', 'possible', 'potatoes', 'pressure', 'probably', 'promise', 'purpose',
  'quarter', 'question', 'recent', 'regular', 'reign', 'remember', 'sentence', 'separate',
  'special', 'straight', 'strange', 'strength', 'suppose', 'surprise', 'therefore', 'though',
  'thought', 'through', 'various', 'weight', 'woman', 'women',
].join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rawCommand({ cookie, learnerId, revision, command, payload }) {
  const requestId = createRequestId(`hammer-${command}`);
  const started = performance.now();
  let response; let text = ''; let payloadJson = null; let error = null;
  try {
    response = await fetch(new URL('/api/subjects/spelling/command', origin), {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', origin, cookie },
      body: JSON.stringify({ subjectId: 'spelling', learnerId, command, requestId, correlationId: requestId, expectedLearnerRevision: revision, payload }),
      signal: AbortSignal.timeout(20_000),
    });
    text = await response.text();
    try { payloadJson = text ? JSON.parse(text) : null; } catch { payloadJson = null; }
  } catch (err) { error = String(err?.message || err); }
  const applied = Number(payloadJson?.mutation?.appliedRevision);
  return {
    status: response?.status ?? 0,
    wallMs: Number((performance.now() - started).toFixed(1)),
    bytes: text?.length || 0,
    body: text || null,
    error,
    ok: Boolean(payloadJson?.ok),
    payload: payloadJson,
    nextRevision: Number.isFinite(applied) ? applied : revision,
    ray: response?.headers?.get('cf-ray') || null,
    requestId: response?.headers?.get('x-ks2-request-id') || null,
    capacity: payloadJson?.meta?.capacity || null,
  };
}

let cookie;
let session = null;
let boot;
if (cookieFile) {
  cookie = readFileSync(cookieFile, 'utf8').trim();
  if (!cookie.startsWith('ks2_session=')) {
    throw new Error('COOKIE_FILE must contain a ks2_session=... value');
  }
  boot = await loadBootstrap(origin, cookie);
  if (forcedLearnerId && boot.learnerId !== forcedLearnerId) {
    throw new Error(`Bootstrap selected learner ${boot.learnerId} did not match LEARNER_ID ${forcedLearnerId}`);
  }
} else {
  ({ cookie, session } = await createDemoSession(origin));
  boot = await loadBootstrap(origin, cookie, { expectedSession: session });
}
let revision = boot.revision;
const log = []; const hardFails = []; const statuses = {};
const startedAt = new Date().toISOString();
let stoppedReason = 'max-rounds'; let completedRounds = 0;
const d1Reads = [];

for (let round = 0; round < maxRounds; round += 1) {
  const slug = slugs[round % slugs.length];
  const steps = [
    { step: 'start', command: 'start-session', payload: { mode: 'single', slug, length: 1 } },
    { step: 'wrong', command: 'submit-answer', payload: { typed: `${slug}x` } },
    { step: 'correct', command: 'submit-answer', payload: { typed: slug } },
    { step: 'continue', command: 'continue-session', payload: {} },
  ];
  let failed = false;
  for (const entry of steps) {
    if (paceMs > 0) await sleep(paceMs);
    const result = await rawCommand({ cookie, learnerId: boot.learnerId, revision, command: entry.command, payload: entry.payload });
    statuses[String(result.status)] = (statuses[String(result.status)] || 0) + 1;
    revision = result.nextRevision;
    if (entry.step === 'wrong' && result.payload?.subjectReadModel?.feedback?.answer) {
      steps[2].payload = { typed: result.payload.subjectReadModel.feedback.answer };
    }
    if (typeof result.capacity?.d1RowsRead === 'number') d1Reads.push(result.capacity.d1RowsRead);
    const row = {
      step: entry.step, round, slug, status: result.status, wallMs: result.wallMs, bytes: result.bytes,
      ray: result.ray, requestId: result.requestId, signals: result.capacity?.signals || [],
      serverWallMs: result.capacity?.wallMs ?? null, queryCount: result.capacity?.queryCount ?? null,
      d1RowsRead: result.capacity?.d1RowsRead ?? null, projectionFallback: result.capacity?.projectionFallback ?? null,
      error: result.error, code: result.payload?.code || null,
      bodySnippet: result.status !== 200 ? (result.body || '').slice(0, 400) : null,
    };
    log.push(row);
    if (result.status >= 500 || Boolean(result.error) || (result.status === 200 && result.ok === false)) {
      hardFails.push(row);
      stoppedReason = `hard-fail-${entry.step}:${result.status || 'network'}`;
      failed = true;
      break;
    }
  }
  if (failed) break;
  completedRounds += 1;
  if (round % 10 === 9) console.error('completed', completedRounds);
}

const sorted = [...d1Reads].sort((a, b) => a - b);
const summary = {
  method: paceMs > 0 ? 'api-client-sim-gap' : 'api-burst',
  paceMs, maxRounds, completedRounds, total: log.length, statuses, hardFails,
  html1102Or503: log.filter((r) => r.status === 503 || /1102/i.test(String(r.bodySnippet || ''))).length,
  d1RowsRead: sorted.length ? { n: sorted.length, min: sorted[0], p50: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted.at(-1) } : null,
  stoppedReason, learnerId: boot.learnerId, accountId: session?.accountId || null,
  authMode: cookieFile ? 'cookie-file' : 'demo-session',
  startedAt,
  finishedAt: new Date().toISOString(), label,
};
const path = `reports/capacity/evidence/spelling-hammer-${label}.json`;
writeFileSync(path, JSON.stringify({ summary, log }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log('wrote', path);
process.exit(hardFails.length ? 1 : 0);
