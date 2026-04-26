#!/usr/bin/env node
// P2 U3: QA seed harness CLI for post-Mega learner fixtures.
//
// Usage:
//   node scripts/seed-post-mega.mjs --learner <id> --shape <shape> --allow-local=1
//
// Writes the named seed shape into the local D1's child_subject_state table
// (subject='spelling') for the target learner. The shape is computed by the
// pure builders in shared/spelling/post-mastery-seed-shapes.js so CLI output
// matches byte-for-byte what the Admin hub panel and Worker command produce.
//
// **Safety**:
//   - Refuses to run without `--allow-local=1`. There is no `--remote` flag.
//   - Refuses to run if `KS2_ALLOW_REMOTE_SEED=1` is NOT explicitly unset
//     (defence-in-depth: if a future env-var mistake sets remote, the check
//     bails out).
//   - Only writes to local D1 via `npx wrangler d1 execute ... --local`.
//
// Integration tests exercise this CLI end-to-end via spawnSync.

import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../src/subjects/spelling/data/content-data.js';
import { resolveRuntimeSnapshot } from '../src/subjects/spelling/content/model.js';
import {
  POST_MEGA_SEED_SHAPES,
  resolvePostMegaSeedShape,
} from '../shared/spelling/post-mastery-seed-shapes.js';

function parseArgs(argv) {
  const args = { learner: '', shape: '', allowLocal: false, today: null, dryRun: false };
  for (const token of argv) {
    if (token === '--dry-run') { args.dryRun = true; continue; }
    if (token === '--allow-local=1') { args.allowLocal = true; continue; }
    if (token.startsWith('--learner=')) { args.learner = token.slice('--learner='.length); continue; }
    if (token === '--learner') { args.__awaitLearner = true; continue; }
    if (args.__awaitLearner) { args.learner = token; args.__awaitLearner = false; continue; }
    if (token.startsWith('--shape=')) { args.shape = token.slice('--shape='.length); continue; }
    if (token === '--shape') { args.__awaitShape = true; continue; }
    if (args.__awaitShape) { args.shape = token; args.__awaitShape = false; continue; }
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
  console.error('Optional: --today <day-epoch>  --dry-run');
}

// SQL literal escape. Node-pg-style — doubles single quotes.
function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Build the SQL script the CLI writes to a temp file and pipes into
 * `wrangler d1 execute`. Exported for test coverage — the round-trip test
 * reads the SQL back and asserts structural shape before shelling out.
 */
export function buildSeedSql({ learnerId, shapeName, today, nowTs }) {
  if (!POST_MEGA_SEED_SHAPES.includes(shapeName)) {
    const error = new Error(`Unknown shape: ${shapeName}`);
    error.code = 'unknown_shape';
    error.allowed = [...POST_MEGA_SEED_SHAPES];
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
  return `PRAGMA foreign_keys = OFF;
BEGIN;
INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
  VALUES (${sqlString(learnerId)}, 'Seed learner', 'Y5', '#8A4FFF', '', 15, ${nowTs}, ${nowTs}, 0)
  ON CONFLICT(id) DO NOTHING;
INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
  VALUES (${sqlString(learnerId)}, 'spelling', 'null', ${sqlString(dataJson)}, ${nowTs}, NULL)
  ON CONFLICT(learner_id, subject_id) DO UPDATE SET
    ui_json = 'null',
    data_json = excluded.data_json,
    updated_at = excluded.updated_at,
    updated_by_account_id = excluded.updated_by_account_id;
COMMIT;
PRAGMA foreign_keys = ON;
`;
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

  const nowTs = Date.now();
  const today = args.today == null
    ? Math.floor(nowTs / (24 * 60 * 60 * 1000))
    : args.today;
  const sql = buildSeedSql({
    learnerId: args.learner,
    shapeName: args.shape,
    today,
    nowTs,
  });

  if (args.dryRun) {
    // Dry-run: print the SQL and exit. Lets the integration test assert the
    // SQL shape without needing to shell out to wrangler.
    process.stdout.write(sql);
    return 0;
  }

  const sqlPath = path.join(os.tmpdir(), `ks2-seed-post-mega-${Date.now()}.sql`);
  writeFileSync(sqlPath, sql, 'utf8');

  const env = { ...process.env };
  delete env.CLOUDFLARE_API_TOKEN;

  try {
    const result = spawnSync('npx', [
      'wrangler',
      'd1',
      'execute',
      'ks2-mastery-db',
      '--local',
      '--file',
      sqlPath,
    ], {
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32',
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
    const here = path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    return invoked === here;
  } catch {
    return false;
  }
})();

if (isMain) {
  const code = await main(process.argv.slice(2));
  process.exit(code);
}
