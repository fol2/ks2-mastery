import { readOnlyLearnerActionBlockReason } from '../../platform/hubs/shell-access.js';

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

export function AccessDeniedCard({ title, detail, onBack }) {
  return (
    <section className="card">
      <div className="feedback warn">
        <strong>{title}</strong>
        <div style={{ marginTop: 8 }}>{detail}</div>
      </div>
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn secondary" type="button" onClick={onBack}>Back to dashboard</button>
      </div>
    </section>
  );
}
