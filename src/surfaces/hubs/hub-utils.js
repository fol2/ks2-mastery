import { readOnlyLearnerActionBlockReason } from '../../platform/hubs/shell-access.js';
// SH2-U5: the AccessDeniedCard is Admin + Parent Hub's load-failure
// fallback (cited by the plan as one of the two ErrorCard consumers).
// We re-skin the inner feedback block on top of the shared primitive so
// a future `data-error-code` debug hook is already wired in. The outer
// `.card` chrome + "Back to dashboard" action row stay bespoke because
// this fallback specifically navigates back to the dashboard rather
// than offering a retry — different semantic than ErrorCard's onRetry.
import { ErrorCard } from '../../platform/ui/ErrorCard.jsx';

export function formatTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '—';
  try {
    return new Date(numeric).toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function selectedWritableLearner(appState) {
  const selectedId = appState?.learners?.selectedId;
  return selectedId ? appState.learners.byId[selectedId] || null : null;
}

export function isBlocked(action, accessContext) {
  return Boolean(readOnlyLearnerActionBlockReason(action, accessContext?.activeAdultLearnerContext || null));
}

export function AccessDeniedCard({ title, detail, onBack, code = '' }) {
  return (
    <section className="card access-denied-card">
      <ErrorCard title={title} body={detail} code={code} />
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn secondary" type="button" onClick={onBack}>Back to dashboard</button>
      </div>
    </section>
  );
}
