import { cloneSerialisable } from '../../../../src/platform/core/repositories/helpers.js';
import {
  normaliseAchievementsMap,
  normaliseDurablePersistenceWarning,
  normaliseGuardianMap,
  normalisePatternMap,
  normalisePostMegaRecord,
} from '../../../../src/subjects/spelling/service-contract.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normaliseProgressMap(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const output = {};
  for (const [slug, entry] of Object.entries(raw)) {
    if (!slug || !isPlainObject(entry)) continue;
    output[slug] = cloneSerialisable(entry);
  }
  return output;
}

export function normaliseServerSpellingData(rawValue, nowTs = Date.now()) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const todayDay = Math.floor(Number(nowTs) / DAY_MS);
  const output = {
    prefs: isPlainObject(raw.prefs) ? cloneSerialisable(raw.prefs) : {},
    progress: normaliseProgressMap(raw.progress),
    guardian: normaliseGuardianMap(raw.guardian, Number.isFinite(todayDay) && todayDay >= 0 ? todayDay : 0),
  };
  const postMega = normalisePostMegaRecord(raw.postMega);
  if (postMega) output.postMega = postMega;
  const pattern = normalisePatternMap(raw.pattern);
  if (pattern && Object.keys(pattern.wobbling).length > 0) output.pattern = pattern;
  const persistenceWarning = normaliseDurablePersistenceWarning(raw.persistenceWarning);
  if (persistenceWarning) output.persistenceWarning = persistenceWarning;
  const achievements = normaliseAchievementsMap(raw.achievements);
  if (achievements && Object.keys(achievements).length > 0) output.achievements = achievements;
  return output;
}
