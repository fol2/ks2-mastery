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

export function dedupeEvents(events, seenTokens = new Set(), seenTerminalTokens = new Set()) {
  const output = [];
  for (const event of asEvents(events)) {
    const token = eventToken(event);
    if (token && seenTokens.has(token)) continue;
    const terminalToken = terminalRewardToken(event);
    if (terminalToken && seenTerminalTokens.has(terminalToken)) continue;
    if (token) seenTokens.add(token);
    if (terminalToken) seenTerminalTokens.add(terminalToken);
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
  const domain = dedupeEvents(domainEvents, seenTokens, seenTerminalTokens);
  const reactions = dedupeEvents(reactionEvents, seenTokens, seenTerminalTokens);
  return {
    domainEvents: domain,
    reactionEvents: reactions,
    toastEvents: toastEvents(reactions),
    events: [...domain, ...reactions],
  };
}
