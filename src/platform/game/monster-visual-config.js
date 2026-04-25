import { MONSTER_ASSET_MANIFEST } from './monster-asset-manifest.js';
import { MONSTER_ASSET_VERSION } from './monsters.js';

export const MONSTER_VISUAL_SCHEMA_VERSION = 1;
export const MONSTER_VISUAL_CONTEXTS = Object.freeze([
  'meadow',
  'codexCard',
  'codexFeature',
  'lightbox',
  'celebrationOverlay',
  'toastPortrait',
]);

export const MONSTER_VISUAL_BASELINE_FIELDS = Object.freeze([
  'facing',
  'scale',
  'offsetX',
  'offsetY',
  'anchorX',
  'anchorY',
  'cropX',
  'cropY',
  'cropWidth',
  'cropHeight',
  'filter',
  'opacity',
]);

export const MONSTER_VISUAL_CONTEXT_FIELDS = Object.freeze([
  'path',
  'motionProfile',
  'offsetX',
  'offsetY',
  'scale',
  'anchorX',
  'anchorY',
  'shadowX',
  'shadowY',
  'shadowScale',
  'shadowOpacity',
  'layer',
  'duration',
  'delay',
  'bob',
  'tilt',
  'footPad',
  'cropX',
  'cropY',
  'cropWidth',
  'cropHeight',
  'filter',
]);

export const MONSTER_VISUAL_PATH_OPTIONS = Object.freeze(['none', 'walk', 'walk-b', 'fly-a', 'fly-b']);
export const MONSTER_VISUAL_MOTION_PROFILE_OPTIONS = Object.freeze(['still', 'egg-breathe', 'walk', 'walk-b', 'fly-a', 'fly-b']);
export const MONSTER_VISUAL_FILTER_OPTIONS = Object.freeze(['none', 'brightness(1.1)']);

const FACING_BY_ASSET = Object.freeze({
  'inklet-b1-0': 'left',     'inklet-b1-1': 'left',     'inklet-b1-2': 'left',
  'inklet-b1-3': 'left',     'inklet-b1-4': 'left',
  'inklet-b2-0': 'left',     'inklet-b2-1': 'left',     'inklet-b2-2': 'left',
  'inklet-b2-3': 'left',     'inklet-b2-4': 'left',
  'glimmerbug-b1-0': 'left', 'glimmerbug-b1-1': 'left', 'glimmerbug-b1-2': 'left',
  'glimmerbug-b1-3': 'left', 'glimmerbug-b1-4': 'left',
  'glimmerbug-b2-0': 'left', 'glimmerbug-b2-1': 'left', 'glimmerbug-b2-2': 'left',
  'glimmerbug-b2-3': 'left', 'glimmerbug-b2-4': 'right',
  'phaeton-b1-0': 'right',   'phaeton-b1-1': 'right',   'phaeton-b1-2': 'right',
  'phaeton-b1-3': 'right',   'phaeton-b1-4': 'right',
  'phaeton-b2-0': 'left',    'phaeton-b2-1': 'left',    'phaeton-b2-2': 'right',
  'phaeton-b2-3': 'left',    'phaeton-b2-4': 'left',
  'vellhorn-b1-0': 'right',  'vellhorn-b1-1': 'left',   'vellhorn-b1-2': 'left',
  'vellhorn-b1-3': 'left',   'vellhorn-b1-4': 'left',
  'vellhorn-b2-0': 'left',   'vellhorn-b2-1': 'left',   'vellhorn-b2-2': 'left',
  'vellhorn-b2-3': 'left',   'vellhorn-b2-4': 'left',
});

const CODEX_FEATURE_FOOT_PAD_BY_ASSET = Object.freeze({
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
  vellhorn: Object.freeze({
    b1: Object.freeze([12, 10, 8, 6, 4]),
    b2: Object.freeze([12, 10, 8, 6, 4]),
  }),
});

const DEFAULT_CONTEXT_VALUES = Object.freeze({
  path: 'none',
  motionProfile: 'still',
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  anchorX: 0.5,
  anchorY: 1,
  shadowX: 0,
  shadowY: 0,
  shadowScale: 1,
  shadowOpacity: 1,
  layer: 0,
  duration: 0,
  delay: 0,
  bob: 0,
  tilt: 0,
  footPad: 0,
  cropX: 0,
  cropY: 0,
  cropWidth: 1,
  cropHeight: 1,
  filter: 'none',
});

const assetByKey = new Map(MONSTER_ASSET_MANIFEST.assets.map((asset) => [asset.key, asset]));

function cloneSerialisable(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberOrDefault(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normaliseFacing(value, fallback = 'left') {
  return value === 'right' ? 'right' : fallback === 'right' ? 'right' : 'left';
}

function normaliseStage(value) {
  return Math.max(0, Math.min(4, Math.floor(Number(value) || 0)));
}

function normaliseContext(value) {
  return MONSTER_VISUAL_CONTEXTS.includes(value) ? value : 'meadow';
}

function parsedAssetKey(assetKey) {
  const match = String(assetKey || '').match(/^(.+)-(b[0-9]+)-([0-9]+)$/);
  if (!match) return null;
  return {
    monsterId: match[1],
    branch: match[2],
    stage: normaliseStage(match[3]),
  };
}

export function buildMonsterAssetKey(monsterId, branch = 'b1', stage = 0) {
  return `${String(monsterId || '').trim()}-${String(branch || 'b1').trim()}-${normaliseStage(stage)}`;
}

export function defaultMonsterMeadowPath(monsterId, stage = 1) {
  if (normaliseStage(stage) === 0) return 'none';
  if (monsterId === 'inklet') return 'walk';
  if (monsterId === 'glimmerbug') return 'fly-a';
  if (monsterId === 'phaeton') return 'fly-b';
  if (monsterId === 'vellhorn') return 'walk-b';
  return 'walk';
}

export function monsterVisualFaceSign(monsterId, branch, stage) {
  const key = buildMonsterAssetKey(monsterId, branch, stage);
  return FACING_BY_ASSET[key] === 'right' ? 1 : -1;
}

function baselineForAsset(asset) {
  const facing = normaliseFacing(FACING_BY_ASSET[asset.key], 'left');
  return {
    facing,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    anchorX: 0.5,
    anchorY: 1,
    cropX: 0,
    cropY: 0,
    cropWidth: 1,
    cropHeight: 1,
    filter: 'none',
    opacity: 1,
  };
}

function codexFootPad(asset) {
  return CODEX_FEATURE_FOOT_PAD_BY_ASSET[asset.monsterId]?.[asset.branch]?.[asset.stage] ?? 0;
}

function contextForAsset(asset, context) {
  const path = context === 'meadow' ? defaultMonsterMeadowPath(asset.monsterId, asset.stage) : 'none';
  const motionProfile = path === 'none'
    ? (asset.stage === 0 ? 'egg-breathe' : 'still')
    : path;
  return {
    ...DEFAULT_CONTEXT_VALUES,
    path,
    motionProfile,
    footPad: context === 'codexFeature' || context === 'lightbox' ? codexFootPad(asset) : 0,
    shadowOpacity: context === 'toastPortrait' ? 0.72 : 1,
    scale: context === 'toastPortrait' ? 0.86 : 1,
  };
}

function reviewStateForAsset(provenance) {
  const reviewed = provenance !== 'generated-neutral-default';
  return {
    contexts: Object.fromEntries(MONSTER_VISUAL_CONTEXTS.map((context) => [
      context,
      {
        reviewed,
        reviewedAt: 0,
        reviewedBy: reviewed ? 'system' : '',
      },
    ])),
  };
}

export function buildBundledMonsterVisualConfig(manifest = MONSTER_ASSET_MANIFEST) {
  return {
    schemaVersion: MONSTER_VISUAL_SCHEMA_VERSION,
    manifestHash: manifest.manifestHash,
    source: 'bundled',
    version: 0,
    assets: Object.fromEntries(manifest.assets.map((asset) => {
      const provenance = (FACING_BY_ASSET[asset.key] || CODEX_FEATURE_FOOT_PAD_BY_ASSET[asset.monsterId])
        ? 'current-tuned-default'
        : 'generated-neutral-default';
      return [
        asset.key,
        {
          assetKey: asset.key,
          monsterId: asset.monsterId,
          branch: asset.branch,
          stage: asset.stage,
          provenance,
          baseline: baselineForAsset(asset),
          contexts: Object.fromEntries(MONSTER_VISUAL_CONTEXTS.map((context) => [
            context,
            contextForAsset(asset, context),
          ])),
          review: reviewStateForAsset(provenance),
        },
      ];
    })),
  };
}

export const BUNDLED_MONSTER_VISUAL_CONFIG = Object.freeze(buildBundledMonsterVisualConfig());

function issue(code, message, details = {}) {
  return {
    code,
    message,
    path: details.path || '',
    assetKey: details.assetKey || '',
    context: details.context || '',
    field: details.field || '',
  };
}

function validateBaseline(assetKey, baseline, errors) {
  if (!isPlainObject(baseline)) {
    errors.push(issue('monster_visual_baseline_required', 'Asset baseline is required.', { assetKey }));
    return;
  }
  for (const field of MONSTER_VISUAL_BASELINE_FIELDS) {
    if (!(field in baseline)) {
      errors.push(issue('monster_visual_field_required', `Baseline field ${field} is required.`, { assetKey, field }));
    }
  }
  if ('facing' in baseline && !['left', 'right'].includes(baseline.facing)) {
    errors.push(issue('monster_visual_field_invalid', 'Facing must be left or right.', { assetKey, field: 'facing' }));
  }
  if ('filter' in baseline) {
    validateAllowedField(assetKey, '', 'filter', baseline.filter, MONSTER_VISUAL_FILTER_OPTIONS, errors);
  }
  for (const field of MONSTER_VISUAL_BASELINE_FIELDS.filter((name) => name !== 'facing' && name !== 'filter')) {
    if (field in baseline && !Number.isFinite(Number(baseline[field]))) {
      errors.push(issue('monster_visual_field_invalid', `Baseline field ${field} must be numeric.`, { assetKey, field }));
    }
  }
  validateUnitField(assetKey, '', 'opacity', baseline.opacity, errors);
  for (const field of ['anchorX', 'anchorY', 'cropX', 'cropY', 'cropWidth', 'cropHeight']) {
    validateUnitField(assetKey, '', field, baseline[field], errors);
  }
  validatePositiveField(assetKey, '', 'scale', baseline.scale, errors);
}

function validateContext(assetKey, context, values, errors) {
  if (!isPlainObject(values)) {
    errors.push(issue('monster_visual_context_required', `Context ${context} is required.`, { assetKey, context }));
    return;
  }
  for (const field of MONSTER_VISUAL_CONTEXT_FIELDS) {
    if (!(field in values)) {
      errors.push(issue('monster_visual_field_required', `Context field ${field} is required.`, { assetKey, context, field }));
    }
  }
  for (const field of MONSTER_VISUAL_CONTEXT_FIELDS.filter((name) => !['path', 'motionProfile', 'filter'].includes(name))) {
    if (field in values && !Number.isFinite(Number(values[field]))) {
      errors.push(issue('monster_visual_field_invalid', `Context field ${field} must be numeric.`, { assetKey, context, field }));
    }
  }
  if ('path' in values) {
    validateAllowedField(assetKey, context, 'path', values.path, MONSTER_VISUAL_PATH_OPTIONS, errors);
  }
  if ('motionProfile' in values) {
    validateAllowedField(assetKey, context, 'motionProfile', values.motionProfile, MONSTER_VISUAL_MOTION_PROFILE_OPTIONS, errors);
  }
  if ('filter' in values) {
    validateAllowedField(assetKey, context, 'filter', values.filter, MONSTER_VISUAL_FILTER_OPTIONS, errors);
  }
  validateUnitField(assetKey, context, 'shadowOpacity', values.shadowOpacity, errors);
  validatePositiveField(assetKey, context, 'scale', values.scale, errors);
  validatePositiveField(assetKey, context, 'shadowScale', values.shadowScale, errors);
  for (const field of ['anchorX', 'anchorY', 'cropX', 'cropY', 'cropWidth', 'cropHeight']) {
    validateUnitField(assetKey, context, field, values[field], errors);
  }

  // Gate: the celebrationOverlay anchor is not yet propagated onto the
  // inner `.monster-celebration-art` transform-origin. The egg-crack
  // wobble and pop rules hard-pin `transform-origin: 50% 80%`, so any
  // non-default anchor on this context would diverge the wrapper pivot
  // from the art pivot and shift the sprite off-axis during the CRACK
  // peak. Reject non-default anchors until the propagation follow-up
  // lands. See docs/plans/2026-04-25-002-fix-celebration-sprite-centring-plan.md
  // (Deferred to Follow-Up Work).
  if (context === 'celebrationOverlay') {
    if ('anchorX' in values && Number.isFinite(Number(values.anchorX)) && Number(values.anchorX) !== 0.5) {
      errors.push(issue(
        'monster_visual_celebration_anchor_locked',
        'celebrationOverlay.anchorX must stay at 0.5 until the animation pivot propagation follow-up lands (see docs/plans/2026-04-25-002-fix-celebration-sprite-centring-plan.md).',
        { assetKey, context, field: 'anchorX' },
      ));
    }
    if ('anchorY' in values && Number.isFinite(Number(values.anchorY)) && Number(values.anchorY) !== 1) {
      errors.push(issue(
        'monster_visual_celebration_anchor_locked',
        'celebrationOverlay.anchorY must stay at 1 until the animation pivot propagation follow-up lands (see docs/plans/2026-04-25-002-fix-celebration-sprite-centring-plan.md).',
        { assetKey, context, field: 'anchorY' },
      ));
    }
  }
}

function validateAllowedField(assetKey, context, field, value, allowedValues, errors) {
  if (allowedValues.includes(value)) return;
  errors.push(issue('monster_visual_field_invalid', `${field} has an unsupported value.`, { assetKey, context, field }));
}

function validateUnitField(assetKey, context, field, value, errors) {
  if (!Number.isFinite(Number(value))) return;
  const numeric = Number(value);
  if (numeric < 0 || numeric > 1) {
    errors.push(issue('monster_visual_field_out_of_range', `${field} must be between 0 and 1.`, { assetKey, context, field }));
  }
}

function validatePositiveField(assetKey, context, field, value, errors) {
  if (!Number.isFinite(Number(value))) return;
  if (Number(value) <= 0) {
    errors.push(issue('monster_visual_field_out_of_range', `${field} must be greater than 0.`, { assetKey, context, field }));
  }
}

function validateReviewState(assetKey, entry, errors) {
  const reviewContexts = entry?.review?.contexts;
  if (!isPlainObject(reviewContexts)) {
    errors.push(issue('monster_visual_review_required', 'Review state is required.', { assetKey }));
    return;
  }
  for (const context of MONSTER_VISUAL_CONTEXTS) {
    if (reviewContexts[context]?.reviewed !== true) {
      errors.push(issue('monster_visual_review_required', `Context ${context} must be reviewed.`, { assetKey, context }));
    }
  }
}

export function validateMonsterVisualConfigForPublish(config, { manifest = MONSTER_ASSET_MANIFEST } = {}) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(config)) {
    return {
      ok: false,
      errors: [issue('monster_visual_config_required', 'Monster visual config is required.')],
      warnings,
    };
  }
  if (Number(config.schemaVersion) !== MONSTER_VISUAL_SCHEMA_VERSION) {
    errors.push(issue('monster_visual_schema_version_invalid', 'Monster visual config schema version is invalid.', { field: 'schemaVersion' }));
  }
  if (config.manifestHash !== manifest.manifestHash) {
    errors.push(issue('monster_visual_manifest_mismatch', 'Monster visual config does not match the current asset manifest.', { field: 'manifestHash' }));
  }
  if (!isPlainObject(config.assets)) {
    errors.push(issue('monster_visual_assets_required', 'Monster visual config assets map is required.', { field: 'assets' }));
    return { ok: false, errors, warnings };
  }

  for (const asset of manifest.assets) {
    const entry = config.assets[asset.key];
    if (!isPlainObject(entry)) {
      errors.push(issue('monster_visual_asset_required', `Visual config for ${asset.key} is required.`, { assetKey: asset.key }));
      continue;
    }
    validateBaseline(asset.key, entry.baseline, errors);
    for (const context of MONSTER_VISUAL_CONTEXTS) {
      validateContext(asset.key, context, entry.contexts?.[context], errors);
    }
    validateReviewState(asset.key, entry, errors);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function normaliseMonsterVisualRuntimeConfig(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : null;
  if (!raw) return null;

  const rawConfig = isPlainObject(raw.config) ? raw.config : raw;
  const schemaVersion = Number(raw.schemaVersion ?? rawConfig.schemaVersion);
  const configSchemaVersion = Number(rawConfig.schemaVersion ?? schemaVersion);
  if (schemaVersion !== MONSTER_VISUAL_SCHEMA_VERSION || configSchemaVersion !== MONSTER_VISUAL_SCHEMA_VERSION) {
    return null;
  }
  if (!isPlainObject(rawConfig.assets)) return null;

  const manifestHash = typeof raw.manifestHash === 'string' && raw.manifestHash
    ? raw.manifestHash
    : (typeof rawConfig.manifestHash === 'string' ? rawConfig.manifestHash : '');
  const config = {
    ...cloneSerialisable(rawConfig),
    schemaVersion,
    manifestHash: rawConfig.manifestHash || manifestHash,
  };

  return {
    schemaVersion,
    manifestHash,
    manifestHashMismatch: Boolean(manifestHash && manifestHash !== MONSTER_ASSET_MANIFEST.manifestHash),
    publishedVersion: Math.max(0, numberOrDefault(raw.publishedVersion ?? config.version, 0)),
    publishedAt: Math.max(0, numberOrDefault(raw.publishedAt, 0)),
    config,
  };
}

function entryRenderable(entry, context) {
  return isPlainObject(entry)
    && isPlainObject(entry.baseline)
    && isPlainObject(entry.contexts?.[context])
    && ['left', 'right'].includes(entry.baseline.facing);
}

function chooseSize(sizes, preferredSize) {
  const available = Array.isArray(sizes) && sizes.length ? sizes : [320];
  const preferred = numberOrDefault(preferredSize, 320);
  return available.reduce((best, size) => (
    Math.abs(size - preferred) < Math.abs(best - preferred) ? size : best
  ), available[0]);
}

function withAssetVersion(src, versioned) {
  return versioned ? `${src}?v=${MONSTER_ASSET_VERSION}` : src;
}

export function monsterVisualAssetPath(assetKey, size = 320, { versioned = false } = {}) {
  const parsed = parsedAssetKey(assetKey);
  const asset = assetByKey.get(assetKey);
  const resolvedSize = chooseSize(asset?.sizes, size);
  const src = asset?.srcBySize?.[String(resolvedSize)]
    || (parsed ? `./assets/monsters/${parsed.monsterId}/${parsed.branch}/${parsed.monsterId}-${parsed.branch}-${parsed.stage}.${resolvedSize}.webp` : '');
  return withAssetVersion(src, versioned);
}

export function monsterVisualAssetSources(assetKey, {
  preferredSize = 320,
  versioned = true,
} = {}) {
  const asset = assetByKey.get(assetKey);
  const sizes = Array.isArray(asset?.sizes) && asset.sizes.length ? asset.sizes : [320, 640, 1280];
  const src = monsterVisualAssetPath(assetKey, preferredSize, { versioned });
  const srcSet = sizes
    .map((size) => `${monsterVisualAssetPath(assetKey, size, { versioned })} ${size}w`)
    .join(', ');
  return { src, srcSet, sizes };
}

export function resolveMonsterVisual({
  monsterId,
  branch = 'b1',
  stage = 0,
  context = 'meadow',
  config = null,
  preferredSize = 640,
} = {}) {
  const assetKey = buildMonsterAssetKey(monsterId, branch, stage);
  const resolvedContext = normaliseContext(context);
  const bundledEntry = BUNDLED_MONSTER_VISUAL_CONFIG.assets[assetKey];
  const candidateEntry = config?.assets?.[assetKey];
  const useCandidate = config && entryRenderable(candidateEntry, resolvedContext);
  const entry = useCandidate ? candidateEntry : bundledEntry;
  const baseline = entry?.baseline || baselineForAsset({
    key: assetKey,
    monsterId,
    branch,
    stage: normaliseStage(stage),
  });
  const contextValues = entry?.contexts?.[resolvedContext] || contextForAsset({
    key: assetKey,
    monsterId,
    branch,
    stage: normaliseStage(stage),
  }, resolvedContext);
  const sources = monsterVisualAssetSources(assetKey, { preferredSize });
  const facing = normaliseFacing(baseline.facing, 'left');

  return {
    assetKey,
    monsterId: entry?.monsterId || monsterId,
    branch: entry?.branch || branch,
    stage: normaliseStage(entry?.stage ?? stage),
    context: resolvedContext,
    source: useCandidate ? 'config' : 'bundled',
    ...cloneSerialisable(baseline),
    ...cloneSerialisable(contextValues),
    facing,
    faceSign: facing === 'left' ? -1 : 1,
    src: sources.src,
    srcSet: sources.srcSet,
    sizes: sources.sizes,
  };
}
