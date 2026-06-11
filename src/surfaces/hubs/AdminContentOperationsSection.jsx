import React from 'react';
import { AdminPanelFrame } from './AdminPanelFrame.jsx';
import { formatTimestamp } from './hub-utils.js';
import {
  CONTENT_OPERATION_DETAIL_TABS,
  CONTENT_OPERATION_LANES,
  normaliseContentOperationCandidate,
  normaliseContentOperationPackage,
  normaliseContentOperationsOverview,
  normaliseContentOperationsPackageDetail,
  normaliseContentOperationsPackageList,
  normaliseContentOperationsReleaseList,
} from '../../platform/hubs/admin-content-operations.js';

const CENTRE_TABS = Object.freeze([
  { key: 'overview', label: 'Overview' },
  { key: 'packages', label: 'Packages' },
  { key: 'spelling', label: 'Spelling' },
  { key: 'audio', label: 'Audio' },
  { key: 'poolsRewards', label: 'Pools & Rewards' },
  { key: 'monstersAssets', label: 'Monsters & Assets' },
  { key: 'heroCodex', label: 'Hero / Codex' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'releases', label: 'Release history' },
]);

const DETAIL_TAB_BLOCKER_SECTIONS = Object.freeze({
  spelling: 'validation',
  audio: 'audio',
  poolsRewards: 'rewards',
  monstersAssets: 'assets',
  heroCodex: 'exposure',
});

const CONTENT_OPERATION_CAPABILITIES = Object.freeze({
  EDIT: 'content_operations.edit',
  APPROVE: 'content_operations.approve',
  PUBLISH: 'content_operations.publish',
});

function actorCan(actor, capability) {
  return Boolean(actor?.capabilities?.[capability]);
}

function contentOperationMutation(action, packageId) {
  const safeAction = String(action || 'mutation').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  const safePackageId = String(packageId || 'package').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  return {
    requestId: `content-ops-${safeAction}-${safePackageId}-${Date.now()}`,
  };
}

function actionMessage(action) {
  if (action === 'validate') return 'Candidate validated.';
  if (action === 'resolve-conflict') return 'Conflict resolved.';
  if (action === 'approve') return 'Candidate approved.';
  if (action === 'publish') return 'Package published.';
  return 'Package action completed.';
}

function collectLanePackages(overview) {
  const seen = new Set();
  const packages = [];
  for (const lane of CONTENT_OPERATION_LANES) {
    for (const entry of overview.lanes[lane.key] || []) {
      if (!entry.packageId || seen.has(entry.packageId)) continue;
      seen.add(entry.packageId);
      packages.push(entry);
    }
  }
  return packages;
}

function initialPackageId({ packageDetail, initialActiveTab, initialSelectedPackageId }) {
  if (initialSelectedPackageId) return initialSelectedPackageId;
  if (initialActiveTab !== 'detail') return '';
  const detail = normaliseContentOperationsPackageDetail(packageDetail);
  return detail.package?.packageId || '';
}

function errorEnvelope(error, fallbackCode = 'content_operations_fetch_failed') {
  if (!error) return null;
  return {
    code: error.code || fallbackCode,
    message: error.message || 'Content operations could not be loaded.',
    at: Date.now(),
  };
}

function operationCountLabel(contentPackage, variant = 'short') {
  const rawCount = contentPackage?.operationCount;
  const count = Number(rawCount);
  if (rawCount === null || rawCount === undefined || !Number.isFinite(count)) {
    if (variant === 'table') return 'Pending';
    if (variant === 'long') return 'Operation count pending';
    return 'Pending ops';
  }
  if (variant === 'table') return String(count);
  if (variant === 'long') return `${String(count)} ${count === 1 ? 'operation' : 'operations'}`;
  return `${String(count)} ops`;
}

function blockerSectionHasSignals(section) {
  return Boolean(section && (
    section.count > 0
      || section.warningCount > 0
      || section.blockers?.length
      || section.errors?.length
      || section.warnings?.length
  ));
}

function hasAudioOrAssetSignals(contentPackage) {
  return blockerSectionHasSignals(contentPackage.blockers?.audio)
    || blockerSectionHasSignals(contentPackage.blockers?.assets);
}

function latestCandidateForPackage(contentPackage, lifecycleState) {
  if (
    lifecycleState?.candidate
    && lifecycleState.packageId === contentPackage.packageId
  ) {
    return normaliseContentOperationCandidate(lifecycleState.candidate);
  }
  return contentPackage.latestCandidate || null;
}

function candidateHasApprovalBlockers(candidate) {
  if (!candidate) return true;
  return candidate.blockers.blockingSections
    .filter((section) => section !== 'publishReadiness')
    .length > 0;
}

function formatCompactJson(value) {
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function conflictKey(conflict, index = 0) {
  return conflict?.conflictId
    || `${conflict?.entityType || 'entity'}:${conflict?.entityId || 'id'}:${conflict?.fieldPath || '$'}:${index}`;
}

function formatConflictValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseConflictEditValue(text, conflict) {
  const structured = [conflict?.packageValue, conflict?.currentValue, conflict?.baseValue]
    .some((value) => value && typeof value === 'object');
  if (!structured) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function eventDetailText(event) {
  const payload = event?.event && typeof event.event === 'object' && !Array.isArray(event.event)
    ? event.event
    : null;
  if (!payload) return '';
  const parts = [
    payload.candidateHash ? `candidate ${payload.candidateHash}` : '',
    payload.snapshotHash ? `snapshot ${payload.snapshotHash}` : '',
    payload.releaseId ? `release ${payload.releaseId}` : '',
    payload.notes ? `notes: ${payload.notes}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' - ') : formatCompactJson(payload);
}

function PackageStateChip({ contentPackage }) {
  return (
    <span className={`chip ${contentPackage.chipClass}`} data-package-state={contentPackage.state}>
      {contentPackage.stateLabel}
    </span>
  );
}

function MetricTile({ label, value, detail }) {
  return (
    <div className="content-ops-metric">
      <span className="small muted">{label}</span>
      <strong>{value}</strong>
      {detail ? <span className="small muted">{detail}</span> : null}
    </div>
  );
}

function CentreTabNav({ activeTab, onSelect }) {
  return (
    <div className="content-ops-tabs" role="tablist" aria-label="Content operations views">
      {CENTRE_TABS.map((tab) => (
        <button
          key={tab.key}
          className="content-ops-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key ? 'true' : 'false'}
          data-active={activeTab === tab.key ? 'true' : undefined}
          onClick={() => onSelect(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function DetailTabNav({ activeTab, onSelect }) {
  return (
    <div className="content-ops-detail-tabs" role="tablist" aria-label="Package detail domains">
      {CONTENT_OPERATION_DETAIL_TABS.map((tab) => (
        <button
          key={tab.key}
          className="content-ops-detail-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key ? 'true' : 'false'}
          data-active={activeTab === tab.key ? 'true' : undefined}
          onClick={() => onSelect(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function PackageSummary({ contentPackage, onSelect }) {
  return (
    <button
      type="button"
      className="content-ops-package-summary"
      onClick={() => onSelect(contentPackage.packageId)}
      data-package-id={contentPackage.packageId}
    >
      <span className="content-ops-package-summary-main">
        <strong>{contentPackage.title}</strong>
        <span className="small muted">{contentPackage.packageId || 'package pending'}</span>
      </span>
      <span className="chip-row content-ops-package-summary-meta">
        <PackageStateChip contentPackage={contentPackage} />
        <span className="chip">{operationCountLabel(contentPackage)}</span>
      </span>
    </button>
  );
}

function OverviewLanes({ overview, onSelectPackage }) {
  const warningPackages = collectLanePackages(overview).filter(hasAudioOrAssetSignals);
  return (
    <div className="content-ops-lanes">
      {CONTENT_OPERATION_LANES.map((lane) => {
        const packages = overview.lanes[lane.key] || [];
        return (
          <article className="content-ops-lane" key={lane.key} data-lane={lane.key}>
            <div className="content-ops-lane-header">
              <span className={`chip ${lane.chipClass}`}>{lane.label}</span>
              <strong>{packages.length}</strong>
            </div>
            <div className="content-ops-lane-body">
              {packages.length ? packages.slice(0, 4).map((contentPackage) => (
                <PackageSummary
                  key={contentPackage.packageId}
                  contentPackage={contentPackage}
                  onSelect={onSelectPackage}
                />
              )) : (
                <span className="small muted">{lane.emptyLabel}</span>
              )}
            </div>
          </article>
        );
      })}
      <article className="content-ops-lane" data-lane="audioAssetWarnings">
        <div className="content-ops-lane-header">
          <span className="chip warn">Audio / asset warnings</span>
          <strong>{warningPackages.length}</strong>
        </div>
        <div className="content-ops-lane-body">
          {warningPackages.length ? warningPackages.slice(0, 4).map((contentPackage) => (
            <PackageSummary
              key={contentPackage.packageId}
              contentPackage={contentPackage}
              onSelect={onSelectPackage}
            />
          )) : (
            <span className="small muted">No missing audio or asset warnings</span>
          )}
        </div>
      </article>
      <article className="content-ops-lane" data-lane="recentReleases">
        <div className="content-ops-lane-header">
          <span className="chip good">Recent releases</span>
          <strong>{overview.recentReleases.length}</strong>
        </div>
        <div className="content-ops-lane-body">
          {overview.recentReleases.length ? overview.recentReleases.slice(0, 4).map((release) => (
            <div className="content-ops-release-summary" key={release.releaseId}>
              <strong>{release.releaseId}</strong>
              <span className="small muted">{formatTimestamp(release.publishedAt || release.createdAt)}</span>
            </div>
          )) : (
            <span className="small muted">No recent releases</span>
          )}
        </div>
      </article>
    </div>
  );
}

function BlockerSummary({ blockers, sectionKey }) {
  const section = blockers?.[sectionKey] || null;
  if (!section) return null;
  const hasBlockers = section.count > 0 || section.blockers?.length || section.errors?.length;
  const hasWarnings = section.warningCount > 0 || section.warnings?.length;
  if (!hasBlockers && !hasWarnings) {
    return <span className="chip good">{section.status || 'Ready'}</span>;
  }
  return (
    <div className="content-ops-blocker-summary">
      <div className="chip-row content-ops-chip-wrap">
        <span className={`chip ${hasBlockers ? 'bad' : 'warn'}`}>{section.status || 'Review'}</span>
        {hasBlockers ? <span className="chip bad">{String(section.count)} blockers</span> : null}
        {hasWarnings ? <span className="chip warn">{String(section.warningCount || section.warnings.length)} warnings</span> : null}
      </div>
      {section.blockers?.length ? (
        <ul className="content-ops-operation-list">
          {section.blockers.slice(0, 3).map((blocker) => <li key={blocker}>{blocker}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function PackageTable({ packages, selectedPackageId, onSelectPackage }) {
  if (!packages.length) {
    return (
      <div className="feedback admin-note-spaced" data-content-ops-empty-packages="true">
        No content operation packages yet.
      </div>
    );
  }
  return (
    <div className="content-ops-table-scroll">
      <table className="admin-overview-table content-ops-table" aria-label="Content operation packages">
        <thead>
          <tr className="admin-overview-thead-row">
            <th className="small admin-overview-th-first">Package</th>
            <th className="small admin-overview-th">State</th>
            <th className="small admin-overview-th-right">Operations</th>
            <th className="small admin-overview-th">Updated</th>
            <th className="small admin-overview-th">Readiness</th>
          </tr>
        </thead>
        <tbody>
          {packages.map((contentPackage) => (
            <tr
              key={contentPackage.packageId}
              className="admin-overview-tbody-row"
              data-selected={contentPackage.packageId === selectedPackageId ? 'true' : undefined}
              data-package-state={contentPackage.state}
            >
              <td className="admin-overview-td-first">
                <button
                  className="content-ops-row-button"
                  type="button"
                  onClick={() => onSelectPackage(contentPackage.packageId)}
                >
                  {contentPackage.title}
                </button>
                <div className="small muted">{contentPackage.packageId}</div>
              </td>
              <td className="admin-overview-td">
                <PackageStateChip contentPackage={contentPackage} />
              </td>
              <td className="admin-overview-td-right">{operationCountLabel(contentPackage, 'table')}</td>
              <td className="admin-overview-td small">{formatTimestamp(contentPackage.updatedAt)}</td>
              <td className="admin-overview-td">
                {contentPackage.blockers.blockerCount ? (
                  <span className="chip bad">{String(contentPackage.blockers.blockerCount)} blocker sections</span>
                ) : (
                  <span className="chip good">No blocker sections</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PublishedAreaPanel({ activeTab, latestRelease, selectedPackageId, selectedSummary }) {
  const tab = CENTRE_TABS.find((entry) => entry.key === activeTab);
  const blockerSection = DETAIL_TAB_BLOCKER_SECTIONS[activeTab] || null;
  return (
    <div className="content-ops-area-panel" data-content-ops-area={activeTab}>
      <div className="content-ops-detail-header">
        <div>
          <div className="eyebrow">Published state</div>
          <h4 className="section-title admin-section-title">{tab?.label || 'Content area'}</h4>
          <p className="small muted admin-note-spaced">
            Latest release {latestRelease?.releaseId || 'bundled fallback'}
          </p>
        </div>
        <div className="chip-row content-ops-chip-wrap">
          <span className="chip">Browse mode</span>
          {selectedPackageId ? <span className="chip">Package {selectedPackageId}</span> : <span className="chip warn">No package selected</span>}
        </div>
      </div>
      {blockerSection && selectedSummary ? (
        <BlockerSummary blockers={selectedSummary.blockers} sectionKey={blockerSection} />
      ) : null}
      <div className="content-ops-domain-placeholder">
        <span className="chip">No mutation controls</span>
        <span className="small muted">Package selection is required before this area can create operations.</span>
      </div>
    </div>
  );
}

function ConflictResolverPanel({
  conflicts,
  disabled,
  active,
  onResolve,
}) {
  const [edits, setEdits] = React.useState({});
  if (!conflicts.length) return null;

  return (
    <div className="content-ops-conflict-resolver" data-content-ops-conflict-resolver="true">
      <div className="content-ops-conflict-header">
        <div>
          <div className="eyebrow">Conflict resolver</div>
          <strong>{String(conflicts.length)} unresolved field {conflicts.length === 1 ? 'conflict' : 'conflicts'}</strong>
        </div>
        <span className="chip bad">Publish blocked</span>
      </div>
      {conflicts.map((conflict, index) => {
        const key = conflictKey(conflict, index);
        const editValue = Object.prototype.hasOwnProperty.call(edits, key)
          ? edits[key]
          : formatConflictValue(conflict.packageValue);
        const resolve = (resolution, rawValue = undefined) => {
          if (!onResolve) return;
          onResolve(conflict, resolution, rawValue);
        };
        return (
          <article className="content-ops-conflict-card" key={key} data-conflict-id={key}>
            <div className="content-ops-conflict-meta">
              <span className="chip bad">{conflict.code || 'conflict'}</span>
              <strong>{conflict.entityType} / {conflict.entityId}</strong>
              <code>{conflict.fieldPath || '$'}</code>
            </div>
            <div className="content-ops-conflict-values">
              <div>
                <span className="small muted">Package value</span>
                <pre>{formatConflictValue(conflict.packageValue) || 'Empty'}</pre>
              </div>
              <div>
                <span className="small muted">Current release value</span>
                <pre>{formatConflictValue(conflict.currentValue) || 'Empty'}</pre>
              </div>
            </div>
            <label className="content-ops-notes-field">
              <span className="small muted">Merged value</span>
              <textarea
                value={editValue}
                onChange={(event) => setEdits((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))}
                rows={4}
                data-content-ops-conflict-edit={key}
              />
            </label>
            <div className="actions content-ops-lifecycle-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={disabled || active}
                onClick={() => resolve('package')}
              >
                Keep package value
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={disabled || active}
                onClick={() => resolve('current')}
              >
                Keep current value
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={disabled || active}
                onClick={() => resolve('edit', parseConflictEditValue(editValue, conflict))}
              >
                Save merged value
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function PackageLifecyclePanel({
  contentPackage,
  actor,
  lifecycleState,
  actionAvailability = {},
  onRunAction,
}) {
  const [notes, setNotes] = React.useState('');
  const candidate = latestCandidateForPackage(contentPackage, lifecycleState);
  const canEdit = actorCan(actor, CONTENT_OPERATION_CAPABILITIES.EDIT);
  const canApprove = actorCan(actor, CONTENT_OPERATION_CAPABILITIES.APPROVE);
  const canPublish = actorCan(actor, CONTENT_OPERATION_CAPABILITIES.PUBLISH);
  const conflicts = candidate?.conflicts || [];
  const isRunning = Boolean(
    lifecycleState?.running
      && lifecycleState.packageId === contentPackage.packageId
  );
  const activeAction = isRunning ? lifecycleState.action : '';
  const actionError = lifecycleState?.packageId === contentPackage.packageId
    ? lifecycleState.error
    : null;
  const actionMessageText = lifecycleState?.packageId === contentPackage.packageId
    ? lifecycleState.message
    : '';
  const approvalBlocked = candidateHasApprovalBlockers(candidate);
  const validateDisabled = !actionAvailability.validate || !canEdit || isRunning || contentPackage.state === 'published';
  const approveDisabled = !canApprove
    || !actionAvailability.approve
    || isRunning
    || !candidate?.candidateId
    || approvalBlocked
    || contentPackage.state === 'published';
  const publishDisabled = !canPublish
    || !actionAvailability.publish
    || isRunning
    || contentPackage.state !== 'approved';
  const resolveDisabled = !canEdit
    || !actionAvailability.resolveConflict
    || isRunning
    || contentPackage.state === 'published';

  const run = (action) => {
    if (!onRunAction) return;
    onRunAction(action, {
      packageId: contentPackage.packageId,
      candidateId: candidate?.candidateId || '',
      candidateHash: candidate?.candidateHash || '',
      notes,
    });
  };
  const resolveConflict = (conflict, resolution, value) => {
    if (!onRunAction) return;
    onRunAction('resolve-conflict', {
      packageId: contentPackage.packageId,
      conflictId: conflict?.conflictId || '',
      conflict,
      resolution,
      value,
    });
  };

  return (
    <section className="content-ops-lifecycle" aria-label="Package lifecycle">
      <div className="content-ops-lifecycle-header">
        <div>
          <div className="eyebrow">Lifecycle</div>
          <h5>Validate, approve, publish</h5>
        </div>
        <div className="chip-row content-ops-chip-wrap">
          <span className="chip">Edit {canEdit ? 'allowed' : 'locked'}</span>
          <span className="chip">Approve {canApprove ? 'allowed' : 'locked'}</span>
          <span className="chip">Publish {canPublish ? 'allowed' : 'locked'}</span>
        </div>
      </div>
      <div className="content-ops-candidate-grid">
        <MetricTile
          label="Candidate"
          value={candidate?.candidateId || 'Not built'}
          detail={candidate?.createdAt ? formatTimestamp(candidate.createdAt) : 'Run validation first'}
        />
        <MetricTile
          label="Candidate hash"
          value={candidate?.candidateHash || 'Pending'}
          detail={candidate?.operationsHash ? `Operations ${candidate.operationsHash}` : 'Operations hash pending'}
        />
        <MetricTile
          label="Release base"
          value={candidate?.baseReleaseId || contentPackage.baseReleaseId || 'First release'}
          detail={`Current ${candidate?.currentReleaseId || 'bundled fallback'}`}
        />
        <MetricTile
          label="Validation"
          value={candidate?.validation?.status || contentPackage.blockers.validation.status}
          detail={`${String(candidate?.validation?.errorCount || 0)} errors, ${String(candidate?.validation?.warningCount || 0)} warnings`}
        />
      </div>
      <ConflictResolverPanel
        conflicts={conflicts}
        disabled={resolveDisabled}
        active={activeAction === 'resolve-conflict'}
        onResolve={resolveConflict}
      />
      <div className="content-ops-lifecycle-controls">
        <label className="content-ops-notes-field">
          <span className="small muted">Approval notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            data-content-ops-approval-notes="true"
          />
        </label>
        <div className="actions content-ops-lifecycle-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={validateDisabled}
            aria-busy={activeAction === 'validate' ? 'true' : undefined}
            data-content-ops-action="validate"
            onClick={() => run('validate')}
          >
            Validate candidate
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={approveDisabled}
            aria-busy={activeAction === 'approve' ? 'true' : undefined}
            data-content-ops-action="approve"
            onClick={() => run('approve')}
          >
            Approve candidate
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={publishDisabled}
            aria-busy={activeAction === 'publish' ? 'true' : undefined}
            data-content-ops-action="publish"
            onClick={() => run('publish')}
          >
            Publish package
          </button>
        </div>
      </div>
      {approvalBlocked && candidate ? (
        <BlockerSummary blockers={candidate.blockers} sectionKey="validation" />
      ) : null}
      {actionError ? (
        <div className="feedback warn admin-note-spaced" data-content-ops-action-error="true">
          <strong>{actionError.code}</strong>
          <div>{actionError.message}</div>
        </div>
      ) : actionMessageText ? (
        <div className="feedback good admin-note-spaced" data-content-ops-action-message="true">
          {actionMessageText}
        </div>
      ) : null}
    </section>
  );
}

function PackageDetailBody({ contentPackage, activeTab, events }) {
  if (activeTab === 'spelling') {
    return (
      <div>
        <h5>Spelling operations</h5>
        {contentPackage.operations.length ? (
          <ul className="content-ops-operation-list">
            {contentPackage.operations.map((operation) => (
              <li key={operation.operationId}>
                <strong>{operation.action}</strong>
                {' '}
                {operation.entityType}
                {' '}
                <code>{operation.entityId}</code>
                {operation.fieldPath ? <span className="small muted"> - {operation.fieldPath}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <span className="small muted">No spelling operations recorded.</span>
        )}
      </div>
    );
  }

  if (activeTab === 'approvals') {
    return (
      <div className="chip-row content-ops-chip-wrap">
        <span className="chip">Approved {formatTimestamp(contentPackage.approvedAt)}</span>
        <span className="chip">Published {formatTimestamp(contentPackage.publishedAt)}</span>
      </div>
    );
  }

  if (activeTab === 'audit') {
    return (
      <div>
        {events.length ? (
          <ul className="content-ops-operation-list">
            {events.map((event) => (
              <li key={event.eventId}>
                <strong>{event.eventType}</strong>
                <span className="small muted"> - {formatTimestamp(event.createdAt)}</span>
                {event.actorAccountId ? <span className="small muted"> - {event.actorAccountId}</span> : null}
                {eventDetailText(event) ? (
                  <div className="small muted content-ops-event-detail">{eventDetailText(event)}</div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <span className="small muted">No audit events recorded.</span>
        )}
      </div>
    );
  }

  const tab = CONTENT_OPERATION_DETAIL_TABS.find((entry) => entry.key === activeTab);
  const blockerSection = DETAIL_TAB_BLOCKER_SECTIONS[activeTab];
  return (
    <div className="content-ops-domain-placeholder">
      <span className="chip">Package-scoped</span>
      {tab ? <strong>{tab.label}</strong> : null}
      {blockerSection ? (
        <BlockerSummary blockers={contentPackage.blockers} sectionKey={blockerSection} />
      ) : null}
    </div>
  );
}

function PackageDetail({
  detail,
  selectedPackageId,
  loadingDetailId,
  detailErrorId,
  activeTab,
  onSelectTab,
  actor,
  lifecycleState,
  lifecycleActionAvailability,
  onRunLifecycleAction,
}) {
  const contentPackage = detail?.package || null;
  if (!selectedPackageId) {
    return (
      <div className="feedback admin-note-spaced" data-content-ops-no-package="true">
        No package selected.
      </div>
    );
  }
  if (detailErrorId === selectedPackageId) {
    return (
      <div className="feedback warn admin-note-spaced" data-content-ops-detail-error="true">
        Package detail could not be loaded.
      </div>
    );
  }
  if (!contentPackage || loadingDetailId === selectedPackageId) {
    return (
      <div className="feedback warn admin-note-spaced" data-content-ops-detail-loading="true">
        Package detail is loading.
      </div>
    );
  }

  const events = Array.isArray(detail.events) ? detail.events : [];
  return (
    <div className="content-ops-detail" data-package-detail={contentPackage.packageId}>
      <div className="content-ops-detail-header">
        <div>
          <div className="eyebrow">Package detail</div>
          <h4 className="section-title admin-section-title">{contentPackage.title}</h4>
          <p className="small muted admin-note-spaced">
            {contentPackage.packageId} - base {contentPackage.baseReleaseId || 'first release'}
          </p>
        </div>
        <div className="chip-row content-ops-chip-wrap">
          <PackageStateChip contentPackage={contentPackage} />
          <span className="chip">{operationCountLabel(contentPackage, 'long')}</span>
          {contentPackage.blockers.warningCount ? (
            <span className="chip warn">{String(contentPackage.blockers.warningCount)} warning sections</span>
          ) : null}
        </div>
      </div>
      <PackageLifecyclePanel
        contentPackage={contentPackage}
        actor={actor}
        lifecycleState={lifecycleState}
        actionAvailability={lifecycleActionAvailability}
        onRunAction={onRunLifecycleAction}
      />
      <DetailTabNav activeTab={activeTab} onSelect={onSelectTab} />
      <div className="content-ops-detail-body" role="tabpanel">
        <PackageDetailBody
          contentPackage={contentPackage}
          activeTab={activeTab}
          events={events}
        />
      </div>
    </div>
  );
}

function ReleaseTable({ releases }) {
  if (!releases.length) {
    return (
      <div className="feedback admin-note-spaced" data-content-ops-empty-releases="true">
        No global content operation releases yet.
      </div>
    );
  }
  return (
    <div className="content-ops-table-scroll">
      <table className="admin-overview-table content-ops-table" aria-label="Content operation releases">
        <thead>
          <tr className="admin-overview-thead-row">
            <th className="small admin-overview-th-first">Release</th>
            <th className="small admin-overview-th">Status</th>
            <th className="small admin-overview-th">Package</th>
            <th className="small admin-overview-th">Published</th>
            <th className="small admin-overview-th">Proof</th>
          </tr>
        </thead>
        <tbody>
          {releases.map((release) => (
            <tr key={release.releaseId} className="admin-overview-tbody-row">
              <td className="admin-overview-td-first">
                {release.releaseId}
                <div className="small muted">{release.snapshotHash || 'hash pending'}</div>
              </td>
              <td className="admin-overview-td">
                <span className={`chip ${release.status === 'published' ? 'good' : ''}`}>
                  {release.status}
                </span>
              </td>
              <td className="admin-overview-td small">{release.packageId || 'seeded'}</td>
              <td className="admin-overview-td small">{formatTimestamp(release.publishedAt || release.createdAt)}</td>
              <td className="admin-overview-td">
                {release.proof ? <span className="chip good">Recorded</span> : <span className="chip warn">Missing</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminContentOperationsSection({
  model,
  actions,
  initialOverview = null,
  initialPackages = null,
  initialReleases = null,
  initialPackageDetail = null,
  initialSelectedPackageId = '',
  initialActiveTab = 'overview',
  initialDetailTab = 'spelling',
}) {
  const seedOverview = initialOverview || model?.contentOperations?.overview || null;
  const seedPackages = initialPackages || model?.contentOperations?.packages || null;
  const seedReleases = initialReleases || model?.contentOperations?.releases || null;
  const seedPackageDetail = initialPackageDetail || model?.contentOperations?.packageDetail || null;
  const hasSeedData = Boolean(seedOverview || seedPackages || seedReleases || seedPackageDetail);
  const [overviewPayload, setOverviewPayload] = React.useState(seedOverview);
  const [packageListPayload, setPackageListPayload] = React.useState(seedPackages);
  const [releaseListPayload, setReleaseListPayload] = React.useState(seedReleases);
  const [detailPayload, setDetailPayload] = React.useState(seedPackageDetail);
  const [selectedPackageId, setSelectedPackageId] = React.useState(initialPackageId({
    packageDetail: seedPackageDetail,
    initialActiveTab,
    initialSelectedPackageId,
  }));
  const [activeTab, setActiveTab] = React.useState(initialActiveTab);
  const [activeDetailTab, setActiveDetailTab] = React.useState(initialDetailTab);
  const [loading, setLoading] = React.useState(Boolean(actions?.contentOperationsApi?.readOverview && !hasSeedData));
  const [loadingDetailId, setLoadingDetailId] = React.useState('');
  const [detailErrorId, setDetailErrorId] = React.useState('');
  const [refreshError, setRefreshError] = React.useState(null);
  const [refreshedAt, setRefreshedAt] = React.useState(hasSeedData ? Date.now() : null);
  const [lifecycleState, setLifecycleState] = React.useState({
    packageId: '',
    action: '',
    running: false,
    message: '',
    error: null,
    candidate: null,
    approval: null,
    release: null,
  });
  const detailRequestRef = React.useRef({ id: '', seq: 0 });
  const refreshRequestRef = React.useRef(0);
  const api = actions?.contentOperationsApi || null;

  const overview = React.useMemo(
    () => normaliseContentOperationsOverview(overviewPayload),
    [overviewPayload],
  );
  const packages = React.useMemo(() => {
    const listed = normaliseContentOperationsPackageList(packageListPayload);
    return listed.length ? listed : collectLanePackages(overview);
  }, [overview, packageListPayload]);
  const releases = React.useMemo(() => {
    const listed = normaliseContentOperationsReleaseList(releaseListPayload);
    return listed.length ? listed : overview.recentReleases;
  }, [overview.recentReleases, releaseListPayload]);
  const detail = React.useMemo(
    () => normaliseContentOperationsPackageDetail(detailPayload),
    [detailPayload],
  );

  const loadPackageDetail = React.useCallback(async (packageId) => {
    if (!api?.readPackage || !packageId) return;
    const seq = detailRequestRef.current.seq + 1;
    detailRequestRef.current = { id: packageId, seq };
    setLoadingDetailId(packageId);
    setDetailErrorId('');
    try {
      const payload = await api.readPackage({ packageId });
      if (detailRequestRef.current.id !== packageId || detailRequestRef.current.seq !== seq) return;
      setDetailPayload(payload);
      setRefreshError((current) => (
        current?.code === 'content_operations_detail_fetch_failed' ? null : current
      ));
    } catch (error) {
      if (detailRequestRef.current.id !== packageId || detailRequestRef.current.seq !== seq) return;
      setDetailPayload(null);
      setDetailErrorId(packageId);
      setRefreshError(errorEnvelope(error, 'content_operations_detail_fetch_failed'));
    } finally {
      if (detailRequestRef.current.id === packageId && detailRequestRef.current.seq === seq) {
        setLoadingDetailId('');
      }
    }
  }, [api]);

  const selectPackage = React.useCallback((packageId) => {
    setSelectedPackageId(packageId);
    setActiveTab('detail');
    setDetailErrorId('');
    if (api?.readPackage) {
      setDetailPayload((current) => (
        normaliseContentOperationsPackageDetail(current).package?.packageId === packageId ? current : null
      ));
      loadPackageDetail(packageId);
    } else {
      setDetailPayload({ package: packages.find((entry) => entry.packageId === packageId) || null, events: [] });
    }
  }, [api, loadPackageDetail, packages]);

  const refresh = React.useCallback(async () => {
    if (!api?.readOverview) return;
    const seq = refreshRequestRef.current + 1;
    refreshRequestRef.current = seq;
    setLoading(true);
    setRefreshError(null);
    try {
      const [nextOverview, nextPackages, nextReleases] = await Promise.all([
        api.readOverview({ limit: 30 }),
        api.readPackages?.({ limit: 50 }),
        api.readReleases?.({ limit: 20 }),
      ]);
      if (refreshRequestRef.current !== seq) return;
      setOverviewPayload(nextOverview);
      setPackageListPayload(nextPackages);
      setReleaseListPayload(nextReleases);
      setRefreshedAt(Date.now());
      if (selectedPackageId && api.readPackage) {
        await loadPackageDetail(selectedPackageId);
      }
    } catch (error) {
      if (refreshRequestRef.current !== seq) return;
      setRefreshError(errorEnvelope(error));
    } finally {
      if (refreshRequestRef.current === seq) {
        setLoading(false);
      }
    }
  }, [api, loadPackageDetail, selectedPackageId]);

  React.useEffect(() => {
    if (!api?.readOverview) return;
    if (overviewPayload || packageListPayload || releaseListPayload) return;
    refresh();
  }, [api, overviewPayload, packageListPayload, refresh, releaseListPayload]);

  React.useEffect(() => {
    if (activeTab !== 'detail') return;
    if (!selectedPackageId || !api?.readPackage) return;
    if (loadingDetailId === selectedPackageId || detailErrorId === selectedPackageId) return;
    if (detail.package?.packageId === selectedPackageId) return;
    loadPackageDetail(selectedPackageId);
  }, [
    activeTab,
    api,
    detail.package?.packageId,
    detailErrorId,
    loadPackageDetail,
    loadingDetailId,
    selectedPackageId,
  ]);

  const runLifecycleAction = React.useCallback(async (action, {
    packageId,
    candidateId = '',
    candidateHash = '',
    conflictId = '',
    conflict = null,
    resolution = '',
    value = undefined,
    notes = '',
  } = {}) => {
    if (!api || !packageId) return;
    setLifecycleState((current) => ({
      ...current,
      packageId,
      action,
      running: true,
      message: '',
      error: null,
    }));
    try {
      let payload = null;
      if (action === 'validate') {
        if (!api.validatePackage) throw new Error('Validate action is not available.');
        payload = await api.validatePackage({
          packageId,
          includeSnapshot: false,
          mutation: contentOperationMutation(action, packageId),
        });
      } else if (action === 'resolve-conflict') {
        if (!api.resolveConflict) throw new Error('Resolve conflict action is not available.');
        payload = await api.resolveConflict({
          packageId,
          conflictId,
          conflict,
          resolution,
          value,
          includeSnapshot: false,
          mutation: contentOperationMutation(action, packageId),
        });
      } else if (action === 'approve') {
        if (!api.approvePackage) throw new Error('Approve action is not available.');
        payload = await api.approvePackage({
          packageId,
          candidateId,
          notes,
          mutation: contentOperationMutation(action, packageId),
        });
      } else if (action === 'publish') {
        if (!api.publishPackage) throw new Error('Publish action is not available.');
        payload = await api.publishPackage({
          packageId,
          proof: {
            source: 'content-operations-centre',
            packageId,
            candidateId: candidateId || null,
            candidateHash: candidateHash || null,
            approvalNotes: notes || null,
          },
          mutation: contentOperationMutation(action, packageId),
        });
      }
      const nextCandidate = payload?.candidate
        ? normaliseContentOperationCandidate(payload.candidate)
        : null;
      setLifecycleState((current) => ({
        ...current,
        packageId,
        action,
        running: false,
        message: actionMessage(action),
        error: null,
        candidate: nextCandidate || (current.packageId === packageId ? current.candidate : null),
        approval: payload?.approval || null,
        release: payload?.release || null,
      }));
      if (api.readPackage) {
        await loadPackageDetail(packageId);
      }
      if (action !== 'validate' && api.readOverview) {
        await refresh();
      }
    } catch (error) {
      setLifecycleState((current) => ({
        ...current,
        packageId,
        action,
        running: false,
        message: '',
        error: errorEnvelope(error, `content_operations_${action}_failed`),
      }));
    }
  }, [api, loadPackageDetail, refresh]);

  const latestRelease = overview.latestRelease;
  const primaryData = overview.openPackageCount || packages.length || releases.length || latestRelease ? {
    overview,
    packages,
    releases,
    latestRelease,
  } : null;
  const selectedSummary = packages.find((entry) => entry.packageId === selectedPackageId);
  const detailMatchesSelected = detail.package?.packageId === selectedPackageId;
  const safeDetail = detailMatchesSelected
    ? detail
    : (!api?.readPackage && selectedSummary
      ? { package: normaliseContentOperationPackage(selectedSummary), events: [] }
      : { package: null, events: [] });
  const warningSectionCount = packages.reduce((sum, entry) => sum + entry.blockers.warningCount, 0);
  const detailActor = safeDetail.actor?.accountId ? safeDetail.actor : overview.actor;
  const lifecycleActionAvailability = {
    validate: Boolean(api?.validatePackage),
    resolveConflict: Boolean(api?.resolveConflict),
    approve: Boolean(api?.approvePackage),
    publish: Boolean(api?.publishPackage),
  };

  return (
    <AdminPanelFrame
      eyebrow="Content Operations Centre"
      title="Spelling package workflow"
      subtitle="Global spelling release packages and readiness."
      refreshedAt={refreshedAt}
      refreshError={refreshError}
      onRefresh={api?.readOverview ? refresh : undefined}
      loading={loading}
      data={primaryData}
      emptyState={(
        <div className="feedback" data-content-ops-empty="true">
          No content operation package data.
        </div>
      )}
    >
      <div className="content-ops-metric-grid">
        <MetricTile
          label="Latest release"
          value={latestRelease?.releaseId || 'None'}
          detail={latestRelease ? formatTimestamp(latestRelease.publishedAt || latestRelease.createdAt) : 'Bundled fallback active'}
        />
        <MetricTile label="Open packages" value={String(overview.openPackageCount || packages.length)} detail="Drafts and review lanes" />
        <MetricTile label="Approved" value={String(overview.laneCounts.approvedPendingPublish || 0)} detail="Pending publish" />
        <MetricTile label="Warnings" value={String(warningSectionCount)} detail="Audio, assets, rewards, visibility" />
      </div>

      <CentreTabNav activeTab={activeTab} onSelect={setActiveTab} />

      {activeTab === 'overview' ? (
        <OverviewLanes overview={overview} onSelectPackage={selectPackage} />
      ) : null}

      {activeTab === 'packages' ? (
        <PackageTable
          packages={packages}
          selectedPackageId={selectedPackageId}
          onSelectPackage={selectPackage}
        />
      ) : null}

      {['spelling', 'audio', 'poolsRewards', 'monstersAssets', 'heroCodex', 'approvals'].includes(activeTab) ? (
        <PublishedAreaPanel
          activeTab={activeTab}
          latestRelease={latestRelease}
          selectedPackageId={selectedPackageId}
          selectedSummary={selectedSummary}
        />
      ) : null}

      {activeTab === 'detail' ? (
        <PackageDetail
          detail={safeDetail}
          selectedPackageId={selectedPackageId}
          loadingDetailId={loadingDetailId}
          detailErrorId={detailErrorId}
          activeTab={activeDetailTab}
          onSelectTab={setActiveDetailTab}
          actor={detailActor}
          lifecycleState={lifecycleState}
          lifecycleActionAvailability={lifecycleActionAvailability}
          onRunLifecycleAction={runLifecycleAction}
        />
      ) : null}

      {activeTab === 'releases' ? <ReleaseTable releases={releases} /> : null}
    </AdminPanelFrame>
  );
}
