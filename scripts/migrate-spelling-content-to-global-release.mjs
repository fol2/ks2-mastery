import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { uid } from '../src/platform/core/utils.js';
import {
  buildSpellingContentSummary,
  validateSpellingContentBundle,
} from '../src/subjects/spelling/content/model.js';
import {
  contentOperationHash,
} from '../src/subjects/spelling/content/operations-model.js';
import {
  encodeContentOperationSnapshot,
} from '../src/subjects/spelling/content/release-snapshot-codec.js';
import {
  readSeededSpellingContentBundle,
} from '../worker/src/generated-spelling-content-seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const scriptRelativePath = 'scripts/migrate-spelling-content-to-global-release.mjs';
const remoteConfirmation = 'seed-first-global-release';

function readOptionValue(argv, index, flag) {
  if (index + 1 >= argv.length) throw new Error(`${flag} requires a value.`);
  return argv[index + 1];
}

function sqlString(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid integer SQL value: ${value}`);
  return String(Math.trunc(number));
}

function parseWranglerJsonOutput(stdout) {
  const text = String(stdout || '').trim();
  if (!text) throw new Error('Wrangler returned no JSON output.');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Wrangler output did not contain a JSON array.');
  }
  return JSON.parse(text.slice(start, end + 1));
}

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function chunkString(value, chunkSize = 80_000) {
  const chunks = [];
  const text = String(value || '');
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }
  return chunks.length ? chunks : [''];
}

function snapshotSqlExpression(snapshotValue) {
  const chunks = chunkString(snapshotValue);
  if (chunks.length === 1 && chunks[0].length < 80_000) {
    return {
      setupSql: [],
      valueExpression: sqlString(chunks[0]),
      teardownSql: [],
      chunkCount: chunks.length,
    };
  }
  return {
    setupSql: [
      'CREATE TEMP TABLE _content_operation_seed_snapshot_chunks (chunk_index INTEGER PRIMARY KEY, chunk_value TEXT NOT NULL);',
      ...chunks.map((chunk, index) => (
        `INSERT INTO _content_operation_seed_snapshot_chunks (chunk_index, chunk_value) VALUES (${sqlInteger(index)}, ${sqlString(chunk)});`
      )),
    ],
    valueExpression: "(SELECT group_concat(chunk_value, '') FROM (SELECT chunk_value FROM _content_operation_seed_snapshot_chunks ORDER BY chunk_index ASC))",
    teardownSql: ['DROP TABLE _content_operation_seed_snapshot_chunks;'],
    chunkCount: chunks.length,
  };
}

function usage() {
  return [
    'Usage: node scripts/migrate-spelling-content-to-global-release.mjs [--dry-run|--apply] [--local|--remote] [options]',
    '',
    'Options:',
    '  --dry-run             Validate and print the planned release (default; add --local or --remote to inspect D1 legacy content).',
    '  --apply               Apply the idempotent seed SQL through scripts/wrangler-oauth.mjs after reading current D1 legacy content.',
    '  --local               Target the local D1 database (default for --apply).',
    '  --remote              Target the remote D1 database. Requires KS2_CONFIRM_CONTENT_OPERATION_SEED=seed-first-global-release.',
    '  --actor <account-id>  Account id recorded as the seed actor.',
    '  --out <file.sql>      Write the generated SQL for review or manual archiving.',
    '  --yes                 Pass --yes through to Wrangler for non-interactive apply.',
    '  --help                Show this help.',
  ].join('\n');
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    apply: false,
    dryRun: true,
    remote: false,
    local: false,
    yes: false,
    actorAccountId: 'content-operations-seed-script',
    outFile: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--apply':
        options.apply = true;
        options.dryRun = false;
        break;
      case '--dry-run':
        options.apply = false;
        options.dryRun = true;
        break;
      case '--remote':
        options.remote = true;
        break;
      case '--local':
        options.local = true;
        break;
      case '--yes':
        options.yes = true;
        break;
      case '--actor':
        options.actorAccountId = readOptionValue(argv, index, arg).trim();
        index += 1;
        break;
      case '--out':
        options.outFile = path.resolve(process.cwd(), readOptionValue(argv, index, arg));
        index += 1;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
    }
  }

  if (options.remote && options.local) {
    throw new Error('Choose either --local or --remote, not both.');
  }
  if (!options.actorAccountId) {
    throw new Error('--actor must not be blank.');
  }
  if (options.apply && !options.remote && !options.local) {
    options.local = true;
  }
  return options;
}

function runWranglerD1Json(command, options) {
  const args = [
    path.join(rootDir, 'scripts', 'wrangler-oauth.mjs'),
    'd1',
    'execute',
    'ks2-mastery-db',
    options.remote ? '--remote' : '--local',
    '--json',
    '--command',
    command,
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env },
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    const stderr = String(result.stderr || '').trim();
    throw new Error(`Wrangler D1 query exited with status ${result.status ?? 1}.${stderr ? `\n${stderr}` : ''}`);
  }
  return parseWranglerJsonOutput(result.stdout);
}

function readLatestLegacyContentSource(options) {
  const resultSets = runWranglerD1Json(`
    SELECT account_id, subject_id, content_json, updated_at, updated_by_account_id
    FROM account_subject_content
    WHERE subject_id = 'spelling'
    ORDER BY updated_at DESC
    LIMIT 1
  `, options);
  const row = resultSets.flatMap((entry) => Array.isArray(entry?.results) ? entry.results : [])[0] || null;
  const bundle = parseJson(row?.content_json, null);
  if (!bundle) return null;
  return {
    bundle,
    source: {
      type: 'account_subject_content',
      accountId: row.account_id || null,
      updatedAt: Number(row.updated_at) || 0,
      updatedByAccountId: row.updated_by_account_id || null,
      script: scriptRelativePath,
    },
  };
}

export async function buildFirstGlobalReleaseSeedPlan({
  now = () => Date.now(),
  releaseId = uid('corel'),
  eventId = uid('coevt'),
  actorAccountId = 'content-operations-seed-script',
  sourceBundle = null,
  source = null,
} = {}) {
  const nowTs = Number(now());
  const bundle = sourceBundle || await readSeededSpellingContentBundle();
  const validation = validateSpellingContentBundle(bundle);
  if (!validation.ok) {
    const errors = validation.errors
      .map((issue) => `- [${issue.code}] ${issue.path}: ${issue.message}`)
      .join('\n');
    throw new Error(`Refusing to seed invalid bundled spelling content.\n${errors}`);
  }

  const summary = buildSpellingContentSummary(validation.bundle);
  const snapshotHash = contentOperationHash(validation.bundle, 'release');
  const seedSource = source || {
    type: 'bundled_fallback',
    script: scriptRelativePath,
  };
  const proof = {
    seed: {
      source: seedSource,
      summary,
    },
  };
  const snapshotJson = await encodeContentOperationSnapshot(validation.bundle);
  const proofJson = JSON.stringify(proof);
  const eventJson = JSON.stringify({
    releaseId,
    snapshotHash,
    source: seedSource,
    summary,
  });
  const snapshotSql = snapshotSqlExpression(snapshotJson);

  const sql = [
    'BEGIN TRANSACTION;',
    '',
    ...snapshotSql.setupSql,
    ...(snapshotSql.setupSql.length ? [''] : []),
    'INSERT INTO content_operation_releases (',
    '  release_id, subject_id, status, snapshot_json, snapshot_hash,',
    '  base_release_id, package_id, published_at, published_by_account_id,',
    '  rollback_of_release_id, proof_json, created_at',
    ')',
    'SELECT',
    `  ${sqlString(releaseId)}, 'spelling', 'published', ${snapshotSql.valueExpression}, ${sqlString(snapshotHash)},`,
    `  NULL, NULL, ${sqlInteger(nowTs)}, ${sqlString(actorAccountId)},`,
    `  NULL, ${sqlString(proofJson)}, ${sqlInteger(nowTs)}`,
    'WHERE NOT EXISTS (',
    "  SELECT 1 FROM content_operation_releases WHERE subject_id = 'spelling' AND status = 'published'",
    ');',
    '',
    'INSERT INTO content_operation_events (',
    '  event_id, package_id, release_id, subject_id, event_type,',
    '  actor_account_id, event_json, created_at',
    ')',
    'SELECT',
    `  ${sqlString(eventId)}, NULL, ${sqlString(releaseId)}, 'spelling', 'release.seeded',`,
    `  ${sqlString(actorAccountId)}, ${sqlString(eventJson)}, ${sqlInteger(nowTs)}`,
    'WHERE EXISTS (',
    `  SELECT 1 FROM content_operation_releases WHERE release_id = ${sqlString(releaseId)}`,
    ')',
    'AND NOT EXISTS (',
    `  SELECT 1 FROM content_operation_releases WHERE subject_id = 'spelling' AND status = 'published' AND release_id <> ${sqlString(releaseId)}`,
    ')',
    'AND NOT EXISTS (',
    `  SELECT 1 FROM content_operation_events WHERE event_id = ${sqlString(eventId)}`,
    ');',
    '',
    ...snapshotSql.teardownSql,
    ...(snapshotSql.teardownSql.length ? [''] : []),
    'COMMIT;',
    '',
  ].join('\n');

  return {
    release: {
      releaseId,
      subjectId: 'spelling',
      publishedAt: nowTs,
      publishedByAccountId: actorAccountId,
      snapshotHash,
    },
    summary,
    proof,
    source: seedSource,
    snapshotStorage: {
      encoding: 'gzip-base64',
      byteLength: Buffer.byteLength(snapshotJson, 'utf8'),
      sqlChunkCount: snapshotSql.chunkCount,
    },
    sql,
  };
}

function applyPlan(plan, options) {
  if (options.remote && process.env.KS2_CONFIRM_CONTENT_OPERATION_SEED !== remoteConfirmation) {
    throw new Error(`Refusing remote seed. Set KS2_CONFIRM_CONTENT_OPERATION_SEED=${remoteConfirmation} after taking a D1 backup.`);
  }

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'ks2-content-ops-seed-'));
  const sqlPath = path.join(tmpDir, 'seed-first-global-spelling-release.sql');
  writeFileSync(sqlPath, plan.sql, 'utf8');
  try {
    const args = [
      path.join(rootDir, 'scripts', 'wrangler-oauth.mjs'),
      'd1',
      'execute',
      'ks2-mastery-db',
      options.remote ? '--remote' : '--local',
      '--file',
      sqlPath,
    ];
    if (options.yes) args.push('--yes');

    const result = spawnSync(process.execPath, args, {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env },
    });
    if (result.error) throw result.error;
    if ((result.status ?? 1) !== 0) {
      throw new Error(`Wrangler D1 seed exited with status ${result.status ?? 1}.`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.apply && options.remote && process.env.KS2_CONFIRM_CONTENT_OPERATION_SEED !== remoteConfirmation) {
    throw new Error(`Refusing remote seed. Set KS2_CONFIRM_CONTENT_OPERATION_SEED=${remoteConfirmation} after taking a D1 backup.`);
  }

  const legacySource = (options.apply || options.local || options.remote)
    ? readLatestLegacyContentSource(options)
    : null;

  const plan = await buildFirstGlobalReleaseSeedPlan({
    actorAccountId: options.actorAccountId,
    sourceBundle: legacySource?.bundle || null,
    source: legacySource?.source || null,
  });

  if (options.outFile) {
    mkdirSync(path.dirname(options.outFile), { recursive: true });
    writeFileSync(options.outFile, plan.sql, 'utf8');
  }

  console.log(JSON.stringify({
    ok: true,
    mode: options.apply ? 'apply' : 'dry-run',
    target: options.remote ? 'remote' : 'local',
    release: plan.release,
    summary: plan.summary,
    source: plan.source,
    snapshotStorage: plan.snapshotStorage,
    sqlFile: options.outFile,
    remoteConfirmation: options.remote && options.apply ? remoteConfirmation : null,
  }, null, 2));

  if (options.apply) {
    applyPlan(plan, options);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runCli().catch((error) => {
    console.error(error?.message || String(error));
    process.exit(1);
  });
}
