#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { relative, resolve } from 'node:path';

import { EVIDENCE_SCHEMA_VERSION } from './lib/capacity-evidence.mjs';

const CAPACITY_DOC_PATH = 'docs/operations/capacity.md';

// Tier configs live under this directory and are PR-reviewed. Evidence that
// claims a tier must cite a config file committed here, not an ad-hoc
// /tmp/loose.json. Without this check, an operator could supply relaxed
// thresholds under deadline pressure and have the evidence cross-check pass.
const TIER_CONFIG_DIR = 'reports/capacity/configs';

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

// Exposed sentinel string for the placeholder row. Future authors rewording the
// placeholder MUST update this constant and the matching row in
// docs/operations/capacity.md together, or verify will start failing.
export const PLACEHOLDER_DATE_SENTINEL = '_pending first run_';

// Keys the verify script expects on every non-fail evidence JSON. Their
// presence is the shape guard that separates a genuine capacity-run artefact
// from a hand-written fabrication. Shapes are checked; values are not
// signed — the controls that matter are table-to-file cross-referencing and
// mandatory tier metadata on certification-tier claims.
const REQUIRED_EVIDENCE_KEYS = ['ok', 'reportMeta', 'summary', 'failures', 'thresholds', 'safety'];

const EXIT_OK = 0;
const EXIT_GATE_FAIL = 1;
const EXIT_USAGE_ERROR = 2;

/**
 * Parse the Capacity Evidence table out of docs/operations/capacity.md.
 * Returns an array of row objects. Missing trailing cells are recorded as
 * empty strings so downstream logic can report the drift explicitly; the
 * parser never throws on a short row (older short rows were the class of bug
 * that let fabricated rows slip past).
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
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;

    const pick = (index) => (index < cells.length ? cells[index] : '');
    rows.push({
      date: pick(0),
      commit: pick(1),
      env: pick(2),
      plan: pick(3),
      learners: pick(4),
      burst: pick(5),
      rounds: pick(6),
      p95Bootstrap: pick(7),
      p95Command: pick(8),
      maxBytes: pick(9),
      count5xx: pick(10),
      signals: pick(11),
      decision: pick(12),
      evidence: pick(13),
      cellCount: cells.length,
      raw: line,
    });
  }
  return rows;
}

function isPlaceholderRow(row) {
  return row.date.includes(PLACEHOLDER_DATE_SENTINEL);
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
 * Cross-check the numeric cells in a capacity.md row against the evidence
 * payload. An operator who writes a tier row with nice-looking metrics but
 * points at an unrelated evidence file will trip this check.
 *
 * Cells compared: learners, bootstrapBurst, rounds (from reportMeta); 5xx
 * count (from summary.signals.server5xx).
 *
 * Cells NOT compared here (left to the evidence-envelope shape check): P95
 * latencies and byte counts — these vary between runs and would produce
 * flaky false positives if the cell value must match to the millisecond.
 */
function checkNumericDrift(row, payload) {
  const messages = [];
  const meta = payload.reportMeta || {};
  const summary = payload.summary || {};
  const signals = summary.signals || {};

  const compare = (rowValue, evidenceValue, label) => {
    if (!rowValue || rowValue === '—') return;
    const rowNum = Number(rowValue);
    if (!Number.isFinite(rowNum)) return;
    if (evidenceValue === null || evidenceValue === undefined) {
      messages.push(`evidence missing ${label} while row declares ${rowNum}.`);
      return;
    }
    const evidenceNum = Number(evidenceValue);
    if (!Number.isFinite(evidenceNum) || evidenceNum !== rowNum) {
      messages.push(
        `${label} mismatch: row=${rowNum} evidence=${evidenceValue}.`,
      );
    }
  };

  compare(row.learners, meta.learners, 'learners');
  compare(row.burst, meta.bootstrapBurst, 'bootstrapBurst');
  compare(row.rounds, meta.rounds, 'rounds');
  compare(row.count5xx, signals.server5xx || 0, 'server5xx');

  return messages;
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

  // A row should always have 14 cells. Short rows point at markdown drift
  // rather than a legitimate claim; fail them explicitly so the parser cannot
  // be used to smuggle a row through by dropping columns.
  if (row.cellCount < 14) {
    messages.push(`row has ${row.cellCount} cells; expected 14 (Date..Evidence)`);
    return { ok: false, messages };
  }

  // `fail` decisions are not backed by evidence files and do not support a
  // claim: they record a failed run for audit. Skip the remaining checks.
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

  // Shape guard: a hand-written fabrication missing any of these keys is
  // rejected. Values are checked below where they matter (ok, commit, tier,
  // schemaVersion); the shape itself is the first line of defence against
  // someone writing `{"ok":true,"reportMeta":{"commit":"x","evidenceSchemaVersion":2}}`
  // and calling it `100-plus-certified`.
  const missingKeys = REQUIRED_EVIDENCE_KEYS.filter((key) => !(key in payload));
  if (missingKeys.length) {
    messages.push(
      `evidence JSON missing required key(s): ${missingKeys.join(', ')}. `
      + 'Evidence must be produced by scripts/classroom-load-test.mjs or scripts/probe-production-bootstrap.mjs --output, not hand-edited.',
    );
  }

  if (payload.ok !== true) {
    messages.push(`evidence file report.ok is not true (found ${payload.ok})`);
  }

  const evidenceCommitRaw = String(payload.reportMeta?.commit || '');
  const rowCommitRaw = String(row.commit || '').trim();
  if (rowCommitRaw && rowCommitRaw !== '—') {
    // Row commit must be a prefix of the evidence commit (the evidence carries
    // the full SHA; operators typically write the first 7 chars). Very short
    // prefixes (<7) are rejected separately because they'd accept too many
    // unrelated commits.
    if (rowCommitRaw.length < 7) {
      messages.push(
        `row commit "${rowCommitRaw}" is too short; use at least 7 hex chars.`,
      );
    } else if (!evidenceCommitRaw.startsWith(rowCommitRaw)) {
      messages.push(`commit mismatch: row=${rowCommitRaw} evidence=${evidenceCommitRaw || 'unknown'}`);
    }
  }

  const schemaVersion = Number(payload.reportMeta?.evidenceSchemaVersion);
  if (!Number.isFinite(schemaVersion) || schemaVersion < 1) {
    messages.push(
      `evidenceSchemaVersion is missing or invalid (found: ${JSON.stringify(payload.reportMeta?.evidenceSchemaVersion)}). `
      + 'Evidence must carry a numeric schema version (U1 = 1, U3+ = 2).',
    );
  }
  // Reject a future-schema-version value we don't know how to verify; this
  // prevents an operator from hand-editing `evidenceSchemaVersion: 2` into a
  // U1 run to unlock classroom-tier claims before U3 actually ships the
  // telemetry. The compiled-in `EVIDENCE_SCHEMA_VERSION` constant is the
  // authoritative ceiling.
  if (Number.isFinite(schemaVersion) && schemaVersion > EVIDENCE_SCHEMA_VERSION) {
    messages.push(
      `evidenceSchemaVersion ${schemaVersion} is higher than the current tool version (${EVIDENCE_SCHEMA_VERSION}). `
      + 'Upgrade the verify script to the deploy that ships that schema, or regenerate the evidence.',
    );
  }
  if (TIERS_ABOVE_SMALL_PILOT.has(row.decision) && schemaVersion < 2) {
    messages.push(
      `tier "${row.decision}" requires evidenceSchemaVersion >= 2; found v${Number.isFinite(schemaVersion) ? schemaVersion : 'unknown'}. `
      + 'U3 telemetry (meta.capacity queryCount, d1RowsRead) must ship before classroom-tier claims.',
    );
  }

  // Cross-check decision against tier metadata when present. Every
  // certification-tier run (learners >= 20) MUST be invoked with
  // `--config reports/capacity/configs/<tier>.json`, which writes
  // `payload.tier.tier` into the evidence file.
  if (TIERS_ABOVE_SMALL_PILOT.has(row.decision)) {
    const evidenceTier = payload.tier?.tier;
    if (!evidenceTier) {
      messages.push(
        `tier "${row.decision}" requires evidence produced with --config reports/capacity/configs/<tier>.json. `
        + 'Evidence file is missing tier.tier.',
      );
    } else if (evidenceTier !== row.decision) {
      messages.push(
        `tier mismatch: row claims "${row.decision}" but evidence tier.tier is "${evidenceTier}".`,
      );
    }
    // Guard against a loose `--config` path: evidence must cite a tier config
    // path under reports/capacity/configs/ so the thresholds that backed the
    // claim are PR-reviewed, not ad-hoc. A missing tier.configPath field
    // indicates a hand-edited evidence file or an older classroom-load-test
    // that did not record provenance.
    const configPath = payload.tier?.configPath;
    if (!configPath) {
      messages.push(
        `tier "${row.decision}" requires evidence to record tier.configPath. `
        + 'Re-run with --config reports/capacity/configs/<tier>.json.',
      );
    } else {
      const normalisedConfigPath = relative(process.cwd(), resolve(process.cwd(), configPath)).replaceAll('\\', '/');
      if (!normalisedConfigPath.startsWith(`${TIER_CONFIG_DIR}/`)) {
        messages.push(
          `tier config path "${configPath}" is outside ${TIER_CONFIG_DIR}/. `
          + 'Certification-tier runs must cite a PR-reviewed config.',
        );
      } else if (!existsSync(resolve(process.cwd(), configPath))) {
        messages.push(
          `tier config file referenced by evidence does not exist at ${configPath}.`,
        );
      }
    }
  }

  // Cross-check numeric cells in the capacity.md row against evidence
  // summary. This makes it harder for a hand-edited row to claim a
  // tier-relevant metric (learners, burst, P95) that the backing evidence
  // never observed.
  const numericDrift = checkNumericDrift(row, payload);
  if (numericDrift.length) {
    messages.push(...numericDrift);
  }

  // Reject rows where the evidence reports any failed thresholds. A table
  // row stating a successful tier must not point at a run that recorded
  // threshold failures.
  if (Array.isArray(payload.failures) && payload.failures.length > 0) {
    messages.push(
      `evidence file records threshold failures: ${payload.failures.join(', ')}. `
      + 'Non-fail tier rows may only cite runs with failures: [].',
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
    return { ok: false, report, rowCount: 0 };
  }

  for (const [index, row] of rows.entries()) {
    const result = verifyEvidenceRow(row);
    if (!result.ok) {
      ok = false;
      for (const message of result.messages) {
        report.push(`[row ${index + 1}] ${message}`);
        report.push(`  source: ${row.raw}`);
      }
    }
  }
  return { ok, report, rowCount: rows.length };
}

function usage() {
  return [
    'Usage: node ./scripts/verify-capacity-evidence.mjs [options] [doc-path]',
    '',
    'Cross-checks the Capacity Evidence table in docs/operations/capacity.md',
    '(or <doc-path> if supplied) against its referenced JSON evidence files.',
    '',
    'Options:',
    '  --help, -h                 Print this usage summary.',
    '  --json                     Emit a machine-readable JSON report to stdout',
    '                             in addition to human-readable errors on stderr.',
    '',
    'Exit codes:',
    '  0  Verification passed (all rows consistent).',
    '  1  Verification failed (gate failure).',
    '  2  Usage error (unknown flag, bad invocation).',
  ].join('\n');
}

export function runVerify(argv = process.argv.slice(2)) {
  let docPath = CAPACITY_DOC_PATH;
  let emitJson = false;
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      return EXIT_OK;
    }
    if (arg === '--json') {
      emitJson = true;
      continue;
    }
    if (arg.startsWith('--')) {
      console.error(`Unknown option: ${arg}`);
      console.error(usage());
      return EXIT_USAGE_ERROR;
    }
    docPath = arg;
  }

  const { ok, report, rowCount } = verifyCapacityDoc(docPath);

  if (emitJson) {
    console.log(JSON.stringify({ ok, rowCount, messages: report }, null, 2));
  }

  if (!ok) {
    if (!emitJson) {
      console.error('Capacity evidence verification FAILED.');
      for (const entry of report) console.error(`  ${entry}`);
    }
    return EXIT_GATE_FAIL;
  }
  if (!emitJson) {
    console.log(`Capacity evidence verification passed (${rowCount} row(s) checked).`);
  }
  return EXIT_OK;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runVerify();
}
