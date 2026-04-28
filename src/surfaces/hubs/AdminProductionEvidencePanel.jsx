import React from 'react';
import { AdminPanelFrame } from './AdminPanelFrame.jsx';
import {
  buildEvidencePanelModel,
  EVIDENCE_STATES,
  isValidEvidenceState,
} from '../../platform/hubs/admin-production-evidence.js';

// P5 Unit 4: Production Evidence panel.
//
// Shows the current certification evidence state at a glance. Uses the
// AdminPanelFrame for consistent freshness/stale/empty-state handling and
// the closed EVIDENCE_STATES enum to classify each metric tier.

const STATE_LABELS = {
  [EVIDENCE_STATES.NOT_AVAILABLE]: 'Not available',
  [EVIDENCE_STATES.STALE]: 'Stale',
  [EVIDENCE_STATES.FAILING]: 'Failing',
  [EVIDENCE_STATES.SMOKE_PASS]: 'Smoke pass',
  [EVIDENCE_STATES.SMALL_PILOT_PROVISIONAL]: 'Small pilot (provisional)',
  [EVIDENCE_STATES.CERTIFIED_30]: 'Certified 30-learner beta',
  [EVIDENCE_STATES.CERTIFIED_60]: 'Certified 60-learner stretch',
  [EVIDENCE_STATES.CERTIFIED_100]: 'Certified 100+ learners',
  [EVIDENCE_STATES.UNKNOWN]: 'Unknown',
};

const STATE_BADGES = {
  [EVIDENCE_STATES.NOT_AVAILABLE]: 'badge muted',
  [EVIDENCE_STATES.STALE]: 'badge warn',
  [EVIDENCE_STATES.FAILING]: 'badge error',
  [EVIDENCE_STATES.SMOKE_PASS]: 'badge info',
  [EVIDENCE_STATES.SMALL_PILOT_PROVISIONAL]: 'badge info',
  [EVIDENCE_STATES.CERTIFIED_30]: 'badge success',
  [EVIDENCE_STATES.CERTIFIED_60]: 'badge success',
  [EVIDENCE_STATES.CERTIFIED_100]: 'badge success',
  [EVIDENCE_STATES.UNKNOWN]: 'badge muted',
};

function StateBadge({ state }) {
  const label = STATE_LABELS[state] || state;
  const className = STATE_BADGES[state] || 'badge muted';
  return <span className={className} data-evidence-state={state}>{label}</span>;
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

export function AdminProductionEvidencePanel({ model, actions }) {
  const evidenceSummary = model?.productionEvidence || null;
  const now = Date.now();
  const panelModel = buildEvidencePanelModel(evidenceSummary, now);

  const refreshedAtMs = panelModel.generatedAt
    ? new Date(panelModel.generatedAt).getTime()
    : null;

  return (
    <AdminPanelFrame
      eyebrow="Production evidence"
      title="Certification evidence"
      refreshedAt={refreshedAtMs}
      refreshError={null}
      onRefresh={actions?.dispatch ? () => actions.dispatch('admin-ops-evidence-refresh') : undefined}
      data={panelModel.metrics.length > 0 ? panelModel.metrics : null}
      loading={false}
      emptyState={
        <p className="small muted">
          No evidence data available. Run <code>node scripts/generate-evidence-summary.mjs</code> to generate.
        </p>
      }
    >
      <div data-testid="evidence-panel-overall">
        <div className="skill-row" style={{ marginBottom: 8 }}>
          <div><strong>Overall state</strong></div>
          <div><StateBadge state={panelModel.overallState} /></div>
        </div>
        <div className="small muted" style={{ marginBottom: 12 }}>
          Generated: {formatEvidenceTimestamp(panelModel.generatedAt)}
          {panelModel.isFresh ? ' (fresh)' : ' (stale)'}
        </div>
      </div>

      {panelModel.metrics.length > 0 ? (
        <table
          className="admin-table"
          data-testid="evidence-metrics-table"
          style={{ width: '100%', borderCollapse: 'collapse' }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Tier</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>State</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Learners</th>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Last run</th>
            </tr>
          </thead>
          <tbody>
            {panelModel.metrics.map((metric) => (
              <tr key={metric.key} data-metric-key={metric.key}>
                <td style={{ padding: '4px 8px' }}>{metric.tier}</td>
                <td style={{ padding: '4px 8px' }}><StateBadge state={metric.state} /></td>
                <td style={{ padding: '4px 8px' }}>{metric.learners ?? '—'}</td>
                <td style={{ padding: '4px 8px' }} className="small muted">
                  {formatEvidenceTimestamp(metric.finishedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </AdminPanelFrame>
  );
}
