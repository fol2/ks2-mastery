import { readOnlyLearnerActionBlockReason } from '../../platform/hubs/shell-access.js';
// SH2-U5 / P2 U2: the AccessDeniedCard is Admin + Parent Hub's
// load-failure fallback (cited by the plan as one of the two ErrorCard
// consumers). The inner feedback block rides on the shared `ErrorCard`
// primitive so a future `data-error-code` debug hook is already wired
// in, and the outer `.card` chrome is now the shared `Card` primitive
// — preserving the bespoke `.access-denied-card` className for any
// scoped CSS hooks. The "Back to dashboard" action row stays bespoke
// because this fallback specifically navigates back to the dashboard
// rather than offering a retry — different semantic than ErrorCard's
// onRetry.
import { Card } from '../../platform/ui/Card.jsx';
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
  // SH2-U8: inline style prop migrated to `.access-denied-actions` class
  // (see docs/hardening/csp-inline-style-inventory.md).
  return (
    <Card as="section" className="access-denied-card">
      <ErrorCard title={title} body={detail} code={code} />
      <div className="actions access-denied-actions">
        <button className="btn secondary" type="button" onClick={onBack}>Back to dashboard</button>
      </div>
    </Card>
  );
}
