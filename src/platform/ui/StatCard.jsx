/* Platform StatCard primitive (P2 U3).
 *
 * Display-only label/value/caption tile rendered as a definition list
 * (`<dl><dt>label</dt><dd>value caption</dd></dl>`) so screen readers
 * announce the label-value pairing without extra ARIA wiring.
 * Pioneer-then-pattern: the `as="figure"` opt-in, `tone` modifier, and
 * `progress` slot noted in the U3 plan are all deferred to their first
 * consumer; the load-bearing contract is the `<dl>/<dt>/<dd>` shape.
 *
 * Stateless by design (R10).
 */

export function StatCard({ label, value, caption, className, ...rest }) {
  return (
    <dl
      {...rest}
      className={className ? `stat-card ${className}` : 'stat-card'}
    >
      {label ? <dt>{label}</dt> : null}
      <dd>
        {value}
        {caption ? <span className="stat-card-caption">{caption}</span> : null}
      </dd>
    </dl>
  );
}
