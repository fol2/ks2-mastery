// Hero Mode P0 — Punctuation subject provider (read-only).
//
// Translates the Punctuation read-model signals into Hero task envelopes.
// MUST NOT call command handlers, mutate state, start sessions, or
// import from runtime.js.

import { buildTaskEnvelope } from '../../../../shared/hero/task-envelope.js';

/**
 * Accepted read-model shape (from buildPunctuationReadModel):
 *
 *   readModel.availability
 *     { status: 'ready' | ..., code, message }
 *
 *   readModel.stats
 *     { total, secure, due, fresh, weak, attempts, correct, accuracy,
 *       publishedRewardUnits, securedRewardUnits, sessionsCompleted }
 *
 *   readModel.analytics (from analyticsFromData)
 *     { releaseId, attempts, correct, accuracy, sessionsCompleted,
 *       skillRows[], rewardUnits[], bySessionMode[], byItemMode[],
 *       weakestFacets[], recentMistakes[], misconceptionPatterns[],
 *       dailyGoal, streak }
 *
 *   readModel.analytics.skillRows[]
 *     { skillId, name, clusterId, published, attempts, correct, accuracy,
 *       secure, due, weak, mastery }
 */

function safeStats(readModel) {
  const stats = readModel?.stats;
  if (!stats || typeof stats !== 'object') return null;
  return {
    total: Number(stats.total) || 0,
    secure: Number(stats.secure) || 0,
    due: Number(stats.due) || 0,
    fresh: Number(stats.fresh) || 0,
    weak: Number(stats.weak) || 0,
    attempts: Number(stats.attempts) || 0,
  };
}

function retentionDueFromSkillRows(readModel) {
  const skillRows = readModel?.analytics?.skillRows;
  if (!Array.isArray(skillRows)) return 0;
  let count = 0;
  for (const row of skillRows) {
    // Secured skills with due items indicate retention-due
    if (row.secure > 0 && row.due > 0) count += row.due;
  }
  return count;
}

export function punctuationProvider(readModel) {
  const subjectId = 'punctuation';

  // If read model is absent entirely, unavailable.
  if (!readModel) {
    return {
      subjectId,
      available: false,
      unavailableReason: 'punctuation-not-available',
      signals: { dueCount: 0, weakCount: 0, secureCount: 0, megaLike: false, postMegaAvailable: false, retentionDueCount: 0 },
      envelopes: [],
    };
  }

  // Check availability status from the read model
  const availability = readModel.availability;
  if (availability && availability.status !== 'ready') {
    return {
      subjectId,
      available: false,
      unavailableReason: 'punctuation-not-available',
      signals: { dueCount: 0, weakCount: 0, secureCount: 0, megaLike: false, postMegaAvailable: false, retentionDueCount: 0 },
      envelopes: [],
    };
  }

  const stats = safeStats(readModel);
  if (!stats || stats.total === 0) {
    return {
      subjectId,
      available: false,
      unavailableReason: 'punctuation-not-available',
      signals: { dueCount: 0, weakCount: 0, secureCount: 0, megaLike: false, postMegaAvailable: false, retentionDueCount: 0 },
      envelopes: [],
    };
  }

  const dueCount = stats.due;
  const weakCount = stats.weak;
  const secureCount = stats.secure;
  const retDueCount = retentionDueFromSkillRows(readModel);

  const signals = {
    dueCount,
    weakCount,
    secureCount,
    megaLike: false,
    postMegaAvailable: false,
    retentionDueCount: retDueCount,
  };

  const envelopes = [];

  // 1. Due-review: smart-practice for due items
  if (dueCount > 0) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'due-review',
      launcher: 'smart-practice',
      effortTarget: Math.min(dueCount * 2, 10),
      reasonTags: ['due-items'],
      debugReason: `Punctuation has ${dueCount} due item(s) for review.`,
    }));
  }

  // 2. Weak-repair: trouble-practice for weak items
  if (weakCount > 0) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'weak-repair',
      launcher: 'trouble-practice',
      effortTarget: Math.min(weakCount * 3, 12),
      reasonTags: ['weak-items'],
      debugReason: `Punctuation has ${weakCount} weak item(s) requiring repair.`,
    }));
  }

  // 3. Breadth-maintenance: gps-check for broad coverage
  if (secureCount >= 3) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'breadth-maintenance',
      launcher: 'gps-check',
      effortTarget: 5,
      reasonTags: ['breadth', 'maintenance'],
      debugReason: `Punctuation has ${secureCount} secured items; breadth gps-check eligible.`,
    }));
  }

  // 4. Retention-after-secure: smart-practice for retention
  if (retDueCount > 0) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'retention-after-secure',
      launcher: 'smart-practice',
      effortTarget: Math.min(retDueCount * 2, 8),
      reasonTags: ['retention'],
      debugReason: `Punctuation has ${retDueCount} retention-due item(s) in secured skills.`,
    }));
  }

  // Fallback: generic smart-practice if no specific intents matched
  if (envelopes.length === 0) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'due-review',
      launcher: 'smart-practice',
      effortTarget: 4,
      reasonTags: ['generic-fallback'],
      debugReason: 'Punctuation signals present but no specific intent matched; generic smart-practice fallback.',
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
