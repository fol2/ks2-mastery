import { subjectTabLabel } from '../../platform/core/subject-runtime.js';
// SH2-U5 / P2 U2: the subject runtime-error fallback wraps the shared
// `ErrorCard` inside the shared `Card` primitive (tone="error"). The
// bespoke `.border-top` subject-accent ribbon is preserved via `Card`'s
// className passthrough so the subject's accent colour still reads at
// a glance; `ErrorCard` drives the copy / retry button /
// data-error-code. The `Failure point: …` diagnostic line stays inside
// the Card because it's load-bearing context operators need during
// triage but the primitive's copy contract doesn't surface it.
import { Card } from '../../platform/ui/Card.jsx';
import { ErrorCard } from '../../platform/ui/ErrorCard.jsx';

export function SubjectRuntimeFallback({ subject, runtimeEntry = null, activeTab = 'practice', onRetry }) {
  const methodName = runtimeEntry?.phase === 'action'
    ? runtimeEntry?.action || runtimeEntry?.methodName || 'last action'
    : runtimeEntry?.methodName || `render${subjectTabLabel(activeTab)}`;
  const title = `${subject?.name || 'Subject'} · ${subjectTabLabel(activeTab)} temporarily unavailable`;
  const body = runtimeEntry?.message
    || `${subject?.name || 'This subject'} hit an unexpected error. Your progress stays saved — try this tab again to recover.`;

  return (
    <Card
      as="section"
      tone="error"
      className="border-top subject-runtime-fallback"
      // SH2-U8: static inline style prop migrated to
      // `.subject-runtime-fallback-footer`. The bespoke
      // `borderTopColor: subject.accent` style stays inline: the accent
      // flows from the client-side subject registry, classifies as
      // `dynamic-content-driven` in the CSP inline-style inventory, and
      // is defer-candidate for future CSS-variable work. No server data
      // enters this style bag.
      style={{ borderTopColor: subject?.accent || '#3E6FA8' }}
    >
      <ErrorCard
        title={title}
        body={body}
        onRetry={onRetry}
        retryLabel="Try this tab again"
        code={runtimeEntry?.code || runtimeEntry?.methodName || methodName}
      />
      <div className="small muted subject-runtime-fallback-footer">
        Failure point: {methodName}
      </div>
    </Card>
  );
}
