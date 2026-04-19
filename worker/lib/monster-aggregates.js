// Server-side mirror of the client's monster-engine.jsx AGGREGATES table,
// plus a shared transition detector reused for both direct and aggregate
// monster writes.
//
// Background: the pre-PR#1–5 client had a single source of truth for monster
// mastery and emitted both the direct-monster event AND any aggregate events
// in one go. The server-authoritative rewrite currently only emits a single
// direct event and re-derives Phaeton progress on read — meaning a single
// submit that crosses both Glimmerbug's 10th and Phaeton's hatch gate loses
// the Phaeton ceremony. This module restores the aggregate emission path on
// the Worker side, matching the original client contract.
//
// Design notes:
//   * Keep this table small and explicit. Today there is only Phaeton —
//     same comment as monster-engine.jsx: a clever generic system would not
//     be clearer than one named aggregate.
//   * No imports from spelling-service.js — this file is the canonical home
//     for the Phaeton derivation, and spelling-service.js imports from here.

export const MONSTER_AGGREGATES = {
  phaeton: {
    sources: ["inklet", "glimmerbug"],
    derive: derivePhaeton,
  },
};

function derivePhaeton(monsterState) {
  const inkCount = (monsterState?.inklet?.mastered?.length) || 0;
  const glimCount = (monsterState?.glimmerbug?.mastered?.length) || 0;
  const combined = inkCount + glimCount;
  const bothCaught = inkCount >= 10 && glimCount >= 10;
  const bothMax = inkCount >= 100 && glimCount >= 100;
  let stage = 0;
  if (bothMax) stage = 4;
  else if (bothCaught && combined >= 120) stage = 3;
  else if (bothCaught && combined >= 60) stage = 2;
  else if (bothCaught && combined >= 20) stage = 1;
  return {
    mastered: combined,
    stage,
    level: Math.min(10, Math.floor(combined / 20)),
    caught: stage >= 1,
    masteredList: [],
  };
}

// Compute a transition event from a pre/post progress snapshot pair.
// Returns null when there is no meaningful transition. Shape mirrors the
// client's eventFromTransition in monster-engine.jsx and the existing
// Worker `recordMonsterMastery` event field set, so downstream consumers
// (spelling-api.jsx emitProgress, spelling-game.jsx applyResult) do not
// need to know whether an event was emitted by a direct monster write or
// an aggregate derivation.
export function eventFromTransition(monsterId, prev, next) {
  let kind = null;
  if (!prev.caught && next.caught) kind = "caught";
  else if (next.stage > prev.stage) kind = next.stage === 4 ? "mega" : "evolve";
  else if (next.level > prev.level) kind = "levelup";
  if (!kind) return null;
  return {
    kind,
    monsterId,
    stage: next.stage,
    level: next.level,
    mastered: next.mastered,
  };
}

// For a direct-monster write (already applied to `nextState`), return any
// aggregate transitions triggered by that write. Order: aggregates are
// iterated in declaration order; within a single submit the caller emits
// the direct event first and these aggregate events after.
export function aggregateEventsForWrite(prevState, nextState, directMonsterId) {
  const events = [];
  for (const [aggId, agg] of Object.entries(MONSTER_AGGREGATES)) {
    if (!agg.sources.includes(directMonsterId)) continue;
    const prevProg = agg.derive(prevState);
    const nextProg = agg.derive(nextState);
    const ev = eventFromTransition(aggId, prevProg, nextProg);
    if (ev) events.push(ev);
  }
  return events;
}
