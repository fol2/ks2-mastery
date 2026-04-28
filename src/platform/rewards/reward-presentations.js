export const REWARD_PRESENTATION_TYPE = 'reward.presentation';
export const LEGACY_REWARD_MONSTER_TYPE = 'reward.monster';
export const LEGACY_REWARD_TOAST_TYPE = 'reward.toast';

const MONSTER_CELEBRATION_KINDS = new Set(['caught', 'evolve', 'mega']);

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function nonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function compactObject(value) {
  const output = {};
  for (const [key, entry] of Object.entries(value || {})) {
    if (entry === undefined) continue;
    output[key] = entry;
  }
  return output;
}

function legacySourceId(event, fallbackType) {
  const explicit = cleanString(event?.id);
  if (explicit) return explicit;
  return [
    fallbackType,
    cleanString(event?.learnerId, 'default'),
    cleanString(event?.subjectId || event?.producerId, 'unknown'),
    cleanString(event?.monsterId || event?.sessionId || event?.sourceEventId, 'event'),
    cleanString(event?.kind, 'update'),
    nonNegativeNumber(event?.createdAt || event?.occurredAt, 0),
  ].join(':');
}

function presentationIdForLegacy(event, fallbackType) {
  return `reward.presentation:${legacySourceId(event, fallbackType)}`;
}

export function presentationAckKey(eventOrId, presentationKind, intentIdOrIndex = 0) {
  const eventId = cleanString(
    typeof eventOrId === 'string' ? eventOrId : eventOrId?.id,
  );
  const kind = cleanString(presentationKind);
  if (!eventId || !kind) return '';
  const suffix = intentIdOrIndex == null ? 0 : String(intentIdOrIndex).trim();
  return `reward:${eventId}:${kind}:${suffix || '0'}`;
}

function presentationIntentId(eventId, presentationKind, index) {
  return `${eventId}:${presentationKind}:${index}`;
}

function normalisePresentationIntent(intent, {
  eventId,
  presentationKind,
  index = 0,
  fallbackTiming = 'producer-controlled',
} = {}) {
  if (!isPlainObject(intent)) return null;
  const id = cleanString(intent.id, presentationIntentId(eventId, presentationKind, index));
  const intentKey = cleanString(intent.intentId, index);
  return {
    ...intent,
    id,
    dedupeKey: cleanString(
      intent.dedupeKey,
      presentationAckKey(eventId, presentationKind, intentKey),
    ),
    timing: cleanString(intent.timing, fallbackTiming),
  };
}

function normaliseToastIntent(intent, options) {
  const normalised = normalisePresentationIntent(intent, {
    ...options,
    presentationKind: 'toast',
    fallbackTiming: 'immediate',
  });
  if (!normalised) return null;
  return compactObject({
    ...normalised,
    title: cleanString(normalised.title),
    body: cleanString(normalised.body),
    tone: cleanString(normalised.tone, 'neutral'),
    ariaLive: cleanString(normalised.ariaLive, 'polite'),
    autoDismissMs: normalised.autoDismissMs == null
      ? undefined
      : nonNegativeNumber(normalised.autoDismissMs, 0),
  });
}

function normaliseCelebrationIntent(intent, options) {
  const normalised = normalisePresentationIntent(intent, {
    ...options,
    presentationKind: 'celebration',
    fallbackTiming: 'producer-controlled',
  });
  if (!normalised) return null;
  return compactObject({
    ...normalised,
    visualKind: cleanString(normalised.visualKind, cleanString(normalised.kind)),
    title: cleanString(normalised.title),
    body: cleanString(normalised.body),
    priority: normalised.priority == null
      ? undefined
      : nonNegativeNumber(normalised.priority, 0),
  });
}

function normalisePresentationIntentList(value, {
  eventId,
  presentationKind,
} = {}) {
  const entries = Array.isArray(value)
    ? value
    : (isPlainObject(value) ? [value] : []);
  const normalise = presentationKind === 'toast'
    ? normaliseToastIntent
    : (presentationKind === 'celebration' ? normaliseCelebrationIntent : normalisePresentationIntent);
  return entries
    .map((intent, index) => normalise(intent, { eventId, presentationKind, index }))
    .filter(Boolean);
}

function normalisePresentations(value, eventId) {
  const raw = isPlainObject(value) ? value : {};
  const output = {};
  const keys = new Set(['toast', 'celebration', ...Object.keys(raw)]);
  for (const key of keys) {
    output[key] = normalisePresentationIntentList(raw[key], {
      eventId,
      presentationKind: key,
    });
  }
  return output;
}

function legacyToastIntent(event) {
  if (isPlainObject(event?.toast)) {
    return {
      title: cleanString(event.toast.title),
      body: cleanString(event.toast.body),
    };
  }
  if (isPlainObject(event?.monster)) {
    return {
      title: cleanString(event.monster.name, 'Reward update'),
      body: '',
    };
  }
  return null;
}

function legacyMonsterPayload(event) {
  return compactObject({
    monsterId: cleanString(event.monsterId),
    monster: isPlainObject(event.monster) ? event.monster : undefined,
    previous: isPlainObject(event.previous) ? event.previous : undefined,
    next: isPlainObject(event.next) ? event.next : undefined,
    releaseId: cleanString(event.releaseId) || undefined,
    clusterId: cleanString(event.clusterId) || undefined,
    rewardUnitId: cleanString(event.rewardUnitId) || undefined,
    masteryKey: cleanString(event.masteryKey) || undefined,
    conceptId: cleanString(event.conceptId) || undefined,
  });
}

function adaptLegacyMonsterEvent(event) {
  const sourceEventId = legacySourceId(event, LEGACY_REWARD_MONSTER_TYPE);
  const id = presentationIdForLegacy(event, LEGACY_REWARD_MONSTER_TYPE);
  const kind = cleanString(event.kind, 'update');
  const toast = legacyToastIntent(event);
  const celebration = MONSTER_CELEBRATION_KINDS.has(kind)
    ? [{
        visualKind: kind,
        timing: 'producer-controlled',
        title: cleanString(toast?.title || event?.monster?.name),
        body: cleanString(toast?.body),
        assetRef: compactObject({
          family: 'monster',
          monsterId: cleanString(event.monsterId) || undefined,
          branch: cleanString(event?.next?.branch || event?.previous?.branch) || undefined,
          stage: event?.next?.stage,
        }),
      }]
    : [];

  return normaliseCanonicalPresentationEvent({
    id,
    type: REWARD_PRESENTATION_TYPE,
    producerType: 'subject',
    producerId: cleanString(event.subjectId, 'spelling'),
    rewardType: LEGACY_REWARD_MONSTER_TYPE,
    kind,
    learnerId: cleanString(event.learnerId, 'default'),
    occurredAt: nonNegativeNumber(event.occurredAt ?? event.createdAt, 0),
    sourceEventId,
    fromState: isPlainObject(event.previous) ? event.previous : null,
    toState: isPlainObject(event.next) ? event.next : null,
    payload: legacyMonsterPayload(event),
    presentations: {
      toast: toast ? [toast] : [],
      celebration,
    },
  });
}

function legacyToastPayload(event) {
  return compactObject({
    sourceEventId: cleanString(event.sourceEventId) || undefined,
    sessionId: cleanString(event.sessionId) || undefined,
    achievementId: cleanString(event.achievementId) || undefined,
    achievementKey: cleanString(event.achievementKey) || undefined,
  });
}

function adaptLegacyToastEvent(event) {
  const sourceEventId = legacySourceId(event, LEGACY_REWARD_TOAST_TYPE);
  const id = presentationIdForLegacy(event, LEGACY_REWARD_TOAST_TYPE);
  const toast = legacyToastIntent(event);
  return normaliseCanonicalPresentationEvent({
    id,
    type: REWARD_PRESENTATION_TYPE,
    producerType: 'subject',
    producerId: cleanString(event.subjectId, 'spelling'),
    rewardType: LEGACY_REWARD_TOAST_TYPE,
    kind: cleanString(event.kind, 'toast'),
    learnerId: cleanString(event.learnerId, 'default'),
    occurredAt: nonNegativeNumber(event.occurredAt ?? event.createdAt, 0),
    sourceEventId,
    payload: legacyToastPayload(event),
    presentations: {
      toast: toast ? [toast] : [],
      celebration: [],
    },
  });
}

function normaliseCanonicalPresentationEvent(event) {
  if (!isPlainObject(event)) return null;
  const id = cleanString(event.id);
  if (!id) return null;
  const producerType = cleanString(event.producerType, event.subjectId ? 'subject' : 'platform');
  const producerId = cleanString(event.producerId || event.subjectId || event.moduleId, 'unknown');
  const kind = cleanString(event.kind, 'update');
  const presentations = normalisePresentations(
    event.presentations || {
      toast: event.toast,
      celebration: event.celebration,
    },
    id,
  );
  return compactObject({
    id,
    type: REWARD_PRESENTATION_TYPE,
    producerType,
    producerId,
    rewardType: cleanString(event.rewardType, REWARD_PRESENTATION_TYPE),
    kind,
    learnerId: cleanString(event.learnerId, 'default'),
    occurredAt: nonNegativeNumber(event.occurredAt ?? event.createdAt, 0),
    sourceEventId: cleanString(event.sourceEventId) || undefined,
    fromState: event.fromState ?? null,
    toState: event.toState ?? null,
    milestoneRankBefore: event.milestoneRankBefore == null ? undefined : nonNegativeNumber(event.milestoneRankBefore, 0),
    milestoneRankAfter: event.milestoneRankAfter == null ? undefined : nonNegativeNumber(event.milestoneRankAfter, 0),
    payload: isPlainObject(event.payload) ? event.payload : {},
    presentations,
    analytics: isPlainObject(event.analytics) ? event.analytics : undefined,
  });
}

export function normaliseRewardPresentationEvent(event) {
  if (!isPlainObject(event)) return null;
  if (event.type === REWARD_PRESENTATION_TYPE) return normaliseCanonicalPresentationEvent(event);
  if (event.type === LEGACY_REWARD_MONSTER_TYPE) return adaptLegacyMonsterEvent(event);
  if (event.type === LEGACY_REWARD_TOAST_TYPE) return adaptLegacyToastEvent(event);
  return null;
}

export function presentationEventsFromLegacyRewardEvents(events) {
  const entries = Array.isArray(events) ? events : [events];
  return entries.map(normaliseRewardPresentationEvent).filter(Boolean);
}

export function resolveRewardToast(event) {
  return normaliseRewardPresentationEvent(event)?.presentations?.toast || [];
}

export function resolveRewardCelebration(event) {
  return normaliseRewardPresentationEvent(event)?.presentations?.celebration || [];
}
