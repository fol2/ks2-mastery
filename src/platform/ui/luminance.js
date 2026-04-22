/* Runtime relative-luminance probe for hero backdrop art.
 *
 * Surfaces that paint a region artwork as their `--hero-bg` need to know
 * whether the art itself is dark (so ink tokens can flip to light). The
 * React owns the production shell, while the controller still centralises
 * post-render side effects such as focus restoration and audio glow sync.
 * This helper stays framework-neutral so that side-effect layer can kick
 * off a cheap `queueMicrotask` probe after React commits.
 *
 * Contract — `probeRelLuminance(url)`:
 *   - Resolves to a number in `[0, 1]` representing the WCAG relative
 *     luminance of the image (sRGB → linear → 0.2126R + 0.7152G + 0.0722B).
 *   - Caches results per URL in a module-local `Map`; the image decode
 *     and canvas read only happen once per URL for the lifetime of the
 *     page.
 *   - Falls back to `0.7` (light assumption → NO `hero-dark` class) when
 *     the image cannot be decoded, when the canvas is tainted, when the
 *     image 404s, or when `document` is unavailable (SSR / tests).
 *   - Never throws; callers treat it as fire-and-forget.
 *
 * We downsample to 8×8 on purpose — the call runs on every render while
 * the learner is navigating the spelling session, so a smaller grid (vs.
 * the design reference's 32×32) keeps the decode cheap without losing
 * the coarse dark/light signal we care about. */

const LUMINANCE_FALLBACK = 0.7;
const SAMPLE_SIZE = 8;
const cache = new Map();

export function probeRelLuminance(url) {
  if (!url) return Promise.resolve(LUMINANCE_FALLBACK);
  if (cache.has(url)) return Promise.resolve(cache.get(url));

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    cache.set(url, LUMINANCE_FALLBACK);
    return Promise.resolve(LUMINANCE_FALLBACK);
  }

  const pending = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cache.set(url, LUMINANCE_FALLBACK);
          resolve(LUMINANCE_FALLBACK);
          return;
        }
        ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        let sum = 0;
        const pixelCount = SAMPLE_SIZE * SAMPLE_SIZE;
        for (let i = 0; i < data.length; i += 4) {
          const r = srgbToLinear(data[i] / 255);
          const g = srgbToLinear(data[i + 1] / 255);
          const b = srgbToLinear(data[i + 2] / 255);
          sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        const luminance = sum / pixelCount;
        cache.set(url, luminance);
        resolve(luminance);
      } catch {
        /* Tainted canvas / security error — treat as light so we stay on
           the safe-default dark ink. */
        cache.set(url, LUMINANCE_FALLBACK);
        resolve(LUMINANCE_FALLBACK);
      }
    };

    img.onerror = () => {
      cache.set(url, LUMINANCE_FALLBACK);
      resolve(LUMINANCE_FALLBACK);
    };

    try {
      img.src = url;
    } catch {
      cache.set(url, LUMINANCE_FALLBACK);
      resolve(LUMINANCE_FALLBACK);
    }
  });

  return pending;
}

function srgbToLinear(channel) {
  return channel <= 0.03928
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}
