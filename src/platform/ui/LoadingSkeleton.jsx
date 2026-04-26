// SH2-U5: shared loading-skeleton primitive. CSS-only shimmer built from
// a moving background-position gradient (compositor-cheap, no layout).
// The `@media (prefers-reduced-motion: reduce)` carve-out in
// `styles/ui-states.css` cancels the animation and flattens the rows to
// a solid neutral `var(--line-soft)` so learners who asked for motion to
// stop see a static placeholder instead of a 1.4s pulse.
//
// Rows default to 3 — matches the "a few lines of copy" rhythm of most
// list-backed panels. Callers that want denser / sparser skeletons pass
// a specific number. Non-integer / non-positive values fall back to 3.

const ROW_WIDTHS = ['78%', '92%', '58%', '84%', '70%', '46%'];

function clampRows(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 3;
  const rounded = Math.round(numeric);
  if (rounded < 1) return 3;
  if (rounded > 8) return 8;
  return rounded;
}

export function LoadingSkeleton({ rows = 3, className = '' }) {
  const count = clampRows(rows);
  const classes = ['loading-skeleton'];
  if (className) classes.push(className);
  return (
    <div
      className={classes.join(' ')}
      role="status"
      aria-live="polite"
      aria-label="Loading"
      data-testid="loading-skeleton"
    >
      <span className="loading-skeleton-sr">Loading…</span>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="loading-skeleton-row"
          aria-hidden="true"
          style={{ width: ROW_WIDTHS[index % ROW_WIDTHS.length] }}
        />
      ))}
    </div>
  );
}
