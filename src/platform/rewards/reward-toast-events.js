export const REWARD_TOAST_PRESENTATION_TYPE = 'reward.presentation.toast';

const REWARD_PRESENTATION_TYPE = 'reward.presentation';
const LEGACY_REWARD_MONSTER_TYPE = 'reward.monster';
const LEGACY_REWARD_TOAST_TYPE = 'reward.toast';

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, fallback = '') => (typeof value === 'string' && value.trim()) || fallback;

function ackKey(eventId, intentId = 0) {
  const id = text(eventId);
  if (!id) return '';
  const suffix = intentId == null ? '0' : text(String(intentId), '0');
  return `reward:${id}:toast:${suffix}`;
}

function presentationId(event) {
  const id = text(event?.id || event?.sourceEventId);
  return id ? `reward.presentation:${id}` : '';
}

function monsterCopy(event) {
  const name = text(event?.monster?.name, 'Monster');
  if (event?.kind === 'caught') return [`${name} joined your Codex`, 'You caught a new friend!'];
  if (event?.kind === 'evolve') return [`${name} evolved`, `${name} grew stronger after that mastery milestone.`];
  if (event?.kind === 'mega') return [`${name} reached its final form`, `${name} reached its mega form.`];
  return [
    text(event?.toast?.title || event?.title || event?.monster?.name, 'Notification'),
    text(event?.toast?.body || event?.body || event?.message),
  ];
}

function plainCopy(event) {
  return [
    text(event?.toast?.title || event?.title || event?.monster?.name, 'Notification'),
    text(event?.toast?.body || event?.body || event?.message),
  ];
}

function monsterAssetRef(event) {
  return {
    family: 'monster',
    monsterId: text(event?.monsterId || event?.monster?.id),
    branch: text(event?.next?.branch || event?.previous?.branch),
    stage: event?.next?.stage,
  };
}

function toastRow(intent, event, {
  eventId = '',
  index = 0,
  title = '',
  body = '',
  tone = 'neutral',
  assetRef = undefined,
  monster = undefined,
} = {}) {
  if (!isObject(intent)) return null;
  const intentId = text(intent.intentId, index);
  const dedupeKey = text(intent.dedupeKey, ackKey(eventId, intentId));
  return {
    id: text(intent.id || dedupeKey || eventId),
    type: REWARD_TOAST_PRESENTATION_TYPE,
    rewardType: text(event?.rewardType || event?.type),
    kind: text(event?.kind || intent.kind, 'toast'),
    title: text(intent.title, text(title, 'Notification')),
    body: text(intent.body, body),
    tone: text(intent.tone, tone),
    dedupeKey,
    assetRef: isObject(intent.assetRef) ? intent.assetRef : assetRef,
    monster: isObject(monster) ? monster : undefined,
  };
}

function canonicalToastRows(event) {
  if (event?.type !== REWARD_PRESENTATION_TYPE) return [];
  const eventId = text(event.id);
  const intents = Array.isArray(event.presentations?.toast) ? event.presentations.toast : [];
  return intents
    .map((intent, index) => toastRow(intent, event, {
      eventId,
      index,
      title: event.kind,
      assetRef: isObject(intent?.assetRef) ? intent.assetRef : undefined,
      monster: isObject(event.payload?.monster) ? event.payload.monster : undefined,
    }))
    .filter(Boolean);
}

function legacyMonsterToastRows(event) {
  if (event?.type !== LEGACY_REWARD_MONSTER_TYPE) return [];
  const [title, body] = monsterCopy(event);
  return [toastRow({ title, body, assetRef: monsterAssetRef(event) }, event, {
    eventId: presentationId(event),
    title,
    body,
    tone: event.kind === 'caught' ? 'positive' : 'neutral',
    assetRef: monsterAssetRef(event),
    monster: event.monster,
  })].filter(Boolean);
}

function legacyRewardToastRows(event) {
  if (event?.type !== LEGACY_REWARD_TOAST_TYPE) return [];
  const [title, body] = plainCopy(event);
  return [toastRow({ title, body }, event, {
    eventId: presentationId(event),
    title,
    body,
    tone: event.kind === 'reward.achievement' ? 'achievement' : 'neutral',
  })].filter(Boolean);
}

function genericToastRows(event) {
  if (!isObject(event) || (!isObject(event.toast) && !event.title && !event.body && !event.message && !isObject(event.monster))) return [];
  const [title, body] = plainCopy(event);
  return [toastRow({ title, body }, event, {
    eventId: text(event.id),
    title,
    body,
    tone: event.kind === 'reward.achievement' ? 'achievement' : 'neutral',
    assetRef: event.assetRef,
    monster: event.monster,
  })].filter(Boolean);
}

export function normaliseRewardToastEvent(event) {
  if (!isObject(event)) return [];
  if (event.type === REWARD_TOAST_PRESENTATION_TYPE) return [event];
  if (event.type === REWARD_PRESENTATION_TYPE) return canonicalToastRows(event);
  if (event.type === LEGACY_REWARD_MONSTER_TYPE) return legacyMonsterToastRows(event);
  if (event.type === LEGACY_REWARD_TOAST_TYPE) return legacyRewardToastRows(event);
  return genericToastRows(event);
}

export function normaliseRewardToastEvents(events) {
  return (Array.isArray(events) ? events : [events])
    .flatMap(normaliseRewardToastEvent)
    .filter(Boolean)
    .slice(-25);
}
