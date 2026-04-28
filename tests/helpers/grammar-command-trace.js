// U6 (P7) test helper — structured command trace model for Grammar commands.
//
// Wraps the output event arrays from a Grammar command execution into a
// deterministic, developer-friendly trace object. The trace only contains
// mapped summaries — never raw event references — so assertions can
// deep-equal without coupling to internal event shape drift.
//
// This is NOT a production module. It is used exclusively in tests.

/**
 * Build a structured trace from the event arrays a Grammar command handler
 * produces. Callers pass the same `domainEvents`, `starEvidenceEvents`, and
 * `rewardEvents` that `handleGrammarCommand` returns, plus identifying
 * metadata.
 *
 * @param {object} opts
 * @param {string} [opts.commandName]
 * @param {string} [opts.requestId]
 * @param {string} [opts.learnerId]
 * @param {Array}  [opts.domainEvents]
 * @param {Array}  [opts.starEvidenceEvents]
 * @param {Array}  [opts.rewardEvents]
 * @returns {object} Structured trace with mapped summaries only.
 */
export function buildCommandTrace({
  commandName,
  requestId,
  learnerId,
  domainEvents = [],
  starEvidenceEvents = [],
  rewardEvents = [],
} = {}) {
  return {
    commandName: commandName || '',
    requestId: requestId || '',
    learnerId: learnerId || '',
    subjectId: 'grammar',
    domainEvents: domainEvents.map((e) => ({
      type: e.type,
      conceptId: e.conceptId || e.conceptIds?.[0] || '',
    })),
    starEvidenceEvents: starEvidenceEvents.map((e) => ({
      type: e.type,
      monsterId: e.monsterId || '',
      computedStars: e.computedStars || 0,
      previousStarHighWater: e.previousStarHighWater || 0,
    })),
    rewardEvents: rewardEvents.map((e) => ({
      type: e.type || e.kind || '',
      monsterId: e.monsterId || '',
    })),
    readModelChanged: domainEvents.length > 0,
    isNoOp: domainEvents.length === 0 && starEvidenceEvents.length === 0,
  };
}
