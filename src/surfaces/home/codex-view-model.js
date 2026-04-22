import {
  CODEX_FEATURE_MAX_SIZE_BY_SPECIES,
  CODEX_STAGE_SCALE,
} from './codex-visual-scale.js';

export const CODEX_STAGES = Object.freeze([
  { value: 0, label: 'E', name: 'Egg' },
  { value: 1, label: 'K', name: 'Kid' },
  { value: 2, label: 'T', name: 'Teen' },
  { value: 3, label: 'A', name: 'Adult' },
  { value: 4, label: 'M', name: 'Mega' },
]);

const FEATURE_FOOT_PAD_BY_ASSET = Object.freeze({
  inklet: Object.freeze({
    b1: Object.freeze([18, 16, 12, 14, 8]),
    b2: Object.freeze([18, 29, 22, 8, 7]),
  }),
  glimmerbug: Object.freeze({
    b1: Object.freeze([25, 34, 24, 17, 8]),
    b2: Object.freeze([20, 27, 14, 12, 2]),
  }),
  phaeton: Object.freeze({
    b1: Object.freeze([6, 16, 22, 10, 4]),
    b2: Object.freeze([16, 18, 10, 2, 0]),
  }),
});

const FEATURE_FOOT_PAD_SOURCE_SIZE = 320;

function codexVisualMetrics(entry) {
  const maxSize = CODEX_FEATURE_MAX_SIZE_BY_SPECIES[entry.id] || 760;
  const stage = entry.caught ? Math.max(0, Math.min(4, Number(entry.stage) || 0)) : 0;
  const visualSize = Math.round(maxSize * (CODEX_STAGE_SCALE[stage] || CODEX_STAGE_SCALE[0]));
  const footPad = entry.displayState === 'fresh'
    ? 0
    : FEATURE_FOOT_PAD_BY_ASSET[entry.id]?.[entry.branch]?.[stage] ?? 0;
  const footShift = Math.round(visualSize * (footPad / FEATURE_FOOT_PAD_SOURCE_SIZE));
  const rise = entry.displayState === 'monster'
    ? Math.min(155, 52 + (entry.stage * 24) + (entry.id === 'phaeton' ? 20 : 0))
    : 0;

  return {
    visualSize,
    footShift,
    rise,
  };
}

function codexFeatureStyleFromMetrics({ visualSize, footShift, rise }) {
  return {
    '--codex-feature-size': `${visualSize}px`,
    '--codex-feature-shadow-width': `${Math.min(640, Math.round(visualSize * 0.86))}px`,
    '--codex-feature-shadow-y': `${Math.round(Math.max(120, visualSize * 0.34))}px`,
    '--codex-feature-rise': `${rise}px`,
    '--codex-feature-foot-shift': `${footShift}px`,
  };
}

export function codexTotals(entries = []) {
  const directSecure = entries
    .filter((entry) => entry.id !== 'phaeton')
    .reduce((sum, entry) => sum + entry.mastered, 0);
  const aggregateSecure = entries.find((entry) => entry.id === 'phaeton')?.mastered || 0;

  return {
    caught: entries.filter((entry) => entry.caught).length,
    secure: Math.max(directSecure, aggregateSecure),
    highestStage: entries.reduce((max, entry) => Math.max(max, entry.caught ? entry.stage : 0), 0),
  };
}

export function codexFeatureStyle(entry) {
  return codexFeatureStyleFromMetrics(codexVisualMetrics(entry));
}

export function codexLightboxStyle(entry) {
  const metrics = codexVisualMetrics(entry);
  const { visualSize, footShift, rise } = metrics;
  const isEgg = entry.displayState === 'egg';

  return {
    ...codexFeatureStyleFromMetrics(metrics),
    '--codex-lightbox-visual-size': `${visualSize}px`,
    '--codex-lightbox-orbit-size': `${Math.round(visualSize * (isEgg ? 1.34 : 1.24))}px`,
    '--codex-lightbox-shadow-width': `${Math.min(520, Math.round(visualSize * (isEgg ? 0.82 : 0.78)))}px`,
    '--codex-lightbox-shadow-height': `${Math.max(20, Math.min(52, Math.round(visualSize * 0.09)))}px`,
    '--codex-lightbox-shadow-y': `${Math.round(Math.max(82, visualSize * 0.39) - footShift)}px`,
    '--codex-lightbox-lift': `${Math.round(rise * 0.32)}px`,
  };
}

export function codexEntryStateClassName(baseClassName, entry, { includeLocked = true } = {}) {
  return [
    baseClassName,
    `is-${entry.displayState}`,
    `stage-${entry.stage}`,
    includeLocked && !entry.caught ? 'locked' : '',
  ].filter(Boolean).join(' ');
}

export function codexStageDotClassName(entry, stage) {
  return [
    'codex-stage-dot',
    stage.value === 4 ? 'is-mega' : '',
    entry.caught && stage.value <= entry.stage ? 'is-lit' : '',
    entry.caught && stage.value === entry.stage ? 'is-current' : '',
  ].filter(Boolean).join(' ');
}

export function codexCardStyle(entry) {
  return {
    '--monster-colour': entry.colour,
    '--monster-soft': entry.soft,
    '--p': entry.progressPct,
  };
}

export function codexProgressRingStyle(entry) {
  return {
    '--ring-color': entry.colour,
    '--p': entry.progressPct,
  };
}
