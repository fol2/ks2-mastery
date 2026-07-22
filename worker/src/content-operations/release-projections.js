import {
  normaliseHeroExposure,
  normaliseRewardTrackCollection,
} from '../../../src/platform/game/reward-track-config.js';

export const CONTENT_OPERATION_HERO_EXPOSURE_PROOF_KEY = 'contentOperationsHeroExposure';
export const CONTENT_OPERATION_HERO_EXPOSURE_PROJECTION_VERSION = 1;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Keep the Hero exposure policy beside the release metadata so Hero requests
 * never need to inflate the complete Spelling catalogue just to filter Camp.
 */
export function buildContentOperationHeroExposureProjection(content = {}) {
  const rewardTracks = Array.isArray(content?.draft?.rewardTracks)
    ? content.draft.rewardTracks
    : Array.isArray(content?.rewardTracks) ? content.rewardTracks : [];
  return {
    version: CONTENT_OPERATION_HERO_EXPOSURE_PROJECTION_VERSION,
    rewardTracks: normaliseRewardTrackCollection(rewardTracks)
      .filter((track) => track.monsterId)
      .map((track) => ({
        id: track.id,
        monsterId: track.monsterId,
        active: track.active !== false,
        retired: Boolean(track.retired),
        heroExposure: normaliseHeroExposure(track.heroExposure),
      })),
  };
}

export function contentOperationHeroExposureProjectionFromProof(proof = null) {
  const projection = isPlainObject(proof?.[CONTENT_OPERATION_HERO_EXPOSURE_PROOF_KEY])
    ? proof[CONTENT_OPERATION_HERO_EXPOSURE_PROOF_KEY]
    : null;
  if (!projection
    || Number(projection.version) !== CONTENT_OPERATION_HERO_EXPOSURE_PROJECTION_VERSION
    || !Array.isArray(projection.rewardTracks)) return null;
  return buildContentOperationHeroExposureProjection({
    rewardTracks: projection.rewardTracks,
  });
}
