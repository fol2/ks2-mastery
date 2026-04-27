// Hero Mode P0 — Spelling subject provider (read-only).
//
// Translates the Spelling read-model signals into Hero task envelopes.
// MUST NOT call command handlers, mutate state, start sessions, or
// import from runtime.js.

import { buildTaskEnvelope } from '../../../../shared/hero/task-envelope.js';

/**
 * Accepted read-model shape (from buildSpellingReadModel):
 *
 *   readModel.stats
 *     { all, core, y34, y56, extra }
 *     where each pool is:
 *       { total, secure, due, fresh, trouble, attempts, correct, accuracy }
 *
 *   readModel.analytics
 *     { version, generatedAt, pools: { all, core, y34, y56, extra }, wordGroups }
 *
 *   Post-Mega signals (from data.postMega / createLockedPostMasteryState):
 *     { allWordsMega, allWordsMegaNow, postMegaUnlockedEver,
 *       postMegaDashboardAvailable, newCoreWordsSinceGraduation,
 *       guardianDueCount, wobblingCount, wobblingDueCount,
 *       nonWobblingDueCount, unguardedMegaCount, guardianAvailableCount,
 *       guardianMissionState, guardianMissionAvailable, nextGuardianDueDay,
 *       todayDay, guardianMap, recommendedWords }
 *
 *   readModel is augmented with `postMega` by the caller (hero orchestrator)
 *   from the spelling engine's post-mastery state.
 */

function safeCoreStats(readModel) {
  // stats.core (or stats.all) is the primary pool
  const stats = readModel?.stats?.core || readModel?.stats?.all;
  if (!stats || typeof stats !== 'object') return null;
  return {
    total: Number(stats.total) || 0,
    secure: Number(stats.secure) || 0,
    due: Number(stats.due) || 0,
    fresh: Number(stats.fresh) || 0,
    trouble: Number(stats.trouble) || 0,
    attempts: Number(stats.attempts) || 0,
  };
}

function safePostMega(readModel) {
  const pm = readModel?.postMega;
  if (!pm || typeof pm !== 'object') return null;
  return {
    allWordsMega: Boolean(pm.allWordsMega),
    postMegaDashboardAvailable: Boolean(pm.postMegaDashboardAvailable),
    guardianDueCount: Number(pm.guardianDueCount) || 0,
    wobblingDueCount: Number(pm.wobblingDueCount) || 0,
    guardianMissionAvailable: Boolean(pm.guardianMissionAvailable),
  };
}

export function spellingProvider(readModel) {
  const subjectId = 'spelling';
  const stats = safeCoreStats(readModel);

  // No usable stats at all
  if (!stats || stats.total === 0) {
    return {
      subjectId,
      available: false,
      unavailableReason: 'missing-hero-readable-signals',
      signals: { dueCount: 0, weakCount: 0, secureCount: 0, megaLike: false, postMegaAvailable: false, retentionDueCount: 0 },
      envelopes: [],
    };
  }

  const postMega = safePostMega(readModel);
  const dueCount = stats.due;
  const weakCount = stats.trouble;
  const secureCount = stats.secure;
  const megaLike = postMega ? postMega.allWordsMega : false;
  const postMegaAvailable = postMega ? postMega.postMegaDashboardAvailable : false;
  const guardianDueCount = postMega ? postMega.guardianDueCount : 0;

  const signals = {
    dueCount,
    weakCount,
    secureCount,
    megaLike,
    postMegaAvailable,
    retentionDueCount: guardianDueCount,
  };

  const envelopes = [];

  // If post-mega signals are available AND the learner has actually achieved
  // mega status, emit maintenance envelopes.  Without the allWordsMega gate
  // the provider would emit megaLike: true signals for a learner who merely
  // has the post-mega dashboard unlocked but has not yet secured all words.
  if (postMega && postMegaAvailable && megaLike) {
    // Post-mega-maintenance: guardian-check for guardian due words
    if (guardianDueCount > 0 || postMega.guardianMissionAvailable) {
      envelopes.push(buildTaskEnvelope({
        subjectId,
        intent: 'post-mega-maintenance',
        launcher: 'guardian-check',
        effortTarget: Math.min(guardianDueCount * 2 || 4, 10),
        reasonTags: ['post-mega', 'guardian-due'],
        debugReason: `Spelling Post-Mega: ${guardianDueCount} guardian-due word(s); mission ${postMega.guardianMissionAvailable ? 'available' : 'locked'}.`,
      }));
    }

    // Due words in post-mega still need review
    if (dueCount > 0) {
      envelopes.push(buildTaskEnvelope({
        subjectId,
        intent: 'due-review',
        launcher: 'smart-practice',
        effortTarget: Math.min(dueCount * 2, 10),
        reasonTags: ['due-words', 'post-mega'],
        debugReason: `Spelling has ${dueCount} due word(s) in post-mega phase.`,
      }));
    }

    // Weak words in post-mega
    if (weakCount > 0) {
      envelopes.push(buildTaskEnvelope({
        subjectId,
        intent: 'weak-repair',
        launcher: 'trouble-practice',
        effortTarget: Math.min(weakCount * 3, 12),
        reasonTags: ['trouble-words', 'post-mega'],
        debugReason: `Spelling has ${weakCount} trouble word(s) in post-mega phase.`,
      }));
    }

    // If mega but no specific envelopes, emit maintenance only
    if (envelopes.length === 0 && megaLike) {
      envelopes.push(buildTaskEnvelope({
        subjectId,
        intent: 'post-mega-maintenance',
        launcher: 'guardian-check',
        effortTarget: 4,
        reasonTags: ['post-mega', 'maintenance-only'],
        debugReason: 'Spelling is fully Mega with no immediate due/weak; maintenance guardian-check.',
      }));
    }
  }

  // Pre-mega (no post-mega signals): standard envelopes
  if (!postMega || !postMegaAvailable) {
    // Due-review: smart-practice for due words
    if (dueCount > 0) {
      envelopes.push(buildTaskEnvelope({
        subjectId,
        intent: 'due-review',
        launcher: 'smart-practice',
        effortTarget: Math.min(dueCount * 2, 10),
        reasonTags: ['due-words'],
        debugReason: `Spelling has ${dueCount} due word(s) for review.`,
      }));
    }

    // Weak-repair: trouble-practice for trouble words
    if (weakCount > 0) {
      envelopes.push(buildTaskEnvelope({
        subjectId,
        intent: 'weak-repair',
        launcher: 'trouble-practice',
        effortTarget: Math.min(weakCount * 3, 12),
        reasonTags: ['trouble-words'],
        debugReason: `Spelling has ${weakCount} trouble word(s) requiring repair.`,
      }));
    }
  }

  // Fallback: if no envelopes, emit generic Smart Review
  if (envelopes.length === 0) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'due-review',
      launcher: 'smart-practice',
      effortTarget: 4,
      reasonTags: ['generic-fallback'],
      debugReason: 'Spelling signals present but no specific intent matched; generic Smart Review.',
    }));
  }

  return {
    subjectId,
    available: true,
    unavailableReason: null,
    signals,
    envelopes,
  };
}
