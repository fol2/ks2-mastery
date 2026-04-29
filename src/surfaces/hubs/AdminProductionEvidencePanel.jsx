import React, { useState } from 'react';
import { AdminPanelFrame } from './AdminPanelFrame.jsx';
import {
  buildEvidencePanelModel,
  EVIDENCE_FRESH_THRESHOLD_MS,
  EVIDENCE_STATES,
  isValidEvidenceState,
} from '../../platform/hubs/admin-production-evidence.js';

// P7 Unit 2: Multi-lane Production Evidence panel.
//
// Replaces the single-badge overview with per-lane collapsible sections.
// Each lane computes state independently — no cross-lane rollup.
// Colours: red=failing, grey=not_available, amber=stale, green=passing/certified.

const STATE_LABELS = {
  [EVIDENCE_STATES.NOT_AVAILABLE]: 'Not available',
  [EVIDENCE_STATES.STALE]: 'Stale',
  [EVIDENCE_STATES.FAILING]: 'Failed',
  [EVIDENCE_STATES.NON_CERTIFYING]: 'Non-certifying',
  [EVIDENCE_STATES.PREFLIGHT_ONLY]: 'Preflight only',
  [EVIDENCE_STATES.SMOKE_PASS]: 'Smoke pass',
  [EVIDENCE_STATES.SMALL_PILOT_PROVISIONAL]: 'Small pilot (provisional)',
  [EVIDENCE_STATES.CERTIFIED_30]: 'Certified: 30-learner beta',
  [EVIDENCE_STATES.CERTIFIED_60]: 'Certified: 60-learner stretch',
  [EVIDENCE_STATES.CERTIFIED_100]: 'Certified: 100+ learners',
  [EVIDENCE_STATES.UNKNOWN]: 'Unknown',
};

const STATE_COLOURS = {
  [EVIDENCE_STATES.NOT_AVAILABLE]: '#9e9e9e',
  [EVIDENCE_STATES.STALE]: '#f59e0b',
  [EVIDENCE_STATES.FAILING]: '#ef4444',
  [EVIDENCE_STATES.NON_CERTIFYING]: '#f59e0b',
  [EVIDENCE_STATES.PREFLIGHT_ONLY]: '#9e9e9e',
  [EVIDENCE_STATES.SMOKE_PASS]: '#22c55e',
  [EVIDENCE_STATES.SMALL_PILOT_PROVISIONAL]: '#22c55e',
  [EVIDENCE_STATES.CERTIFIED_30]: '#22c55e',
  [EVIDENCE_STATES.CERTIFIED_60]: '#22c55e',
  [EVIDENCE_STATES.CERTIFIED_100]: '#22c55e',
  [EVIDENCE_STATES.UNKNOWN]: '#9e9e9e',
};

const STATE_BADGES = {
  [EVIDENCE_STATES.NOT_AVAILABLE]: 'badge muted',
  [EVIDENCE_STATES.STALE]: 'badge warn',
  [EVIDENCE_STATES.FAILING]: 'badge error',
  [EVIDENCE_STATES.NON_CERTIFYING]: 'badge warn',
  [EVIDENCE_STATES.PREFLIGHT_ONLY]: 'badge muted',
  [EVIDENCE_STATES.SMOKE_PASS]: 'badge info',
  [EVIDENCE_STATES.SMALL_PILOT_PROVISIONAL]: 'badge info',
  [EVIDENCE_STATES.CERTIFIED_30]: 'badge success',
  [EVIDENCE_STATES.CERTIFIED_60]: 'badge success',
  [EVIDENCE_STATES.CERTIFIED_100]: 'badge success',
  [EVIDENCE_STATES.UNKNOWN]: 'badge muted',
};

const TIER_LABELS = {
  smoke_pass: 'Smoke pass',
  admin_smoke: 'Admin smoke',
  bootstrap_smoke: 'Bootstrap smoke',
  small_pilot_provisional: 'Small pilot',
  certified_30_learner_beta: '30-learner beta',
  certified_60_learner_stretch: '60-learner stretch',
  certified_100_plus: '100+ learners',
  preflight_only: 'Preflight',
  csp_status: 'CSP enforcement',
  d1_migrations: 'D1 migrations',
  build_version: 'Build version',
  kpi_reconcile: 'KPI reconcile',
};

function StateBadge({ state }) {
  const label = STATE_LABELS[state] || state;
  const className = STATE_BADGES[state] || 'badge muted';
  return <span className={className} data-evidence-state={state}>{label}</span>;
}

function StatusIndicator({ state }) {
  const colour = STATE_COLOURS[state] || '#9e9e9e';
  return (
    <span
      data-testid="lane-status-indicator"
      data-lane-state={state}
      style={{
        display: 'inline-block',
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        backgroundColor: colour,
        marginRight: '8px',
      }}
    />
  );
}

function formatTierLabel(tier) {
  return TIER_LABELS[tier] || String(tier || 'Unknown').replace(/[_-]+/g, ' ');
}

function formatEvidenceTimestamp(isoString) {
  if (!isoString) return 'never';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return 'invalid';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function formatThresholdViolation(violation) {
  if (!violation || typeof violation !== 'object') return null;
  if (violation.message) return violation.message;
  const name = violation.threshold || 'threshold';
  const observed = violation.observed ?? 'unknown';
  const limit = violation.limit ?? 'unknown';
  return `${name}: observed ${observed}; limit ${limit}.`;
}

function formatMetricDetail(metric) {
  const details = [];
  const thresholdDetails = metric.thresholdViolations
    .map(formatThresholdViolation)
    .filter(Boolean);
  if (thresholdDetails.length > 0) {
    details.push(`Threshold violation: ${thresholdDetails.join(' ')}`);
  } else if (metric.failureReason) {
    details.push(`Reason: ${metric.failureReason}.`);
  } else if (metric.state === EVIDENCE_STATES.NON_CERTIFYING) {
    const reasons = Array.isArray(metric.certificationReasons) && metric.certificationReasons.length > 0
      ? metric.certificationReasons.join(', ')
      : (metric.status || metric.evidenceKind || metric.decision || 'not eligible for certification');
    details.push(`Reason: not-certification-eligible: ${reasons}.`);
  }
  if (metric.fileName) {
    details.push(`Source: ${metric.fileName}.`);
  }
  return details.join(' ');
}

function LaneSection({ lane }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      data-testid={`evidence-lane-${lane.laneId}`}
      data-lane-state={lane.overallState}
      style={{ marginBottom: '12px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          cursor: 'pointer',
          backgroundColor: '#f9fafb',
          borderRadius: expanded ? '6px 6px 0 0' : '6px',
        }}
      >
        <StatusIndicator state={lane.overallState} />
        <strong style={{ flex: 1 }}>{lane.label}</strong>
        <span style={{ fontSize: '11px', color: '#6b7280' }}>
          {expanded ? '▼' : '▶'} {STATE_LABELS[lane.overallState] || lane.overallState}
        </span>
      </div>
      {expanded && (
        <div style={{ padding: '8px 12px' }}>
          {lane.rows.length === 0 ? (
            <p className="small muted">No evidence available. {lane.actionCopy}</p>
          ) : (
            <table className="admin-table" style={{ width: '100%', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Tier</th>
                  <th style={{ textAlign: 'left' }}>State</th>
                  <th style={{ textAlign: 'left' }}>Last run</th>
                  <th style={{ textAlign: 'left' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {lane.rows.map((metric) => (
                  <tr key={metric.key} data-metric-key={metric.key}>
                    <td>{formatTierLabel(metric.tier)}</td>
                    <td><StateBadge state={metric.state} /></td>
                    <td className="small muted">{formatEvidenceTimestamp(metric.finishedAt)}</td>
                    <td className="small muted">{formatMetricDetail(metric) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="small muted" style={{ marginTop: '4px' }}>
            Action: {lane.actionCopy}
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminProductionEvidencePanel({ model, actions }) {
  const evidenceSummary = model?.productionEvidence || null;
  const now = Date.now();
  const panelModel = buildEvidencePanelModel(evidenceSummary, now);

  const latestEvidenceAtMs = panelModel.latestEvidenceAt
    ? new Date(panelModel.latestEvidenceAt).getTime()
    : null;

  return (
    <AdminPanelFrame
      eyebrow="Production evidence"
      title="Latest certification evidence"
      refreshedAt={latestEvidenceAtMs}
      refreshError={null}
      onRefresh={actions?.dispatch ? () => actions.dispatch('admin-ops-evidence-refresh') : undefined}
      staleThresholdMs={EVIDENCE_FRESH_THRESHOLD_MS}
      data={panelModel.metrics.length > 0 ? panelModel.metrics : null}
      loading={false}
      emptyState={
        <p className="small muted">
          Latest evidence: Not available. Run <code>node scripts/generate-evidence-summary.mjs</code> after the next capacity run.
        </p>
      }
    >
      <div data-testid="evidence-panel-overall">
        <div className="skill-row admin-evidence-overall-row">
          <div><strong>Latest evidence</strong></div>
          <div><StateBadge state={panelModel.overallState} /></div>
        </div>
        <div className="small muted admin-evidence-generated">
          Latest capacity evidence run: {formatEvidenceTimestamp(panelModel.latestEvidenceAt)}
          {panelModel.isFresh ? ' (fresh)' : ' (stale)'}
        </div>
        <div className="small muted admin-evidence-generated">
          Summary generated: {formatEvidenceTimestamp(panelModel.generatedAt)}
        </div>
      </div>

      {panelModel.lanes.length > 0 ? (
        <div data-testid="evidence-lanes-container" style={{ marginTop: '16px' }}>
          {panelModel.lanes.map((lane) => (
            <LaneSection key={lane.laneId} lane={lane} />
          ))}
        </div>
      ) : null}

      {panelModel.metrics.length > 0 ? (
        <table
          className="admin-table admin-evidence-table"
          data-testid="evidence-metrics-table"
        >
          <thead>
            <tr>
              <th className="admin-evidence-th">Tier</th>
              <th className="admin-evidence-th">State</th>
              <th className="admin-evidence-th">Learners</th>
              <th className="admin-evidence-th">Last run</th>
              <th className="admin-evidence-th">Details</th>
            </tr>
          </thead>
          <tbody>
            {panelModel.metrics.map((metric) => {
              const detail = formatMetricDetail(metric);
              return (
                <tr key={metric.key} data-metric-key={metric.key}>
                  <td className="admin-evidence-td">{formatTierLabel(metric.tier)}</td>
                  <td className="admin-evidence-td"><StateBadge state={metric.state} /></td>
                  <td className="admin-evidence-td">{metric.learners ?? '—'}</td>
                  <td className="small muted admin-evidence-td">
                    {formatEvidenceTimestamp(metric.finishedAt)}
                  </td>
                  <td className="small muted admin-evidence-td admin-evidence-detail">{detail || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </AdminPanelFrame>
  );
}
