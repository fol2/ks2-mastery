// Hero Monster asset adapter — client-only.
// Does NOT import from shared/ or worker/.
//
// On-disk layout:
//   ./assets/monsters/<monsterId>/<branch>/<monsterId>-<branch>-<stage>.<size>.webp

/**
 * @param {string} sourceAssetMonsterId
 * @param {number} stage
 * @param {string} [branch]
 * @returns {{ key: string, src: string, fallback: string, srcSet: string }}
 */
export function getHeroMonsterAssetSrc(sourceAssetMonsterId, stage, branch) {
  const branchPart = branch || 'b1';
  const stageNum = Number(stage) || 0;
  const key = `${sourceAssetMonsterId}-${branchPart}-${stageNum}`;
  const fallbackKey = `${sourceAssetMonsterId}-${branchPart}-0`;
  const base = `./assets/monsters/${sourceAssetMonsterId}/${branchPart}`;

  return {
    key,
    src: `${base}/${key}.640.webp`,
    fallback: `${base}/${fallbackKey}.640.webp`,
    srcSet: [
      `${base}/${key}.320.webp 320w`,
      `${base}/${key}.640.webp 640w`,
      `${base}/${key}.1280.webp 1280w`,
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
