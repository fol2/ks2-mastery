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
import { FORBIDDEN_SPELLING_READ_MODEL_KEYS as SHARED_FORBIDDEN_SPELLING_READ_MODEL_KEYS } from '../tests/helpers/forbidden-keys.mjs';

// Default P95 ceiling for the start-session wall-time gate. Matches the
// classroom-tier command-P95 threshold in
// `npm run capacity:classroom:release-gate`. The dense-history claim
// (PR #135: ~12.5 ms) is only reproducible when `--cookie` points at a
// learner with dense practice history — demo sessions satisfy the
// structural contract only.
const DEFAULT_MAX_P95_MS = 750;

// Endpoint key used as the authoritative `summary.endpoints` key for
// verify-capacity-evidence.mjs. Mirrors `${method} ${path}` format
// produced by scripts/classroom-load-test.mjs:summariseCapacityResults.
const SPELLING_COMMAND_ENDPOINT_KEY = 'POST /api/subjects/spelling/command';

// Sets are built at module load from the shared Array exports. The
// canonical list lives in tests/helpers/forbidden-keys.mjs and mirrors
// the disjoint keys used by punctuation so rename-class leaks (e.g.
// `canonical`, `target`, `correctAnswer`) are caught in the spelling
// path as well. Positional raw-word / raw-sentence checks still run via
// assertSpellingStartModelShape — the oracle here is the key-name floor.
const FORBIDDEN_SPELLING_READ_MODEL_KEYS = new Set(SHARED_FORBIDDEN_SPELLING_READ_MODEL_KEYS);

/**
 * Tag an Error as a validation failure (product-contract breach) rather
 * than a transport failure. `runCli` inspects this tag to decide between
 * EXIT_VALIDATION and EXIT_TRANSPORT — the exit-code taxonomy in the
 * help banner promises: 1 = validation, 3 = transport. `assert.*` errors
 * do not carry this tag, so throwing one ourselves keeps the classifier
 * deterministic without having to brittle-match on error messages.
 */
function validationError(message, cause) {
  const error = new Error(message);
  error.kind = 'validation';
  if (cause) error.cause = cause;
  return error;
}

function rethrowAsValidation(fn) {
  try {
    return fn();
  } catch (error) {
    if (error && error.kind === 'validation') throw error;
    throw validationError(error?.message || String(error), error);
  }
}

/**
 * Re-wrap bootstrap / demo-session errors so the exit-code classifier
 * produces the taxonomy the help banner promises. `assertOkResponse`
 * in production-smoke.mjs throws an AssertionError whose message
 * contains "failed with <status>"; we parse that out so an upstream 5xx
 * propagates as an untagged Error (→ EXIT_TRANSPORT) while a 4xx still
 * surfaces as a tagged validationError (→ EXIT_VALIDATION). Works for
 * both the `Bootstrap` and `Demo session creation` labels because
 * production-smoke.mjs uses the same format.
 */
async function bootstrapStage(label, fn) {
  try {
    return await fn();
  } catch (error) {
    const message = String(error?.message || '');
    const match = message.match(/failed with (\d+)/);
    if (match) {
      const status = Number(match[1]);
      if (status >= 500) {
        // Transport degradation; re-wrap as a plain Error (not
        // AssertionError) so the classifier emits EXIT_TRANSPORT. The
        // original error is linked via `cause` for post-mortem context.
        const transportError = new Error(`${label} ${message}`);
        transportError.cause = error;
        throw transportError;
      }
      // Non-5xx: shape is visible, treat as validation failure.
      throw validationError(`${label} ${message}`, error);
    }
    // No HTTP status in the message: genuine transport failure (fetch
    // threw, timeout). Re-wrap as a plain Error so the classifier maps
    // it to EXIT_TRANSPORT — the original AssertionError would be
    // mis-classified as validation.
    const transportError = new Error(message || String(error));
    transportError.cause = error;
    throw transportError;
  }
}

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
  'Cookie / demo distinction:',
  '  - Without --cookie: the smoke runs against a freshly created demo',
  '    session. The structural contract (session phase, read-model',
  '    redaction, bootstrapCapacity metadata) IS enforced, but the',
  '    dense-history latency claim is NOT — a demo learner has zero',
  '    progress rows so the caching optimisation has nothing to cache.',
  '  - With --cookie <cookie>: the smoke reuses a logged-in learner. If',
  '    that learner has 200+ practice sessions the --max-p95-ms gate',
  '    becomes a meaningful dense-history latency check. Use this mode',
  '    when producing capacity evidence that cites a P95 wall-time row.',
  '',
  'Options:',
  '  --origin <url>, --url <url>       Origin to probe (default https://ks2.eugnel.uk).',
  '  --cookie <cookie>                 Reuse a logged-in session cookie (required for a',
  '                                    meaningful dense-history latency check).',
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
  '  1  validation failure (thresholds, forbidden keys, shape violation,',
  '     exceededCpu signal, missing bootstrapCapacity, non-5xx HTTP status)',
  '  2  usage error (bad flag)',
  '  3  transport failure (fetch timeout, network error, 5xx)',
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
  // Every assertion below is a validation failure (product-contract
  // breach). We wrap them so the caller's try/catch can re-throw as a
  // tagged validationError — assert.* throws AssertionError instances,
  // which we also treat as validation in `rethrowAsValidation`.
  rethrowAsValidation(() => {
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
  });
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
  // Transport failures (fetch throws, AbortSignal timeout) propagate out
  // with `kind` unset — runCli treats them as EXIT_TRANSPORT. HTTP-level
  // status classification happens in the caller so we can pick between
  // EXIT_VALIDATION (<500, wrong payload shape) and EXIT_TRANSPORT (>=500).
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

function assertHttpOkOrThrow(status, label) {
  // HTTP 5xx — treat as transport failure (upstream is degraded); the
  // error is NOT tagged, so runCli returns EXIT_TRANSPORT.
  if (status >= 500) {
    throw new Error(`${label} returned HTTP ${status}.`);
  }
  // Any other non-200 (401, 403, 404, 422) is a contract-shaped problem
  // we can diagnose — the server replied, the shape is wrong. Return a
  // validation-tagged error so runCli returns EXIT_VALIDATION.
  if (status !== 200) {
    throw validationError(`${label} returned HTTP ${status}.`);
  }
}

export async function runSpellingDenseHistorySmoke(options = {}) {
  const origin = options.origin || configuredOrigin();
  const startedAt = new Date().toISOString();

  // Create demo session unless caller supplied their own cookie. The
  // demo path still exercises the structural contract; see help banner
  // for why only a real --cookie learner can produce a meaningful
  // dense-history latency measurement.
  //
  // Wrap the early-setup calls so a 5xx from `/api/demo/session` or
  // `/api/bootstrap` bubbles up as an untagged Error (EXIT_TRANSPORT)
  // while a 4xx is re-tagged as validation (EXIT_VALIDATION).
  let cookie = options.cookie || '';
  let session = null;
  if (!cookie) {
    const demo = await bootstrapStage('Demo session creation', () => createDemoSession(origin));
    cookie = demo.cookie;
    session = demo.session;
  }

  const bootstrap = await bootstrapStage('Bootstrap', () => loadBootstrap(origin, cookie, {
    expectedSession: session || undefined,
  }));

  const bootstrapCapacity = bootstrap.payload?.bootstrapCapacity || null;
  if (options.requireBootstrapCapacity && (!bootstrapCapacity || typeof bootstrapCapacity !== 'object')) {
    // Missing metadata is a validation failure — the server replied; it
    // just left out the promised field. Tag it so runCli emits EXIT_VALIDATION.
    throw validationError('Bootstrap payload is missing bootstrapCapacity metadata.');
  }

  const start = await runSpellingCommand({
    origin,
    cookie,
    learnerId: bootstrap.learnerId,
    revision: bootstrap.revision,
    command: 'start-session',
    payload: { mode: 'smart', length: 1 },
  });
  assertHttpOkOrThrow(start.status, 'Spelling Smart Review start-session');
  if (!start.ok) {
    throw validationError('Spelling Smart Review start-session returned ok=false.');
  }
  assertSpellingStartModelShape(start.payload?.subjectReadModel, 'spellingDense.startModel');
  if (!start.payload?.audio?.promptToken) {
    throw validationError('Spelling Smart Review start did not return a prompt token.');
  }
  if (start.signals.includes('exceededCpu')) {
    throw validationError('Spelling Smart Review start-session surfaced exceededCpu — PR #135 regression.');
  }

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
  assertHttpOkOrThrow(submit.status, 'Spelling submit-answer');
  if (!submit.ok) {
    throw validationError('Spelling submit-answer returned ok=false.');
  }
  // Redaction must hold on the submit-answer path too — a bug where
  // post-marking feedback leaks `word` or `prompt.sentence` is
  // exercised by the submit-answer regression test.
  rethrowAsValidation(() => {
    assert.equal(
      submit.payload?.subjectReadModel?.session?.currentCard?.word,
      undefined,
      'spellingDense.submitModel.session.currentCard.word must not expose the raw word.',
    );
    assert.equal(
      submit.payload?.subjectReadModel?.session?.currentCard?.prompt?.sentence,
      undefined,
      'spellingDense.submitModel.session.currentCard.prompt.sentence must not expose the raw sentence.',
    );
    assertNoForbiddenObjectKeys(
      submit.payload?.subjectReadModel,
      FORBIDDEN_SPELLING_READ_MODEL_KEYS,
      'spellingDense.submitModel',
    );
  });
  if (submit.signals.includes('exceededCpu')) {
    throw validationError('Spelling submit-answer surfaced exceededCpu.');
  }

  const finishedAt = new Date().toISOString();

  // Canonical `summary.endpoints[key]` shape mirrors
  // scripts/classroom-load-test.mjs:summariseCapacityResults so
  // scripts/verify-capacity-evidence.mjs can cross-check rows that
  // cite this evidence file. For single-sample smoke runs,
  // `p50 === p95 === wallMs` and `count: 1`.
  const endpoints = {
    [SPELLING_COMMAND_ENDPOINT_KEY]: {
      count: 2,
      p50WallMs: start.wallMs,
      p95WallMs: start.wallMs,
      maxResponseBytes: Math.max(start.responseBytes, submit.responseBytes),
    },
  };
  const signalsAggregate = {};
  for (const signal of [...start.signals, ...submit.signals]) {
    signalsAggregate[signal] = (signalsAggregate[signal] || 0) + 1;
  }

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
    // Authoritative endpoint shape for verify-capacity-evidence. The
    // `commands[]` array below is kept for informational post-mortem
    // use and matches the pre-U11-review evidence files, but verify
    // reads `endpoints` exclusively.
    endpoints,
    signals: signalsAggregate,
    totalRequests: 2,
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

  // Canonical threshold block. verify-capacity-evidence.mjs expects
  // `thresholds.<name>.configured / observed / passed` and will reject
  // a flat number — this shape mirrors scripts/lib/capacity-evidence.mjs
  // `evaluateThresholds` output so rows citing this file pass the
  // verify-time recomputation check.
  const observedP95 = evidence.endpoints?.[SPELLING_COMMAND_ENDPOINT_KEY]?.p95WallMs ?? null;
  const configuredP95 = Number(evidence.thresholds?.maxP95Ms) || DEFAULT_MAX_P95_MS;
  const thresholds = {
    maxP95Ms: {
      configured: configuredP95,
      observed: observedP95,
      passed: observedP95 === null ? true : observedP95 <= configuredP95,
    },
  };
  const failures = thresholds.maxP95Ms.passed ? [] : ['maxP95Ms'];

  // Canonical summary block. `endpoints[key]` is the authoritative
  // per-route metric map that verify-capacity-evidence.mjs keys off via
  // numeric-drift check. `commands[]` remains alongside for post-mortem
  // readability (server-capacity digest, requestId trail) but is NOT
  // authoritative for verify.
  const summary = {
    ok: evidence.ok,
    startedAt: evidence.startedAt,
    finishedAt: evidence.finishedAt,
    origin: evidence.origin,
    learnerId: evidence.learnerId,
    totalRequests: evidence.totalRequests,
    endpoints: evidence.endpoints,
    signals: evidence.signals,
    bootstrap: evidence.bootstrap,
    commands: evidence.commands,
    failures: failures.slice(),
  };

  const payload = {
    ok: evidence.ok,
    reportMeta,
    summary,
    failures,
    thresholds,
    safety: {
      mode: 'production-spelling-dense-smoke',
      origin: evidence.origin,
      authMode: reportMeta.authMode,
    },
  };
  persistEvidenceFile(outputPath, payload);
}

/**
 * Decide EXIT_VALIDATION vs EXIT_TRANSPORT for an error raised during
 * the smoke body. The rule set matches the help banner exactly:
 *   - AssertionError (from assert.*) → validation (product-contract breach).
 *   - Any error tagged `kind: 'validation'` → validation.
 *   - Anything else (fetch throw, timeout, 5xx re-throw) → transport.
 * Keeping this in one function means the two concerns (tag recognition
 * and exit-code mapping) cannot drift.
 */
function classifyErrorForExitCode(error) {
  if (!error) return EXIT_TRANSPORT;
  if (error.kind === 'validation') return EXIT_VALIDATION;
  if (error.name === 'AssertionError') return EXIT_VALIDATION;
  return EXIT_TRANSPORT;
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
    // Exit-code taxonomy fix (PR #233 review blocker-2):
    // previously ALL throws from the smoke body — including
    // assert.throws from the redaction / exceededCpu / shape checks —
    // were reported as EXIT_TRANSPORT. Validation breaches now tag
    // themselves (`kind: 'validation'`) and AssertionError is also
    // recognised, so redaction leaks, bootstrap-capacity absence, and
    // HTTP 4xx statuses yield EXIT_VALIDATION as the banner promises.
    const exitCode = classifyErrorForExitCode(error);
    console.error(JSON.stringify({
      ok: false,
      exit_code: exitCode,
      error: error?.message || String(error),
    }, null, 2));
    return exitCode;
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
