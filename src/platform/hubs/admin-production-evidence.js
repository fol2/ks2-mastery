// P5 Unit 4: Production Evidence panel — pure logic module.
//
// Provides a closed certification taxonomy (EVIDENCE_STATES) and functions to
// classify individual evidence metrics and build the full panel model.
// The React panel (AdminProductionEvidencePanel.jsx) consumes this model.

/** Closed evidence state enum. */
export const EVIDENCE_STATES = Object.freeze({
  NOT_AVAILABLE: 'not_available',
  STALE: 'stale',
  FAILING: 'failing',
  SMOKE_PASS: 'smoke_pass',
  SMALL_PILOT_PROVISIONAL: 'small_pilot_provisional',
  CERTIFIED_30: 'certified_30_learner_beta',
  CERTIFIED_60: 'certified_60_learner_stretch',
  CERTIFIED_100: 'certified_100_plus',
  UNKNOWN: 'unknown',
});

const VALID_STATES = new Set(Object.values(EVIDENCE_STATES));

/** Fresh threshold: 24 hours in milliseconds. */
export const EVIDENCE_FRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Type guard: rejects any value not in the closed taxonomy.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidEvidenceState(value) {
  return VALID_STATES.has(value);
}

/**
 * Classify a single evidence metric into one of the EVIDENCE_STATES values.
 *
 * @param {string} metricKey — the metric tier key (e.g. 'certified_30_learner_beta')
 * @param {object|null} metricValue — the metric summary object from the evidence summary
 * @param {string|null} generatedAt — ISO timestamp of when the summary was generated
 * @param {number} now — current time in ms (Date.now())
 * @returns {string} one of EVIDENCE_STATES values
 */
export function classifyEvidenceMetric(metricKey, metricValue, generatedAt, now) {
  if (!metricValue || typeof metricValue !== 'object') {
    return EVIDENCE_STATES.NOT_AVAILABLE;
  }

  // Check freshness of the summary generation time.
  const generatedAtMs = generatedAt ? new Date(generatedAt).getTime() : 0;
  if (!generatedAtMs || !Number.isFinite(generatedAtMs)) {
    return EVIDENCE_STATES.STALE;
  }
  const ageMs = now - generatedAtMs;
  if (ageMs > EVIDENCE_FRESH_THRESHOLD_MS) {
    return EVIDENCE_STATES.STALE;
  }

  // Dry-run evidence is not certifiable.
  if (metricValue.dryRun) {
    return EVIDENCE_STATES.UNKNOWN;
  }

  // Failing: evidence file exists but did not pass.
  if (!metricValue.ok || (Array.isArray(metricValue.failures) && metricValue.failures.length > 0)) {
    return EVIDENCE_STATES.FAILING;
  }

  // Map tier key to state. Only known tiers can produce certified states.
  // Schema 3 adds admin_smoke and bootstrap_smoke as SMOKE_PASS-tier sources.
  const tierMap = {
    smoke_pass: EVIDENCE_STATES.SMOKE_PASS,
    admin_smoke: EVIDENCE_STATES.SMOKE_PASS,
    bootstrap_smoke: EVIDENCE_STATES.SMOKE_PASS,
    small_pilot_provisional: EVIDENCE_STATES.SMALL_PILOT_PROVISIONAL,
    certified_30_learner_beta: EVIDENCE_STATES.CERTIFIED_30,
    certified_60_learner_stretch: EVIDENCE_STATES.CERTIFIED_60,
    certified_100_plus: EVIDENCE_STATES.CERTIFIED_100,
  };

  return tierMap[metricKey] || EVIDENCE_STATES.UNKNOWN;
}

/**
 * Build the full evidence panel model from the summary JSON.
 *
 * @param {object} summaryJson — the parsed latest-evidence-summary.json
 * @param {number} now — current time in ms (Date.now())
 * @returns {{ metrics: Array, generatedAt: string|null, isFresh: boolean, overallState: string }}
 */
export function buildEvidencePanelModel(summaryJson, now) {
  const summary = summaryJson && typeof summaryJson === 'object' ? summaryJson : {};
  const rawMetrics = summary.metrics && typeof summary.metrics === 'object' ? summary.metrics : {};
  const generatedAt = summary.generatedAt || null;
  // Schema 3 adds a sources manifest; schema 2 omits it — default to null.
  const sources = summary.sources && typeof summary.sources === 'object' ? summary.sources : null;

  // Determine freshness.
  const generatedAtMs = generatedAt ? new Date(generatedAt).getTime() : 0;
  const isFresh = Boolean(
    generatedAtMs &&
    Number.isFinite(generatedAtMs) &&
    (now - generatedAtMs) <= EVIDENCE_FRESH_THRESHOLD_MS,
  );

  // Classify each metric.
  const metrics = Object.entries(rawMetrics).map(([key, value]) => ({
    key,
    tier: value?.tier || key,
    state: classifyEvidenceMetric(key, value, generatedAt, now),
    ok: Boolean(value?.ok),
    learners: value?.learners ?? null,
    finishedAt: value?.finishedAt || null,
    commit: value?.commit || null,
    failures: Array.isArray(value?.failures) ? value.failures : [],
    fileName: value?.fileName || null,
  }));

  // Overall state: highest-tier passing state, or the most severe problem.
  const overallState = deriveOverallState(metrics, isFresh);

  return { metrics, generatedAt, isFresh, overallState, sources };
}

/**
 * Derive the overall panel state from classified metrics.
 * Priority: highest certified tier wins, else failing > stale > not_available.
 */
function deriveOverallState(metrics, isFresh) {
  if (!isFresh) return EVIDENCE_STATES.STALE;
  if (metrics.length === 0) return EVIDENCE_STATES.NOT_AVAILABLE;

  // Tier rank (higher = better).
  const TIER_RANK = {
    [EVIDENCE_STATES.CERTIFIED_100]: 7,
    [EVIDENCE_STATES.CERTIFIED_60]: 6,
    [EVIDENCE_STATES.CERTIFIED_30]: 5,
    [EVIDENCE_STATES.SMALL_PILOT_PROVISIONAL]: 4,
    [EVIDENCE_STATES.SMOKE_PASS]: 3,
    [EVIDENCE_STATES.UNKNOWN]: 2,
    [EVIDENCE_STATES.FAILING]: 1,
    [EVIDENCE_STATES.STALE]: 0,
    [EVIDENCE_STATES.NOT_AVAILABLE]: -1,
  };

  let best = EVIDENCE_STATES.NOT_AVAILABLE;
  let bestRank = -1;
  let hasFailing = false;

  for (const m of metrics) {
    const rank = TIER_RANK[m.state] ?? -1;
    if (rank > bestRank) {
      bestRank = rank;
      best = m.state;
    }
    if (m.state === EVIDENCE_STATES.FAILING) hasFailing = true;
  }

  // If the best state is still non-passing but we have failures, surface that.
  if (bestRank <= 2 && hasFailing) return EVIDENCE_STATES.FAILING;

  return best;
}
