import { normaliseMonsterBranch } from './monsters.js';

// These two production learners are test accounts used for visual review.
// Pinning their monster branches keeps B1/B2 asset checks deterministic
// across subjects, resets, and future monster unlocks.
export const LEARNER_MONSTER_BRANCH_OVERRIDES = Object.freeze({
  '86a6c60f-e1ef-4985-954d-95ab13349c6f': 'b1', // Nelson
  'be3b6831-d7c3-4318-9560-02051dc67704': 'b2', // Eugenia
});

export function monsterBranchOverrideForLearner(learnerId) {
  if (typeof learnerId !== 'string' || !learnerId) return null;
  return normaliseMonsterBranch(LEARNER_MONSTER_BRANCH_OVERRIDES[learnerId], null);
}

