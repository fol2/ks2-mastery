import React from 'react';

/* Platform slide-button length picker.
 *
 * Canonicalisation of Grammar's `RoundLengthPicker` and Spelling's
 * `LengthPicker` / `YearPicker` into a single prop-driven component.
 * Consumed by:
 *   - Grammar (`GrammarSetupScene`) for round length — `unit="questions"`.
 *   - Spelling round length (`SpellingSetupScene`) — `unit="words"`.
 *   - Spelling year filter (`SpellingSetupScene`) — no `unit`, bare picker.
 *   - Later: Punctuation round length (valueAttr variant).
 *
 * DOM rhythm:
 *   - `.length-control` wrapper is rendered ONLY when `unit` is supplied.
 *     Without a unit the outer element is `.length-picker` directly, so
 *     Spelling's year-filter (which has no unit string) keeps its bare
 *     radiogroup shape byte-identical to the inline YearPicker.
 *   - The `.length-picker` radiogroup carries `--option-count` and
 *     `--selected-index` CSS vars; the `.length-slider` span is animated
 *     by `.length-slider { transition: transform 260ms }` in app.css.
 *   - Per-option `.length-option` buttons carry optional data-attributes
 *     (`data-action`, `data-pref`, `data-value`) driven by
 *     `actionName` / `prefKey` / `valueAttr` props. Each subject passes
 *     the combination that matches its current attribute footprint so
 *     existing Playwright + Admin Debug Bundle locators do not move.
 *
 * `options` accepts two shapes:
 *   - `string[]` — plain values, visible text === serialised value.
 *   - `{value, label}[]` — visible text uses `label`, internal comparison
 *     + `value` attribute use `value`. This preserves Spelling's
 *     YearPicker contract (display "Y3-4" but serialise "y3-4").
 *
 * `onChange(value, event?)` — receives the selected value first and the
 * React click event second so Spelling's existing closure
 * `(value, event) => renderAction(actions, event, 'spelling-set-pref', …)`
 * keeps its `event.preventDefault()` / `event.stopPropagation()` semantics.
 * Grammar and Punctuation ignore the event argument.
 */
export function LengthPicker({
  options,
  selectedValue,
  onChange,
  disabled = false,
  ariaLabel,
  unit,
  className,
  actionName,
  prefKey,
  valueAttr = false,
}) {
  const optionList = Array.isArray(options) ? options : [];
  const normalised = optionList.map((entry) => {
    if (entry && typeof entry === 'object' && 'value' in entry) {
      return { value: String(entry.value), label: String(entry.label ?? entry.value) };
    }
    const str = String(entry);
    return { value: str, label: str };
  });
  const compareValue = selectedValue == null ? '' : String(selectedValue);
  const selectedIndexRaw = normalised.findIndex((entry) => entry.value === compareValue);
  const selectedIndex = selectedIndexRaw >= 0 ? selectedIndexRaw : 0;

  const pickerClassName = className ? `length-picker ${className}` : 'length-picker';

  const picker = (
    <div
      className={pickerClassName}
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        '--option-count': String(normalised.length),
        '--selected-index': String(selectedIndex),
      }}
    >
      <span className="length-slider" aria-hidden="true" />
      {normalised.map((entry) => {
        const selected = entry.value === compareValue;
        // Attribute order matters — existing Grammar + Spelling
        // characterisation tests match on regexes that pin relative
        // positions (e.g. `class="length-option selected"[^>]*value="5"
        // [^>]*disabled="">`). The original inline pickers emitted
        // `data-action` / `data-pref` BEFORE `value` / `disabled`;
        // keep that order so every legacy assertion still matches.
        const buttonProps = {
          type: 'button',
          role: 'radio',
          'aria-checked': selected ? 'true' : 'false',
          className: `length-option${selected ? ' selected' : ''}`,
        };
        if (actionName) buttonProps['data-action'] = actionName;
        if (prefKey) buttonProps['data-pref'] = prefKey;
        if (valueAttr) buttonProps['data-value'] = entry.value;
        buttonProps.value = entry.value;
        buttonProps.disabled = disabled;
        buttonProps.key = entry.value;
        buttonProps.onClick = (event) => onChange(entry.value, event);
        return (
          <button {...buttonProps}>
            <span>{entry.label}</span>
          </button>
        );
      })}
    </div>
  );

  if (!unit) return picker;

  return (
    <div className="length-control">
      {picker}
      <span className="length-unit">{unit}</span>
    </div>
  );
}
