#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  decodeContentOperationSnapshot,
  encodeContentOperationSnapshot,
} from '../src/subjects/spelling/content/release-snapshot-codec.js';
import {
  buildSpellingRuntimeReleaseProjection,
} from '../src/subjects/spelling/content/runtime-release-projection.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER_WRAPPER = path.join(ROOT_DIR, 'scripts', 'wrangler-oauth.mjs');
const DATABASE_NAME = 'ks2-mastery-db';
const CHUNK_SIZE = 60_000;

function sqlString(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseWranglerJsonOutput(stdout) {
  const text = String(stdout || '').trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end < start) throw new Error('Wrangler did not return a JSON result array.');
  return JSON.parse(text.slice(start, end + 1));
}

function runWrangler(args, { maxBuffer = 64 * 1024 * 1024 } = {}) {
  const result = spawnSync(process.execPath, [WRANGLER_WRAPPER, ...args], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    maxBuffer,
    env: { ...process.env },
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`Wrangler D1 command failed.${detail ? ` ${detail}` : ''}`);
  }
  return result.stdout;
}

function targetArgs(remote) {
  return [remote ? '--remote' : '--local'];
}

export async function buildRuntimeProjectionBackfillSql(rows) {
  const statements = [];
  const releases = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const releaseId = String(row?.release_id || '');
    const snapshotHash = String(row?.snapshot_hash || '');
    if (!releaseId || !snapshotHash || typeof row?.snapshot_json !== 'string') {
      throw new Error('Published Spelling release row is missing its id, hash, or authoring snapshot.');
    }
    const authoringJson = await decodeContentOperationSnapshot(row.snapshot_json);
    const authoringBundle = JSON.parse(authoringJson);
    const projection = buildSpellingRuntimeReleaseProjection(authoringBundle, {
      releaseId,
      publishedAt: Number(row.published_at) || 0,
    });
    const encodedProjection = await encodeContentOperationSnapshot(projection);
    const summaryJson = JSON.stringify(projection.summary);
    const chunks = [];
    for (let offset = 0; offset < encodedProjection.length; offset += CHUNK_SIZE) {
      chunks.push(encodedProjection.slice(offset, offset + CHUNK_SIZE));
    }

    statements.push([
      'UPDATE content_operation_releases',
      "SET runtime_snapshot_json = '', runtime_summary_json = NULL",
      `WHERE release_id = ${sqlString(releaseId)}`,
      "  AND subject_id = 'spelling'",
      "  AND status = 'published'",
      `  AND snapshot_hash = ${sqlString(snapshotHash)};`,
    ].join('\n'));

    let prefixLength = 0;
    for (const chunk of chunks) {
      statements.push([
        'UPDATE content_operation_releases',
        `SET runtime_snapshot_json = runtime_snapshot_json || ${sqlString(chunk)}`,
        `WHERE release_id = ${sqlString(releaseId)}`,
        `  AND snapshot_hash = ${sqlString(snapshotHash)}`,
        `  AND length(runtime_snapshot_json) = ${prefixLength};`,
      ].join('\n'));
      prefixLength += chunk.length;
    }

    statements.push([
      'UPDATE content_operation_releases',
      `SET runtime_summary_json = ${sqlString(summaryJson)}`,
      `WHERE release_id = ${sqlString(releaseId)}`,
      `  AND snapshot_hash = ${sqlString(snapshotHash)}`,
      `  AND length(runtime_snapshot_json) = ${encodedProjection.length};`,
    ].join('\n'));
    releases.push({
      releaseId,
      authoringChars: row.snapshot_json.length,
      runtimeChars: encodedProjection.length,
      runtimeWords: projection.snapshot.words.length,
    });
  }

  return {
    sql: `${statements.join('\n\n')}\n`,
    releases,
  };
}

function usage() {
  return [
    'Usage: node scripts/backfill-spelling-runtime-projections.mjs [--local|--remote] [--apply]',
    '',
    'Without --apply the command compiles and reports the pending projections without writing D1.',
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return 0;
  }
  const remote = argv.includes('--remote');
  const apply = argv.includes('--apply');
  const query = [
    'SELECT release_id, snapshot_hash, snapshot_json, published_at',
    'FROM content_operation_releases',
    "WHERE subject_id = 'spelling'",
    "  AND status = 'published'",
    '  AND (runtime_snapshot_json IS NULL OR runtime_summary_json IS NULL)',
    'ORDER BY published_at ASC, created_at ASC;',
  ].join('\n');
  const queryOutput = runWrangler([
    'd1', 'execute', DATABASE_NAME,
    ...targetArgs(remote),
    '--json', '--command', query,
  ]);
  const queryExecutions = parseWranglerJsonOutput(queryOutput);
  const rows = queryExecutions.flatMap((entry) => Array.isArray(entry?.results) ? entry.results : []);
  const plan = await buildRuntimeProjectionBackfillSql(rows);

  console.log(JSON.stringify({
    ok: true,
    target: remote ? 'remote' : 'local',
    apply,
    pendingReleases: plan.releases.length,
    releases: plan.releases,
  }, null, 2));
  if (!apply || !plan.releases.length) return 0;

  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ks2-runtime-projection-'));
  const sqlPath = path.join(tempDir, 'backfill.sql');
  try {
    writeFileSync(sqlPath, plan.sql, 'utf8');
    runWrangler([
      'd1', 'execute', DATABASE_NAME,
      ...targetArgs(remote),
      '--file', sqlPath,
      '--yes',
    ]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  const verificationSql = [
    'SELECT',
    '  COUNT(*) AS published_count,',
    '  SUM(CASE WHEN runtime_snapshot_json IS NOT NULL AND runtime_summary_json IS NOT NULL THEN 1 ELSE 0 END) AS ready_count',
    'FROM content_operation_releases',
    "WHERE subject_id = 'spelling' AND status = 'published';",
  ].join('\n');
  const verificationOutput = runWrangler([
    'd1', 'execute', DATABASE_NAME,
    ...targetArgs(remote),
    '--json', '--command', verificationSql,
  ]);
  const verificationExecutions = parseWranglerJsonOutput(verificationOutput);
  const result = verificationExecutions.flatMap((entry) => entry?.results || [])[0] || {};
  if (Number(result.published_count) !== Number(result.ready_count)) {
    throw new Error(`Runtime projection verification failed (${result.ready_count || 0}/${result.published_count || 0} ready).`);
  }
  console.log(`Runtime projection backfill verified: ${result.ready_count || 0}/${result.published_count || 0} published releases ready.`);
  return 0;
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
