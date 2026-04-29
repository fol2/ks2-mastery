/* Platform ProgressMeter primitive (P2 U3).
 *
 * Shared `role="progressbar"` bar that replaces bespoke
 * inline `width: ${pct}%` meter implementations across the app. The ARIA
 * contract mirrors `src/subjects/grammar/components/GrammarSessionScene.jsx:631`:
 * role="progressbar", aria-valuenow, aria-valuemin, aria-valuemax, plus
 * `aria-label` (or `aria-labelledby` passed through `rest`). The
 * inline `--progress-value` CSS variable is numeric-clamped 0–100 so
 * the CSS rule (`.progress-meter-fill { width: calc(...) }`) is the
 * only width source — that's the CSP inline-style sanitisation pattern.
 * Pioneer-then-pattern: the `accent` / `showValueText` / `variant`
 * props noted in the U3 plan are deferred to their first consumer; the
 * fill colour is themed via the cascading `--subject-accent` /
 * `--progress-accent` CSS variables (see `styles/app.css`'s
 * `.progress-meter-fill` rule), so callers do not need to pass a JS
 * accent string today. `min` / `max` accept overrides per WCAG; the
 * primitive normalises them to safe defaults when missing.
 * Stateless by design (R10): no store subscription, no render-time
 * effects.
 */

export function ProgressMeter({ value, min = 0, max = 100, label, className, ...rest }) {
  const n = Number(value);
  const c = !Number.isFinite(n) ? min : n < min ? min : n > max ? max : n;
  const span = max - min;
  const pct = span > 0 ? Math.round(((c - min) / span) * 100) : 0;
  return (
    <div
      {...rest}
      className={className ? `progress-meter ${className}` : 'progress-meter'}
      role="progressbar"
      aria-valuenow={c}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={label || rest['aria-label']}
    >
      <div className="progress-meter-fill" style={{ '--progress-value': pct }} aria-hidden="true" />
    </div>
  );
}
