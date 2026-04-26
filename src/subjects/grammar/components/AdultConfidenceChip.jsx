import React from 'react';
import { isGrammarConfidenceLabel } from '../../../../shared/grammar/confidence.js';

// Phase 4 U7: the AdultConfidenceChip lives in its own module so every adult
// surface (GrammarAnalyticsScene, ParentHubSurface, AdminHubSurface) can import
// it directly. Extracted verbatim (in behaviour) from
// `GrammarAnalyticsScene.jsx` at the inline declaration that previously lived
// at lines 88-124. Two important deltas from the pre-U7 inline version:
//
//   1. Accepts a structured `confidence` prop — `{ label, sampleSize,
//      intervalDays, distinctTemplates, recentMisses }` — rather than an
//      opaque `row`. The shape matches Worker's read-model projection and the
//      client read-model output (U7 extends the client read-model to produce
//      it).  The chip is now a pure renderer of that projection, not a
//      collection of row-normalisation heuristics.
//   2. Out-of-taxonomy labels render `'Unknown'` with a neutral tone — NEVER
//      silently fall back to `'emerging'`. The pre-U7 inline version defaulted
//      to `'emerging'`, which silently hid emission drift. Named in the plan
//      under R17.
//
// Child surfaces MUST NOT import this component — grammar-view-model.js
// provides the child-facing label mapping (`grammarChildConfidenceLabel`).
// See `tests/grammar-parent-hub-confidence.test.js` for the regression lock
// that greps child surfaces for any import of this module.

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normaliseCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
}

// Convert a raw `confidence` projection into a renderable shape. Returns
// null when there is no signal to surface at all — callers then render
// nothing. Any non-canonical label is coerced to `'unknown'` so the chip
// renders the neutral `'Unknown'` tone; the plan names this behaviour
// explicitly as a contrast with the pre-U7 silent fallback to `'emerging'`.
function normaliseConfidence(confidence) {
  if (!isPlainObject(confidence)) return null;
  const rawLabel = typeof confidence.label === 'string' ? confidence.label : '';
  const canonical = isGrammarConfidenceLabel(rawLabel);
  const label = canonical ? rawLabel : (rawLabel ? 'unknown' : '');
  const sampleSize = normaliseCount(confidence.sampleSize);
  if (!label && sampleSize <= 0) return null;
  return {
    label: label || 'emerging',
    sampleSize,
    canonical,
    intervalDays: Number.isFinite(Number(confidence.intervalDays))
      ? Math.max(0, Number(confidence.intervalDays)) : 0,
    distinctTemplates: normaliseCount(confidence.distinctTemplates),
    recentMisses: normaliseCount(confidence.recentMisses),
  };
}

/**
 * Renders an adult-facing confidence chip.
 *
 * Output format (flat text inside a single `<span>`) matches the pre-U7
 * inline chip: `"<label> &middot; <N> attempt(s)"`. Admin surfaces that
 * pass `showAdminExtras` also get `" &middot; <N>d spacing &middot; <N>
 * template(s)"`. Recent-miss counts are appended when positive. Keeping
 * the text flat (no nested spans between label and sample count) lets
 * existing Phase 3 U7 tests on `GrammarAnalyticsScene` keep matching
 * their regex patterns unchanged — the extraction is a refactor, not a
 * text-shape change.
 *
 * @param {object} props
 * @param {object|null} props.confidence - `{ label, sampleSize,
 *   intervalDays, distinctTemplates, recentMisses }` projection from a
 *   client or Worker grammar read model. `null` renders nothing.
 * @param {boolean} [props.showAdminExtras=false] - when true, render the
 *   admin-only extras: `intervalDays` and `distinctTemplates`. Parent Hub
 *   leaves this off so parents see the headline label + sample context
 *   only.
 */
export function AdultConfidenceChip({ confidence, showAdminExtras = false }) {
  const normalised = normaliseConfidence(confidence);
  if (!normalised) return null;
  const displayLabel = normalised.canonical ? normalised.label : 'Unknown';
  const sampleSuffix = normalised.sampleSize === 1 ? 'attempt' : 'attempts';
  const missSuffix = normalised.recentMisses === 1 ? 'miss' : 'misses';
  const toneClass = normalised.canonical ? normalised.label : 'unknown';
  const parts = [`${displayLabel} · ${normalised.sampleSize} ${sampleSuffix}`];
  if (normalised.recentMisses > 0) {
    parts.push(`${normalised.recentMisses} recent ${missSuffix}`);
  }
  if (showAdminExtras) {
    parts.push(`${normalised.intervalDays}d spacing`);
    parts.push(`${normalised.distinctTemplates} template${normalised.distinctTemplates === 1 ? '' : 's'}`);
  }
  return (
    <span
      className={`grammar-adult-confidence ${toneClass}`}
      data-confidence-label={displayLabel}
      data-sample-size={normalised.sampleSize}
      data-recent-misses={normalised.recentMisses}
      data-interval-days={normalised.intervalDays}
      data-distinct-templates={normalised.distinctTemplates}
    >
      {parts.join(' · ')}
    </span>
  );
}

// Back-compat helper — existing callers that render chips from a concept-row
// shape (e.g. `GrammarAnalyticsScene.jsx`'s evidence-summary grid) can keep
// their call site unchanged while the chip itself consumes the richer prop.
// Accepts `{ confidence, confidenceLabel, attempts }` style shapes — the
// canonical path is the `confidence` sub-object.
export function adultConfidenceFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  if (isPlainObject(row.confidence)) return row.confidence;
  if (typeof row.confidenceLabel === 'string' && row.confidenceLabel) {
    return {
      label: row.confidenceLabel,
      sampleSize: Number(row.attempts) || 0,
    };
  }
  if (Number(row.attempts) > 0) {
    return { label: 'emerging', sampleSize: Number(row.attempts) };
  }
  return null;
}
