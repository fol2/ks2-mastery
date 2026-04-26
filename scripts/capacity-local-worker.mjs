// U4 (capacity-release-gates-and-telemetry): local-fixture integration load
// test orchestrator. Wraps `wrangler dev --local` through
// `scripts/wrangler-oauth.mjs` so the `CLOUDFLARE_API_TOKEN` stripper always
// applies, then runs `scripts/classroom-load-test.mjs --local-fixture` against
// the newly-spawned Worker.
//
// Surface contract (see docs/plans/.../capacity-release-gates-and-telemetry.md
// section U4):
// - Exit 0 on happy path (driver exit 0)
// - Exit N on driver non-zero exit (propagated)
// - Exit 2 on readiness timeout or operator argv collision
// - Exit 3 on evidence file missing after driver exit 0
// - Exit 130 on SIGINT
// - NEVER wire into `npm run check` or `npm run verify`
//
// All side effects (spawn, fetch, fs writes, net probes, platform dispatch)
// are injectable so the 10+ scenarios under `tests/capacity-scripts.test.js`
// can exercise the logic without a real wrangler subprocess.
//
// U4 round 1 fixes (see .context/compound-engineering/ce-code-review/
// u4-round1/adversarial-findings.json):
// - adv-u4-001 P0: readiness accepts any 2xx (real Worker createDemoSession
//   returns 201 Created — see `worker/src/demo/sessions.js:353`).
// - adv-u4-002 P1: redaction pipeline now uses `createRedactionStream` which
//   buffers partial lines across stream chunks.
// - adv-u4-003 P1: driver argv is forced to include
//   `--output <evidencePath>`; operator override in the passthrough honoured
//   with a warning. After driver exit 0 the evidence file existence is
//   asserted — missing file produces exit 3.
// - adv-u4-004 P1: `sanitiseWranglerEnv` flipped to an allowlist plus a
//   suspicious-suffix denylist. Every non-allowlisted key is dropped by
//   default.
// - adv-u4-009 P2: operator `--origin` in passthrough rejected upfront
//   before migrations/spawn so the collision surfaces instantly.
// - adv-u4-010 P2: `--port-start` upper bound enforced at parse time.

import net from 'node:net';
import { spawn as realSpawn, spawnSync as realSpawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createRedactionStream } from './lib/log-redaction.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_PORT_START = 8787;
const MAX_PORT_START = 65533; // leave at least PORT_CANDIDATES_COUNT headroom
const PORT_CANDIDATES_COUNT = 3;
const DEFAULT_READINESS_TIMEOUT_MS = 30000;
const READINESS_POLL_START_MS = 100;
const READINESS_POLL_CAP_MS = 1000;
const DEFAULT_LOG_PATH = 'reports/capacity/local-worker-stdout.log';
const DEFAULT_EVIDENCE_PATH = 'reports/capacity/latest-local.json';

// Allowlist of env var names the wrangler subprocess is PERMITTED to see.
// Everything else is dropped, including third-party secrets that would
// otherwise be inherited from the operator's shell. `WRANGLER_*` prefixed
// keys pass through via `WRANGLER_ENV_PREFIXES` below so operators can still
// tweak wrangler's own knobs.
//
// adv-u4-004 flip: denylist-of-one became allowlist. A rogue
// `WRANGLER_TOKEN`/`WRANGLER_SECRET` would match the prefix allow but is
// rejected by `SUSPICIOUS_SUFFIX_PATTERN` below — suffix deny wins so a
// future wrangler version that adds a confusingly-named credential variable
// does not leak by accident.
const WRANGLER_ENV_ALLOWLIST = new Set([
  'PATH',               // binary discovery
  'HOME',               // wrangler config dir (POSIX)
  'USERPROFILE',        // wrangler config dir (Windows)
  'APPDATA',            // Windows config locations
  'LOCALAPPDATA',       // Windows cache
  'USER',
  'USERNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TMPDIR',
  'TEMP',
  'TMP',
  'NODE_ENV',
  'CLOUDFLARE_ACCOUNT_ID',    // public account id; wrangler needs it for bindings
  'CF_ACCOUNT_ID',            // wrangler alternative spelling
  'WRANGLER_LOG',             // debug verbosity
  'WRANGLER_SEND_METRICS',    // opt-out
  'FORCE_COLOR',
  'NO_COLOR',
  'CI',                       // wrangler behaviour toggles on this
  'TERM',
  'WORKERS_CI',               // Cloudflare Workers CI marker; preserved so the
                              // CI-build branch still recognises itself.
]);

const WRANGLER_ENV_PREFIXES = ['WRANGLER_'];

// Keys whose name ends in one of these suffixes are always dropped, even if
// they match the allowlist or the prefix pass-through. This is the defence
// against a future wrangler variable named `WRANGLER_SOMETHING_TOKEN` or a
// confusingly-named allowlist entry like `CLOUDFLARE_ACCOUNT_ID_KEY` (not
// a real variable today; defensive).
const SUSPICIOUS_SUFFIX_PATTERN = /(TOKEN|SECRET|PASSWORD|KEY)$/i;

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

/**
 * Parse capacity-local-worker CLI args.
 *
 * - Every arg BEFORE the literal `--` separator is interpreted as an
 *   orchestrator flag (`--fresh`, `--port-start`, `--readiness-timeout-ms`).
 * - Every arg AFTER `--` is captured verbatim into `driverArgs` and forwarded
 *   to `classroom-load-test.mjs` unchanged (except for upfront rejections —
 *   see `rejectConflictingDriverArgs`). This keeps the orchestrator out of
 *   the business of understanding every load-driver flag.
 */
export function parseLocalWorkerArgs(argv = []) {
  const result = {
    fresh: false,
    portStart: DEFAULT_PORT_START,
    readinessTimeoutMs: DEFAULT_READINESS_TIMEOUT_MS,
    driverArgs: [],
    help: false,
  };

  let sawSeparator = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (sawSeparator) {
      result.driverArgs.push(arg);
      continue;
    }
    if (arg === '--') { sawSeparator = true; continue; }
    if (arg === '--help' || arg === '-h') { result.help = true; continue; }
    if (arg === '--fresh') { result.fresh = true; continue; }
    if (arg === '--port-start') {
      const value = argv[index + 1];
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`--port-start requires a positive integer, got: ${value}`);
      }
      // adv-u4-010: bound the upper end so an obvious typo (88787) surfaces as
      // a clear validation error instead of opaque "No free port available".
      if (parsed > MAX_PORT_START) {
        throw new Error(`--port-start must be <= ${MAX_PORT_START} (got ${value}); leave room for ${PORT_CANDIDATES_COUNT} candidates below the 65535 ceiling.`);
      }
      result.portStart = parsed;
      index += 1;
      continue;
    }
    if (arg === '--readiness-timeout-ms') {
      const value = argv[index + 1];
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`--readiness-timeout-ms requires a positive integer, got: ${value}`);
      }
      result.readinessTimeoutMs = parsed;
      index += 1;
      continue;
    }
    // Anything else before `--` is a misspelling. Keep the error actionable.
    throw new Error(`Unknown flag for capacity-local-worker: ${arg}. Did you forget the -- separator?`);
  }

  return result;
}

/**
 * Reject operator-supplied driver flags that collide with orchestrator-owned
 * contracts (`--origin`, `--local-fixture`, `--demo-sessions`). `--output`
 * is allowed through with a warning so an operator can redirect evidence
 * when they really want to (the orchestrator still honours it for its own
 * existence check).
 *
 * adv-u4-009: catches the collision BEFORE migrations/spawn so the operator
 * does not wait multiple minutes before learning they typed a duplicate
 * flag.
 */
function rejectConflictingDriverArgs(driverArgs) {
  const reserved = new Set(['--origin', '--url', '--local-fixture', '--demo-sessions']);
  for (const arg of driverArgs) {
    // Canonicalise both space-form (`--origin x`) and equals-form (`--origin=x`)
    // before set lookup. adv-u4-r2-001: equals-form previously bypassed the
    // reject, letting migrations/spawn/readiness waste multiple minutes before
    // the driver itself threw an Unknown option error.
    const flag = arg.startsWith('--') ? arg.split('=', 1)[0] : arg;
    if (reserved.has(flag)) {
      throw new Error(`operator passthrough must not include ${flag}; the orchestrator owns this flag (run with --help for details).`);
    }
  }
}

// ---------------------------------------------------------------------------
// Env sanitisation (allowlist; wrangler-oauth.mjs still strips CF token too)
// ---------------------------------------------------------------------------

/**
 * Return a NEW object containing only the env vars the wrangler subprocess is
 * PERMITTED to see.
 *
 * Rules (in order):
 * 1. If `WORKERS_CI === '1'` the `CLOUDFLARE_API_TOKEN` variable survives —
 *    the Cloudflare Workers CI build path needs it. This matches the guard
 *    in `scripts/wrangler-oauth.mjs`.
 * 2. Keys matching the suspicious-suffix deny pattern (`/TOKEN|SECRET|
 *    PASSWORD|KEY$/i`) are always dropped.
 * 3. Keys that are exact matches in `WRANGLER_ENV_ALLOWLIST` pass through.
 * 4. Keys starting with `WRANGLER_` pass through (wrangler-internal knobs).
 * 5. Everything else is dropped.
 *
 * adv-u4-004: denylist-of-one CLOUDFLARE_API_TOKEN became this allowlist so
 * NPM_TOKEN/OPENAI_API_KEY/AWS_SECRET_ACCESS_KEY/etc. no longer leak into the
 * wrangler child.
 */
export function sanitiseWranglerEnv(env = {}) {
  const isWorkersBuild = env.WORKERS_CI === '1';
  const cleaned = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof key !== 'string' || typeof value !== 'string') continue;

    // Workers CI exception for CLOUDFLARE_API_TOKEN: the build pipeline needs
    // the token, and the suspicious-suffix check would otherwise drop it.
    if (isWorkersBuild && key === 'CLOUDFLARE_API_TOKEN') {
      cleaned[key] = value;
      continue;
    }

    // Suspicious suffix deny overrides both allowlist and prefix-allow.
    if (SUSPICIOUS_SUFFIX_PATTERN.test(key)) continue;

    if (WRANGLER_ENV_ALLOWLIST.has(key)) {
      cleaned[key] = value;
      continue;
    }

    if (WRANGLER_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      cleaned[key] = value;
      continue;
    }
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Spawn command builder
// ---------------------------------------------------------------------------

/**
 * Build a spawn descriptor that routes wrangler through the oauth wrapper.
 * The returned shape is stable for testing: `{cmd, args}`.
 */
export function buildWranglerSpawnCommand({ port, platform: _platform = process.platform }) {
  const parsedPort = Number(port);
  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    throw new Error(`buildWranglerSpawnCommand requires a positive integer port, got: ${port}`);
  }
  const oauthScript = resolvePath(__dirname, 'wrangler-oauth.mjs');
  return {
    cmd: process.execPath,
    args: [
      oauthScript,
      'dev',
      '--local',
      '--port',
      String(parsedPort),
    ],
  };
}

// ---------------------------------------------------------------------------
// Teardown descriptor
// ---------------------------------------------------------------------------

/**
 * Compute the platform-correct teardown plan for the wrangler subprocess.
 *
 * POSIX: send SIGINT (clean shutdown path).
 * Windows: invoke `taskkill /F /PID <pid> /T` — argv-style, never a shell
 * string, so paths with spaces in the operator environment cannot interact
 * with the command line parser.
 */
export function buildTeardownCommand({ platform, pid }) {
  const pidValue = Number(pid);
  if (!Number.isInteger(pidValue) || pidValue <= 0) {
    throw new Error(`buildTeardownCommand requires a positive integer pid, got: ${pid}`);
  }

  if (platform === 'win32') {
    return {
      kind: 'spawn',
      cmd: 'taskkill',
      args: ['/F', '/PID', String(pidValue), '/T'],
    };
  }

  return {
    kind: 'signal',
    signal: 'SIGINT',
    pid: pidValue,
  };
}

// ---------------------------------------------------------------------------
// Port selection
// ---------------------------------------------------------------------------

/**
 * Race `net.createServer().listen(port)` against each candidate. The first
 * candidate that binds freely wins. Tests inject a `probe(port)` that
 * resolves to a boolean so no real socket binding happens in unit runs.
 */
export async function selectAvailablePort(candidates, { probe } = {}) {
  const probeFn = probe || defaultPortProbe;
  for (const candidate of candidates) {
    // Narrow casts so a test mock returning truthy values still behaves.
    // eslint-disable-next-line no-await-in-loop -- candidates are tried sequentially by contract.
    const free = await probeFn(candidate);
    if (free) return candidate;
  }
  return null;
}

function defaultPortProbe(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    const cleanup = (value) => {
      if (settled) return;
      settled = true;
      try { server.close(); } catch { /* noop */ }
      resolve(value);
    };
    server.once('error', () => cleanup(false));
    server.once('listening', () => cleanup(true));
    try {
      server.listen({ port, host: '127.0.0.1', exclusive: true });
    } catch {
      cleanup(false);
    }
  });
}

// ---------------------------------------------------------------------------
// Readiness poll
// ---------------------------------------------------------------------------

/**
 * Two-stage readiness poll. Stage 1: GET `/api/health` expects any 2xx
 * response. Stage 2: POST `/api/demo/session` expects any 2xx response. Only
 * after BOTH succeed is the worker considered ready — the two-stage check
 * avoids an auth-401-as-ready false positive (a D1 binding misconfiguration
 * can produce 401 from the auth middleware while `/api/health` still returns
 * 2xx).
 *
 * adv-u4-001: stage 2 was previously `=== 200` but the real Worker's
 * `createDemoSession` returns 201 Created on success (see
 * `worker/src/demo/sessions.js:353`). Accepting any 2xx matches the real
 * contract while still rejecting 3xx redirects, 4xx auth failures, and 5xx
 * errors.
 */
function isTwoXx(res) {
  if (!res || typeof res.status !== 'number') return false;
  return res.status >= 200 && res.status < 300;
}

async function waitForReadiness({ origin, fetchFn, timeoutMs, nowMs, sleep }) {
  const deadline = nowMs() + timeoutMs;
  let delay = READINESS_POLL_START_MS;

  while (nowMs() < deadline) {
    let stageOne = false;
    try {
      const healthRes = await fetchFn(`${origin}/api/health`, { method: 'GET' });
      if (isTwoXx(healthRes)) stageOne = true;
    } catch { /* ignore, retry */ }

    if (stageOne) {
      try {
        const demoRes = await fetchFn(`${origin}/api/demo/session`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (isTwoXx(demoRes)) return { ready: true };
      } catch { /* ignore, retry */ }
    }

    if (nowMs() >= deadline) break;
    await sleep(delay);
    delay = Math.min(delay * 2, READINESS_POLL_CAP_MS);
  }

  return { ready: false };
}

// ---------------------------------------------------------------------------
// Redacting write pipeline
// ---------------------------------------------------------------------------

/**
 * Pipe a child process's stdout/stderr through the redaction filter into the
 * on-disk log file. Returns an object with `{close}` so callers can flush
 * before exit.
 *
 * adv-u4-002: routes bytes through `createRedactionStream` so partial lines
 * that span stream-chunk boundaries accumulate in a state buffer and only
 * get scrubbed once the line terminator arrives. The stream's `end()` method
 * flushes whatever tail remains through the redaction filter before closing
 * the write stream.
 *
 * `close()` waits one turn of the event loop for any queued stdout/stderr
 * emissions (real subprocesses can deliver buffered chunks after SIGINT; the
 * fake children used by tests deliver theirs via `setImmediate`). After the
 * grace turn elapses the write stream is ended and the `data` listeners
 * detached, avoiding a `write after end` crash.
 */
function attachRedactedLogPipe(child, logPath) {
  mkdirSync(dirname(logPath), { recursive: true });
  const fileStream = createWriteStream(logPath, { flags: 'w' });
  let closed = false;
  let fileStreamEnded = false;

  // A sink that writes to `fileStream` only while it's still open. The
  // internal redaction stream keeps its own state, so the sink itself is
  // stateless beyond the closed flag.
  const redactionStream = createRedactionStream({
    write(text) {
      if (closed || fileStreamEnded) return;
      fileStream.write(text);
    },
    // Deliberately no `end()` here — the write stream's end is handled
    // explicitly in the returned `close()` method so callers can await it.
  });

  const writeChunk = (chunk) => {
    if (closed) return;
    redactionStream.write(chunk);
  };
  child.stdout.on('data', writeChunk);
  child.stderr.on('data', writeChunk);
  return {
    async close() {
      // Yield once so any already-scheduled `setImmediate`-emitted chunks are
      // flushed before we drop the listeners. One extra microtask is enough
      // for Node's internal timers queue to flush pending data events.
      await new Promise((resolve) => setImmediate(resolve));
      closed = true;
      try { child.stdout.removeListener('data', writeChunk); } catch { /* noop */ }
      try { child.stderr.removeListener('data', writeChunk); } catch { /* noop */ }
      // Flush residual buffered bytes through the redaction stream before
      // closing the file. This covers the case where wrangler emitted a
      // trailing fragment without a newline.
      redactionStream.end();
      fileStreamEnded = true;
      await new Promise((resolve) => fileStream.end(resolve));
    },
  };
}

// ---------------------------------------------------------------------------
// Driver argv composition
// ---------------------------------------------------------------------------

/**
 * Build the argv forwarded to `classroom-load-test.mjs`.
 *
 * - `--local-fixture`, `--origin <resolved>`, `--demo-sessions` are forced at
 *   the front (the orchestrator owns these contracts).
 * - `--output <evidencePath>` is injected by the orchestrator (adv-u4-003).
 *   If the operator supplied their own `--output <path>` in the passthrough
 *   it wins (the caller can detect this via the returned `operatorOutputPath`
 *   and warn).
 * - `--fresh` passthrough is appended after all orchestrator-owned flags so
 *   the driver can wipe its per-run state.
 */
export function composeDriverArgs({ originResolved, evidencePath, passthrough = [], fresh = false }) {
  const operatorOutputIndex = passthrough.indexOf('--output');
  const operatorOutputPath = operatorOutputIndex >= 0 ? passthrough[operatorOutputIndex + 1] : null;

  const argv = [
    '--local-fixture',
    '--origin', originResolved,
    '--demo-sessions',
  ];
  if (!operatorOutputPath) {
    argv.push('--output', evidencePath);
  }
  for (const item of passthrough) argv.push(item);
  if (fresh) argv.push('--fresh');

  return {
    argv,
    operatorOutputPath,
    effectiveEvidencePath: operatorOutputPath || evidencePath,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator top-level
// ---------------------------------------------------------------------------

/**
 * Run the full local-fixture capacity orchestration.
 *
 * @param {string[]} argv
 * @param {object} injections — test hooks. Production callers pass `{}`
 *   and the orchestrator fills in real `spawn` / `fetch` / fs wiring.
 * @returns {Promise<{exitCode: number, port: number|null, originResolved: string|null, environment: string, error?: string}>}
 */
export async function runLocalWorkerOrchestrator(argv = [], injections = {}) {
  let parsed;
  try {
    parsed = parseLocalWorkerArgs(argv);
  } catch (error) {
    return { exitCode: 2, port: null, originResolved: null, environment: 'local', error: error.message };
  }
  if (parsed.help) {
    return { exitCode: 0, port: null, originResolved: null, environment: 'local', help: true };
  }

  // Pre-scan the driver passthrough for orchestrator-owned flag collisions.
  // Rejecting upfront avoids a multi-minute wait before wrangler spawn.
  try {
    rejectConflictingDriverArgs(parsed.driverArgs);
  } catch (error) {
    return { exitCode: 2, port: null, originResolved: null, environment: 'local', error: error.message };
  }

  const {
    platform = process.platform,
    spawn = realSpawn,
    probePort,
    fetch: fetchFn = globalThis.fetch,
    runMigrations = defaultRunMigrations,
    runDriver = defaultRunDriver,
    killChild = defaultKillChild,
    logPath = resolvePath(process.cwd(), DEFAULT_LOG_PATH),
    evidencePath = resolvePath(process.cwd(), DEFAULT_EVIDENCE_PATH),
    nowMs = () => Date.now(),
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    triggerSigint = false,
    warn = (msg) => process.stderr.write(`capacity-local-worker: ${msg}\n`),
    existsFile = existsSync,
    statFile = statSync,
  } = injections;

  // Stage 1: apply local D1 migrations. Failures here are fatal — no point
  // starting wrangler without the schema in place.
  const migrationsEnv = sanitiseWranglerEnv(process.env);
  const migrationResult = await runMigrations(migrationsEnv);
  if (migrationResult && migrationResult.exitCode !== 0) {
    return {
      exitCode: migrationResult.exitCode,
      port: null,
      originResolved: null,
      environment: 'local',
      error: `db:migrate:local exited with ${migrationResult.exitCode}`,
    };
  }

  // Stage 2: pick a free port (8787 → 8788 → 8789 → abort).
  const candidates = Array.from({ length: PORT_CANDIDATES_COUNT }, (_, i) => parsed.portStart + i);
  const port = await selectAvailablePort(candidates, { probe: probePort });
  if (port === null) {
    return {
      exitCode: 2,
      port: null,
      originResolved: null,
      environment: 'local',
      error: `No free port available in range ${candidates.join(', ')}`,
    };
  }
  const originResolved = `http://localhost:${port}`;

  // Stage 3: spawn wrangler through the oauth wrapper with sanitised env.
  const { cmd, args } = buildWranglerSpawnCommand({ port, platform });
  const spawnEnv = sanitiseWranglerEnv(process.env);
  const child = spawn(cmd, args, {
    env: spawnEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logPipe = attachRedactedLogPipe(child, logPath);

  // Emit the chosen port to stdout before handing off to the load driver.
  // Operators reading a CI console can correlate this line with the evidence
  // JSON's `safety.originResolved` field.
  process.stdout.write(`capacity-local-worker: selected ${originResolved}\n`);

  // Stage 4: poll readiness. On timeout, tear down and exit 2.
  const teardownPlan = buildTeardownCommand({ platform, pid: child.pid || 1 });
  const readiness = await waitForReadiness({
    origin: originResolved,
    fetchFn,
    timeoutMs: parsed.readinessTimeoutMs,
    nowMs,
    sleep,
  });
  if (!readiness.ready) {
    await killChild(child, teardownPlan);
    await logPipe.close();
    return {
      exitCode: 2,
      port,
      originResolved,
      environment: 'local',
      error: 'wrangler readiness timeout',
    };
  }

  // Stage 5: run the load driver. Compose driverArgs with --local-fixture +
  // --origin + --demo-sessions + --output by default; operator-supplied argv
  // (after `--`) is appended verbatim so operators can pin thresholds. If the
  // operator passes their own `--output` it wins (with a warning).
  const composed = composeDriverArgs({
    originResolved,
    evidencePath,
    passthrough: parsed.driverArgs,
    fresh: parsed.fresh,
  });
  if (composed.operatorOutputPath) {
    warn(`operator --output ${composed.operatorOutputPath} overrides default evidence path ${evidencePath}.`);
  }

  // Support a SIGINT simulation for the test that exercises the error path.
  const abortController = new AbortController();
  let driverResult;
  if (triggerSigint) {
    // Fire abort on the next tick so the driver promise resolves via the test
    // injection's signal listener.
    setImmediate(() => abortController.abort());
  }

  try {
    driverResult = await runDriver({
      argv: composed.argv,
      env: sanitiseWranglerEnv(process.env),
      signal: abortController.signal,
    });
  } catch (error) {
    driverResult = { exitCode: 1, error: error.message };
  }

  // Stage 6: always tear down wrangler, even on driver failure.
  await killChild(child, teardownPlan);
  await logPipe.close();

  const exitCode = Number.isInteger(driverResult && driverResult.exitCode)
    ? driverResult.exitCode
    : (driverResult && driverResult.ok ? 0 : 1);

  // adv-u4-003: if the driver reports success but the evidence file is
  // missing, fail loudly so downstream verifiers never read stale evidence.
  if (exitCode === 0) {
    const evidenceCheckPath = composed.effectiveEvidencePath;
    let evidenceOk = false;
    try {
      if (existsFile(evidenceCheckPath)) {
        const stats = statFile(evidenceCheckPath);
        evidenceOk = stats && stats.size > 0;
      }
    } catch { evidenceOk = false; }
    if (!evidenceOk) {
      return {
        exitCode: 3,
        port,
        originResolved,
        environment: 'local',
        error: `driver reported success but evidence file missing or empty at ${evidenceCheckPath}`,
      };
    }
  }

  return {
    exitCode,
    port,
    originResolved,
    environment: 'local',
  };
}

// ---------------------------------------------------------------------------
// Default (production) injections
// ---------------------------------------------------------------------------

function defaultRunMigrations(env) {
  const result = realSpawnSync(
    process.execPath,
    [resolvePath(__dirname, 'wrangler-oauth.mjs'), 'd1', 'migrations', 'apply', 'ks2-mastery-db', '--local'],
    {
      stdio: 'inherit',
      env,
      shell: false,
    },
  );
  return { exitCode: result.status ?? 1 };
}

function defaultRunDriver({ argv, env, signal }) {
  return new Promise((resolve) => {
    const child = realSpawn(
      process.execPath,
      [resolvePath(__dirname, 'classroom-load-test.mjs'), ...argv],
      {
        stdio: 'inherit',
        env,
      },
    );
    if (signal) {
      signal.addEventListener('abort', () => {
        try { child.kill('SIGINT'); } catch { /* noop */ }
      });
    }
    child.on('exit', (code) => resolve({ exitCode: code ?? 1 }));
    child.on('error', () => resolve({ exitCode: 1 }));
  });
}

function defaultKillChild(child, plan) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (settled) return; settled = true; resolve(); };
    // Always resolve after a short grace period even if `exit` never fires
    // (prevents a wedged teardown from hanging the orchestrator).
    const graceMs = 3000;
    const graceTimer = setTimeout(finish, graceMs).unref?.();
    child.once('exit', () => { clearTimeout(graceTimer); finish(); });

    try {
      if (plan.kind === 'signal') {
        child.kill(plan.signal);
      } else {
        // Windows: spawn `taskkill` synchronously; ignore its exit.
        realSpawnSync(plan.cmd, plan.args, { stdio: 'ignore', shell: false });
      }
    } catch { /* noop — fall through to grace timer */ }
  });
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

function helpText() {
  return [
    'Usage: node ./scripts/capacity-local-worker.mjs [options] -- [driver args]',
    '',
    'Orchestrates a local wrangler dev --local subprocess and runs the classroom',
    'load driver against it. Not wired into `npm run check` or `npm run verify`.',
    '',
    'Options:',
    '  --fresh                         Forward --fresh to the load driver',
    '  --port-start <n>                First port to try (default 8787, max 65533)',
    '  --readiness-timeout-ms <n>      Readiness hard cap in ms (default 30000)',
    '  --help, -h                      Show this help',
    '',
    'Every argument after -- is forwarded unchanged to classroom-load-test.mjs,',
    'except that the orchestrator owns --origin/--url/--local-fixture/--demo-sessions',
    'and will reject those if supplied in the passthrough. --output is honoured as',
    'an override with a warning; by default the orchestrator injects --output',
    `"${DEFAULT_EVIDENCE_PATH}".`,
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const invokedArgs = process.argv.slice(2);
  // Pre-check --help so operators can run the script without ever spawning
  // wrangler.
  if (invokedArgs.includes('--help') || invokedArgs.includes('-h')) {
    process.stdout.write(`${helpText()}\n`);
    process.exit(0);
  }

  runLocalWorkerOrchestrator(invokedArgs, {}).then((result) => {
    if (result.error) {
      process.stderr.write(`capacity-local-worker: ${result.error}\n`);
    }
    process.exit(result.exitCode);
  }).catch((error) => {
    process.stderr.write(`capacity-local-worker: ${error.stack || error.message}\n`);
    process.exit(1);
  });
}

// Helper re-exports for tests that stub out the filesystem check.
export { existsSync };
