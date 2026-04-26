// Phase 4 U4 — Punctuation telemetry emitter (client half).
//
// Ships the client-side `emitPunctuationEvent(kind, payload, context)`
// helper plus the 12-kind event whitelist and per-kind payload allowlist
// (plan R10). The emitter validates client-side before dispatching
// `punctuation-record-event` through the subject-command-actions mapping.
//
// U9 (shipped) lands the Worker `record-event` command handler, the D1
// `punctuation_events` table, the per-event shape enforcement at the
// Worker boundary, the feature flag, and the docs rewrite. Both halves
// now read their allowlist from `shared/punctuation/telemetry-shapes.js`
// so any future allowlist extension lands atomically for both.
//
// Authz invariant (R10 / R11): the `{ mutates: false }` flag on the
// `punctuation-record-event` mapping is CLIENT-SIDE ONLY. It bypasses
// the subject-command-actions read-only guard and keeps the dispatch off
// the `runPunctuationSessionCommand` pending-wrapper path (so telemetry
// emission never stalls the child's interaction). It does NOT bypass
// Worker-side authz: when U9 lands, `repository.runSubjectCommand` still
// invokes `requireLearnerWriteAccess` at `worker/src/repository.js:4919`.
// Any implementation shortcut that calls `env.DB.prepare('INSERT ...')`
// directly from a request handler without routing through
// `repository.runSubjectCommand` would be a security regression.
//
// Per-event-kind allowlist (HIGH security): each of the 12 event kinds
// has an explicit property allowlist. Catch-all sanitisers are rejected
// on security grounds (a compromised client could smuggle answer text or
// prompt text through a denylist). The `answer-submitted` allowlist
// explicitly excludes `answerText`, `promptText`, and `typed`.

// U9 SHARED ALLOWLIST (plan R10): the frozen event kinds + per-kind
// payload allowlist now live at `shared/punctuation/telemetry-shapes.js`
// so the Worker handler (U9) and the client emitter (this file, U4)
// read from the same source of truth. Additive extensions to the
// allowlist land atomically for both halves — preventing the
// test-harness-vs-production drift defect flagged in the project memory.
import {
  PUNCTUATION_TELEMETRY_EVENT_KINDS,
  PUNCTUATION_TELEMETRY_PAYLOAD_ALLOWLIST,
  isPunctuationTelemetryEventKind,
} from '../../../shared/punctuation/telemetry-shapes.js';

// Re-export for callers that imported the constants from here during U4.
// No client is known to import these directly (the sanitiser below is
// the public surface), but the re-export preserves the U4 wire contract.
export { PUNCTUATION_TELEMETRY_EVENT_KINDS, PUNCTUATION_TELEMETRY_PAYLOAD_ALLOWLIST };

const PAYLOAD_ALLOWLIST = PUNCTUATION_TELEMETRY_PAYLOAD_ALLOWLIST;

// Strip every field that is not on the per-kind allowlist. Returns a
// fresh plain object so callers cannot mutate the internal allowlist
// table. Oversized string fields are capped (256 chars) so a rogue
// caller cannot push unbounded payloads at the Worker. Non-string /
// non-number / non-boolean values are dropped — the Worker allowlist
// (U9) re-validates types, but the client emitter is the first defence.
function buildAllowlistedPayload(kind, payload) {
  const allowed = PAYLOAD_ALLOWLIST[kind];
  if (!allowed) return {};
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};
  const next = {};
  for (const field of allowed) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    const raw = source[field];
    if (raw === null || raw === undefined) continue;
    if (typeof raw === 'string') {
      next[field] = raw.length > 256 ? raw.slice(0, 256) : raw;
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      next[field] = raw;
    } else if (typeof raw === 'boolean') {
      next[field] = raw;
    }
    // else: drop silently (objects / arrays / functions never pass the
    // allowlist — the Worker half at U9 would reject them anyway).
  }
  return next;
}

/**
 * Emit a Punctuation telemetry event.
 *
 * Returns `true` when a dispatch fired, `false` when the kind was not
 * on the whitelist or the context was too degraded to dispatch. The
 * emitter is fire-and-forget: any downstream failure (Worker 4xx / 5xx /
 * network timeout) is routed through
 * `createPunctuationOnCommandError`, which has a dedicated early-return
 * branch for `punctuation-record-event` that short-circuits BEFORE the
 * shared `setSubjectError` path fires — so telemetry dispatch failures
 * never surface to the learner.
 *
 * @param {string} kind One of PUNCTUATION_TELEMETRY_EVENT_KINDS.
 * @param {object} payload Raw payload; non-allowlisted fields are stripped.
 * @param {object} context `{ actions, learnerId }`.
 */
export function emitPunctuationEvent(kind, payload = {}, context = {}) {
  if (!isPunctuationTelemetryEventKind(kind)) return false;
  const actions = context && typeof context === 'object' ? context.actions : null;
  if (!actions || typeof actions.dispatch !== 'function') return false;
  const sanitised = buildAllowlistedPayload(kind, payload);
  try {
    actions.dispatch('punctuation-record-event', {
      kind,
      payload: sanitised,
      // mutates:false is the signal the subject-command-actions handler
      // reads to bypass the read-only guard (mirrors `punctuation-context-pack`).
      // This flag is CLIENT-SIDE ONLY and does NOT bypass Worker authz.
      mutates: false,
    });
  } catch {
    // Telemetry must never stall the learner. Swallow dispatch errors.
    return false;
  }
  return true;
}

// Exported for the command-actions payload builder so both sides apply
// the same allowlist — defence-in-depth in case a caller dispatches
// `punctuation-record-event` directly without going through the emitter.
export function sanitisePunctuationTelemetryPayload(kind, payload) {
  if (!isPunctuationTelemetryEventKind(kind)) {
    return { event: '', payload: {} };
  }
  return { event: kind, payload: buildAllowlistedPayload(kind, payload) };
}
