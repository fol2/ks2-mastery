import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  backfillSpellingWordExplanations,
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
const compatibilityPolicy = Object.freeze({
  legacyExportRoute: '/api/content/spelling',
  legacyExportMode: 'read_only_after_global_release',
  legacyWriteRoute: '/api/content/spelling',
  legacyWriteMode: 'disabled_after_global_release',
  mutationPath: 'content_operations_package_approval',
  firstReleaseInsertPolicy: 'only_when_no_published_spelling_release_exists',
});

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

function summariseValidation(validation, issueLimit = 12) {
  const toIssues = (issues) => (Array.isArray(issues) ? issues : [])
    .slice(0, issueLimit)
    .map((issue) => ({
      severity: issue.severity,
      code: issue.code,
      path: issue.path,
      message: issue.message,
    }));
  const errors = Array.isArray(validation?.errors) ? validation.errors : [];
  const warnings = Array.isArray(validation?.warnings) ? validation.warnings : [];
  return {
    ok: Boolean(validation?.ok),
    errorCount: errors.length,
    warningCount: warnings.length,
    errors: toIssues(errors),
    warnings: toIssues(warnings),
  };
}

function chunkString(value, chunkSize = 80_000) {
  const chunks = [];
  const text = String(value || '');
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }
  return chunks.length ? chunks : [''];
}

function snapshotSqlExpression(snapshotValue, releaseId) {
  const chunks = chunkString(snapshotValue);
  if (chunks.length === 1 && chunks[0].length < 80_000) {
    return {
      setupSql: [],
      valueExpression: sqlString(chunks[0]),
      appendSql: [],
      teardownSql: [],
      chunkCount: chunks.length,
      charLength: chunks[0].length,
    };
  }
  let prefixLength = 0;
  const appendSql = chunks.map((chunk) => {
    const sql = [
      'UPDATE content_operation_releases',
      `SET snapshot_json = snapshot_json || ${sqlString(chunk)}`,
      `WHERE release_id = ${sqlString(releaseId)}`,
      "  AND subject_id = 'spelling'",
      "  AND status = 'seeding'",
      `  AND length(snapshot_json) = ${sqlInteger(prefixLength)};`,
    ].join('\n');
    prefixLength += chunk.length;
    return sql;
  });
  return {
    setupSql: [],
    valueExpression: "''",
    appendSql,
    teardownSql: [],
    chunkCount: chunks.length,
    charLength: prefixLength,
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

function readPublishedSpellingReleaseState(options) {
  const resultSets = runWranglerD1Json(`
    SELECT release_id, subject_id, status, snapshot_hash, published_at, published_by_account_id, created_at
    FROM content_operation_releases
    WHERE subject_id = 'spelling' AND status = 'published'
    ORDER BY published_at DESC, created_at DESC, rowid DESC
    LIMIT 1
  `, options);
  const row = resultSets.flatMap((entry) => Array.isArray(entry?.results) ? entry.results : [])[0] || null;
  if (!row) return null;
  return {
    releaseId: row.release_id || null,
    subjectId: row.subject_id || 'spelling',
    status: row.status || 'published',
    snapshotHash: row.snapshot_hash || null,
    publishedAt: Number(row.published_at) || 0,
    publishedByAccountId: row.published_by_account_id || null,
    createdAt: Number(row.created_at) || 0,
  };
}

export function buildCutoverState({ publishedRelease = null, plannedRelease = null } = {}) {
  const hasPublishedRelease = Boolean(publishedRelease?.releaseId);
  return {
    publishedReleasePresent: hasPublishedRelease,
    effectiveReleaseId: hasPublishedRelease
      ? publishedRelease.releaseId
      : plannedRelease?.releaseId || null,
    effectiveSnapshotHash: hasPublishedRelease
      ? publishedRelease.snapshotHash
      : plannedRelease?.snapshotHash || null,
    seedSqlWillInsert: !hasPublishedRelease,
    seedSqlWillNoop: hasPublishedRelease,
    legacyExportMode: compatibilityPolicy.legacyExportMode,
    legacyWriteMode: compatibilityPolicy.legacyWriteMode,
    mutationPath: compatibilityPolicy.mutationPath,
    firstReleaseInsertPolicy: compatibilityPolicy.firstReleaseInsertPolicy,
    publishedRelease: hasPublishedRelease ? publishedRelease : null,
  };
}

export async function resolveFirstGlobalReleaseSeedSource({
  legacySource = null,
  fallbackBundle = null,
} = {}) {
  const bundledFallback = fallbackBundle || await readSeededSpellingContentBundle();
  const bundledSource = {
    type: 'bundled_fallback',
    script: scriptRelativePath,
  };
  if (!legacySource?.bundle) {
    return {
      bundle: bundledFallback,
      source: bundledSource,
    };
  }

  const backfilledLegacyBundle = backfillSpellingWordExplanations(legacySource.bundle, bundledFallback);
  const legacyValidation = validateSpellingContentBundle(backfilledLegacyBundle);
  if (legacyValidation.ok) {
    return {
      bundle: legacyValidation.bundle,
      source: {
        ...(legacySource.source || {}),
        type: legacySource.source?.type || 'account_subject_content',
        backfillReference: 'bundled_spelling_seed',
      },
    };
  }

  return {
    bundle: bundledFallback,
    source: {
      ...bundledSource,
      fallbackReason: 'legacy_content_invalid',
      rejectedLegacySource: legacySource.source || null,
      rejectedLegacyValidation: summariseValidation(legacyValidation),
    },
  };
}

export async function buildFirstGlobalReleaseSeedPlan({
  now = () => Date.now(),
  releaseId = null,
  eventId = null,
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
  const resolvedReleaseId = releaseId || `corel-seed-${snapshotHash}`;
  const resolvedEventId = eventId || `coevt-seed-${snapshotHash}`;
  const seedSource = source || {
    type: 'bundled_fallback',
    script: scriptRelativePath,
  };
  const proof = {
    seed: {
      source: seedSource,
      summary,
      compatibilityPolicy,
    },
  };
  const snapshotJson = await encodeContentOperationSnapshot(validation.bundle);
  const proofJson = JSON.stringify(proof);
  const eventJson = JSON.stringify({
    releaseId: resolvedReleaseId,
    snapshotHash,
    source: seedSource,
    summary,
    compatibilityPolicy,
  });
  const snapshotSql = snapshotSqlExpression(snapshotJson, resolvedReleaseId);

  const sql = [
    ...snapshotSql.setupSql,
    ...(snapshotSql.setupSql.length ? [''] : []),
    'INSERT INTO content_operation_releases (',
    '  release_id, subject_id, status, snapshot_json, snapshot_hash,',
    '  base_release_id, package_id, published_at, published_by_account_id,',
    '  rollback_of_release_id, proof_json, created_at',
    ')',
    'SELECT',
    `  ${sqlString(resolvedReleaseId)}, 'spelling', 'seeding', ${snapshotSql.valueExpression}, ${sqlString(snapshotHash)},`,
    `  NULL, NULL, NULL, NULL,`,
    `  NULL, ${sqlString(proofJson)}, ${sqlInteger(nowTs)}`,
    'WHERE NOT EXISTS (',
    "  SELECT 1 FROM content_operation_releases WHERE subject_id = 'spelling' AND status = 'published'",
    ')',
    'AND NOT EXISTS (',
    `  SELECT 1 FROM content_operation_releases WHERE release_id = ${sqlString(resolvedReleaseId)}`,
    ');',
    '',
    ...snapshotSql.appendSql,
    ...(snapshotSql.appendSql.length ? [''] : []),
    'UPDATE content_operation_releases',
    "SET status = 'published',",
    `    published_at = ${sqlInteger(nowTs)},`,
    `    published_by_account_id = ${sqlString(actorAccountId)}`,
    `WHERE release_id = ${sqlString(resolvedReleaseId)}`,
    "  AND subject_id = 'spelling'",
    "  AND status = 'seeding'",
    `  AND length(snapshot_json) = ${sqlInteger(snapshotSql.charLength)}`,
    '  AND NOT EXISTS (',
    "    SELECT 1 FROM content_operation_releases WHERE subject_id = 'spelling' AND status = 'published'",
    '  );',
    '',
    'INSERT INTO content_operation_events (',
    '  event_id, package_id, release_id, subject_id, event_type,',
    '  actor_account_id, event_json, created_at',
    ')',
    'SELECT',
    `  ${sqlString(resolvedEventId)}, NULL, ${sqlString(resolvedReleaseId)}, 'spelling', 'release.seeded',`,
    `  ${sqlString(actorAccountId)}, ${sqlString(eventJson)}, ${sqlInteger(nowTs)}`,
    'WHERE EXISTS (',
    `  SELECT 1 FROM content_operation_releases WHERE release_id = ${sqlString(resolvedReleaseId)} AND status = 'published' AND length(snapshot_json) = ${sqlInteger(snapshotSql.charLength)}`,
    ')',
    'AND NOT EXISTS (',
    `  SELECT 1 FROM content_operation_releases WHERE subject_id = 'spelling' AND status = 'published' AND release_id <> ${sqlString(resolvedReleaseId)}`,
    ')',
    'AND NOT EXISTS (',
    `  SELECT 1 FROM content_operation_events WHERE event_id = ${sqlString(resolvedEventId)}`,
    ');',
    '',
    ...snapshotSql.teardownSql,
    ...(snapshotSql.teardownSql.length ? [''] : []),
    '',
  ].join('\n');

  return {
    release: {
      releaseId: resolvedReleaseId,
      subjectId: 'spelling',
      publishedAt: nowTs,
      publishedByAccountId: actorAccountId,
      snapshotHash,
    },
    summary,
    proof,
    source: seedSource,
    compatibilityPolicy,
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
  const publishedRelease = (options.apply || options.local || options.remote)
    ? readPublishedSpellingReleaseState(options)
    : null;
  const resolvedSource = await resolveFirstGlobalReleaseSeedSource({ legacySource });

  const plan = await buildFirstGlobalReleaseSeedPlan({
    actorAccountId: options.actorAccountId,
    sourceBundle: resolvedSource.bundle,
    source: resolvedSource.source,
  });
  const cutover = buildCutoverState({
    publishedRelease,
    plannedRelease: plan.release,
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
    compatibilityPolicy: plan.compatibilityPolicy,
    cutover,
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
