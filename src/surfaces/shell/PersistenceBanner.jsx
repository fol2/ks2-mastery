
function persistenceTone(snapshot) {
  if (snapshot?.mode === 'remote-sync') return 'good';
  if (snapshot?.mode === 'degraded') return 'warn';
  return '';
}

function persistenceLabel(snapshot) {
  if (snapshot?.mode === 'remote-sync') {
    const syncing = Math.max(Number(snapshot?.inFlightWriteCount) || 0, Number(snapshot?.pendingWriteCount) || 0);
    return syncing > 0 ? `Remote sync · syncing ${syncing}` : 'Remote sync';
  }
  if (snapshot?.mode === 'degraded') return snapshot?.remoteAvailable ? 'Sync degraded' : 'Local storage degraded';
  return 'Local-only';
}

function persistenceTrustedLabel(snapshot) {
  if (snapshot?.trustedState === 'remote') return 'Trusted: remote';
  if (snapshot?.trustedState === 'local-cache') return 'Trusted: local cache';
  if (snapshot?.trustedState === 'memory') return 'Trusted: memory only';
  return 'Trusted: this browser';
}

function persistenceSummary(snapshot) {
  if (snapshot?.mode === 'remote-sync') {
    const syncing = Math.max(Number(snapshot?.inFlightWriteCount) || 0, Number(snapshot?.pendingWriteCount) || 0);
    if (syncing > 0) {
      return 'Remote sync is available. Changes are usable immediately and are being pushed to the server now.';
    }
    return 'Remote sync is available. The remote repository is the trusted durable copy.';
  }

  if (snapshot?.mode === 'degraded') {
    if (snapshot?.remoteAvailable) {
      if (snapshot?.lastError?.code === 'stale_write') {
        return "Another tab or device changed this learner before this write reached the server. Retry sync will reload the latest remote state and reapply this browser's pending changes.";
      }
      if (snapshot?.lastError?.code === 'idempotency_reuse') {
        return 'A retry reused an old mutation request id for different data. Retry sync will reload the latest remote state before any new write is accepted.';
      }
      if (snapshot?.cacheState === 'ahead-of-remote') {
        const count = Number(snapshot?.pendingWriteCount) || 0;
        return `Remote sync failed. This browser is continuing from its local cache. ${count} cached change${count === 1 ? '' : 's'} still need remote sync, so the server may be behind.`;
      }
      return 'Remote sync is unavailable right now. The platform is continuing from the last local cache for this browser.';
    }
    return 'Browser storage failed. Current changes only live in memory in this browser until persistence recovers.';
  }

  return 'This build is running local-only. This browser storage is the only trusted durable copy until a real backend is wired in.';
}

function persistenceDebug(snapshot) {
  const error = snapshot?.lastError;
  if (!error) return 'No persistence error recorded.';

  const payload = error.details?.payload || {};
  const fields = [
    error.message,
    error.code ? `Code: ${error.code}` : null,
    error.phase ? `Phase: ${error.phase}` : null,
    error.scope ? `Scope: ${error.scope}` : null,
    error.resolution ? `Resolution: ${error.resolution}` : null,
    error.details?.status ? `HTTP: ${error.details.status}` : null,
    error.details?.method && error.details?.url ? `Request: ${error.details.method} ${error.details.url}` : null,
    payload.kind ? `Mutation: ${payload.kind}` : null,
    payload.scopeType && payload.scopeId ? `Mutation scope: ${payload.scopeType}:${payload.scopeId}` : null,
    payload.requestId ? `Request id: ${payload.requestId}` : null,
    payload.correlationId || error.correlationId ? `Correlation id: ${payload.correlationId || error.correlationId}` : null,
    Number.isFinite(Number(payload.expectedRevision)) ? `Expected revision: ${payload.expectedRevision}` : null,
    Number.isFinite(Number(payload.currentRevision)) ? `Current revision: ${payload.currentRevision}` : null,
    `Pending writes: ${Number(snapshot?.pendingWriteCount) || 0}`,
    `In-flight writes: ${Number(snapshot?.inFlightWriteCount) || 0}`,
  ].filter(Boolean);

  return fields.join('\n');
}

export function PersistenceBanner({ snapshot, onRetry }) {
  if (snapshot?.mode !== 'degraded') return null;
  const pendingCount = Number(snapshot?.pendingWriteCount) || 0;
  // U9 (sys-hardening p1): `data-testid="persistence-banner"` is the
  // stable anchor Playwright chaos scenes use to assert the degraded-
  // mode UI contract. Kept narrow per the data-testid policy in
  // docs/superpowers/specs/2026-04-22-react-port-flicker-elimination-
  // design.md ("Minimal and targeted. Introduced only where state
  // assertion cannot express intent cleanly."). Three testids total:
  // root banner + label + pending-count chip are the only selectors
  // chaos scenes need; everything else is read by role/text.
  // SH2-U8: inline style props migrated to `.persistence-banner-*` classes in
  // styles/app.css. Values are identical to the previous inline values so
  // SH2-U6 visual baselines stay green. See docs/hardening/csp-inline-style-inventory.md.
  return (
    <section className="card persistence-banner-card" data-testid="persistence-banner" data-persistence-mode={snapshot?.mode || 'unknown'}>
      <div className="feedback warn" role="status" aria-live="polite">
        <strong data-testid="persistence-banner-label">{persistenceLabel(snapshot)}</strong>
        <div className="persistence-banner-summary">{persistenceSummary(snapshot)}</div>
      </div>
      <div className="chip-row persistence-banner-chips">
        <span className={`chip ${persistenceTone(snapshot)}`}>{persistenceTrustedLabel(snapshot)}</span>
        <span className="chip">Cache: {snapshot?.cacheState || 'unknown'}</span>
        <span className="chip" data-testid="persistence-banner-pending">Pending: {pendingCount}</span>
      </div>
      {snapshot?.remoteAvailable && (
        <div className="actions persistence-banner-actions">
          <button className="btn secondary" type="button" onClick={onRetry}>Retry sync</button>
        </div>
      )}
      <details className="persistence-banner-details">
        <summary>Persistence details</summary>
        <div className="code-block persistence-banner-debug">{persistenceDebug(snapshot)}</div>
      </details>
    </section>
  );
}
