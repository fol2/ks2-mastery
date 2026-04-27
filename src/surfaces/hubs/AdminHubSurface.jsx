import React from 'react';
import { AdultLearnerSelect } from './AdultLearnerSelect.jsx';
import { ReadOnlyLearnerNotice } from './ReadOnlyLearnerNotice.jsx';
import { AccessDeniedCard, selectedWritableLearner } from './hub-utils.js';
import { AdminSectionTabs } from './AdminSectionTabs.jsx';
import { AdminOverviewSection } from './AdminOverviewSection.jsx';
import { AdminAccountsSection } from './AdminAccountsSection.jsx';
import { AdminDebuggingSection } from './AdminDebuggingSection.jsx';
import { AdminContentSection } from './AdminContentSection.jsx';
import { AdminMarketingSection } from './AdminMarketingSection.jsx';
import { createAccountOpsMetadataDirtyRegistry } from '../../platform/hubs/admin-metadata-dirty-registry.js';
import { shouldBlockSectionChange } from '../../platform/hubs/admin-section-guard.js';
// U4+U5: AdminHubSurface is now a thin shell that renders:
//   1. Access-denied / loading / error guards (unchanged)
//   2. Updated header with console branding + LearnerSelect
//   3. AdminSectionTabs for horizontal tab navigation
//   4. The active section component based on the adminSection key
//
// The dirty-row guard prevents tab switches when AccountOpsMetadataRow
// has unsaved changes. The registry is created once per mount and shared
// with section components via the actions prop.

const DEFAULT_SECTION = 'overview';

// Module-level dirty registry instance — created once per AdminHubSurface
// mount. The registry's `anyDirty()` is consulted before tab switches.
// Section components receive `registerAccountOpsMetadataRowDirty` through
// the actions prop so they can register/clear dirty flags.
function useAdminDirtyRegistry() {
  const registryRef = React.useRef(null);
  if (!registryRef.current) {
    registryRef.current = createAccountOpsMetadataDirtyRegistry();
  }
  return registryRef.current;
}

export function AdminHubSurface({ appState, model, hubState = {}, accountDirectory = {}, accessContext = {}, actions, initialSection }) {
  const [activeSection, setActiveSection] = React.useState(initialSection || DEFAULT_SECTION);
  const dirtyRegistry = useAdminDirtyRegistry();

  const loadingRemote = accessContext?.shellAccess?.source === 'worker-session' && hubState.status === 'loading' && !model;
  if (loadingRemote) {
    return (
      <section className="card">
        <div className="feedback warn">
          <strong>Loading Admin Console</strong>
          <div style={{ marginTop: 8 }}>Loading live Worker diagnostics, readable learner access, and audit summaries.</div>
        </div>
      </section>
    );
  }

  if (!model && hubState.status === 'error') {
    return (
      <AccessDeniedCard
        title="Admin Console could not be loaded right now"
        detail={hubState.error || 'The live Worker admin hub payload could not be loaded.'}
        onBack={actions.navigateHome}
      />
    );
  }

  if (!model?.permissions?.canViewAdminHub) {
    return (
      <AccessDeniedCard
        title="Admin Console is not available for the current surface role"
        detail="Admin Console requires the admin or operations platform role. Parent Hub remains a separate surface."
        onBack={actions.navigateHome}
      />
    );
  }

  const selectedDiagnostics = model.learnerSupport?.selectedDiagnostics || null;
  const accessibleLearners = Array.isArray(model.learnerSupport?.accessibleLearners) ? model.learnerSupport.accessibleLearners : [];
  const selectedLearnerId = model.learnerSupport?.selectedLearnerId || selectedDiagnostics?.learnerId || '';
  const bootstrapCapacityDegraded = appState?.persistence?.breakersDegraded?.bootstrapCapacity === true;
  const notice = hubState.notice || accessContext.adultSurfaceNotice || '';
  const writableLearner = selectedWritableLearner(appState);

  // Dirty-row guard: before switching tabs, check if any AccountOpsMetadata
  // rows have unsaved edits. If so, prompt the user before discarding.
  // The decision logic is extracted into shouldBlockSectionChange() so it
  // can be unit-tested without a DOM / confirm() dependency.
  const handleTabChange = (nextSection) => {
    const guard = shouldBlockSectionChange(dirtyRegistry, nextSection, activeSection);
    if (guard.blocked && guard.reason === 'same-section') return;
    if (guard.blocked && guard.reason === 'dirty-rows') {
      // eslint-disable-next-line no-restricted-globals, no-alert
      const confirmed = confirm('You have unsaved changes in Account Ops Metadata. Discard and switch section?');
      if (!confirmed) return;
      dirtyRegistry.clear();
    }
    setActiveSection(nextSection);
    actions.dispatch('admin-section-change', { section: nextSection });
  };

  // Augment actions with dirty-registry callback so AccountOpsMetadataRow
  // can register/clear its dirty state.
  const sectionActions = React.useMemo(() => ({
    ...actions,
    registerAccountOpsMetadataRowDirty: (accountId, isDirty) => {
      dirtyRegistry.setDirty(accountId, isDirty);
    },
  }), [actions, dirtyRegistry]);

  const sectionProps = {
    model,
    appState,
    hubState,
    accessContext,
    accountDirectory,
    actions: sectionActions,
  };

  return (
    <>
      <section className="subject-header card border-top" style={{ borderTopColor: '#8A4FFF', marginBottom: 18 }}>
        <div className="subject-title-row">
          <div>
            <div className="eyebrow">Admin Console</div>
            <h2 className="title" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}>Operations dashboard</h2>
            <p className="subtitle">Account management, debugging tools, content management, and live operations monitoring.</p>
          </div>
          <div className="actions" style={{ alignItems: 'flex-end', justifyContent: 'flex-end' }}>
            <AdultLearnerSelect
              learners={accessibleLearners}
              selectedLearnerId={selectedLearnerId}
              label="Diagnostics learner"
              disabled={hubState.status === 'loading'}
              onSelect={(value) => sectionActions.dispatch('adult-surface-learner-select', { value })}
            />
            <div className="chip-row">
              <span className="chip good">{model.permissions.platformRoleLabel}</span>
              <span className="chip">Repo revision: {String(model.account.repoRevision || 0)}</span>
              <span className="chip">Selected learner: {model.account.selectedLearnerId || selectedLearnerId || '—'}</span>
            </div>
          </div>
        </div>
        {notice && <div className="feedback warn" style={{ marginTop: 16 }}>{notice}</div>}
        {bootstrapCapacityDegraded ? (
          <div
            className="feedback bad"
            style={{ marginTop: 16 }}
            data-admin-hub-degraded="bootstrap-capacity"
          >
            <strong>Bootstrap capacity metadata missing</strong>
            <div style={{ marginTop: 8 }}>
              The client has received three consecutive bootstrap responses
              without <code>meta.capacity.bootstrapCapacity</code>. Bootstrap
              retries have stopped. Operator action is required: confirm the
              Worker deploy and the capacity-telemetry emission path, then
              restart the tab once the response includes the metadata again.
              Student practice continues against the cached bundle.
            </div>
          </div>
        ) : null}
        <ReadOnlyLearnerNotice access={accessContext.activeAdultLearnerContext} writableLearner={writableLearner} />
      </section>

      <AdminSectionTabs activeSection={activeSection} onTabChange={handleTabChange} />

      {activeSection === 'overview' && (
        <AdminOverviewSection {...sectionProps} />
      )}
      {activeSection === 'accounts' && (
        <AdminAccountsSection {...sectionProps} />
      )}
      {activeSection === 'debug' && (
        <AdminDebuggingSection {...sectionProps} />
      )}
      {activeSection === 'content' && (
        <AdminContentSection {...sectionProps} />
      )}
      {activeSection === 'marketing' && (
        <AdminMarketingSection />
      )}
    </>
  );
}
