import {
  REASON_TAGS,
  MAX_SAME_SIGNATURE_PER_SESSION,
  MAX_SAME_SIGNATURE_ACROSS_ATTEMPTS,
  MAX_SAME_SIGNATURE_DAYS,
  MISCONCEPTION_RETRY_WINDOW,
  MISCONCEPTION_RETRY_PREFER_DIFFERENT_TEMPLATE,
  SPACED_RETURN_MIN_DAYS,
  RETENTION_AFTER_SECURE_MIN_DAYS,
  EXPOSURE_WEIGHT_BLOCKED,
  EXPOSURE_WEIGHT_PENALISED,
  EXPOSURE_WEIGHT_DAY_AVOIDED,
} from './scheduler-manifest.js';
import { PUNCTUATION_CONTENT_INDEXES } from './content.js';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_MS = 60 * 1000;

const SMART_MODE_CYCLE = Object.freeze(['choose', 'insert', 'fix', 'transfer', 'combine', 'paragraph']);
const GUIDED_MODE_CYCLE = Object.freeze(['choose', 'insert', 'fix']);
const CLUSTER_MODE = Object.freeze({
  endmarks: 'endmarks',
  apostrophe: 'apostrophe',
  speech: 'speech',
  comma_flow: 'comma_flow',
  boundary: 'boundary',
  structure: 'structure',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function timestamp(now = Date.now) {
  const value = typeof now === 'function' ? Number(now()) : Number(now);
  return Number.isFinite(value) ? value : Date.now();
}

function positiveTimestamp(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function createMemoryState() {
  return {
    attempts: 0,
    correct: 0,
    incorrect: 0,
    streak: 0,
    lapses: 0,
    ease: 2.3,
    intervalDays: 0,
    dueAt: 0,
    firstCorrectAt: null,
    lastCorrectAt: null,
    lastSeen: 0,
    lastCorrect: null,
    recent: [],
  };
}

export function normaliseMemoryState(value) {
  const raw = isPlainObject(value) ? value : {};
  return {
    attempts: Math.max(0, Number(raw.attempts) || 0),
    correct: Math.max(0, Number(raw.correct) || 0),
    incorrect: Math.max(0, Number(raw.incorrect) || 0),
    streak: Math.max(0, Number(raw.streak) || 0),
    lapses: Math.max(0, Number(raw.lapses) || 0),
    ease: Math.max(1.25, Math.min(3.2, Number(raw.ease) || 2.3)),
    intervalDays: Math.max(0, Number(raw.intervalDays) || 0),
    dueAt: Math.max(0, Number(raw.dueAt) || 0),
    firstCorrectAt: positiveTimestamp(raw.firstCorrectAt),
    lastCorrectAt: positiveTimestamp(raw.lastCorrectAt),
    lastSeen: Math.max(0, Number(raw.lastSeen) || 0),
    lastCorrect: raw.lastCorrect === true || raw.lastCorrect === false ? raw.lastCorrect : null,
    recent: Array.isArray(raw.recent) ? raw.recent.map((entry) => (entry ? 1 : 0)).slice(-12) : [],
  };
}

export function memorySnapshot(value, now = Date.now) {
  const state = normaliseMemoryState(value);
  const attempts = state.attempts;
  const accuracy = attempts ? state.correct / attempts : 0;
  const correctSpanDays = state.firstCorrectAt != null && state.lastCorrectAt != null && state.lastCorrectAt >= state.firstCorrectAt
    ? Math.floor((state.lastCorrectAt - state.firstCorrectAt) / DAY_MS)
    : 0;
  let bucket = 'new';
  if (!attempts) bucket = 'new';
  else if (accuracy < 0.65 || (state.lapses >= 2 && state.streak === 0)) bucket = 'weak';
  else if (state.streak >= 3 && accuracy >= 0.8 && correctSpanDays >= 7) bucket = 'secure';
  else if (state.dueAt && state.dueAt <= timestamp(now)) bucket = 'due';
  else bucket = 'learning';

  const mastery = attempts === 0
    ? 0
    : Math.round(100 * (
        accuracy * 0.55
        + Math.min(correctSpanDays / 14, 1) * 0.25
        + Math.min(state.streak / 4, 1) * 0.20
      ));

  return {
    state,
    attempts,
    accuracy,
    correctSpanDays,
    bucket,
    mastery,
    secure: bucket === 'secure',
    due: state.dueAt > 0 && state.dueAt <= timestamp(now),
  };
}

export function updateMemoryState(rawState, wasCorrect, now = Date.now, options = {}) {
  const state = normaliseMemoryState(rawState);
  const nowValue = timestamp(now);
  const supported = Boolean(options?.supported);
  state.attempts += 1;
  state.lastSeen = nowValue;
  state.lastCorrect = Boolean(wasCorrect);
  state.recent.push(wasCorrect ? 1 : 0);
  if (state.recent.length > 12) state.recent = state.recent.slice(-12);

  if (wasCorrect) {
    state.correct += 1;
    if (supported) {
      state.ease = Math.max(1.25, Math.min(3.2, state.ease + 0.02));
      state.intervalDays = Math.max(1, state.intervalDays || 1);
      state.dueAt = nowValue + DAY_MS;
    } else {
      state.streak += 1;
      if (state.firstCorrectAt == null) state.firstCorrectAt = nowValue;
      state.lastCorrectAt = nowValue;
      if (state.attempts === 1) state.intervalDays = 1;
      else if (state.streak === 2) state.intervalDays = Math.max(2, state.intervalDays + 2);
      else state.intervalDays = Math.max(1, Math.round((state.intervalDays || 1) * state.ease));
      state.ease = Math.max(1.25, Math.min(3.2, state.ease + 0.06));
      state.dueAt = nowValue + state.intervalDays * DAY_MS;
    }
  } else {
    state.incorrect += 1;
    state.lapses += 1;
    state.streak = 0;
    state.ease = Math.max(1.25, Math.min(3.2, state.ease - 0.18));
    state.intervalDays = 0;
    state.dueAt = nowValue + 20 * MIN_MS;
  }

  return state;
}

function progressForItem(progress, itemId) {
  return normaliseMemoryState(progress?.items?.[itemId]);
}

function progressForFacet(progress, skillId, mode) {
  return normaliseMemoryState(progress?.facets?.[`${skillId}::${mode}`]);
}

function skillName(indexes, skillId) {
  return indexes.skillById.get(skillId)?.name || skillId;
}

function targetMode(session, prefs = {}) {
  return targetModeOptions(session, prefs)[0] || 'choose';
}

function targetModeOptions(session, prefs = {}) {
  const mode = session?.mode || prefs.mode || 'smart';
  const answeredCount = Number(session?.answeredCount) || 0;
  const rotate = (cycle) => {
    const start = answeredCount % cycle.length;
    return [...cycle.slice(start), ...cycle.slice(0, start)];
  };
  if (mode === 'guided') {
    return rotate(GUIDED_MODE_CYCLE);
  }
  if (mode === 'endmarks' || mode === 'apostrophe' || mode === 'speech' || mode === 'comma_flow' || mode === 'boundary' || mode === 'structure') {
    return rotate(SMART_MODE_CYCLE);
  }
  return rotate(SMART_MODE_CYCLE);
}

function targetCluster(prefs = {}, session = {}) {
  const mode = session?.mode || prefs.mode;
  if (mode === 'endmarks') return 'endmarks';
  if (mode === 'apostrophe') return 'apostrophe';
  if (mode === 'speech') return 'speech';
  if (mode === 'comma_flow') return 'comma_flow';
  if (mode === 'boundary') return 'boundary';
  if (mode === 'structure') return 'structure';
  return null;
}

function candidateItems(indexes, { mode, clusterId, skillId }) {
  const source = indexes.itemsByMode.get(mode) || [];
  return source.filter((item) => {
    const skill = indexes.skillById.get(item.skillIds?.[0]);
    if (!skill?.published) return false;
    if (clusterId && item.clusterId !== clusterId) return false;
    if (skillId && !item.skillIds?.includes(skillId)) return false;
    return true;
  });
}

function deterministicRandom(random = Math.random) {
  const value = typeof random === 'function' ? Number(random()) : Math.random();
  return Number.isFinite(value) ? Math.max(0, Math.min(0.999999, value)) : 0;
}

function weightedPick(rows, random = Math.random) {
  if (!rows.length) return null;
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  if (!(total > 0)) return rows[0].item;
  let cursor = deterministicRandom(random) * total;
  for (const row of rows) {
    cursor -= row.weight;
    if (cursor <= 0) return row.item;
  }
  return rows[rows.length - 1].item;
}

/**
 * Compute exposure penalty multiplier for a candidate item based on signature history.
 *
 * Three tiers (applied in priority order):
 *   1. Per-session block:   signature already selected this session → ×0.01
 *   2. Recent-attempts:     signature in last N attempts              → ×0.1
 *   3. Day-window avoidance: signature seen within last 7 days        → ×0.3
 *
 * Returns 1.0 when no penalty applies.
 * Fixed items (no variantSignature) are never penalised.
 */
function signatureExposurePenalty(item, progress, sessionSignatures, now, { isMisconceptionRetry = false } = {}) {
  if (!item.variantSignature) return 1.0;

  const sig = item.variantSignature;
  const attempts = Array.isArray(progress?.attempts) ? progress.attempts : [];

  // Per-session block (relaxed for misconception-retry)
  if (!isMisconceptionRetry && sessionSignatures.has(sig)) return EXPOSURE_WEIGHT_BLOCKED;

  // Recent-attempts lookback
  const recentAttempts = attempts.slice(-MAX_SAME_SIGNATURE_ACROSS_ATTEMPTS);
  const recentHit = recentAttempts.some(a => a?.variantSignature === sig);
  if (recentHit) return EXPOSURE_WEIGHT_PENALISED;

  // Day-window avoidance
  const dayMs = MAX_SAME_SIGNATURE_DAYS * DAY_MS;
  const nowMs = typeof now === 'function' ? now() : now;
  const cutoff = (Number.isFinite(nowMs) ? nowMs : 0) - dayMs;
  const dayHit = attempts.some(a => a?.variantSignature === sig && (a.timestamp || 0) > cutoff);
  if (dayHit) return EXPOSURE_WEIGHT_DAY_AVOIDED;

  return 1.0;
}

function recentMissForItem(progress, item) {
  const attempts = Array.isArray(progress?.attempts) ? progress.attempts : [];
  return attempts.slice(-12).reverse().find((attempt) => {
    if (!attempt || attempt.correct === true) return false;
    if (attempt.itemId === item.id) return true;
    if (item.variantSignature && attempt.variantSignature === item.variantSignature) return true;
    if (attempt.mode !== item.mode) return false;
    const attemptSkills = Array.isArray(attempt.skillIds) ? attempt.skillIds : [];
    return item.skillIds?.some((skillId) => attemptSkills.includes(skillId));
  }) || null;
}

function strongestFacet(indexes, progress, item, now) {
  return (item.skillIds || [])
    .map((skillId) => {
      const snap = memorySnapshot(progressForFacet(progress, skillId, item.mode), now);
      const bucketRank = snap.bucket === 'weak' ? 4 : snap.bucket === 'due' ? 3 : snap.bucket === 'learning' ? 2 : snap.bucket === 'new' ? 1 : 0;
      return {
        skillId,
        skillName: skillName(indexes, skillId),
        mode: item.mode,
        clusterId: item.clusterId || null,
        bucket: snap.bucket,
        mastery: snap.mastery,
        rank: bucketRank,
      };
    })
    .sort((a, b) => b.rank - a.rank || a.mastery - b.mastery || a.skillId.localeCompare(b.skillId))[0] || null;
}

function weakCandidateRow(indexes, progress, item, now, order, recent, recentSignatures, sessionSignatures) {
  const itemSnap = memorySnapshot(progressForItem(progress, item.id), now);
  const facet = strongestFacet(indexes, progress, item, now);
  const recentMiss = recentMissForItem(progress, item);
  let priority = 10;
  let source = 'fallback';
  let bucket = itemSnap.bucket;

  if (facet?.bucket === 'weak') {
    priority = 90;
    source = 'weak_facet';
    bucket = 'weak';
  } else if (itemSnap.bucket === 'weak') {
    priority = 82;
    source = 'weak_item';
    bucket = 'weak';
  } else if (recentMiss) {
    priority = 74;
    source = 'recent_miss';
    bucket = 'weak';
  } else if (facet?.bucket === 'due') {
    priority = 62;
    source = 'due_facet';
    bucket = 'due';
  } else if (itemSnap.bucket === 'due') {
    priority = 54;
    source = 'due_item';
    bucket = 'due';
  } else if (itemSnap.bucket === 'new' || facet?.bucket === 'new') {
    priority = 24;
    source = 'fallback';
    bucket = 'new';
  } else if (itemSnap.bucket === 'secure') {
    priority = 4;
    source = 'fallback';
    bucket = 'secure';
  }

  if (recent.has(item.id)) priority *= 0.08;
  else if (item.variantSignature && recentSignatures.has(item.variantSignature)) priority *= 0.18;

  // Per-signature exposure limit penalty (3-tier)
  const exposureMul = signatureExposurePenalty(item, progress, sessionSignatures || new Set(), now);
  priority *= exposureMul;

  const focusSkillId = facet?.skillId || item.skillIds?.[0] || '';
  return {
    item,
    order,
    priority,
    weight: Math.max(EXPOSURE_WEIGHT_BLOCKED, priority),
    weakFocus: {
      skillId: focusSkillId,
      skillName: skillName(indexes, focusSkillId),
      mode: item.mode,
      clusterId: item.clusterId || null,
      bucket,
      source,
    },
  };
}

function publishedItem(indexes, item) {
  if (!item) return false;
  const skill = indexes.skillById.get(item.skillIds?.[0]);
  return Boolean(skill?.published);
}

function facetEvidenceRows(progress, now, bucket) {
  const facets = isPlainObject(progress?.facets) ? progress.facets : {};
  return Object.entries(facets)
    .map(([key, value]) => {
      const [skillId, mode] = key.split('::');
      const snap = memorySnapshot(value, now);
      return { skillId, mode, snap };
    })
    .filter((entry) => entry.skillId && entry.mode && entry.snap.bucket === bucket)
    .sort((a, b) => a.snap.mastery - b.snap.mastery || a.skillId.localeCompare(b.skillId) || a.mode.localeCompare(b.mode));
}

function itemEvidenceRows(progress, now, bucket) {
  const items = isPlainObject(progress?.items) ? progress.items : {};
  return Object.entries(items)
    .map(([itemId, value]) => ({ itemId, snap: memorySnapshot(value, now) }))
    .filter((entry) => entry.itemId && entry.snap.bucket === bucket)
    .sort((a, b) => a.snap.mastery - b.snap.mastery || a.itemId.localeCompare(b.itemId));
}

function recentSignatureSet(indexes, session = {}, progress = {}) {
  const signatures = new Set();
  const recentIds = Array.isArray(session?.recentItemIds) ? session.recentItemIds.slice(-8) : [];
  for (const itemId of recentIds) {
    const signature = indexes.itemById.get(itemId)?.variantSignature;
    if (signature) signatures.add(signature);
  }
  const attempts = Array.isArray(progress?.attempts) ? progress.attempts.slice(-8) : [];
  for (const attempt of attempts) {
    if (typeof attempt?.variantSignature === 'string' && attempt.variantSignature) {
      signatures.add(attempt.variantSignature);
      continue;
    }
    const signature = indexes.itemById.get(attempt?.itemId)?.variantSignature;
    if (signature) signatures.add(signature);
  }
  return signatures;
}

function avoidRecentSignatureRows(rows, recentSignatures) {
  const freshRows = rows.filter((row) => {
    const signature = row.item?.variantSignature;
    return !signature || !recentSignatures.has(signature);
  });
  return freshRows.length ? freshRows : rows;
}

function avoidRecentSignatureItems(items, recentSignatures) {
  const freshItems = items.filter((item) => {
    const signature = item?.variantSignature;
    return !signature || !recentSignatures.has(signature);
  });
  return freshItems.length ? freshItems : items;
}

// --- Misconception retry helpers ---

function recentMisconceptionAttempt(progress, window) {
  const attempts = Array.isArray(progress?.attempts) ? progress.attempts : [];
  const lookback = attempts.slice(-window);
  for (let i = lookback.length - 1; i >= 0; i--) {
    const attempt = lookback[i];
    if (!attempt || attempt.correct === true) continue;
    const tags = Array.isArray(attempt.misconceptionTags) ? attempt.misconceptionTags : [];
    if (tags.length > 0) return attempt;
  }
  return null;
}

function misconceptionSiblingCandidates(indexes, missedAttempt, recentSignatures, retriedMisconceptions) {
  const missedTags = Array.isArray(missedAttempt.misconceptionTags) ? missedAttempt.misconceptionTags : [];
  const missedSignature = missedAttempt.variantSignature || '';
  const missedItemId = missedAttempt.itemId || '';

  // Collect all items sharing at least one misconception tag
  const candidateMap = new Map();
  const missedSkills = Array.isArray(missedAttempt.skillIds) ? missedAttempt.skillIds : [];

  for (const skillId of missedSkills) {
    const skillItems = indexes.itemsBySkill?.get(skillId) || [];
    for (const item of skillItems) {
      if (candidateMap.has(item.id)) continue;
      if (item.id === missedItemId) continue;
      const skill = indexes.skillById.get(item.skillIds?.[0]);
      if (!skill?.published) continue;
      const itemTags = Array.isArray(item.misconceptionTags) ? item.misconceptionTags : [];
      const sharedTag = missedTags.find((tag) => itemTags.includes(tag));
      if (!sharedTag) continue;
      // Must have different variant signature
      if (item.variantSignature && item.variantSignature === missedSignature) continue;
      // Must not be recently seen
      if (item.variantSignature && recentSignatures.has(item.variantSignature)) continue;
      // Must not already have been retried for this misconception in this session
      if (retriedMisconceptions.has(sharedTag)) continue;
      candidateMap.set(item.id, { item, sharedTag });
    }
  }

  // Also search by rewardUnitId for broader sibling coverage
  if (missedAttempt.rewardUnitId) {
    const unitItems = indexes.itemsByRewardUnit?.get(missedAttempt.rewardUnitId) || [];
    for (const item of unitItems) {
      if (candidateMap.has(item.id)) continue;
      if (item.id === missedItemId) continue;
      const skill = indexes.skillById.get(item.skillIds?.[0]);
      if (!skill?.published) continue;
      const itemTags = Array.isArray(item.misconceptionTags) ? item.misconceptionTags : [];
      const sharedTag = missedTags.find((tag) => itemTags.includes(tag));
      if (!sharedTag) continue;
      if (item.variantSignature && item.variantSignature === missedSignature) continue;
      if (item.variantSignature && recentSignatures.has(item.variantSignature)) continue;
      if (retriedMisconceptions.has(sharedTag)) continue;
      candidateMap.set(item.id, { item, sharedTag });
    }
  }

  return [...candidateMap.values()];
}

function rankMisconceptionCandidates(candidates, missedAttempt) {
  const missedTemplateId = missedAttempt.templateId || '';
  const missedStem = missedAttempt.stem || '';

  return candidates
    .map(({ item, sharedTag }) => {
      const itemTemplateId = item.templateId || '';
      const itemStem = item.stem || '';
      let rank;
      if (MISCONCEPTION_RETRY_PREFER_DIFFERENT_TEMPLATE && itemTemplateId && missedTemplateId && itemTemplateId !== missedTemplateId) {
        // Different template
        if (itemStem && missedStem && itemStem !== missedStem) {
          rank = 4; // Best: different template AND different stem
        } else {
          rank = 3; // Good: different template, same/no stem
        }
      } else {
        // Same template or no template info — different signature is the minimum
        rank = 1; // Lowest viable: same templateId, different signature
      }
      return { item, sharedTag, rank };
    })
    .sort((a, b) => b.rank - a.rank);
}

function selectMisconceptionRetry(indexes, progress, session, recentSignatures) {
  const retriedMisconceptions = new Set(
    Array.isArray(session?.retriedMisconceptions) ? session.retriedMisconceptions : []
  );
  const missedAttempt = recentMisconceptionAttempt(progress, MISCONCEPTION_RETRY_WINDOW);
  if (!missedAttempt) return null;

  const candidates = misconceptionSiblingCandidates(indexes, missedAttempt, recentSignatures, retriedMisconceptions);
  if (!candidates.length) return null;

  const ranked = rankMisconceptionCandidates(candidates, missedAttempt);
  if (!ranked.length) return null;

  const best = ranked[0];
  return {
    item: clone(best.item),
    reason: REASON_TAGS.MISCONCEPTION_RETRY,
    misconceptionTag: best.sharedTag,
  };
}

// --- End misconception retry helpers ---

function weakRows(indexes, progress, session, now, maxWindow) {
  const recent = new Set(Array.isArray(session?.recentItemIds) ? session.recentItemIds.slice(-6) : []);
  const recentSignatures = recentSignatureSet(indexes, session, progress);
  const sessionSignatures = new Set(
    Array.isArray(session?.selectedSignatures) ? session.selectedSignatures : []
  );
  const rows = [];
  const seen = new Set();
  const limit = Math.max(1, maxWindow);
  const addItem = (item) => {
    if (rows.length >= limit || !publishedItem(indexes, item) || seen.has(item.id)) return;
    seen.add(item.id);
    rows.push(weakCandidateRow(indexes, progress, item, now, rows.length, recent, recentSignatures, sessionSignatures));
  };
  const addFacet = ({ skillId, mode }) => {
    for (const item of indexes.itemsByMode.get(mode) || []) {
      if (item.skillIds?.includes(skillId)) addItem(item);
      if (rows.length >= limit) return;
    }
  };

  for (const entry of facetEvidenceRows(progress, now, 'weak')) addFacet(entry);
  for (const entry of itemEvidenceRows(progress, now, 'weak')) addItem(indexes.itemById.get(entry.itemId));
  for (const attempt of (Array.isArray(progress?.attempts) ? progress.attempts.slice(-12).reverse() : [])) {
    if (attempt?.correct === false) addItem(indexes.itemById.get(attempt.itemId));
  }
  for (const entry of facetEvidenceRows(progress, now, 'due')) addFacet(entry);
  for (const entry of itemEvidenceRows(progress, now, 'due')) addItem(indexes.itemById.get(entry.itemId));
  for (const item of indexes.items) {
    addItem(item);
    if (rows.length >= limit) break;
  }

  const sortedRows = rows.sort((a, b) => b.priority - a.priority || a.order - b.order);
  return avoidRecentSignatureRows(sortedRows, recentSignatures);
}

// --- Reason tag classification helpers ---

/**
 * Classify reason tag for weak-mode selection based on the weakFocus source and memory state.
 */
function classifyWeakReason(weakFocus, progress, item, session, now) {
  if (!weakFocus || !item) return REASON_TAGS.FALLBACK;

  const source = weakFocus.source;
  if (source === 'weak_facet' || source === 'weak_item') return REASON_TAGS.WEAK_SKILL_REPAIR;
  if (source === 'recent_miss') return REASON_TAGS.WEAK_SKILL_REPAIR;
  if (source === 'due_facet' || source === 'due_item') {
    // Check if this is a spaced return (lastCorrectAt exceeds threshold)
    const itemState = normaliseMemoryState(progress?.items?.[item.id]);
    if (itemState.lastCorrectAt) {
      const nowMs = timestamp(now);
      const daysSinceCorrect = (nowMs - itemState.lastCorrectAt) / DAY_MS;
      if (daysSinceCorrect >= SPACED_RETURN_MIN_DAYS) return REASON_TAGS.SPACED_RETURN;
    }
    return REASON_TAGS.DUE_REVIEW;
  }

  // Secure bucket → retention-after-secure
  if (weakFocus.bucket === 'secure') {
    const itemState = normaliseMemoryState(progress?.items?.[item.id]);
    if (itemState.lastCorrectAt) {
      const nowMs = timestamp(now);
      const daysSinceCorrect = (nowMs - itemState.lastCorrectAt) / DAY_MS;
      if (daysSinceCorrect >= RETENTION_AFTER_SECURE_MIN_DAYS) return REASON_TAGS.RETENTION_AFTER_SECURE;
    }
  }

  // Mixed review: item's mode differs from last 3 modes in session
  if (isMixedReview(item, session)) return REASON_TAGS.MIXED_REVIEW;

  return REASON_TAGS.FALLBACK;
}

/**
 * Classify reason tag for smart/GPS/cluster-mode selection based on memory state and session context.
 */
function classifySmartReason(indexes, progress, item, session, now) {
  if (!item) return REASON_TAGS.FALLBACK;

  const itemState = normaliseMemoryState(progress?.items?.[item.id]);
  const snap = memorySnapshot(itemState, now);
  const nowMs = timestamp(now);

  // Due review: item bucket is due
  if (snap.bucket === 'due') {
    // Spaced return: lastCorrectAt exceeds threshold
    if (itemState.lastCorrectAt) {
      const daysSinceCorrect = (nowMs - itemState.lastCorrectAt) / DAY_MS;
      if (daysSinceCorrect >= SPACED_RETURN_MIN_DAYS) return REASON_TAGS.SPACED_RETURN;
    }
    return REASON_TAGS.DUE_REVIEW;
  }

  // Weak bucket: weak skill repair
  if (snap.bucket === 'weak') return REASON_TAGS.WEAK_SKILL_REPAIR;

  // Secure bucket: retention after secure
  if (snap.bucket === 'secure') {
    if (itemState.lastCorrectAt) {
      const daysSinceCorrect = (nowMs - itemState.lastCorrectAt) / DAY_MS;
      if (daysSinceCorrect >= RETENTION_AFTER_SECURE_MIN_DAYS) return REASON_TAGS.RETENTION_AFTER_SECURE;
    }
  }

  // Mixed review: item's mode differs from last 3 modes in session
  if (isMixedReview(item, session)) return REASON_TAGS.MIXED_REVIEW;

  return REASON_TAGS.FALLBACK;
}

/**
 * Check whether the selected item's mode differs from the last 3 modes in session.
 */
function isMixedReview(item, session) {
  if (!item || !item.mode) return false;
  const recentIds = Array.isArray(session?.recentItemIds) ? session.recentItemIds : [];
  if (recentIds.length < 3) return false;
  const last3Modes = recentIds.slice(-3).map((id) => {
    // We cannot look up items by id here without indexes — use recentModes if available
    return null;
  });
  // Use session.recentModes if provided (an array of modes for recently shown items)
  const recentModes = Array.isArray(session?.recentModes) ? session.recentModes : [];
  if (recentModes.length < 3) return false;
  const lastThree = recentModes.slice(-3);
  return lastThree.every((m) => m !== item.mode);
}

// --- End reason tag classification helpers ---

export function selectPunctuationItem({
  indexes = PUNCTUATION_CONTENT_INDEXES,
  progress = {},
  session = {},
  prefs = {},
  now = Date.now,
  random = Math.random,
  candidateWindow = 32,
} = {}) {
  const sessionMode = session?.mode || prefs.mode || 'smart';
  const mode = sessionMode === 'weak' ? null : targetMode(session, prefs);
  const clusterId = targetCluster(prefs, session);
  const guidedSkillId = (session?.mode || prefs.mode) === 'guided'
    ? (session?.guidedSkillId || prefs.guidedSkillId || null)
    : null;
  const maxWindow = Math.max(1, candidateWindow);

  // --- Misconception retry (applies to all modes) ---
  const recentSignaturesForRetry = recentSignatureSet(indexes, session, progress);
  const misconceptionResult = selectMisconceptionRetry(indexes, progress, session, recentSignaturesForRetry);
  if (misconceptionResult) {
    return {
      item: misconceptionResult.item,
      reason: misconceptionResult.reason,
      targetMode: misconceptionResult.item?.mode || null,
      targetClusterId: misconceptionResult.item?.clusterId || null,
      weakFocus: null,
      inspectedCount: 1,
      candidateCount: 1,
    };
  }

  if (sessionMode === 'weak') {
    const rows = weakRows(indexes, progress, session, now, maxWindow);
    const picked = weightedPick(rows, random) || rows[0]?.item || null;
    const pickedRow = rows.find((row) => row.item.id === picked?.id) || null;
    const weakReason = classifyWeakReason(pickedRow?.weakFocus, progress, picked, session, now);
    return {
      item: picked ? clone(picked) : null,
      reason: weakReason,
      targetMode: picked?.mode || null,
      targetClusterId: picked?.clusterId || null,
      weakFocus: pickedRow ? clone(pickedRow.weakFocus) : null,
      inspectedCount: rows.length,
      candidateCount: indexes.items.length,
    };
  }

  const recentIds = Array.isArray(session?.recentItemIds) ? session.recentItemIds.slice(-6) : [];
  const recent = new Set(recentIds);
  const recentSignatures = recentSignaturesForRetry;
  const sessionSignatures = new Set(
    Array.isArray(session?.selectedSignatures) ? session.selectedSignatures : []
  );
  const isMisconceptionRetry = session?.selectionReason === REASON_TAGS.MISCONCEPTION_RETRY;
  const previousItemId = typeof session?.currentItemId === 'string' && session.currentItemId
    ? session.currentItemId
    : recentIds.at(-1) || null;
  const previousItemMode = previousItemId ? indexes.itemById.get(previousItemId)?.mode : null;
  const modeRows = targetModeOptions(session, prefs)
    .map((candidateMode) => {
      const modeSuppressed = previousItemMode === 'paragraph' && candidateMode === 'paragraph';
      const candidates = modeSuppressed
        ? []
        : candidateItems(indexes, { mode: candidateMode, clusterId, skillId: guidedSkillId });
      const nonRepeatCandidates = candidates.filter((item) => item.id !== previousItemId);
      return {
        mode: candidateMode,
        candidates,
        nonRepeatCandidates: avoidRecentSignatureItems(nonRepeatCandidates, recentSignatures),
      };
    });
  const selectedMode = modeRows.find((row) => row.nonRepeatCandidates.length)
    || modeRows.find((row) => row.candidates.length)
    || { mode, candidates: [], nonRepeatCandidates: [] };
  const candidates = selectedMode.nonRepeatCandidates.length ? selectedMode.nonRepeatCandidates : selectedMode.candidates;
  const windowed = candidates.slice(0, maxWindow);
  const rows = windowed.map((item) => {
    const snap = memorySnapshot(progressForItem(progress, item.id), now);
    let weight = 1;
    if (snap.bucket === 'due') weight *= 2.5;
    if (snap.bucket === 'weak') weight *= 2.9;
    if (snap.bucket === 'new') weight *= 1.35;
    if (snap.bucket === 'secure') weight *= 0.25;
    if (recent.has(item.id)) weight *= 0.12;
    else if (item.variantSignature && recentSignatures.has(item.variantSignature)) weight *= 0.2;
    // Per-signature exposure limit penalty (3-tier)
    weight *= signatureExposurePenalty(item, progress, sessionSignatures, now, { isMisconceptionRetry });
    return { item, weight: Math.max(EXPOSURE_WEIGHT_BLOCKED, weight) };
  }).filter((row) => row.weight > 0);

  const item = weightedPick(rows, random) || windowed[0] || null;
  const smartReason = classifySmartReason(indexes, progress, item, session, now);
  return {
    item: item ? clone(item) : null,
    reason: smartReason,
    targetMode: selectedMode.mode,
    targetClusterId: clusterId,
    weakFocus: null,
    inspectedCount: windowed.length,
    candidateCount: candidates.length,
  };
}

export function clusterModeForCluster(clusterId) {
  return CLUSTER_MODE[clusterId] || 'smart';
}
