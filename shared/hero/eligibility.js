// Hero eligibility resolver — classifies subject snapshots as eligible or
// locked. Pure function: no Worker, React, or D1 imports. Deterministic
// given the same inputs. Imported by the shadow scheduler and the
// read-model route.
//
// The resolver iterates HERO_SUBJECT_IDS (the canonical six), so adding a
// future subject only requires updating the constants module and providing
// a provider snapshot — no eligibility code change needed.

import {
  HERO_SUBJECT_IDS,
  HERO_LOCKED_SUBJECT_IDS,
} from './constants.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const LOCKED_SUBJECT_SET = new Set(HERO_LOCKED_SUBJECT_IDS);

/**
 * Classifies each subject as eligible or locked based on provider snapshots.
 *
 * @param {Object} subjectSnapshots — keyed by subjectId, each value is
 *   `{ available, unavailableReason, signals, envelopes }` or null
 * @param {Object} [options] — reserved for future configuration
 * @returns {{ eligible: Array<{subjectId: string, reason: string}>,
 *             locked:   Array<{subjectId: string, reason: string}> }}
 */
export function resolveEligibility(subjectSnapshots, options) {
  const snapshots = isPlainObject(subjectSnapshots) ? subjectSnapshots : {};

  const eligible = [];
  const locked = [];

  for (const subjectId of HERO_SUBJECT_IDS) {
    const snapshot = snapshots[subjectId];

    // No provider registered for this subject at all.
    if (snapshot == null) {
      // Placeholder engines get a specific reason; others get the generic one.
      const reason = LOCKED_SUBJECT_SET.has(subjectId)
        ? 'placeholder-engine-not-ready'
        : 'no-provider-registered';
      locked.push({ subjectId, reason });
      continue;
    }

    const snap = isPlainObject(snapshot) ? snapshot : {};

    // Provider explicitly says this subject is unavailable.
    if (snap.available !== true) {
      const reason = typeof snap.unavailableReason === 'string' && snap.unavailableReason
        ? snap.unavailableReason
        : 'provider-unavailable';
      locked.push({ subjectId, reason });
      continue;
    }

    // Provider says available but has no envelopes to offer.
    const envelopes = Array.isArray(snap.envelopes) ? snap.envelopes : [];
    if (envelopes.length === 0) {
      locked.push({ subjectId, reason: 'no-envelopes-available' });
      continue;
    }

    // Eligible: derive reason from the first envelope's intent, or fallback.
    const firstIntent = isPlainObject(envelopes[0]) && typeof envelopes[0].intent === 'string'
      ? envelopes[0].intent
      : '';
    const reason = firstIntent || 'worker-command-ready';
    eligible.push({ subjectId, reason });
  }

  return Object.freeze({ eligible: Object.freeze(eligible), locked: Object.freeze(locked) });
}
