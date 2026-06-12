import { HERO_POOL_INITIAL_MONSTER_IDS } from '../../../shared/hero/hero-pool.js';
import { rewardTracksVisibleForHeroSurface } from '../../../src/platform/game/reward-track-config.js';

export function heroCampMonsterIdsFromRewardTracks(rewardTracks = [], {
  now = Date.now(),
  env = {},
} = {}) {
  const tracks = Array.isArray(rewardTracks) ? rewardTracks : [];
  const heroCampRoster = new Set(HERO_POOL_INITIAL_MONSTER_IDS);
  const hasConfiguredHeroCampTrack = tracks.some((track) => (
    heroCampRoster.has(String(track?.monsterId || '').trim())
  ));
  if (!hasConfiguredHeroCampTrack) return null;

  const visible = new Set(rewardTracksVisibleForHeroSurface(tracks, {
    surface: 'heroCamp',
    now,
    env,
  }).map((track) => String(track?.monsterId || '').trim()));

  return HERO_POOL_INITIAL_MONSTER_IDS.filter((monsterId) => visible.has(monsterId));
}
