import { PUNCTUATION_CONTENT_INDEXES } from './content.js';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_MS = 60 * 1000;

const SMART_MODE_CYCLE = Object.freeze(['choose', 'insert', 'fix', 'transfer']);
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

function targetMode(session, prefs = {}) {
  const mode = session?.mode || prefs.mode || 'smart';
  if (mode === 'guided') {
    return GUIDED_MODE_CYCLE[(Number(session?.answeredCount) || 0) % GUIDED_MODE_CYCLE.length];
  }
  if (mode === 'endmarks' || mode === 'apostrophe' || mode === 'speech' || mode === 'comma_flow' || mode === 'boundary' || mode === 'structure') {
    return SMART_MODE_CYCLE[(Number(session?.answeredCount) || 0) % SMART_MODE_CYCLE.length];
  }
  return SMART_MODE_CYCLE[(Number(session?.answeredCount) || 0) % SMART_MODE_CYCLE.length];
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

export function selectPunctuationItem({
  indexes = PUNCTUATION_CONTENT_INDEXES,
  progress = {},
  session = {},
  prefs = {},
  now = Date.now,
  random = Math.random,
  candidateWindow = 32,
} = {}) {
  const mode = targetMode(session, prefs);
  const clusterId = targetCluster(prefs, session);
  const guidedSkillId = (session?.mode || prefs.mode) === 'guided'
    ? (session?.guidedSkillId || prefs.guidedSkillId || null)
    : null;
  const recent = new Set(Array.isArray(session?.recentItemIds) ? session.recentItemIds.slice(-6) : []);
  const candidates = candidateItems(indexes, { mode, clusterId, skillId: guidedSkillId });
  const windowed = candidates.slice(0, Math.max(1, candidateWindow));
  const rows = windowed.map((item) => {
    const snap = memorySnapshot(progressForItem(progress, item.id), now);
    let weight = 1;
    if (snap.bucket === 'due') weight *= 2.5;
    if (snap.bucket === 'weak') weight *= 2.9;
    if (snap.bucket === 'new') weight *= 1.35;
    if (snap.bucket === 'secure') weight *= 0.25;
    if (recent.has(item.id)) weight *= 0.12;
    return { item, weight };
  }).filter((row) => row.weight > 0);

  const item = weightedPick(rows, random) || windowed[0] || null;
  return {
    item: item ? clone(item) : null,
    targetMode: mode,
    targetClusterId: clusterId,
    inspectedCount: windowed.length,
    candidateCount: candidates.length,
  };
}

export function clusterModeForCluster(clusterId) {
  return CLUSTER_MODE[clusterId] || 'smart';
}
