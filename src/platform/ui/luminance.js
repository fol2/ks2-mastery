/* Runtime relative-luminance probe for hero backdrop art.
 *
 * Surfaces that paint a region artwork as their `--hero-bg` need to know
 * whether the art itself is dark (so ink tokens can flip to light). The
 * React owns the production shell, while the controller still centralises
 * post-render side effects such as focus restoration and audio glow sync.
 * This helper stays framework-neutral so the side-effect layer can kick
 * off a cheap `queueMicrotask` probe after React commits, and React
 * surfaces can run more granular text-region probes where a single
 * average is too coarse.
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
 * We downsample to 8×8 on purpose. A smaller grid keeps repeated cached
 * probes cheap without losing the dark/light signal we care about. */

const LUMINANCE_FALLBACK = 0.7;
const SAMPLE_SIZE = 8;
const TEXT_TONE_THRESHOLD = 0.24;
const luminanceCache = new Map();
const imageCache = new Map();

export function probeRelLuminance(url) {
  if (!url) return Promise.resolve(LUMINANCE_FALLBACK);
  if (luminanceCache.has(url)) return Promise.resolve(luminanceCache.get(url));

  const pending = loadProbeImage(url).then((img) => {
    if (!img) {
      luminanceCache.set(url, LUMINANCE_FALLBACK);
      return LUMINANCE_FALLBACK;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = SAMPLE_SIZE;
      canvas.height = SAMPLE_SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        luminanceCache.set(url, LUMINANCE_FALLBACK);
        return LUMINANCE_FALLBACK;
      }
      ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const luminance = averageImageDataLuminance(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
      luminanceCache.set(url, luminance);
      return luminance;
    } catch {
      /* Tainted canvas / security error — treat as light so we stay on
         the safe-default dark ink. */
      luminanceCache.set(url, LUMINANCE_FALLBACK);
      return LUMINANCE_FALLBACK;
    }
  });

  luminanceCache.set(url, pending);
  return pending;
}

export function preloadImages(urls) {
  if (!Array.isArray(urls)) return;
  urls.forEach((url) => {
    if (url) void loadProbeImage(url);
  });
}

export async function probeHeroTextTones(url, container, probes) {
  if (!container || !Array.isArray(probes) || !probes.length) return [];
  const fallback = fallbackToneResults(container, probes);
  if (!url || typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return fallback;
  }

  const img = await loadProbeImage(url);
  if (!img) return fallback;

  try {
    const containerRect = container.getBoundingClientRect();
    if (!containerRect.width || !containerRect.height) return fallback;

    const layer = resolveHeroLayer(container, url) || container;
    const layerStyle = getComputedStyle(layer);
    const geometry = backgroundGeometry(img, containerRect, layerStyle);
    if (!geometry) return fallback;

    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallback;

    const panelLuminance = cssVarLuminance(container, '--panel') ?? LUMINANCE_FALLBACK;
    return probes.map((probe, index) => {
      const element = probe?.element;
      const rect = element?.getBoundingClientRect?.();
      const sampleRect = intersectRects(rect, containerRect);
      if (!sampleRect) return fallback[index];

      const rawLuminance = sampleImageRectLuminance(ctx, img, geometry, sampleRect, containerRect);
      const centreX = ((sampleRect.left + (sampleRect.width / 2)) - containerRect.left) / containerRect.width;
      const centreY = ((sampleRect.top + (sampleRect.height / 2)) - containerRect.top) / containerRect.height;
      const heroLuminance = applyHeroOverlayLuminance(rawLuminance, centreX, centreY, panelLuminance);
      const glassAlpha = clamp01(Number(probe.glassAlpha) || 0);
      const backgroundLuminance = blendLuminance(panelLuminance, heroLuminance, glassAlpha);
      return {
        key: probe.key,
        luminance: backgroundLuminance,
        tone: textToneForLuminance(backgroundLuminance),
      };
    });
  } catch {
    return fallback;
  }
}

export function textToneForLuminance(luminance) {
  return luminance >= TEXT_TONE_THRESHOLD ? 'dark' : 'light';
}

function loadProbeImage(url) {
  if (!url) return Promise.resolve(null);
  if (imageCache.has(url)) return imageCache.get(url);

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    imageCache.set(url, Promise.resolve(null));
    return imageCache.get(url);
  }

  const pending = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    try {
      img.src = url;
    } catch {
      resolve(null);
    }
  });
  imageCache.set(url, pending);
  return pending;
}

function fallbackToneResults(container, probes) {
  const baseLuminance = container
    ? cssVarLuminance(container, '--panel') ?? LUMINANCE_FALLBACK
    : LUMINANCE_FALLBACK;
  const tone = textToneForLuminance(baseLuminance);
  return probes.map((probe) => ({ key: probe?.key, luminance: baseLuminance, tone }));
}

function resolveHeroLayer(container, url) {
  const layers = Array.from(container.querySelectorAll?.('.spelling-hero-layer') || []);
  if (!layers.length) return null;
  const reversed = layers.slice().reverse();
  return reversed.find((layer) => (
    layer.style?.getPropertyValue('--hero-bg')?.includes(url)
  )) || reversed[0];
}

function backgroundGeometry(img, containerRect, style) {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) return null;
  const scale = Math.max(containerRect.width / width, containerRect.height / height);
  const renderedWidth = width * scale;
  const renderedHeight = height * scale;
  const position = backgroundPosition(style);
  return {
    scale,
    offsetX: resolvePosition(position.x, containerRect.width, renderedWidth),
    offsetY: resolvePosition(position.y, containerRect.height, renderedHeight),
    width,
    height,
  };
}

function backgroundPosition(style) {
  const x = style.backgroundPositionX || '';
  const y = style.backgroundPositionY || '';
  if (x || y) return { x: x || '50%', y: y || '50%' };
  const parts = String(style.backgroundPosition || '50% 50%').trim().split(/\s+/);
  return { x: parts[0] || '50%', y: parts[1] || '50%' };
}

function resolvePosition(value, containerSize, renderedSize) {
  const text = String(value || '50%').trim().toLowerCase();
  if (text === 'left' || text === 'top') return 0;
  if (text === 'center') return (containerSize - renderedSize) * 0.5;
  if (text === 'right' || text === 'bottom') return containerSize - renderedSize;
  if (text.endsWith('%')) return (containerSize - renderedSize) * (Number.parseFloat(text) / 100);
  if (text.endsWith('px')) return Number.parseFloat(text) || 0;
  return (containerSize - renderedSize) * 0.5;
}

function intersectRects(rect, bounds) {
  if (!rect || !bounds) return null;
  const left = Math.max(rect.left, bounds.left);
  const top = Math.max(rect.top, bounds.top);
  const right = Math.min(rect.right, bounds.right);
  const bottom = Math.min(rect.bottom, bounds.bottom);
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function sampleImageRectLuminance(ctx, img, geometry, rect, containerRect) {
  const sourceLeft = ((rect.left - containerRect.left) - geometry.offsetX) / geometry.scale;
  const sourceTop = ((rect.top - containerRect.top) - geometry.offsetY) / geometry.scale;
  const sourceWidth = rect.width / geometry.scale;
  const sourceHeight = rect.height / geometry.scale;
  const sx = clamp(sourceLeft, 0, geometry.width - 1);
  const sy = clamp(sourceTop, 0, geometry.height - 1);
  const sw = Math.max(1, Math.min(sourceWidth, geometry.width - sx));
  const sh = Math.max(1, Math.min(sourceHeight, geometry.height - sy));
  try {
    ctx.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    return averageImageDataLuminance(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
  } catch {
    return LUMINANCE_FALLBACK;
  }
}

function applyHeroOverlayLuminance(rawLuminance, x, y, panelLuminance) {
  const verticalAlpha = y < 0.38
    ? interpolate(0, 0.38, 0.2, 0, y)
    : interpolate(0.72, 1, 0, 0.26, y);
  const horizontalAlpha = interpolateStops([
    [0, 0.88],
    [0.32, 0.66],
    [0.62, 0.28],
    [1, 0.1],
  ], x);
  const vertical = blendLuminance(panelLuminance, rawLuminance, clamp01(verticalAlpha));
  return blendLuminance(panelLuminance, vertical, clamp01(horizontalAlpha));
}

function blendLuminance(foreground, background, alpha) {
  return (foreground * alpha) + (background * (1 - alpha));
}

function interpolateStops(stops, value) {
  const point = clamp01(value);
  for (let i = 1; i < stops.length; i += 1) {
    const [prevAt, prevValue] = stops[i - 1];
    const [nextAt, nextValue] = stops[i];
    if (point <= nextAt) return interpolate(prevAt, nextAt, prevValue, nextValue, point);
  }
  return stops[stops.length - 1][1];
}

function interpolate(fromAt, toAt, fromValue, toValue, at) {
  if (at <= fromAt) return fromValue;
  if (at >= toAt) return toValue;
  const progress = (at - fromAt) / (toAt - fromAt);
  return fromValue + ((toValue - fromValue) * progress);
}

function cssVarLuminance(element, property) {
  if (!element || typeof getComputedStyle === 'undefined') return null;
  return colorLuminance(getComputedStyle(element).getPropertyValue(property));
}

function colorLuminance(value) {
  const rgb = parseCssColor(value);
  if (!rgb) return null;
  const r = srgbToLinear(rgb.r / 255);
  const g = srgbToLinear(rgb.g / 255);
  const b = srgbToLinear(rgb.b / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function parseCssColor(value) {
  const text = String(value || '').trim();
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3
      ? hex[1].split('').map((char) => `${char}${char}`).join('')
      : hex[1];
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
    };
  }

  const rgb = text.match(/^rgba?\((.+)\)$/i);
  if (!rgb) return null;
  const parts = rgb[1]
    .replace(/\//g, ' ')
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((part) => Number.parseFloat(part));
  if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return { r: parts[0], g: parts[1], b: parts[2] };
}

function averageImageDataLuminance(data) {
  let sum = 0;
  const pixelCount = Math.max(1, data.length / 4);
  for (let i = 0; i < data.length; i += 4) {
    const r = srgbToLinear(data[i] / 255);
    const g = srgbToLinear(data[i + 1] / 255);
    const b = srgbToLinear(data[i + 2] / 255);
    sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return sum / pixelCount;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function srgbToLinear(channel) {
  return channel <= 0.03928
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}
