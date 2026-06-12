export function monsterImageFallbackDataset(visual = {}) {
  return {
    'data-fallback-src': visual.fallbackSrc || '',
    'data-fallback-srcset': visual.fallbackSrcSet || '',
  };
}

export function applyMonsterImageFallback(event) {
  const image = event?.currentTarget;
  const fallbackSrc = image?.dataset?.fallbackSrc || '';
  if (!fallbackSrc || image.dataset.fallbackApplied === 'true') return;
  image.dataset.fallbackApplied = 'true';
  image.src = fallbackSrc;
  if (image.dataset.fallbackSrcset) {
    image.srcset = image.dataset.fallbackSrcset;
  } else {
    image.removeAttribute('srcset');
  }
}
