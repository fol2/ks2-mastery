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
          <div className="small muted" style={{ marginTop: 6 }} data-testid="ops-status-enforcement-note">{ACCOUNT_OPS_ENFORCEMENT_NOTE}</div>
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
          className="callout warn small"
          role="alert"
          data-testid="account-ops-metadata-conflict-banner"
          data-account-id={accountId}
          style={{ gridColumn: '1 / -1', marginBottom: 8 }}
        >
          <div><strong>This account changed in another tab.</strong> Choose how to resolve the conflict.</div>
          {conflictDiffRows.length > 0 ? (
            <ul style={{ margin: '6px 0 8px 16px' }}>
              {conflictDiffRows.map((row) => (
                <li key={row.field} data-field={row.field}>
                  <strong>{row.label}:</strong>{' '}
                  <span>yours = {formatConflictValue(row.draftValue)}</span>{' · '}
                  <span>theirs = {formatConflictValue(row.serverValue)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="small muted" style={{ margin: '6px 0 8px' }}>
              No field-level differences surfaced. Pick a resolution to continue.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
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
        <div className="small muted" style={{ marginTop: 6 }} data-testid="ops-status-enforcement-note">{ACCOUNT_OPS_ENFORCEMENT_NOTE}</div>
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
        <button
          className="btn secondary"
          type="button"
          disabled={isSaving || submitLock.locked}
          onClick={handleSave}
        >
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
  const canManage = model?.permissions?.platformRole === 'admin';
  const savingAccountId = directory.savingAccountId || '';
  return (
    <section className="card" style={{ marginBottom: 20 }}>
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
    <article className="card" style={{ marginBottom: 20 }}>
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
  );
}

export function AdminAccountsSection({ model, accountDirectory, actions }) {
  return (
    <>
      <AdminAccountRoles model={model} directory={accountDirectory} actions={actions} />
      <AccountOpsMetadataPanel model={model} actions={actions} />
      <AuditLogLookup model={model} />
    </>
  );
}
