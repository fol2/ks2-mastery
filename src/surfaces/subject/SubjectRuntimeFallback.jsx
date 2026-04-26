import React from 'react';
import { subjectTabLabel } from '../../platform/core/subject-runtime.js';
// SH2-U5: the subject runtime-error fallback re-skins on top of the
// shared ErrorCard primitive. The bespoke `.border-top` subject-accent
// wrapper is preserved so the subject's accent colour still reads at a
// glance; ErrorCard drives the copy / retry button / data-error-code.
// The `Failure point: …` diagnostic line stays outside the primitive
// because it's load-bearing context operators need during triage but
// the primitive's copy contract doesn't surface it.
import { ErrorCard } from '../../platform/ui/ErrorCard.jsx';

export function SubjectRuntimeFallback({ subject, runtimeEntry = null, activeTab = 'practice', onRetry }) {
  const methodName = runtimeEntry?.phase === 'action'
    ? runtimeEntry?.action || runtimeEntry?.methodName || 'last action'
    : runtimeEntry?.methodName || `render${subjectTabLabel(activeTab)}`;
  const title = `${subject?.name || 'Subject'} · ${subjectTabLabel(activeTab)} temporarily unavailable`;
  const body = runtimeEntry?.message
    || `${subject?.name || 'This subject'} hit an unexpected error. Your progress stays saved — try this tab again to recover.`;

  return (
    <section
      className="card border-top subject-runtime-fallback"
      style={{ borderTopColor: subject?.accent || '#3E6FA8' }}
    >
      <ErrorCard
        title={title}
        body={body}
        onRetry={onRetry}
        retryLabel="Try this tab again"
        code={runtimeEntry?.code || runtimeEntry?.methodName || methodName}
      />
      <div className="small muted" style={{ marginTop: 12 }}>
        Failure point: {methodName}
      </div>
    </section>
  );
}
