import { cloneSerialisable } from '../../../../src/platform/core/repositories/helpers.js';
import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENT_PROGRESS_KEYS,
  deriveAchievementId,
  SPELLING_PATTERN_IDS,
  normaliseAchievementsMap,
  normaliseDurablePersistenceWarning,
  normaliseGuardianMap,
  normalisePatternMap,
  normalisePostMegaRecord,
} from '../../../../src/subjects/spelling/service-contract.js';
import {
  GUARDIAN_MAINTAINER_DAY_THRESHOLD,
  PATTERN_MASTERY_STREAK_LENGTH,
  RECOVERY_EXPERT_SLUG_THRESHOLD,
} from '../../../../src/subjects/spelling/achievements.js';
import {
  isEnrichmentExtraWord,
  isSecureExtensionWord,
  isStatutoryCoreWord,
} from '../../../../src/subjects/spelling/content/taxonomy.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const SPELLING_STATS_POOL_KEYS = Object.freeze([
  'all',
  'core',
  'y34',
  'y56',
  'secureExtension',
  'extra',
]);
const SPELLING_REVIEW_SCHEDULE_VERSION = 1;
const SPELLING_STATS_CATALOGUE_VERSION = 1;
const SPELLING_RECENT_BOSS_ACHIEVEMENT_LIMIT = 8;
const GUARDIAN_ACHIEVEMENT_PREFIX = 'achievement:spelling:guardian:7-day:';
const RECOVERY_ACHIEVEMENT_PREFIX = 'achievement:spelling:recovery:expert:';
const BOSS_ACHIEVEMENT_PREFIX = 'achievement:spelling:boss:clean-sweep:';
const PATTERN_ACHIEVEMENT_PREFIX = 'achievement:spelling:pattern:';

export function spellingAchievementProjectionIds(learnerId) {
  return [
    ...Object.values(ACHIEVEMENT_PROGRESS_KEYS),
    deriveAchievementId(ACHIEVEMENT_IDS.GUARDIAN_7_DAY, { learnerId }),
    deriveAchievementId(ACHIEVEMENT_IDS.RECOVERY_EXPERT, { learnerId }),
    ...SPELLING_PATTERN_IDS.map((patternId) => deriveAchievementId(
      ACHIEVEMENT_IDS.PATTERN_MASTERY,
      { learnerId, patternId },
    )),
  ].filter(Boolean);
}

export function spellingBossAchievementPrefix(learnerId) {
  const safeLearner = typeof learnerId === 'string' && learnerId ? learnerId : 'default';
  return `${BOSS_ACHIEVEMENT_PREFIX}${safeLearner}:`;
}

export const SPELLING_BOSS_ACHIEVEMENT_PROJECTION_LIMIT = SPELLING_RECENT_BOSS_ACHIEVEMENT_LIMIT;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(value) {
  if (isPlainObject(value)) return cloneSerialisable(value) || {};
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function newestAchievement(entries = []) {
  return entries.slice().sort((left, right) => {
    const byTime = (Number(right?.[1]?.unlockedAt) || 0) - (Number(left?.[1]?.unlockedAt) || 0);
    return byTime || String(left?.[0] || '').localeCompare(String(right?.[0] || ''), 'en');
  })[0] || null;
}

/**
 * Keep a fixed achievement projection in the command/bootstrap learner row.
 * Every unlock remains durable in `spelling_achievement_state`; this object
 * contains only the evaluator's threshold state, the singleton/current-
 * pattern latches and a small recent Boss window for the existing UI.
 */
export function boundedSpellingAchievements(rawValue = {}) {
  const normalised = normaliseAchievementsMap(rawValue) || {};
  const output = {};

  const rawDays = normalised[ACHIEVEMENT_PROGRESS_KEYS.GUARDIAN_DAYS]?.days;
  if (Array.isArray(rawDays)) {
    const days = [...new Set(rawDays
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0)
      .map((value) => Math.floor(value)))]
      .sort((left, right) => left - right)
      .slice(-GUARDIAN_MAINTAINER_DAY_THRESHOLD);
    output[ACHIEVEMENT_PROGRESS_KEYS.GUARDIAN_DAYS] = { days };
  }

  const rawSlugs = normalised[ACHIEVEMENT_PROGRESS_KEYS.RECOVERED_SLUGS]?.slugs;
  if (Array.isArray(rawSlugs)) {
    output[ACHIEVEMENT_PROGRESS_KEYS.RECOVERED_SLUGS] = {
      slugs: [...new Set(rawSlugs.filter((slug) => typeof slug === 'string' && slug))]
        .sort((left, right) => left.localeCompare(right, 'en'))
        .slice(0, RECOVERY_EXPERT_SLUG_THRESHOLD),
    };
  }

  const rawCompletions = normalised[ACHIEVEMENT_PROGRESS_KEYS.PATTERN_COMPLETIONS]?.completions;
  if (isPlainObject(rawCompletions)) {
    const completions = {};
    for (const patternId of SPELLING_PATTERN_IDS) {
      const rows = Array.isArray(rawCompletions[patternId]) ? rawCompletions[patternId] : [];
      if (!rows.length) continue;
      completions[patternId] = rows.slice(-PATTERN_MASTERY_STREAK_LENGTH);
    }
    output[ACHIEVEMENT_PROGRESS_KEYS.PATTERN_COMPLETIONS] = { completions };
  }

  const unlockEntries = Object.entries(normalised)
    .filter(([id]) => !id.startsWith('_progress:'));
  for (const prefix of [GUARDIAN_ACHIEVEMENT_PREFIX, RECOVERY_ACHIEVEMENT_PREFIX]) {
    const newest = newestAchievement(unlockEntries.filter(([id]) => id.startsWith(prefix)));
    if (newest) output[newest[0]] = newest[1];
  }
  for (const patternId of SPELLING_PATTERN_IDS) {
    const prefix = `${PATTERN_ACHIEVEMENT_PREFIX}${patternId}:`;
    const newest = newestAchievement(unlockEntries.filter(([id]) => id.startsWith(prefix)));
    if (newest) output[newest[0]] = newest[1];
  }
  const bossEntries = unlockEntries
    .filter(([id]) => id.startsWith(BOSS_ACHIEVEMENT_PREFIX))
    .sort((left, right) => {
      const byTime = (Number(right?.[1]?.unlockedAt) || 0) - (Number(left?.[1]?.unlockedAt) || 0);
      return byTime || String(left?.[0] || '').localeCompare(String(right?.[0] || ''), 'en');
    })
    .slice(0, SPELLING_RECENT_BOSS_ACHIEVEMENT_LIMIT);
  for (const [id, record] of bossEntries) output[id] = record;
  return output;
}

/**
 * Keep only learner-wide spelling values whose size is independent of the
 * number of words ever played. Item-addressed maps live in
 * `spelling_item_state` and must never leak back into this record.
 */
export function spellingLearnerData(rawValue = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const output = {
    prefs: isPlainObject(raw.prefs) ? cloneSerialisable(raw.prefs) : {},
  };
  const postMega = normalisePostMegaRecord(raw.postMega);
  if (postMega) output.postMega = postMega;
  const persistenceWarning = normaliseDurablePersistenceWarning(raw.persistenceWarning);
  if (persistenceWarning) output.persistenceWarning = persistenceWarning;
  return output;
}

/**
 * Return achievement rows created or advanced by this command. Omission never
 * deletes cold history; learner reset is the sole bulk-delete operation.
 */
export function changedSpellingAchievementRows(previousData = {}, nextData = {}) {
  const previous = boundedSpellingAchievements(previousData?.achievements);
  const next = boundedSpellingAchievements(nextData?.achievements);
  const changed = [];
  for (const [achievementId, record] of Object.entries(next)) {
    if (sameJson(previous[achievementId], record)) continue;
    changed.push({ achievementId, record });
  }
  return changed;
}

/**
 * Compose the command's working set from the bounded learner record and only
 * the item rows explicitly selected for this command. Lifetime/orphan rows
 * remain durable in D1 but are intentionally absent here.
 */
export function composeSpellingGameplayData(
  learnerData = {},
  itemRows = [],
  nowTs = Date.now(),
  achievementRows = [],
) {
  const progress = {};
  const guardian = {};
  const wobbling = {};

  for (const row of Array.isArray(itemRows) ? itemRows : []) {
    const slug = typeof row?.slug === 'string' ? row.slug : '';
    if (!slug) continue;
    const progressEntry = parseJsonObject(row.progress_json ?? row.progress);
    const guardianEntry = parseJsonObject(row.guardian_json ?? row.guardian);
    const patternEntry = parseJsonObject(row.pattern_json ?? row.pattern);
    if (progressEntry) progress[slug] = progressEntry;
    if (guardianEntry) guardian[slug] = guardianEntry;
    if (patternEntry) wobbling[slug] = patternEntry;
  }

  const todayDay = Math.max(0, Math.floor(Number(nowTs) / (24 * 60 * 60 * 1000)));
  const normalisedGuardian = normaliseGuardianMap(guardian, todayDay);
  const normalisedPattern = normalisePatternMap({ wobbling });
  const achievementMap = Object.fromEntries((Array.isArray(achievementRows) ? achievementRows : [])
    .map((row) => {
      const achievementId = typeof row?.achievement_id === 'string'
        ? row.achievement_id
        : typeof row?.achievementId === 'string' ? row.achievementId : '';
      return [achievementId, parseJsonObject(row?.record_json ?? row?.record)];
    })
    .filter(([achievementId, record]) => achievementId && record));
  const achievements = boundedSpellingAchievements(achievementMap);
  return {
    ...spellingLearnerData(learnerData),
    ...(Object.keys(achievements).length > 0 ? { achievements } : {}),
    progress,
    guardian: normalisedGuardian,
    ...(normalisedPattern && Object.keys(normalisedPattern.wobbling).length > 0
      ? { pattern: normalisedPattern }
      : {}),
  };
}

function itemStateMap(rawData = {}) {
  const data = isPlainObject(rawData) ? rawData : {};
  const progress = isPlainObject(data.progress) ? data.progress : {};
  const guardian = isPlainObject(data.guardian) ? data.guardian : {};
  const wobbling = isPlainObject(data.pattern?.wobbling) ? data.pattern.wobbling : {};
  const slugs = new Set([
    ...Object.keys(progress),
    ...Object.keys(guardian),
    ...Object.keys(wobbling),
  ]);
  const output = new Map();
  for (const slug of slugs) {
    if (typeof slug !== 'string' || !slug) continue;
    output.set(slug, {
      progress: isPlainObject(progress[slug]) ? cloneSerialisable(progress[slug]) : null,
      guardian: isPlainObject(guardian[slug]) ? cloneSerialisable(guardian[slug]) : null,
      pattern: isPlainObject(wobbling[slug]) ? cloneSerialisable(wobbling[slug]) : null,
    });
  }
  return output;
}

function sameJson(left, right) {
  if (left == null || right == null) return left == null && right == null;
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Return only item rows changed by the command. The input is already a
 * bounded working set, so this comparison never walks lifetime history.
 */
export function changedSpellingGameplayItems(previousData = {}, nextData = {}) {
  const previous = itemStateMap(previousData);
  const next = itemStateMap(nextData);
  const changed = [];
  // A command may hydrate a retired row because bounded session or retry
  // evidence references it. Current-content normalisation may then omit the
  // row, but omission is not a deletion request. Whole-learner reset is the
  // explicit resetAllItems bulk delete in the repository.
  for (const slug of next.keys()) {
    const before = previous.get(slug) || { progress: null, guardian: null, pattern: null };
    const after = next.get(slug) || { progress: null, guardian: null, pattern: null };
    if (sameJson(before.progress, after.progress)
      && sameJson(before.guardian, after.guardian)
      && sameJson(before.pattern, after.pattern)) continue;
    changed.push({ slug, ...after });
  }
  return changed;
}

export function parseSpellingGameplayStats(rawValue = {}) {
  return parseJsonObject(rawValue) || {};
}

function spellingPoolKeysForWord(word) {
  if (isSecureExtensionWord(word)) return ['secureExtension'];
  if (isEnrichmentExtraWord(word)) return ['extra'];
  if (!isStatutoryCoreWord(word)) return [];
  const keys = ['all', 'core'];
  if (word?.year === '3-4') keys.push('y34');
  if (word?.year === '5-6') keys.push('y56');
  return keys;
}

function normaliseCountRows(rawValue) {
  const counts = new Map();
  for (const row of Array.isArray(rawValue) ? rawValue : []) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const day = Number(row[0]);
    const count = Number(row[1]);
    if (!Number.isInteger(day) || !Number.isInteger(count) || count <= 0) continue;
    counts.set(day, (counts.get(day) || 0) + count);
  }
  return [...counts.entries()].sort((left, right) => left[0] - right[0]);
}

function normaliseReviewSchedule(rawValue) {
  if (!isPlainObject(rawValue)
    || Number(rawValue.version) !== SPELLING_REVIEW_SCHEDULE_VERSION) return null;
  const duePools = {};
  const troubleDuePools = {};
  const troubleAlways = {};
  for (const key of SPELLING_STATS_POOL_KEYS) {
    duePools[key] = normaliseCountRows(rawValue.duePools?.[key]);
    troubleDuePools[key] = normaliseCountRows(rawValue.troubleDuePools?.[key]);
    troubleAlways[key] = Math.max(0, Math.floor(Number(rawValue.troubleAlways?.[key]) || 0));
  }
  return {
    version: SPELLING_REVIEW_SCHEDULE_VERSION,
    duePools,
    troubleDuePools,
    troubleAlways,
  };
}

function cataloguePoolTotals(words = []) {
  const output = Object.fromEntries(SPELLING_STATS_POOL_KEYS.map((key) => [key, 0]));
  for (const word of Array.isArray(words) ? words : []) {
    for (const key of spellingPoolKeysForWord(word)) output[key] += 1;
  }
  return output;
}

function catalogueFingerprint(words = [], {
  releaseId = '',
  publishedVersion = 0,
} = {}) {
  let hash = 2166136261;
  const feed = (value) => {
    const text = String(value ?? '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    hash ^= 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  };
  feed(releaseId);
  feed(Number(publishedVersion) || 0);
  for (const word of Array.isArray(words) ? words : []) {
    feed(word?.slug);
    feed(word?.year);
    feed(word?.spellingPool);
    feed(word?.coverageTier);
  }
  return hash.toString(16).padStart(8, '0');
}

function spellingStatsCatalogue(words = [], options = {}) {
  return {
    version: SPELLING_STATS_CATALOGUE_VERSION,
    fingerprint: catalogueFingerprint(words, options),
    pools: cataloguePoolTotals(words),
  };
}

export function spellingGameplayStatsAreCurrent(rawValue = {}, words = [], options = {}) {
  const raw = parseSpellingGameplayStats(rawValue);
  const expected = spellingStatsCatalogue(words, options);
  const actual = raw.catalogueV1;
  if (!isPlainObject(actual)
    || Number(actual.version) !== SPELLING_STATS_CATALOGUE_VERSION
    || actual.fingerprint !== expected.fingerprint
    || !normaliseReviewSchedule(raw.reviewScheduleV1)) return false;
  return SPELLING_STATS_POOL_KEYS.every((key) => (
    Number(actual.pools?.[key]) === expected.pools[key]
      && Number(raw[key]?.total) === expected.pools[key]
  ));
}

function progressRecord(rawValue, todayDay) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    stage: Math.max(0, Number(raw.stage) || 0),
    attempts: Math.max(0, Number(raw.attempts) || 0),
    correct: Math.max(0, Number(raw.correct) || 0),
    wrong: Math.max(0, Number(raw.wrong) || 0),
    dueDay: typeof raw.dueDay === 'number' && Number.isFinite(raw.dueDay)
      ? Math.floor(raw.dueDay)
      : todayDay,
  };
}

function addCount(counts, day, delta) {
  if (!Number.isInteger(day) || !delta) return;
  const next = (counts.get(day) || 0) + delta;
  if (next > 0) counts.set(day, next);
  else counts.delete(day);
}

function scheduleMaps(schedule) {
  return {
    duePools: Object.fromEntries(SPELLING_STATS_POOL_KEYS.map((key) => [
      key,
      new Map(schedule.duePools[key]),
    ])),
    troubleDuePools: Object.fromEntries(SPELLING_STATS_POOL_KEYS.map((key) => [
      key,
      new Map(schedule.troubleDuePools[key]),
    ])),
    troubleAlways: { ...schedule.troubleAlways },
  };
}

function serialiseSchedule(maps) {
  return {
    version: SPELLING_REVIEW_SCHEDULE_VERSION,
    duePools: Object.fromEntries(SPELLING_STATS_POOL_KEYS.map((key) => [
      key,
      [...maps.duePools[key].entries()].sort((left, right) => left[0] - right[0]),
    ])),
    troubleDuePools: Object.fromEntries(SPELLING_STATS_POOL_KEYS.map((key) => [
      key,
      [...maps.troubleDuePools[key].entries()].sort((left, right) => left[0] - right[0]),
    ])),
    troubleAlways: Object.fromEntries(SPELLING_STATS_POOL_KEYS.map((key) => [
      key,
      Math.max(0, Math.floor(Number(maps.troubleAlways[key]) || 0)),
    ])),
  };
}

function applyProgressToSchedule(maps, poolKeys, progress, delta) {
  if (progress.attempts > 0) {
    for (const key of poolKeys) addCount(maps.duePools[key], progress.dueDay, delta);
  }
  if (progress.wrong <= 0) return;
  if (progress.wrong >= progress.correct) {
    for (const key of poolKeys) {
      maps.troubleAlways[key] = Math.max(0, (maps.troubleAlways[key] || 0) + delta);
    }
    return;
  }
  for (const key of poolKeys) addCount(maps.troubleDuePools[key], progress.dueDay, delta);
}

/**
 * Persist exact, catalogue-bounded due and trouble schedules alongside the
 * public counters. Time can advance without loading every word merely to
 * refresh either pool; the schedules are never returned to the client.
 */
export function spellingGameplayStatsWithDueSchedule(stats = {}, words = [], data = {}, options = {}) {
  const progress = isPlainObject(data?.progress) ? data.progress : {};
  const dueCountsByPool = Object.fromEntries(
    SPELLING_STATS_POOL_KEYS.map((key) => [key, new Map()]),
  );
  const troubleDueCountsByPool = Object.fromEntries(
    SPELLING_STATS_POOL_KEYS.map((key) => [key, new Map()]),
  );
  const troubleAlways = Object.fromEntries(SPELLING_STATS_POOL_KEYS.map((key) => [key, 0]));
  const today = Math.floor((Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now()) / DAY_MS);
  for (const word of Array.isArray(words) ? words : []) {
    const slug = typeof word?.slug === 'string' ? word.slug : '';
    const entry = progressRecord(slug && progress[slug], today);
    const poolKeys = spellingPoolKeysForWord(word);
    if (entry.attempts > 0) {
      for (const key of poolKeys) {
        const counts = dueCountsByPool[key];
        counts.set(entry.dueDay, (counts.get(entry.dueDay) || 0) + 1);
      }
    }
    if (entry.wrong > 0 && entry.wrong >= entry.correct) {
      for (const key of poolKeys) troubleAlways[key] += 1;
    } else if (entry.wrong > 0) {
      for (const key of poolKeys) {
        const counts = troubleDueCountsByPool[key];
        counts.set(entry.dueDay, (counts.get(entry.dueDay) || 0) + 1);
      }
    }
  }
  const rawStats = parseSpellingGameplayStats(stats);
  return {
    ...rawStats,
    catalogueV1: spellingStatsCatalogue(words, options),
    reviewScheduleV1: {
      version: SPELLING_REVIEW_SCHEDULE_VERSION,
      duePools: Object.fromEntries(SPELLING_STATS_POOL_KEYS.map((key) => [
        key,
        [...dueCountsByPool[key].entries()].sort((left, right) => left[0] - right[0]),
      ])),
      troubleDuePools: Object.fromEntries(SPELLING_STATS_POOL_KEYS.map((key) => [
        key,
        [...troubleDueCountsByPool[key].entries()].sort((left, right) => left[0] - right[0]),
      ])),
      troubleAlways,
    },
  };
}

/**
 * Apply only the changed session rows to the persisted catalogue aggregates.
 * Work is proportional to the active round, never the learner's lifetime.
 */
export function updateSpellingGameplayStats(
  rawValue = {},
  words = [],
  previousData = {},
  nextData = {},
  now = Date.now(),
  options = {},
) {
  const raw = parseSpellingGameplayStats(rawValue);
  const schedule = normaliseReviewSchedule(raw.reviewScheduleV1);
  if (!schedule) return raw;
  const today = Math.floor((Number.isFinite(Number(now)) ? Number(now) : Date.now()) / DAY_MS);
  const pools = materialiseSpellingGameplayStats(raw, now);
  const maps = scheduleMaps(schedule);
  const wordsBySlug = new Map((Array.isArray(words) ? words : [])
    .filter((word) => typeof word?.slug === 'string' && word.slug)
    .map((word) => [word.slug, word]));
  const previousProgress = isPlainObject(previousData?.progress) ? previousData.progress : {};
  const nextProgress = isPlainObject(nextData?.progress) ? nextData.progress : {};
  const slugs = new Set([...Object.keys(previousProgress), ...Object.keys(nextProgress)]);

  for (const slug of slugs) {
    const word = wordsBySlug.get(slug);
    if (!word) continue;
    const before = progressRecord(previousProgress[slug], today);
    const after = progressRecord(nextProgress[slug], today);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    const poolKeys = spellingPoolKeysForWord(word);
    applyProgressToSchedule(maps, poolKeys, before, -1);
    applyProgressToSchedule(maps, poolKeys, after, 1);
    for (const key of poolKeys) {
      const pool = pools[key];
      pool.secure += Number(after.stage >= 4) - Number(before.stage >= 4);
      pool.fresh += Number(after.attempts === 0) - Number(before.attempts === 0);
      pool.attempts += after.attempts - before.attempts;
      pool.correct += after.correct - before.correct;
      pool.secure = Math.max(0, pool.secure);
      pool.fresh = Math.max(0, pool.fresh);
      pool.attempts = Math.max(0, pool.attempts);
      pool.correct = Math.max(0, pool.correct);
      pool.accuracy = pool.attempts ? Math.round((pool.correct / pool.attempts) * 100) : null;
    }
  }

  const nextSchedule = serialiseSchedule(maps);
  for (const key of SPELLING_STATS_POOL_KEYS) {
    pools[key].due = nextSchedule.duePools[key]
      .reduce((total, [day, count]) => total + (day <= today ? count : 0), 0);
    pools[key].trouble = nextSchedule.troubleAlways[key]
      + nextSchedule.troubleDuePools[key]
        .reduce((total, [day, count]) => total + (day <= today ? count : 0), 0);
  }
  return {
    ...pools,
    catalogueV1: spellingStatsCatalogue(words, options),
    reviewScheduleV1: nextSchedule,
  };
}

/**
 * Return the six public pools with `due` evaluated against the request clock.
 * Older rows without a schedule retain their stored snapshot until the next
 * spelling command writes the versioned histogram.
 */
export function materialiseSpellingGameplayStats(rawValue = {}, now = Date.now()) {
  const raw = parseSpellingGameplayStats(rawValue);
  const schedule = normaliseReviewSchedule(raw.reviewScheduleV1);
  const today = Math.floor((Number.isFinite(Number(now)) ? Number(now) : Date.now()) / DAY_MS);
  return Object.fromEntries(SPELLING_STATS_POOL_KEYS.map((key) => {
    const pool = isPlainObject(raw[key]) ? cloneSerialisable(raw[key]) : {};
    if (schedule) {
      pool.due = schedule.duePools[key].reduce(
        (total, [day, count]) => total + (day <= today ? count : 0),
        0,
      );
      pool.trouble = schedule.troubleAlways[key] + schedule.troubleDuePools[key].reduce(
        (total, [day, count]) => total + (day <= today ? count : 0),
        0,
      );
    }
    return [key, pool];
  }));
}
