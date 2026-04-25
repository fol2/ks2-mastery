import React from 'react';
import { platformRoleLabel } from '../../platform/access/roles.js';
import { AdultLearnerSelect } from './AdultLearnerSelect.jsx';
import { MonsterVisualConfigPanel } from './MonsterVisualConfigPanel.jsx';
import { ReadOnlyLearnerNotice } from './ReadOnlyLearnerNotice.jsx';
import { AccessDeniedCard, formatTimestamp, isBlocked, selectedWritableLearner } from './hub-utils.js';
import { PanelHeader } from './admin-panel-header.jsx';

function AdminAccountRoles({ model, directory = {}, actions }) {
  const isAdmin = model?.permissions?.platformRole === 'admin';
  const accounts = Array.isArray(directory.accounts) ? directory.accounts : [];
  const status = directory.status || 'idle';
  const savingAccountId = directory.savingAccountId || '';

  if (!isAdmin) {
    return (
      <section className="card" style={{ marginBottom: 20 }}>
        <div className="eyebrow">Account roles</div>
        <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Admin-only role management</h3>
        <div className="feedback warn">Only admin accounts can list accounts or change platform roles.</div>
      </section>
    );
  }

  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div>
          <div className="eyebrow">Account roles</div>
          <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Production platform access</h3>
          <p className="subtitle">Roles are written to D1 adult accounts and audited through mutation receipts. The backend blocks demoting the last admin.</p>
        </div>
        <div className="actions">
          <span className="chip">{status === 'saving' ? 'Saving role' : status === 'loaded' ? 'Loaded' : status === 'loading' ? 'Loading' : 'Ready'}</span>
          <button className="btn secondary" type="button" onClick={() => actions.dispatch('admin-accounts-refresh')}>Refresh accounts</button>
        </div>
      </div>
      {directory.error && <div className="feedback bad" style={{ marginBottom: 14 }}>{directory.error}</div>}
      {status === 'loading' && !accounts.length && <p className="small muted">Loading production accounts...</p>}
      {accounts.length ? accounts.map((account) => (
        <div className="skill-row" key={account.id}>
          <div>
            <strong>{account.email || account.id}</strong>
            <div className="small muted">{account.displayName || 'No display name'} · {(account.providers || []).join(', ') || 'unknown provider'}</div>
          </div>
          <div className="small muted">{Number(account.learnerCount || 0)} learner{Number(account.learnerCount) === 1 ? '' : 's'}</div>
          <div className="small muted">Updated {formatTimestamp(account.updatedAt)}</div>
          <div>
            <label className="field" style={{ minWidth: 150 }}>
              <span>Role</span>
              <select
                className="select"
                name="platformRole"
                value={account.platformRole}
                disabled={savingAccountId === account.id}
                onChange={(event) => actions.dispatch('admin-account-role-set', { accountId: account.id, value: event.target.value })}
              >
                {['parent', 'admin', 'ops'].map((role) => (
                  <option value={role} key={role}>{platformRoleLabel(role)}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )) : (status === 'loaded' ? <p className="small muted">No production accounts were returned.</p> : null)}
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
  const accountOpsUpdates = kpis.accountOpsUpdates || {};
  const items = [
    ['Adult accounts', accounts.total],
    ['Learners', learners.total],
    ['Active demo accounts', demos.active],
    ['Practice sessions (7d)', practiceSessions.last7d],
    ['Practice sessions (30d)', practiceSessions.last30d],
    ['Event log (7d)', eventLog.last7d],
    ['Mutation receipts (7d)', mutationReceipts.last7d],
    ['Errors: open', byStatus.open],
    ['Errors: investigating', byStatus.investigating],
    ['Errors: resolved', byStatus.resolved],
    ['Errors: ignored', byStatus.ignored],
    ['Account ops updates', accountOpsUpdates.total],
  ];
  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <PanelHeader
        eyebrow="Dashboard KPI"
        title="Dashboard overview"
        generatedAt={kpis.generatedAt}
        refreshError={kpis.refreshError || null}
        onRefresh={() => actions.dispatch('admin-ops-kpi-refresh')}
      />
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

function RecentActivityStreamPanel({ model, actions }) {
  const stream = model?.opsActivityStream || {};
  const entries = Array.isArray(stream.entries) ? stream.entries : [];
  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <PanelHeader
        eyebrow="Ops activity"
        title="Recent operations activity"
        subtitle="Latest mutation receipts across accounts. Learner scope ids pre-masked to last 8 characters; account scope ids to last 6."
        generatedAt={stream.generatedAt}
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

const OPS_STATUS_OPTIONS = ['active', 'suspended', 'payment_hold'];
// R27: prominent, UK-English non-enforcement notice rendered beside the
// ops_status control. Do NOT reword — the string is asserted verbatim.
const ACCOUNT_OPS_R27_CALLOUT = 'Status labels are informational only. Suspension, payment-hold, and deactivation are not currently enforced by sign-in. Enforcement is planned for a later release.';

function AccountOpsMetadataRow({ account, canManage, savingAccountId, actions }) {
  const accountId = account.accountId;
  const isSaving = savingAccountId === accountId;
  const [opsStatus, setOpsStatus] = React.useState(account.opsStatus || 'active');
  const [planLabel, setPlanLabel] = React.useState(account.planLabel || '');
  const [tagsText, setTagsText] = React.useState((account.tags || []).join(', '));
  const [internalNotes, setInternalNotes] = React.useState(account.internalNotes || '');

  // P1.5 Phase A (U2): a `useRef`-gated dirty flag blocks the prop-to-state
  // re-sync below whenever the user is mid-edit. The flag is authoritative
  // per row; the parent panel and cascade dispatcher only need to know
  // whether ANY row is dirty (so they can decide whether to suppress the
  // metadata panel's own narrow refresh). We register the flag with the
  // module-scope registry via `actions.registerAccountOpsMetadataRowDirty`
  // every time it flips so the suppression-and-flush bookkeeping stays in
  // one place. The dispatcher clears the ref on save success.
  const dirtyRef = React.useRef(false);
  const registerDirty = actions?.registerAccountOpsMetadataRowDirty
    || (() => {});
  const markDirty = React.useCallback(() => {
    if (dirtyRef.current) return;
    dirtyRef.current = true;
    registerDirty(accountId, true);
  }, [accountId, registerDirty]);

  // P1.5 Phase A (U2): rehydrate local input state from server props ONLY
  // when the row is not dirty. Each of the four useEffect hooks below
  // guards on `dirtyRef.current` so a mid-edit textarea is not wiped by an
  // auto-refresh arriving seconds later. On save success the dispatcher
  // calls registerDirty(accountId, false), which both clears the ref
  // (next refresh applies) and fires the suppression-flush if applicable.
  React.useEffect(() => {
    if (!dirtyRef.current) setOpsStatus(account.opsStatus || 'active');
  }, [account.opsStatus]);
  React.useEffect(() => {
    if (!dirtyRef.current) setPlanLabel(account.planLabel || '');
  }, [account.planLabel]);
  React.useEffect(() => {
    if (!dirtyRef.current) setTagsText((account.tags || []).join(', '));
  }, [account.tags]);
  React.useEffect(() => {
    if (!dirtyRef.current) setInternalNotes(account.internalNotes || '');
  }, [account.internalNotes]);

  // Unmount-clean: if a dirty row unmounts (learner switch, panel collapse)
  // we drop its entry from the module-scope registry so a still-dirty row
  // that no longer exists does not block future metadata-panel refreshes.
  React.useEffect(() => () => {
    if (dirtyRef.current) registerDirty(accountId, false);
  }, [accountId, registerDirty]);

  const handleSave = () => {
    const parsedTags = tagsText
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .slice(0, 10);
    actions.dispatch('account-ops-metadata-save', {
      accountId,
      patch: {
        opsStatus,
        planLabel: planLabel.trim() === '' ? null : planLabel.trim(),
        tags: parsedTags,
        internalNotes: internalNotes.trim() === '' ? null : internalNotes,
      },
    });
  };

  if (!canManage) {
    // Read-only render preserved verbatim from U4. Ops-role viewers also see
    // the R27 callout so they understand the informational nature of the flag.
    return (
      <div className="skill-row" key={accountId}>
        <div>
          <strong>{account.email || accountId}</strong>
          <div className="small muted">{account.displayName || 'No display name'} · {account.platformRole || 'parent'}</div>
        </div>
        <div>
          <span className="chip">{account.opsStatus || 'active'}</span>
          <div className="callout warn small" style={{ marginTop: 6 }}>{ACCOUNT_OPS_R27_CALLOUT}</div>
        </div>
        <div className="small muted">{account.planLabel || '—'}</div>
        <div className="small muted">{(account.tags || []).join(', ') || '—'}</div>
        <div className="small muted">{account.internalNotes ?? '—'}</div>
        <div className="small muted">Updated {formatTimestamp(account.updatedAt)}</div>
      </div>
    );
  }

  return (
    <div className="skill-row" key={accountId}>
      <div>
        <strong>{account.email || accountId}</strong>
        <div className="small muted">{account.displayName || 'No display name'} · {account.platformRole || 'parent'}</div>
      </div>
      <div>
        <label className="field" style={{ minWidth: 140 }}>
          <span>Ops status</span>
          <select
            className="select"
            name="opsStatus"
            value={opsStatus}
            disabled={isSaving}
            onChange={(event) => { markDirty(); setOpsStatus(event.target.value); }}
          >
            {OPS_STATUS_OPTIONS.map((option) => (
              <option value={option} key={option}>{option}</option>
            ))}
          </select>
        </label>
        <div className="callout warn small" style={{ marginTop: 6 }}>{ACCOUNT_OPS_R27_CALLOUT}</div>
      </div>
      <label className="field" style={{ minWidth: 140 }}>
        <span>Plan label</span>
        <input
          className="input"
          type="text"
          name="planLabel"
          value={planLabel}
          maxLength={64}
          disabled={isSaving}
          onChange={(event) => { markDirty(); setPlanLabel(event.target.value); }}
        />
      </label>
      <label className="field" style={{ minWidth: 160 }}>
        <span>Tags (comma separated)</span>
        <input
          className="input"
          type="text"
          name="tags"
          value={tagsText}
          disabled={isSaving}
          onChange={(event) => { markDirty(); setTagsText(event.target.value); }}
        />
      </label>
      <label className="field" style={{ minWidth: 200 }}>
        <span>Internal notes</span>
        <textarea
          className="input"
          name="internalNotes"
          value={internalNotes}
          maxLength={2000}
          rows={3}
          disabled={isSaving}
          onChange={(event) => { markDirty(); setInternalNotes(event.target.value); }}
        />
      </label>
      <div>
        <button className="btn secondary" type="button" disabled={isSaving} onClick={handleSave}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <div className="small muted" style={{ marginTop: 4 }}>Updated {formatTimestamp(account.updatedAt)}</div>
      </div>
    </div>
  );
}

function AccountOpsMetadataPanel({ model, actions }) {
  const directory = model?.accountOpsMetadata || {};
  const accounts = Array.isArray(directory.accounts) ? directory.accounts : [];
  // R27/R2: admin-only edit controls; ops-role users see read-only rows but
  // still get the non-enforcement callout.
  const canManage = model?.permissions?.platformRole === 'admin';
  const savingAccountId = directory.savingAccountId || '';
  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <PanelHeader
        eyebrow="Account ops"
        title="Account ops metadata"
        subtitle="GM-facing labels, plans, tags, and notes per account. Admin accounts can edit; ops-role accounts can view."
        generatedAt={directory.generatedAt}
        refreshError={directory.refreshError || null}
        onRefresh={() => actions.dispatch('account-ops-metadata-refresh')}
      />
      {accounts.length ? accounts.map((account) => (
        <AccountOpsMetadataRow
          key={account.accountId}
          account={account}
          canManage={canManage}
          savingAccountId={savingAccountId}
          actions={actions}
        />
      )) : <p className="small muted">No account ops metadata to show.</p>}
    </section>
  );
}

const ERROR_EVENT_STATUS_OPTIONS = ['open', 'investigating', 'resolved', 'ignored'];

function ErrorLogCentrePanel({ model, actions }) {
  const summary = model?.errorLogSummary || {};
  const totals = summary.totals || {};
  const entries = Array.isArray(summary.entries) ? summary.entries : [];
  const statusFilters = ERROR_EVENT_STATUS_OPTIONS;
  // R10: status transitions are admin-only. Ops-role viewers keep the chip.
  const canManage = model?.permissions?.platformRole === 'admin';
  const savingEventId = summary.savingEventId || '';
  const headerExtras = (
    <>
      <div className="chip-row" style={{ marginTop: 8 }}>
        <span className="chip">{String(Number(totals.open) || 0)} open</span>
        <span className="chip">{String(Number(totals.investigating) || 0)} investigating</span>
        <span className="chip">{String(Number(totals.resolved) || 0)} resolved</span>
        <span className="chip">{String(Number(totals.ignored) || 0)} ignored</span>
      </div>
      <div className="chip-row" style={{ marginTop: 8 }}>
        {statusFilters.map((status) => (
          <button
            className="btn ghost"
            type="button"
            key={status}
            onClick={() => actions.dispatch('admin-ops-error-events-refresh', { status })}
          >
            Show {status}
          </button>
        ))}
      </div>
    </>
  );
  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <PanelHeader
        eyebrow="Error log"
        title="Error log centre"
        generatedAt={summary.generatedAt}
        refreshError={summary.refreshError || null}
        onRefresh={() => actions.dispatch('admin-ops-error-events-refresh', { status: null })}
        headerExtras={headerExtras}
      />
      {entries.length ? entries.map((entry) => {
        const isSaving = savingEventId === entry.id;
        return (
          <div className="skill-row" key={entry.id}>
            <div>
              <strong>{entry.errorKind || 'Error'}</strong>
              <div className="small muted">{entry.messageFirstLine || ''}</div>
            </div>
            <div className="small muted">{entry.routeName || ''}</div>
            <div>×{Number(entry.occurrenceCount) || 1}</div>
            <div className="small muted">First {formatTimestamp(entry.firstSeen)}</div>
            <div className="small muted">Last {formatTimestamp(entry.lastSeen)}</div>
            <div>
              {canManage ? (
                <label className="field" style={{ minWidth: 150 }}>
                  <span>Status</span>
                  <select
                    className="select"
                    name="errorEventStatus"
                    value={entry.status || 'open'}
                    disabled={isSaving}
                    onChange={(event) => actions.dispatch('ops-error-event-status-set', { eventId: entry.id, status: event.target.value })}
                  >
                    {ERROR_EVENT_STATUS_OPTIONS.map((option) => (
                      <option value={option} key={option}>{option}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="chip">{entry.status || 'open'}</span>
              )}
            </div>
          </div>
        );
      }) : <p className="small muted">No error events recorded.</p>}
    </section>
  );
}

export function AdminHubSurface({ appState, model, hubState = {}, accountDirectory = {}, accessContext = {}, actions }) {
  const loadingRemote = accessContext?.shellAccess?.source === 'worker-session' && hubState.status === 'loading' && !model;
  if (loadingRemote) {
    return (
      <section className="card">
        <div className="feedback warn">
          <strong>Loading Admin / Operations</strong>
          <div style={{ marginTop: 8 }}>Loading live Worker diagnostics, readable learner access, and audit summaries.</div>
        </div>
      </section>
    );
  }

  if (!model && hubState.status === 'error') {
    return (
      <AccessDeniedCard
        title="Admin / Operations could not be loaded right now"
        detail={hubState.error || 'The live Worker admin hub payload could not be loaded.'}
        onBack={actions.navigateHome}
      />
    );
  }

  if (!model?.permissions?.canViewAdminHub) {
    return (
      <AccessDeniedCard
        title="Admin / Operations is not available for the current surface role"
        detail="Admin / Operations requires the admin or operations platform role. Parent Hub remains a separate surface."
        onBack={actions.navigateHome}
      />
    );
  }

  const selectedDiagnostics = model.learnerSupport?.selectedDiagnostics || null;
  const accessibleLearners = Array.isArray(model.learnerSupport?.accessibleLearners) ? model.learnerSupport.accessibleLearners : [];
  const auditEntries = Array.isArray(model.auditLogLookup?.entries) ? model.auditLogLookup.entries : [];
  const selectedLearnerId = model.learnerSupport?.selectedLearnerId || selectedDiagnostics?.learnerId || '';
  const selectedGrammarEvidence = selectedDiagnostics?.grammarEvidence || {};
  const selectedPunctuationEvidence = selectedDiagnostics?.punctuationEvidence || {};
  const selectedPunctuationRelease = selectedPunctuationEvidence.releaseDiagnostics
    || model.learnerSupport?.punctuationReleaseDiagnostics
    || {};
  const notice = hubState.notice || accessContext.adultSurfaceNotice || '';
  const writableLearner = selectedWritableLearner(appState);

  return (
    <>
      <section className="subject-header card border-top" style={{ borderTopColor: '#8A4FFF', marginBottom: 18 }}>
        <div className="subject-title-row">
          <div>
            <div className="eyebrow">Admin / operations skeleton</div>
            <h2 className="title" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}>First SaaS operating surfaces</h2>
            <p className="subtitle">Thin and honest. Signed-in Operations now uses the live Worker admin hub payload for readable learner diagnostics and role-aware learner access labels.</p>
          </div>
          <div className="actions" style={{ alignItems: 'flex-end', justifyContent: 'flex-end' }}>
            <AdultLearnerSelect
              learners={accessibleLearners}
              selectedLearnerId={selectedLearnerId}
              label="Diagnostics learner"
              disabled={hubState.status === 'loading'}
              onSelect={(value) => actions.dispatch('adult-surface-learner-select', { value })}
            />
            <div className="chip-row">
              <span className="chip good">{model.permissions.platformRoleLabel}</span>
              <span className="chip">Repo revision: {String(model.account.repoRevision || 0)}</span>
              <span className="chip">Selected learner: {model.account.selectedLearnerId || selectedLearnerId || '—'}</span>
            </div>
          </div>
        </div>
        {notice && <div className="feedback warn" style={{ marginTop: 16 }}>{notice}</div>}
        <ReadOnlyLearnerNotice access={accessContext.activeAdultLearnerContext} writableLearner={writableLearner} />
      </section>

      <MonsterVisualConfigPanel model={model} accountId={model.account?.id || ''} actions={actions} />
      <AdminAccountRoles model={model} directory={accountDirectory} actions={actions} />
      <DashboardKpiPanel model={model} actions={actions} />
      <RecentActivityStreamPanel model={model} actions={actions} />
      <DemoOperationsSummary summary={model.demoOperations} />

      <section className="two-col" style={{ marginBottom: 20 }}>
        <article className="card">
          <div className="eyebrow">Content release status</div>
          <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Published spelling snapshot</h3>
          <div className="chip-row" style={{ marginTop: 14 }}>
            <span className="chip good">Release {String(model.contentReleaseStatus.publishedVersion || 0)}</span>
            <span className="chip">{model.contentReleaseStatus.publishedReleaseId || 'unpublished'}</span>
            <span className="chip">{String(model.contentReleaseStatus.runtimeWordCount || 0)} words</span>
            <span className="chip">{String(model.contentReleaseStatus.runtimeSentenceCount || 0)} sentences</span>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            Draft {model.contentReleaseStatus.currentDraftId} · version {String(model.contentReleaseStatus.currentDraftVersion || 1)} · updated {formatTimestamp(model.contentReleaseStatus.draftUpdatedAt)}
          </p>
          <div className="actions" style={{ marginTop: 16 }}>
            <button className="btn secondary" type="button" disabled={isBlocked('open-subject', accessContext)} onClick={() => actions.openSubject('spelling')}>Open Spelling</button>
            <button className="btn secondary" type="button" disabled={isBlocked('open-subject', accessContext)} onClick={() => actions.dispatch('open-subject', { subjectId: 'spelling', tab: 'settings' })}>Open settings tab</button>
            <button className="btn ghost" type="button" onClick={() => actions.dispatch('spelling-content-export')}>Export content</button>
          </div>
        </article>
        <article className="card soft">
          <div className="eyebrow">Import / validation status</div>
          <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Draft versus published safety</h3>
          <div className={`feedback ${model.importValidationStatus.ok ? 'good' : 'bad'}`}>
            <strong>{model.importValidationStatus.ok ? 'Validation clean' : 'Validation problems present'}</strong>
            <div style={{ marginTop: 8 }}>Errors: {String(model.importValidationStatus.errorCount || 0)} · warnings: {String(model.importValidationStatus.warningCount || 0)}</div>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>Import provenance source: {model.importValidationStatus.source || 'bundled baseline'} · imported at {formatTimestamp(model.importValidationStatus.importedAt)}</p>
          {(model.importValidationStatus.errors || []).length ? (
            <details style={{ marginTop: 12 }}>
              <summary>Validation issues</summary>
              <div className="small muted" style={{ marginTop: 10 }}>
                {model.importValidationStatus.errors.map((issue) => `${issue.code} - ${issue.message}`).join('\n')}
              </div>
            </details>
          ) : null}
        </article>
      </section>

      <AccountOpsMetadataPanel model={model} actions={actions} />
      <ErrorLogCentrePanel model={model} actions={actions} />

      <section className="two-col" style={{ marginBottom: 20 }}>
        <article className="card">
          <div className="eyebrow">Audit-log lookup</div>
          <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Mutation receipt stream</h3>
          <p className="small muted">{model.auditLogLookup.note || ''}</p>
          {model.auditLogLookup.available ? (
            auditEntries.length ? auditEntries.map((entry) => (
              <div className="skill-row" key={entry.requestId || `${entry.mutationKind}-${entry.appliedAt}`}>
                <div><strong>{entry.mutationKind || 'mutation'}</strong></div>
                <div className="small muted">{entry.scopeType || ''} · {entry.scopeId || 'account'}</div>
                <div>{entry.requestId || ''}</div>
                <div className="small muted">{formatTimestamp(entry.appliedAt)}</div>
              </div>
            )) : <p className="small muted">No audit entries matched the current lookup.</p>
          ) : <div className="callout warn" style={{ marginTop: 12 }}>The local reference build keeps this surface visible, but the live lookup itself is only wired on the Worker API path.</div>}
        </article>
        <article className="card">
          <div className="eyebrow">Learner support / diagnostics</div>
          <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Readable learners</h3>
          {accessibleLearners.length ? accessibleLearners.map((entry) => (
            <div className="skill-row" key={entry.learnerId}>
              <div>
                <strong>{entry.learnerName}</strong>
                <div className="small muted">{entry.yearGroup} · {entry.membershipRoleLabel} · {entry.accessModeLabel || (entry.writable ? 'Writable learner' : 'Read-only learner')}</div>
              </div>
              <div className="small muted">Focus: {entry.currentFocus?.label || '—'}</div>
              <div>{String(entry.overview?.dueWords ?? 0)} due</div>
              <div className="small muted">
                Grammar: {String(entry.grammarEvidence?.progressSnapshot?.dueConcepts ?? entry.overview?.dueGrammarConcepts ?? 0)} due / {String(entry.grammarEvidence?.progressSnapshot?.weakConcepts ?? entry.overview?.weakGrammarConcepts ?? 0)} weak
              </div>
              <div className="small muted">
                Punctuation: {String(entry.punctuationEvidence?.progressSnapshot?.dueItems ?? entry.overview?.duePunctuationItems ?? 0)} due / {String(entry.punctuationEvidence?.progressSnapshot?.weakItems ?? entry.overview?.weakPunctuationItems ?? 0)} weak
              </div>
              <div><button className="btn ghost" type="button" onClick={() => actions.dispatch('adult-surface-learner-select', { value: entry.learnerId })}>Select</button></div>
            </div>
          )) : <p className="small muted">No learner diagnostics are accessible from this account scope yet.</p>}
          {selectedDiagnostics && (
            <div className="callout" style={{ marginTop: 16 }}>
              <strong>{selectedDiagnostics.learnerName}</strong>
              <div style={{ marginTop: 8 }}>
                Secure: {String(selectedDiagnostics.overview?.secureWords ?? 0)} · Due: {String(selectedDiagnostics.overview?.dueWords ?? 0)} · Trouble: {String(selectedDiagnostics.overview?.troubleWords ?? 0)}
              </div>
              <div style={{ marginTop: 8 }}>
                <strong>Grammar diagnostics</strong>: secured {String(selectedGrammarEvidence.progressSnapshot?.securedConcepts ?? selectedDiagnostics.overview?.secureGrammarConcepts ?? 0)} · due {String(selectedGrammarEvidence.progressSnapshot?.dueConcepts ?? selectedDiagnostics.overview?.dueGrammarConcepts ?? 0)} · weak {String(selectedGrammarEvidence.progressSnapshot?.weakConcepts ?? selectedDiagnostics.overview?.weakGrammarConcepts ?? 0)}
              </div>
              <div style={{ marginTop: 8 }}>
                <strong>Punctuation diagnostics</strong>: secured {String(selectedPunctuationEvidence.progressSnapshot?.securedRewardUnits ?? selectedDiagnostics.overview?.securePunctuationUnits ?? 0)} · due {String(selectedPunctuationEvidence.progressSnapshot?.dueItems ?? selectedDiagnostics.overview?.duePunctuationItems ?? 0)} · weak {String(selectedPunctuationEvidence.progressSnapshot?.weakItems ?? selectedDiagnostics.overview?.weakPunctuationItems ?? 0)}
              </div>
              <div className="small muted" style={{ marginTop: 8 }}>
                Punctuation release: {selectedPunctuationRelease.releaseId || 'unknown'} · tracked units {String(selectedPunctuationRelease.trackedRewardUnitCount ?? 0)} · sessions {String(selectedPunctuationRelease.sessionCount ?? 0)} · weak patterns {String(selectedPunctuationRelease.weakPatternCount ?? 0)} · exposure {selectedPunctuationRelease.productionExposureStatus || 'unknown'}
              </div>
              {selectedGrammarEvidence.questionTypeSummary?.[0] ? (
                <div className="small muted" style={{ marginTop: 8 }}>
                  Question-type focus: {selectedGrammarEvidence.questionTypeSummary[0].label || selectedGrammarEvidence.questionTypeSummary[0].id}
                </div>
              ) : null}
              {selectedPunctuationEvidence.weakestFacets?.[0] ? (
                <div className="small muted" style={{ marginTop: 8 }}>
                  Punctuation focus: {selectedPunctuationEvidence.weakestFacets[0].label || selectedPunctuationEvidence.weakestFacets[0].id}
                </div>
              ) : null}
              <div className="small muted" style={{ marginTop: 8 }}>{selectedDiagnostics.currentFocus?.detail || 'No current focus surfaced.'}</div>
            </div>
          )}
          <div className="actions" style={{ marginTop: 16 }}>
            {(model.learnerSupport.entryPoints || []).map((entry) => (
              <button
                className="btn secondary"
                type="button"
                disabled={isBlocked(entry.action, accessContext)}
                onClick={() => actions.dispatch(entry.action, { subjectId: entry.subjectId, tab: entry.tab })}
                key={`${entry.action}-${entry.label}`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
