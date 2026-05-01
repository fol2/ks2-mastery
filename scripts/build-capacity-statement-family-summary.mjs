#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { readStatementMapInput } from './build-capacity-statement-map.mjs';

const DIAGNOSTIC_REDACTION_VERSION = 'capacity-diagnostics-redaction-v1';
const OPAQUE_HASH_LENGTH = 24;
const DEFAULT_ROUTE = 'GET /api/bootstrap';
const DEFAULT_RUN_ID = 'capacity-diagnostic';

const FAMILY_LABELS = Object.freeze({
  AUTH_SESSION_ACCOUNT_ROW: 'auth-session-account-row',
  ACCOUNT_UPSERT: 'account-upsert',
  DEMO_ACTIVE_ACCOUNT_GUARD: 'demo-active-account-guard',
  ACCOUNT_ROW_SELECTED_LEARNER: 'account-row-selected-learner',
  MEMBERSHIP_LEARNER_ROWS: 'membership-learner-rows',
  LEARNER_LIST_REVISION: 'learner-list-revision',
  MONSTER_VISUAL_CONFIG_POINTER: 'monster-visual-config-pointer',
  CHILD_SUBJECT_STATE: 'child-subject-state',
  CHILD_GAME_STATE: 'child-game-state',
  PUBLIC_SESSION_ROWS: 'public-session-rows',
  PUBLIC_EVENT_ROWS: 'public-event-rows',
  SPELLING_CONTENT_BUNDLE_POINTER: 'spelling-content-bundle-release-pointer',
  SPELLING_CODEX_MERGE: 'spelling-codex-merge',
  CAPACITY_REVISION_HELPER: 'capacity-revision-helper',
  UNKNOWN: 'unknown-bootstrap-statement',
});

const FAMILY_NOTES = Object.freeze({
  [FAMILY_LABELS.AUTH_SESSION_ACCOUNT_ROW]: 'Session/account authentication lookup; already required before route handling.',
  [FAMILY_LABELS.ACCOUNT_UPSERT]: 'Authenticated account upsert/refresh before route handling; returns the account row.',
  [FAMILY_LABELS.DEMO_ACTIVE_ACCOUNT_GUARD]: 'Demo-only active-account guard; can reuse a trusted account snapshot before falling back to D1.',
  [FAMILY_LABELS.ACCOUNT_ROW_SELECTED_LEARNER]: 'Bootstrap account row used for selected learner, account revision and role fields.',
  [FAMILY_LABELS.MEMBERSHIP_LEARNER_ROWS]: 'Writable learner membership rows and learner revisions.',
  [FAMILY_LABELS.LEARNER_LIST_REVISION]: 'Learner-list revision ingredient for bootstrap cache invalidation.',
  [FAMILY_LABELS.MONSTER_VISUAL_CONFIG_POINTER]: 'Compact monster visual runtime pointer.',
  [FAMILY_LABELS.CHILD_SUBJECT_STATE]: 'Child subject-state rows for selected and sibling learner correctness.',
  [FAMILY_LABELS.CHILD_GAME_STATE]: 'Child game-state rows for selected and sibling learner correctness.',
  [FAMILY_LABELS.PUBLIC_SESSION_ROWS]: 'Bounded public practice-session rows for first paint.',
  [FAMILY_LABELS.PUBLIC_EVENT_ROWS]: 'Bounded public event rows for first paint.',
  [FAMILY_LABELS.SPELLING_CONTENT_BUNDLE_POINTER]: 'Spelling runtime content snapshot or release pointer.',
  [FAMILY_LABELS.SPELLING_CODEX_MERGE]: 'Spelling codex/public game-state merge.',
  [FAMILY_LABELS.CAPACITY_REVISION_HELPER]: 'Bootstrap capacity or revision helper.',
  [FAMILY_LABELS.UNKNOWN]: 'Unclassified statement; inspect raw tail outside the repository before optimising.',
});

const REDUCTION_CANDIDATES = new Set([
  FAMILY_LABELS.ACCOUNT_ROW_SELECTED_LEARNER,
  FAMILY_LABELS.DEMO_ACTIVE_ACCOUNT_GUARD,
]);

function hashDiagnosticValue(kind, value) {
  return createHash('sha256')
    .update(`${DIAGNOSTIC_REDACTION_VERSION}:${kind}:${String(value)}`)
    .digest('hex')
    .slice(0, OPAQUE_HASH_LENGTH);
}

export function redactDiagnosticRequestId(value) {
  if (typeof value !== 'string' || !value) return null;
  if (/^req_[0-9a-f]{24}$/.test(value)) return value;
  return `req_${hashDiagnosticValue('request-id', value)}`;
}

export function redactDiagnosticStatementId(value) {
  if (typeof value !== 'string' || !value) return `stmt_${hashDiagnosticValue('statement-name', 'unknown')}`;
  if (/^stmt_[0-9a-f]{24}$/.test(value)) return value;
  return `stmt_${hashDiagnosticValue('statement-name', value)}`;
}

function finiteOrNull(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function percentile(values, p) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[index].toFixed(3));
}

function routeForRecord(record = {}) {
  if (typeof record.route === 'string' && record.route.trim()) return record.route.trim();
  const method = typeof record.method === 'string' && record.method.trim()
    ? record.method.trim().toUpperCase()
    : null;
  const endpoint = typeof record.endpoint === 'string' && record.endpoint.trim()
    ? record.endpoint.trim()
    : null;
  return method && endpoint ? `${method} ${endpoint}` : endpoint || 'unknown';
}

export function classifyBootstrapStatementFamily(statementName = '') {
  const name = String(statementName || '').toLowerCase();
  if (
    (name.includes('from account_sessions') && name.includes('join adult_accounts'))
    || (name.includes('s.id as session_id') && name.includes('s.session_hash'))
  ) {
    return FAMILY_LABELS.AUTH_SESSION_ACCOUNT_ROW;
  }
  if (name.includes('insert into adult_accounts')) return FAMILY_LABELS.ACCOUNT_UPSERT;
  if (name.includes('select id, account_type, demo_expires_at from adult_accounts')) {
    return FAMILY_LABELS.DEMO_ACTIVE_ACCOUNT_GUARD;
  }
  if (name.includes('select * from adult_accounts')) return FAMILY_LABELS.ACCOUNT_ROW_SELECTED_LEARNER;
  if (name.includes('from account_learner_memberships') || name.includes('m.account_id') || name.includes('m.learner_id')) {
    return FAMILY_LABELS.MEMBERSHIP_LEARNER_ROWS;
  }
  if (name.includes('from adult_account_list_revisions')) return FAMILY_LABELS.LEARNER_LIST_REVISION;
  if (name.includes('published_version') && name.includes('manifest_hash')) {
    return FAMILY_LABELS.MONSTER_VISUAL_CONFIG_POINTER;
  }
  if (name.includes('from child_subject_state') || (name.includes('learner_id, subject_id') && name.includes('ui_json'))) {
    return FAMILY_LABELS.CHILD_SUBJECT_STATE;
  }
  if (name.includes('from child_game_state') || (name.includes('learner_id, system_id') && name.includes('state_json'))) {
    return FAMILY_LABELS.CHILD_GAME_STATE;
  }
  if (name.includes('from practice_sessions') || (name.includes('session_kind') && name.includes('session_state_json'))) {
    return FAMILY_LABELS.PUBLIC_SESSION_ROWS;
  }
  if (name.includes('from event_log') || (name.includes('event_type') && name.includes('event_json'))) {
    return FAMILY_LABELS.PUBLIC_EVENT_ROWS;
  }
  if (name.includes('spelling') && (name.includes('content') || name.includes('release'))) {
    return FAMILY_LABELS.SPELLING_CONTENT_BUNDLE_POINTER;
  }
  if (name.includes('spelling') && name.includes('codex')) return FAMILY_LABELS.SPELLING_CODEX_MERGE;
  if (name.includes('bootstrap') && (name.includes('revision') || name.includes('capacity'))) {
    return FAMILY_LABELS.CAPACITY_REVISION_HELPER;
  }
  return FAMILY_LABELS.UNKNOWN;
}

function emptyFamilyAggregate(family) {
  return {
    family,
    count: 0,
    requestIds: new Set(),
    durationValues: [],
    topTailDurationValues: [],
    rowsReadValues: [],
    rowsWrittenValues: [],
  };
}

function addStatementAggregate(aggregate, record, statement, { topTail = false } = {}) {
  const requestId = redactDiagnosticRequestId(record.requestId || record.serverRequestId || record.clientRequestId);
  if (!topTail) {
    aggregate.count += 1;
    if (requestId) aggregate.requestIds.add(requestId);
  }
  const duration = finiteOrNull(statement.durationMs);
  if (duration !== null) {
    if (!topTail) aggregate.durationValues.push(duration);
    if (topTail) aggregate.topTailDurationValues.push(duration);
  }
  const rowsRead = finiteOrNull(statement.rowsRead);
  if (!topTail && rowsRead !== null) aggregate.rowsReadValues.push(rowsRead);
  const rowsWritten = finiteOrNull(statement.rowsWritten);
  if (!topTail && rowsWritten !== null) aggregate.rowsWrittenValues.push(rowsWritten);
}

function tailSampleEntries(tailCorrelation = null, route = DEFAULT_ROUTE) {
  const samples = tailCorrelation?.diagnostics?.workerLogJoin?.samples;
  if (!Array.isArray(samples)) return [];
  return samples.filter((sample) => {
    const sampleRoute = `${String(sample.method || '').toUpperCase()} ${sample.endpoint || ''}`.trim();
    return sampleRoute === route;
  });
}

function sortedTailRecords(records, route = DEFAULT_ROUTE, limit = 10) {
  return records
    .filter((record) => routeForRecord(record) === route)
    .sort((left, right) => (finiteOrNull(right.wallMs) || 0) - (finiteOrNull(left.wallMs) || 0))
    .slice(0, limit);
}

function statementIdFamilyIndex(records) {
  const index = new Map();
  for (const record of records) {
    for (const statement of record.statements || []) {
      const statementId = redactDiagnosticStatementId(statement.name);
      if (!index.has(statementId)) {
        index.set(statementId, classifyBootstrapStatementFamily(statement.name));
      }
    }
  }
  return index;
}

function aggregateToReportEntry(aggregate) {
  const durationTotal = aggregate.durationValues.reduce((total, value) => total + value, 0);
  const topTailDurationTotal = aggregate.topTailDurationValues.reduce((total, value) => total + value, 0);
  return {
    family: aggregate.family,
    count: aggregate.count,
    requestCount: aggregate.requestIds.size,
    durationMsTotal: Number(durationTotal.toFixed(3)),
    durationMsP95: percentile(aggregate.durationValues, 95),
    topTailDurationMsTotal: Number(topTailDurationTotal.toFixed(3)),
    topTailDurationMsP95: percentile(aggregate.topTailDurationValues, 95),
    rowsReadP95: percentile(aggregate.rowsReadValues, 95),
    rowsWrittenP95: percentile(aggregate.rowsWrittenValues, 95),
    candidate: REDUCTION_CANDIDATES.has(aggregate.family),
    notes: FAMILY_NOTES[aggregate.family] || FAMILY_NOTES[FAMILY_LABELS.UNKNOWN],
  };
}

export function buildStatementFamilySummary({
  records = [],
  tailCorrelation = null,
  runId = DEFAULT_RUN_ID,
  route = DEFAULT_ROUTE,
  generatedAt = new Date().toISOString(),
} = {}) {
  const routeRecords = records.filter((record) => routeForRecord(record) === route);
  const familyAggregates = new Map();
  const statementFamilyById = statementIdFamilyIndex(routeRecords);

  for (const record of routeRecords) {
    for (const statement of record.statements || []) {
      const family = classifyBootstrapStatementFamily(statement.name);
      const aggregate = familyAggregates.get(family) || emptyFamilyAggregate(family);
      addStatementAggregate(aggregate, record, statement);
      familyAggregates.set(family, aggregate);
    }
  }

  const topTailSamples = tailSampleEntries(tailCorrelation, route);
  const topTailRecords = topTailSamples.length
    ? topTailSamples.map((sample) => ({
      requestId: sample.requestId,
      statements: sample.capacityRequest?.statements || [],
    }))
    : sortedTailRecords(routeRecords, route, 10);

  for (const record of topTailRecords) {
    for (const statement of record.statements || []) {
      const family = statement.statementId
        ? statementFamilyById.get(statement.statementId) || FAMILY_LABELS.UNKNOWN
        : classifyBootstrapStatementFamily(statement.name);
      const aggregate = familyAggregates.get(family) || emptyFamilyAggregate(family);
      addStatementAggregate(aggregate, record, statement, { topTail: true });
      familyAggregates.set(family, aggregate);
    }
  }

  const statementFamilies = [...familyAggregates.values()]
    .map(aggregateToReportEntry)
    .sort((left, right) => (
      right.topTailDurationMsTotal - left.topTailDurationMsTotal
      || right.durationMsTotal - left.durationMsTotal
      || left.family.localeCompare(right.family)
    ));

  const rankedCandidates = statementFamilies
    .filter((entry) => entry.candidate)
    .slice(0, 2)
    .map((entry, index) => ({
      rank: index + 1,
      family: entry.family,
      reason: entry.family === FAMILY_LABELS.ACCOUNT_ROW_SELECTED_LEARNER
        ? 'The authenticated route already has an account row from ensureAccount; pass it into bootstrap instead of re-reading.'
        : 'The authenticated route already has a trusted demo account snapshot; use it before falling back to the existing guard.',
    }));

  return {
    schema: 1,
    kind: 'capacity-statement-family-summary',
    runId,
    route,
    generatedAt,
    modellingOnly: true,
    certifying: false,
    redaction: {
      version: DIAGNOSTIC_REDACTION_VERSION,
      rawRequestIdsPersisted: false,
      rawStatementNamesPersisted: false,
      rawSqlPersisted: false,
      emailsPersisted: false,
      learnerNamesPersisted: false,
      cookiesPersisted: false,
      bearerTokensPersisted: false,
    },
    source: {
      requestCount: routeRecords.length,
      topTailSampleCount: topTailRecords.length,
      statementCount: routeRecords.reduce((total, record) => total + (record.statements?.length || 0), 0),
      statementsTruncated: routeRecords.filter((record) => record.statementsTruncated === true).length,
    },
    statementFamilies,
    rankedCandidates,
  };
}

function markdownTableRows(report) {
  return report.statementFamilies.map((entry) => [
    entry.family,
    String(entry.count),
    entry.topTailDurationMsP95 == null ? 'n/a' : String(entry.topTailDurationMsP95),
    entry.rowsReadP95 == null ? 'n/a' : String(entry.rowsReadP95),
    entry.rowsWrittenP95 == null ? 'n/a' : String(entry.rowsWrittenP95),
    entry.candidate ? 'yes' : 'no',
    entry.notes,
  ]);
}

export function formatStatementFamilySummaryMarkdown(report) {
  const candidateLines = report.rankedCandidates.length
    ? report.rankedCandidates.map((entry) => `${entry.rank}. \`${entry.family}\` — ${entry.reason}`).join('\n')
    : 'No implementation candidate was selected from this evidence.';
  const rows = markdownTableRows(report)
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');

  return [
    '---',
    'title: "System Hardening Optimisation P7 — Statement-Family Summary"',
    'type: diagnostic-summary',
    'status: completed',
    `date: ${String(report.generatedAt || '').slice(0, 10)}`,
    'phase: P7',
    'language: en-GB',
    'certifying: false',
    '---',
    '',
    '# System Hardening Optimisation P7 — Statement-Family Summary',
    '',
    '## Scope',
    '',
    `Run: \`${report.runId}\``,
    '',
    `Route: \`${report.route}\``,
    '',
    'This is a redacted engineering summary. It intentionally omits raw SQL, raw request ids, cookies, emails, account ids, learner ids and learner names.',
    '',
    '## Coverage',
    '',
    `- bootstrap requests analysed: ${report.source.requestCount}`,
    `- top-tail samples analysed: ${report.source.topTailSampleCount}`,
    `- bootstrap statements analysed: ${report.source.statementCount}`,
    `- truncated statement-log requests: ${report.source.statementsTruncated}`,
    '',
    '## Statement Families',
    '',
    '| Family | Count | Top-tail duration P95 ms | Rows read P95 | Rows written P95 | Candidate | Notes |',
    '| --- | ---: | ---: | ---: | ---: | --- | --- |',
    rows,
    '',
    '## Ranked P7-U2 Candidates',
    '',
    candidateLines,
    '',
    '## Redaction Contract',
    '',
    '- No raw SQL or raw statement names are persisted.',
    '- No raw Worker tail request identifiers are persisted.',
    '- No cookies, bearer tokens, emails, account ids, learner ids or learner names are persisted.',
    '- This artefact is diagnostic-only and does not certify 60 learners.',
    '',
  ].join('\n');
}

export function parseStatementFamilyArgs(argv = []) {
  const options = {
    inputPath: null,
    tailCorrelationPath: null,
    outputPath: null,
    markdownOutputPath: null,
    runId: DEFAULT_RUN_ID,
    route: DEFAULT_ROUTE,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--input') {
      options.inputPath = argv[++index] || null;
      if (!options.inputPath) throw new Error('--input requires a path');
    } else if (arg === '--tail-correlation') {
      options.tailCorrelationPath = argv[++index] || null;
      if (!options.tailCorrelationPath) throw new Error('--tail-correlation requires a path');
    } else if (arg === '--output') {
      options.outputPath = argv[++index] || null;
      if (!options.outputPath) throw new Error('--output requires a path');
    } else if (arg === '--markdown-output') {
      options.markdownOutputPath = argv[++index] || null;
      if (!options.markdownOutputPath) throw new Error('--markdown-output requires a path');
    } else if (arg === '--run-id') {
      options.runId = argv[++index] || DEFAULT_RUN_ID;
    } else if (arg === '--route') {
      options.route = argv[++index] || DEFAULT_ROUTE;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export async function runStatementFamilySummary(argv = process.argv.slice(2), {
  cwd = process.cwd(),
  now = () => new Date(),
} = {}) {
  const options = parseStatementFamilyArgs(argv);
  if (options.help) {
    return {
      ok: true,
      help: [
        'Usage: node scripts/build-capacity-statement-family-summary.mjs --input <raw-tail.jsonl> --tail-correlation <redacted-correlation.json> --output <summary.json> --markdown-output <summary.md>',
        'Builds a redacted bootstrap statement-family summary from raw tail held outside the repository.',
      ].join('\n'),
    };
  }
  if (!options.inputPath) throw new Error('--input is required');
  const inputPath = path.resolve(cwd, options.inputPath);
  if (!existsSync(inputPath)) throw new Error(`Input file not found: ${inputPath}`);
  const tailCorrelationPath = options.tailCorrelationPath
    ? path.resolve(cwd, options.tailCorrelationPath)
    : null;
  if (tailCorrelationPath && !existsSync(tailCorrelationPath)) {
    throw new Error(`Tail correlation file not found: ${tailCorrelationPath}`);
  }

  const records = readStatementMapInput(inputPath);
  const tailCorrelation = tailCorrelationPath
    ? JSON.parse(readFileSync(tailCorrelationPath, 'utf8'))
    : null;
  const report = buildStatementFamilySummary({
    records,
    tailCorrelation,
    runId: options.runId,
    route: options.route,
    generatedAt: now().toISOString(),
  });

  if (options.outputPath) {
    const outputPath = path.resolve(cwd, options.outputPath);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  if (options.markdownOutputPath) {
    const markdownOutputPath = path.resolve(cwd, options.markdownOutputPath);
    mkdirSync(path.dirname(markdownOutputPath), { recursive: true });
    writeFileSync(markdownOutputPath, formatStatementFamilySummaryMarkdown(report), 'utf8');
  }

  return { ok: true, report };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runStatementFamilySummary()
    .then((result) => {
      if (result.help) {
        console.log(result.help);
      } else {
        console.log(JSON.stringify({ ok: result.ok, runId: result.report.runId }, null, 2));
      }
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exit(1);
    });
}
