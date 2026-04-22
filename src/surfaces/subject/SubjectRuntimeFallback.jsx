import React from 'react';
import { subjectTabLabel } from '../../platform/core/subject-runtime.js';

export function SubjectRuntimeFallback({ subject, runtimeEntry = null, activeTab = 'practice', onRetry }) {
  const methodName = runtimeEntry?.phase === 'action'
    ? runtimeEntry?.action || runtimeEntry?.methodName || 'last action'
    : runtimeEntry?.methodName || `render${subjectTabLabel(activeTab)}`;

  return (
    <section className="card border-top" style={{ borderTopColor: subject?.accent || '#3E6FA8' }} role="alert" aria-live="polite">
      <div className="feedback bad">
        <strong>{subject?.name || 'Subject'} · {subjectTabLabel(activeTab)} temporarily unavailable</strong>
        <div style={{ marginTop: 8 }}>
          {runtimeEntry?.message || `${subject?.name || 'This subject'} hit an unexpected error.`}
        </div>
        <div className="small muted" style={{ marginTop: 8 }}>
          Failure point: {methodName}
        </div>
      </div>
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn secondary" type="button" onClick={onRetry}>Try this tab again</button>
      </div>
    </section>
  );
}
