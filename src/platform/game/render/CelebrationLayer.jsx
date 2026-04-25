// Single overlay layer that subscribes to the celebration queue and
// renders one transient effect at a time. Today's overlay flow stays
// intact: events arrive via `store.pushMonsterCelebrations` (programmatic
// or worker-driven) and we drain them through `monster-celebration-dismiss`
// so ack persistence keeps working without change.
//
// Two integration modes:
// 1. Pass `controller` — onComplete dispatches `monster-celebration-dismiss`
//    so the canonical app-controller path runs (ack + dismiss).
// 2. Pass only `store` — onComplete falls back to direct ack + dismiss,
//    mirroring exactly what the controller would do. Useful for tests and
//    surfaces that don't carry the full controller.

import { useSyncExternalStore } from 'react';
import { lookupEffect } from './registry.js';
import { warnOnce } from './composition.js';
import { acknowledgeMonsterCelebrationEvents } from '../monster-celebration-acks.js';
import { useMonsterEffectConfig } from '../MonsterEffectConfigContext.jsx';

function resolveCelebrationTunables(effectConfig, event) {
  // Per the plan: assetKey = monsterId + (next.branch ?? previous.branch) + next.stage.
  // Returns the tunables row for the (asset, kind) pair, or null when any
  // step is missing — callers omit `tunables` when this returns null.
  if (!effectConfig || !effectConfig.celebrationTunables) return null;
  const monsterId = event?.monster?.id;
  const branch = event?.next?.branch || event?.previous?.branch;
  const stage = event?.next?.stage;
  if (!monsterId || !branch || stage == null) return null;
  const assetKey = `${monsterId}-${branch}-${stage}`;
  const row = effectConfig.celebrationTunables[assetKey];
  if (!row) return null;
  const tunables = row[event.kind];
  return tunables || null;
}

function getQueue(store) {
  const state = store?.getState?.();
  const queue = state?.monsterCelebrations?.queue;
  return Array.isArray(queue) ? queue : [];
}

function buildOnComplete(store, controller, event) {
  return function onComplete() {
    if (controller && typeof controller.dispatch === 'function') {
      // Canonical path: controller's `monster-celebration-dismiss` handler
      // already performs ack + dismiss in the right order.
      controller.dispatch('monster-celebration-dismiss');
      return;
    }
    // Fallback: mirror the controller's two-step exactly so callers without
    // a controller (smoke harnesses, isolated surfaces) get identical
    // semantics. Ack failure must not block UI advance — surface via
    // warnOnce and continue dismissing.
    try {
      acknowledgeMonsterCelebrationEvents(event, { learnerId: event?.learnerId || '' });
    } catch (err) {
      warnOnce(
        'celebration-layer:ack-failed',
        `CelebrationLayer: ack persistence failed (${err?.message || 'unknown error'})`,
      );
    }
    if (typeof store?.dismissMonsterCelebration === 'function') {
      store.dismissMonsterCelebration();
    }
  };
}

export function CelebrationLayer({ store, controller, context = 'lesson' }) {
  // useSyncExternalStore needs stable subscribe / getSnapshot references
  // across renders. We can't call hooks conditionally, so guard via a
  // null-safe subscribe + snapshot when the caller forgets the store.
  const subscribe = store?.subscribe || (() => () => {});
  const getSnapshot = () => (store ? store.getState() : null);
  // SSR-safe: matches getSnapshot when there is no window.
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const effectConfig = useMonsterEffectConfig();

  if (!store) return null;

  const queue = getQueue(store);
  const event = queue[0];
  if (!event) return null;

  const effect = lookupEffect(event.kind);

  // Defensive: an event arrived for a kind that has no registered transient
  // effect. We can't render it, so we treat it as already-handled and
  // advance the queue. This keeps the queue from getting stuck behind a
  // bad event during partial migrations or test setups.
  if (!effect || effect.lifecycle !== 'transient') {
    warnOnce(
      `celebration-layer:no-transient-effect:${event.kind}`,
      `CelebrationLayer: no transient effect registered for kind "${event.kind}"; advancing queue`,
    );
    // Inline dismissal: same shape as buildOnComplete fallback. We cannot
    // call buildOnComplete inside render because we don't want to defer
    // until React commits — a stuck event must clear immediately.
    if (controller && typeof controller.dispatch === 'function') {
      controller.dispatch('monster-celebration-dismiss');
    } else {
      try {
        acknowledgeMonsterCelebrationEvents(event, { learnerId: event?.learnerId || '' });
      } catch {
        // Ack failure is best-effort here; the event still advances.
      }
      if (typeof store.dismissMonsterCelebration === 'function') {
        store.dismissMonsterCelebration();
      }
    }
    return null;
  }

  const onComplete = buildOnComplete(store, controller, event);
  const tunables = resolveCelebrationTunables(effectConfig, event);

  // The transient effect owns its visuals (scrim, particles, copy). The
  // layer adds no chrome of its own — that's the whole point of the
  // composable design.
  if (typeof effect.render !== 'function') return null;

  let node;
  try {
    const renderArgs = {
      params: event,
      monster: event.monster,
      context,
      onComplete,
    };
    // Only attach `tunables` when present so existing callers / fallbacks
    // see exactly today's argument shape.
    if (tunables) renderArgs.tunables = tunables;
    node = effect.render(renderArgs);
  } catch (err) {
    warnOnce(
      `celebration-layer:render-throw:${event.kind}`,
      `CelebrationLayer: effect "${event.kind}" render threw (${err?.message || 'unknown'}); dismissing`,
    );
    onComplete();
    return null;
  }

  return node || null;
}
