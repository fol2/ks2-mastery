// Hero Mode P0 — Grammar subject provider (read-only).
//
// Translates the Grammar read-model signals into Hero task envelopes.
// MUST NOT call command handlers, mutate state, start sessions, or
// import from runtime.js.

import { buildTaskEnvelope } from '../../../../shared/hero/task-envelope.js';

/**
 * Accepted read-model shape (from buildGrammarReadModel):
 *
 *   readModel.stats.concepts
 *     { total, new, learning, weak, due, secured }
 *
 *   readModel.analytics.concepts[]
 *     { id, name, domain, status, attempts, strength, dueAt,
 *       correctStreak, intervalDays, confidence: { label, ... } }
 *
 *   readModel.analytics.progressSnapshot
 *     { subjectId, totalConcepts, trackedConcepts, securedConcepts,
 *       dueConcepts, weakConcepts, untouchedConcepts, accuracyPercent }
 *
 * Confidence labels (from deriveGrammarConfidence / shared/grammar/confidence.js):
 *   'emerging' | 'building' | 'consolidating' | 'secure' | 'needs-repair'
 *
 * Concept statuses (from grammarConceptStatus):
 *   'new' | 'weak' | 'due' | 'secured' | 'learning'
 */

function safeConceptCounts(readModel) {
  const stats = readModel?.stats?.concepts;
  if (!stats || typeof stats !== 'object') return null;
  return {
    total: Number(stats.total) || 0,
    weak: Number(stats.weak) || 0,
    due: Number(stats.due) || 0,
    secured: Number(stats.secured) || 0,
    learning: Number(stats.learning) || 0,
    newCount: Number(stats.new) || 0,
  };
}

function safeConcepts(readModel) {
  const concepts = readModel?.analytics?.concepts;
  return Array.isArray(concepts) ? concepts : [];
}

function retentionDueCount(concepts) {
  let count = 0;
  for (const concept of concepts) {
    if (concept.status === 'secured' && concept.confidence?.label === 'consolidating') {
      count += 1;
    }
  }
  return count;
}

export function grammarProvider(readModel) {
  const subjectId = 'grammar';
  const counts = safeConceptCounts(readModel);
  const concepts = safeConcepts(readModel);

  // If we have no usable signals at all, return unavailable.
  if (!counts || counts.total === 0) {
    return {
      subjectId,
      available: false,
      unavailableReason: 'missing-hero-readable-signals',
      signals: { dueCount: 0, weakCount: 0, secureCount: 0, megaLike: false, postMegaAvailable: false, retentionDueCount: 0 },
      envelopes: [],
    };
  }

  const dueCount = counts.due;
  const weakCount = counts.weak;
  const secureCount = counts.secured;
  const retDueCount = retentionDueCount(concepts);

  const signals = {
    dueCount,
    weakCount,
    secureCount,
    megaLike: false,
    postMegaAvailable: false,
    retentionDueCount: retDueCount,
  };

  const envelopes = [];

  // 1. Weak-repair: trouble-practice for weak concepts
  if (weakCount > 0) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'weak-repair',
      launcher: 'trouble-practice',
      effortTarget: Math.min(weakCount * 3, 12),
      reasonTags: ['weak-concepts', 'needs-repair'],
      debugReason: `Grammar has ${weakCount} weak concept(s) requiring repair.`,
    }));
  }

  // 2. Due-review: smart-practice for due concepts
  if (dueCount > 0) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'due-review',
      launcher: 'smart-practice',
      effortTarget: Math.min(dueCount * 2, 10),
      reasonTags: ['due-concepts'],
      debugReason: `Grammar has ${dueCount} due concept(s) for review.`,
    }));
  }

  // 3. Retention-after-secure: smart-practice for consolidating secured concepts
  if (retDueCount > 0) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'retention-after-secure',
      launcher: 'smart-practice',
      effortTarget: Math.min(retDueCount * 2, 8),
      reasonTags: ['retention', 'consolidating'],
      debugReason: `Grammar has ${retDueCount} secured concept(s) in consolidating phase.`,
    }));
  }

  // 4. Breadth-maintenance: mini-test for overall breadth
  if (secureCount >= 3) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'breadth-maintenance',
      launcher: 'mini-test',
      effortTarget: 5,
      reasonTags: ['breadth', 'maintenance'],
      debugReason: `Grammar has ${secureCount} secured concepts; breadth mini-test eligible.`,
    }));
  }

  // Fallback: if no specific envelopes could be emitted but signals exist,
  // emit a generic smart-practice envelope.
  if (envelopes.length === 0) {
    envelopes.push(buildTaskEnvelope({
      subjectId,
      intent: 'due-review',
      launcher: 'smart-practice',
      effortTarget: 6,
      reasonTags: ['generic-fallback'],
      debugReason: 'Grammar signals present but no specific intent matched; generic smart-practice fallback.',
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
