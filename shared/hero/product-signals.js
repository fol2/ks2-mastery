// ── Hero Product Signals — pure analysis functions ────────────────────
// Zero side-effects. No imports from worker/, src/, or node: built-ins.
// Implements §13.2 product metrics: rates, distribution, farming, abandonment.

// ── Core Rate Calculations ──────────────────────────────────────────

/**
 * Quest start rate: proportion of learners who started after being shown.
 * @param {{ questShownCount: number, questStartCount: number }} input
 * @returns {number} Rate between 0 and 1, or 0 if input invalid
 */
export function calculateStartRate({ questShownCount, questStartCount } = {}) {
  if (!questShownCount || questShownCount <= 0) return 0;
  if (!questStartCount || questStartCount < 0) return 0;
  return Math.min(questStartCount / questShownCount, 1);
}

/**
 * Quest completion rate: proportion of started quests that completed.
 * @param {{ questStartCount: number, dailyCompleteCount: number }} input
 * @returns {number} Rate between 0 and 1, or 0 if input invalid
 */
export function calculateCompletionRate({ questStartCount, dailyCompleteCount } = {}) {
  if (!questStartCount || questStartCount <= 0) return 0;
  if (!dailyCompleteCount || dailyCompleteCount < 0) return 0;
  return Math.min(dailyCompleteCount / questStartCount, 1);
}

/**
 * Day-over-day return rate: proportion of active learner-days with next-day return.
 * @param {{ activeLearnerDays: number, returnNextDayCount: number }} input
 * @returns {number} Rate between 0 and 1, or 0 if input invalid
 */
export function calculateReturnRate({ activeLearnerDays, returnNextDayCount } = {}) {
  if (!activeLearnerDays || activeLearnerDays <= 0) return 0;
  if (!returnNextDayCount || returnNextDayCount < 0) return 0;
  return Math.min(returnNextDayCount / activeLearnerDays, 1);
}

// ── Distribution Analysis ───────────────────────────────────────────

/**
 * Analyse subject mix from task completions.
 * @param {{ taskCompletions: Record<string, number> }} input
 * @returns {{ distribution: Record<string, number>, imbalanced: boolean, dominantSubject: string|null }}
 */
export function analyseSubjectMix({ taskCompletions } = {}) {
  const neutral = { distribution: {}, imbalanced: false, dominantSubject: null };
  if (!taskCompletions || typeof taskCompletions !== 'object') return neutral;

  const subjects = Object.keys(taskCompletions);
  if (subjects.length === 0) return neutral;

  const total = subjects.reduce((sum, k) => sum + (taskCompletions[k] || 0), 0);
  if (total === 0) return neutral;

  const distribution = {};
  for (const subject of subjects) {
    distribution[subject] = (taskCompletions[subject] || 0) / total;
  }

  // Imbalanced: any single subject accounts for >70% of all completions
  // (only meaningful when there are multiple subjects)
  let dominantSubject = null;
  let imbalanced = false;

  if (subjects.length > 1) {
    for (const subject of subjects) {
      if (distribution[subject] > 0.7) {
        imbalanced = true;
        dominantSubject = subject;
        break;
      }
    }
  }

  return { distribution, imbalanced, dominantSubject };
}

/**
 * Analyse task intent distribution (practice, review, strengthen).
 * @param {{ taskCompletions: Record<string, number> }} input
 * @returns {{ distribution: Record<string, number>, balanced: boolean }}
 */
export function analyseTaskIntentMix({ taskCompletions } = {}) {
  const neutral = { distribution: {}, balanced: true };
  if (!taskCompletions || typeof taskCompletions !== 'object') return neutral;

  const intents = Object.keys(taskCompletions);
  if (intents.length === 0) return neutral;

  const total = intents.reduce((sum, k) => sum + (taskCompletions[k] || 0), 0);
  if (total === 0) return neutral;

  const distribution = {};
  for (const intent of intents) {
    distribution[intent] = taskCompletions[intent] || 0;
  }

  // Balanced: no single intent exceeds 80% of all completions
  let balanced = true;
  for (const intent of intents) {
    if (intents.length > 1 && (distribution[intent] / total) > 0.8) {
      balanced = false;
      break;
    }
  }

  return { distribution, balanced };
}

// ── Abandonment Analysis ────────────────────────────────────────────

/**
 * Detect abandonment points from quest session data.
 * @param {{ questSessions: Array<{ abandonedAtStep: string|null }> }} input
 * @returns {Array<{ step: string, count: number, percentage: number }>}
 */
export function detectAbandonmentPoints({ questSessions } = {}) {
  if (!questSessions || !Array.isArray(questSessions) || questSessions.length === 0) {
    return [];
  }

  const abandonedSessions = questSessions.filter(s => s && s.abandonedAtStep);
  if (abandonedSessions.length === 0) return [];

  const stepCounts = {};
  for (const session of abandonedSessions) {
    const step = session.abandonedAtStep;
    stepCounts[step] = (stepCounts[step] || 0) + 1;
  }

  const totalSessions = questSessions.length;
  return Object.entries(stepCounts)
    .map(([step, count]) => ({
      step,
      count,
      percentage: count / totalSessions,
    }))
    .sort((a, b) => b.count - a.count);
}

// ── Reward Farming Detection ────────────────────────────────────────

/**
 * Detect reward farming: repeated claims within a short time window.
 * Farming is flagged when `threshold` or more claims occur within `windowMs`.
 *
 * @param {{ claimTimestamps: number[], threshold?: number, windowMs?: number }} input
 * @returns {{ detected: boolean, detail: string, instances: Array<{ windowStart: number, windowEnd: number, count: number }> }}
 */
export function detectRewardFarming({ claimTimestamps, threshold = 3, windowMs = 300000 } = {}) {
  const none = { detected: false, detail: 'No farming detected', instances: [] };

  if (!claimTimestamps || !Array.isArray(claimTimestamps) || claimTimestamps.length < threshold) {
    return none;
  }

  // Sort timestamps ascending
  const sorted = [...claimTimestamps].sort((a, b) => a - b);
  const instances = [];

  // Sliding window: for each timestamp, look ahead to find clusters
  for (let i = 0; i <= sorted.length - threshold; i++) {
    const windowStart = sorted[i];
    const windowEnd = windowStart + windowMs;

    // Count claims within this window
    let count = 0;
    for (let j = i; j < sorted.length && sorted[j] <= windowEnd; j++) {
      count++;
    }

    if (count >= threshold) {
      // Avoid duplicate instance reports for overlapping windows
      const alreadyReported = instances.some(
        inst => inst.windowStart === windowStart,
      );
      if (!alreadyReported) {
        instances.push({ windowStart, windowEnd, count });
      }
    }
  }

  if (instances.length === 0) return none;

  return {
    detected: true,
    detail: `${instances.length} farming instance(s): ${instances[0].count} claims within ${windowMs / 1000}s window`,
    instances,
  };
}

// ── Camp Engagement Analysis ────────────────────────────────────────

/**
 * Analyse Camp usage from event stream.
 * @param {{ campEvents: Array<{ type: string, afterCompletion?: boolean }> }} input
 * @returns {{ openCount: number, inviteCount: number, growCount: number, insufficientCount: number, usageAfterCompletion: boolean }}
 */
export function analyseCampUsage({ campEvents } = {}) {
  const neutral = { openCount: 0, inviteCount: 0, growCount: 0, insufficientCount: 0, usageAfterCompletion: false };
  if (!campEvents || !Array.isArray(campEvents) || campEvents.length === 0) {
    return neutral;
  }

  let openCount = 0;
  let inviteCount = 0;
  let growCount = 0;
  let insufficientCount = 0;
  let usageAfterCompletion = false;

  for (const event of campEvents) {
    if (!event || !event.type) continue;

    switch (event.type) {
      case 'open': openCount++; break;
      case 'invite': inviteCount++; break;
      case 'grow': growCount++; break;
      case 'insufficient': insufficientCount++; break;
    }

    if (event.afterCompletion) {
      usageAfterCompletion = true;
    }
  }

  return { openCount, inviteCount, growCount, insufficientCount, usageAfterCompletion };
}

// ── Convenience Aggregator ──────────────────────────────────────────

/**
 * Build a complete product signals summary from cohort data.
 * @param {object} cohortData
 * @returns {object} Structured product metrics summary
 */
export function buildProductSignalsSummary(cohortData) {
  if (!cohortData || typeof cohortData !== 'object') {
    return {
      startRate: 0,
      completionRate: 0,
      returnRate: 0,
      subjectMix: { distribution: {}, imbalanced: false, dominantSubject: null },
      taskIntentMix: { distribution: {}, balanced: true },
      abandonmentPoints: [],
      rewardFarming: { detected: false, detail: 'No farming detected', instances: [] },
      campUsage: { openCount: 0, inviteCount: 0, growCount: 0, insufficientCount: 0, usageAfterCompletion: false },
    };
  }

  return {
    startRate: calculateStartRate({
      questShownCount: cohortData.questShownCount,
      questStartCount: cohortData.questStartCount,
    }),
    completionRate: calculateCompletionRate({
      questStartCount: cohortData.questStartCount,
      dailyCompleteCount: cohortData.dailyCompleteCount,
    }),
    returnRate: calculateReturnRate({
      activeLearnerDays: cohortData.activeLearnerDays,
      returnNextDayCount: cohortData.returnNextDayCount,
    }),
    subjectMix: analyseSubjectMix({
      taskCompletions: cohortData.subjectCompletions,
    }),
    taskIntentMix: analyseTaskIntentMix({
      taskCompletions: cohortData.taskIntentCompletions,
    }),
    abandonmentPoints: detectAbandonmentPoints({
      questSessions: cohortData.questSessions,
    }),
    rewardFarming: detectRewardFarming({
      claimTimestamps: cohortData.claimTimestamps,
      threshold: cohortData.farmingThreshold,
      windowMs: cohortData.farmingWindowMs,
    }),
    campUsage: analyseCampUsage({
      campEvents: cohortData.campEvents,
    }),
  };
}
