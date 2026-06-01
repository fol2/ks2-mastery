#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const DEFAULT_ORIGIN = 'https://ks2.eugnel.uk';
const DEFAULT_SAMPLES = 5;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_D1_DATABASE = 'ks2-mastery-db';

const EXIT_OK = 0;
const EXIT_HEALTH_FAIL = 1;
const EXIT_USAGE = 2;

const REQUIRED_TABLES = Object.freeze([
  'account_sessions',
  'child_game_state',
  'child_subject_state',
  'event_log',
  'learner_read_models',
  'mutation_receipts',
  'practice_sessions',
  'request_limits',
]);

const REQUIRED_INDEXES = Object.freeze([
  'idx_account_sessions_expires',
  'idx_event_log_learner_created',
  'idx_practice_sessions_learner_subject',
  'idx_practice_sessions_learner_updated',
  'idx_request_limits_updated',
]);

const REMOVED_LEGACY_TABLES = Object.freeze([
  'children',
  'child_state',
  'learners',
  'reward_events',
  'sessions',
  'spelling_sessions',
  'subscriptions',
  'user_identities',
  'users',
]);

const REMOVED_WRITE_AMPLIFYING_INDEXES = Object.freeze([
  'idx_learner_read_models_key_updated',
  'idx_mutation_receipts_account_applied',
  'idx_mutation_receipts_scope',
  'idx_practice_sessions_updated',
  'idx_request_limits_updated_at',
]);

const ROW_COUNT_TABLES = Object.freeze([
  'account_sessions',
  'demo_accounts',
  'event_log',
  'learner_activity_feed',
  'learner_read_models',
  'mutation_receipts',
  'practice_sessions',
  'real_accounts',
  'request_limits',
]);

function usage() {
  return [
    'Usage: node scripts/production-health-snapshot.mjs [options]',
    '',
    'Read-only production health snapshot. Default mode does not create sessions,',
    'does not submit answers, and does not run COUNT(*) over application tables.',
    '',
    'Options:',
    `  --origin <url>            Origin to probe (default ${DEFAULT_ORIGIN})`,
    `  --samples <n>             Samples per public endpoint (default ${DEFAULT_SAMPLES})`,
    `  --timeout-ms <n>          Per-request timeout (default ${DEFAULT_TIMEOUT_MS})`,
    `  --d1-database <name>      D1 database binding name (default ${DEFAULT_D1_DATABASE})`,
    '  --skip-d1                 Skip remote D1 metadata/schema checks',
    '  --include-row-counts      Also run COUNT(*) diagnostics on selected tables',
    '  --json                    Print compact JSON only',
    '  --help                    Show this help',
  ].join('\n');
}

function readValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${optionName} requires a value.`);
  return value;
}

function positiveInteger(value, optionName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return parsed;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    origin: DEFAULT_ORIGIN,
    samples: DEFAULT_SAMPLES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    d1Database: DEFAULT_D1_DATABASE,
    skipD1: false,
    includeRowCounts: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--origin') {
      options.origin = new URL(readValue(argv, i, arg)).origin;
      i += 1;
    } else if (arg === '--samples') {
      options.samples = positiveInteger(readValue(argv, i, arg), arg);
      i += 1;
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = positiveInteger(readValue(argv, i, arg), arg);
      i += 1;
    } else if (arg === '--d1-database') {
      options.d1Database = readValue(argv, i, arg);
      i += 1;
    } else if (arg === '--skip-d1') {
      options.skipD1 = true;
    } else if (arg === '--include-row-counts') {
      options.includeRowCounts = true;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function percentile(values, percentileRank) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileRank / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function roundMs(value) {
  return value == null ? null : Math.round(value * 10) / 10;
}

export function summariseHttpSamples(samples) {
  const wallTimes = samples
    .filter((sample) => typeof sample.wallMs === 'number')
    .map((sample) => sample.wallMs);
  const statuses = {};
  for (const sample of samples) {
    const key = sample.status == null ? 'network_error' : String(sample.status);
    statuses[key] = (statuses[key] || 0) + 1;
  }
  return {
    sampleCount: samples.length,
    okCount: samples.filter((sample) => sample.ok).length,
    statuses,
    p50WallMs: roundMs(percentile(wallTimes, 50)),
    p95WallMs: roundMs(percentile(wallTimes, 95)),
    maxWallMs: roundMs(wallTimes.length ? Math.max(...wallTimes) : null),
    failures: samples
      .filter((sample) => !sample.ok)
      .map((sample) => ({
        status: sample.status,
        error: sample.error || null,
      })),
  };
}

function timeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  return controller.signal;
}

async function timedFetchJson({ origin, path, timeoutMs }) {
  const started = performance.now();
  try {
    const response = await fetch(new URL(path, origin), {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: timeoutSignal(timeoutMs),
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      // Keep payload null; the failure is represented below.
    }
    return {
      ok: response.ok && payload?.ok !== false,
      status: response.status,
      wallMs: performance.now() - started,
      payload,
      error: payload == null && text ? 'invalid_json' : null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      wallMs: performance.now() - started,
      payload: null,
      error: error?.name || error?.message || 'network_error',
    };
  }
}

async function probeEndpoint({ origin, path, samples, timeoutMs }) {
  const results = [];
  for (let i = 0; i < samples; i += 1) {
    results.push(await timedFetchJson({ origin, path, timeoutMs }));
  }
  return {
    path,
    ...summariseHttpSamples(results),
    latestPayload: results.at(-1)?.payload || null,
  };
}

function quotedSqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function presenceRows() {
  return [
    ...REQUIRED_TABLES.map((name) => ['required_table', name, 'table', 1]),
    ...REQUIRED_INDEXES.map((name) => ['required_index', name, 'index', 1]),
    ...REMOVED_LEGACY_TABLES.map((name) => ['removed_legacy_table', name, 'table', 0]),
    ...REMOVED_WRITE_AMPLIFYING_INDEXES.map((name) => ['removed_write_amplifying_index', name, 'index', 0]),
  ];
}

function presenceSql() {
  const values = presenceRows()
    .map(([kind, name, type, expectedPresent]) => (
      `(${quotedSqlString(kind)}, ${quotedSqlString(name)}, ${quotedSqlString(type)}, ${expectedPresent})`
    ))
    .join(',\n');
  return [
    'WITH expected(kind, name, object_type, expected_present) AS (',
    `  VALUES ${values}`,
    ')',
    'SELECT kind, name,',
    '  CASE WHEN EXISTS (',
    '    SELECT 1 FROM sqlite_master',
    '    WHERE type = expected.object_type AND name = expected.name',
    '  ) THEN 1 ELSE 0 END AS present,',
    '  expected_present',
    'FROM expected',
    'ORDER BY kind, name',
  ].join('\n');
}

function rowCountUnion(tableNames) {
  return tableNames
    .map((name) => `SELECT ${quotedSqlString(name)} AS table_name, COUNT(*) AS row_count FROM ${name}`)
    .join('\nUNION ALL\n');
}

export function buildD1HealthSql({ includeRowCounts = false } = {}) {
  return `${buildD1HealthStatements({ includeRowCounts }).join(';\n')};`;
}

export function buildD1HealthStatements({ includeRowCounts = false } = {}) {
  const statements = [
    'SELECT 1 AS read_only_probe',
    presenceSql(),
  ];

  if (includeRowCounts) {
    statements.push(rowCountUnion(ROW_COUNT_TABLES));
  }

  return statements;
}

export function parseWranglerJsonOutput(stdout) {
  const text = String(stdout || '').trim();
  if (!text) throw new Error('Wrangler returned no JSON output.');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Wrangler output did not contain a JSON array.');
  }
  return JSON.parse(text.slice(start, end + 1));
}

function execFilePromise(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function runD1Execute({ database, sql }) {
  const statements = Array.isArray(sql) ? sql : [sql];
  const results = [];
  for (const statement of statements) {
    const { stdout } = await execFilePromise(
      process.execPath,
      ['./scripts/wrangler-oauth.mjs', 'd1', 'execute', database, '--remote', '--json', '--command', statement],
      {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        env: process.env,
      },
    );
    results.push(...parseWranglerJsonOutput(stdout));
  }
  return results;
}

export function summariseD1Results(results, { includeRowCounts = false } = {}) {
  const failures = [];
  const allMeta = results.map((entry) => entry?.meta || {});
  const changedDb = allMeta.some((meta) => meta.changed_db === true);
  const rowsWritten = allMeta.reduce((sum, meta) => sum + (Number(meta.rows_written) || 0), 0);
  const rowsRead = allMeta.reduce((sum, meta) => sum + (Number(meta.rows_read) || 0), 0);
  const sizeAfterBytes = [...allMeta].reverse().find((meta) => Number.isFinite(Number(meta.size_after)))?.size_after ?? null;

  if (changedDb) failures.push('Remote D1 metadata probe reported changed_db=true.');
  if (rowsWritten !== 0) failures.push(`Remote D1 metadata probe reported rows_written=${rowsWritten}.`);

  const presenceRows = results[1]?.results || [];
  const missingRequired = presenceRows
    .filter((row) => row.expected_present === 1 && row.present !== 1)
    .map((row) => `${row.kind}:${row.name}`);
  const presentRemoved = presenceRows
    .filter((row) => row.expected_present === 0 && row.present !== 0)
    .map((row) => `${row.kind}:${row.name}`);

  if (missingRequired.length) failures.push(`Missing required D1 objects: ${missingRequired.join(', ')}`);
  if (presentRemoved.length) failures.push(`Removed D1 objects still present: ${presentRemoved.join(', ')}`);

  return {
    ok: failures.length === 0,
    changedDb,
    rowsRead,
    rowsWritten,
    sizeAfterBytes,
    sizeAfterMb: sizeAfterBytes == null ? null : Math.round((Number(sizeAfterBytes) / 1024 / 1024) * 100) / 100,
    missingRequired,
    presentRemoved,
    rowCounts: includeRowCounts ? Object.fromEntries(
      (results[2]?.results || []).map((row) => [row.table_name, row.row_count]),
    ) : null,
    failures,
  };
}

export async function runProductionHealthSnapshot(options) {
  const endpoints = {};
  for (const path of ['/api/health', '/api/version']) {
    endpoints[path] = await probeEndpoint({
      origin: options.origin,
      path,
      samples: options.samples,
      timeoutMs: options.timeoutMs,
    });
  }

  const failures = [];
  for (const [path, summary] of Object.entries(endpoints)) {
    if (summary.okCount !== summary.sampleCount) {
      failures.push(`${path} had ${summary.sampleCount - summary.okCount} failed sample(s).`);
    }
  }

  const versionPayload = endpoints['/api/version'].latestPayload;
  const buildHash = typeof versionPayload?.buildHash === 'string'
    ? versionPayload.buildHash
    : null;

  let d1 = null;
  if (!options.skipD1) {
    const results = await runD1Execute({
      database: options.d1Database,
      sql: buildD1HealthStatements({ includeRowCounts: options.includeRowCounts }),
    });
    d1 = summariseD1Results(results, { includeRowCounts: options.includeRowCounts });
    failures.push(...d1.failures);
  }

  return {
    ok: failures.length === 0,
    generatedAt: new Date().toISOString(),
    origin: options.origin,
    readOnly: true,
    samplesPerEndpoint: options.samples,
    buildHash,
    endpoints,
    d1,
    failures,
  };
}

function printHuman(report) {
  console.log(`Production health snapshot: ${report.ok ? 'PASS' : 'FAIL'}`);
  console.log(`Origin: ${report.origin}`);
  console.log(`Build hash: ${report.buildHash || 'unknown'}`);
  for (const [path, summary] of Object.entries(report.endpoints)) {
    console.log(
      `${path}: ${summary.okCount}/${summary.sampleCount} ok, `
      + `p95 ${summary.p95WallMs} ms, max ${summary.maxWallMs} ms, statuses ${JSON.stringify(summary.statuses)}`,
    );
  }
  if (report.d1) {
    console.log(
      `D1: ${report.d1.ok ? 'PASS' : 'FAIL'}, size ${report.d1.sizeAfterMb ?? 'unknown'} MB, `
      + `rows_read ${report.d1.rowsRead}, rows_written ${report.d1.rowsWritten}, changed_db ${report.d1.changedDb}`,
    );
  }
  if (report.failures.length) {
    console.log('Failures:');
    for (const failure of report.failures) console.log(`- ${failure}`);
  }
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  let options;
  try {
    options = parseArgs();
  } catch (error) {
    console.error(error?.message || String(error));
    console.error(usage());
    process.exit(EXIT_USAGE);
  }

  if (options.help) {
    console.log(usage());
    process.exit(EXIT_OK);
  }

  try {
    const report = await runProductionHealthSnapshot(options);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }
    process.exit(report.ok ? EXIT_OK : EXIT_HEALTH_FAIL);
  } catch (error) {
    const report = {
      ok: false,
      generatedAt: new Date().toISOString(),
      origin: options.origin,
      readOnly: true,
      failures: [error?.message || String(error)],
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(EXIT_HEALTH_FAIL);
  }
}

const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;
if (invokedPath) {
  main();
}
