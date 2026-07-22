#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER_WRAPPER = path.join(ROOT_DIR, 'scripts', 'wrangler-oauth.mjs');

export function sqlForWranglerCommand(source) {
  const lines = String(source || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  while (lines.length && (!lines[0].trim() || lines[0].trimStart().startsWith('--'))) {
    lines.shift();
  }
  const sql = lines.join('\n').trim();
  if (!sql) throw new Error('Verifier SQL is empty after leading comments.');
  return sql;
}

export function parseWranglerJsonOutput(stdout) {
  const text = String(stdout || '').trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end < start) {
    throw new Error('Wrangler did not return a JSON result array.');
  }
  return JSON.parse(text.slice(start, end + 1));
}

export function summariseVerificationResults(executions) {
  const entries = Array.isArray(executions) ? executions : [];
  const rows = entries.flatMap((entry) => Array.isArray(entry?.results) ? entry.results : []);
  const failedRows = rows.filter((row) => Number(row?.ok) !== 1);
  const rowsWritten = entries.reduce(
    (sum, entry) => sum + (Number(entry?.meta?.rows_written) || 0),
    0,
  );
  const rowsRead = entries.reduce(
    (sum, entry) => sum + (Number(entry?.meta?.rows_read) || 0),
    0,
  );
  const failures = [];

  if (!entries.length) failures.push('Wrangler returned no execution results.');
  if (entries.some((entry) => entry?.success === false)) {
    failures.push('Wrangler reported an unsuccessful D1 execution.');
  }
  if (!rows.length) failures.push('Verifier returned no check rows.');
  if (failedRows.length) {
    failures.push(`${failedRows.length} verifier check(s) reported ok != 1.`);
  }
  if (entries.some((entry) => entry?.meta?.changed_db === true) || rowsWritten !== 0) {
    failures.push(`Read-only verifier changed D1 state (rows_written=${rowsWritten}).`);
  }

  return {
    ok: failures.length === 0,
    rows,
    failedRows,
    rowsRead,
    rowsWritten,
    failures,
  };
}

export function runRemoteVerifier(sqlPath, { spawn = spawnSync } = {}) {
  const resolvedSqlPath = path.resolve(ROOT_DIR, sqlPath);
  const sql = sqlForWranglerCommand(readFileSync(resolvedSqlPath, 'utf8'));
  const result = spawn(process.execPath, [
    WRANGLER_WRAPPER,
    'd1',
    'execute',
    'ks2-mastery-db',
    '--remote',
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
    throw new Error(`Remote D1 verifier failed.${detail ? ` ${detail}` : ''}`);
  }

  return summariseVerificationResults(parseWranglerJsonOutput(result.stdout));
}

function main() {
  const sqlPath = process.argv[2];
  if (!sqlPath || process.argv.length !== 3) {
    console.error('Usage: node scripts/d1-verify.mjs <verifier.sql>');
    return 2;
  }

  try {
    const summary = runRemoteVerifier(sqlPath);
    for (const row of summary.rows) {
      const marker = Number(row?.ok) === 1 ? 'PASS' : 'FAIL';
      console.log(`${marker} ${row?.check_name}: expected=${row?.expected} actual=${row?.actual}`);
    }
    console.log(
      `D1 verifier ${summary.ok ? 'passed' : 'failed'}: ${summary.rows.length} checks, `
      + `${summary.rowsRead} rows read, ${summary.rowsWritten} rows written.`,
    );
    if (!summary.ok) {
      for (const failure of summary.failures) console.error(failure);
      return 1;
    }
    return 0;
  } catch (error) {
    console.error(error?.message || String(error));
    return 1;
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) process.exitCode = main();
