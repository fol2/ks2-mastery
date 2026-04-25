function asEvents(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((event) => event && typeof event === 'object' && !Array.isArray(event));
}

export function eventToken(event) {
  if (typeof event?.id === 'string' && event.id) return event.id;
  if (typeof event?.type === 'string') {
    return [
      event.type,
      event.learnerId || '',
      event.sessionId || '',
      event.wordSlug || '',
      event.monsterId || '',
      event.createdAt || '',
    ].join(':');
  }
  if (typeof event?.kind === 'string') {
    return [
      'reward',
      event.kind,
      event.learnerId || '',
      event.monsterId || '',
      event.createdAt || '',
    ].join(':');
  }
  return null;
}

// Terminal-transition semantic token: dedupes `caught` and `mega` events for
// the same (learnerId, monsterId, kind, releaseId) so a roster flip (e.g.
// Punctuation Phase 2 where grand monster carillon -> quoral) cannot emit a
// second terminal transition for a learner who already earned the same
// milestone under the previous roster. The id-based `eventToken` above
// returns different strings across the flip (the cluster segment changes),
// so storage keeps both rows — the semantic token collapses them at
// projection time. Cross-release re-emission is intentional and not
// deduped here (the releaseId segment differs), so future releases still
// celebrate a new mega.
export function terminalRewardToken(event) {
  if (!event || typeof event !== 'object' || event.type !== 'reward.monster') return null;
  if (event.kind !== 'caught' && event.kind !== 'mega') return null;
  const releaseId = typeof event.releaseId === 'string' ? event.releaseId : '';
  return ['reward.monster.terminal', event.learnerId || '', event.monsterId || '', event.kind, releaseId].join(':');
}

// Grammar direct-only concept-scoped token (Phase 3 U0). The Grammar roster
// flip is asymmetric — retired direct ids redistribute into new direct
// clusters, so two `caught` events for the same (learnerId, subjectId,
// conceptId, kind, releaseId) may land under different direct monsterIds
// across the flip. The monster-scoped `terminalRewardToken` would miss that
// collision. This concept-scoped token is emitted alongside the
// monster-scoped token so any cross-direct re-emission that slips the
// writer self-heal at `src/platform/game/mastery/grammar.js`
// `retiredStateHoldsConcept` is caught at projection time.
//
// IMPORTANT: the grand aggregate (Concordium) is intentionally excluded from
// this token. Within a single `recordGrammarConceptMastery` call, the direct
// and the grand both emit for the same conceptId — they represent two
// distinct milestones and must not dedupe against each other. Including the
// grand in the token would swallow the legitimate grand `caught` event.
// Non-Grammar events and Grammar grand events return null so Punctuation,
// Spelling and Concordium behaviour stay unchanged.
const GRAMMAR_GRAND_MONSTER_ID = 'concordium';
export function grammarTerminalConceptToken(event) {
  if (!event || typeof event !== 'object' || event.type !== 'reward.monster') return null;
  if (event.subjectId !== 'grammar') return null;
  if (event.kind !== 'caught' && event.kind !== 'mega') return null;
  if (event.monsterId === GRAMMAR_GRAND_MONSTER_ID) return null;
  const conceptId = typeof event.conceptId === 'string' ? event.conceptId : '';
  if (!conceptId) return null;
  const releaseId = typeof event.releaseId === 'string' ? event.releaseId : '';
  return [
    'reward.monster.terminal-concept',
    event.learnerId || '',
    event.subjectId || '',
    conceptId,
    event.kind,
    releaseId,
  ].join(':');
}

// seenTokens dedupes by the id-based `eventToken` (the default contract).
// seenTerminalTokens dedupes by `terminalRewardToken` and is scoped to
// caught/mega transitions on reward.monster events.
// seenGrammarConceptTokens dedupes by `grammarTerminalConceptToken` and is
// scoped to Grammar caught/mega events where two different directs may
// share the same concept across the Phase 3 U0 roster flip. All three sets
// are threaded through combineCommandEvents so a reward that was already
// persisted in existingEvents can still block a re-emission from fresh
// domain or reaction events.
export function dedupeEvents(events, seenTokens = new Set(), seenTerminalTokens = new Set(), seenGrammarConceptTokens = new Set()) {
  const output = [];
  for (const event of asEvents(events)) {
    const token = eventToken(event);
    if (token && seenTokens.has(token)) continue;
    const terminalToken = terminalRewardToken(event);
    if (terminalToken && seenTerminalTokens.has(terminalToken)) continue;
    const grammarConceptToken = grammarTerminalConceptToken(event);
    if (grammarConceptToken && seenGrammarConceptTokens.has(grammarConceptToken)) continue;
    if (token) seenTokens.add(token);
    if (terminalToken) seenTerminalTokens.add(terminalToken);
    if (grammarConceptToken) seenGrammarConceptTokens.add(grammarConceptToken);
    output.push(event);
  }
  return output;
}

export function toastEvents(events) {
  return asEvents(events).filter((event) => Boolean(event?.toast?.title || event?.toast?.body || event?.monster?.name));
}

export function combineCommandEvents({ domainEvents = [], reactionEvents = [], existingEvents = [] } = {}) {
  const existing = asEvents(existingEvents);
  const seenTokens = new Set(existing.map(eventToken).filter(Boolean));
  const seenTerminalTokens = new Set(existing.map(terminalRewardToken).filter(Boolean));
  const seenGrammarConceptTokens = new Set(existing.map(grammarTerminalConceptToken).filter(Boolean));
  const domain = dedupeEvents(domainEvents, seenTokens, seenTerminalTokens, seenGrammarConceptTokens);
  const reactions = dedupeEvents(reactionEvents, seenTokens, seenTerminalTokens, seenGrammarConceptTokens);
  return {
    domainEvents: domain,
    reactionEvents: reactions,
    toastEvents: toastEvents(reactions),
    events: [...domain, ...reactions],
  };
}
