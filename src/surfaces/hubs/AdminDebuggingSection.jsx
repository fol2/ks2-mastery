import React from 'react';
import { ErrorLogCentrePanel } from './AdminErrorTimelinePanel.jsx';
import { DenialLogPanel } from './AdminRequestDenialsPanel.jsx';
import { DebugBundlePanel } from './AdminDebugBundlePanel.jsx';
import { LearnerSupportPanel } from './AdminLearnerSupportPanel.jsx';

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
// P5 U1: AdminPanelFrame adopted in Overview section. Debugging panels
// retain their own internal card/PanelHeader rendering (they have complex
// headerExtras with filter UIs that don't compose cleanly with the frame
// wrapper). Frame adoption for these panels requires internal refactoring
// to accept frame props — deferred to a follow-up unit.

export function AdminDebuggingSection({ model, appState, accessContext, actions }) {
  return (
    <>
      <ErrorLogCentrePanel model={model} actions={actions} />
      <DenialLogPanel model={model} actions={actions} />
      <DebugBundlePanel model={model} actions={actions} />
      <LearnerSupportPanel model={model} appState={appState} accessContext={accessContext} actions={actions} />
    </>
  );
}
