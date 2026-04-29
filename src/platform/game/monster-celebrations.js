import { normaliseMonsterBranch } from './monsters.js';

const OVERLAY_KINDS = new Set(['caught', 'evolve', 'mega']);
const REWARD_PRESENTATION_TYPE = 'reward.presentation';

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function isLegacyMonsterCelebrationEvent(event) {
  return event?.type === 'reward.monster'
    && OVERLAY_KINDS.has(event.kind)
    && typeof event.monsterId === 'string'
    && event.monster
    && typeof event.monster === 'object'
    && !Array.isArray(event.monster);
}

function normaliseProgressSnapshot(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const snapshot = {
    mastered: Math.max(0, Number(raw.mastered) || 0),
    stage: Math.max(0, Math.min(4, Number(raw.stage) || 0)),
    level: Math.max(0, Math.min(10, Number(raw.level) || 0)),
    caught: raw.caught === true,
    branch: normaliseMonsterBranch(raw.branch),
  };
  if (typeof raw.displayState === 'string' && raw.displayState.trim()) {
    snapshot.displayState = raw.displayState.trim();
  }
  if ('displayStars' in raw || 'stars' in raw || 'starHighWater' in raw) {
    snapshot.displayStars = Math.max(0, Math.floor(Number(raw.displayStars ?? raw.stars ?? raw.starHighWater) || 0));
  }
  if ('displayStage' in raw) {
    snapshot.displayStage = Math.max(0, Math.min(5, Math.floor(Number(raw.displayStage) || 0)));
  }
  if ('starStage' in raw) {
    snapshot.starStage = Math.max(0, Math.min(5, Math.floor(Number(raw.starStage) || 0)));
  }
  return snapshot;
}

export function normaliseMonsterCelebrationEvent(event) {
  if (isLegacyMonsterCelebrationEvent(event)) return normaliseLegacyMonsterCelebrationEvent(event);
  return normalisePresentationCelebrationEvent(event) || normaliseQueuedPresentationCelebrationEvent(event);
}

export function isMonsterCelebrationEvent(event) {
  return Boolean(normaliseMonsterCelebrationEvent(event));
}

function normaliseLegacyMonsterCelebrationEvent(event) {
  const monster = event.monster;
  const id = typeof event.id === 'string' && event.id
    ? event.id
    : `reward.monster:${event.learnerId || 'default'}:${event.monsterId}:${event.kind}`;
  return {
    id,
    type: 'reward.monster',
    kind: event.kind,
    learnerId: typeof event.learnerId === 'string' ? event.learnerId : 'default',
    subjectId: cleanString(event.subjectId),
    monsterId: event.monsterId,
    monster: {
      id: typeof monster.id === 'string' ? monster.id : event.monsterId,
      name: typeof monster.name === 'string' ? monster.name : 'Monster',
      blurb: typeof monster.blurb === 'string' ? monster.blurb : '',
      accent: typeof monster.accent === 'string' ? monster.accent : '#3E6FA8',
      secondary: typeof monster.secondary === 'string' ? monster.secondary : '#FFE9A8',
      pale: typeof monster.pale === 'string' ? monster.pale : '#F8F4EA',
      nameByStage: Array.isArray(monster.nameByStage)
        ? monster.nameByStage.filter((name) => typeof name === 'string').slice(0, 5)
        : [],
      masteredMax: Math.max(1, Number(monster.masteredMax) || 100),
    },
    previous: normaliseProgressSnapshot(event.previous),
    next: normaliseProgressSnapshot(event.next),
    createdAt: Math.max(0, Number(event.createdAt) || Date.now()),
    toast: event.toast && typeof event.toast === 'object' && !Array.isArray(event.toast)
      ? {
          title: typeof event.toast.title === 'string' ? event.toast.title : '',
          body: typeof event.toast.body === 'string' ? event.toast.body : '',
        }
      : null,
    presentationAckKey: `reward:reward.presentation:${id}:celebration:0`,
  };
}

function presentationAckKey(eventId, intent, index = 0) {
  const id = cleanString(eventId);
  if (!id) return '';
  const explicit = cleanString(intent?.dedupeKey);
  if (explicit) return explicit;
  const suffix = cleanString(intent?.intentId, String(index));
  return `reward:${id}:celebration:${suffix}`;
}

function normalisePresentationCelebrationEvent(event) {
  if (!isPlainObject(event) || event.type !== REWARD_PRESENTATION_TYPE) return null;
  const celebrationIntents = Array.isArray(event.presentations?.celebration)
    ? event.presentations.celebration
    : [];
  const celebrationIndex = celebrationIntents.findIndex(isPlainObject);
  const celebrationIntent = celebrationIndex >= 0 ? celebrationIntents[celebrationIndex] : null;
  if (!celebrationIntent) return null;

  const payload = isPlainObject(event.payload) ? event.payload : {};
  const monster = isPlainObject(payload.monster) ? payload.monster : {};
  const monsterId = payload.monsterId || celebrationIntent.assetRef?.monsterId || monster.id || '';
  const normalisedMonster = {
    ...monster,
    id: monster.id || monsterId,
    name: monster.name || celebrationIntent.title || 'Reward',
  };
  const previous = event.fromState || {};
  const next = {
    ...(event.toState || {}),
    branch: event.toState?.branch || celebrationIntent.assetRef?.branch || previous.branch,
    stage: event.toState?.stage ?? celebrationIntent.assetRef?.stage,
  };

  return {
    id: event.id,
    type: REWARD_PRESENTATION_TYPE,
    kind: celebrationIntent.visualKind || event.kind,
    learnerId: event.learnerId,
    subjectId: cleanString(event.subjectId, event.producerType === 'subject' ? event.producerId : ''),
    producerType: cleanString(event.producerType),
    producerId: cleanString(event.producerId),
    rewardType: cleanString(event.rewardType),
    monsterId,
    monster: normalisedMonster,
    previous: normaliseProgressSnapshot(previous),
    next: normaliseProgressSnapshot(next),
    createdAt: Math.max(0, Number(event.occurredAt) || Date.now()),
    sourceEventId: event.sourceEventId || '',
    presentationAckKey: presentationAckKey(event.id, celebrationIntent, celebrationIndex),
  };
}

function normaliseQueuedPresentationCelebrationEvent(event) {
  if (!isPlainObject(event) || event.type !== REWARD_PRESENTATION_TYPE) return null;
  if (!isPlainObject(event.monster)) return null;
  const id = cleanString(event.id);
  const kind = cleanString(event.kind);
  if (!id || !kind) return null;
  return {
    id,
    type: REWARD_PRESENTATION_TYPE,
    kind,
    learnerId: cleanString(event.learnerId, 'default'),
    subjectId: cleanString(event.subjectId, event.producerType === 'subject' ? event.producerId : ''),
    producerType: cleanString(event.producerType),
    producerId: cleanString(event.producerId),
    rewardType: cleanString(event.rewardType),
    monsterId: cleanString(event.monsterId),
    monster: {
      ...event.monster,
      id: cleanString(event.monster.id, cleanString(event.monsterId)),
      name: cleanString(event.monster.name, 'Reward'),
    },
    previous: normaliseProgressSnapshot(event.previous),
    next: normaliseProgressSnapshot(event.next),
    createdAt: Math.max(0, Number(event.createdAt) || Date.now()),
    sourceEventId: cleanString(event.sourceEventId),
    presentationAckKey: cleanString(event.presentationAckKey),
  };
}

export function normaliseMonsterCelebrationEvents(events) {
  const list = Array.isArray(events) ? events : [events];
  return list.map(normaliseMonsterCelebrationEvent).filter(Boolean);
}

export function normaliseMonsterCelebrations(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    pending: normaliseMonsterCelebrationEvents(raw.pending).slice(-25),
    queue: normaliseMonsterCelebrationEvents(raw.queue).slice(-25),
  };
}

export function emptyMonsterCelebrations() {
  return {
    pending: [],
    queue: [],
  };
}

function subjectIsInSession(subjectId, ui) {
  const phase = ui?.phase;
  if (subjectId === 'spelling') return phase === 'session';
  if (subjectId === 'punctuation') return phase === 'active-item' || phase === 'feedback';
  if (subjectId === 'grammar') return phase === 'session' || phase === 'feedback';
  return false;
}

export function subjectSessionEnded(subjectId, previousUi, nextUi) {
  return subjectIsInSession(subjectId, previousUi) && !subjectIsInSession(subjectId, nextUi);
}

export function spellingSessionEnded(previousUi, nextUi) {
  return subjectSessionEnded('spelling', previousUi, nextUi);
}

export function shouldDelayMonsterCelebrations(subjectId, previousUi, nextUi) {
  return subjectIsInSession(subjectId, previousUi) || subjectIsInSession(subjectId, nextUi);
}
