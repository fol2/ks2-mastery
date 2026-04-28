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
    firstCorrectAt: Number.isFinite(Number(raw.firstCorrectAt)) ? Number(raw.firstCorrectAt) : null,
    lastCorrectAt: Number.isFinite(Number(raw.lastCorrectAt)) ? Number(raw.lastCorrectAt) : null,
    lastSeen: Math.max(0, Number(raw.lastSeen) || 0),
    lastCorrect: raw.lastCorrect === true || raw.lastCorrect === false ? raw.lastCorrect : null,
    recent: Array.isArray(raw.recent) ? raw.recent.map((entry) => (entry ? 1 : 0)).slice(-12) : [],
  };
}

export function memorySnapshot(value, now = Date.now) {
  const state = normaliseMemoryState(value);
  const attempts = state.attempts;
  const accuracy = attempts ? state.correct / attempts : 0;
  const correctSpanDays = state.firstCorrectAt != null && state.lastCorrectAt != null
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

function weakCandidateRow(indexes, progress, item, now, order, recent, recentSignatures) {
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

  const focusSkillId = facet?.skillId || item.skillIds?.[0] || '';
  return {
    item,
    order,
    priority,
    weight: Math.max(0.1, priority),
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

function weakRows(indexes, progress, session, now, maxWindow) {
  const recent = new Set(Array.isArray(session?.recentItemIds) ? session.recentItemIds.slice(-6) : []);
  const recentSignatures = recentSignatureSet(indexes, session, progress);
  const rows = [];
  const seen = new Set();
  const limit = Math.max(1, maxWindow);
  const addItem = (item) => {
    if (rows.length >= limit || !publishedItem(indexes, item) || seen.has(item.id)) return;
    seen.add(item.id);
    rows.push(weakCandidateRow(indexes, progress, item, now, rows.length, recent, recentSignatures));
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

  return rows.sort((a, b) => b.priority - a.priority || a.order - b.order);
}

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
  if (sessionMode === 'weak') {
    const rows = weakRows(indexes, progress, session, now, maxWindow);
    const picked = weightedPick(rows, random) || rows[0]?.item || null;
    const pickedRow = rows.find((row) => row.item.id === picked?.id) || null;
    return {
      item: picked ? clone(picked) : null,
      targetMode: picked?.mode || null,
      targetClusterId: picked?.clusterId || null,
      weakFocus: pickedRow ? clone(pickedRow.weakFocus) : null,
      inspectedCount: rows.length,
      candidateCount: indexes.items.length,
    };
  }

  const recentIds = Array.isArray(session?.recentItemIds) ? session.recentItemIds.slice(-6) : [];
  const recent = new Set(recentIds);
  const recentSignatures = recentSignatureSet(indexes, session, progress);
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
      return {
        mode: candidateMode,
        candidates,
        nonRepeatCandidates: candidates.filter((item) => item.id !== previousItemId),
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
    return { item, weight };
  }).filter((row) => row.weight > 0);

  const item = weightedPick(rows, random) || windowed[0] || null;
  return {
    item: item ? clone(item) : null,
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
