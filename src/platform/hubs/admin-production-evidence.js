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
  NON_CERTIFYING: 'non_certifying',
  PREFLIGHT_ONLY: 'preflight_only',
  SMOKE_PASS: 'smoke_pass',
  SMALL_PILOT_PROVISIONAL: 'small_pilot_provisional',
  CERTIFIED_30: 'certified_30_learner_beta',
  CERTIFIED_60: 'certified_60_learner_stretch',
  CERTIFIED_100: 'certified_100_plus',
  UNKNOWN: 'unknown',
});

const VALID_STATES = new Set(Object.values(EVIDENCE_STATES));
const CERTIFICATION_STATES = new Set([
  EVIDENCE_STATES.CERTIFIED_30,
  EVIDENCE_STATES.CERTIFIED_60,
  EVIDENCE_STATES.CERTIFIED_100,
]);
const CAPACITY_METRIC_KEYS = new Set([
  'smoke_pass',
  'small_pilot_provisional',
  'certified_30_learner_beta',
  'certified_60_learner_stretch',
  'certified_100_plus',
]);

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
 * @param {string|null} generatedAt — retained for backwards-compatible call sites
 * @param {number} now — current time in ms (Date.now())
 * @returns {string} one of EVIDENCE_STATES values
 */
export function classifyEvidenceMetric(metricKey, metricValue, generatedAt, now) {
  if (!metricValue || typeof metricValue !== 'object') {
    return EVIDENCE_STATES.NOT_AVAILABLE;
  }

  // Evidence freshness is tied to the run completion time, not the summary
  // build time. Regenerating latest-evidence-summary.json must never refresh
  // an old certification run.
  const finishedAtMs = metricValue.finishedAt ? new Date(metricValue.finishedAt).getTime() : 0;
  if (!finishedAtMs || !Number.isFinite(finishedAtMs)) {
    return EVIDENCE_STATES.STALE;
  }
  const ageMs = now - finishedAtMs;
  if (ageMs > EVIDENCE_FRESH_THRESHOLD_MS) {
    return EVIDENCE_STATES.STALE;
  }

  // Dry-runs, setup-blocked preflights, and invalid tier evidence cannot
  // promote certification, even when their filename mentions a tier.
  if (
    metricValue.dryRun
    || metricValue.status === 'non_certifying'
    || metricValue.evidenceKind === 'preflight'
  ) {
    return EVIDENCE_STATES.NON_CERTIFYING;
  }

  const thresholdViolations = Array.isArray(metricValue.thresholdViolations)
    ? metricValue.thresholdViolations
    : [];

  // Failing: evidence file exists but did not pass.
  if (
    metricValue.status === 'failed'
    || !metricValue.ok
    || (Array.isArray(metricValue.failures) && metricValue.failures.length > 0)
    || thresholdViolations.length > 0
  ) {
    return EVIDENCE_STATES.FAILING;
  }

  // Map tier key to state. Only known tiers can produce certified states.
  // Schema 3 adds admin_smoke and bootstrap_smoke as SMOKE_PASS-tier sources.
  // U1 (P7): preflight_only tier is a distinct non-certifying category.
  // U2 (P7): auxiliary posture sources (csp, d1, build, kpi) map to SMOKE_PASS
  // when passing — they are operational health checks, not certification tiers.
  const tierMap = {
    smoke_pass: EVIDENCE_STATES.SMOKE_PASS,
    admin_smoke: EVIDENCE_STATES.SMOKE_PASS,
    bootstrap_smoke: EVIDENCE_STATES.SMOKE_PASS,
    small_pilot_provisional: EVIDENCE_STATES.SMALL_PILOT_PROVISIONAL,
    certified_30_learner_beta: EVIDENCE_STATES.CERTIFIED_30,
    certified_60_learner_stretch: EVIDENCE_STATES.CERTIFIED_60,
    certified_100_plus: EVIDENCE_STATES.CERTIFIED_100,
    preflight_only: EVIDENCE_STATES.PREFLIGHT_ONLY,
    csp_status: EVIDENCE_STATES.SMOKE_PASS,
    d1_migrations: EVIDENCE_STATES.SMOKE_PASS,
    build_version: EVIDENCE_STATES.SMOKE_PASS,
    kpi_reconcile: EVIDENCE_STATES.SMOKE_PASS,
  };

  const mappedState = tierMap[metricKey] || EVIDENCE_STATES.UNKNOWN;
  if (CERTIFICATION_STATES.has(mappedState) && metricValue.certifying !== true) {
    return EVIDENCE_STATES.NON_CERTIFYING;
  }

  return mappedState;
}

// ---------------------------------------------------------------------------
// U2 (P7): Lane definitions for multi-lane evidence display.
// Each lane groups related metrics. Lane state is computed independently —
// no cross-lane rollup. Operator action copy assists triage.
// ---------------------------------------------------------------------------

/** @type {ReadonlyArray<{laneId: string, label: string, metricKeys: string[], actionCopy: string}>} */
export const LANE_DEFINITIONS = Object.freeze([
  {
    laneId: 'smoke',
    label: 'Smoke Tests',
    metricKeys: ['smoke_pass', 'admin_smoke', 'bootstrap_smoke'],
    actionCopy: 'Run admin smoke',
  },
  {
    laneId: 'capacity_certification',
    label: 'Capacity Certification',
    metricKeys: ['certified_30_learner_beta', 'certified_60_learner_stretch', 'certified_100_plus', 'small_pilot_provisional'],
    actionCopy: 'Run capacity certification',
  },
  {
    laneId: 'capacity_preflight',
    label: 'Capacity Preflight',
    metricKeys: ['preflight_only'],
    actionCopy: 'Run capacity preflight',
  },
  {
    laneId: 'security_posture',
    label: 'Security Posture',
    metricKeys: ['csp_status'],
    actionCopy: 'Check security headers',
  },
  {
    laneId: 'database_posture',
    label: 'Database Posture',
    metricKeys: ['d1_migrations'],
    actionCopy: 'Check D1 migrations',
  },
  {
    laneId: 'build_posture',
    label: 'Build Posture',
    metricKeys: ['build_version'],
    actionCopy: 'Check package version',
  },
  {
    laneId: 'admin_maintenance',
    label: 'Admin Maintenance',
    metricKeys: ['kpi_reconcile'],
    actionCopy: 'Run KPI reconcile',
  },
]);

/**
 * Build the full evidence panel model from the summary JSON.
 *
 * U2 (P7): returns a `lanes` array for multi-lane display alongside the
 * existing flat `metrics` array for backward compatibility.
 *
 * @param {object} summaryJson — the parsed latest-evidence-summary.json
 * @param {number} now — current time in ms (Date.now())
 * @returns {{ metrics: Array, lanes: Array, generatedAt: string|null, isFresh: boolean, overallState: string, schema: number }}
 */
export function buildEvidencePanelModel(summaryJson, now) {
  const summary = summaryJson && typeof summaryJson === 'object' ? summaryJson : {};
  const rawMetrics = summary.metrics && typeof summary.metrics === 'object' ? summary.metrics : {};
  const generatedAt = summary.generatedAt || null;
  const schema = summary.schema || null;
  // Schema 3 adds a sources manifest; schema 2 omits it — default to null.
  const sources = summary.sources && typeof summary.sources === 'object' ? summary.sources : null;

  const metrics = Object.entries(rawMetrics).map(([key, value]) => ({
    key,
    tier: value?.tier || key,
    state: classifyEvidenceMetric(key, value, generatedAt, now),
    isCapacityEvidence: CAPACITY_METRIC_KEYS.has(key),
    status: value?.status || null,
    ok: Boolean(value?.ok),
    certifying: value?.certifying === true,
    evidenceKind: value?.evidenceKind || null,
    decision: value?.decision || null,
    failureReason: value?.failureReason || null,
    learners: value?.learners ?? null,
    bootstrapBurst: value?.bootstrapBurst ?? null,
    rounds: value?.rounds ?? null,
    finishedAt: value?.finishedAt || null,
    finishedAtPrecision: value?.finishedAtPrecision || null,
    commit: value?.commit || null,
    failures: Array.isArray(value?.failures) ? value.failures : [],
    thresholdViolations: Array.isArray(value?.thresholdViolations) ? value.thresholdViolations : [],
    thresholdsPassed: value?.thresholdsPassed ?? null,
    certificationEligible: value?.certificationEligible ?? null,
    certificationReasons: Array.isArray(value?.certificationReasons) ? value.certificationReasons : [],
    fileName: value?.fileName || null,
  })).sort(compareMetricRows);

  // U1 (P7): Emit NOT_AVAILABLE rows for sources declared in the manifest
  // but not found on disk. These rows surface missing evidence to operators.
  if (sources) {
    for (const [sourceKey, sourceEntry] of Object.entries(sources)) {
      if (sourceEntry && sourceEntry.found === false) {
        const alreadyHasRow = metrics.some((m) => m.key === sourceKey);
        if (!alreadyHasRow) {
          metrics.push({
            key: sourceKey,
            tier: sourceKey,
            state: EVIDENCE_STATES.NOT_AVAILABLE,
            isCapacityEvidence: false,
            status: null,
            ok: false,
            certifying: false,
            evidenceKind: null,
            decision: null,
            failureReason: 'source-not-found',
            learners: null,
            bootstrapBurst: null,
            rounds: null,
            finishedAt: null,
            finishedAtPrecision: null,
            commit: null,
            failures: [],
            thresholdViolations: [],
            thresholdsPassed: null,
            certificationEligible: null,
            certificationReasons: [],
            fileName: sourceEntry.file || null,
          });
        }
      }
    }
  }

  const capacityMetrics = metrics.filter((metric) => metric.isCapacityEvidence);
  const latestEvidenceAt = latestMetricTimestamp(capacityMetrics);
  const isFresh = capacityMetrics.some((metric) => metric.state !== EVIDENCE_STATES.STALE);

  const overallState = deriveOverallState(capacityMetrics, isFresh);

  // U2 (P7): Build per-lane model. Each lane computes state independently.
  const metricsMap = new Map(metrics.map((m) => [m.key, m]));
  const lanes = LANE_DEFINITIONS.map((def) => {
    const rows = def.metricKeys
      .map((key) => metricsMap.get(key))
      .filter(Boolean);
    const laneState = deriveLaneState(rows);
    return {
      laneId: def.laneId,
      label: def.label,
      rows,
      overallState: laneState,
      actionCopy: def.actionCopy,
    };
  });

  return { metrics, lanes, generatedAt, latestEvidenceAt, isFresh, overallState, sources, schema };
}

/**
 * U2 (P7): Derive lane-level state from its rows independently.
 * A lane with no rows is NOT_AVAILABLE. A lane with any FAILING row is FAILING.
 * Otherwise the best (highest-rank) row state wins.
 */
function deriveLaneState(rows) {
  if (rows.length === 0) return EVIDENCE_STATES.NOT_AVAILABLE;
  let hasFailing = false;
  let hasStale = false;
  let hasPassing = false;
  let hasNonCertifying = false;

  for (const row of rows) {
    if (row.state === EVIDENCE_STATES.FAILING) hasFailing = true;
    else if (row.state === EVIDENCE_STATES.STALE) hasStale = true;
    else if (
      row.state === EVIDENCE_STATES.NON_CERTIFYING
      || row.state === EVIDENCE_STATES.PREFLIGHT_ONLY
    ) hasNonCertifying = true;
    else if (
      row.state === EVIDENCE_STATES.SMOKE_PASS
      || row.state === EVIDENCE_STATES.SMALL_PILOT_PROVISIONAL
      || row.state === EVIDENCE_STATES.CERTIFIED_30
      || row.state === EVIDENCE_STATES.CERTIFIED_60
      || row.state === EVIDENCE_STATES.CERTIFIED_100
    ) hasPassing = true;
  }

  if (hasFailing) return EVIDENCE_STATES.FAILING;
  if (hasPassing) return EVIDENCE_STATES.SMOKE_PASS;
  if (hasStale) return EVIDENCE_STATES.STALE;
  if (hasNonCertifying) return EVIDENCE_STATES.NON_CERTIFYING;
  return EVIDENCE_STATES.NOT_AVAILABLE;
}

/**
 * Derive the overall panel state from classified metrics.
 * Priority: highest certified tier wins, else failing > stale > not_available.
 */
function deriveOverallState(metrics, isFresh) {
  if (metrics.length === 0) return EVIDENCE_STATES.NOT_AVAILABLE;
  if (!isFresh) return EVIDENCE_STATES.STALE;

  // Tier rank (higher = better).
  const TIER_RANK = {
    [EVIDENCE_STATES.CERTIFIED_100]: 7,
    [EVIDENCE_STATES.CERTIFIED_60]: 6,
    [EVIDENCE_STATES.CERTIFIED_30]: 5,
    [EVIDENCE_STATES.SMALL_PILOT_PROVISIONAL]: 4,
    [EVIDENCE_STATES.SMOKE_PASS]: 3,
    [EVIDENCE_STATES.NON_CERTIFYING]: 2,
    [EVIDENCE_STATES.UNKNOWN]: 1,
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

  // A failing certification-tier run is the latest evidence and must not be
  // hidden behind an older provisional/smoke success. A genuine certified
  // state still wins once new passing certification evidence exists.
  if (hasFailing && bestRank < TIER_RANK[EVIDENCE_STATES.CERTIFIED_30]) {
    return EVIDENCE_STATES.FAILING;
  }

  return best;
}

function compareMetricRows(left, right) {
  const order = [
    EVIDENCE_STATES.CERTIFIED_100,
    EVIDENCE_STATES.CERTIFIED_60,
    EVIDENCE_STATES.CERTIFIED_30,
    EVIDENCE_STATES.SMALL_PILOT_PROVISIONAL,
    EVIDENCE_STATES.SMOKE_PASS,
  ];
  const leftIndex = order.indexOf(left.key);
  const rightIndex = order.indexOf(right.key);
  const leftRank = leftIndex === -1 ? order.length : leftIndex;
  const rightRank = rightIndex === -1 ? order.length : rightIndex;
  if (leftRank !== rightRank) return leftRank - rightRank;
  return left.key.localeCompare(right.key);
}

function latestMetricTimestamp(metrics) {
  let latest = null;
  let latestMs = 0;
  for (const metric of metrics) {
    const timestampMs = metric.finishedAt ? new Date(metric.finishedAt).getTime() : 0;
    if (Number.isFinite(timestampMs) && timestampMs > latestMs) {
      latestMs = timestampMs;
      latest = new Date(timestampMs).toISOString();
    }
  }
  return latest;
}
