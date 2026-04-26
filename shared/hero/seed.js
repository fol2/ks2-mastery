import { HERO_DEFAULT_TIMEZONE } from './constants.js';

function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export function generateHeroSeed({
  learnerId,
  dateKey,
  timezone,
  schedulerVersion,
  contentReleaseFingerprint,
}) {
  const parts = [
    String(learnerId || ''),
    String(dateKey || ''),
    String(timezone || HERO_DEFAULT_TIMEZONE),
    String(schedulerVersion || ''),
    String(contentReleaseFingerprint ?? 'null'),
  ];
  return djb2Hash(parts.join('|'));
}

export function deriveDateKey(now, timezone = HERO_DEFAULT_TIMEZONE) {
  const ts = typeof now === 'function' ? Number(now()) : Number(now);
  const safeTs = Number.isFinite(ts) ? ts : Date.now();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date(safeTs));
}

export function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
