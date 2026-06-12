import {
  DIRECT_STAGE_THRESHOLDS,
  MONSTERS,
  MONSTERS_BY_SUBJECT,
  PHAETON_STAGE_THRESHOLDS,
} from './monsters.js';

export const REWARD_TRACK_PROGRESS_MODES = Object.freeze(['parallel', 'sequentialAfter']);
export const DEFAULT_REWARD_TRACK_PROGRESS_MODE = 'parallel';
export const DEFAULT_REWARD_TRACK_THRESHOLD_TEMPLATE = 'direct';

const HERO_EXPOSURE_STATE_ALIASES = Object.freeze({
  rolloutFlagged: 'rollout-flagged',
  rollout_flagged: 'rollout-flagged',
  rollout: 'rollout-flagged',
  flagged: 'rollout-flagged',
  staged: 'scheduled',
});

export const HERO_EXPOSURE_STATES = Object.freeze([
  'visible',
  'hidden',
  'scheduled',
  'rollout-flagged',
]);

export const HERO_EXPOSURE_SURFACES = Object.freeze([
  'heroCamp',
  'heroQuest',
  'codex',
  'subjectSetup',
]);

export const DEFAULT_HERO_EXPOSURE = Object.freeze({
  state: 'visible',
  surfaces: HERO_EXPOSURE_SURFACES,
  scheduledAt: 0,
  rolloutFlag: '',
  previewAllowed: true,
});

const HERO_EXPOSURE_STATE_SET = new Set(HERO_EXPOSURE_STATES);
const HERO_EXPOSURE_SURFACE_SET = new Set(HERO_EXPOSURE_SURFACES);

export const SPELLING_REWARD_TRACK_MONSTER_IDS = Object.freeze([...MONSTERS_BY_SUBJECT.spelling]);

export const REWARD_TRACK_THRESHOLD_TEMPLATES = Object.freeze({
  direct: Object.freeze({
    id: 'direct',
    label: 'Direct staged thresholds',
    thresholds: Object.freeze([...DIRECT_STAGE_THRESHOLDS]),
  }),
  aggregate: Object.freeze({
    id: 'aggregate',
    label: 'Aggregate staged thresholds',
    thresholds: Object.freeze([...PHAETON_STAGE_THRESHOLDS]),
  }),
});

function freezeLegacyTrack(track) {
  const heroExposure = normaliseHeroExposure(track.heroExposure);
  return Object.freeze({
    ...track,
    labels: Object.freeze({ ...(track.labels || {}) }),
    sourceMonsterIds: Object.freeze([...(track.sourceMonsterIds || [])]),
    heroExposure: Object.freeze({
      ...heroExposure,
      surfaces: Object.freeze([...heroExposure.surfaces]),
    }),
  });
}

export const LEGACY_SPELLING_REWARD_TRACKS = Object.freeze([
  freezeLegacyTrack({
    id: 'spelling-core-inklet',
    poolId: 'core',
    monsterId: 'inklet',
    progressKey: 'inklet',
    sourceMonsterIds: ['inklet'],
    progressionMode: 'parallel',
    thresholdTemplate: 'direct',
    active: true,
    labels: {
      title: 'Core Inklet',
      shortLabel: 'Inklet',
      description: 'Compatibility reward track for existing Years 3-4 spelling progress.',
    },
    sourceNote: 'Preserves the existing Inklet monster-codex progress key.',
    sortIndex: 0,
  }),
  freezeLegacyTrack({
    id: 'spelling-core-glimmerbug',
    poolId: 'core',
    monsterId: 'glimmerbug',
    progressKey: 'glimmerbug',
    sourceMonsterIds: ['glimmerbug'],
    progressionMode: 'parallel',
    thresholdTemplate: 'direct',
    active: true,
    labels: {
      title: 'Core Glimmerbug',
      shortLabel: 'Glimmerbug',
      description: 'Compatibility reward track for existing Years 5-6 spelling progress.',
    },
    sourceNote: 'Preserves the existing Glimmerbug monster-codex progress key.',
    sortIndex: 1,
  }),
  freezeLegacyTrack({
    id: 'spelling-core-phaeton',
    poolId: 'core',
    monsterId: 'phaeton',
    progressKey: 'phaeton',
    sourceMonsterIds: ['inklet', 'glimmerbug'],
    progressionMode: 'parallel',
    thresholdTemplate: 'aggregate',
    active: true,
    labels: {
      title: 'Core Phaeton',
      shortLabel: 'Phaeton',
      description: 'Compatibility aggregate reward track over existing core spelling progress.',
    },
    sourceNote: 'Preserves the existing Phaeton aggregate derived from Inklet and Glimmerbug.',
    sortIndex: 2,
  }),
  freezeLegacyTrack({
    id: 'spelling-extra-vellhorn',
    poolId: 'extra',
    monsterId: 'vellhorn',
    progressKey: 'vellhorn',
    sourceMonsterIds: ['vellhorn'],
    progressionMode: 'parallel',
    thresholdTemplate: 'direct',
    compatibilityMode: 'legacy',
    active: true,
    labels: {
      title: 'Extra Vellhorn',
      shortLabel: 'Vellhorn',
      description: 'Compatibility reward track for existing Extra spelling progress.',
    },
    sourceNote: 'Preserves the existing Vellhorn monster-codex progress key and direct staged thresholds.',
    sortIndex: 3,
  }),
]);

export const LEGACY_SPELLING_REWARD_TRACK_IDS_BY_POOL = Object.freeze(
  LEGACY_SPELLING_REWARD_TRACKS.reduce((output, track) => {
    const existing = output[track.poolId] || [];
    return {
      ...output,
      [track.poolId]: Object.freeze([...existing, track.id]),
    };
  }, {}),
);

const REWARD_TRACK_PROGRESS_MODE_SET = new Set(REWARD_TRACK_PROGRESS_MODES);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normaliseString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function normaliseIdentifier(value, fallback = '') {
  return normaliseString(value, fallback).toLowerCase();
}

function normaliseTimestamp(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function normaliseHeroExposureState(value, fallback = DEFAULT_HERO_EXPOSURE.state) {
  const raw = normaliseString(value, fallback);
  const aliased = HERO_EXPOSURE_STATE_ALIASES[raw] || raw;
  return HERO_EXPOSURE_STATE_SET.has(aliased) ? aliased : fallback;
}

function normaliseHeroExposureSurfaces(value, fallback = DEFAULT_HERO_EXPOSURE.surfaces) {
  const hasExplicitValue = Array.isArray(value) || typeof value === 'string';
  const source = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? value.split(/[\n,]+/) : fallback);
  const seen = new Set();
  const output = [];
  for (const entry of source) {
    const surface = normaliseString(entry);
    if (!HERO_EXPOSURE_SURFACE_SET.has(surface) || seen.has(surface)) continue;
    seen.add(surface);
    output.push(surface);
  }
  if (output.length) return output;
  return hasExplicitValue ? [] : [...DEFAULT_HERO_EXPOSURE.surfaces];
}

function heroExposureEnvFlagEnabled(env, flagName) {
  const name = normaliseString(flagName);
  if (!name) return false;
  const value = isPlainObject(env) ? env[name] : undefined;
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

export function isKnownHeroExposureState(value) {
  const raw = normaliseString(value);
  const aliased = HERO_EXPOSURE_STATE_ALIASES[raw] || raw;
  return HERO_EXPOSURE_STATE_SET.has(aliased);
}

export function isKnownHeroExposureSurface(value) {
  return HERO_EXPOSURE_SURFACE_SET.has(normaliseString(value));
}

export function normaliseHeroExposure(rawValue = null, fallback = null) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const safeFallback = isPlainObject(fallback) ? fallback : DEFAULT_HERO_EXPOSURE;
  return {
    state: normaliseHeroExposureState(raw.state, normaliseHeroExposureState(safeFallback.state)),
    surfaces: normaliseHeroExposureSurfaces(raw.surfaces, safeFallback.surfaces),
    scheduledAt: normaliseTimestamp(raw.scheduledAt ?? safeFallback.scheduledAt, 0),
    rolloutFlag: normaliseString(raw.rolloutFlag, safeFallback.rolloutFlag || ''),
    previewAllowed: raw.previewAllowed === false ? false : safeFallback.previewAllowed !== false,
  };
}

export function heroExposureSurfaceEnabled(exposure, surface) {
  const safe = normaliseHeroExposure(exposure);
  return safe.surfaces.includes(surface);
}

export function isHeroExposureVisible(exposure, {
  surface = 'codex',
  now = Date.now(),
  env = {},
} = {}) {
  const safe = normaliseHeroExposure(exposure);
  if (!heroExposureSurfaceEnabled(safe, surface)) return false;
  if (safe.state === 'hidden') return false;
  if (safe.state === 'visible') return true;
  if (safe.state === 'scheduled') {
    return safe.scheduledAt > 0 && safe.scheduledAt <= normaliseTimestamp(now, Date.now());
  }
  if (safe.state === 'rollout-flagged') {
    return heroExposureEnvFlagEnabled(env, safe.rolloutFlag);
  }
  return false;
}

export function heroExposureStatus(exposure, options = {}) {
  const safe = normaliseHeroExposure(exposure);
  return {
    ...safe,
    learnerVisible: isHeroExposureVisible(safe, options),
  };
}

function isValidStableId(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{1,63}$/.test(value);
}

function uniqueStrings(values) {
  const source = Array.isArray(values)
    ? values
    : String(values ?? '').split(/[\n,]+/);
  const seen = new Set();
  const output = [];
  for (const value of source) {
    const next = normaliseIdentifier(value);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    output.push(next);
  }
  return output;
}

function normaliseThresholdList(rawValue) {
  if (Array.isArray(rawValue)) return rawValue.map((entry) => Number(entry));
  if (!isPlainObject(rawValue)) return [];

  return Object.entries(rawValue)
    .map(([key, value]) => {
      const match = String(key).match(/\d+/);
      return {
        order: match ? Number(match[0]) : Number.MAX_SAFE_INTEGER,
        value: Number(value),
      };
    })
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.value);
}

function normaliseLabels(rawValue = {}, fallback = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const safeFallback = isPlainObject(fallback) ? fallback : {};
  return {
    title: normaliseString(raw.title, safeFallback.title),
    shortLabel: normaliseString(raw.shortLabel, safeFallback.shortLabel),
    description: normaliseString(raw.description, safeFallback.description),
  };
}

function normaliseDependencyApproval(rawValue = {}, fallback = {}, approvedFallback = false) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const safeFallback = isPlainObject(fallback) ? fallback : {};
  const hasApprovedValue = Object.prototype.hasOwnProperty.call(raw, 'approved');
  return {
    approved: hasApprovedValue ? raw.approved === true : (safeFallback.approved === true || approvedFallback === true),
    reason: normaliseString(raw.reason, safeFallback.reason),
    approvedBy: normaliseString(raw.approvedBy, safeFallback.approvedBy),
    approvedAt: normaliseTimestamp(raw.approvedAt ?? safeFallback.approvedAt, 0),
  };
}

function issue(severity, code, path, message) {
  return { severity, code, path, message };
}

function pathFor(index, field = '') {
  const prefix = `rewardTracks[${index}]`;
  return field ? `${prefix}.${field}` : prefix;
}

function valueFromPoolWordCounts(poolWordCounts, poolId) {
  if (poolWordCounts instanceof Map) return poolWordCounts.get(poolId);
  if (isPlainObject(poolWordCounts)) return poolWordCounts[poolId];
  return undefined;
}

function learnerVisiblePoolIdsFrom(pools = []) {
  return new Set((Array.isArray(pools) ? pools : [])
    .filter((pool) => pool?.active !== false && !pool?.retired && pool?.visibility?.state === 'visible')
    .map((pool) => pool.id)
    .filter(Boolean));
}

export function isValidRewardTrackId(value) {
  return isValidStableId(value);
}

export function isValidRewardTrackPoolId(value) {
  return isValidStableId(value);
}

export function normaliseRewardTrackConfig(rawValue = {}, {
  existingTrack = null,
  defaultPoolId = '',
} = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const existing = isPlainObject(existingTrack) ? existingTrack : {};
  const activeProvided = Object.prototype.hasOwnProperty.call(raw, 'active');
  const retired = Boolean(raw.retired || existing.retired);
  const dependencyApproval = raw.dependencyApproval || existing.dependencyApproval || raw.crossPoolDependencyApproved === true
    ? normaliseDependencyApproval(
      raw.dependencyApproval,
      existing.dependencyApproval,
      raw.crossPoolDependencyApproved === true || existing.crossPoolDependencyApproved === true,
    )
    : null;

  return {
    id: normaliseIdentifier(raw.id || raw.rewardTrackId || raw.trackId, existing.id || existing.rewardTrackId || existing.trackId),
    poolId: normaliseIdentifier(raw.poolId || raw.spellingPool, existing.poolId || existing.spellingPool || defaultPoolId),
    monsterId: normaliseIdentifier(raw.monsterId, existing.monsterId),
    progressionMode: normaliseString(
      raw.progressionMode,
      existing.progressionMode || DEFAULT_REWARD_TRACK_PROGRESS_MODE,
    ),
    thresholdTemplate: normaliseIdentifier(
      raw.thresholdTemplate,
      existing.thresholdTemplate || DEFAULT_REWARD_TRACK_THRESHOLD_TEMPLATE,
    ),
    thresholdOverrides: normaliseThresholdList(
      Object.prototype.hasOwnProperty.call(raw, 'thresholdOverrides')
        ? raw.thresholdOverrides
        : (Object.prototype.hasOwnProperty.call(raw, 'thresholds') ? raw.thresholds : existing.thresholdOverrides),
    ),
    compatibilityMode: normaliseIdentifier(raw.compatibilityMode, existing.compatibilityMode),
    progressKey: normaliseIdentifier(raw.progressKey || raw.legacyProgressKey, existing.progressKey || existing.legacyProgressKey),
    sourceMonsterIds: uniqueStrings(raw.sourceMonsterIds || raw.legacySourceMonsterIds || existing.sourceMonsterIds || existing.legacySourceMonsterIds),
    active: retired ? false : (activeProvided ? raw.active !== false : existing.active !== false),
    retired,
    ...(raw.retirement || existing.retirement ? { retirement: raw.retirement || existing.retirement } : {}),
    heroExposure: normaliseHeroExposure(raw.heroExposure || raw.exposure, existing.heroExposure || existing.exposure),
    labels: normaliseLabels(raw.labels, existing.labels),
    sequentialAfter: normaliseIdentifier(
      raw.sequentialAfter || raw.afterTrackId,
      existing.sequentialAfter || existing.afterTrackId,
    ),
    prerequisites: uniqueStrings(raw.prerequisites || existing.prerequisites),
    ...(dependencyApproval ? { dependencyApproval } : {}),
    sourceNote: normaliseString(raw.sourceNote, existing.sourceNote),
    sortIndex: Number.isInteger(Number(raw.sortIndex)) && Number(raw.sortIndex) >= 0
      ? Number(raw.sortIndex)
      : (Number.isInteger(Number(existing.sortIndex)) ? Number(existing.sortIndex) : 0),
  };
}

export function normaliseRewardTrackCollection(rawValue = []) {
  return (Array.isArray(rawValue) ? rawValue : [])
    .map((entry, index) => normaliseRewardTrackConfig(entry, { existingTrack: null, defaultPoolId: '' }))
    .map((track, index) => ({
      ...track,
      sortIndex: Number.isInteger(Number(track.sortIndex)) && Number(track.sortIndex) >= 0 ? Number(track.sortIndex) : index,
    }));
}

export function thresholdsForRewardTrack(track) {
  if (Array.isArray(track?.thresholdOverrides) && track.thresholdOverrides.length) {
    return [...track.thresholdOverrides];
  }
  const template = REWARD_TRACK_THRESHOLD_TEMPLATES[track?.thresholdTemplate || DEFAULT_REWARD_TRACK_THRESHOLD_TEMPLATE]
    || REWARD_TRACK_THRESHOLD_TEMPLATES[DEFAULT_REWARD_TRACK_THRESHOLD_TEMPLATE];
  return [...template.thresholds];
}

function cloneRewardTrack(track) {
  return {
    ...track,
    labels: { ...(track.labels || {}) },
    sourceMonsterIds: [...(track.sourceMonsterIds || [])],
    heroExposure: {
      ...(track.heroExposure || DEFAULT_HERO_EXPOSURE),
      surfaces: [...(track.heroExposure?.surfaces || DEFAULT_HERO_EXPOSURE.surfaces)],
    },
    ...(Array.isArray(track.thresholdOverrides) ? { thresholdOverrides: [...track.thresholdOverrides] } : {}),
  };
}

export function defaultSpellingRewardTracks() {
  return LEGACY_SPELLING_REWARD_TRACKS.map(cloneRewardTrack);
}

export function legacySpellingRewardTrackIdsForPool(poolId) {
  return [...(LEGACY_SPELLING_REWARD_TRACK_IDS_BY_POOL[normaliseIdentifier(poolId)] || [])];
}

export function spellingRewardTrackForMonster(monsterId, rewardTracks = LEGACY_SPELLING_REWARD_TRACKS) {
  const safeMonsterId = normaliseIdentifier(monsterId);
  if (!safeMonsterId) return null;
  const tracks = Array.isArray(rewardTracks) ? rewardTracks : [];
  return tracks
    .map((track) => normaliseRewardTrackConfig(track))
    .find((track) => track.monsterId === safeMonsterId) || null;
}

export function spellingRewardTrackIdForMonster(monsterId, rewardTracks = LEGACY_SPELLING_REWARD_TRACKS) {
  return spellingRewardTrackForMonster(monsterId, rewardTracks)?.id || '';
}

export function progressKeyForRewardTrack(track) {
  const normalised = normaliseRewardTrackConfig(track);
  return normalised.progressKey || normalised.monsterId;
}

export function sourceMonsterIdsForRewardTrack(track) {
  const normalised = normaliseRewardTrackConfig(track);
  const sourceIds = uniqueStrings(normalised.sourceMonsterIds);
  return sourceIds.length ? sourceIds : [progressKeyForRewardTrack(normalised)].filter(Boolean);
}

export function rewardTracksVisibleForHeroSurface(rewardTracks = LEGACY_SPELLING_REWARD_TRACKS, {
  surface = 'codex',
  now = Date.now(),
  env = {},
  includeAdminPreview = false,
} = {}) {
  return normaliseRewardTrackCollection(rewardTracks)
    .filter((track) => {
      if (track.active === false || track.retired) return false;
      const status = heroExposureStatus(track.heroExposure, { surface, now, env });
      return status.learnerVisible
        || (
          includeAdminPreview === true
          && status.previewAllowed !== false
          && status.surfaces.includes(surface)
        );
    });
}

export function validateRewardTrackCollection(rawTracks = [], {
  pools = [],
  poolWordCounts = null,
  learnerVisiblePoolIds = null,
  allowedMonsterIds = Object.keys(MONSTERS),
  enforceThresholdsForHiddenPools = false,
} = {}) {
  const tracks = normaliseRewardTrackCollection(rawTracks);
  const rawTrackValues = Array.isArray(rawTracks) ? rawTracks : [];
  const errors = [];
  const warnings = [];
  const byId = new Map();
  const poolsById = new Map((Array.isArray(pools) ? pools : []).map((pool) => [pool.id, pool]));
  const allowedMonsterSet = new Set(Array.isArray(allowedMonsterIds) ? allowedMonsterIds : Object.keys(MONSTERS));
  const visiblePools = learnerVisiblePoolIds instanceof Set
    ? learnerVisiblePoolIds
    : learnerVisiblePoolIdsFrom(pools);

  tracks.forEach((track, index) => {
    const rawTrack = isPlainObject(rawTrackValues[index]) ? rawTrackValues[index] : {};
    const rawHeroExposure = isPlainObject(rawTrack.heroExposure)
      ? rawTrack.heroExposure
      : (isPlainObject(rawTrack.exposure) ? rawTrack.exposure : null);
    const rawHeroExposureSurfaces = Array.isArray(rawHeroExposure?.surfaces)
      ? rawHeroExposure.surfaces.map((surface) => String(surface || '').trim()).filter(Boolean)
      : (typeof rawHeroExposure?.surfaces === 'string'
          ? rawHeroExposure.surfaces.split(/[\n,]+/).map((surface) => surface.trim()).filter(Boolean)
          : []);
    if (!track.id || !isValidRewardTrackId(track.id)) {
      errors.push(issue('error', 'invalid_reward_track_id', pathFor(index, 'id'), 'Reward track id must be a stable lowercase id.'));
    } else if (byId.has(track.id)) {
      errors.push(issue('error', 'duplicate_reward_track', pathFor(index, 'id'), `Duplicate reward track id "${track.id}".`));
    } else {
      byId.set(track.id, track);
    }

    if (!track.poolId || !isValidRewardTrackPoolId(track.poolId)) {
      errors.push(issue('error', 'invalid_reward_pool_id', pathFor(index, 'poolId'), `Reward track "${track.id || index + 1}" must target a stable pool id.`));
    } else if (pools.length && !poolsById.has(track.poolId)) {
      errors.push(issue('error', 'reward_pool_missing', pathFor(index, 'poolId'), `Reward track "${track.id}" points at missing pool "${track.poolId}".`));
    }

    if (!track.monsterId) {
      errors.push(issue('error', 'reward_monster_required', pathFor(index, 'monsterId'), `Reward track "${track.id || index + 1}" must bind to a monster.`));
    } else if (!MONSTERS[track.monsterId]) {
      errors.push(issue('error', 'reward_monster_missing', pathFor(index, 'monsterId'), `Reward track "${track.id}" points at unknown monster "${track.monsterId}".`));
    } else if (!allowedMonsterSet.has(track.monsterId)) {
      errors.push(issue('error', 'reward_monster_not_allowed', pathFor(index, 'monsterId'), `Reward track "${track.id}" cannot bind monster "${track.monsterId}" for this subject.`));
    }

    if (!REWARD_TRACK_PROGRESS_MODE_SET.has(track.progressionMode)) {
      errors.push(issue('error', 'invalid_reward_progression_mode', pathFor(index, 'progressionMode'), `Reward track "${track.id || index + 1}" has an invalid progression mode.`));
    }

    if (!REWARD_TRACK_THRESHOLD_TEMPLATES[track.thresholdTemplate]) {
      errors.push(issue('error', 'invalid_reward_threshold_template', pathFor(index, 'thresholdTemplate'), `Reward track "${track.id || index + 1}" uses an unknown threshold template.`));
    }

    const thresholds = thresholdsForRewardTrack(track);
    if (!thresholds.length) {
      errors.push(issue('error', 'reward_threshold_required', pathFor(index, 'thresholdOverrides'), `Reward track "${track.id || index + 1}" must define at least one threshold.`));
    }
    thresholds.forEach((threshold, thresholdIndex) => {
      if (!Number.isInteger(threshold) || threshold <= 0) {
        errors.push(issue('error', 'invalid_reward_threshold', pathFor(index, `thresholdOverrides[${thresholdIndex}]`), `Reward track "${track.id || index + 1}" thresholds must be positive whole numbers.`));
      }
      if (thresholdIndex > 0 && Number.isFinite(threshold) && Number.isFinite(thresholds[thresholdIndex - 1]) && threshold <= thresholds[thresholdIndex - 1]) {
        errors.push(issue('error', 'invalid_reward_threshold', pathFor(index, `thresholdOverrides[${thresholdIndex}]`), `Reward track "${track.id || index + 1}" thresholds must increase strictly.`));
      }
    });

    (Array.isArray(track.sourceMonsterIds) ? track.sourceMonsterIds : []).forEach((sourceMonsterId, sourceIndex) => {
      if (!MONSTERS[sourceMonsterId]) {
        errors.push(issue(
          'error',
          'reward_source_monster_missing',
          pathFor(index, `sourceMonsterIds[${sourceIndex}]`),
          `Reward track "${track.id || index + 1}" points at unknown source monster "${sourceMonsterId}".`,
        ));
      } else if (!allowedMonsterSet.has(sourceMonsterId)) {
        errors.push(issue(
          'error',
          'reward_source_monster_not_allowed',
          pathFor(index, `sourceMonsterIds[${sourceIndex}]`),
          `Reward track "${track.id || index + 1}" cannot source monster "${sourceMonsterId}" for this subject.`,
        ));
      }
    });

    const countShouldBlock = track.active !== false
      && (enforceThresholdsForHiddenPools || visiblePools.has(track.poolId));
    const poolWordCount = valueFromPoolWordCounts(poolWordCounts, track.poolId);
    if (countShouldBlock && Number.isFinite(Number(poolWordCount)) && thresholds.length) {
      const maxThreshold = Math.max(...thresholds.filter((entry) => Number.isFinite(entry)));
      if (Number.isFinite(maxThreshold) && maxThreshold > Number(poolWordCount)) {
        const severity = track.compatibilityMode === 'legacy' ? 'warn' : 'error';
        const collection = severity === 'warn' ? warnings : errors;
        collection.push(issue(
          severity,
          'reward_threshold_exceeds_pool_count',
          pathFor(index, 'thresholdOverrides'),
          `Reward track "${track.id}" needs ${maxThreshold} active word(s), but pool "${track.poolId}" has ${Number(poolWordCount)}.`,
        ));
      }
    }

    if (track.progressionMode === 'sequentialAfter') {
      if (!track.sequentialAfter) {
        errors.push(issue('error', 'reward_dependency_required', pathFor(index, 'sequentialAfter'), `Reward track "${track.id || index + 1}" requires a sequential dependency.`));
      } else if (track.sequentialAfter === track.id) {
        errors.push(issue('error', 'reward_track_cycle', pathFor(index, 'sequentialAfter'), `Reward track "${track.id}" cannot depend on itself.`));
      }
    }

    if (track.active === false && visiblePools.has(track.poolId)) {
      warnings.push(issue('warn', 'inactive_visible_reward_track', pathFor(index, 'active'), `Reward track "${track.id}" is inactive for learner-visible pool "${track.poolId}".`));
    }

    if (rawHeroExposure?.state && !isKnownHeroExposureState(rawHeroExposure.state)) {
      errors.push(issue('error', 'invalid_hero_exposure_state', pathFor(index, 'heroExposure.state'), `Reward track "${track.id || index + 1}" has an unknown Hero / Codex exposure state.`));
    }
    if (!Array.isArray(track.heroExposure?.surfaces) || track.heroExposure.surfaces.length === 0) {
      errors.push(issue('error', 'hero_exposure_surface_required', pathFor(index, 'heroExposure.surfaces'), `Reward track "${track.id || index + 1}" needs at least one Hero / Codex exposure surface.`));
    }
    rawHeroExposureSurfaces.forEach((surface, surfaceIndex) => {
      if (!isKnownHeroExposureSurface(surface)) {
        errors.push(issue('error', 'invalid_hero_exposure_surface', pathFor(index, `heroExposure.surfaces[${surfaceIndex}]`), `Reward track "${track.id || index + 1}" has an unknown Hero / Codex exposure surface.`));
      }
    });
    if (track.heroExposure?.state === 'scheduled' && !track.heroExposure.scheduledAt) {
      errors.push(issue('error', 'hero_exposure_schedule_required', pathFor(index, 'heroExposure.scheduledAt'), `Reward track "${track.id || index + 1}" requires a schedule timestamp for scheduled exposure.`));
    }
    if (track.heroExposure?.state === 'rollout-flagged' && !track.heroExposure.rolloutFlag) {
      errors.push(issue('error', 'hero_exposure_flag_required', pathFor(index, 'heroExposure.rolloutFlag'), `Reward track "${track.id || index + 1}" requires a rollout flag for flagged exposure.`));
    }
  });

  tracks.forEach((track, index) => {
    if (track.progressionMode !== 'sequentialAfter' || !track.sequentialAfter) return;
    const dependency = byId.get(track.sequentialAfter);
    if (!dependency) {
      errors.push(issue('error', 'reward_dependency_missing', pathFor(index, 'sequentialAfter'), `Reward track "${track.id}" depends on missing track "${track.sequentialAfter}".`));
      return;
    }
    if (dependency.active === false && track.active !== false) {
      errors.push(issue('error', 'reward_dependency_inactive', pathFor(index, 'sequentialAfter'), `Reward track "${track.id}" depends on inactive track "${track.sequentialAfter}".`));
    }
    if (
      track.active !== false
      && dependency.poolId
      && track.poolId
      && dependency.poolId !== track.poolId
      && track.dependencyApproval?.approved !== true
    ) {
      errors.push(issue(
        'error',
        'reward_cross_pool_dependency',
        pathFor(index, 'dependencyApproval'),
        `Reward track "${track.id}" depends on pool "${dependency.poolId}" from pool "${track.poolId}" without approval.`,
      ));
    }
  });

  const visiting = new Set();
  const visited = new Set();
  const cycleReported = new Set();
  const visit = (track, stack = []) => {
    if (!track || track.active === false || track.progressionMode !== 'sequentialAfter') return;
    if (visiting.has(track.id)) {
      const cycleStart = stack.indexOf(track.id);
      const cycle = [...stack.slice(cycleStart >= 0 ? cycleStart : 0), track.id];
      const key = [...cycle].sort().join('>');
      if (!cycleReported.has(key)) {
        cycleReported.add(key);
        const index = tracks.findIndex((entry) => entry.id === track.id);
        errors.push(issue('error', 'reward_track_cycle', pathFor(index, 'sequentialAfter'), `Reward track sequence contains a cycle: ${cycle.join(' -> ')}.`));
      }
      return;
    }
    if (visited.has(track.id)) return;
    visiting.add(track.id);
    const next = byId.get(track.sequentialAfter);
    visit(next, [...stack, track.id]);
    visiting.delete(track.id);
    visited.add(track.id);
  };

  tracks.forEach((track) => visit(track));

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    tracks,
    byId,
  };
}
