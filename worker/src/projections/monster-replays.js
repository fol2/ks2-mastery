import { normaliseMonsterCelebrationEvents } from '../../../src/platform/game/monster-celebrations.js';

export const MONSTER_CELEBRATION_REPLAY_REQUEST_TYPE = 'ops.monster-celebration-replay-request';

function eventId(event) {
  return typeof event?.id === 'string' && event.id ? event.id : '';
}

function eventCreatedAt(event) {
  return Number.isFinite(Number(event?.createdAt)) ? Number(event.createdAt) : 0;
}

function replayId(requestId, sourceId) {
  return `reward.monster.replay:${requestId}:${sourceId}`;
}

function replayRequestEventIds(request) {
  if (Array.isArray(request?.eventIds)) {
    return request.eventIds.filter((id) => typeof id === 'string' && id);
  }
  return typeof request?.eventId === 'string' && request.eventId ? [request.eventId] : [];
}

function replayRequests(events, { learnerId = '', subjectId = 'spelling' } = {}) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => event?.type === MONSTER_CELEBRATION_REPLAY_REQUEST_TYPE)
    .filter((event) => !learnerId || event.learnerId === learnerId)
    .filter((event) => !event.subjectId || event.subjectId === subjectId)
    .sort((a, b) => eventCreatedAt(a) - eventCreatedAt(b));
}

export function monsterCelebrationReplayReferenceIds(events, options = {}) {
  const sourceIds = new Set();
  const replayIds = new Set();
  for (const request of replayRequests(events, options)) {
    const requestId = eventId(request);
    if (!requestId) continue;
    for (const sourceId of replayRequestEventIds(request)) {
      sourceIds.add(sourceId);
      replayIds.add(replayId(requestId, sourceId));
    }
  }
  return {
    sourceIds: [...sourceIds],
    replayIds: [...replayIds],
  };
}

export function monsterCelebrationReplayEvents(events, {
  learnerId = '',
  subjectId = 'spelling',
  now = Date.now(),
} = {}) {
  const list = Array.isArray(events) ? events : [];
  const sourceById = new Map();
  const seenIds = new Set();
  for (const event of list) {
    const id = eventId(event);
    if (!id) continue;
    sourceById.set(id, event);
    seenIds.add(id);
  }

  const output = [];
  for (const request of replayRequests(list, { learnerId, subjectId })) {
    const requestId = eventId(request);
    if (!requestId) continue;
    for (const sourceId of replayRequestEventIds(request)) {
      const source = sourceById.get(sourceId);
      const replayEventId = replayId(requestId, sourceId);
      if (!source || seenIds.has(replayEventId)) continue;
      const [event] = normaliseMonsterCelebrationEvents(source);
      if (!event) continue;
      output.push({
        ...event,
        id: replayEventId,
        learnerId: learnerId || event.learnerId,
        subjectId,
        replayOf: sourceId,
        replayRequestId: requestId,
        createdAt: Math.max(0, Number(now) || Date.now()) + output.length,
      });
      seenIds.add(replayEventId);
    }
  }
  return output;
}
