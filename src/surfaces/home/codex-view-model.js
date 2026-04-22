export const CODEX_STAGES = Object.freeze([
  { value: 0, label: 'E', name: 'Egg' },
  { value: 1, label: 'K', name: 'Kid' },
  { value: 2, label: 'T', name: 'Teen' },
  { value: 3, label: 'A', name: 'Adult' },
  { value: 4, label: 'M', name: 'Mega' },
]);

const FEATURE_MAX_SIZE_BY_SPECIES = Object.freeze({
  inklet: 640,
  glimmerbug: 670,
  phaeton: 700,
});

const FEATURE_STAGE_SCALE = Object.freeze([0.36, 0.52, 0.68, 0.84, 1]);

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
  const maxSize = FEATURE_MAX_SIZE_BY_SPECIES[entry.id] || 760;
  const stage = entry.caught ? Math.max(0, Math.min(4, Number(entry.stage) || 0)) : 0;
  const visualSize = Math.round(maxSize * (FEATURE_STAGE_SCALE[stage] || FEATURE_STAGE_SCALE[0]));
  const footPad = entry.displayState === 'fresh'
    ? 0
    : FEATURE_FOOT_PAD_BY_ASSET[entry.id]?.[entry.branch]?.[stage] ?? 0;
  const footShift = Math.round(visualSize * (footPad / FEATURE_FOOT_PAD_SOURCE_SIZE));
  const rise = entry.displayState === 'monster'
    ? Math.min(155, 52 + (entry.stage * 24) + (entry.id === 'phaeton' ? 20 : 0))
    : 0;

  return {
    '--codex-feature-size': `${visualSize}px`,
    '--codex-feature-orbit-size': `${Math.min(920, Math.round(visualSize * 1.14))}px`,
    '--codex-feature-halo-y': `${Math.round(visualSize / 3)}px`,
    '--codex-feature-halo-lift': `${Math.round(rise / 2)}px`,
    '--codex-feature-shadow-width': `${Math.min(640, Math.round(visualSize * 0.86))}px`,
    '--codex-feature-shadow-y': `${Math.round(Math.max(120, visualSize * 0.34))}px`,
    '--codex-feature-rise': `${rise}px`,
    '--codex-feature-foot-shift': `${footShift}px`,
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
