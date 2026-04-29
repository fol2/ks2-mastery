#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_LIMIT = 10;
const DIAGNOSTIC_REDACTION_VERSION = 'capacity-diagnostics-redaction-v1';
const OPAQUE_HASH_LENGTH = 24;
const OPAQUE_REQUEST_ID_RE = /^req_[0-9a-f]{24}$/;
const OPAQUE_STATEMENT_ID_RE = /^stmt_[0-9a-f]{24}$/;
const OPAQUE_QUERY_PLAN_NOTE_ID_RE = /^plan_[0-9a-f]{24}$/;
const DEFAULT_OUTPUT_PATH = path.join(
  'reports',
  'capacity',
  'evidence',
  `${new Date().toISOString().slice(0, 10)}-p1-statement-map.json`,
);

const REQUIRED_QUERY_PLAN_FIELDS = Object.freeze([
  'candidate',
  'expectedReadReduction',
  'writeCostRisk',
]);

function finiteOrNull(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function addFinite(target, key, value) {
  const n = finiteOrNull(value);
  if (n === null) return false;
  target[key] = (target[key] || 0) + n;
  return true;
}

function normaliseRoute(record = {}) {
  if (typeof record.route === 'string' && record.route.trim()) return record.route.trim();
  const method = typeof record.method === 'string' && record.method.trim()
    ? record.method.trim().toUpperCase()
    : null;
  const endpoint = typeof record.endpoint === 'string' && record.endpoint.trim()
    ? record.endpoint.trim()
    : null;
  if (method && endpoint) return `${method} ${endpoint}`;
  if (endpoint) return endpoint;
  return 'unknown';
}

function normalisePhase(record = {}, route = '') {
  if (typeof record.phase === 'string' && record.phase.trim()) return record.phase.trim();
  if (/\/api\/bootstrap\b/.test(route)) return 'bootstrap';
  if (/\/command\b/.test(route)) return 'command';
  if (/\/api\/demo\/session\b/.test(route)) return 'setup';
  return 'other';
}

function requestIdFor(record = {}) {
  return record.requestId || record.serverRequestId || record.clientRequestId || null;
}

function diagnosticRedactionMetadata() {
  return {
    version: DIAGNOSTIC_REDACTION_VERSION,
    requestIds: `sha256:${OPAQUE_HASH_LENGTH}`,
    statementIds: `sha256:${OPAQUE_HASH_LENGTH}`,
    queryPlanNoteIds: `sha256:${OPAQUE_HASH_LENGTH}`,
    rawRequestIdsPersisted: false,
    rawStatementNamesPersisted: false,
    rawQueryPlanNotesPersisted: false,
  };
}

function redactDiagnosticRequestId(value) {
  if (typeof value !== 'string' || !value) return null;
  if (OPAQUE_REQUEST_ID_RE.test(value)) return value;
  return `req_${hashDiagnosticValue('request-id', value)}`;
}

function redactDiagnosticStatementId(value) {
  if (typeof value !== 'string' || !value) return `stmt_${hashDiagnosticValue('statement-name', 'unknown')}`;
  if (OPAQUE_STATEMENT_ID_RE.test(value)) return value;
  return `stmt_${hashDiagnosticValue('statement-name', value)}`;
}

function redactDiagnosticQueryPlanNoteId(value) {
  if (typeof value === 'string' && OPAQUE_QUERY_PLAN_NOTE_ID_RE.test(value)) return value;
  return `plan_${hashDiagnosticValue('query-plan-note', stableDiagnosticStringify(value))}`;
}

function hashDiagnosticValue(kind, value) {
  return createHash('sha256')
    .update(`${DIAGNOSTIC_REDACTION_VERSION}:${kind}:${String(value)}`)
    .digest('hex')
    .slice(0, OPAQUE_HASH_LENGTH);
}

function stableDiagnosticStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableDiagnosticStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${stableDiagnosticStringify(value[key])}`
  )).join(',')}}`;
}

function parseStructuredLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;
  const jsonStart = trimmed.indexOf('{');
  if (jsonStart === -1) return null;
  try {
    return JSON.parse(trimmed.slice(jsonStart));
  } catch {
    return null;
  }
}

function looksLikeCapacityRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.event === 'capacity.request') return true;
  const hasRoute = typeof value.route === 'string' || typeof value.endpoint === 'string';
  const hasRequestId = Boolean(value.requestId || value.serverRequestId || value.clientRequestId);
  if (Array.isArray(value.statements) && hasRoute) return true;
  if (hasRequestId && hasRoute && (
    Object.prototype.hasOwnProperty.call(value, 'queryCount')
    || Object.prototype.hasOwnProperty.call(value, 'statementLogCoverage')
    || Object.prototype.hasOwnProperty.call(value, 'statementsTruncated')
  )) return true;
  return false;
}

function maybeParseEmbeddedMessage(value) {
  if (!value || typeof value !== 'object' || typeof value.message !== 'string') return null;
  if (!value.message.includes('capacity.request') && !value.message.includes('[ks2-worker]')) return null;
  return parseStructuredLine(value.message);
}

function collectCapacityRecords(value, output = [], seen = new Set()) {
  if (!value || typeof value !== 'object') return output;

  const embedded = maybeParseEmbeddedMessage(value);
  if (embedded) collectCapacityRecords(embedded, output, seen);

  if (looksLikeCapacityRecord(value)) {
    if (!seen.has(value)) {
      output.push(value);
      seen.add(value);
    }
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectCapacityRecords(item, output, seen);
    return output;
  }

  for (const item of Object.values(value)) {
    collectCapacityRecords(item, output, seen);
  }
  return output;
}

export function readStatementMapInput(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const parsed = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();

  if (parsed !== null) return collectCapacityRecords(parsed);

  const records = [];
  for (const line of text.split(/\r?\n/)) {
    const parsedLine = parseStructuredLine(line);
    if (!parsedLine) continue;
    collectCapacityRecords(parsedLine, records);
  }
  return records;
}

function normaliseStatement(statement = {}) {
  const name = typeof statement.name === 'string' && statement.name.trim()
    ? statement.name.trim()
    : typeof statement.statementId === 'string' && statement.statementId.trim()
      ? statement.statementId.trim()
      : 'unknown';
  return {
    name,
    rowsRead: finiteOrNull(statement.rowsRead),
    rowsWritten: finiteOrNull(statement.rowsWritten),
    durationMs: finiteOrNull(statement.durationMs),
  };
}

function normaliseRecord(record = {}, sourcePath = null) {
  const route = normaliseRoute(record);
  const phase = normalisePhase(record, route);
  const statements = Array.isArray(record.statements)
    ? record.statements.map(normaliseStatement)
    : null;
  const queryCount = finiteOrNull(record.queryCount);
  return {
    sourcePath,
    requestId: requestIdFor(record),
    route,
    phase,
    status: finiteOrNull(record.status),
    queryCount,
    d1RowsRead: finiteOrNull(record.d1RowsRead),
    d1RowsWritten: finiteOrNull(record.d1RowsWritten),
    d1DurationMs: finiteOrNull(record.d1DurationMs),
    wallMs: finiteOrNull(record.wallMs),
    responseBytes: finiteOrNull(record.responseBytes),
    statements,
    statementsTruncated: record.statementsTruncated === true,
    explicitStatementCoverage: record.statementLogCoverage ?? null,
  };
}

function statementCoverageFor(record) {
  const hasStatements = Array.isArray(record.statements);
  const statementCount = hasStatements ? record.statements.length : 0;
  const expectsQueries = record.queryCount !== null && record.queryCount > 0;
  const explicitMissing = record.explicitStatementCoverage === false
    || record.explicitStatementCoverage === 'missing'
    || record.explicitStatementCoverage === 'sampled-out';

  const reasons = [];
  if (explicitMissing) reasons.push('statement-log-sampled-out');
  if (!hasStatements && expectsQueries) reasons.push('missing-statement-log');
  if (record.statementsTruncated) reasons.push('statements-truncated');
  if (
    hasStatements
    && record.queryCount !== null
    && statementCount < record.queryCount
  ) {
    reasons.push('statement-count-below-query-count');
  }

  return {
    requestId: record.requestId,
    route: record.route,
    phase: record.phase,
    queryCount: record.queryCount,
    statementCount,
    statementsTruncated: record.statementsTruncated,
    complete: reasons.length === 0,
    reasons,
  };
}

function buildCoverage(records) {
  const perRequest = records.map(statementCoverageFor);
  const incomplete = perRequest.filter((entry) => !entry.complete);
  const requestsWithStatementLogs = perRequest.filter((entry) => entry.statementCount > 0).length;
  const truncated = perRequest.filter((entry) => entry.statementsTruncated);
  const expectedStatementTotal = perRequest.reduce((total, entry) => (
    total + Math.max(entry.queryCount || 0, entry.statementCount || 0)
  ), 0);
  const observedStatementTotal = perRequest.reduce((total, entry) => total + entry.statementCount, 0);

  if (!records.length) {
    return {
      status: 'insufficient',
      canRecommendQueryShape: false,
      reason: 'no-capacity-statement-records',
      totalRequests: 0,
      requestsWithStatementLogs: 0,
      missingStatementLogRequests: 0,
      truncatedRequests: 0,
      expectedStatementTotal: 0,
      observedStatementTotal: 0,
      statementCoverageRatio: 0,
      incompleteRequests: [],
      statementsTruncated: {
        count: 0,
        requestIds: [],
      },
    };
  }

  const status = incomplete.length === 0 ? 'complete' : 'insufficient';
  return {
    status,
    canRecommendQueryShape: status === 'complete',
    reason: status === 'complete' ? 'statement-log-coverage-complete' : 'insufficient-statement-log-coverage',
    totalRequests: records.length,
    requestsWithStatementLogs,
    missingStatementLogRequests: records.length - requestsWithStatementLogs,
    truncatedRequests: truncated.length,
    expectedStatementTotal,
    observedStatementTotal,
    statementCoverageRatio: expectedStatementTotal > 0
      ? Number((observedStatementTotal / expectedStatementTotal).toFixed(4))
      : 1,
    incompleteRequests: incomplete,
    statementsTruncated: {
      count: truncated.length,
      requestIds: truncated.map((entry) => entry.requestId).filter(Boolean),
    },
  };
}

function redactCoverage(coverage = {}) {
  const statementsTruncated = coverage.statementsTruncated && typeof coverage.statementsTruncated === 'object'
    ? coverage.statementsTruncated
    : {};
  return {
    ...coverage,
    incompleteRequests: Array.isArray(coverage.incompleteRequests)
      ? coverage.incompleteRequests.map(redactCoverageRequest)
      : [],
    statementsTruncated: {
      ...statementsTruncated,
      requestIds: Array.isArray(statementsTruncated.requestIds)
        ? statementsTruncated.requestIds.map(redactDiagnosticRequestId).filter(Boolean)
        : [],
    },
  };
}

function redactCoverageRequest(entry = {}) {
  return {
    ...entry,
    requestId: redactDiagnosticRequestId(entry.requestId),
  };
}

function aggregateStatements(records) {
  const groups = new Map();

  for (const record of records) {
    if (!Array.isArray(record.statements)) continue;
    for (const statement of record.statements) {
      const key = `${record.route}\u0000${record.phase}\u0000${statement.name}`;
      const existing = groups.get(key) || {
        statement: statement.name,
        route: record.route,
        phase: record.phase,
        count: 0,
        requestIds: new Set(),
        rowsReadTotal: 0,
        rowsWrittenTotal: 0,
        durationMsTotal: 0,
        rowsReadUnknown: 0,
        rowsWrittenUnknown: 0,
        durationMsUnknown: 0,
        durationMsMax: 0,
        statementsTruncated: false,
      };

      existing.count += 1;
      if (record.requestId) existing.requestIds.add(record.requestId);
      if (!addFinite(existing, 'rowsReadTotal', statement.rowsRead)) existing.rowsReadUnknown += 1;
      if (!addFinite(existing, 'rowsWrittenTotal', statement.rowsWritten)) existing.rowsWrittenUnknown += 1;
      if (!addFinite(existing, 'durationMsTotal', statement.durationMs)) {
        existing.durationMsUnknown += 1;
      } else {
        existing.durationMsMax = Math.max(existing.durationMsMax, statement.durationMs);
      }
      if (record.statementsTruncated) existing.statementsTruncated = true;
      groups.set(key, existing);
    }
  }

  return [...groups.values()]
    .map((entry) => ({
      ...entry,
      requestCount: entry.requestIds.size,
      requestIds: [...entry.requestIds].sort(),
      durationMsTotal: Number(entry.durationMsTotal.toFixed(3)),
      durationMsAvg: entry.count > entry.durationMsUnknown
        ? Number((entry.durationMsTotal / (entry.count - entry.durationMsUnknown)).toFixed(3))
        : null,
      durationMsMax: Number(entry.durationMsMax.toFixed(3)),
    }))
    .sort((left, right) => (
      right.durationMsTotal - left.durationMsTotal
      || right.rowsReadTotal - left.rowsReadTotal
      || right.count - left.count
      || left.route.localeCompare(right.route)
      || left.statement.localeCompare(right.statement)
    ))
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}

function normaliseQueryPlanEntries(queryPlan = null) {
  if (!queryPlan) return [];
  if (Array.isArray(queryPlan)) return queryPlan;
  if (Array.isArray(queryPlan.shortlist)) return queryPlan.shortlist;
  if (Array.isArray(queryPlan.recommendations)) return queryPlan.recommendations;
  if (Array.isArray(queryPlan.entries)) return queryPlan.entries;
  return [];
}

function missingQueryPlanFields(entry = {}) {
  return REQUIRED_QUERY_PLAN_FIELDS.filter((field) => {
    const value = entry[field];
    if (typeof value === 'string') return value.trim().length === 0;
    return value == null;
  });
}

function findRankedStatement(ranked, entry = {}) {
  const statement = entry.statement || entry.statementName || entry.name;
  const route = entry.route || entry.endpoint;
  const phase = entry.phase || null;
  return ranked.find((candidate) => (
    candidate.statement === statement
    && (!route || candidate.route === route)
    && (!phase || candidate.phase === phase)
  )) || null;
}

function buildQueryPlanShortlist({ rankedStatements, coverage, queryPlan }) {
  const entries = normaliseQueryPlanEntries(queryPlan);
  const accepted = [];
  const refused = [];

  for (const entry of entries) {
    const statement = entry.statement || entry.statementName || entry.name || null;
    const route = entry.route || entry.endpoint || null;
    const statementId = redactDiagnosticStatementId(statement);
    const queryPlanNoteId = redactDiagnosticQueryPlanNoteId(entry);

    if (!coverage.canRecommendQueryShape) {
      refused.push({
        statementId,
        queryPlanNoteId,
        route,
        reason: 'insufficient-statement-log-coverage',
      });
      continue;
    }

    const missing = missingQueryPlanFields(entry);
    if (missing.length) {
      refused.push({
        statementId,
        queryPlanNoteId,
        route,
        reason: 'missing-query-plan-fields',
        missing,
      });
      continue;
    }

    const observed = findRankedStatement(rankedStatements, entry);
    if (!observed) {
      refused.push({
        statementId,
        queryPlanNoteId,
        route,
        reason: 'statement-not-observed',
      });
      continue;
    }

    accepted.push({
      statementId: redactDiagnosticStatementId(observed.statement),
      queryPlanNoteId,
      route: observed.route,
      phase: observed.phase,
      rank: observed.rank,
      observed: {
        count: observed.count,
        requestCount: observed.requestCount,
        rowsReadTotal: observed.rowsReadTotal,
        rowsWrittenTotal: observed.rowsWrittenTotal,
        durationMsTotal: observed.durationMsTotal,
      },
      noteFieldPresence: queryPlanFieldPresence(entry),
      evidenceSourcePresent: Boolean(entry.evidenceSource),
      operatorNotesPresent: Boolean(entry.operatorNotes),
    });
  }

  const recommendationStatus = coverage.canRecommendQueryShape
    ? (accepted.length ? 'accepted-query-plan-notes' : 'no-query-plan-recommendations')
    : 'refused-incomplete-statement-data';

  return {
    recommendationStatus,
    requiredFields: [...REQUIRED_QUERY_PLAN_FIELDS],
    accepted,
    refused,
  };
}

function queryPlanFieldPresence(entry = {}) {
  return REQUIRED_QUERY_PLAN_FIELDS.reduce((fields, field) => ({
    ...fields,
    [field]: !missingQueryPlanFields(entry).includes(field),
  }), {});
}

function redactRankedStatement(entry = {}) {
  const requestIds = Array.isArray(entry.requestIds)
    ? entry.requestIds.map(redactDiagnosticRequestId).filter(Boolean)
    : [];
  return {
    rank: entry.rank,
    statementId: redactDiagnosticStatementId(entry.statementId || entry.statement),
    route: entry.route,
    phase: entry.phase,
    count: entry.count,
    requestCount: entry.requestCount ?? requestIds.length,
    requestIds,
    rowsReadTotal: entry.rowsReadTotal,
    rowsWrittenTotal: entry.rowsWrittenTotal,
    durationMsTotal: entry.durationMsTotal,
    rowsReadUnknown: entry.rowsReadUnknown,
    rowsWrittenUnknown: entry.rowsWrittenUnknown,
    durationMsUnknown: entry.durationMsUnknown,
    durationMsMax: entry.durationMsMax,
    durationMsAvg: entry.durationMsAvg,
    statementsTruncated: entry.statementsTruncated === true,
  };
}

function redactQueryPlanShortlist(shortlist = {}) {
  const source = shortlist && typeof shortlist === 'object' ? shortlist : {};
  return {
    recommendationStatus: source.recommendationStatus || 'no-query-plan-recommendations',
    requiredFields: Array.isArray(source.requiredFields)
      ? source.requiredFields.filter((entry) => typeof entry === 'string')
      : [...REQUIRED_QUERY_PLAN_FIELDS],
    accepted: Array.isArray(source.accepted)
      ? source.accepted.map(redactAcceptedQueryPlanEntry)
      : [],
    refused: Array.isArray(source.refused)
      ? source.refused.map(redactRefusedQueryPlanEntry)
      : [],
  };
}

function redactAcceptedQueryPlanEntry(entry = {}) {
  return {
    statementId: redactDiagnosticStatementId(entry.statementId || entry.statement),
    queryPlanNoteId: entry.queryPlanNoteId || redactDiagnosticQueryPlanNoteId(entry),
    route: entry.route || null,
    phase: entry.phase || null,
    rank: entry.rank ?? null,
    observed: entry.observed || null,
    noteFieldPresence: entry.noteFieldPresence || queryPlanFieldPresence(entry),
    evidenceSourcePresent: entry.evidenceSourcePresent === true || Boolean(entry.evidenceSource),
    operatorNotesPresent: entry.operatorNotesPresent === true || Boolean(entry.operatorNotes),
  };
}

function redactRefusedQueryPlanEntry(entry = {}) {
  return {
    statementId: redactDiagnosticStatementId(entry.statementId || entry.statement),
    queryPlanNoteId: entry.queryPlanNoteId || redactDiagnosticQueryPlanNoteId(entry),
    route: entry.route || null,
    reason: entry.reason || 'unknown',
    ...(Array.isArray(entry.missing) ? { missing: entry.missing } : {}),
  };
}

export function buildCapacityStatementMap({
  records = [],
  queryPlan = null,
  sourcePaths = [],
  limit = DEFAULT_LIMIT,
  generatedAt = new Date().toISOString(),
} = {}) {
  const normalisedRecords = records.map((record) => normaliseRecord(record, record.sourcePath || null));
  const coverage = buildCoverage(normalisedRecords);
  const rankedStatements = aggregateStatements(normalisedRecords);
  const topStatements = rankedStatements
    .slice(0, Math.max(1, Number(limit) || DEFAULT_LIMIT))
    .map(redactRankedStatement);
  const queryPlanShortlist = buildQueryPlanShortlist({
    rankedStatements,
    coverage,
    queryPlan,
  });

  return {
    schema: 2,
    kind: 'capacity-statement-map',
    generatedAt,
    modellingOnly: true,
    certifying: false,
    redaction: diagnosticRedactionMetadata(),
    sourcePaths: [...sourcePaths],
    coverage: redactCoverage(coverage),
    topStatements,
    statementCount: rankedStatements.length,
    queryPlanShortlist,
  };
}

export function redactCapacityStatementMapReport(report = {}) {
  const source = report && typeof report === 'object' ? report : {};
  return {
    ...source,
    schema: Math.max(2, Number(source.schema) || 2),
    redaction: diagnosticRedactionMetadata(),
    coverage: redactCoverage(source.coverage || {}),
    topStatements: Array.isArray(source.topStatements)
      ? source.topStatements.map(redactRankedStatement)
      : [],
    queryPlanShortlist: redactQueryPlanShortlist(source.queryPlanShortlist || {}),
  };
}

export function parseStatementMapArgs(argv = []) {
  const options = {
    inputPaths: [],
    queryPlanPath: null,
    outputPath: DEFAULT_OUTPUT_PATH,
    limit: DEFAULT_LIMIT,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--input') {
      const value = argv[++i];
      if (!value) throw new Error('--input requires a path');
      options.inputPaths.push(value);
    } else if (arg === '--query-plan') {
      const value = argv[++i];
      if (!value) throw new Error('--query-plan requires a path');
      options.queryPlanPath = value;
    } else if (arg === '--output') {
      const value = argv[++i];
      if (!value) throw new Error('--output requires a path');
      options.outputPath = value;
    } else if (arg === '--limit') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) throw new Error('--limit must be a positive integer');
      options.limit = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function loadQueryPlan(filePath) {
  if (!filePath) return null;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export async function runCapacityStatementMap(argv = process.argv.slice(2), {
  cwd = process.cwd(),
  now = () => new Date(),
} = {}) {
  const options = parseStatementMapArgs(argv);
  if (options.help) {
    return {
      ok: true,
      help: [
        'Usage: node scripts/build-capacity-statement-map.mjs --input <log.jsonl|json> [--input <path> ...] [--query-plan <json>] [--output <json>]',
        'Builds a non-certifying statement hot-path map from capacity.request structured logs or joined correlation fixtures.',
      ].join('\n'),
    };
  }
  if (!options.inputPaths.length) throw new Error('At least one --input path is required');

  const sourcePaths = options.inputPaths.map((filePath) => path.resolve(cwd, filePath));
  for (const sourcePath of sourcePaths) {
    if (!existsSync(sourcePath)) throw new Error(`Input file not found: ${sourcePath}`);
  }

  const records = [];
  for (const sourcePath of sourcePaths) {
    const fileRecords = readStatementMapInput(sourcePath).map((record) => ({
      ...record,
      sourcePath: path.relative(cwd, sourcePath),
    }));
    records.push(...fileRecords);
  }

  const queryPlanPath = options.queryPlanPath ? path.resolve(cwd, options.queryPlanPath) : null;
  const queryPlan = loadQueryPlan(queryPlanPath);
  const report = buildCapacityStatementMap({
    records,
    queryPlan,
    sourcePaths: sourcePaths.map((sourcePath) => path.relative(cwd, sourcePath)),
    limit: options.limit,
    generatedAt: now().toISOString(),
  });

  const outputPath = path.resolve(cwd, options.outputPath);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return { ok: true, outputPath, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCapacityStatementMap().then((result) => {
    if (result.help) {
      console.log(result.help);
      return;
    }
    console.log(JSON.stringify({
      ok: true,
      outputPath: result.outputPath,
      coverage: result.report.coverage.status,
      recommendations: result.report.queryPlanShortlist.recommendationStatus,
    }, null, 2));
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
