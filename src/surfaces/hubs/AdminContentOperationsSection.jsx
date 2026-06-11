import React from 'react';
import { AdminPanelFrame } from './AdminPanelFrame.jsx';
import { formatTimestamp } from './hub-utils.js';
import {
  CONTENT_OPERATION_DETAIL_TABS,
  CONTENT_OPERATION_LANES,
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
        />
      ) : null}

      {activeTab === 'releases' ? <ReleaseTable releases={releases} /> : null}
    </AdminPanelFrame>
  );
}
