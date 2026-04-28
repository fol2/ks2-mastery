import { normaliseMonsterBranch } from './monsters.js';

const OVERLAY_KINDS = new Set(['caught', 'evolve', 'mega']);

export function isMonsterCelebrationEvent(event) {
  return event?.type === 'reward.monster'
    && OVERLAY_KINDS.has(event.kind)
    && typeof event.monsterId === 'string'
    && event.monster
    && typeof event.monster === 'object'
    && !Array.isArray(event.monster);
}

function normaliseProgressSnapshot(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    mastered: Math.max(0, Number(raw.mastered) || 0),
    stage: Math.max(0, Math.min(4, Number(raw.stage) || 0)),
    level: Math.max(0, Math.min(10, Number(raw.level) || 0)),
    caught: raw.caught === true,
    branch: normaliseMonsterBranch(raw.branch),
  };
}

export function normaliseMonsterCelebrationEvent(event) {
  if (!isMonsterCelebrationEvent(event)) return null;
  const monster = event.monster;
  return {
    id: typeof event.id === 'string' && event.id
      ? event.id
      : `reward.monster:${event.learnerId || 'default'}:${event.monsterId}:${event.kind}`,
    type: 'reward.monster',
    kind: event.kind,
    learnerId: typeof event.learnerId === 'string' ? event.learnerId : 'default',
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
