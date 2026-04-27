import React from 'react';
import { formatTimestamp } from './hub-utils.js';
import { PanelHeader } from './admin-panel-header.jsx';

// U4+U5: Overview section — top-level KPIs, recent ops activity, and demo
// health. Extracted from AdminHubSurface.jsx as the default landing section
// of the tabbed admin console.

function DashboardKpiPanel({ model, actions }) {
  const kpis = model?.dashboardKpis || {};
  const accounts = kpis.accounts || {};
  const learners = kpis.learners || {};
  const demos = kpis.demos || {};
  const practiceSessions = kpis.practiceSessions || {};
  const eventLog = kpis.eventLog || {};
  const mutationReceipts = kpis.mutationReceipts || {};
  const errorEvents = kpis.errorEvents || {};
  const byStatus = errorEvents.byStatus || {};
  const byOrigin = errorEvents.byOrigin || {};
  const accountOpsUpdates = kpis.accountOpsUpdates || {};
  const cronReconcile = kpis.cronReconcile || {};
  const cronLastSuccessAt = Number(cronReconcile.lastSuccessAt) || 0;
  const cronLastFailureAt = Number(cronReconcile.lastFailureAt) || 0;
  const cronRetentionLastFailureAt = Number(cronReconcile.retentionLastFailureAt) || 0;
  const reconcileFailing = cronLastFailureAt > 0 && cronLastFailureAt > cronLastSuccessAt;
  const retentionFailing = cronRetentionLastFailureAt > 0 && cronRetentionLastFailureAt > cronLastSuccessAt;
  const cronFailing = reconcileFailing || retentionFailing;
  const cronFailureMostRecentAt = Math.max(cronLastFailureAt, cronRetentionLastFailureAt);
  const cronFailureLegLabel = reconcileFailing && retentionFailing
    ? 'Reconcile and retention sweeps'
    : reconcileFailing
      ? 'Automated reconciliation'
      : 'Retention sweep';

  const realDemoRows = [
    ['Adult accounts (real)', accounts.real ?? accounts.total, accounts.demo],
    ['Learners', learners.real ?? learners.total, learners.demo],
    ['Practice sessions (7d)', practiceSessions.real?.last7d ?? practiceSessions.last7d, practiceSessions.demo?.last7d],
    ['Practice sessions (30d)', practiceSessions.real?.last30d ?? practiceSessions.last30d, practiceSessions.demo?.last30d],
    ['Mutation receipts (7d)', mutationReceipts.real?.last7d ?? mutationReceipts.last7d, mutationReceipts.demo?.last7d],
  ];
  const otherRows = [
    ['Active demo accounts', demos.active],
    ['Event log (7d)', eventLog.last7d],
    ['Errors: open', byStatus.open],
    ['Errors: investigating', byStatus.investigating],
    ['Errors: resolved', byStatus.resolved],
    ['Errors: ignored', byStatus.ignored],
    ['Errors: client-origin', byOrigin.client],
    ['Errors: server-origin', byOrigin.server],
    ['Account ops updates', accountOpsUpdates.total],
  ];
  const renderRealDemo = (label, realValue, demoValue) => (
    <div className="skill-row" key={label}>
      <div><strong>{label}</strong></div>
      <div>
        <span data-kpi-role="real">{String(Number(realValue) || 0)}</span>
        {' / '}
        <span data-kpi-role="demo">{demoValue == null ? '—' : String(Number(demoValue) || 0)}</span>
      </div>
    </div>
  );
  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <PanelHeader
        eyebrow="Dashboard KPI"
        title="Dashboard overview"
        refreshedAt={kpis.refreshedAt ?? kpis.generatedAt}
        refreshError={kpis.refreshError || null}
        onRefresh={() => actions.dispatch('admin-ops-kpi-refresh')}
      />
      {cronFailing ? (
        <div
          className="callout warn small"
          role="alert"
          data-testid="dashboard-cron-failure-banner"
          style={{ marginBottom: 12 }}
        >
          <strong>{cronFailureLegLabel} failed</strong> at {formatTimestamp(cronFailureMostRecentAt)}.
          {' '}Last success at {cronLastSuccessAt > 0 ? formatTimestamp(cronLastSuccessAt) : 'never'}.
          {' '}Investigate or run <code>npm run admin:reconcile-kpis</code>.
        </div>
      ) : null}
      <div className="skill-list">
        {realDemoRows.map(([label, realValue, demoValue]) => renderRealDemo(label, realValue, demoValue))}
        {otherRows.map(([label, value]) => (
          <div className="skill-row" key={label}>
            <div><strong>{label}</strong></div>
            <div>{value == null ? '—' : String(Number(value) || 0)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentActivityStreamPanel({ model, actions }) {
  const stream = model?.opsActivityStream || {};
  const entries = Array.isArray(stream.entries) ? stream.entries : [];
  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <PanelHeader
        eyebrow="Ops activity"
        title="Recent operations activity"
        subtitle="Latest mutation receipts across accounts. Learner scope ids pre-masked to last 8 characters; account scope ids to last 6."
        refreshedAt={stream.refreshedAt ?? stream.generatedAt}
        refreshError={stream.refreshError || null}
        onRefresh={() => actions.dispatch('admin-ops-activity-refresh')}
      />
      {entries.length ? entries.map((entry) => (
        <div className="skill-row" key={entry.requestId || `${entry.mutationKind}-${entry.appliedAt}`}>
          <div><strong>{entry.mutationKind || 'mutation'}</strong></div>
          <div className="small muted">{entry.scopeType || ''} · {entry.scopeId || 'account'}</div>
          <div>{entry.accountIdMasked || ''}</div>
          <div className="small muted">{formatTimestamp(entry.appliedAt)}</div>
        </div>
      )) : <p className="small muted">No recent operations activity.</p>}
    </section>
  );
}

function DemoOperationsSummary({ summary = {} }) {
  const items = [
    ['Demo sessions created', summary.sessionsCreated],
    ['Active demo sessions', summary.activeSessions],
    ['Conversions', summary.conversions],
    ['Cleanup count', summary.cleanupCount],
    ['Rate-limit blocks', summary.rateLimitBlocks],
    ['TTS fallback indicators', summary.ttsFallbacks],
  ];
  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div>
          <div className="eyebrow">Demo operations</div>
          <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Aggregate demo health</h3>
        </div>
        <span className="chip">Updated {formatTimestamp(summary.updatedAt)}</span>
      </div>
      <div className="skill-list">
        {items.map(([label, value]) => (
          <div className="skill-row" key={label}>
            <div><strong>{label}</strong></div>
            <div>{String(Number(value) || 0)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AdminOverviewSection({ model, actions }) {
  return (
    <>
      <DashboardKpiPanel model={model} actions={actions} />
      <RecentActivityStreamPanel model={model} actions={actions} />
      <DemoOperationsSummary summary={model.demoOperations} />
    </>
  );
}
