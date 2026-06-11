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

function usage() {
  return [
    'Usage: node scripts/migrate-spelling-content-to-global-release.mjs [--dry-run|--apply] [--local|--remote] [options]',
    '',
    'Options:',
    '  --dry-run             Validate the bundled seed and print the planned release (default).',
    '  --apply               Apply the idempotent seed SQL through scripts/wrangler-oauth.mjs.',
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

export async function buildFirstGlobalReleaseSeedPlan({
  now = () => Date.now(),
  releaseId = uid('corel'),
  eventId = uid('coevt'),
  actorAccountId = 'content-operations-seed-script',
} = {}) {
  const nowTs = Number(now());
  const bundle = await readSeededSpellingContentBundle();
  const validation = validateSpellingContentBundle(bundle);
  if (!validation.ok) {
    const errors = validation.errors
      .map((issue) => `- [${issue.code}] ${issue.path}: ${issue.message}`)
      .join('\n');
    throw new Error(`Refusing to seed invalid bundled spelling content.\n${errors}`);
  }

  const summary = buildSpellingContentSummary(validation.bundle);
  const snapshotHash = contentOperationHash(validation.bundle, 'release');
  const source = {
    type: 'bundled_fallback',
    script: scriptRelativePath,
  };
  const proof = {
    seed: {
      source,
      summary,
    },
  };
  const snapshotJson = JSON.stringify(validation.bundle);
  const proofJson = JSON.stringify(proof);
  const eventJson = JSON.stringify({
    releaseId,
    snapshotHash,
    source,
    summary,
  });

  const sql = [
    'BEGIN TRANSACTION;',
    '',
    'INSERT INTO content_operation_releases (',
    '  release_id, subject_id, status, snapshot_json, snapshot_hash,',
    '  base_release_id, package_id, published_at, published_by_account_id,',
    '  rollback_of_release_id, proof_json, created_at',
    ')',
    'SELECT',
    `  ${sqlString(releaseId)}, 'spelling', 'published', ${sqlString(snapshotJson)}, ${sqlString(snapshotHash)},`,
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

  const plan = await buildFirstGlobalReleaseSeedPlan({
    actorAccountId: options.actorAccountId,
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
