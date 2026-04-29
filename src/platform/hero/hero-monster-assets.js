// Hero Monster asset adapter — client-only.
// Maps Hero Pool monster IDs to the existing platform asset structure.
// Does NOT import from shared/ or worker/.
//
// Asset keys follow the convention in monster-asset-manifest.js:
//   key = `${sourceAssetMonsterId}-${branchId}-${stage}`
//   path = `./assets/monsters/${key}/${size}.webp`

/**
 * Get the asset source set for a Hero Pool monster.
 * Falls back gracefully if assets are missing.
 *
 * @param {string} sourceAssetMonsterId — base monster id (e.g. "bracehart")
 * @param {number} stage — evolution stage (0-based)
 * @param {string} [branch] — branch id (e.g. "b1")
 * @returns {{ key: string, src: string, fallback: string, srcSet: string }}
 */
export function getHeroMonsterAssetSrc(sourceAssetMonsterId, stage, branch) {
  const branchPart = branch || 'b1';
  const stageNum = Number(stage) || 0;
  const key = `${sourceAssetMonsterId}-${branchPart}-${stageNum}`;
  const fallbackKey = `${sourceAssetMonsterId}-${branchPart}-0`;

  return {
    key,
    src: `./assets/monsters/${key}/640.webp`,
    fallback: `./assets/monsters/${fallbackKey}/640.webp`,
    srcSet: [
      `./assets/monsters/${key}/320.webp 320w`,
      `./assets/monsters/${key}/640.webp 640w`,
      `./assets/monsters/${key}/1280.webp 1280w`,
    ].join(', '),
  };
}

/**
 * Check if a specific stage/branch asset likely exists.
 * In P5, we assume base assets exist; stage/branch variants may not.
 * UI should degrade gracefully (show fallback image).
 *
 * @param {string} sourceAssetMonsterId
 * @param {number} stage
 * @param {string} [branch]
 * @returns {boolean}
 */
export function hasHeroMonsterAsset(sourceAssetMonsterId, stage, branch) {
  // Optimistic — UI handles missing images via onerror/fallback
  return Boolean(sourceAssetMonsterId);
}
