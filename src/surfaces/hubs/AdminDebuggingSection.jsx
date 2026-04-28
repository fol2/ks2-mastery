import React from 'react';
import { ErrorLogCentrePanel } from './AdminErrorTimelinePanel.jsx';
import { DenialLogPanel } from './AdminRequestDenialsPanel.jsx';
import { DebugBundlePanel } from './AdminDebugBundlePanel.jsx';
import { LearnerSupportPanel } from './AdminLearnerSupportPanel.jsx';
import { AdminPanelFrame } from './AdminPanelFrame.jsx';

// U4+U5: Debugging & Logs section — error log centre + learner support /
// diagnostics panels. Extracted from AdminHubSurface.jsx.
// U8 (P3): + denial log panel below error centre.
// U6 (P3): + debug bundle panel below denial log.
//
// U8 (P4): Structural refactor — the four sub-panels have been extracted
// into focused single-panel files:
//   - AdminErrorTimelinePanel.jsx  (ErrorLogCentrePanel + OccurrenceTimeline + ErrorEventDetailsDrawer)
//   - AdminRequestDenialsPanel.jsx (DenialLogPanel + DENIAL_REASON_OPTIONS + DENIAL_REASON_LABEL_MAP)
//   - AdminDebugBundlePanel.jsx    (DebugBundlePanel + DebugBundleSectionTable + DebugBundleResult)
//   - AdminLearnerSupportPanel.jsx (LearnerSupportPanel)
//
// This file is now a thin composition shell that preserves the original
// prop contract: { model, appState, hubState, accessContext, accountDirectory, actions }.
//
// P5 U1: AdminPanelFrame adopted for ErrorLogCentrePanel and DenialLogPanel.
// These two panels pass through their refresh envelope to the frame for
// unified stale/failure/empty presentation. The complex sub-panels
// (DebugBundle, LearnerSupport) retain their bespoke internal rendering
// and will be migrated in a subsequent unit.

function FramedErrorLogPanel({ model, actions }) {
  const summary = model?.errorLogSummary || {};
  const entries = Array.isArray(summary.entries) ? summary.entries : [];
  return (
    <AdminPanelFrame
      eyebrow="Error log"
      title="Error log centre"
      refreshedAt={summary.refreshedAt ?? summary.generatedAt}
      refreshError={summary.refreshError || null}
      onRefresh={() => actions.dispatch('admin-ops-error-events-refresh', {})}
      data={entries}
      loading={Boolean(summary.loading)}
      emptyState={<p className="small muted">No error events recorded.</p>}
    >
      <ErrorLogCentrePanel model={model} actions={actions} />
    </AdminPanelFrame>
  );
}

function FramedDenialLogPanel({ model, actions }) {
  const denialLog = model?.denialLog || {};
  const entries = Array.isArray(denialLog.entries) ? denialLog.entries : [];
  return (
    <AdminPanelFrame
      eyebrow="Request denials"
      title="Denial log"
      refreshedAt={denialLog.refreshedAt ?? denialLog.generatedAt}
      refreshError={denialLog.refreshError || null}
      onRefresh={() => actions.dispatch('admin-ops-request-denials-refresh', {})}
      data={entries}
      loading={Boolean(denialLog.loading)}
      emptyState={<p className="small muted">No request denials recorded.</p>}
    >
      <DenialLogPanel model={model} actions={actions} />
    </AdminPanelFrame>
  );
}

export function AdminDebuggingSection({ model, appState, accessContext, actions }) {
  return (
    <>
      <FramedErrorLogPanel model={model} actions={actions} />
      <FramedDenialLogPanel model={model} actions={actions} />
      <DebugBundlePanel model={model} actions={actions} />
      <LearnerSupportPanel model={model} appState={appState} accessContext={accessContext} actions={actions} />
    </>
  );
}
