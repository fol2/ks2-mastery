export const CODEX_FEATURE_MAX_SIZE_BY_SPECIES = Object.freeze({
  inklet: 640,
  glimmerbug: 670,
  phaeton: 700,
});

export const CODEX_STAGE_SCALE = Object.freeze([0.36, 0.52, 0.68, 0.84, 1]);

export const CODEX_REFERENCE_STAGE_SIZES = Object.freeze(
  CODEX_STAGE_SCALE.map((scale) => Math.round(CODEX_FEATURE_MAX_SIZE_BY_SPECIES.phaeton * scale)),
);
