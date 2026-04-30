// shared/hero/warning-conditions.js
// ── pA4 §12 Warning Condition Detection Functions ───────────────────
//
// 9 pure analysis functions — each takes cohort metrics/summary data and returns:
//   { flagged: boolean, condition: string, severity: 'warning', detail: string, recommendation: string }
//
// Unlike stop conditions (hard blocks), warnings are product-health signals
// that require an owner and decision before widening.
//
// Zero side effects. No I/O. Handles null/undefined gracefully.

// ── 1. Low Start Rate ───────────────────────────────────────────────

/**
 * Detect low Hero Quest start rate (few children who see the quest actually begin it).
 *
 * @param {{ questShownCount: number, questStartCount: number, threshold?: number }} params
 * @returns {{ flagged: boolean, condition: string, severity?: string, detail?: string, recommendation?: string }}
 */
export function detectLowStartRate(params) {
  if (params == null || typeof params !== 'object') {
    return { flagged: false, condition: 'low-start-rate' };
  }
  const { questShownCount, questStartCount, threshold = 0.3 } = params;
  if (questShownCount == null || questStartCount == null || questShownCount <= 0) {
    return { flagged: false, condition: 'low-start-rate' };
  }
  const rate = questStartCount / questShownCount;
  if (rate < threshold) {
    return {
      flagged: true,
      condition: 'low-start-rate',
      severity: 'warning',
      detail: `start rate ${(rate * 100).toFixed(1)}% is below ${(threshold * 100).toFixed(1)}% threshold (${questStartCount}/${questShownCount})`,
      recommendation: 'Review Hero Quest entry point copy for clarity and visibility of the start action',
    };
  }
  return { flagged: false, condition: 'low-start-rate' };
}

// ── 2. Low Completion Rate ──────────────────────────────────────────

/**
 * Detect low Hero Quest completion rate (children start but do not finish).
 *
 * @param {{ questStartCount: number, questCompleteCount: number, threshold?: number }} params
 * @returns {{ flagged: boolean, condition: string, severity?: string, detail?: string, recommendation?: string }}
 */
export function detectLowCompletionRate(params) {
  if (params == null || typeof params !== 'object') {
    return { flagged: false, condition: 'low-completion-rate' };
  }
  const { questStartCount, questCompleteCount, threshold = 0.4 } = params;
  if (questStartCount == null || questCompleteCount == null || questStartCount <= 0) {
    return { flagged: false, condition: 'low-completion-rate' };
  }
  const rate = questCompleteCount / questStartCount;
  if (rate < threshold) {
    return {
      flagged: true,
      condition: 'low-completion-rate',
      severity: 'warning',
      detail: `completion rate ${(rate * 100).toFixed(1)}% is below ${(threshold * 100).toFixed(1)}% threshold (${questCompleteCount}/${questStartCount})`,
      recommendation: 'Investigate quest length and difficulty — consider shorter quests or mid-quest encouragement',
    };
  }
  return { flagged: false, condition: 'low-completion-rate' };
}

// ── 3. Repeated Abandonment ─────────────────────────────────────────

/**
 * Detect repeated abandonment after first task (children leave without progressing).
 *
 * @param {{ abandonmentPoints: number, threshold?: number }} params
 * @returns {{ flagged: boolean, condition: string, severity?: string, detail?: string, recommendation?: string }}
 */
export function detectRepeatedAbandonment(params) {
  if (params == null || typeof params !== 'object') {
    return { flagged: false, condition: 'repeated-abandonment' };
  }
  const { abandonmentPoints, threshold = 3 } = params;
  if (abandonmentPoints == null || typeof abandonmentPoints !== 'number') {
    return { flagged: false, condition: 'repeated-abandonment' };
  }
  if (abandonmentPoints >= threshold) {
    return {
      flagged: true,
      condition: 'repeated-abandonment',
      severity: 'warning',
      detail: `${abandonmentPoints} abandonment point(s) after first task (threshold=${threshold})`,
      recommendation: 'Review first-task onboarding experience — ensure the initial task is engaging and achievable',
    };
  }
  return { flagged: false, condition: 'repeated-abandonment' };
}

// ── 4. Camp Before Learning ─────────────────────────────────────────

/**
 * Detect children opening Camp but not starting learning (spending without earning pattern).
 *
 * @param {{ campOpenCount: number, questStartCount: number, ratio?: number }} params
 * @returns {{ flagged: boolean, condition: string, severity?: string, detail?: string, recommendation?: string }}
 */
export function detectCampBeforeLearning(params) {
  if (params == null || typeof params !== 'object') {
    return { flagged: false, condition: 'camp-before-learning' };
  }
  const { campOpenCount, questStartCount, ratio = 0.5 } = params;
  if (campOpenCount == null || questStartCount == null) {
    return { flagged: false, condition: 'camp-before-learning' };
  }
  if (questStartCount <= 0 && campOpenCount > 0) {
    return {
      flagged: true,
      condition: 'camp-before-learning',
      severity: 'warning',
      detail: `${campOpenCount} Camp opens with 0 quest starts — children spending without earning`,
      recommendation: 'Review Camp entry flow — guide children to quest completion before Camp access',
    };
  }
  if (questStartCount > 0 && campOpenCount / questStartCount > ratio) {
    return {
      flagged: true,
      condition: 'camp-before-learning',
      severity: 'warning',
      detail: `Camp-to-quest ratio ${(campOpenCount / questStartCount).toFixed(2)} exceeds ${ratio} threshold (${campOpenCount} opens / ${questStartCount} starts)`,
      recommendation: 'Review Camp entry flow — guide children to quest completion before Camp access',
    };
  }
  return { flagged: false, condition: 'camp-before-learning' };
}

// ── 5. Coin Misunderstanding ────────────────────────────────────────

/**
 * Detect parents misunderstanding Hero Coins (support reports mentioning coin-related keywords).
 *
 * @param {{ supportReports: Array<{ text: string }>, keyword?: string }} params
 * @returns {{ flagged: boolean, condition: string, severity?: string, detail?: string, recommendation?: string }}
 */
export function detectCoinMisunderstanding(params) {
  if (params == null || typeof params !== 'object') {
    return { flagged: false, condition: 'coin-misunderstanding' };
  }
  const { supportReports, keyword = 'coins' } = params;
  if (!Array.isArray(supportReports) || supportReports.length === 0) {
    return { flagged: false, condition: 'coin-misunderstanding' };
  }
  const lowerKeyword = keyword.toLowerCase();
  const matches = supportReports.filter(
    (r) => r && typeof r.text === 'string' && r.text.toLowerCase().includes(lowerKeyword)
  );
  if (matches.length > 0) {
    return {
      flagged: true,
      condition: 'coin-misunderstanding',
      severity: 'warning',
      detail: `${matches.length} support report(s) mention "${keyword}"`,
      recommendation: 'Review parent-facing coin explainer copy — clarify that Hero Coins are virtual with no monetary value',
    };
  }
  return { flagged: false, condition: 'coin-misunderstanding' };
}

// ── 6. Telemetry Blind Spots ────────────────────────────────────────

/**
 * Detect telemetry blind spots (expected signals not being received).
 *
 * @param {{ expectedSignals: string[], actualSignals: string[] }} params
 * @returns {{ flagged: boolean, condition: string, severity?: string, detail?: string, recommendation?: string }}
 */
export function detectTelemetryBlindSpots(params) {
  if (params == null || typeof params !== 'object') {
    return { flagged: false, condition: 'telemetry-blind-spots' };
  }
  const { expectedSignals, actualSignals } = params;
  if (!Array.isArray(expectedSignals) || !Array.isArray(actualSignals)) {
    return { flagged: false, condition: 'telemetry-blind-spots' };
  }
  const actualSet = new Set(actualSignals);
  const missing = expectedSignals.filter((s) => !actualSet.has(s));
  if (missing.length > 0) {
    return {
      flagged: true,
      condition: 'telemetry-blind-spots',
      severity: 'warning',
      detail: `${missing.length} expected signal(s) not received: ${missing.join(', ')}`,
      recommendation: 'Instrument missing telemetry events before widening cohort — blind spots prevent incident detection',
    };
  }
  return { flagged: false, condition: 'telemetry-blind-spots' };
}

// ── 7. Subject Dominance ────────────────────────────────────────────

/**
 * Detect one subject dominating the schedule (imbalanced quest distribution).
 *
 * @param {{ subjectMix: Record<string, number>, dominanceThreshold?: number }} params
 * @returns {{ flagged: boolean, condition: string, severity?: string, detail?: string, recommendation?: string }}
 */
export function detectSubjectDominance(params) {
  if (params == null || typeof params !== 'object') {
    return { flagged: false, condition: 'subject-dominance' };
  }
  const { subjectMix, dominanceThreshold = 0.7 } = params;
  if (!subjectMix || typeof subjectMix !== 'object') {
    return { flagged: false, condition: 'subject-dominance' };
  }
  const entries = Object.entries(subjectMix);
  if (entries.length === 0) {
    return { flagged: false, condition: 'subject-dominance' };
  }
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total <= 0) {
    return { flagged: false, condition: 'subject-dominance' };
  }
  for (const [subject, count] of entries) {
    const share = count / total;
    if (share >= dominanceThreshold) {
      return {
        flagged: true,
        condition: 'subject-dominance',
        severity: 'warning',
        detail: `"${subject}" accounts for ${(share * 100).toFixed(1)}% of scheduled quests (threshold=${(dominanceThreshold * 100).toFixed(1)}%)`,
        recommendation: 'Review scheduler weighting — ensure variety across subjects to maintain engagement',
      };
    }
  }
  return { flagged: false, condition: 'subject-dominance' };
}

// ── 8. Support Cluster ──────────────────────────────────────────────

/**
 * Detect support questions clustering around one area (single category dominates).
 *
 * @param {{ supportCategories: Record<string, number>, clusterThreshold?: number }} params
 * @returns {{ flagged: boolean, condition: string, severity?: string, detail?: string, recommendation?: string }}
 */
export function detectSupportCluster(params) {
  if (params == null || typeof params !== 'object') {
    return { flagged: false, condition: 'support-cluster' };
  }
  const { supportCategories, clusterThreshold = 0.5 } = params;
  if (!supportCategories || typeof supportCategories !== 'object') {
    return { flagged: false, condition: 'support-cluster' };
  }
  const entries = Object.entries(supportCategories);
  if (entries.length === 0) {
    return { flagged: false, condition: 'support-cluster' };
  }
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total <= 0) {
    return { flagged: false, condition: 'support-cluster' };
  }
  for (const [category, count] of entries) {
    const share = count / total;
    if (share > clusterThreshold) {
      return {
        flagged: true,
        condition: 'support-cluster',
        severity: 'warning',
        detail: `"${category}" accounts for ${(share * 100).toFixed(1)}% of support queries (threshold=${(clusterThreshold * 100).toFixed(1)}%)`,
        recommendation: `Investigate "${category}" support cluster — may indicate UX confusion or missing documentation`,
      };
    }
  }
  return { flagged: false, condition: 'support-cluster' };
}

// ── 9. Slow Performance ─────────────────────────────────────────────

/**
 * Detect performance slower than ideal but not failing (latency warning).
 *
 * @param {{ latencyMs: number, threshold?: number }} params
 * @returns {{ flagged: boolean, condition: string, severity?: string, detail?: string, recommendation?: string }}
 */
export function detectSlowPerformance(params) {
  if (params == null || typeof params !== 'object') {
    return { flagged: false, condition: 'slow-performance' };
  }
  const { latencyMs, threshold = 2000 } = params;
  if (latencyMs == null || typeof latencyMs !== 'number') {
    return { flagged: false, condition: 'slow-performance' };
  }
  if (latencyMs >= threshold) {
    return {
      flagged: true,
      condition: 'slow-performance',
      severity: 'warning',
      detail: `latency ${latencyMs}ms exceeds ${threshold}ms threshold`,
      recommendation: 'Profile Hero critical path — check for unnecessary recomputation or unoptimised queries',
    };
  }
  return { flagged: false, condition: 'slow-performance' };
}

// ── Convenience: Evaluate All Warnings ──────────────────────────────

/**
 * Run all 9 warning checks against cohort metrics and return only flagged results.
 *
 * @param {object} cohortMetrics — object with fields consumed by individual detectors
 * @returns {Array<{ flagged: true, condition: string, severity: string, detail: string, recommendation: string }>}
 */
export function evaluateAllWarnings(cohortMetrics) {
  if (!cohortMetrics || typeof cohortMetrics !== 'object') {
    return [];
  }
  const checks = [
    detectLowStartRate(cohortMetrics),
    detectLowCompletionRate(cohortMetrics),
    detectRepeatedAbandonment(cohortMetrics),
    detectCampBeforeLearning(cohortMetrics),
    detectCoinMisunderstanding(cohortMetrics),
    detectTelemetryBlindSpots(cohortMetrics),
    detectSubjectDominance(cohortMetrics),
    detectSupportCluster(cohortMetrics),
    detectSlowPerformance(cohortMetrics),
  ];
  return checks.filter((r) => r.flagged);
}
