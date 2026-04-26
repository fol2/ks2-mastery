// SH2-U5: shared empty-state primitive. Three-part copy pattern:
//   1. what happened (neutral, past tense)
//   2. is progress safe (explicit reassurance)
//   3. what action is available (imperative CTA, or nothing)
//
// `role="status"` + `aria-live="polite"` so assistive tech announces the
// empty branch without interrupting the learner's current focus. The CTA
// is only rendered when `action` is supplied; callers that need a
// throttled click-handler can wrap `action.onClick` with `useSubmitLock`
// on their side — the primitive stays pure so it can be imported by any
// surface without dragging in submit-lock state.
//
// `dataAction` is an optional debugging / event-wiring hint that becomes
// the button's `data-action` attribute, mirroring the convention the
// subject renderers use elsewhere.

export function EmptyState({ title, body, action = null, className = '' }) {
  const hasAction = action && typeof action.onClick === 'function' && action.label;
  const classes = ['empty-state'];
  if (className) classes.push(className);
  return (
    <section
      className={classes.join(' ')}
      role="status"
      aria-live="polite"
      data-testid="empty-state"
    >
      <span className="empty-state-icon" aria-hidden="true">
        <svg
          width="22"
          height="22"
          viewBox="0 0 22 22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          <circle cx="11" cy="11" r="8.25" strokeDasharray="2 3" />
          <line x1="7.5" y1="11" x2="14.5" y2="11" />
        </svg>
      </span>
      <div className="empty-state-body">
        {title ? <h3 className="empty-state-title">{title}</h3> : null}
        {body ? <p className="empty-state-lede">{body}</p> : null}
      </div>
      {hasAction ? (
        <div className="actions empty-state-actions">
          <button
            className="btn secondary"
            type="button"
            onClick={action.onClick}
            {...(action.dataAction ? { 'data-action': action.dataAction } : {})}
          >
            {action.label}
          </button>
        </div>
      ) : null}
    </section>
  );
}
