// bootstrap-repository.js — Bootstrap envelope constants, revision hash,
// and capacity-meta helpers. Extracted from repository.js (P3 U6 split)
// with ZERO behaviour change. Every exported symbol is barrel-re-exported
// from repository.js so existing consumers are unaffected.
//
// The bulk of the bootstrap logic (bootstrapBundle, bootstrapNotModifiedProbe,
// bootstrapV2, etc.) remains in repository.js because it depends on dozens
// of internal row-transform helpers. Only the self-contained pieces live
// here.

import {
  writableRole,
} from './membership-repository.js';

// ─── Bootstrap capacity version ──────────────────────────────────────────────
// Any additive required field on the bootstrap envelope MUST bump this
// in the same PR. See tests/worker-bootstrap-v2.test.js scenario 15.
// This rule survives the repository split — the constant moved here
// from repository.js but the discipline is unchanged.

export const PUBLIC_BOOTSTRAP_RECENT_SESSION_LIMIT_PER_LEARNER = 5;
export const PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LIMIT_PER_LEARNER = 1;
export const PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LOOKUP_LIMIT_PER_LEARNER = 5;
export const PUBLIC_BOOTSTRAP_RECENT_EVENT_LIMIT_PER_LEARNER = 50;

// U7: bumped from 1 → 2 when the selected-learner-bounded envelope landed.
// U1 hotfix follow-up 2026-04-26: bumped 2 → 3 in the same PR that:
//   - adds `bootstrapCapacity.subjectStatesBounded` (required-field addition
//     per the capacity release-gate plan, docs/plans/2026-04-25-002...),
//   - extends the revision-hash input set with
//     `writableLearnerStatesDigest` (a state_revision digest across every
//     writable learner) so sibling subject_state writes invalidate the
//     `bootstrapNotModifiedProbe` short-circuit (B1 blocker).
// Stale v2 clients will naturally miss, re-fetch, and bind to the v3 hash.
// Any additive required field on the bootstrap envelope MUST bump this in
// the same PR. `tests/worker-bootstrap-v2.test.js` has a snapshot test that
// fails if the envelope shape changes without a version bump (scenario 15).
export const PUBLIC_BOOTSTRAP_CAPACITY_VERSION = 3;
export const BOOTSTRAP_CAPACITY_VERSION = PUBLIC_BOOTSTRAP_CAPACITY_VERSION;

// U7: closed union for `meta.capacity.bootstrapMode` when the public
// bootstrap runs. `full-legacy` covers the `publicReadModels=false` path
// (non-public internal callers still go through the unrestricted bundle).
// `not-modified` is returned when the client's `lastKnownRevision` matches
// the current server hash and we return a < 2 KB short response.
export const BOOTSTRAP_MODES = new Set([
  'selected-learner-bounded',
  'full-legacy',
  'not-modified',
]);

// U7: snapshot for the v2 envelope shape. Locked per-version; a required
// shape change without a `BOOTSTRAP_CAPACITY_VERSION` bump + a snapshot
// update in the same PR fails the release-rule test (scenario 15).
// EVIDENCE_SCHEMA_VERSION is deliberately NOT bumped — that constant
// covers the capacity evidence doc schema (U3), not the bootstrap
// envelope; bootstrap envelope evolution is governed by its own version.
export const BOOTSTRAP_V2_ENVELOPE_SHAPE = Object.freeze({
  version: PUBLIC_BOOTSTRAP_CAPACITY_VERSION,
  requiredTopLevelKeys: Object.freeze([
    'account',
    'eventLog',
    'gameState',
    'learners',
    'meta',
    'monsterVisualConfig',
    'practiceSessions',
    'revision',
    'subjectStates',
    'syncState',
  ]),
  requiredRevisionKeys: Object.freeze([
    'accountRevision',
    'accountLearnerListRevision',
    'bootstrapCapacityVersion',
    'hash',
    'selectedLearnerRevision',
  ]),
});

// ─── Revision hash ───────────────────────────────────────────────────────────
// The `accountId` prefix (U7 adv-u7-r1-002) salts the hash per account so
// two accounts with identical (N,M,V,L,D) tuples no longer collide. The
// `writableLearnerStatesDigest` slot (U1 follow-up 2026-04-26, B1 blocker)
// pins EVERY writable learner's `learner_profiles.state_revision` into
// the hash input, so a sibling (non-selected) `writeSubjectState` →
// `withLearnerMutation` bump forces `bootstrapNotModifiedProbe` to miss
// and the client gets a fresh full bundle. Without this slot, the
// 4-input hash (N,M,V,L) was insensitive to sibling writes and the U1
// hotfix was silently defeated when Nelson/James finished a round on a
// second device while Eugenia was selected.
//
// Changing this input format (or the truncation length) is equivalent to
// bumping `BOOTSTRAP_CAPACITY_VERSION` — stale clients will silently
// reject `notModified` responses via the schema check. The version bump
// in this PR from 2→3 forces v2 clients to miss once and re-bind.
export async function computeBootstrapRevisionHash({
  accountId,
  accountRevision,
  selectedLearnerRevision,
  bootstrapCapacityVersion,
  accountLearnerListRevision,
  // U1 follow-up 2026-04-26: digest over every writable learner's
  // `state_revision` (sorted by id, joined as `id:rev,id:rev`, SHA-256 →
  // 16 bytes hex). Computed by `computeWritableLearnerStatesDigest()`.
  // Optional for historical callers; defaults to `0` which matches the
  // old 4-input hash when no digest is passed (migration-safe for any
  // internal test that only exercises the raw hash helper).
  writableLearnerStatesDigest = '',
}) {
  const input = [
    `accountId:${String(accountId || '')}`,
    `accountRevision:${Number(accountRevision) || 0}`,
    `selectedLearnerRevision:${Number(selectedLearnerRevision) || 0}`,
    `bootstrapCapacityVersion:${Number(bootstrapCapacityVersion) || 0}`,
    `accountLearnerListRevision:${Number(accountLearnerListRevision) || 0}`,
    `writableLearnerStatesDigest:${String(writableLearnerStatesDigest || '')}`,
  ].join(';');
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const out = new Uint8Array(digest).slice(0, 16);
  let hex = '';
  for (let i = 0; i < out.length; i += 1) {
    hex += out[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// U1 follow-up 2026-04-26 (B1 blocker): deterministic digest over every
// writable learner's `state_revision`. Input rows are sorted by learner
// id so addition/removal/reorder is captured by the upstream
// `accountLearnerListRevision` rather than here. Per-learner bumps
// (sibling `writeSubjectState` etc.) flow through this slot so the
// `bootstrapNotModifiedProbe` short-circuit invalidates correctly.
//
// Returns 16 bytes hex (32 chars). Empty input returns an empty string;
// `computeBootstrapRevisionHash` stamps that case as
// `writableLearnerStatesDigest:` which is distinguishable from a real
// digest.
export async function computeWritableLearnerStatesDigest(membershipRows) {
  if (!Array.isArray(membershipRows) || !membershipRows.length) return '';
  const entries = membershipRows
    .map((row) => ({ id: String(row.id || ''), revision: Number(row.state_revision) || 0 }))
    .filter((entry) => entry.id)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((entry) => `${entry.id}:${entry.revision}`)
    .join(',');
  if (!entries) return '';
  const bytes = new TextEncoder().encode(entries);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const out = new Uint8Array(digest).slice(0, 16);
  let hex = '';
  for (let i = 0; i < out.length; i += 1) {
    hex += out[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// ─── Capacity meta builder ───────────────────────────────────────────────────

export function bootstrapCapacityMeta({
  publicReadModels,
  learnerCount,
  sessionRows,
  eventRows,
  // U1 follow-up 2026-04-26 (B4): derive rather than hardcode. Caller
  // must pass the actual query-shape boolean
  // (`subjectStateLearnerIds.length === learnerIds.length` in the
  // happy path; `false` when unbounded, `true` if a future re-bound
  // mode is introduced or the B2 fallback shrinks the query). Keeping
  // the parameter explicit means a future author cannot silently
  // re-bound subject states without tripping both the caller shape
  // and this contract.
  subjectStatesBounded,
  // U1 follow-up 2026-04-26 (B2): optional diagnostic stamped when the
  // wider IN-clause degraded to the bounded fallback. `null` means the
  // nominal path (every writable learner). `'degraded-to-selected'`
  // means the widened SELECT failed and we fell back to [selectedId] so the
  // bootstrap still returns rather than 500s.
  subjectStatesFallbackMode = null,
}) {
  if (!publicReadModels) return null;
  const sessionActiveLimit = learnerCount * PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LIMIT_PER_LEARNER;
  const sessionRecentLimit = learnerCount * PUBLIC_BOOTSTRAP_RECENT_SESSION_LIMIT_PER_LEARNER;
  const sessionLimit = sessionActiveLimit + sessionRecentLimit;
  const eventRecentLimit = learnerCount * PUBLIC_BOOTSTRAP_RECENT_EVENT_LIMIT_PER_LEARNER;
  return {
    version: PUBLIC_BOOTSTRAP_CAPACITY_VERSION,
    mode: 'public-bounded',
    limits: {
      activeSessionsPerLearner: PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LIMIT_PER_LEARNER,
      recentSessionsPerLearner: PUBLIC_BOOTSTRAP_RECENT_SESSION_LIMIT_PER_LEARNER,
      recentEventsPerLearner: PUBLIC_BOOTSTRAP_RECENT_EVENT_LIMIT_PER_LEARNER,
    },
    learners: {
      returned: learnerCount,
    },
    practiceSessions: {
      returned: sessionRows.length,
      bounded: true,
      atOrAboveRecentLimit: learnerCount > 0 && sessionRows.length >= sessionRecentLimit,
      atOrAboveMaximumLimit: learnerCount > 0 && sessionRows.length >= sessionLimit,
    },
    eventLog: {
      returned: eventRows.length,
      bounded: true,
      atOrAboveRecentLimit: learnerCount > 0 && eventRows.length >= eventRecentLimit,
    },
    // U1 hotfix 2026-04-26: child_subject_state + child_game_state ship for
    // every writable learner even in selected-learner-bounded mode, so the
    // Spelling/Grammar/Punctuation "Where You Stand" setup stats no longer
    // show 0 for non-selected learners. Spec:
    // docs/superpowers/specs/2026-04-26-bootstrap-learner-stats-hotfix-
    // design.md. U1 follow-up (B4): value is derived from the caller's
    // actual query shape — a drift-prone hardcoded `false` would silently
    // lie if a future author re-bounded subject states.
    subjectStatesBounded: Boolean(subjectStatesBounded),
    // U1 follow-up (B2) defensive fallback. Omitted (undefined) when the
    // widened SELECTs succeeded; `'degraded-to-selected'` when they
    // tripped a D1 failure and we fell back to [selectedId] so the
    // bootstrap still returns rather than 500s.
    ...(subjectStatesFallbackMode ? { subjectStatesFallbackMode } : {}),
  };
}

// ─── Selected-learner resolver ───────────────────────────────────────────────
// U7: resolve the "cold-start" selected learner given optional client
// preference. Precedence (per plan line 756):
//   1. preferredLearnerId (if writable in caller's scope)
//   2. persisted account.selected_learner_id (if still writable)
//   3. first alphabetical by learner id
// Client preference pointing at a non-writable id is silently rejected —
// do NOT leak `clientPreferenceRejected` in the response body per plan
// line 778.
export function resolveBootstrapSelectedLearnerId(
  membershipRows,
  persistedSelectedId,
  preferredLearnerId,
) {
  const writableIds = new Set(
    membershipRows.filter((row) => writableRole(row.role)).map((row) => String(row.id)),
  );
  if (!writableIds.size) return null;
  const preferred = preferredLearnerId ? String(preferredLearnerId) : '';
  if (preferred && writableIds.has(preferred)) return preferred;
  if (persistedSelectedId && writableIds.has(String(persistedSelectedId))) {
    return String(persistedSelectedId);
  }
  // Alphabetical fallback.
  const sorted = [...writableIds].sort();
  return sorted[0] || null;
}

// U7: compact `account.learnerList` entry for unselected learners in the
// selected-learner-bounded response. Hard limit on per-entry payload —
// no avatar blobs, no history, no prompts. Roughly 150 bytes per entry
// after JSON serialisation; 50 entries → ~7.5 KB.
export function compactLearnerListEntry(row) {
  if (!row) return null;
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    avatarColor: row.avatar_color ? String(row.avatar_color) : null,
    yearGroup: row.year_group ? String(row.year_group) : null,
    revision: Number(row.state_revision) || 0,
  };
}
