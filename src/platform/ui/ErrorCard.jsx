// SH2-U5: shared error-card primitive. Never renders `code` in visible
// copy — that is SH2-U12's oracle. `code` is surfaced ONLY as a
// `data-error-code` attribute for debugging + future telemetry, which
// keeps the visible copy readable to non-technical learners while still
// giving operators a stable selector to inspect.
//
// `onRetry` is optional: when the caller omits the handler, the action
// row is not rendered (an error banner with a dead button is worse than
// no button). `role="alert"` + `aria-live="polite"` so the card is
// announced politely rather than interrupting — mid-session surfaces
// rely on polite announcement so an error toast never speaks over a
// learner typing an answer.

export function ErrorCard({ title, body, onRetry = null, retryLabel = 'Try again', code = '', className = '' }) {
  const hasRetry = typeof onRetry === 'function';
  const classes = ['error-card'];
  if (className) classes.push(className);
  const extraAttrs = {};
  if (code) extraAttrs['data-error-code'] = String(code);
  return (
    <section
      className={classes.join(' ')}
      role="alert"
      aria-live="polite"
      data-testid="error-card"
      {...extraAttrs}
    >
      <span className="error-card-icon" aria-hidden="true">
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
          <path d="M11 2.75 20.25 18.5H1.75L11 2.75Z" />
          <line x1="11" y1="9" x2="11" y2="13" />
          <circle cx="11" cy="16" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <div className="error-card-body">
        {title ? <h3 className="error-card-title">{title}</h3> : null}
        {body ? <p className="error-card-lede">{body}</p> : null}
      </div>
      {hasRetry ? (
        <div className="actions error-card-actions">
          <button className="btn secondary" type="button" onClick={onRetry}>
            {retryLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
}
