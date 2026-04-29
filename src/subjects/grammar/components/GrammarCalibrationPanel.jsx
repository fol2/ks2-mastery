import { AdminPanelFrame } from '../../surfaces/hubs/AdminPanelFrame.jsx';
import { buildCalibrationViewModel } from '../calibration-view-model.js';
import './GrammarCalibrationPanel.css';

// Grammar QG P7 U8 — Adult-facing calibration panel.
//
// Admin-only. Reads pre-generated P7 calibration report JSON artefacts and
// displays template health, action candidates, decision gate evidence, and
// confidence warnings.
//
// Constraints:
//   - No answer keys displayed
//   - No raw learner identifiers
//   - Read-only — no mutation actions
//   - Graceful empty state when no data available

/**
 * @param {object} props
 * @param {Object|null} props.calibrationData — Pre-loaded calibration report data
 */
export function GrammarCalibrationPanel({ calibrationData }) {
  const vm = buildCalibrationViewModel(calibrationData);

  return (
    <AdminPanelFrame
      eyebrow="Grammar QG"
      title="Grammar QG Calibration"
      subtitle="Template health, action candidates, and decision gate evidence"
      refreshedAt={null}
      refreshError={null}
      data={vm.empty ? null : vm}
      loading={false}
      emptyState={
        <p className="small muted">
          {vm.emptyMessage || 'No calibration data available. Run `npm run grammar:qg:calibrate` first.'}
        </p>
      }
    >
      <div className="grammar-calibration-panel">
        {/* Header */}
        {vm.header ? <CalibrationHeader header={vm.header} /> : null}

        {/* Template Health Overview */}
        {vm.templateHealthRows.length > 0 ? (
          <TemplateHealthSection rows={vm.templateHealthRows} />
        ) : null}

        {/* Action Candidates */}
        {vm.actionCandidateGroups.length > 0 || vm.keepCount > 0 ? (
          <ActionCandidatesSection groups={vm.actionCandidateGroups} keepCount={vm.keepCount} />
        ) : null}

        {/* Mixed-Transfer Evidence */}
        {vm.mixedTransferEvidence ? (
          <MixedTransferSection evidence={vm.mixedTransferEvidence} />
        ) : null}

        {/* Retention Evidence */}
        {vm.retentionEvidence ? (
          <RetentionSection evidence={vm.retentionEvidence} />
        ) : null}

        {/* Confidence Warnings */}
        {vm.confidenceWarnings.length > 0 ? (
          <ConfidenceWarningsSection warnings={vm.confidenceWarnings} />
        ) : null}
      </div>
    </AdminPanelFrame>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CalibrationHeader({ header }) {
  return (
    <div className="grammar-calibration-header">
      <div className="grammar-calibration-header-row">
        <span className="grammar-calibration-meta-label">Release ID:</span>
        <span className="grammar-calibration-meta-value">{header.releaseId}</span>
      </div>
      <div className="grammar-calibration-header-row">
        <span className="grammar-calibration-meta-label">Schema version:</span>
        <span className="grammar-calibration-meta-value">{header.schemaVersion}</span>
      </div>
      <div className="grammar-calibration-header-row">
        <span className="grammar-calibration-meta-label">Date range:</span>
        <span className="grammar-calibration-meta-value">{header.dateRange}</span>
      </div>
      <div className="grammar-calibration-header-row">
        <span className="grammar-calibration-meta-label">Input rows:</span>
        <span className="grammar-calibration-meta-value">{header.inputRowCount.toLocaleString()}</span>
      </div>
    </div>
  );
}

function ColourBadge({ colour, label }) {
  return (
    <span className={`badge badge-${colour}`} data-badge-colour={colour}>
      {label}
    </span>
  );
}

function TemplateHealthSection({ rows }) {
  return (
    <section className="grammar-calibration-section">
      <h3 className="grammar-calibration-section-title">Template Health Overview</h3>
      <div className="grammar-calibration-table-wrap">
        <table className="admin-table grammar-calibration-table">
          <thead>
            <tr>
              <th>Template ID</th>
              <th>Classification</th>
              <th>Attempts</th>
              <th>Success Rate</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.templateId}>
                <td className="small">{row.templateId}</td>
                <td><ColourBadge colour={row.classificationColour} label={row.classification} /></td>
                <td>{row.attemptCount}</td>
                <td>{row.successRateDisplay}</td>
                <td><ColourBadge colour={row.confidenceBadge} label={row.confidence} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ActionCandidatesSection({ groups, keepCount }) {
  return (
    <section className="grammar-calibration-section">
      <h3 className="grammar-calibration-section-title">Action Candidates</h3>
      {keepCount > 0 ? (
        <p className="small muted grammar-calibration-keep-note">
          {keepCount} template{keepCount !== 1 ? 's' : ''} classified as <ColourBadge colour="green" label="keep" /> (hidden).
        </p>
      ) : null}
      {groups.map((group) => (
        <div key={group.category} className="grammar-calibration-action-group">
          <h4 className="grammar-calibration-group-title">
            <ColourBadge colour={group.categoryColour} label={group.category.replace(/_/g, ' ')} />
            <span className="small muted"> ({group.rows.length})</span>
          </h4>
          <div className="grammar-calibration-table-wrap">
            <table className="admin-table grammar-calibration-table">
              <thead>
                <tr>
                  <th>Template ID</th>
                  <th>Concept</th>
                  <th>Confidence</th>
                  <th>Rationale</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.templateId}>
                    <td className="small">{row.templateId}</td>
                    <td className="small">{row.conceptId}</td>
                    <td><ColourBadge colour={row.confidenceBadge} label={row.confidence} /></td>
                    <td className="small muted">{row.rationale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

function MixedTransferSection({ evidence }) {
  return (
    <section className="grammar-calibration-section">
      <h3 className="grammar-calibration-section-title">Mixed-Transfer Evidence</h3>
      <div className="grammar-calibration-decision-row">
        <span className="grammar-calibration-meta-label">Decision:</span>
        <ColourBadge colour={evidence.decisionColour} label={evidence.decision.replace(/_/g, ' ')} />
      </div>
      {evidence.summary ? (
        <p className="small muted grammar-calibration-summary">{evidence.summary}</p>
      ) : null}
      {evidence.templateRows.length > 0 ? (
        <div className="grammar-calibration-table-wrap">
          <table className="admin-table grammar-calibration-table">
            <thead>
              <tr>
                <th>Template ID</th>
                <th>Attempts</th>
                <th>Success Rate</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {evidence.templateRows.map((row) => (
                <tr key={row.templateId}>
                  <td className="small">{row.templateId}</td>
                  <td>{row.attemptCount}</td>
                  <td>{row.successRate}</td>
                  <td><ColourBadge colour={row.confidenceBadge} label={row.confidenceLevel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function RetentionSection({ evidence }) {
  return (
    <section className="grammar-calibration-section">
      <h3 className="grammar-calibration-section-title">Retention Evidence</h3>
      <div className="grammar-calibration-decision-row">
        <span className="grammar-calibration-meta-label">Decision:</span>
        <ColourBadge colour={evidence.decisionColour} label={evidence.decision.replace(/_/g, ' ')} />
      </div>
      {evidence.summary ? (
        <p className="small muted grammar-calibration-summary">{evidence.summary}</p>
      ) : null}
      {evidence.conceptRows.length > 0 ? (
        <div className="grammar-calibration-table-wrap">
          <table className="admin-table grammar-calibration-table">
            <thead>
              <tr>
                <th>Concept ID</th>
                <th>Secured Attempts</th>
                <th>Lapse Rate</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {evidence.conceptRows.map((row) => (
                <tr key={row.conceptId}>
                  <td className="small">{row.conceptId}</td>
                  <td>{row.securedAttempts}</td>
                  <td>{row.lapseRate}</td>
                  <td><ColourBadge colour={row.confidenceBadge} label={row.confidenceLevel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {evidence.clusterRows.length > 0 ? (
        <div className="grammar-calibration-table-wrap">
          <h4 className="grammar-calibration-group-title small">Family Clustering</h4>
          <table className="admin-table grammar-calibration-table">
            <thead>
              <tr>
                <th>Family ID</th>
                <th>Templates</th>
                <th>Total Lapses</th>
                <th>Concentration</th>
              </tr>
            </thead>
            <tbody>
              {evidence.clusterRows.map((row) => (
                <tr key={row.familyId}>
                  <td className="small">{row.familyId}</td>
                  <td>{row.templateCount}</td>
                  <td>{row.totalLapses}</td>
                  <td>{row.lapseConcentration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function ConfidenceWarningsSection({ warnings }) {
  return (
    <section className="grammar-calibration-section">
      <h3 className="grammar-calibration-section-title">Confidence Warnings</h3>
      <ul className="grammar-calibration-warnings-list">
        {warnings.map((w, i) => (
          <li key={`${w.type}-${w.id}-${i}`} className="grammar-calibration-warning-item">
            <ColourBadge colour="red-outline" label={w.type === 'template' ? 'Template' : 'Action'} />
            <span className="small"> {w.id}: </span>
            <span className="small muted">{w.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
