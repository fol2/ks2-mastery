import { PHAETON_STAGE_THRESHOLDS, stageFor } from '../monsters.js';
import { branchForMonster, countMastered } from './shared.js';

export const PHAETON_SOURCE_MONSTER_IDS = Object.freeze(['inklet', 'glimmerbug']);

export function derivePhaeton(state) {
  const combined = PHAETON_SOURCE_MONSTER_IDS
    .reduce((sum, monsterId) => sum + countMastered(state, monsterId), 0);
  return {
    mastered: combined,
    stage: stageFor(combined, PHAETON_STAGE_THRESHOLDS),
    level: Math.min(10, Math.floor(combined / 20)),
    caught: combined >= 3,
    branch: branchForMonster(state, 'phaeton'),
    masteredList: [],
  };
}
