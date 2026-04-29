// Grammar QG P7 — Calibration View Model (U8)
//
// Pure function that transforms raw calibration report JSON artefacts into
// a display-ready view model for GrammarCalibrationPanel. No React imports.
// No side effects. No answer keys. No raw learner identifiers.
//
// The data shape consumed here mirrors the outputs of:
//   scripts/grammar-qg-calibrate.mjs  → healthReport, mixedTransferCalibration, retentionReport
//   scripts/grammar-qg-action-candidates.mjs  → actionCandidates
//   scripts/grammar-qg-mixed-transfer-decision.mjs  → mixedTransferDecision
//   scripts/grammar-qg-retention-decision.mjs  → retentionDecision

// ─── Constants ───────────────────────────────────────────────────────────────

const CLASSIFICATION_PRIORITY = Object.freeze({
  support_dependent: 0,
  retry_ineffective: 1,
  too_hard: 2,
  ambiguous: 3,
  too_easy: 4,
  healthy: 5,
});

const CATEGORY_PRIORITY = Object.freeze({
  retire_candidate: 0,
  reduce_scheduler_weight: 1,
  rewrite_distractors: 2,
  review_wording: 3,
  add_bridge_practice: 4,
  expand_case_bank: 5,
  increase_maintenance: 6,
  warm_up_only: 7,
  insufficient_data: 8,
  keep: 9,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classificationColour(classification) {
  switch (classification) {
    case 'healthy': return 'green';
    case 'too_easy': return 'amber';
    case 'ambiguous': return 'amber';
    case 'too_hard': return 'red';
    case 'support_dependent': return 'red';
    case 'retry_ineffective': return 'red';
    default: return 'grey';
  }
}

function categoryColour(category) {
  switch (category) {
    case 'keep': return 'green';
    case 'warm_up_only': return 'amber';
    case 'review_wording': return 'amber';
    case 'add_bridge_practice': return 'amber';
    case 'expand_case_bank': return 'amber';
    case 'increase_maintenance': return 'amber';
    case 'rewrite_distractors': return 'red';
    case 'reduce_scheduler_weight': return 'red';
    case 'retire_candidate': return 'red';
    case 'insufficient_data': return 'grey';
    default: return 'grey';
  }
}

function confidenceBadge(confidence) {
  switch (confidence) {
    case 'high': return 'green';
    case 'medium': return 'amber';
    case 'low': return 'grey';
    case 'insufficient': return 'red-outline';
    default: return 'grey';
  }
}

function confidenceLevel(count) {
  if (count > 100) return 'high';
  if (count >= 30) return 'medium';
  if (count >= 10) return 'low';
  return 'insufficient';
}

function decisionColour(decision) {
  switch (decision) {
    case 'keep_shadow_only': return 'green';
    case 'prepare_scoring_experiment': return 'amber';
    case 'do_not_promote': return 'red';
    case 'no_action_needed': return 'green';
    case 'recommend_maintenance_experiment': return 'amber';
    case 'defer_insufficient_data': return 'grey';
    default: return 'grey';
  }
}

function safeRate(n, d) {
  return d > 0 ? n / d : 0;
}

function formatPercent(rate) {
  if (rate == null || Number.isNaN(rate)) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Transform raw calibration data into a view-ready model.
 *
 * @param {Object|null|undefined} calibrationData
 * @returns {Object} View model with sections for display
 */
export function buildCalibrationViewModel(calibrationData) {
  if (!calibrationData || typeof calibrationData !== 'object') {
    return {
      empty: true,
      emptyMessage: 'No calibration data available. Run `npm run grammar:qg:calibrate` first.',
      header: null,
      templateHealthRows: [],
      actionCandidateGroups: [],
      keepCount: 0,
      mixedTransferEvidence: null,
      retentionEvidence: null,
      confidenceWarnings: [],
    };
  }

  const {
    healthReport,
    mixedTransferCalibration,
    retentionReport,
    actionCandidates,
    mixedTransferDecision,
    retentionDecision,
  } = calibrationData;

  // ── Header ──
  const header = buildHeader(healthReport);

  // ── Template health ──
  const templateHealthRows = buildTemplateHealthRows(healthReport);

  // ── Action candidates ──
  const { groups: actionCandidateGroups, keepCount } = buildActionCandidateGroups(actionCandidates);

  // ── Mixed-transfer evidence ──
  const mixedTransferEvidence = buildMixedTransferEvidence(mixedTransferDecision, mixedTransferCalibration);

  // ── Retention evidence ──
  const retentionEvidence = buildRetentionEvidence(retentionDecision, retentionReport);

  // ── Confidence warnings ──
  const confidenceWarnings = buildConfidenceWarnings(templateHealthRows, actionCandidates);

  return {
    empty: false,
    emptyMessage: null,
    header,
    templateHealthRows,
    actionCandidateGroups,
    keepCount,
    mixedTransferEvidence,
    retentionEvidence,
    confidenceWarnings,
  };
}

// ─── Section builders ─────────────────────────────────────────────────────────

function buildHeader(healthReport) {
  if (!healthReport || typeof healthReport !== 'object') {
    return { releaseId: '—', dateRange: '—', schemaVersion: '—', inputRowCount: 0 };
  }

  const provenance = healthReport.provenance || {};
  const templates = healthReport.templates || {};
  const templateIds = Object.keys(templates);

  let totalAttempts = 0;
  for (const tpl of Object.values(templates)) {
    totalAttempts += tpl.attemptCount || 0;
  }

  return {
    releaseId: provenance.releaseId || provenance.calibrationSchemaVersion || '—',
    dateRange: provenance.dateRange || '—',
    schemaVersion: provenance.calibrationSchemaVersion || '—',
    inputRowCount: totalAttempts,
  };
}

function buildTemplateHealthRows(healthReport) {
  if (!healthReport || !healthReport.templates) return [];

  const templates = healthReport.templates;
  const rows = [];

  for (const [templateId, metrics] of Object.entries(templates)) {
    const classification = metrics.classification || 'unknown';
    const attemptCount = metrics.attemptCount || 0;
    const successRate = metrics.independentFirstAttemptSuccessRate ?? metrics.successRate ?? null;
    const confidence = confidenceLevel(attemptCount);

    rows.push({
      templateId,
      classification,
      classificationColour: classificationColour(classification),
      attemptCount,
      successRate,
      successRateDisplay: formatPercent(successRate),
      confidence,
      confidenceBadge: confidenceBadge(confidence),
    });
  }

  // Sort: unhealthy first (lower priority number = higher priority for display)
  rows.sort((a, b) => {
    const aPri = CLASSIFICATION_PRIORITY[a.classification] ?? 99;
    const bPri = CLASSIFICATION_PRIORITY[b.classification] ?? 99;
    if (aPri !== bPri) return aPri - bPri;
    return a.templateId.localeCompare(b.templateId);
  });

  return rows;
}

function buildActionCandidateGroups(actionCandidates) {
  if (!actionCandidates || !Array.isArray(actionCandidates)) {
    // Check if it's an object with an array property
    const candidates = actionCandidates?.candidates || actionCandidates?.actions || [];
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { groups: [], keepCount: 0 };
    }
    return groupCandidates(candidates);
  }
  return groupCandidates(actionCandidates);
}

function groupCandidates(candidates) {
  let keepCount = 0;
  const grouped = {};

  for (const candidate of candidates) {
    const category = candidate.category || 'unknown';
    if (category === 'keep') {
      keepCount++;
      continue; // skip keep entries by default
    }

    if (!grouped[category]) {
      grouped[category] = {
        category,
        categoryColour: categoryColour(category),
        rows: [],
      };
    }

    grouped[category].rows.push({
      templateId: candidate.templateId || '—',
      conceptId: candidate.conceptId || '—',
      category,
      categoryColour: categoryColour(category),
      confidence: candidate.confidence || 'insufficient',
      confidenceBadge: confidenceBadge(candidate.confidence || 'insufficient'),
      rationale: candidate.rationale || '—',
    });
  }

  // Sort groups by category priority
  const groups = Object.values(grouped).sort((a, b) => {
    const aPri = CATEGORY_PRIORITY[a.category] ?? 99;
    const bPri = CATEGORY_PRIORITY[b.category] ?? 99;
    return aPri - bPri;
  });

  return { groups, keepCount };
}

function buildMixedTransferEvidence(mixedTransferDecision, mixedTransferCalibration) {
  if (!mixedTransferDecision || typeof mixedTransferDecision !== 'object') {
    return null;
  }

  const decision = mixedTransferDecision.decision || 'unknown';
  const perTemplateEvidence = mixedTransferDecision.perTemplateEvidence || [];
  const summary = mixedTransferDecision.summary || '';

  const templateRows = perTemplateEvidence.map((entry) => ({
    templateId: entry.templateId || '—',
    attemptCount: entry.attemptCount || 0,
    successRate: formatPercent(entry.successRate),
    confidenceLevel: entry.confidenceLevel || 'low',
    confidenceBadge: confidenceBadge(entry.confidenceLevel || 'low'),
  }));

  return {
    decision,
    decisionColour: decisionColour(decision),
    summary,
    templateRows,
  };
}

function buildRetentionEvidence(retentionDecision, retentionReport) {
  if (!retentionDecision || typeof retentionDecision !== 'object') {
    return null;
  }

  const decision = retentionDecision.decision || 'unknown';
  const perConceptEvidence = retentionDecision.perConceptEvidence || [];
  const familyClustering = retentionDecision.familyClustering || [];
  const summary = retentionDecision.summary || '';

  const conceptRows = perConceptEvidence.map((entry) => ({
    conceptId: entry.conceptId || '—',
    securedAttempts: entry.securedAttempts || entry.securedAttemptCount || 0,
    lapseRate: formatPercent(entry.lapseRate),
    confidenceLevel: entry.hasSufficientData ? 'medium' : 'insufficient',
    confidenceBadge: confidenceBadge(entry.hasSufficientData ? 'medium' : 'insufficient'),
  }));

  const clusterRows = familyClustering.map((entry) => ({
    familyId: entry.familyId || '—',
    templateCount: entry.templateCount || 0,
    totalLapses: entry.totalLapses || 0,
    lapseConcentration: formatPercent(entry.lapseConcentration),
  }));

  return {
    decision,
    decisionColour: decisionColour(decision),
    summary,
    conceptRows,
    clusterRows,
  };
}

function buildConfidenceWarnings(templateHealthRows, actionCandidates) {
  const warnings = [];

  // Templates with insufficient data
  for (const row of templateHealthRows) {
    if (row.confidence === 'insufficient') {
      warnings.push({
        type: 'template',
        id: row.templateId,
        reason: `Template has only ${row.attemptCount} attempts — insufficient data for reliable classification.`,
      });
    }
  }

  // Action candidates with insufficient_data category
  const candidates = Array.isArray(actionCandidates)
    ? actionCandidates
    : (actionCandidates?.candidates || actionCandidates?.actions || []);

  for (const candidate of candidates) {
    if (candidate.category === 'insufficient_data') {
      warnings.push({
        type: 'action_candidate',
        id: candidate.templateId || candidate.conceptId || '—',
        reason: candidate.rationale || 'Insufficient data for action classification.',
      });
    }
  }

  return warnings;
}

// ─── Exports for testing ──────────────────────────────────────────────────────

export {
  classificationColour,
  categoryColour,
  confidenceBadge,
  confidenceLevel,
  decisionColour,
  formatPercent,
  CLASSIFICATION_PRIORITY,
  CATEGORY_PRIORITY,
};
