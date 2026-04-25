// Imperative push API for transient celebration effects. Validates the
// caller's spec, builds an event in the canonical `reward.monster` shape
// (so the existing `monster-celebrations.js` normaliser accepts it), and
// pushes it onto `store.monsterCelebrations.queue` for <CelebrationLayer>
// to consume.
//
// We deliberately mirror the existing event shape rather than inventing a
// new one: a `caught`/`evolve`/`mega` event from the worker and a
// programmatic playCelebration() call must look identical to the layer.

import { lookupEffect } from './registry.js';
import { warnOnce } from './composition.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function buildEventId(kind, monsterId, learnerId) {
  // Canonical id matches `normaliseMonsterCelebrationEvent` fallback so
  // ack persistence and replay deduplication continue to work uniformly.
  const learnerKey = learnerId || 'default';
  return `reward.monster:${learnerKey}:${monsterId}:${kind}:${Date.now()}`;
}

function buildMonsterPayload(monster) {
  return {
    id: monster.id,
    name: nonEmptyString(monster.name) ? monster.name : 'Monster',
    blurb: nonEmptyString(monster.blurb) ? monster.blurb : '',
    accent: nonEmptyString(monster.accent) ? monster.accent : '#3E6FA8',
    secondary: nonEmptyString(monster.secondary) ? monster.secondary : '#FFE9A8',
    pale: nonEmptyString(monster.pale) ? monster.pale : '#F8F4EA',
    nameByStage: Array.isArray(monster.nameByStage) ? monster.nameByStage : [],
    masteredMax: Number(monster.masteredMax) || 100,
  };
}

export function playCelebration(spec, { store } = {}) {
  if (!isPlainObject(spec)) {
    warnOnce('play-celebration:bad-spec', 'playCelebration: spec must be an object');
    return false;
  }

  const { kind, monster, learnerId, params, surface: _surface } = spec;

  if (!nonEmptyString(kind)) {
    warnOnce('play-celebration:missing-kind', 'playCelebration: spec.kind is required');
    return false;
  }

  // Effects are registered at module load; an unknown kind is a developer
  // error not a runtime one — drop and warn.
  const effect = lookupEffect(kind);
  if (!effect) {
    warnOnce(
      `play-celebration:unknown-kind:${kind}`,
      `playCelebration: no registered effect for kind "${kind}"`,
    );
    return false;
  }
  if (effect.lifecycle !== 'transient') {
    warnOnce(
      `play-celebration:not-transient:${kind}`,
      `playCelebration: effect "${kind}" lifecycle is "${effect.lifecycle}", expected "transient"`,
    );
    return false;
  }

  if (!isPlainObject(monster) || !nonEmptyString(monster.id)) {
    warnOnce(
      `play-celebration:bad-monster:${kind}`,
      'playCelebration: spec.monster must include at least an id',
    );
    return false;
  }
  if (!nonEmptyString(monster.accent)) {
    warnOnce(
      `play-celebration:bad-monster-accent:${kind}`,
      'playCelebration: spec.monster.accent must be a non-empty string',
    );
    return false;
  }

  if (!store || typeof store.pushMonsterCelebrations !== 'function') {
    warnOnce(
      'play-celebration:no-store',
      'playCelebration: store with pushMonsterCelebrations is required',
    );
    return false;
  }

  const resolvedLearnerId = nonEmptyString(learnerId) ? learnerId : 'default';
  const event = {
    id: buildEventId(kind, monster.id, resolvedLearnerId),
    type: 'reward.monster',
    kind,
    learnerId: resolvedLearnerId,
    monsterId: monster.id,
    monster: buildMonsterPayload(monster),
    previous: isPlainObject(params?.previous) ? params.previous : {},
    next: isPlainObject(params?.next) ? params.next : {},
    createdAt: Date.now(),
  };

  return store.pushMonsterCelebrations([event]);
}
