import React from 'react';
import { PanelHeader } from './admin-panel-header.jsx';
import {
  BUNDLE_SECTION_LABELS,
  BUNDLE_SECTIONS,
  isSectionEmpty,
  formatBundleTimestamp,
} from '../../platform/hubs/admin-debug-bundle-panel.js';

// U8 (P4): Debug Bundle panel — extracted from AdminDebuggingSection.jsx.
// Contains DebugBundlePanel + DebugBundleSectionTable + DebugBundleResult.

// ---------------------------------------------------------------------------
// U6 (P3): Debug Bundle panel — evidence packet generator.
// Search form + generate button + collapsible result sections.
// JSON copy is admin-only (R4 ops export restriction).
// ---------------------------------------------------------------------------

function DebugBundleSectionTable({ label, rows, columns }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <p className="small muted">No data.</p>;
  }
  return (
    <table className="small admin-bundle-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} className="admin-bundle-th">{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={row.id || row.requestId || idx}>
            {columns.map((col) => (
              <td key={col.key} className="muted" style={{ padding: '2px 6px', fontFamily: col.mono ? 'monospace' : 'inherit' }}>
                {col.render ? col.render(row) : (row[col.key] != null ? String(row[col.key]) : '—')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DebugBundleResult({ bundleData }) {
  if (!bundleData) return null;
  const bundle = bundleData.bundle || {};

  return (
    <div data-testid="debug-bundle-result" className="admin-bundle-result-spaced">
      <div className="small muted admin-bundle-meta">
        Generated: {formatBundleTimestamp(bundle.generatedAt)}
        {bundle.buildHash ? ` · Build: ${String(bundle.buildHash).slice(0, 7)}` : ''}
      </div>

      {BUNDLE_SECTIONS.map((sectionKey) => {
        const label = BUNDLE_SECTION_LABELS[sectionKey];
        const isEmpty = isSectionEmpty(bundle, sectionKey);
        const value = bundle[sectionKey];
        return (
          <details key={sectionKey} data-testid={`bundle-section-${sectionKey}`} className="admin-bundle-section-details">
            <summary className="small admin-bundle-section-summary">
              {label} {isEmpty ? <span className="muted">(empty)</span> : null}
            </summary>
            <div className="admin-bundle-section-body">
              {sectionKey === 'accountSummary' && value ? (
                <dl className="small admin-bundle-account-dl">
                  <dt className="muted">Account ID</dt><dd>{value.accountId || '—'}</dd>
                  <dt className="muted">Email</dt><dd>{value.email || '—'}</dd>
                  <dt className="muted">Name</dt><dd>{value.displayName || '—'}</dd>
                  <dt className="muted">Role</dt><dd>{value.platformRole || '—'}</dd>
                  <dt className="muted">Type</dt><dd>{value.accountType || '—'}</dd>
                </dl>
              ) : null}
              {sectionKey === 'linkedLearners' ? (
                <DebugBundleSectionTable
                  label={label}
                  rows={value}
                  columns={[
                    { key: 'learnerName', label: 'Name' },
                    { key: 'learnerId', label: 'ID', mono: true },
                    { key: 'yearGroup', label: 'Year' },
                    { key: 'membershipRole', label: 'Role' },
                  ]}
                />
              ) : null}
              {sectionKey === 'recentErrors' ? (
                <DebugBundleSectionTable
                  label={label}
                  rows={value}
                  columns={[
                    { key: 'status', label: 'Status' },
                    { key: 'errorKind', label: 'Kind' },
                    { key: 'messageFirstLine', label: 'Message' },
                    { key: 'occurrenceCount', label: 'Count' },
                    { key: 'routeName', label: 'Route' },
                  ]}
                />
              ) : null}
              {sectionKey === 'errorOccurrences' ? (
                <DebugBundleSectionTable
                  label={label}
                  rows={value}
                  columns={[
                    { key: 'occurredAt', label: 'When', render: (r) => formatBundleTimestamp(r.occurredAt) },
                    { key: 'routeName', label: 'Route' },
                    { key: 'release', label: 'Release', mono: true },
                  ]}
                />
              ) : null}
              {sectionKey === 'recentDenials' ? (
                <DebugBundleSectionTable
                  label={label}
                  rows={value}
                  columns={[
                    { key: 'deniedAt', label: 'When', render: (r) => formatBundleTimestamp(r.deniedAt) },
                    { key: 'denialReason', label: 'Reason' },
                    { key: 'routeName', label: 'Route' },
                  ]}
                />
              ) : null}
              {sectionKey === 'recentMutations' ? (
                <DebugBundleSectionTable
                  label={label}
                  rows={value}
                  columns={[
                    { key: 'appliedAt', label: 'When', render: (r) => formatBundleTimestamp(r.appliedAt) },
                    { key: 'mutationKind', label: 'Kind' },
                    { key: 'scopeType', label: 'Scope' },
                    { key: 'scopeId', label: 'Scope ID', mono: true },
                  ]}
                />
              ) : null}
              {sectionKey === 'capacityState' ? (
                <DebugBundleSectionTable
                  label={label}
                  rows={value}
                  columns={[
                    { key: 'metricKey', label: 'Metric' },
                    { key: 'metricCount', label: 'Count' },
                    { key: 'updatedAt', label: 'Updated', render: (r) => formatBundleTimestamp(r.updatedAt) },
                  ]}
                />
              ) : null}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function DebugBundlePanel({ model, actions }) {
  const debugBundle = model?.debugBundle || {};
  const bundleData = debugBundle.data || null;
  const loading = debugBundle.loading === true;
  const error = debugBundle.error || null;
  const canExportJson = bundleData?.canExportJson === true;
  const humanSummary = bundleData?.humanSummary || '';

  const [accountId, setAccountId] = React.useState('');
  const [learnerId, setLearnerId] = React.useState('');
  const [timeFrom, setTimeFrom] = React.useState('');
  const [timeTo, setTimeTo] = React.useState('');
  const [fingerprint, setFingerprint] = React.useState('');
  const [eventId, setEventId] = React.useState('');
  const [routeFilter, setRouteFilter] = React.useState('');
  const [copyFeedback, setCopyFeedback] = React.useState('');

  // R7: pre-fill from error drawer link.
  const prefill = debugBundle.prefill || null;
  React.useEffect(() => {
    if (prefill?.fingerprint) setFingerprint(prefill.fingerprint);
    if (prefill?.eventId) setEventId(prefill.eventId);
    if (prefill?.accountId) setAccountId(prefill.accountId);
    if (prefill?.route) setRouteFilter(prefill.route);
  }, [prefill?.fingerprint, prefill?.eventId, prefill?.accountId, prefill?.route]);

  const generateBundle = () => {
    const payload = {};
    if (accountId.trim()) payload.account_id = accountId.trim();
    if (learnerId.trim()) payload.learner_id = learnerId.trim();
    const fromTs = Date.parse(timeFrom);
    if (Number.isFinite(fromTs)) payload.time_from = fromTs;
    const toTs = Date.parse(timeTo);
    if (Number.isFinite(toTs)) payload.time_to = toTs;
    if (fingerprint.trim()) payload.error_fingerprint = fingerprint.trim();
    if (eventId.trim()) payload.error_event_id = eventId.trim();
    if (routeFilter.trim()) payload.route = routeFilter.trim();
    actions.dispatch('admin-debug-bundle-generate', payload);
  };

  const copyJson = async () => {
    if (!canExportJson || !bundleData?.bundle) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(bundleData.bundle, null, 2));
      setCopyFeedback('JSON copied');
      setTimeout(() => setCopyFeedback(''), 2000);
    } catch {
      setCopyFeedback('Copy failed');
      setTimeout(() => setCopyFeedback(''), 2000);
    }
  };

  const copySummary = async () => {
    if (!humanSummary) return;
    try {
      await navigator.clipboard.writeText(humanSummary);
      setCopyFeedback('Summary copied');
      setTimeout(() => setCopyFeedback(''), 2000);
    } catch {
      setCopyFeedback('Copy failed');
      setTimeout(() => setCopyFeedback(''), 2000);
    }
  };

  return (
    <section className="card admin-card-spaced" data-testid="debug-bundle-panel">
      <PanelHeader
        eyebrow="Debug tools"
        title="Debug Bundle"
        refreshedAt={bundleData?.bundle?.generatedAt}
        refreshError={error}
        onRefresh={generateBundle}
      />

      <div
        className="filters admin-filters-grid"
        data-testid="debug-bundle-search-form"
      >
        <label className="field">
          <span>Account ID or email</span>
          <input type="text" className="input" name="bundleAccountId" value={accountId} maxLength={128} onChange={(e) => setAccountId(e.target.value)} placeholder="acct-xxxx or name@example.com" data-testid="bundle-input-account" />
        </label>
        <label className="field">
          <span>Learner ID</span>
          <input type="text" className="input" name="bundleLearnerId" value={learnerId} maxLength={128} onChange={(e) => setLearnerId(e.target.value)} placeholder="learner-xxxx" data-testid="bundle-input-learner" />
        </label>
        <label className="field">
          <span>From</span>
          <input type="datetime-local" className="input" name="bundleTimeFrom" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} data-testid="bundle-input-from" />
        </label>
        <label className="field">
          <span>To</span>
          <input type="datetime-local" className="input" name="bundleTimeTo" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} data-testid="bundle-input-to" />
        </label>
        <label className="field">
          <span>Error Fingerprint</span>
          <input type="text" className="input" name="bundleFingerprint" value={fingerprint} maxLength={128} onChange={(e) => setFingerprint(e.target.value)} placeholder="fp-xxxx" data-testid="bundle-input-fingerprint" />
        </label>
        <label className="field">
          <span>Error Event ID</span>
          <input type="text" className="input" name="bundleEventId" value={eventId} maxLength={128} onChange={(e) => setEventId(e.target.value)} placeholder="evt-xxxx" data-testid="bundle-input-event-id" />
        </label>
        <label className="field">
          <span>Route filter</span>
          <input type="text" className="input" name="bundleRoute" value={routeFilter} maxLength={64} onChange={(e) => setRouteFilter(e.target.value)} placeholder="/api/" data-testid="bundle-input-route" />
        </label>
      </div>

      <div className="chip-row admin-bundle-gen-actions">
        <button className="btn" type="button" disabled={loading} onClick={generateBundle} data-testid="bundle-generate-btn">
          {loading ? 'Generating...' : 'Generate Debug Bundle'}
        </button>
        {bundleData ? (
          <>
            {canExportJson ? (
              <button className="btn ghost" type="button" onClick={copyJson} data-testid="bundle-copy-json-btn">
                Copy JSON
              </button>
            ) : null}
            <button className="btn ghost" type="button" onClick={copySummary} data-testid="bundle-copy-summary-btn">
              Copy Summary
            </button>
          </>
        ) : null}
        {copyFeedback ? <span className="chip good" data-testid="bundle-copy-feedback">{copyFeedback}</span> : null}
      </div>

      {error && !bundleData ? (
        <div className="feedback warn admin-bundle-error-spaced" data-testid="debug-bundle-error">
          {typeof error === 'string' ? error : 'Failed to generate debug bundle.'}
        </div>
      ) : null}

      {!bundleData && !loading && !error ? (
        <p className="small muted admin-bundle-empty" data-testid="debug-bundle-empty-state">
          Enter search criteria and click Generate to create a debug evidence bundle.
        </p>
      ) : null}

      <DebugBundleResult bundleData={bundleData} />
    </section>
  );
}
