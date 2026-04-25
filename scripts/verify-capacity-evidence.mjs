#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const CAPACITY_DOC_PATH = 'docs/operations/capacity.md';

const DECISION_TIERS = new Set([
  'fail',
  'smoke-pass',
  'small-pilot-provisional',
  '30-learner-beta-certified',
  '60-learner-stretch-certified',
  '100-plus-certified',
]);

const TIERS_ABOVE_SMALL_PILOT = new Set([
  '30-learner-beta-certified',
  '60-learner-stretch-certified',
  '100-plus-certified',
]);

/**
 * Parse the Capacity Evidence table out of docs/operations/capacity.md.
 * Returns an array of `{ date, commit, env, decision, evidence, raw }`.
 * The raw cell lets callers surface the source line on failure.
 */
export function parseEvidenceTable(markdown) {
  const lines = markdown.split(/\r?\n/);
  const rows = [];
  let inTable = false;
  let headerSeen = false;
  for (const line of lines) {
    if (line.startsWith('## Capacity Evidence')) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (line.startsWith('## ')) break;
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (!cells.length) continue;
    if (!headerSeen) {
      headerSeen = cells[0].toLowerCase() === 'date';
      continue;
    }
    // Divider row: cells contain only dashes or colons
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    rows.push({
      date: cells[0],
      commit: cells[1],
      env: cells[2],
      plan: cells[3],
      learners: cells[4],
      burst: cells[5],
      rounds: cells[6],
      p95Bootstrap: cells[7],
      p95Command: cells[8],
      maxBytes: cells[9],
      count5xx: cells[10],
      signals: cells[11],
      decision: cells[12],
      evidence: cells[13],
      raw: line,
    });
  }
  return rows;
}

function isPlaceholderRow(row) {
  // The initial row inserted before any real capacity run uses em-dashes and
  // a plain-text date so the verify script does not fail on a fresh repo.
  return row.date.includes('_pending first run_');
}

function extractEvidencePath(evidenceCell) {
  // Accept bare paths and Markdown `[label](path)` links.
  const linkMatch = evidenceCell.match(/\((reports\/capacity\/[^)]+)\)/);
  if (linkMatch) return linkMatch[1];
  const pathMatch = evidenceCell.match(/(reports\/capacity\/\S+)/);
  if (pathMatch) return pathMatch[1];
  return null;
}

/**
 * Verify a single evidence row against its persisted JSON file.
 * Returns `{ ok, messages: string[] }` where `ok: false` means the row fails
 * the cross-check.
 */
export function verifyEvidenceRow(row) {
  const messages = [];
  if (isPlaceholderRow(row)) {
    return { ok: true, messages: ['placeholder row — skipped'] };
  }

  if (!DECISION_TIERS.has(row.decision)) {
    messages.push(
      `decision "${row.decision}" is not one of: ${[...DECISION_TIERS].join(', ')}`,
    );
    return { ok: false, messages };
  }

  // Only non-fail, concrete decisions require backing evidence.
  if (row.decision === 'fail') {
    return { ok: true, messages: [] };
  }

  const evidencePath = extractEvidencePath(row.evidence);
  if (!evidencePath) {
    messages.push(`missing evidence path; Evidence cell: "${row.evidence}"`);
    return { ok: false, messages };
  }

  const absolute = resolve(process.cwd(), evidencePath);
  if (!existsSync(absolute)) {
    messages.push(`evidence file not found: ${evidencePath}`);
    return { ok: false, messages };
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(absolute, 'utf8'));
  } catch (error) {
    messages.push(`evidence file is not valid JSON: ${error.message}`);
    return { ok: false, messages };
  }

  if (payload.ok !== true) {
    messages.push(`evidence file report.ok is not true (found ${payload.ok})`);
  }
  const evidenceCommit = String(payload.reportMeta?.commit || '').slice(0, row.commit.length);
  if (row.commit && row.commit !== '—' && evidenceCommit !== row.commit) {
    messages.push(`commit mismatch: row=${row.commit} evidence=${evidenceCommit || 'unknown'}`);
  }
  const schemaVersion = Number(payload.reportMeta?.evidenceSchemaVersion);
  if (TIERS_ABOVE_SMALL_PILOT.has(row.decision) && schemaVersion < 2) {
    messages.push(
      `tier "${row.decision}" requires evidenceSchemaVersion >= 2; found v${schemaVersion || 'unknown'}. `
      + 'U3 telemetry (meta.capacity queryCount, d1RowsRead) must ship before classroom-tier claims.',
    );
  }

  return { ok: messages.length === 0, messages };
}

export function verifyCapacityDoc(docPath = CAPACITY_DOC_PATH) {
  const absolute = resolve(process.cwd(), docPath);
  if (!existsSync(absolute)) {
    return { ok: false, report: [`Capacity doc not found at ${docPath}`] };
  }
  const markdown = readFileSync(absolute, 'utf8');
  const rows = parseEvidenceTable(markdown);
  const report = [];
  let ok = true;

  if (!rows.length) {
    report.push('No Capacity Evidence table rows found — doc may have drifted.');
    return { ok: false, report };
  }

  for (const row of rows) {
    const result = verifyEvidenceRow(row);
    if (!result.ok) {
      ok = false;
      for (const message of result.messages) {
        report.push(`[row ${rows.indexOf(row) + 1}] ${message}`);
        report.push(`  source: ${row.raw}`);
      }
    }
  }
  return { ok, report, rowCount: rows.length };
}

export function runVerify(argv = process.argv.slice(2)) {
  const docPath = argv[0] || CAPACITY_DOC_PATH;
  const { ok, report, rowCount } = verifyCapacityDoc(docPath);
  if (!ok) {
    console.error('Capacity evidence verification FAILED.');
    for (const entry of report) console.error(`  ${entry}`);
    return 1;
  }
  console.log(`Capacity evidence verification passed (${rowCount} row(s) checked).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runVerify();
}
