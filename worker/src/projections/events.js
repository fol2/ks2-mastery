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

export function dedupeEvents(events, seenTokens = new Set()) {
  const output = [];
  for (const event of asEvents(events)) {
    const token = eventToken(event);
    if (token && seenTokens.has(token)) continue;
    if (token) seenTokens.add(token);
    output.push(event);
  }
  return output;
}

export function toastEvents(events) {
  return asEvents(events).filter((event) => Boolean(event?.toast?.title || event?.toast?.body || event?.monster?.name));
}

export function combineCommandEvents({ domainEvents = [], reactionEvents = [], existingEvents = [] } = {}) {
  const seenTokens = new Set(asEvents(existingEvents).map(eventToken).filter(Boolean));
  const domain = dedupeEvents(domainEvents, seenTokens);
  const reactions = dedupeEvents(reactionEvents, seenTokens);
  return {
    domainEvents: domain,
    reactionEvents: reactions,
    toastEvents: toastEvents(reactions),
    events: [...domain, ...reactions],
  };
}
