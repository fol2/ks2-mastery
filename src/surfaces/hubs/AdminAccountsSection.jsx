import React from 'react';
import { platformRoleLabel } from '../../platform/access/roles.js';
import { formatTimestamp } from './hub-utils.js';
import { PanelHeader } from './admin-panel-header.jsx';
import { decideDirtyResetOnServerUpdate } from '../../platform/hubs/admin-metadata-dirty-registry.js';
import { useSubmitLock } from '../../platform/react/use-submit-lock.js';
import {
  buildAccountOpsMetadataConflictDiff,
  formatAccountOpsMetadataConflictValue,
} from '../../platform/hubs/admin-metadata-conflict-diff.js';
import {
  buildKeepMineDispatchPayload,
  applyUseTheirsStateUpdate,
} from '../../platform/hubs/admin-metadata-conflict-actions.js';
import {
  decideAccountOpsSave,
  defaultConfirmOpsStatusChange,
} from '../../platform/hubs/admin-ops-confirm.js';
import {
  normaliseSearchResult,
  debugBundleLinkForAccount,
} from '../../platform/hubs/admin-account-search.js';
import {
  prepareSafeCopy,
  copyToClipboard,
  COPY_AUDIENCE,
} from '../../platform/hubs/admin-safe-copy.js';
import { saveIncidentStash } from '../../platform/hubs/admin-incident-flow.js';

// U4+U5: Accounts section — role management, ops metadata, and audit log.
// Extracted from AdminHubSurface.jsx. All inline components preserved
// verbatim with their original comments for traceability.

const formatConflictValue = formatAccountOpsMetadataConflictValue;

function AdminAccountRoles({ model, directory = {}, actions }) {
  const isAdmin = model?.permissions?.platformRole === 'admin';
  const accounts = Array.isArray(directory.accounts) ? directory.accounts : [];
  const status = directory.status || 'idle';
  const savingAccountId = directory.savingAccountId || '';

  if (!isAdmin) {
    return (
      <section className="card admin-card-spaced">
        <div className="eyebrow">Account roles</div>
        <h3 className="section-title admin-section-title">Admin-only role management</h3>
        <div className="feedback warn">Only admin accounts can list accounts or change platform roles.</div>
      </section>
    );
  }

  return (
    <section className="card admin-card-spaced">
      <div className="card-header">
        <div>
          <div className="eyebrow">Account roles</div>
          <h3 className="section-title admin-section-title">Production platform access</h3>
          <p className="subtitle">Roles are written to D1 adult accounts and audited through mutation receipts. The backend blocks demoting the last admin.</p>
        </div>
        <div className="actions">
          <span className="chip">{status === 'saving' ? 'Saving role' : status === 'loaded' ? 'Loaded' : status === 'loading' ? 'Loading' : 'Ready'}</span>
          <button className="btn secondary" type="button" onClick={() => actions.dispatch('admin-accounts-refresh')}>Refresh accounts</button>
        </div>
      </div>
      {directory.error && <div className="feedback bad admin-feedback-error-spaced">{directory.error}</div>}
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
            <label className="field admin-field-status">
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

const OPS_STATUS_OPTIONS = ['active', 'suspended', 'payment_hold'];
const ACCOUNT_OPS_ENFORCEMENT_NOTE = 'Status is enforced: suspended accounts cannot sign in, and payment-hold accounts cannot write.';

function AccountOpsMetadataRow({ account, canManage, savingAccountId, actions }) {
  const accountId = account.accountId;
  const isSaving = savingAccountId === accountId;
  const [opsStatus, setOpsStatus] = React.useState(account.opsStatus || 'active');
  const [planLabel, setPlanLabel] = React.useState(account.planLabel || '');
  const [tagsText, setTagsText] = React.useState((account.tags || []).join(', '));
  const [internalNotes, setInternalNotes] = React.useState(account.internalNotes || '');

  const dirtyRef = React.useRef(false);
  const savedAtRef = React.useRef(Number(account.updatedAt) || 0);
  const registerDirty = actions?.registerAccountOpsMetadataRowDirty
    || (() => {});
  const markDirty = React.useCallback(() => {
    if (dirtyRef.current) return;
    dirtyRef.current = true;
    registerDirty(accountId, true);
  }, [accountId, registerDirty]);

  React.useEffect(() => {
    const decision = decideDirtyResetOnServerUpdate({
      incomingUpdatedAt: account.updatedAt,
      savedAt: savedAtRef.current,
    });
    if (decision.reset) {
      savedAtRef.current = decision.nextSavedAt;
      dirtyRef.current = false;
    }
  }, [account.updatedAt]);

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

  React.useEffect(() => () => {
    if (dirtyRef.current) registerDirty(accountId, false);
  }, [accountId, registerDirty]);

  const submitLock = useSubmitLock();
  const confirmOpsStatusChange = actions?.confirmOpsStatusChange || defaultConfirmOpsStatusChange;
  const handleSave = () => {
    submitLock.run(async () => {
      const decision = decideAccountOpsSave({
        draft: { opsStatus, planLabel, tagsText, internalNotes },
        account: { accountId, opsStatus: account.opsStatus },
        confirmOpsStatusChange,
      });
      if (!decision.shouldDispatch || !decision.dispatchArgs) return;
      actions.dispatch(decision.dispatchArgs.action, decision.dispatchArgs.data);
    });
  };

  const conflict = account.conflict && typeof account.conflict === 'object' ? account.conflict : null;
  const conflictCurrentState = conflict?.currentState && typeof conflict.currentState === 'object'
    ? conflict.currentState
    : null;
  const liveDraftSnapshot = {
    opsStatus,
    planLabel: planLabel.trim() === '' ? null : planLabel.trim(),
    tags: tagsText
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .slice(0, 10),
    internalNotes: internalNotes.trim() === '' ? null : internalNotes,
  };
  const conflictDiffRows = conflictCurrentState
    ? buildAccountOpsMetadataConflictDiff(liveDraftSnapshot, conflictCurrentState)
    : [];

  const handleKeepMine = () => {
    const payload = buildKeepMineDispatchPayload({
      accountId,
      currentState: conflictCurrentState,
      opsStatus,
      planLabel,
      tagsText,
      internalNotes,
    });
    if (!payload) return;
    actions.dispatch(payload.action, payload.data);
  };

  const handleUseTheirs = () => {
    const result = applyUseTheirsStateUpdate({
      accountId,
      currentState: conflictCurrentState,
    });
    if (!result) return;
    const { nextState, dispatch } = result;
    setOpsStatus(nextState.opsStatus);
    setPlanLabel(nextState.planLabel);
    setTagsText(nextState.tagsText);
    setInternalNotes(nextState.internalNotes);
    dirtyRef.current = false;
    registerDirty(accountId, false);
    actions.dispatch(dispatch.action, dispatch.data);
  };

  if (!canManage) {
    return (
      <div className="skill-row" key={accountId}>
        <div>
          <strong>{account.email || accountId}</strong>
          <div className="small muted">{account.displayName || 'No display name'} · {account.platformRole || 'parent'}</div>
        </div>
        <div>
          <span className="chip">{account.opsStatus || 'active'}</span>
          <div className="small muted admin-note-spaced" data-testid="ops-status-enforcement-note">{ACCOUNT_OPS_ENFORCEMENT_NOTE}</div>
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
      {conflict && conflictCurrentState ? (
        <div
          className="callout warn small admin-conflict-banner-col"
          role="alert"
          data-testid="account-ops-metadata-conflict-banner"
          data-account-id={accountId}
        >
          <div><strong>This account changed in another tab.</strong> Choose how to resolve the conflict.</div>
          {conflictDiffRows.length > 0 ? (
            <ul className="admin-conflict-diff-list">
              {conflictDiffRows.map((row) => (
                <li key={row.field} data-field={row.field}>
                  <strong>{row.label}:</strong>{' '}
                  <span>yours = {formatConflictValue(row.draftValue)}</span>{' · '}
                  <span>theirs = {formatConflictValue(row.serverValue)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="small muted admin-conflict-no-diff">
              No field-level differences surfaced. Pick a resolution to continue.
            </div>
          )}
          <div className="admin-conflict-actions">
            <button
              className="btn secondary"
              type="button"
              data-action="account-ops-metadata-keep-mine"
              onClick={handleKeepMine}
              disabled={isSaving}
            >
              Keep mine
            </button>
            <button
              className="btn secondary"
              type="button"
              data-action="account-ops-metadata-use-theirs"
              onClick={handleUseTheirs}
              disabled={isSaving}
            >
              Use theirs
            </button>
          </div>
        </div>
      ) : null}
      <div>
        <strong>{account.email || accountId}</strong>
        <div className="small muted">{account.displayName || 'No display name'} · {account.platformRole || 'parent'}</div>
      </div>
      <div>
        <label className="field admin-field-md">
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
        <div className="small muted admin-note-spaced" data-testid="ops-status-enforcement-note">{ACCOUNT_OPS_ENFORCEMENT_NOTE}</div>
      </div>
      <label className="field admin-field-md">
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
      <label className="field admin-field-lg">
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
      <label className="field admin-field-xl">
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
        <button
          className="btn secondary"
          type="button"
          disabled={isSaving || submitLock.locked}
          onClick={handleSave}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <div className="small muted admin-account-updated">Updated {formatTimestamp(account.updatedAt)}</div>
      </div>
    </div>
  );
}

function AccountOpsMetadataPanel({ model, actions }) {
  const directory = model?.accountOpsMetadata || {};
  const accounts = Array.isArray(directory.accounts) ? directory.accounts : [];
  const canManage = model?.permissions?.platformRole === 'admin';
  const savingAccountId = directory.savingAccountId || '';
  return (
    <section className="card admin-card-spaced">
      <PanelHeader
        eyebrow="Account ops"
        title="Account ops metadata"
        subtitle="GM-facing labels, plans, tags, and notes per account. Admin accounts can edit; ops-role accounts can view."
        refreshedAt={directory.refreshedAt ?? directory.generatedAt}
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

function AuditLogLookup({ model }) {
  const auditEntries = Array.isArray(model.auditLogLookup?.entries) ? model.auditLogLookup.entries : [];
  return (
    <article className="card admin-card-spaced">
      <div className="eyebrow">Audit-log lookup</div>
      <h3 className="section-title admin-section-title">Mutation receipt stream</h3>
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
      ) : <div className="callout warn admin-audit-callout-spaced">The local reference build keeps this surface visible, but the live lookup itself is only wired on the Worker API path.</div>}
    </article>
  );
}

// ---------------------------------------------------------------------------
// U7 (P3): Account search bar + results + detail drawer.
// ---------------------------------------------------------------------------

function AccountSearchResultRow({ result, onSelect }) {
  const row = normaliseSearchResult(result);
  if (!row) return null;
  return (
    <div
      className="skill-row"
      data-testid="account-search-result"
      data-account-id={row.id}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(row.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(row.id); }}
    >
      <div>
        <strong>{row.email || row.id}</strong>
        <div className="small muted">{row.displayName || 'No display name'}</div>
      </div>
      <div><span className="chip">{platformRoleLabel(row.platformRole)}</span></div>
      <div><span className="chip">{row.opsStatus}</span></div>
      <div className="small muted">{row.learnerCount} learner{row.learnerCount === 1 ? '' : 's'}</div>
      <div className="small muted">Updated {formatTimestamp(row.updatedAt)}</div>
    </div>
  );
}

function AccountDetailPanel({ detail, onClose, onDebugBundle, onCopySupportSummary, copySummaryFeedback }) {
  if (!detail || !detail.account) return null;
  const { account, learners, recentErrors, recentDenials, recentMutations, opsMetadata } = detail;
  return (
    <section className="card admin-card-spaced" data-testid="account-detail-panel">
      <div className="card-header">
        <div>
          <div className="eyebrow">Account detail</div>
          <h3 className="section-title admin-section-title">{account.email || account.id}</h3>
          <p className="subtitle">{account.displayName || 'No display name'} &middot; {platformRoleLabel(account.platformRole)} &middot; {account.accountType}</p>
        </div>
        <div className="actions">
          <button className="btn secondary" type="button" onClick={onCopySupportSummary} data-testid="detail-copy-support-summary">Copy support summary</button>
          {copySummaryFeedback ? <span className="chip good" data-testid="detail-copy-feedback">{copySummaryFeedback}</span> : null}
          <button className="btn secondary" type="button" onClick={onDebugBundle} data-testid="detail-debug-bundle-link">Debug Bundle</button>
          <button className="btn secondary" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="small muted admin-account-detail-meta">
        Created {formatTimestamp(account.createdAt)} &middot; Updated {formatTimestamp(account.updatedAt)} &middot; Rev {account.repoRevision}
      </div>

      {opsMetadata && (
        <div className="admin-account-ops-meta-wrap">
          <div className="eyebrow">Ops metadata</div>
          <div className="small muted">
            Status: <strong>{opsMetadata.opsStatus}</strong>
            {opsMetadata.planLabel ? ` | Plan: ${opsMetadata.planLabel}` : ''}
            {opsMetadata.tags?.length ? ` | Tags: ${opsMetadata.tags.join(', ')}` : ''}
          </div>
          {opsMetadata.internalNotes && <div className="small muted admin-account-ops-notes">Notes: {opsMetadata.internalNotes}</div>}
        </div>
      )}

      <div className="eyebrow admin-account-learners-eyebrow">Learners ({learners.length})</div>
      {learners.length ? learners.map((l) => (
        <div className="skill-row" key={l.id}>
          <div><strong>{l.displayName || l.id}</strong></div>
          <div className="small muted">Year {l.yearGroup ?? '?'} &middot; {l.membershipRole}</div>
          <div className="small muted">Updated {formatTimestamp(l.updatedAt)}</div>
        </div>
      )) : <p className="small muted">No linked learners.</p>}

      <div className="eyebrow admin-account-errors-eyebrow">Recent errors ({recentErrors.length})</div>
      {recentErrors.length ? recentErrors.map((e) => (
        <div className="skill-row" key={e.id}>
          <div><strong>{e.errorKind}</strong>: {e.messageFirstLine}</div>
          <div className="small muted">{e.status} &middot; {e.occurrenceCount}x</div>
          <div className="small muted">Last seen {formatTimestamp(e.lastSeen)}</div>
        </div>
      )) : <p className="small muted">No recent errors.</p>}

      {recentDenials.length > 0 && (
        <>
          <div className="eyebrow admin-account-errors-eyebrow">Recent denials ({recentDenials.length})</div>
          {recentDenials.map((d) => (
            <div className="skill-row" key={d.id}>
              <div><strong>{d.denialReason}</strong></div>
              <div className="small muted">{d.routeName}</div>
              <div className="small muted">{formatTimestamp(d.deniedAt)}</div>
            </div>
          ))}
        </>
      )}

      <div className="eyebrow admin-account-errors-eyebrow">Recent mutations ({recentMutations.length})</div>
      {recentMutations.length ? recentMutations.map((m) => (
        <div className="skill-row" key={m.requestId || `${m.mutationKind}-${m.appliedAt}`}>
          <div><strong>{m.mutationKind}</strong></div>
          <div className="small muted">{m.scopeType} &middot; {m.scopeId}</div>
          <div className="small muted">{formatTimestamp(m.appliedAt)}</div>
        </div>
      )) : <p className="small muted">No recent mutations.</p>}
    </section>
  );
}

function AccountSearchPanel({ model, actions }) {
  const search = model?.accountSearch || {};
  const results = Array.isArray(search.results) ? search.results : [];
  const status = search.status || 'idle';
  const detail = search.detail || null;
  const [query, setQuery] = React.useState(search.query || '');
  const [opsStatusFilter, setOpsStatusFilter] = React.useState('');
  const [platformRoleFilter, setPlatformRoleFilter] = React.useState('');

  const handleSearch = () => {
    actions.dispatch('account-search', {
      query: query.trim(),
      opsStatus: opsStatusFilter || null,
      platformRole: platformRoleFilter || null,
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleSelectAccount = (accountId) => {
    actions.dispatch('account-detail-load', { accountId });
  };

  const handleCloseDetail = () => {
    actions.dispatch('account-detail-close');
  };

  const handleDebugBundle = () => {
    if (detail?.account?.id) {
      saveIncidentStash({
        returnSection: 'accounts',
        returnAccountId: detail.account.id,
        returnScrollY: typeof window !== 'undefined' ? window.scrollY : 0,
      });
      const link = debugBundleLinkForAccount(detail.account.id);
      if (typeof window !== 'undefined') {
        window.location.hash = link.replace(/^\/admin/, '');
      }
    }
  };

  const [copySummaryFeedback, setCopySummaryFeedback] = React.useState('');
  const handleCopySupportSummary = async () => {
    if (!detail?.account) return;
    const summaryData = {
      account: detail.account.email || detail.account.id,
      role: detail.account.platformRole,
      learnerCount: detail.learners?.length || 0,
      recentErrorCount: detail.recentErrors?.length || 0,
      recentDenialCount: detail.recentDenials?.length || 0,
      opsStatus: detail.opsMetadata?.opsStatus || 'active',
    };
    const prepared = prepareSafeCopy(summaryData, COPY_AUDIENCE.PARENT_SAFE);
    if (!prepared.ok) {
      setCopySummaryFeedback('Nothing to copy');
      setTimeout(() => setCopySummaryFeedback(''), 2000);
      return;
    }
    const result = await copyToClipboard(prepared.text);
    setCopySummaryFeedback(result.ok ? 'Summary copied' : 'Copy failed');
    setTimeout(() => setCopySummaryFeedback(''), 2000);
  };

  if (detail) {
    return (
      <AccountDetailPanel
        detail={detail}
        onClose={handleCloseDetail}
        onDebugBundle={handleDebugBundle}
        onCopySupportSummary={handleCopySupportSummary}
        copySummaryFeedback={copySummaryFeedback}
      />
    );
  }

  return (
    <section className="card admin-card-spaced" data-testid="account-search-panel">
      <div className="eyebrow">Account search</div>
      <h3 className="section-title admin-section-title">Find accounts</h3>
      <p className="subtitle">Search by email, account ID, or display name. Minimum 3 characters.</p>
      <div className="admin-account-search-bar">
        <input
          className="input admin-account-search-input"
          type="text"
          placeholder="Email, ID, or name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          data-testid="account-search-input"
        />
        <select
          className="select admin-account-search-select"
          value={opsStatusFilter}
          onChange={(e) => setOpsStatusFilter(e.target.value)}
          data-testid="account-search-ops-status"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="payment_hold">Payment hold</option>
        </select>
        <select
          className="select admin-account-search-select"
          value={platformRoleFilter}
          onChange={(e) => setPlatformRoleFilter(e.target.value)}
          data-testid="account-search-platform-role"
        >
          <option value="">Any role</option>
          <option value="admin">Admin</option>
          <option value="ops">Ops</option>
          <option value="parent">Parent</option>
        </select>
        <button
          className="btn secondary"
          type="button"
          onClick={handleSearch}
          disabled={status === 'loading'}
          data-testid="account-search-submit"
        >
          {status === 'loading' ? 'Searching...' : 'Search'}
        </button>
      </div>
      {search.error && <div className="feedback warn admin-account-search-feedback">{search.error}</div>}
      {search.truncated && <div className="feedback warn admin-account-search-feedback">Results truncated to 50. Refine your search for more specific results.</div>}
      {status === 'loaded' && results.length === 0 && <p className="small muted">No accounts matched your search.</p>}
      {results.map((result) => (
        <AccountSearchResultRow key={result.id} result={result} onSelect={handleSelectAccount} />
      ))}
    </section>
  );
}

export function AdminAccountsSection({ model, accountDirectory, actions }) {
  return (
    <>
      <AccountSearchPanel model={model} actions={actions} />
      <AdminAccountRoles model={model} directory={accountDirectory} actions={actions} />
      <AccountOpsMetadataPanel model={model} actions={actions} />
      <AuditLogLookup model={model} />
    </>
  );
}
