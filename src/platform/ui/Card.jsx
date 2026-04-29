/* Platform Card primitive (P2 U2).
 *
 * Wraps the existing `.card` / `.card.soft` / `.card.border-top` class
 * family (`styles/app.css:437-449`) so subject + hub surfaces share one
 * JSX shape for the paper-aesthetic panel container without introducing
 * any new visual language.
 *
 * Style contract:
 *   - Renders the chosen element (`as` prop, default `<div>`) with the
 *     composed `.card` class string. No new CSS lands in U2 — `tone`
 *     modifiers map to existing `.card.soft` for the `soft` tone; the
 *     `warning` / `error` tone classes are emitted but their bespoke
 *     paint waits on a follow-up unit (Module C: do not invent visual
 *     language inside a primitive extraction unit).
 *   - The optional `accent` prop is a CSS-variable-shaped string (e.g.
 *     `'var(--grammar-accent)'`). When supplied it lands as
 *     `style={{ '--card-accent': accent }}` so a sibling CSS rule can
 *     read it (e.g. `border-top-color: var(--card-accent)`). When
 *     omitted the primitive emits NO inline style — keeping the CSP
 *     inline-style budget unchanged for the common case.
 *   - In U2 only Grammar's `--grammar-accent` is exercised as the
 *     working test case; Punctuation's `--punctuation-accent` waits on
 *     U6 per the plan.
 *
 * Slot composition (R3 / R6):
 *   - Children render inside the rendered element. No prop-tree DSL.
 *
 * Locator preservation:
 *   - Arbitrary `data-*` and `aria-*` attributes pass through via the
 *     same explicit safelist Button uses, so callers' existing
 *     `data-section` / `data-action` / `aria-label` selectors survive
 *     byte-identical at migration sites.
 *
 * Stateless by design (R10):
 *   - No `usePlatformStore` import. No subscription. The primitive is
 *     a thin wrapper and never derives state.
 */
export function Card({
  tone = 'default',
  accent,
  as = 'div',
  className,
  children,
  style,
  ...rest
}) {
  // Compose the className. `tone === 'default'` renders bare `.card`;
  // other tones append the matching modifier. We do NOT emit `default`
  // as a class so existing CSS selectors (`.card.soft`) keep working
  // without any rule rewrites.
  const classes = ['card'];
  if (tone && tone !== 'default') classes.push(tone);
  if (className) classes.push(className);

  // Compose the inline style. The `--card-accent` variable is only
  // emitted when an accent string is supplied so the CSP inline-style
  // ledger only counts call-sites that genuinely need the dynamic
  // accent passthrough.
  let mergedStyle = style;
  if (accent !== undefined && accent !== null && accent !== '') {
    mergedStyle = { ...(style || {}), '--card-accent': accent };
  }

  // Filter rest props to the same safelist Button uses — only data-*,
  // aria-*, and a handful of safe HTML pass-throughs flow through.
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

  const Element = as || 'div';
  const elementProps = { className: classes.join(' ') };
  if (mergedStyle !== undefined) elementProps.style = mergedStyle;
  Object.assign(elementProps, forwardedRest);

  return <Element {...elementProps}>{children}</Element>;
}
