import React from 'react';
import { platformRoleLabel } from '../../platform/access/roles.js';
import { AdultLearnerSelect } from './AdultLearnerSelect.jsx';
import { MonsterVisualConfigPanel } from './MonsterVisualConfigPanel.jsx';
import { ReadOnlyLearnerNotice } from './ReadOnlyLearnerNotice.jsx';
import { AccessDeniedCard, formatTimestamp, isBlocked, selectedWritableLearner } from './hub-utils.js';

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
              {selectedGrammarEvidence.questionTypeSummary?.[0] ? (
                <div className="small muted" style={{ marginTop: 8 }}>
                  Question-type focus: {selectedGrammarEvidence.questionTypeSummary[0].label || selectedGrammarEvidence.questionTypeSummary[0].id}
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
