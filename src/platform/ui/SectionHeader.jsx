/* Platform SectionHeader primitive (P2 U2).
 *
 * Wraps the existing `.eyebrow` + `.section-title`/`.title` + `.subtitle`
 * class trio (`styles/app.css:457-482`) so subject + hub surfaces share
 * one JSX shape for the editorial panel-heading rhythm without
 * introducing any new visual language.
 *
 * Style contract:
 *   - Renders `<header>` (default; overridable via `as`) containing
 *     `<span class="eyebrow">` (when `eyebrow` supplied) +
 *     `<Hn class="section-title">` (heading level via `level`, default
 *     `2`) + `<p class="subtitle">` (when `subtitle` supplied). The
 *     `statusChip` and `trailingAction` slots render after the heading
 *     so their tab order follows the title in the natural document
 *     flow.
 *   - No new CSS in U2. All paint inherits from the existing classes.
 *
 * Slot composition (R3 / R6):
 *   - `eyebrow`, `title`, `subtitle` are string-or-node props.
 *   - `trailingAction` and `statusChip` are slot children — typically a
 *     `<Button>` (already focus-ring-styled) and a small chip element.
 *
 * Stateless (R10): no platform-store subscription.
 */
export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  trailingAction,
  statusChip,
  as = 'header',
  level = 2,
  className,
  ...rest
}) {
  // Clamp heading level to the valid HTML range so a typo doesn't ship
  // an invalid `<h0>` / `<h7>` element. `h2` is the default — only the
  // page-level hero ever needs `h1` and that lives outside this
  // primitive.
  const normalisedLevel = Math.min(6, Math.max(1, Number(level) || 2));
  const Heading = `h${normalisedLevel}`;
  const Wrapper = as || 'header';

  // Filter rest props with the same safelist Card uses.
  const forwardedRest = {};
  for (const key of Object.keys(rest)) {
    if (key.startsWith('data-')) {
      forwardedRest[key] = rest[key];
    } else if (key.startsWith('aria-')) {
      forwardedRest[key] = rest[key];
    } else if (
      key === 'id' || key === 'role' || key === 'title' || key === 'tabIndex'
    ) {
      forwardedRest[key] = rest[key];
    }
  }

  const wrapperProps = { className: className ? `section-header ${className}` : 'section-header' };
  Object.assign(wrapperProps, forwardedRest);

  return (
    <Wrapper {...wrapperProps}>
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      {title ? <Heading className="section-title">{title}</Heading> : null}
      {subtitle ? <p className="subtitle">{subtitle}</p> : null}
      {statusChip ? <div className="section-header-status">{statusChip}</div> : null}
      {trailingAction ? <div className="section-header-action">{trailingAction}</div> : null}
    </Wrapper>
  );
}
