/* Platform ActionRow layout primitive (P3 U2).
 *
 * A layout-only companion to `Button` that provides consistent flexbox
 * alignment, gap, and wrapping for action button groups across learner-
 * facing surfaces (session, summary, setup, home).
 *
 * Contract:
 *   - NO command dispatch logic — pure layout.
 *   - Renders a `<div>` with role="group" and aria-label for screen
 *     readers to announce the action cluster as a group.
 *   - `align` prop controls alignment:
 *       "start"   → justify-content: flex-start (default)
 *       "centre"  → justify-content: center
 *       "end"     → justify-content: flex-end
 *       "split"   → primary on left, secondary/tertiary on right via
 *                    margin-left: auto on secondary wrapper.
 *   - Handles single-button case gracefully (no empty wrapper rendered).
 *   - `gap` defaults to 12px, consistent with .actions pattern in
 *     styles/app.css.
 *
 * Locator preservation:
 *   - data-action-row attribute for test selectors.
 *   - className pass-through for existing .actions styling hooks.
 */
export function ActionRow({
  primary,
  secondary,
  tertiary,
  align = 'start',
  className,
  style,
  'aria-label': ariaLabel,
}) {
  const hasSecondary = secondary !== null && secondary !== undefined;
  const hasTertiary = tertiary !== null && tertiary !== undefined;

  const justifyMap = {
    start: 'flex-start',
    centre: 'center',
    end: 'flex-end',
    split: 'flex-start',
  };

  const baseStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    justifyContent: justifyMap[align] || 'flex-start',
    ...style,
  };

  const classes = ['action-row'];
  if (className) classes.push(className);

  if (align === 'split') {
    return (
      <div
        className={classes.join(' ')}
        data-action-row
        role="group"
        aria-label={ariaLabel || 'Actions'}
        style={baseStyle}
      >
        <div className="action-row-start">{primary}</div>
        {(hasSecondary || hasTertiary) ? (
          <div className="action-row-end" style={{ marginLeft: 'auto', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {hasSecondary ? secondary : null}
            {hasTertiary ? tertiary : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={classes.join(' ')}
      data-action-row
      role="group"
      aria-label={ariaLabel || 'Actions'}
      style={baseStyle}
    >
      {primary}
      {hasSecondary ? secondary : null}
      {hasTertiary ? tertiary : null}
    </div>
  );
}
