/* Slot-based Setup-scene sidebar shell. Lifts .ss-card / .ss-head /
 * body / footer shape out of Spelling's SpellingSetupScene and
 * Grammar's GrammarSetupScene.
 *
 * Props:
 *   head?: ReactNode — optional content for the top-of-card head row
 *   body: ReactNode — required card body content
 *   footer?: ReactNode — optional footer link or CTA block
 *   asideClassName?: string — extra class appended to "setup-side"
 *   cardClassName?: string — extra class appended to "ss-card"
 *   headClassName?: string — extra class appended to "ss-head"
 *   headTag?: 'div' | 'header' — defaults to 'div' to preserve Spelling's DOM
 *   ariaLabel?: string — aria-label on the <aside>
 *
 * Subject-specific classes (grammar-setup-sidebar, etc) are passed via
 * the className props; the platform component is subject-agnostic.
 */
export function SetupSidePanel({
  head = null,
  body,
  footer = null,
  asideClassName = '',
  cardClassName = '',
  headClassName = '',
  headTag = 'div',
  ariaLabel = '',
}) {
  const asideClasses = asideClassName ? `setup-side ${asideClassName}` : 'setup-side';
  const cardClasses = cardClassName ? `ss-card ${cardClassName}` : 'ss-card';
  const headClasses = headClassName ? `ss-head ${headClassName}` : 'ss-head';
  const HeadTag = headTag === 'header' ? 'header' : 'div';
  return (
    <aside className={asideClasses} aria-label={ariaLabel || undefined}>
      <div className={cardClasses}>
        {head != null ? <HeadTag className={headClasses}>{head}</HeadTag> : null}
        {body}
        {footer != null ? footer : null}
      </div>
    </aside>
  );
}
