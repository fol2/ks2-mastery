import { useCallback, useEffect, useRef, useState } from 'react';

/* Platform slide-button length picker.
 *
 * Canonicalisation of Grammar's `RoundLengthPicker` and Spelling's
 * `LengthPicker` / `YearPicker` into a single prop-driven component.
 * Consumed by:
 *   - Grammar (`GrammarSetupScene`) for round length — `unit="questions"`.
 *   - Spelling round length (`SpellingSetupScene`) — `unit="words"`.
 *   - Spelling year filter (`SpellingSetupScene`) — no `unit`, bare picker.
 *   - Later: Punctuation round length (includeDataValue variant).
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
 *     `actionName` / `prefKey` / `includeDataValue` props. Each subject
 *     passes the combination that matches its current attribute
 *     footprint so existing Playwright + Admin Debug Bundle locators do
 *     not move. `includeDataValue` gates emission of the `data-value`
 *     attribute specifically (distinct from the always-emitted `value`
 *     attribute on the <button>); name is explicit so future readers do
 *     not confuse it with the `value` prop.
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
  includeDataValue = false,
  sliderMode = 'indexed',
}) {
  const model = normalisePickerModel(options, selectedValue);
  if (sliderMode === 'measured') {
    return (
      <MeasuredLengthPicker
        {...model}
        onChange={onChange}
        disabled={disabled}
        ariaLabel={ariaLabel}
        unit={unit}
        className={className}
        actionName={actionName}
        prefKey={prefKey}
        includeDataValue={includeDataValue}
      />
    );
  }
  return renderLengthPicker({
    ...model,
    onChange,
    disabled,
    ariaLabel,
    unit,
    className,
    actionName,
    prefKey,
    includeDataValue,
  });
}

function normalisePickerModel(options, selectedValue) {
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
  // Legacy-parity clamp: when `selectedValue` is not in `options` the
  // slider pins to index 0 (NOT -1). Grammar's `RoundLengthPicker` and
  // Spelling's inline `LengthPicker` / `YearPicker` all used
  // `Math.max(0, indexOf(...))` for the `--selected-index` CSS var.
  // Every characterisation regex in tests/platform-length-picker.test.js
  // and the Grammar + Spelling surface tests pins `--selected-index:0`
  // in this edge case; changing to -1 would break every such assertion
  // and shift the slider visually. Do NOT change to -1.
  const selectedIndex = selectedIndexRaw >= 0 ? selectedIndexRaw : 0;
  return { normalised, compareValue, selectedIndex };
}

function MeasuredLengthPicker({
  normalised,
  compareValue,
  selectedIndex,
  onChange,
  disabled = false,
  ariaLabel,
  unit,
  className,
  actionName,
  prefKey,
  includeDataValue = false,
}) {
  const pickerRef = useRef(null);
  const optionRefs = useRef(new Map());
  const [measuredSliderBox, setMeasuredSliderBox] = useState(null);
  const optionSignature = normalised
    .map((entry) => `${entry.value}\u0002${entry.label}`)
    .join('\u0001');

  const setOptionRef = useCallback((value, node) => {
    if (node) {
      optionRefs.current.set(value, node);
    } else {
      optionRefs.current.delete(value);
    }
  }, []);

  const measureSlider = useCallback(() => {
    const picker = pickerRef.current;
    const selectedOption = optionRefs.current.get(compareValue);
    if (!picker || !selectedOption) {
      setMeasuredSliderBox(null);
      return;
    }
    const pickerRect = picker.getBoundingClientRect();
    const optionRect = selectedOption.getBoundingClientRect();
    const next = {
      x: Math.round((optionRect.left - pickerRect.left) * 100) / 100,
      y: Math.round((optionRect.top - pickerRect.top) * 100) / 100,
      width: Math.round(optionRect.width * 100) / 100,
      height: Math.round(optionRect.height * 100) / 100,
    };
    setMeasuredSliderBox((current) => (
      current
        && current.x === next.x
        && current.y === next.y
        && current.width === next.width
        && current.height === next.height
        ? current
        : next
    ));
  }, [compareValue]);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) measureSlider();
    };
    run();
    const frame = globalThis.requestAnimationFrame ? globalThis.requestAnimationFrame(run) : 0;
    const picker = pickerRef.current;
    const selectedOption = optionRefs.current.get(compareValue);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(run) : null;
    if (observer && picker) observer.observe(picker);
    if (observer && selectedOption) observer.observe(selectedOption);
    globalThis.addEventListener?.('resize', run);
    if (globalThis.document?.fonts?.ready) {
      globalThis.document.fonts.ready.then(run).catch(() => {});
    }
    return () => {
      cancelled = true;
      if (frame && globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame(frame);
      observer?.disconnect();
      globalThis.removeEventListener?.('resize', run);
    };
  }, [compareValue, measureSlider, optionSignature]);

  return renderLengthPicker({
    normalised,
    compareValue,
    selectedIndex,
    onChange,
    disabled,
    ariaLabel,
    unit,
    className,
    actionName,
    prefKey,
    includeDataValue,
    measuredSliderBox,
    pickerRef,
    setOptionRef,
    sliderMode: 'measured',
  });
}

function renderLengthPicker({
  normalised,
  compareValue,
  selectedIndex,
  onChange,
  disabled = false,
  ariaLabel,
  unit,
  className,
  actionName,
  prefKey,
  includeDataValue = false,
  measuredSliderBox = null,
  pickerRef = null,
  setOptionRef = null,
  sliderMode = 'indexed',
}) {
  const measuredSlider = sliderMode === 'measured';
  const pickerClassName = className ? `length-picker ${className}` : 'length-picker';
  const pickerStyle = {
    '--option-count': String(normalised.length),
    '--selected-index': String(selectedIndex),
  };
  if (measuredSlider && measuredSliderBox) {
    pickerStyle['--measured-slider-x'] = `${measuredSliderBox.x}px`;
    pickerStyle['--measured-slider-y'] = `${measuredSliderBox.y}px`;
    pickerStyle['--measured-slider-width'] = `${measuredSliderBox.width}px`;
    pickerStyle['--measured-slider-height'] = `${measuredSliderBox.height}px`;
  }

  const picker = (
    <div
      ref={pickerRef || undefined}
      className={pickerClassName}
      role="radiogroup"
      aria-label={ariaLabel}
      style={pickerStyle}
      {...(measuredSlider ? {
        'data-slider-mode': 'measured',
        ...(measuredSliderBox ? { 'data-slider-ready': 'true' } : {}),
      } : {})}
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
        if (includeDataValue) buttonProps['data-value'] = entry.value;
        buttonProps.value = entry.value;
        buttonProps.disabled = disabled;
        buttonProps.onClick = (event) => onChange(entry.value, event);
        if (measuredSlider && setOptionRef) buttonProps.ref = (node) => setOptionRef(entry.value, node);
        return (
          <button key={entry.value} {...buttonProps}>
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
