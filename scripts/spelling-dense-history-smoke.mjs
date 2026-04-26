#!/usr/bin/env node

// U11 (sys-hardening p1) — Dense-history Spelling Smart Review smoke.
//
// Mirrors `scripts/grammar-production-smoke.mjs` /
// `scripts/punctuation-production-smoke.mjs`. Proves PR #135's Smart
// Review start-session optimisation (progress-map caching, reducing the
// observed wall time from ~1.7 s to ~12.5 ms on a dense-history learner)
// still holds under production load.
//
// Flow:
//   1. Create a demo session (or accept a configured cookie/bearer).
//   2. Load `/api/bootstrap` with bounded metadata.
//   3. POST `start-session` to `/api/subjects/spelling/command` with
//      `mode: 'smart'` and capture the client wall time.
//   4. POST `submit-answer` to exercise the mid-session command path.
//   5. Assert:
//        - HTTP 200 and `ok: true` on every response.
//        - `subjectReadModel.phase === 'session'` on start and the
//          post-submit model is in the expected phase.
//        - `start-session` client-observed wall time is under the
//          configured threshold (default 750 ms).
//        - No forbidden keys in any subject-command payload.
//        - No `exceededCpu` signal on any response.
//        - `bootstrapCapacity` metadata present on /api/bootstrap.
//   6. Optionally persist the evidence JSON under
//      `reports/capacity/spelling-dense-*.json` (U3 schema v2).
//
// Plan note: Smart Review latency claims depend on live D1 progress
// rows. The local worker-server harness does not reproduce PR #135's
// 1.7 s baseline, so the structural contract (session phase + no leaks
// + bootstrapCapacity present) is the primary assertion in CI. The
// wall-time gate is additive and fires against a live production run.

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import {
  assertNoForbiddenObjectKeys,
  configuredOrigin,
  createDemoSession,
  loadBootstrap,
  postJson,
  createRequestId,
} from './lib/production-smoke.mjs';
import { FORBIDDEN_KEYS_EVERYWHERE as SHARED_FORBIDDEN_KEYS_EVERYWHERE } from '../tests/helpers/forbidden-keys.mjs';

const DEFAULT_MAX_P95_MS = 750;

// Sets are built at module load from the shared Array exports. The
// canonical list lives in tests/helpers/forbidden-keys.mjs.
const FORBIDDEN_SPELLING_READ_MODEL_KEYS = new Set([
  ...SHARED_FORBIDDEN_KEYS_EVERYWHERE,
  // Spelling-specific: the redacted read model must never expose the
  // raw word or the raw cloze sentence. `word` and `sentence` are
  // legitimate fields in other contexts (e.g. `prompt.cloze` is
  // allowed), so they are not in the universal floor. The smoke
  // additionally asserts their absence positionally below.
]);

export const EXIT_OK = 0;
export const EXIT_VALIDATION = 1;
export const EXIT_USAGE = 2;
export const EXIT_TRANSPORT = 3;

const HELP_BANNER = [
  'Usage: node ./scripts/spelling-dense-history-smoke.mjs [options]',
  '',
  'Asserts PR #135 Smart Review start-session optimisation holds for a',
  'dense-history learner. Creates a demo session, starts a Smart Review',
  'spelling round, submits one answer, and verifies the subject-command',
  'contract plus optional P95 wall-time gate.',
  '',
  'Options:',
  '  --origin <url>, --url <url>       Origin to probe (default https://ks2.eugnel.uk).',
  '  --cookie <cookie>                 Reuse a logged-in session cookie instead of demo.',
  '  --bearer <token>                  Bearer token for Authorization header.',
  '  --header "name: value"            Extra request header, repeatable.',
  '  --max-p95-ms <ms>                 Hard gate on start-session client wall time (default 750).',
  '  --require-bootstrap-capacity      Fail if /api/bootstrap lacks bootstrapCapacity metadata.',
  '  --output <path>                   Persist evidence JSON under reports/capacity/.',
  '  --timeout-ms <ms>                 Per-request timeout (default 15000).',
  '  --help, -h                        Show this banner.',
  '',
  'Exit codes:',
  '  0  smoke passed',
  '  1  validation failure (thresholds, forbidden keys, shape violation)',
  '  2  usage error (bad flag)',
  '  3  transport failure (fetch/bootstrap unreachable)',
].join('\n');

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function toPositiveInteger(value, optionName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${optionName} must be a non-negative integer.`);
  }
  return parsed;
}

export function parseSpellingDenseArgs(argv = process.argv.slice(2)) {
  const options = {
    origin: '',
    cookie: '',
    bearer: '',
    headers: [],
    maxP95Ms: DEFAULT_MAX_P95_MS,
    requireBootstrapCapacity: false,
    output: '',
    help: false,
  };

  const assigned = new Set();
  const assignOnce = (flag) => {
    if (assigned.has(flag)) {
      throw new Error(`${flag} specified more than once; refusing to let later value silently override the earlier one.`);
    }
    assigned.add(flag);
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--origin' || arg === '--url') {
      assignOnce('--origin');
      options.origin = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--cookie') {
      assignOnce(arg);
      options.cookie = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--bearer') {
      assignOnce(arg);
      options.bearer = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--header') {
      options.headers.push(readOptionValue(argv, index, arg));
      index += 1;
    } else if (arg === '--max-p95-ms') {
      assignOnce(arg);
      options.maxP95Ms = toPositiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--require-bootstrap-capacity') {
      options.requireBootstrapCapacity = true;
    } else if (arg === '--output') {
      assignOnce(arg);
      options.output = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--timeout-ms') {
      // Consumed by production-smoke.mjs via process.argv; no local state.
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function signalsFromCapacity(payload) {
  const capacity = payload?.meta?.capacity;
  if (!capacity || typeof capacity !== 'object') return [];
  return Array.isArray(capacity.signals) ? capacity.signals : [];
}

function serverCapacityDigest(payload) {
  const capacity = payload?.meta?.capacity;
  if (!capacity || typeof capacity !== 'object' || Array.isArray(capacity)) return null;
  return {
    requestId: capacity.requestId || null,
    queryCount: capacity.queryCount ?? null,
    d1RowsRead: capacity.d1RowsRead ?? null,
    d1RowsWritten: capacity.d1RowsWritten ?? null,
    serverWallMs: capacity.wallMs ?? null,
    responseBytes: capacity.responseBytes ?? null,
    signals: Array.isArray(capacity.signals) ? [...capacity.signals] : [],
  };
}

function assertSpellingStartModelShape(model, path) {
  assert.ok(model && typeof model === 'object', `${path} is missing the subjectReadModel.`);
  assert.equal(model.phase, 'session', `${path}.phase must be 'session' after start-session.`);
  assert.equal(model.session?.serverAuthority, 'worker', `${path}.session.serverAuthority must be 'worker'.`);
  assert.equal(
    model.session?.currentCard?.word,
    undefined,
    `${path}.session.currentCard.word must not expose the raw word.`,
  );
  assert.equal(
    model.session?.currentCard?.prompt?.sentence,
    undefined,
    `${path}.session.currentCard.prompt.sentence must not expose the raw sentence.`,
  );
  assert.ok(
    typeof model.session?.currentCard?.prompt?.cloze === 'string'
      && model.session.currentCard.prompt.cloze.length > 0,
    `${path}.session.currentCard.prompt.cloze must carry the redacted prompt.`,
  );
  assertNoForbiddenObjectKeys(model, FORBIDDEN_SPELLING_READ_MODEL_KEYS, path);
}

async function runSpellingCommand({
  origin,
  cookie,
  learnerId,
  revision,
  command,
  payload = {},
  requestPrefix = 'spelling-dense',
}) {
  const requestId = createRequestId(`${requestPrefix}-${command}`);
  const started = performance.now();
  const result = await postJson(origin, '/api/subjects/spelling/command', {
    subjectId: 'spelling',
    learnerId,
    command,
    requestId,
    correlationId: requestId,
    expectedLearnerRevision: revision,
    payload,
  }, { cookie });
  const wallMs = Math.round((performance.now() - started) * 10) / 10;
  const bytes = Buffer.byteLength(JSON.stringify(result.payload || {}), 'utf8');
  const signals = signalsFromCapacity(result.payload);

  return {
    ok: result.response.ok && result.payload?.ok !== false,
    status: result.response.status,
    payload: result.payload,
    wallMs,
    responseBytes: bytes,
    signals,
    capacity: serverCapacityDigest(result.payload),
    requestId,
    nextRevision: Number(result.payload?.mutation?.appliedRevision) || revision,
  };
}

export async function runSpellingDenseHistorySmoke(options = {}) {
  const origin = options.origin || configuredOrigin();
  const startedAt = new Date().toISOString();

  // Create demo session unless caller supplied their own cookie.
  let cookie = options.cookie || '';
  let session = null;
  if (!cookie) {
    const demo = await createDemoSession(origin);
    cookie = demo.cookie;
    session = demo.session;
  }

  const bootstrap = await loadBootstrap(origin, cookie, {
    expectedSession: session || undefined,
  });

  const bootstrapCapacity = bootstrap.payload?.bootstrapCapacity || null;
  if (options.requireBootstrapCapacity && (!bootstrapCapacity || typeof bootstrapCapacity !== 'object')) {
    throw new Error('Bootstrap payload is missing bootstrapCapacity metadata.');
  }

  const start = await runSpellingCommand({
    origin,
    cookie,
    learnerId: bootstrap.learnerId,
    revision: bootstrap.revision,
    command: 'start-session',
    payload: { mode: 'smart', length: 1 },
  });
  assert.equal(start.status, 200, `Spelling Smart Review start-session returned HTTP ${start.status}.`);
  assert.ok(start.ok, 'Spelling Smart Review start-session returned ok=false.');
  assertSpellingStartModelShape(start.payload?.subjectReadModel, 'spellingDense.startModel');
  assert.ok(start.payload?.audio?.promptToken, 'Spelling Smart Review start did not return a prompt token.');
  assert.equal(
    start.signals.includes('exceededCpu'),
    false,
    'Spelling Smart Review start-session surfaced exceededCpu — PR #135 regression.',
  );

  const maxP95Ms = Number.isFinite(Number(options.maxP95Ms))
    ? Number(options.maxP95Ms)
    : DEFAULT_MAX_P95_MS;
  const p95Violations = [];
  if (start.wallMs > maxP95Ms) {
    p95Violations.push({
      threshold: 'max-p95-ms',
      limit: maxP95Ms,
      observed: start.wallMs,
      message: `Smart Review start-session wall time ${start.wallMs} ms exceeds ${maxP95Ms} ms.`,
    });
  }

  // Exercise the mid-session command path so the smoke covers both the
  // cached start path AND a follow-on command hitting the same session.
  // We intentionally submit a deliberately-wrong answer so the round
  // reaches 'feedback' cleanly without depending on live word content.
  const submit = await runSpellingCommand({
    origin,
    cookie,
    learnerId: bootstrap.learnerId,
    revision: start.nextRevision,
    command: 'submit-answer',
    payload: { typed: 'ks2-dense-smoke-wrong-answer' },
  });
  assert.equal(submit.status, 200, `Spelling submit-answer returned HTTP ${submit.status}.`);
  assert.ok(submit.ok, 'Spelling submit-answer returned ok=false.');
  assertNoForbiddenObjectKeys(
    submit.payload?.subjectReadModel,
    FORBIDDEN_SPELLING_READ_MODEL_KEYS,
    'spellingDense.submitModel',
  );
  assert.equal(
    submit.signals.includes('exceededCpu'),
    false,
    'Spelling submit-answer surfaced exceededCpu.',
  );

  const finishedAt = new Date().toISOString();

  const evidence = {
    ok: p95Violations.length === 0,
    startedAt,
    finishedAt,
    origin,
    learnerId: bootstrap.learnerId,
    bootstrap: {
      capacity: bootstrapCapacity
        ? {
          version: bootstrapCapacity.version ?? null,
          mode: bootstrapCapacity.mode ?? null,
          practiceSessions: bootstrapCapacity.practiceSessions ?? null,
          eventLog: bootstrapCapacity.eventLog ?? null,
        }
        : null,
    },
    commands: [
      {
        command: 'start-session',
        status: start.status,
        wallMs: start.wallMs,
        responseBytes: start.responseBytes,
        signals: start.signals,
        serverCapacity: start.capacity,
        requestId: start.requestId,
      },
      {
        command: 'submit-answer',
        status: submit.status,
        wallMs: submit.wallMs,
        responseBytes: submit.responseBytes,
        signals: submit.signals,
        serverCapacity: submit.capacity,
        requestId: submit.requestId,
      },
    ],
    thresholds: {
      maxP95Ms,
      violations: p95Violations,
    },
  };

  return evidence;
}

async function persistEvidence(outputPath, options, evidence) {
  const { persistEvidenceFile, buildReportMeta } = await import('./lib/capacity-evidence.mjs');
  const reportMeta = buildReportMeta(
    {
      mode: 'production',
      origin: evidence.origin,
      cookie: options.cookie,
      bearer: options.bearer,
      headers: options.headers,
      environment: 'production',
    },
    { startedAt: evidence.startedAt, finishedAt: evidence.finishedAt },
  );
  const payload = {
    ok: evidence.ok,
    reportMeta,
    summary: evidence,
    failures: (evidence.thresholds.violations || []).map((entry) => entry.message),
    thresholds: { maxP95Ms: evidence.thresholds.maxP95Ms },
    safety: {
      mode: 'production-spelling-dense-smoke',
      origin: evidence.origin,
      authMode: reportMeta.authMode,
    },
  };
  persistEvidenceFile(outputPath, payload);
}

export async function runCli(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseSpellingDenseArgs(argv);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, exit_code: EXIT_USAGE, error: error?.message || String(error) }, null, 2));
    return EXIT_USAGE;
  }
  if (options.help) {
    console.log(HELP_BANNER);
    return EXIT_OK;
  }

  let evidence;
  try {
    evidence = await runSpellingDenseHistorySmoke(options);
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      exit_code: EXIT_TRANSPORT,
      error: error?.message || String(error),
    }, null, 2));
    return EXIT_TRANSPORT;
  }

  if (options.output) {
    try {
      await persistEvidence(options.output, options, evidence);
    } catch (error) {
      console.error(`[spelling-dense-history-smoke] failed to persist evidence: ${error?.message || error}`);
    }
  }

  console.log(JSON.stringify(evidence, null, 2));
  return evidence.ok ? EXIT_OK : EXIT_VALIDATION;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`[spelling-dense-history-smoke] ${error?.stack || error?.message || error}`);
      process.exitCode = EXIT_TRANSPORT;
    });
}
