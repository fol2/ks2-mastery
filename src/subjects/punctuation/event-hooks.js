import {
  createPunctuationContentIndexes,
  PUNCTUATION_CONTENT_MANIFEST,
} from '../../../shared/punctuation/content.js';
import { PUNCTUATION_EVENT_TYPES } from '../../../shared/punctuation/events.js';
import { recordPunctuationRewardUnitMastery } from '../../platform/game/monster-system.js';

function clusterTotals(indexes) {
  const totals = {};
  for (const unit of indexes.publishedRewardUnits) {
    const cluster = indexes.clusterById.get(unit.clusterId);
    if (!cluster?.monsterId) continue;
    totals[cluster.monsterId] = (totals[cluster.monsterId] || 0) + 1;
  }
  return totals;
}

export function createPunctuationRewardSubscriber({
  gameStateRepository,
  manifest = PUNCTUATION_CONTENT_MANIFEST,
  random = Math.random,
} = {}) {
  const indexes = createPunctuationContentIndexes(manifest);
  const totals = clusterTotals(indexes);
  const aggregatePublishedTotal = indexes.publishedRewardUnits.length;

  return function punctuationRewardSubscriber(events = []) {
    const rewardEvents = [];
    for (const event of Array.isArray(events) ? events : []) {
      if (!event || event.type !== PUNCTUATION_EVENT_TYPES.UNIT_SECURED) continue;
      const unit = indexes.rewardUnitByKey.get(event.masteryKey)
        || indexes.rewardUnitById.get(event.rewardUnitId);
      const cluster = indexes.clusterById.get(event.clusterId || unit?.clusterId);
      if (!unit?.published || !cluster?.monsterId) continue;
      rewardEvents.push(
        ...recordPunctuationRewardUnitMastery({
          learnerId: event.learnerId,
          releaseId: event.releaseId || unit.releaseId,
          clusterId: unit.clusterId,
          rewardUnitId: unit.rewardUnitId,
          masteryKey: unit.masteryKey,
          monsterId: cluster.monsterId,
          publishedTotal: totals[cluster.monsterId] || 1,
          aggregatePublishedTotal,
          createdAt: event.createdAt,
          gameStateRepository,
          random,
        }),
      );
    }
    return rewardEvents;
  };
}

export function rewardEventsFromPunctuationEvents(events, options = {}) {
  return createPunctuationRewardSubscriber(options)(events);
}
