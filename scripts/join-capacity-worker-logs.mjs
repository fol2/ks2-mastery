#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  P1_UNCLASSIFIED_INSUFFICIENT_LOGS,
  buildWorkerLogJoinDiagnostics,
} from './lib/capacity-evidence.mjs';

const DEFAULT_SAMPLE_LIMIT = 10;
const MAX_WARNINGS = 20;
const REQUEST_ID_RE = /ks2_req_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const DIAGNOSTIC_REDACTION_VERSION = 'capacity-diagnostics-redaction-v1';
const OPAQUE_HASH_LENGTH = 24;
const OPAQUE_REQUEST_ID_RE = /^req_[0-9a-f]{24}$/;
const OPAQUE_STATEMENT_ID_RE = /^stmt_[0-9a-f]{24}$/;

function usage() {
  return [
    'Usage: node ./scripts/join-capacity-worker-logs.mjs --evidence <path> --logs <path> [--logs <path> ...] --output <path>',
    '',
    'Joins capacity evidence top-tail bootstrap samples with exported Cloudflare Worker invocation',
    'CPU/wall telemetry and sampled capacity.request structured logs. Output is diagnostic-only.',
    '',
    'Options:',
    '  --evidence <path>     Capacity evidence JSON from scripts/classroom-load-test.mjs.',
    '  --logs <path>         JSON or JSONL Workers Logs/Tail/Logpush export. Repeatable.',
    '  --output <path>       Correlation JSON output path.',
    '  --sample-limit <n>    Number of bootstrap top-tail samples to join, default 10.',
    '  --help, -h            Print this usage summary.',
  ].join('\n');
}

export function parseJoinArgs(argv = process.argv.slice(2)) {
  const options = {
    evidencePath: '',
    logPaths: [],
    outputPath: '',
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--evidence') {
      options.evidencePath = readArgValue(argv, index, arg);
      index += 1;
    } else if (arg === '--logs') {
      options.logPaths.push(readArgValue(argv, index, arg));
      index += 1;
    } else if (arg === '--output') {
      options.outputPath = readArgValue(argv, index, arg);
      index += 1;
    } else if (arg === '--sample-limit') {
      const value = Number(readArgValue(argv, index, arg));
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error('--sample-limit must be a positive integer.');
      }
      options.sampleLimit = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function readArgValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${optionName} requires a value.`);
  return value;
}

export function parseWorkerLogExport(content, { sourcePath = 'inline' } = {}) {
  const warnings = [];
  const text = String(content || '').trim();
  if (!text) return { records: [], warnings };

  try {
    const parsed = JSON.parse(text);
    const entries = entriesFromJsonExport(parsed);
    return {
      records: normaliseWorkerLogEntries(entries, warnings),
      warnings,
    };
  } catch {
    // Fall through to JSONL / console-line parsing.
  }

  const streamedEntries = entriesFromPrettyJsonStream(text);
  if (streamedEntries.some((entry) => entry.raw.includes('\n'))) {
    return {
      records: normaliseWorkerLogEntries(streamedEntries.map((entry) => entry.value), warnings),
      warnings,
    };
  }

  const entries = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = parseLogLine(trimmed);
    if (parsed.ok) {
      entries.push(parsed.value);
    } else {
      pushWarning(warnings, `${sourcePath}:${index + 1}: skipped malformed log line`);
    }
  }
  return {
    records: normaliseWorkerLogEntries(entries, warnings),
    warnings,
  };
}

function entriesFromPrettyJsonStream(text) {
  const entries = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (start === -1) {
      if (char === '{') {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const raw = text.slice(start, index + 1);
        try {
          entries.push({ raw, value: JSON.parse(raw) });
        } catch {
          // Ignore partial or non-JSON snippets; line parsing will warn if needed.
        }
        start = -1;
      }
    }
  }
  return entries;
}

function entriesFromJsonExport(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  for (const key of ['records', 'events', 'data', 'result']) {
    if (Array.isArray(parsed[key])) return parsed[key];
  }
  return [parsed];
}

function parseLogLine(line) {
  const candidates = [];
  if (line.startsWith('[ks2-worker]')) candidates.push(line.slice('[ks2-worker]'.length).trim());
  candidates.push(line);
  const objectStart = line.indexOf('{');
  const objectEnd = line.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd > objectStart) {
    candidates.push(line.slice(objectStart, objectEnd + 1));
  }
  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // Try the next candidate.
    }
  }
  return { ok: false };
}

function normaliseWorkerLogEntries(entries, warnings) {
  const records = [];
  for (const [index, entry] of entries.entries()) {
    const next = normaliseWorkerLogEntry(entry, index, warnings);
    records.push(...next);
  }
  return records;
}

function normaliseWorkerLogEntry(entry, index, warnings) {
  if (!entry || typeof entry !== 'object') return [];
  const invocation = extractInvocation(entry);
  const capacityPayloads = extractCapacityPayloads(entry, warnings);
  if (!capacityPayloads.length) {
    return [{
      index,
      requestIds: collectRequestIds(entry),
      timestampMs: invocation.timestampMs,
      invocation,
      capacityRequest: null,
    }];
  }
  return capacityPayloads.map((payload) => ({
    index,
    requestIds: collectRequestIds({ entry, payload }),
    timestampMs: parseTimestampMs(payload.at || payload.timestamp) ?? invocation.timestampMs,
    invocation,
    capacityRequest: normaliseCapacityRequestPayload(payload),
  }));
}

function extractInvocation(entry) {
  const cloudflare = entry.$cloudflare || entry.cloudflare || {};
  const metadata = cloudflare.$metadata || cloudflare.metadata || entry.$metadata || entry.metadata || {};
  const event = entry.event || entry.Event || {};
  const request = entry.request || entry.Request || event.request || event.Request || {};
  const response = entry.response || entry.Response || event.response || event.Response || {};
  const cpuTimeMs = firstFinite(
    entry.CPUTimeMs,
    entry.cpuTimeMs,
    entry.cpu_time_ms,
    entry.cpuTime,
    event.CPUTimeMs,
    event.cpuTimeMs,
    cloudflare.CPUTimeMs,
    cloudflare.cpuTimeMs,
    cloudflare.cpu_time_ms,
    metadata.CPUTimeMs,
    metadata.cpuTimeMs,
    metadata.cpu_time_ms,
  );
  const wallTimeMs = firstFinite(
    entry.WallTimeMs,
    entry.wallTimeMs,
    entry.wall_time_ms,
    entry.wallTime,
    entry.durationMs,
    event.WallTimeMs,
    event.wallTimeMs,
    cloudflare.WallTimeMs,
    cloudflare.wallTimeMs,
    cloudflare.wall_time_ms,
    cloudflare.durationMs,
    metadata.WallTimeMs,
    metadata.wallTimeMs,
    metadata.wall_time_ms,
    metadata.durationMs,
  );
  return {
    cpuTimeMs,
    wallTimeMs,
    outcome: firstString(
      entry.Outcome,
      entry.outcome,
      event.Outcome,
      event.outcome,
      cloudflare.Outcome,
      cloudflare.outcome,
      metadata.Outcome,
      metadata.outcome,
    ),
    timestampMs: parseTimestampMs(
      firstString(
        entry.EventTimestampMs,
        entry.eventTimestampMs,
        entry.eventTimestamp,
        entry.timestamp,
        entry.Timestamp,
        event.EventTimestampMs,
        event.eventTimestampMs,
        event.eventTimestamp,
        event.timestamp,
        cloudflare.EventTimestampMs,
        cloudflare.eventTimestampMs,
        cloudflare.eventTimestamp,
        cloudflare.timestamp,
        metadata.EventTimestampMs,
        metadata.eventTimestampMs,
        metadata.eventTimestamp,
        metadata.timestamp,
      ),
    ),
    method: firstString(entry.method, entry.Method, request.method, request.Method),
    url: firstString(entry.url, entry.URL, request.url, request.URL),
    status: firstFinite(entry.status, entry.Status, response.status, response.Status),
  };
}

function extractCapacityPayloads(entry, warnings) {
  const payloads = [];
  visitCapacityCandidates(entry, payloads, warnings, 0);
  return payloads;
}

function visitCapacityCandidates(value, payloads, warnings, depth) {
  if (depth > 5 || value == null) return;
  if (typeof value === 'string') {
    const parsed = parseCapacityString(value, warnings);
    if (parsed) payloads.push(parsed);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) visitCapacityCandidates(entry, payloads, warnings, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;

  if (value.event === 'capacity.request') {
    payloads.push(value);
    return;
  }
  if (Array.isArray(value.message)) {
    const hasMarker = value.message.some((entry) => entry === 'capacity.request' || String(entry).includes('capacity.request'));
    if (hasMarker) {
      for (const entry of value.message) {
        if (typeof entry !== 'string') continue;
        const parsed = parseCapacityString(entry, warnings);
        if (parsed) payloads.push(parsed);
      }
      const objectPayload = value.message.find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
      if (objectPayload) payloads.push({ event: 'capacity.request', ...objectPayload });
    }
  } else if (typeof value.message === 'string') {
    const parsed = parseCapacityString(value.message, warnings);
    if (parsed) payloads.push(parsed);
  }
  for (const key of ['logs', 'fields', 'log', 'payload']) {
    if (value[key]) visitCapacityCandidates(value[key], payloads, warnings, depth + 1);
  }
}

function parseCapacityString(value, warnings) {
  if (!value.includes('capacity.request')) return null;
  const line = value.startsWith('[ks2-worker]') ? value.slice('[ks2-worker]'.length).trim() : value;
  const start = line.indexOf('{');
  const end = line.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(line.slice(start, end + 1));
    return parsed?.event === 'capacity.request' ? parsed : null;
  } catch {
    pushWarning(warnings, 'skipped malformed capacity.request payload');
    return null;
  }
}

function normaliseCapacityRequestPayload(payload = {}) {
  return {
    requestId: firstString(payload.requestId),
    endpoint: firstString(payload.endpoint),
    method: firstString(payload.method),
    status: firstFinite(payload.status),
    phase: firstString(payload.phase),
    wallMs: firstFinite(payload.wallMs),
    d1DurationMs: firstFinite(payload.d1DurationMs),
    queryCount: firstFinite(payload.queryCount),
    d1RowsRead: firstFinite(payload.d1RowsRead),
    d1RowsWritten: firstFinite(payload.d1RowsWritten),
    responseBytes: firstFinite(payload.responseBytes),
    bootstrapMode: firstString(payload.bootstrapMode),
    statements: Array.isArray(payload.statements)
      ? payload.statements.slice(0, 50).map((entry) => ({
        name: firstString(entry?.name),
        rowsRead: firstFinite(entry?.rowsRead),
        rowsWritten: firstFinite(entry?.rowsWritten),
        durationMs: firstFinite(entry?.durationMs),
      }))
      : [],
    statementsTruncated: payload.statementsTruncated === true,
  };
}

export function joinCapacityWorkerLogs({
  evidence,
  records,
  evidencePath = null,
  logSourcePaths = [],
  generatedAt = new Date().toISOString(),
  sampleLimit = DEFAULT_SAMPLE_LIMIT,
  warnings = [],
} = {}) {
  const topTailSamples = extractBootstrapTopTailSamples(evidence, sampleLimit);
  const recordsById = indexRecordsByRequestId(records || []);
  const joinedSamples = topTailSamples.map((sample) => joinTopTailSample(sample, recordsById));
  const workerLogJoin = buildWorkerLogJoinDiagnostics({
    generatedAt,
    sourceEvidencePath: evidencePath,
    logSourcePaths,
    samples: joinedSamples,
  });
  const joinedWarnings = buildJoinWarnings({ evidence, records: records || [], workerLogJoin, warnings });
  const diagnosticWorkerLogJoin = {
    ...workerLogJoin,
    warnings: joinedWarnings,
  };

  return {
    ok: true,
    kind: 'capacity-worker-log-correlation',
    diagnosticOnly: true,
    generatedAt,
    redaction: diagnosticRedactionMetadata(),
    sourceEvidence: {
      path: evidencePath,
      commit: evidence?.reportMeta?.commit || null,
      startedAt: evidence?.startedAt || evidence?.reportMeta?.startedAt || null,
      finishedAt: evidence?.finishedAt || evidence?.reportMeta?.finishedAt || null,
      learners: evidence?.reportMeta?.learners ?? null,
      bootstrapBurst: evidence?.reportMeta?.bootstrapBurst ?? null,
      rounds: evidence?.reportMeta?.rounds ?? null,
    },
    warnings: joinedWarnings,
    diagnostics: { workerLogJoin: redactWorkerLogJoinDiagnostics(diagnosticWorkerLogJoin) },
  };
}

function buildJoinWarnings({ evidence, records, workerLogJoin, warnings }) {
  const gateWarnings = [];
  pushCaptureWindowWarning(gateWarnings, evidence, records);
  pushCoverageWarning(gateWarnings, workerLogJoin);

  const output = [];
  for (const warning of gateWarnings) pushWarning(output, warning);
  for (const warning of warnings || []) pushWarning(output, warning);
  return output;
}

function pushCaptureWindowWarning(warnings, evidence, records) {
  const startedAt = parseTimestampMs(evidence?.startedAt || evidence?.reportMeta?.startedAt);
  const finishedAt = parseTimestampMs(evidence?.finishedAt || evidence?.reportMeta?.finishedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return;

  const timestamps = records
    .map((record) => record.timestampMs)
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) {
    if (records.length > 0) {
      pushWarning(
        warnings,
        `capture-window-missing-log-timestamps: ${records.length} parsed log records cannot validate evidence window ${new Date(startedAt).toISOString()}..${new Date(finishedAt).toISOString()}`,
      );
    }
    return;
  }

  const logStart = Math.min(...timestamps);
  const logEnd = Math.max(...timestamps);
  if (logEnd < startedAt || logStart > finishedAt) {
    pushWarning(
      warnings,
      `capture-window-no-overlap: log timestamps ${new Date(logStart).toISOString()}..${new Date(logEnd).toISOString()} do not overlap evidence window ${new Date(startedAt).toISOString()}..${new Date(finishedAt).toISOString()}`,
    );
  }
}

function pushCoverageWarning(warnings, workerLogJoin) {
  const coverage = workerLogJoin?.coverage || {};
  const topTailSamples = coverage.topTailSamples || 0;
  if (
    topTailSamples > 0
    && coverage.statementLogs?.matched === topTailSamples
    && coverage.invocation?.matched === 0
  ) {
    pushWarning(
      warnings,
      `insufficient-invocation-coverage: statement logs matched ${topTailSamples}/${topTailSamples} top-tail samples but invocation CPU/wall matched 0/${topTailSamples}`,
    );
  }
}

export function redactWorkerLogJoinReport(report = {}) {
  const workerLogJoin = report?.diagnostics?.workerLogJoin;
  return {
    ...report,
    redaction: diagnosticRedactionMetadata(),
    diagnostics: workerLogJoin
      ? {
        ...report.diagnostics,
        workerLogJoin: redactWorkerLogJoinDiagnostics(workerLogJoin),
      }
      : report.diagnostics,
  };
}

function redactWorkerLogJoinDiagnostics(workerLogJoin = {}) {
  const samples = Array.isArray(workerLogJoin.samples)
    ? workerLogJoin.samples.map(redactWorkerLogJoinSample)
    : [];
  return {
    ...workerLogJoin,
    redaction: diagnosticRedactionMetadata(),
    samples,
  };
}

function redactWorkerLogJoinSample(sample = {}) {
  return {
    ...sample,
    requestId: redactDiagnosticRequestId(sample.requestId),
    clientRequestId: redactDiagnosticRequestId(sample.clientRequestId),
    capacityRequest: redactCapacityRequestDiagnostic(sample.capacityRequest),
  };
}

function redactCapacityRequestDiagnostic(capacityRequest = {}) {
  const source = capacityRequest && typeof capacityRequest === 'object' ? capacityRequest : {};
  const statements = Array.isArray(source.statements)
    ? source.statements.map(redactStatementDiagnostic)
    : [];
  return {
    ...source,
    statementCount: statements.length,
    statements,
  };
}

function redactStatementDiagnostic(statement = {}) {
  const source = statement && typeof statement === 'object' ? statement : {};
  return {
    statementId: redactDiagnosticStatementId(source.statementId || source.name),
    rowsRead: source.rowsRead ?? null,
    rowsWritten: source.rowsWritten ?? null,
    durationMs: source.durationMs ?? null,
  };
}

function diagnosticRedactionMetadata() {
  return {
    version: DIAGNOSTIC_REDACTION_VERSION,
    requestIds: `sha256:${OPAQUE_HASH_LENGTH}`,
    statementIds: `sha256:${OPAQUE_HASH_LENGTH}`,
    rawRequestIdsPersisted: false,
    rawStatementNamesPersisted: false,
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

function hashDiagnosticValue(kind, value) {
  return createHash('sha256')
    .update(`${DIAGNOSTIC_REDACTION_VERSION}:${kind}:${value}`)
    .digest('hex')
    .slice(0, OPAQUE_HASH_LENGTH);
}

function extractBootstrapTopTailSamples(evidence, sampleLimit) {
  const endpoints = evidence?.summary?.endpoints || {};
  const samples = [];
  for (const [endpointKey, metrics] of Object.entries(endpoints)) {
    if (!endpointKey.endsWith('/api/bootstrap')) continue;
    const [method, ...pathParts] = endpointKey.split(' ');
    const endpoint = pathParts.join(' ') || '/api/bootstrap';
    for (const sample of metrics?.topTailSamples || []) {
      samples.push({
        method: sample.method || method || 'GET',
        endpoint: sample.endpoint || endpoint,
        ...sample,
      });
    }
  }
  return samples
    .sort((left, right) => (Number(right.wallMs) || 0) - (Number(left.wallMs) || 0))
    .slice(0, sampleLimit);
}

function indexRecordsByRequestId(records) {
  const index = new Map();
  for (const record of records) {
    for (const requestId of record.requestIds || []) {
      const keys = [requestId, redactDiagnosticRequestId(requestId)]
        .filter((entry, index, values) => entry && values.indexOf(entry) === index);
      for (const key of keys) {
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(record);
      }
    }
  }
  for (const entries of index.values()) {
    entries.sort((left, right) => (left.timestampMs || 0) - (right.timestampMs || 0));
  }
  return index;
}

function joinTopTailSample(sample, recordsById) {
  const requestIds = sampleRequestIds(sample);
  const candidateRecords = requestIds.flatMap((requestId) => recordsById.get(requestId) || []);
  const invocationPick = selectBestRecord(candidateRecords, (record) => (
    Number.isFinite(record.invocation?.cpuTimeMs) || Number.isFinite(record.invocation?.wallTimeMs)
  ), sample);
  const capacityPick = selectBestRecord(candidateRecords, (record) => Boolean(record.capacityRequest), sample);
  const notes = [...invocationPick.notes, ...capacityPick.notes];
  const invocation = invocationPick.record?.invocation || {};
  const capacityRequest = capacityPick.record?.capacityRequest || null;
  const invocationJoinStatus = Number.isFinite(invocation.cpuTimeMs) && Number.isFinite(invocation.wallTimeMs)
    ? 'matched'
    : invocationPick.record
      ? 'partial'
      : 'missing';
  const capacityRequestJoinStatus = capacityRequest
    ? capacityRequest.statements.length > 0
      ? 'matched'
      : 'partial'
    : 'missing';
  const classification = classifyJoinedTailSample({
    sample,
    invocation,
    capacityRequest,
    invocationJoinStatus,
    capacityRequestJoinStatus,
  });

  return {
    requestId: sample.serverRequestId || sample.requestId || null,
    clientRequestId: sample.clientRequestId || null,
    endpoint: sample.endpoint || '/api/bootstrap',
    method: sample.method || 'GET',
    status: sample.status ?? null,
    scenario: sample.scenario || null,
    wallMs: sample.wallMs ?? null,
    responseBytes: sample.responseBytes ?? null,
    queryCount: sample.queryCount ?? null,
    d1RowsRead: sample.d1RowsRead ?? null,
    d1RowsWritten: sample.d1RowsWritten ?? null,
    serverWallMs: sample.serverWallMs ?? null,
    bootstrapMode: sample.bootstrapMode || null,
    invocationJoinStatus,
    invocationJoinReason: invocationJoinStatus === 'missing' ? 'no-matching-invocation-log' : null,
    capacityRequestJoinStatus,
    capacityRequestJoinReason: capacityRequestJoinStatus === 'missing'
      ? 'no-matching-capacity-request-log'
      : capacityRequestJoinStatus === 'partial'
        ? 'capacity-request-log-has-no-statement-breakdown'
        : null,
    cloudflare: {
      cpuTimeMs: invocation.cpuTimeMs ?? null,
      wallTimeMs: invocation.wallTimeMs ?? null,
      outcome: invocation.outcome || null,
    },
    capacityRequest: capacityRequest || {},
    joinNotes: notes,
    classification: classification.classification,
    classificationReason: classification.reason,
  };
}

function sampleRequestIds(sample = {}) {
  const ids = [];
  if (sample.serverRequestId) ids.push(sample.serverRequestId);
  if (sample.requestId && sample.requestId !== sample.serverRequestId) ids.push(sample.requestId);
  if (
    sample.clientRequestId
    && sample.serverRequestId
    && sample.clientRequestId === sample.serverRequestId
  ) {
    ids.push(sample.clientRequestId);
  }
  return [...new Set(ids)];
}

function selectBestRecord(records, predicate, sample) {
  const matches = records.filter(predicate);
  if (!matches.length) return { record: null, notes: [] };
  const targetTimestamp = parseTimestampMs(sample.at || sample.timestamp || sample.startedAt);
  const sorted = [...matches].sort((left, right) => {
    if (targetTimestamp != null) {
      return Math.abs((left.timestampMs || 0) - targetTimestamp) - Math.abs((right.timestampMs || 0) - targetTimestamp);
    }
    return (left.timestampMs || 0) - (right.timestampMs || 0);
  });
  const notes = matches.length > 1 ? [`duplicate-log-records:${matches.length}`] : [];
  if (matches.length > 1 && targetTimestamp == null) notes.push('duplicate-selection:first-by-timestamp');
  return { record: sorted[0], notes };
}

function classifyJoinedTailSample({
  sample,
  invocation,
  capacityRequest,
  invocationJoinStatus,
  capacityRequestJoinStatus,
}) {
  const appWallMs = firstFinite(sample.wallMs);
  const responseBytes = firstFinite(sample.responseBytes);
  const cpuTimeMs = firstFinite(invocation.cpuTimeMs);
  const workerWallMs = firstFinite(invocation.wallTimeMs);
  if (invocationJoinStatus !== 'matched' || cpuTimeMs == null || workerWallMs == null) {
    return {
      classification: P1_UNCLASSIFIED_INSUFFICIENT_LOGS,
      reason: 'Cloudflare invocation CPU/wall log is missing for this top-tail request.',
    };
  }
  if (capacityRequestJoinStatus !== 'matched') {
    return {
      classification: 'partial-invocation-only',
      reason: 'Invocation CPU/wall joined, but sampled capacity.request statement details are absent.',
    };
  }

  const d1DurationMs = firstFinite(capacityRequest?.d1DurationMs);
  if (d1DurationMs != null && d1DurationMs >= Math.max(50, workerWallMs * 0.5)) {
    return {
      classification: 'd1-dominated',
      reason: 'D1 duration accounts for at least half of joined Worker wall time.',
    };
  }
  if (cpuTimeMs >= 8 || cpuTimeMs >= Math.max(5, workerWallMs * 0.5)) {
    return {
      classification: 'worker-cpu-dominated',
      reason: 'Worker CPU is near the Free-plan budget or dominates Worker wall time.',
    };
  }
  if (responseBytes != null && responseBytes >= 500_000) {
    return {
      classification: 'payload-size-pressure',
      reason: 'Bootstrap payload size is close to the classroom evidence cap.',
    };
  }
  if (appWallMs != null && appWallMs - workerWallMs >= Math.max(100, workerWallMs * 0.2)) {
    return {
      classification: 'client-network-or-platform-overhead',
      reason: 'Client-observed wall time materially exceeds joined Worker wall time.',
    };
  }
  return {
    classification: 'mixed-no-single-dominant-resource',
    reason: 'No single joined resource explains the top-tail sample.',
  };
}

function collectRequestIds(value) {
  const ids = new Set();
  const scan = (entry, depth = 0) => {
    if (depth > 5 || entry == null) return;
    if (typeof entry === 'string') {
      for (const match of entry.matchAll(REQUEST_ID_RE)) ids.add(match[0]);
      return;
    }
    if (Array.isArray(entry)) {
      for (const child of entry) scan(child, depth + 1);
      return;
    }
    if (typeof entry !== 'object') return;
    for (const [key, child] of Object.entries(entry)) {
      if (/request.?id/i.test(key) && typeof child === 'string') {
        if (child) ids.add(child);
        for (const match of child.matchAll(REQUEST_ID_RE)) ids.add(match[0]);
      } else {
        scan(child, depth + 1);
      }
    }
  };
  scan(value);
  return [...ids];
}

function firstFinite(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function parseTimestampMs(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric > 10_000_000_000 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function pushWarning(warnings, message) {
  if (warnings.length < MAX_WARNINGS) warnings.push(message);
}

export function runJoinCapacityWorkerLogs(argv = process.argv.slice(2)) {
  const options = parseJoinArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (!options.evidencePath) throw new Error('--evidence is required.');
  if (!options.logPaths.length) throw new Error('At least one --logs path is required.');
  if (!options.outputPath) throw new Error('--output is required.');

  const evidence = JSON.parse(readFileSync(options.evidencePath, 'utf8'));
  const records = [];
  const warnings = [];
  for (const logPath of options.logPaths) {
    const parsed = parseWorkerLogExport(readFileSync(logPath, 'utf8'), { sourcePath: logPath });
    records.push(...parsed.records);
    warnings.push(...parsed.warnings);
  }

  const output = joinCapacityWorkerLogs({
    evidence,
    records,
    evidencePath: options.evidencePath,
    logSourcePaths: options.logPaths,
    sampleLimit: options.sampleLimit,
    warnings,
  });
  const absoluteOutput = resolve(process.cwd(), options.outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, JSON.stringify(output, null, 2));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runJoinCapacityWorkerLogs();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 2;
  }
}
