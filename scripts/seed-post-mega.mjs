#!/usr/bin/env node
// P2 U3: QA seed harness CLI for post-Mega learner fixtures.
//
// Usage:
//   node scripts/seed-post-mega.mjs --learner <id> --shape <shape> --allow-local=1
//
// Writes the named seed shape to the local D1 authority for the target
// learner: legacy child_subject_state before migration 0023 is ready, or the
// bounded Spelling learner/item tables afterwards. Existing bounded state is
// archived row-by-row in D1 before replacement. The shape is computed by the
// pure builders in shared/spelling/post-mastery-seed-shapes.js so CLI output
// matches byte-for-byte what the Admin hub panel and Worker command produce.
//
// **Safety**:
//   - Refuses to run without `--allow-local=1`. There is no `--remote` flag.
//   - Refuses to run if `KS2_ALLOW_REMOTE_SEED=1` is NOT explicitly unset
//     (defence-in-depth: if a future env-var mistake sets remote, the check
//     bails out).
//   - Only writes to local D1 through the repository's OAuth-safe Wrangler
//     wrapper.
//
// Integration tests exercise this CLI end-to-end via spawnSync.

import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../src/subjects/spelling/data/content-data.js';
import { resolveRuntimeSnapshot } from '../src/subjects/spelling/content/model.js';
import { buildSpellingProgressPools } from '../worker/src/content/spelling-read-models.js';
import {
  spellingGameplayStatsWithDueSchedule,
  spellingLearnerData,
} from '../worker/src/subjects/spelling/gameplay-state.js';
import {
  POST_MEGA_SEED_SHAPES,
  resolvePostMegaSeedShape,
} from '../shared/spelling/post-mastery-seed-shapes.js';

// U3 reviewer follow-up (MEDIUM adversarial): mirror the Worker-side learner
// id regex so the CLI rejects control chars / HTML tokens with the same
// pattern the production route enforces.
const LEARNER_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const SEED_AUTHORITIES = new Set(['legacy', 'bounded']);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER_WRAPPER = path.join(ROOT_DIR, 'scripts', 'wrangler-oauth.mjs');

function parseArgs(argv) {
  const args = {
    learner: '',
    shape: '',
    account: '',
    allowLocal: false,
    today: null,
    dryRun: false,
    authority: '',
  };
  for (const token of argv) {
    if (token === '--dry-run') { args.dryRun = true; continue; }
    if (token === '--allow-local=1') { args.allowLocal = true; continue; }
    if (token.startsWith('--learner=')) { args.learner = token.slice('--learner='.length); continue; }
    if (token === '--learner') { args.__awaitLearner = true; continue; }
    if (args.__awaitLearner) { args.learner = token; args.__awaitLearner = false; continue; }
    if (token.startsWith('--shape=')) { args.shape = token.slice('--shape='.length); continue; }
    if (token === '--shape') { args.__awaitShape = true; continue; }
    if (args.__awaitShape) { args.shape = token; args.__awaitShape = false; continue; }
    // U3 reviewer follow-up (MEDIUM adversarial): optional `--account <id>`.
    // When provided, the emitted SQL also inserts an owner-role membership
    // row so the seeded learner shows up in the admin hub learner picker for
    // that account. When omitted, stderr warns the operator.
    if (token.startsWith('--account=')) { args.account = token.slice('--account='.length); continue; }
    if (token === '--account') { args.__awaitAccount = true; continue; }
    if (args.__awaitAccount) { args.account = token; args.__awaitAccount = false; continue; }
    if (token.startsWith('--authority=')) { args.authority = token.slice('--authority='.length); continue; }
    if (token === '--authority') { args.__awaitAuthority = true; continue; }
    if (args.__awaitAuthority) { args.authority = token; args.__awaitAuthority = false; continue; }
    if (token.startsWith('--today=')) {
      const parsed = Number(token.slice('--today='.length));
      if (Number.isFinite(parsed)) args.today = Math.floor(parsed);
      continue;
    }
  }
  return args;
}

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node scripts/seed-post-mega.mjs --learner <id> --shape <shape> --allow-local=1');
  console.error(`Allowed shapes: ${POST_MEGA_SEED_SHAPES.join(', ')}`);
  console.error('Optional: --today <day-epoch>  --account <id>  --dry-run  --authority <legacy|bounded>');
}

// SQL literal escape. Node-pg-style — doubles single quotes.
function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Build the SQL script the CLI writes to a temp file and pipes into
 * `wrangler d1 execute`. Exported for test coverage — the round-trip test
 * reads the SQL back and asserts structural shape before shelling out.
 *
 * When `accountId` is a non-empty string AND a new `learner_profiles` row is
 * about to land, the script also inserts an owner-role
 * `account_learner_memberships` row so the seeded learner appears in the
 * admin hub picker for that account. The Worker path does this implicitly
 * (the actor is the admin session); the CLI path has no session, so the
 * operator supplies `--account <id>` to grant ownership. When `accountId` is
 * empty the membership INSERT is skipped and the script keeps the prior
 * behaviour (learner exists but is not linked to any account).
 */
export function buildSeedSql({
  learnerId,
  shapeName,
  today,
  nowTs,
  accountId = '',
  authority = 'bounded',
}) {
  if (!POST_MEGA_SEED_SHAPES.includes(shapeName)) {
    const error = new Error(`Unknown shape: ${shapeName}`);
    error.code = 'unknown_shape';
    error.allowed = [...POST_MEGA_SEED_SHAPES];
    throw error;
  }
  // U3 reviewer follow-up (MEDIUM adversarial): reject malformed learner ids
  // here too so the CLI never writes a row the Worker would refuse.
  if (!LEARNER_ID_REGEX.test(learnerId)) {
    const error = new Error(`Invalid learner id: ${learnerId}`);
    error.code = 'invalid_learner_id';
    error.pattern = LEARNER_ID_REGEX.source;
    throw error;
  }
  if (accountId && !LEARNER_ID_REGEX.test(accountId)) {
    const error = new Error(`Invalid account id: ${accountId}`);
    error.code = 'invalid_account_id';
    error.pattern = LEARNER_ID_REGEX.source;
    throw error;
  }
  if (!SEED_AUTHORITIES.has(authority)) {
    const error = new Error(`Unknown seed authority: ${authority}`);
    error.code = 'unknown_seed_authority';
    error.allowed = [...SEED_AUTHORITIES];
    throw error;
  }
  const runtimeSnapshot = resolveRuntimeSnapshot(SEEDED_SPELLING_CONTENT_BUNDLE, {
    referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
  });
  const wordBySlug = Object.fromEntries(
    (runtimeSnapshot?.words || []).map((word) => [word.slug, word]),
  );
  const data = resolvePostMegaSeedShape(shapeName, wordBySlug, today);
  const dataJson = JSON.stringify(data);
  // PRAGMA foreign_keys = OFF so we can insert the child_subject_state row
  // without the learner_profiles row already existing, then re-enable. The
  // learner_profiles upsert runs first so the FK is satisfied by the time
  // we re-check; keep OFF for safety across future schema additions.
  //
  // NOTE: wrangler d1 execute --local runs every statement in its own
  // transaction unless we `BEGIN` explicitly. We bundle the script into a
  // single transaction to keep the upsert atomic.
  const membershipInsert = accountId
    ? `INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
  VALUES (${sqlString(accountId)}, ${sqlString(learnerId)}, 'owner', 0, ${nowTs}, ${nowTs})
  ON CONFLICT(account_id, learner_id) DO NOTHING;\n`
    : '';
  const boundedTargetSnapshot = authority === 'bounded'
    ? `CREATE TEMP TABLE ks2_post_mega_seed_target (
    learner_existed INTEGER NOT NULL,
    state_existed INTEGER NOT NULL
  );
CREATE TEMP TRIGGER ks2_post_mega_seed_target_guard
  BEFORE INSERT ON ks2_post_mega_seed_target
  WHEN NEW.learner_existed = 1 AND NEW.state_existed = 0
BEGIN
  SELECT RAISE(ROLLBACK, 'existing learner is missing bounded Spelling state');
END;
INSERT INTO ks2_post_mega_seed_target (learner_existed, state_existed)
  VALUES (
    EXISTS(SELECT 1 FROM learner_profiles WHERE id = ${sqlString(learnerId)}),
    EXISTS(SELECT 1 FROM spelling_learner_state WHERE learner_id = ${sqlString(learnerId)})
  );
`
    : '';
  const boundedTargetCleanup = authority === 'bounded'
    ? `DROP TRIGGER temp.ks2_post_mega_seed_target_guard;
DROP TABLE temp.ks2_post_mega_seed_target;
`
    : '';
  const legacyWrite = `INSERT INTO child_subject_state (
    learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id
  )
  VALUES (${sqlString(learnerId)}, 'spelling', 'null', ${sqlString(dataJson)}, ${nowTs}, NULL)
  ON CONFLICT(learner_id, subject_id) DO UPDATE SET
    ui_json = excluded.ui_json,
    data_json = excluded.data_json,
    updated_at = excluded.updated_at,
    updated_by_account_id = excluded.updated_by_account_id;
`;
  const boundedWrite = (() => {
    if (authority !== 'bounded') return '';
    const learnerDataJson = JSON.stringify(spellingLearnerData(data));
    const statsJson = JSON.stringify(spellingGameplayStatsWithDueSchedule(
      buildSpellingProgressPools({ contentSnapshot: runtimeSnapshot, data, now: nowTs }),
      runtimeSnapshot?.words || [],
      data,
    ));
    const localPreimageId = `post-mega-seed:local:${learnerId}:${nowTs}`;
    const localActorId = accountId || 'local-cli';
    return `INSERT INTO spelling_seed_preimages (
    preimage_id, learner_id, actor_account_id, seed_request_id,
    ui_json, data_json, stats_json, source_updated_at,
    source_updated_by_account_id, item_count, achievement_count, created_at
  )
  SELECT ${sqlString(localPreimageId)}, state.learner_id, ${sqlString(localActorId)},
    ${sqlString(`local-${nowTs}`)}, state.ui_json, state.data_json, state.stats_json,
    state.updated_at, state.updated_by_account_id,
    (SELECT COUNT(*) FROM spelling_item_state item WHERE item.learner_id = state.learner_id),
    (SELECT COUNT(*) FROM spelling_achievement_state achievement
      WHERE achievement.learner_id = state.learner_id),
    ${nowTs}
  FROM spelling_learner_state state
  WHERE state.learner_id = ${sqlString(learnerId)}
    AND (SELECT learner_existed FROM temp.ks2_post_mega_seed_target LIMIT 1) = 1
  ON CONFLICT(preimage_id) DO NOTHING;
INSERT INTO spelling_seed_preimage_items (
    preimage_id, slug, progress_json, guardian_json, pattern_json,
    source_updated_at, source_updated_by_account_id
  )
  SELECT ${sqlString(localPreimageId)}, item.slug, item.progress_json,
    item.guardian_json, item.pattern_json, item.updated_at, item.updated_by_account_id
  FROM spelling_item_state item
  WHERE item.learner_id = ${sqlString(learnerId)}
    AND EXISTS (
      SELECT 1 FROM spelling_seed_preimages archive
      WHERE archive.preimage_id = ${sqlString(localPreimageId)}
    )
  ON CONFLICT(preimage_id, slug) DO NOTHING;
INSERT INTO spelling_seed_preimage_achievements (
    preimage_id, achievement_id, record_json,
    source_updated_at, source_updated_by_account_id
  )
  SELECT ${sqlString(localPreimageId)}, achievement.achievement_id,
    achievement.record_json, achievement.updated_at,
    achievement.updated_by_account_id
  FROM spelling_achievement_state achievement
  WHERE achievement.learner_id = ${sqlString(learnerId)}
    AND EXISTS (
      SELECT 1 FROM spelling_seed_preimages archive
      WHERE archive.preimage_id = ${sqlString(localPreimageId)}
    )
  ON CONFLICT(preimage_id, achievement_id) DO NOTHING;
INSERT INTO spelling_learner_state (
    learner_id, ui_json, data_json, stats_json, updated_at, updated_by_account_id
  )
  VALUES (
    ${sqlString(learnerId)}, 'null', ${sqlString(learnerDataJson)},
    ${sqlString(statsJson)}, ${nowTs}, NULL
  )
  ON CONFLICT(learner_id) DO UPDATE SET
    ui_json = excluded.ui_json,
    data_json = excluded.data_json,
    stats_json = excluded.stats_json,
    updated_at = excluded.updated_at,
    updated_by_account_id = excluded.updated_by_account_id;
DELETE FROM spelling_item_state
  WHERE learner_id = ${sqlString(learnerId)};
DELETE FROM spelling_achievement_state
  WHERE learner_id = ${sqlString(learnerId)};
WITH
  source(data_json) AS (SELECT ${sqlString(dataJson)}),
  progress AS (
    SELECT item.key AS slug, item.value AS value
    FROM source, json_each(source.data_json, '$.progress') AS item
    WHERE item.key <> '' AND json_type(item.value) = 'object'
  ),
  guardian AS (
    SELECT item.key AS slug, item.value AS value
    FROM source, json_each(source.data_json, '$.guardian') AS item
    WHERE item.key <> '' AND json_type(item.value) = 'object'
  ),
  pattern AS (
    SELECT item.key AS slug, item.value AS value
    FROM source, json_each(source.data_json, '$.pattern.wobbling') AS item
    WHERE item.key <> '' AND json_type(item.value) = 'object'
  ),
  item_keys AS (
    SELECT slug FROM progress
    UNION SELECT slug FROM guardian
    UNION SELECT slug FROM pattern
  )
INSERT INTO spelling_item_state (
    learner_id, slug, progress_json, guardian_json, pattern_json,
    updated_at, updated_by_account_id
  )
  SELECT ${sqlString(learnerId)}, item_keys.slug,
    CASE WHEN progress.value IS NOT NULL THEN json(progress.value) ELSE NULL END,
    CASE WHEN guardian.value IS NOT NULL THEN json(guardian.value) ELSE NULL END,
    CASE WHEN pattern.value IS NOT NULL THEN json(pattern.value) ELSE NULL END,
    ${nowTs}, NULL
  FROM item_keys
  LEFT JOIN progress ON progress.slug = item_keys.slug
  LEFT JOIN guardian ON guardian.slug = item_keys.slug
  LEFT JOIN pattern ON pattern.slug = item_keys.slug;
`;
  })();
  return `PRAGMA foreign_keys = OFF;
BEGIN;
${boundedTargetSnapshot}
INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
  VALUES (${sqlString(learnerId)}, 'Seed learner', 'Y5', '#8A4FFF', '', 15, ${nowTs}, ${nowTs}, 0)
  ON CONFLICT(id) DO NOTHING;
${membershipInsert}${authority === 'legacy' ? legacyWrite : boundedWrite}${boundedTargetCleanup}COMMIT;
PRAGMA foreign_keys = ON;
`;
}

function parseWranglerJsonOutput(stdout) {
  const output = String(stdout || '').trim();
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  if (start === -1 || end < start) {
    throw new Error('Wrangler did not return a JSON result array.');
  }
  return JSON.parse(output.slice(start, end + 1));
}

function runLocalD1Query(sql) {
  const result = spawnSync(process.execPath, [
    WRANGLER_WRAPPER,
    'd1',
    'execute',
    'ks2-mastery-db',
    '--local',
    '--json',
    '--command',
    sql,
  ], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env },
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`Local D1 authority probe failed.${detail ? ` ${detail}` : ''}`);
  }
  return parseWranglerJsonOutput(result.stdout);
}

export function detectLocalSeedAuthority() {
  const schemaResults = runLocalD1Query(`
    SELECT
      EXISTS(SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'bounded_gameplay_state_migrations') AS marker_table,
      EXISTS(SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'spelling_seed_preimages') AS preimage_table,
      EXISTS(SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'spelling_seed_preimage_items') AS preimage_item_table,
      EXISTS(SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'spelling_seed_preimage_achievements') AS preimage_achievement_table
  `);
  const schema = schemaResults[0]?.results?.[0] || {};
  if (Number(schema.marker_table) !== 1) return 'legacy';

  const markerResults = runLocalD1Query(`
    SELECT state
    FROM bounded_gameplay_state_migrations
    WHERE migration_id = '0023'
    LIMIT 1
  `);
  const state = markerResults[0]?.results?.[0]?.state || '';
  if (state === 'legacy-authoritative') return 'legacy';
  if (state !== 'ready') {
    throw new Error(`Local D1 has no usable 0023 authority marker (state=${state || 'missing'}).`);
  }
  if (Number(schema.preimage_table) !== 1
    || Number(schema.preimage_item_table) !== 1
    || Number(schema.preimage_achievement_table) !== 1) {
    throw new Error('Local bounded Spelling state is ready, but migration 0024 preimage tables are missing. Apply migrations before seeding.');
  }
  return 'bounded';
}

async function main(argv) {
  const args = parseArgs(argv);

  if (!args.allowLocal) {
    usage('Refusing to run without --allow-local=1. This CLI writes to local D1 only.');
    process.exit(2);
  }
  if (process.env.KS2_ALLOW_REMOTE_SEED === '1') {
    console.error('Refusing: KS2_ALLOW_REMOTE_SEED=1 is set. This CLI never touches remote D1.');
    process.exit(2);
  }
  if (!args.learner) {
    usage('--learner <id> is required.');
    process.exit(2);
  }
  if (!args.shape) {
    usage('--shape <shape> is required.');
    process.exit(2);
  }
  if (!POST_MEGA_SEED_SHAPES.includes(args.shape)) {
    usage(`Unknown shape: ${args.shape}`);
    process.exit(2);
  }
  if (!LEARNER_ID_REGEX.test(args.learner)) {
    usage(`Invalid learner id (must match ${LEARNER_ID_REGEX.source}): ${args.learner}`);
    process.exit(2);
  }
  if (args.account && !LEARNER_ID_REGEX.test(args.account)) {
    usage(`Invalid account id (must match ${LEARNER_ID_REGEX.source}): ${args.account}`);
    process.exit(2);
  }
  if (args.authority && !SEED_AUTHORITIES.has(args.authority)) {
    usage(`Unknown seed authority: ${args.authority}`);
    process.exit(2);
  }
  if (args.authority && !args.dryRun) {
    usage('--authority is a dry-run inspection option. Real local writes detect the active schema automatically.');
    process.exit(2);
  }

  // U3 reviewer follow-up (MEDIUM adversarial): warn when the operator
  // forgot `--account`. Without it, the seeded learner exists but is not
  // linked to any adult_account, so it never shows up in the admin hub
  // learner picker — the operator will think the seed silently failed.
  if (!args.account) {
    console.error('Warning: no --account <id> supplied. The seeded learner will exist in learner_profiles but will NOT appear in the admin hub picker. Re-run with --account <id> to grant owner membership.');
  }

  const nowTs = Date.now();
  const today = args.today == null
    ? Math.floor(nowTs / (24 * 60 * 60 * 1000))
    : args.today;
  let authority;
  try {
    authority = args.authority || (args.dryRun ? 'bounded' : detectLocalSeedAuthority());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  const sql = buildSeedSql({
    learnerId: args.learner,
    shapeName: args.shape,
    today,
    nowTs,
    accountId: args.account,
    authority,
  });

  if (args.dryRun) {
    // Dry-run: print the SQL and exit. Lets the integration test assert the
    // SQL shape without needing to shell out to wrangler.
    process.stdout.write(sql);
    return 0;
  }

  const sqlPath = path.join(os.tmpdir(), `ks2-seed-post-mega-${Date.now()}.sql`);
  writeFileSync(sqlPath, sql, 'utf8');

  try {
    const result = spawnSync(process.execPath, [
      WRANGLER_WRAPPER,
      'd1',
      'execute',
      'ks2-mastery-db',
      '--local',
      '--file',
      sqlPath,
    ], {
      stdio: 'inherit',
      cwd: ROOT_DIR,
      env: { ...process.env },
    });
    if (result.error) {
      console.error(result.error.message);
      return 1;
    }
    return result.status ?? 1;
  } finally {
    try { unlinkSync(sqlPath); } catch { /* noop — leave for post-mortem on Windows */ }
  }
}

// CLI entrypoint guard — only run main() when invoked directly, never when
// imported by a test. Mirrors scripts/admin-ops-production-smoke.mjs.
const isMain = (() => {
  try {
    const argv1 = process.argv[1] || '';
    if (!argv1) return false;
    const invoked = path.resolve(argv1);
    const here = path.resolve(fileURLToPath(import.meta.url));
    return invoked === here;
  } catch {
    return false;
  }
})();

if (isMain) {
  const code = await main(process.argv.slice(2));
  process.exit(code);
}
