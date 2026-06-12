import { PHAETON_STAGE_THRESHOLDS, stageFor } from '../monsters.js';
import { branchForMonster, countMastered } from './shared.js';
import {
  sourceMonsterIdsForRewardTrack,
  spellingRewardTrackForMonster,
  thresholdsForRewardTrack,
} from '../reward-track-config.js';

const PHAETON_REWARD_TRACK = spellingRewardTrackForMonster('phaeton');

export const PHAETON_SOURCE_MONSTER_IDS = Object.freeze(
  sourceMonsterIdsForRewardTrack(PHAETON_REWARD_TRACK)
    .filter((monsterId) => monsterId && monsterId !== 'phaeton'),
);

export function derivePhaeton(state) {
  const combined = PHAETON_SOURCE_MONSTER_IDS
    .reduce((sum, monsterId) => sum + countMastered(state, monsterId), 0);
  const thresholds = PHAETON_REWARD_TRACK
    ? thresholdsForRewardTrack(PHAETON_REWARD_TRACK)
    : PHAETON_STAGE_THRESHOLDS;
  return {
    mastered: combined,
    stage: stageFor(combined, thresholds),
    level: Math.min(10, Math.floor(combined / 20)),
    caught: combined >= 3,
    branch: branchForMonster(state, 'phaeton'),
    masteredList: [],
    ...(PHAETON_REWARD_TRACK ? {
      rewardTrackId: PHAETON_REWARD_TRACK.id,
      progressKey: PHAETON_REWARD_TRACK.progressKey || 'phaeton',
    } : {}),
  };
}
