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
// - Exit 2 on readiness timeout
// - Exit 130 on SIGINT
// - NEVER wire into `npm run check` or `npm run verify`
//
// All side effects (spawn, fetch, fs writes, net probes, platform dispatch)
// are injectable so the 10 scenarios under `tests/capacity-scripts.test.js`
// can exercise the logic without a real wrangler subprocess.

import net from 'node:net';
import { spawn as realSpawn, spawnSync as realSpawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { redactLogChunk } from './lib/log-redaction.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_PORT_START = 8787;
const PORT_CANDIDATES_COUNT = 3;
const DEFAULT_READINESS_TIMEOUT_MS = 30000;
const READINESS_POLL_START_MS = 100;
const READINESS_POLL_CAP_MS = 1000;
const DEFAULT_LOG_PATH = 'reports/capacity/local-worker-stdout.log';
const DEFAULT_EVIDENCE_PATH = 'reports/capacity/latest-local.json';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

/**
 * Parse capacity-local-worker CLI args.
 *
 * - Every arg BEFORE the literal `--` separator is interpreted as an
 *   orchestrator flag (`--fresh`, `--port-start`, `--readiness-timeout-ms`).
 * - Every arg AFTER `--` is captured verbatim into `driverArgs` and forwarded
 *   to `classroom-load-test.mjs` unchanged. This keeps the orchestrator out of
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

// ---------------------------------------------------------------------------
// Env sanitisation (defence-in-depth; wrangler-oauth.mjs already strips)
// ---------------------------------------------------------------------------

/**
 * Remove secrets that must never reach the wrangler child-process env. Returns
 * a NEW object; does not mutate the input. Matches the guard in
 * `scripts/wrangler-oauth.mjs` so the orchestrator double-defends even if the
 * oauth wrapper is ever replaced.
 */
export function sanitiseWranglerEnv(env = {}) {
  const cleaned = { ...env };
  const isWorkersBuild = cleaned.WORKERS_CI === '1';
  if (!isWorkersBuild) {
    delete cleaned.CLOUDFLARE_API_TOKEN;
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
 * Two-stage readiness poll. Stage 1: GET `/api/health` expects 200. Stage 2:
 * POST `/api/demo/session` expects 200. Only after BOTH succeed is the worker
 * considered ready — the two-stage check avoids an auth-401-as-ready false
 * positive (a D1 binding misconfiguration can produce 401 from the auth
 * middleware while `/api/health` still returns 200).
 */
async function waitForReadiness({ origin, fetchFn, timeoutMs, nowMs, sleep }) {
  const deadline = nowMs() + timeoutMs;
  let delay = READINESS_POLL_START_MS;

  while (nowMs() < deadline) {
    let stageOne = false;
    try {
      const healthRes = await fetchFn(`${origin}/api/health`, { method: 'GET' });
      if (healthRes && healthRes.status === 200) stageOne = true;
    } catch { /* ignore, retry */ }

    if (stageOne) {
      try {
        const demoRes = await fetchFn(`${origin}/api/demo/session`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (demoRes && demoRes.status === 200) return { ready: true };
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
 * `close()` waits one turn of the event loop for any queued stdout/stderr
 * emissions (real subprocesses can deliver buffered chunks after SIGINT; the
 * fake children used by tests deliver theirs via `setImmediate`). After the
 * grace turn elapses the write stream is ended and the `data` listeners
 * detached, avoiding a `write after end` crash.
 */
function attachRedactedLogPipe(child, logPath) {
  mkdirSync(dirname(logPath), { recursive: true });
  const stream = createWriteStream(logPath, { flags: 'w' });
  let closed = false;
  const writeChunk = (chunk) => {
    if (closed) return;
    const scrubbed = redactLogChunk(chunk);
    stream.write(scrubbed);
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
      await new Promise((resolve) => stream.end(resolve));
    },
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
  // --origin + --demo-sessions by default; operator-supplied argv (after `--`)
  // is appended verbatim so operators can pin thresholds, output paths, etc.
  const driverArgs = [
    '--local-fixture',
    '--origin', originResolved,
    '--demo-sessions',
    ...parsed.driverArgs,
  ];
  // Forward the orchestrator --fresh flag so the load driver can wipe its own
  // per-run state if needed. Does NOT touch .wrangler/state in v1.
  if (parsed.fresh) driverArgs.push('--fresh');

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
      argv: driverArgs,
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
    '  --port-start <n>                First port to try (default 8787)',
    '  --readiness-timeout-ms <n>      Readiness hard cap in ms (default 30000)',
    '  --help, -h                      Show this help',
    '',
    'Every argument after -- is forwarded unchanged to classroom-load-test.mjs.',
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

// Helper used by existsSync in tests via `await import`.
export { existsSync };
