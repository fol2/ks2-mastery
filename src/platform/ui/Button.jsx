import React from 'react';

/* Platform Button primitive (P2 U1).
 *
 * Wraps the existing `.btn` class family (`styles/app.css:503-524`) so
 * primary CTAs across Hero Mode, Grammar setup, Punctuation setup,
 * Home hero, and AdminPanelFrame stale-data refresh share one JSX
 * shape, one busy/disabled wiring, and one locator-preservation
 * contract — without introducing any new visual language.
 *
 * Style contract:
 *   - Renders `<button>` with composed `.btn` classes only. No new
 *     CSS lands in U1; all hover / active / disabled / focus styling
 *     already lives in `styles/app.css`. The primitive is a pure JSX
 *     wrapper.
 *   - When `busy` is true the primitive sets BOTH `aria-busy="true"`
 *     AND `disabled`. The `.is-loading` modifier (which would replace
 *     the visible label with a spinner via
 *     `styles/app.css:10144-10169`) is NOT toggled automatically:
 *     the existing busy CTAs at HeroQuestCard / Grammar / Punctuation
 *     show a worded transition state ("Starting...", "Working...")
 *     and we preserve that visible label byte-identical. A consumer
 *     that wants the spinner-only visual can opt in by passing
 *     `className="is-loading"`.
 *
 * Locator preservation (mirrors LengthPicker's
 * `actionName` / `prefKey` / `includeDataValue` pattern):
 *   - `dataAction` → `data-action` (omitted if not supplied so a
 *     hand-rolled `<button>` without the attribute migrates byte-
 *     identically).
 *   - `dataValue` → `data-value` (likewise opt-in).
 *   - Arbitrary `data-*` attributes pass through via the rest props
 *     forwarded to the rendered `<button>`. Existing Playwright +
 *     Admin Debug Bundle selectors survive byte-identical.
 *
 * Stateless by design (R10):
 *   - No `usePlatformStore` import. No subscription. The primitive is
 *     a thin wrapper. Consumers that want the JSX-layer double-submit
 *     guard can opt in to `src/platform/react/use-submit-lock.js`
 *     themselves and hand the resulting `locked` flag in via `busy`.
 *
 * Event handlers (forwarded explicitly, not via spread):
 *   - `onClick`, `onFocus`, `onBlur`, `onKeyDown`. Spreading arbitrary
 *     props would risk swallowing telemetry handlers a future caller
 *     attaches; explicit forwarding keeps the contract auditable.
 *
 * Accessibility:
 *   - `type="button"` default (no accidental form submits).
 *   - Visible label required unless `aria-label` is supplied — the
 *     primitive throws at render time when both children and
 *     `aria-label` are empty so the failure surfaces during the
 *     parser-level test (`tests/ui-button-primitive.test.js`) rather
 *     than as a silent screen-reader regression in production.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  disabled = false,
  dataAction,
  dataValue,
  startIcon,
  endIcon,
  type = 'button',
  className,
  children,
  onClick,
  onFocus,
  onBlur,
  onKeyDown,
  'aria-label': ariaLabel,
  'aria-busy': ariaBusyOverride,
  ...rest
}) {
  // Visible-label contract — fail loudly during parser-level testing
  // rather than ship a silent a11y regression. Children may legitimately
  // be `0` or `false` (rare but valid React node values), so the check
  // is `== null || ''`, NOT `!children`.
  const hasVisibleLabel = (
    children !== null && children !== undefined && children !== ''
  );
  if (!hasVisibleLabel && !ariaLabel) {
    throw new Error(
      'Button requires either visible children or an explicit aria-label '
      + 'so screen readers can announce the action. Supply at least one.',
    );
  }

  // Filter the rest props to forward-only the safe HTML pass-throughs
  // we know about. Dropping unknown props prevents a future caller
  // from accidentally re-introducing the event-handler-swallow hazard
  // via `...rest`. The safelist:
  //   - data-* attributes (locator preservation, telemetry hooks)
  //   - aria-* attributes (accessibility — mostly redundant with the
  //     explicit `aria-label` / `aria-busy` handling above, but safe)
  //   - `style`           (Punctuation's inline `--btn-accent` Bellstorm
  //                        gold; remains until U6's token unification)
  //   - `id` / `name` / `value` / `form` (native button HTML)
  //   - `tabIndex` / `role` / `title` (a11y + tooltip pass-throughs)
  const forwardedRest = {};
  for (const key of Object.keys(rest)) {
    if (key.startsWith('data-')) {
      forwardedRest[key] = rest[key];
    } else if (key.startsWith('aria-')) {
      forwardedRest[key] = rest[key];
    } else if (
      key === 'id' || key === 'name' || key === 'value' || key === 'form'
      || key === 'style' || key === 'tabIndex' || key === 'role' || key === 'title'
    ) {
      forwardedRest[key] = rest[key];
    }
  }

  const isBusy = Boolean(busy);
  const isDisabled = Boolean(disabled) || isBusy;

  // `size === 'md'` renders as the bare `.btn` (per plan U1 Approach).
  // Other sizes append the matching modifier — `.btn sm` / `.btn lg` /
  // `.btn xl` — exactly mirroring the hand-rolled class strings the
  // migrating call-sites already use.
  const classes = ['btn'];
  if (variant) classes.push(variant);
  if (size && size !== 'md') classes.push(size);
  if (className) classes.push(className);

  const buttonProps = {
    type,
    className: classes.join(' '),
    disabled: isDisabled,
    onClick,
    onFocus,
    onBlur,
    onKeyDown,
  };
  if (ariaLabel) buttonProps['aria-label'] = ariaLabel;
  // `aria-busy` follows `busy` by default. Allow an explicit override
  // for the rare case where a caller wants to keep the visual spinner
  // (`busy=true` → `.is-loading`) but suppress the AT announcement —
  // currently unused, but cheap optionality and the override is
  // visible in the rendered HTML if it's ever set.
  if (ariaBusyOverride !== undefined) {
    buttonProps['aria-busy'] = ariaBusyOverride;
  } else if (isBusy) {
    buttonProps['aria-busy'] = 'true';
  }
  if (dataAction) buttonProps['data-action'] = dataAction;
  if (dataValue !== undefined && dataValue !== null) {
    buttonProps['data-value'] = String(dataValue);
  }
  Object.assign(buttonProps, forwardedRest);

  return (
    <button {...buttonProps}>
      {startIcon ? <span className="btn-start-icon" aria-hidden="true">{startIcon}</span> : null}
      {children}
      {endIcon ? <span className="btn-end-icon" aria-hidden="true">{endIcon}</span> : null}
    </button>
  );
}
