// Phase 4 U9 — Worker-side `record-event` command handler + query helper.
//
// This module is the Worker half of the telemetry pipeline that U4
// shipped client-side. Responsibilities:
//
//   1. Per-kind payload allowlist enforcement (plan R10 HIGH). Unknown
//      fields are REJECTED with a 400, not scrubbed. Wrong-type fields
//      are REJECTED with a 400. A compromised or buggy client cannot
//      smuggle PII (answer text, prompt text) through a denylist.
//
//   2. `assertNoPunctuationEventForbiddenKeys` defence-in-depth. Even
//      when every field is on the allowlist the payload is re-scanned
//      against the shared `FORBIDDEN_READ_MODEL_KEYS` set so any future
//      allowlist addition that accidentally matches a forbidden key
//      (e.g. a payload named `rubric` or `validator`) trips the
//      existing fail-closed wall instead of landing in D1.
//
//   3. Feature flag `env.PUNCTUATION_EVENTS_ENABLED`. When off the
//      handler still runs the full authz + allowlist chain (so a
//      misbehaving client is still reported as 400-class when it sends
//      garbage) but skips the D1 insert. The response reports
//      `{enabled: false, recorded: false}` so dev consoles can tell
//      "flag off" apart from "write succeeded".
//
//   4. D1 write via `batch()` per project memory
//      (`project_d1_atomicity_batch_vs_withtransaction` —
//      `withTransaction` is a production no-op). The write is a single
//      INSERT but goes through `batch()` for parity with the canonical
//      `saveMonsterVisualConfigDraft` template.
//
// Authz invariant: this handler is invoked inside the
// `runSubjectCommandMutation` applyCommand closure, so
// `requireLearnerWriteAccess` has already fired. The handler is NOT
// reachable via any other route, and no codepath inside this module
// calls `env.DB.prepare('INSERT …')` directly from outside that
// closure.

import {
  isPunctuationTelemetryEventKind,
  isPunctuationTelemetryErrorCode,
  PUNCTUATION_TELEMETRY_ERROR_CODES,
  PUNCTUATION_TELEMETRY_PAYLOAD_ALLOWLIST,
  PUNCTUATION_TELEMETRY_FIELD_TYPES_BY_KIND,
  PUNCTUATION_TELEMETRY_FIELD_SETS,
} from '../../../../shared/punctuation/telemetry-shapes.js';
import { BadRequestError, BackendUnavailableError } from '../../errors.js';
import { batch, bindStatement } from '../../d1.js';

// Phase 6 U9 → Phase 7 U6 — Per-session / rolling-window rate limiting.
//
// Per-session kinds: a generous cap (50 events per session per kind = 600
// per session across all 12 kinds) that stops a runaway or compromised
// client from flooding the D1 ingest path. Legitimate sessions (20-30
// items) never approach the limit. The sessionId is extracted from the
// inner sanitised payload for kinds that carry one (answer-submitted,
// first-item-rendered, feedback-rendered, summary-reached).
//
// Sessionless kinds (P7-U6): for kinds without a sessionId the cap scopes
// to a rolling 7-day window of (learner_id, event_kind). Previously this
// was a lifetime per-learner cap which permanently rate-limited learners
// after normal long-term use. The rolling window uses
// `AND occurred_at_ms > ?` with `Date.now() - 7 * 86400000` — epoch ms
// arithmetic against the `occurred_at_ms INTEGER` column. The composite
// index `idx_punctuation_events_learner_kind_time` covers
// `(learner_id, event_kind, occurred_at_ms DESC)` so the added range
// clause narrows the scan.
//
// When the cap is hit the handler returns a success response with
// `{recorded: false, rateLimited: true}` — the client's fire-and-forget
// contract is preserved (no error surface).

/**
 * Maximum number of telemetry events a single session may emit per
 * event kind. 50 × 12 kinds = 600 events per session ceiling.
 */
export const MAX_TELEMETRY_EVENTS_PER_SESSION_PER_KIND = 50;

// Mirrors the set in worker/src/subjects/punctuation/read-models.js so
// a payload with a field name that matches a server-only read-model
// key (e.g. `rubric`, `validator`) is rejected even if a future
// allowlist extension accidentally adds the name. Defence-in-depth.
const FORBIDDEN_PUNCTUATION_EVENT_PAYLOAD_KEYS = new Set([
  'accepted',
  'answers',
  'correctIndex',
  'rubric',
  'validator',
  'seed',
  'generator',
  'hiddenQueue',
  'unpublished',
  'rawGenerator',
  'queueItemIds',
  'responses',
  // Extra PII guards: even if a future allowlist extension names a
  // field these exact strings, the payload is rejected.
  'answerText',
  'promptText',
  'typed',
]);

// Per-kind payload byte cap (defence-in-depth against oversized
// payloads slipping past the per-field string cap on the client).
const MAX_PAYLOAD_JSON_BYTES = 4 * 1024;

// Per-field string cap (matches the client emitter's 256 char slice).
const MAX_STRING_FIELD_LENGTH = 256;

function envFlagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

/**
 * `true` when `env.PUNCTUATION_EVENTS_ENABLED` is set to a truthy
 * string (`'1'`, `'true'`, `'yes'`, `'on'`). Default OFF — a new
 * environment must explicitly opt in. This matches
 * `PUNCTUATION_SUBJECT_ENABLED` semantics from app.js.
 */
export function isPunctuationEventsEnabled(env = {}) {
  return envFlagEnabled(env?.PUNCTUATION_EVENTS_ENABLED);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Throws BadRequestError with `punctuation_event_field_rejected` when
 * the payload contains ANY forbidden key. Called AFTER the allowlist
 * check so an allowlisted field can never mask a forbidden-key match
 * — the wall fires first regardless.
 */
function assertNoPunctuationEventForbiddenKeys(payload, { kind }) {
  if (!isPlainObject(payload)) return;
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_PUNCTUATION_EVENT_PAYLOAD_KEYS.has(key)) {
      throw new BadRequestError(`Punctuation telemetry payload field is forbidden: ${key}`, {
        code: 'punctuation_event_field_rejected',
        rejectedField: key,
        reason: 'forbidden_key',
        eventKind: kind,
      });
    }
  }
}

function assertPayloadShape({ kind, payload }) {
  const allowedFields = PUNCTUATION_TELEMETRY_PAYLOAD_ALLOWLIST[kind];
  const allowedSet = PUNCTUATION_TELEMETRY_FIELD_SETS[kind];
  const candidate = isPlainObject(payload) ? payload : {};

  // 1. Forbidden-key scan (runs before the allowlist so a known-PII key
  //    is rejected even when future allowlist drift adds the name).
  assertNoPunctuationEventForbiddenKeys(candidate, { kind });

  // 2. Allowlist check: every sent key must be on the kind's list.
  for (const key of Object.keys(candidate)) {
    if (!allowedSet.has(key)) {
      throw new BadRequestError(`Punctuation telemetry payload field not allowed for ${kind}: ${key}`, {
        code: 'punctuation_event_field_rejected',
        rejectedField: key,
        allowedFields: [...allowedFields],
        eventKind: kind,
      });
    }
  }

  // 3. Type check on each present field (arrays and objects not
  //    allowed — the allowlist carries primitives only). Per-kind
  //    types because names like `correct` legitimately differ across
  //    kinds (boolean on answer-submitted, number on summary-reached).
  const fieldTypes = PUNCTUATION_TELEMETRY_FIELD_TYPES_BY_KIND[kind] || {};
  const sanitised = {};
  for (const field of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(candidate, field)) continue;
    const raw = candidate[field];
    if (raw === null || raw === undefined) continue;
    const expectedType = fieldTypes[field];
    const actualType = typeof raw;
    if (expectedType && actualType !== expectedType) {
      throw new BadRequestError(
        `Punctuation telemetry field ${field} expected ${expectedType}, got ${actualType}`,
        {
          code: 'punctuation_event_field_type_invalid',
          rejectedField: field,
          expectedType,
          actualType,
          eventKind: kind,
        },
      );
    }
    if (actualType === 'number' && !Number.isFinite(raw)) {
      throw new BadRequestError(`Punctuation telemetry field ${field} is not finite`, {
        code: 'punctuation_event_field_type_invalid',
        rejectedField: field,
        eventKind: kind,
      });
    }
    if (actualType === 'string') {
      sanitised[field] = raw.length > MAX_STRING_FIELD_LENGTH
        ? raw.slice(0, MAX_STRING_FIELD_LENGTH)
        : raw;
    } else {
      sanitised[field] = raw;
    }
  }

  // Review follow-on 2026-04-26: `command-failed.errorCode` is restricted
  // to the sanctioned enum. A free-form 256-char string is a sibling PII
  // smuggling vector to the `errorMessage` field the forbidden-key list
  // already blocks; enforcing a closed set closes that gap without losing
  // the dimension operators need for classifying failures.
  if (kind === 'command-failed'
    && Object.prototype.hasOwnProperty.call(sanitised, 'errorCode')
    && !isPunctuationTelemetryErrorCode(sanitised.errorCode)) {
    throw new BadRequestError(
      'Punctuation telemetry errorCode is not on the sanctioned enum.',
      {
        code: 'punctuation_event_errorcode_not_allowed',
        rejectedField: 'errorCode',
        allowedValues: [...PUNCTUATION_TELEMETRY_ERROR_CODES],
        eventKind: kind,
      },
    );
  }

  return sanitised;
}

/**
 * Apply the `record-event` command. Runs inside the
 * `runSubjectCommandMutation` applyCommand closure, so
 * `requireLearnerWriteAccess` has already fired for `command.learnerId`.
 *
 * Returns a command-shaped response with `changed: false` so the
 * repository helper treats the call as an OBSERVED (no-op) mutation:
 * no learner revision bump, no mutation-receipt write. Matches the
 * fire-and-forget telemetry contract.
 *
 * Retry idempotency (review follow-on 2026-04-26): the D1 insert uses
 * `INSERT OR IGNORE` against the `(learner_id, request_id)` UNIQUE
 * index, so a retried `requestId` no longer writes a second row. The
 * handler reports `{recorded: false, deduped: true}` when the insert
 * was ignored — callers who care (operators inspecting the response
 * shape) can tell a dedupe from a first write, but the fire-and-forget
 * client never observes a difference.
 */
export async function applyRecordEventCommand({ command, context }) {
  const env = context?.env || {};
  const now = Number.isFinite(Number(context?.now)) ? Number(context.now) : Date.now();

  // The HTTP contract wraps the client's `{event, payload}` emit inside
  // the standard subject-command payload envelope. Both key names are
  // accepted for forward compatibility with the client emitter which
  // calls the field `event`.
  const raw = isPlainObject(command?.payload) ? command.payload : {};
  const kind = typeof raw.event === 'string' && raw.event
    ? raw.event
    : (typeof raw.kind === 'string' ? raw.kind : '');
  const innerPayload = isPlainObject(raw.payload) ? raw.payload : {};

  if (!isPunctuationTelemetryEventKind(kind)) {
    throw new BadRequestError('Punctuation telemetry event kind is not recognised.', {
      code: 'punctuation_event_unknown_kind',
      eventKind: kind || null,
    });
  }

  const sanitisedPayload = assertPayloadShape({ kind, payload: innerPayload });

  const payloadJson = JSON.stringify(sanitisedPayload);
  if (payloadJson.length > MAX_PAYLOAD_JSON_BYTES) {
    throw new BadRequestError('Punctuation telemetry payload is too large.', {
      code: 'punctuation_event_payload_too_large',
      eventKind: kind,
      size: payloadJson.length,
      limit: MAX_PAYLOAD_JSON_BYTES,
    });
  }

  if (!isPunctuationEventsEnabled(env)) {
    // Feature flag off — no D1 write, but still report the
    // allowlist-validated shape so the client emitter can confirm
    // the server accepted the emit.
    return {
      learnerId: command.learnerId,
      ok: true,
      changed: false,
      enabled: false,
      recorded: false,
      eventKind: kind,
    };
  }

  if (!env.DB || typeof env.DB.prepare !== 'function') {
    throw new BackendUnavailableError(
      'D1 binding DB is required to record punctuation telemetry events.',
      { code: 'punctuation_event_db_unavailable' },
    );
  }

  // Phase 6 U9 — Per-session rate limiting (R16). Extract sessionId from
  // the sanitised payload (for kinds that carry it) and count existing
  // events for (learner_id, event_kind, sessionId). For kinds without a
  // sessionId the count scopes to (learner_id, event_kind) alone. When
  // the cap is hit, return success with `rateLimited: true` — silent drop.
  const sessionId = typeof sanitisedPayload.sessionId === 'string' && sanitisedPayload.sessionId
    ? sanitisedPayload.sessionId
    : null;
  const existingCount = await countExistingEventsForRateLimit(
    env.DB,
    command.learnerId,
    kind,
    sessionId,
    now,
  );
  if (existingCount >= MAX_TELEMETRY_EVENTS_PER_SESSION_PER_KIND) {
    return {
      learnerId: command.learnerId,
      ok: true,
      changed: false,
      enabled: true,
      recorded: false,
      rateLimited: true,
      eventKind: kind,
    };
  }

  // Review follow-on 2026-04-26: dedupe retries via
  // `(learner_id, request_id)` UNIQUE index. `INSERT OR IGNORE` silently
  // drops the second write so a retried client never creates a duplicate
  // row. `command.requestId` is the envelope-validated id
  // `normaliseSubjectCommandRequest` guarantees; we treat an empty id
  // as "legacy / no dedup" and let the insert proceed with NULL (the
  // UNIQUE index is `WHERE request_id IS NOT NULL` so NULLs are free).
  const requestId = typeof command?.requestId === 'string' && command.requestId
    ? command.requestId
    : null;

  // D1 write via batch() per project memory
  // (`project_d1_atomicity_batch_vs_withtransaction`). A single INSERT
  // does not strictly need a batch, but wrapping it in `batch()` matches
  // the canonical `saveMonsterVisualConfigDraft` template and keeps the
  // write path uniform for a future multi-statement extension
  // (e.g. sequence counter row).
  const results = await batch(env.DB, [
    bindStatement(env.DB, `
      INSERT OR IGNORE INTO punctuation_events (
        learner_id, event_kind, payload_json, release_id, request_id, occurred_at_ms, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      command.learnerId,
      kind,
      payloadJson,
      null, // release_id — reserved for future release-scoped filtering
      requestId,
      now,
      now,
    ]),
  ]);

  // `meta.changes` is 0 when `INSERT OR IGNORE` dropped the row because
  // the UNIQUE constraint fired; 1 on a fresh insert. We expose a
  // `deduped` flag for operators who inspect the response shape. The
  // default `recorded` contract stays true for backwards compat so
  // existing tests keep passing.
  const insertMeta = Array.isArray(results) && results[0]?.meta ? results[0].meta : null;
  const changesRaw = insertMeta && Object.prototype.hasOwnProperty.call(insertMeta, 'changes')
    ? Number(insertMeta.changes)
    : null;
  const deduped = Number.isFinite(changesRaw) ? changesRaw === 0 : false;

  return {
    learnerId: command.learnerId,
    ok: true,
    changed: false,
    enabled: true,
    recorded: !deduped,
    deduped,
    eventKind: kind,
    occurredAtMs: now,
  };
}

/**
 * Rolling 7-day window duration in milliseconds.
 * Sessionless telemetry kinds are rate-limited within this window
 * rather than against all-time counts, so a learner is never
 * permanently rate-limited for normal long-term use.
 */
export const SESSIONLESS_RATE_LIMIT_WINDOW_MS = 7 * 86_400_000;

/**
 * Count existing events in `punctuation_events` for the rate limiter.
 *
 * When `sessionId` is non-null, the count scopes to events whose stored
 * `payload_json` contains the same `sessionId` via `json_extract`. When
 * `sessionId` is null (the event kind does not carry one), the count
 * scopes to a rolling 7-day window of `(learner_id, event_kind)` using
 * the `occurred_at_ms` column (epoch ms). This replaces the previous
 * lifetime count which permanently rate-limited learners after 50
 * cumulative events.
 *
 * The query uses the `idx_punctuation_events_learner_kind_time` index
 * for the `(learner_id, event_kind, occurred_at_ms DESC)` prefix so
 * the added range clause narrows the scan rather than widening it.
 *
 * `nowMs` allows test injection; defaults to `Date.now()`.
 */
async function countExistingEventsForRateLimit(db, learnerId, eventKind, sessionId, nowMs = Date.now()) {
  if (sessionId) {
    const result = await db.prepare(`
      SELECT COUNT(*) AS n FROM punctuation_events
      WHERE learner_id = ? AND event_kind = ?
        AND json_extract(payload_json, '$.sessionId') = ?
    `).bind(learnerId, eventKind, sessionId).first();
    return Number(result?.n) || 0;
  }
  // P7-U6: rolling 7-day window instead of lifetime count.
  const windowStart = nowMs - SESSIONLESS_RATE_LIMIT_WINDOW_MS;
  const result = await db.prepare(`
    SELECT COUNT(*) AS n FROM punctuation_events
    WHERE learner_id = ? AND event_kind = ?
      AND occurred_at_ms > ?
  `).bind(learnerId, eventKind, windowStart).first();
  return Number(result?.n) || 0;
}

/**
 * Hard ceiling on event timeline reads (P7-U6 R4). Even when the caller
 * passes `limit: 1000`, the query never exceeds this bound. Prevents
 * unbounded scans of the events table.
 */
const EVENT_TIMELINE_READ_HARD_LIMIT = 500;

/**
 * Read punctuation events for a learner. Invoked by the query
 * endpoint after `requireLearnerReadAccess` has fired in the
 * repository helper.
 *
 * `limit` is clamped to [1, 500] with a default of 100. The hard
 * ceiling is `EVENT_TIMELINE_READ_HARD_LIMIT` (500) per P7-U6 R4
 * ("bounded and audited").
 *
 * Review follow-on 2026-04-26:
 *   - Unknown `kind` values now raise a 400 `punctuation_event_unknown_kind`
 *     (FINDING A). Previously they were silently dropped from the WHERE
 *     clause, which returned the learner's entire dump — a surprising
 *     behaviour for a caller who thought they were scoping by kind.
 *   - The ORDER BY adds `id DESC` as a tiebreaker on `occurred_at_ms`
 *     so same-ms events (handler emits back-to-back with the same
 *     `context.now`) return in deterministic insertion order.
 *
 * P7-U6: `audit` callback. When provided, called after the query with
 * `{ learnerId, kind, appliedLimit, resultCount, readAtMs }` so the
 * caller (repository layer) can record the read in the ops audit surface.
 */
export async function listPunctuationEvents({
  db,
  learnerId,
  kind = null,
  sinceMs = null,
  limit = null,
  audit = null,
}) {
  const cleanLearner = typeof learnerId === 'string' ? learnerId : '';
  if (!cleanLearner) {
    return { events: [], appliedLimit: 0 };
  }
  const appliedLimit = clampLimit(limit);
  const clauses = ['learner_id = ?'];
  const params = [cleanLearner];
  if (kind) {
    // FINDING A (review follow-on): reject an unknown kind with 400 so
    // the caller is told their filter was not applied. The previous
    // silent-drop behaviour returned the learner's full event dump,
    // which could be interpreted as "this kind has no events" — a
    // dangerous ambiguity for anyone triaging from the Worker logs.
    if (!isPunctuationTelemetryEventKind(kind)) {
      throw new BadRequestError(
        'Punctuation telemetry query kind is not recognised.',
        {
          code: 'punctuation_event_unknown_kind',
          eventKind: kind,
        },
      );
    }
    clauses.push('event_kind = ?');
    params.push(kind);
  }
  if (Number.isFinite(Number(sinceMs))) {
    clauses.push('occurred_at_ms >= ?');
    params.push(Number(sinceMs));
  }
  params.push(appliedLimit);
  const sql = `
    SELECT event_kind, payload_json, occurred_at_ms
    FROM punctuation_events
    WHERE ${clauses.join(' AND ')}
    ORDER BY occurred_at_ms DESC, id DESC
    LIMIT ?
  `;
  const result = await db.prepare(sql).bind(...params).all();
  const rows = Array.isArray(result?.results) ? result.results : [];

  const events = rows.map((row) => ({
    kind: row.event_kind,
    occurredAtMs: Number(row.occurred_at_ms) || 0,
    payload: safeParseJson(row.payload_json),
  }));

  // P7-U6: fire audit callback so the repository layer can record
  // this read in the ops audit surface. Best-effort — audit failures
  // must not break the read path.
  if (typeof audit === 'function') {
    try {
      await audit({
        learnerId: cleanLearner,
        kind: kind || null,
        appliedLimit,
        resultCount: events.length,
        readAtMs: Date.now(),
      });
    } catch {
      // Audit write failure is non-fatal — the read still returns.
    }
  }

  return {
    appliedLimit,
    events,
  };
}

function clampLimit(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return 100;
  if (raw > EVENT_TIMELINE_READ_HARD_LIMIT) return EVENT_TIMELINE_READ_HARD_LIMIT;
  return Math.floor(raw);
}

function safeParseJson(value) {
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
