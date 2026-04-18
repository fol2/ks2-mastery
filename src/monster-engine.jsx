// MonsterEngine — tracks mastery per monster pool, plus a derived aggregate
// monster (Phaeton) whose stage is computed from Inklet + Glimmerbug.
//
// Persists in localStorage under 'ks2-monsters-<profileId>' (or default key).
//
// Contract used by spelling-game:
//   MonsterEngine.recordMastery(profileId, monsterId, wordSlug) -> Event[]
//     returns 0..N events. The triggering child monster may yield one event,
//     and any aggregate that depends on it may yield a second. A single submit
//     can therefore fire, for example, `glimmerbug:caught` and `phaeton:caught`
//     in that order; app.jsx queues them so the user sees both celebrations.
//   MonsterEngine.getState(profileId) -> raw localStorage object
//   MonsterEngine.getMonsterProgress(profileId, monsterId) -> { mastered, stage, level, caught, masteredList }
//
// recordMastery also dispatches a `monster:progress` DOM CustomEvent on window
// for every accepted word — subject headers and chips subscribe to that to
// show a lightweight pulse without needing to plumb callbacks everywhere.

(function () {
  const BASE_KEY = 'ks2-monsters';

  // Declarative aggregates. Keeping this table small and explicit is clearer than
  // a clever generic system — we only have one aggregate today (Phaeton).
  const AGGREGATES = {
    phaeton: {
      sources: ['inklet', 'glimmerbug'],
      // Stage depends on combined mastery AND the both-caught / both-max gates.
      // Thresholds are intentionally higher than individual monsters so reaching
      // Mega genuinely requires completing both KS2 word pools.
      stageFor(state) {
        const ink  = countMastered(state, 'inklet');
        const glim = countMastered(state, 'glimmerbug');
        const combined = ink + glim;
        const bothCaught = ink >= 10 && glim >= 10;
        const bothMax    = ink >= 100 && glim >= 100;
        if (bothMax)                          return 4; // Mega only when both pools maxed
        if (bothCaught && combined >= 120)    return 3;
        if (bothCaught && combined >= 60)     return 2;
        if (bothCaught && combined >= 20)     return 1; // Hatch
        return 0;
      },
      levelFor(state) {
        const combined = countMastered(state, 'inklet') + countMastered(state, 'glimmerbug');
        return Math.min(10, Math.floor(combined / 20));
      },
      masteredFor(state) {
        return countMastered(state, 'inklet') + countMastered(state, 'glimmerbug');
      },
    },
  };

  function keyFor(profileId) {
    return `${BASE_KEY}-${profileId || 'default'}`;
  }

  function countMastered(state, monsterId) {
    const m = state?.[monsterId];
    return (m?.mastered?.length) || 0;
  }

  function loadState(profileId) {
    try {
      const raw = localStorage.getItem(keyFor(profileId));
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed || {};
    } catch { return {}; }
  }

  function saveState(profileId, state) {
    localStorage.setItem(keyFor(profileId), JSON.stringify(state));
  }

  // Emits the right fields regardless of whether the monster is direct or aggregate.
  function progressFromState(state, monsterId) {
    const agg = AGGREGATES[monsterId];
    if (agg) {
      const stage = agg.stageFor(state);
      return {
        mastered:     agg.masteredFor(state),
        stage,
        level:        agg.levelFor(state),
        caught:       stage >= 1,
        masteredList: [],
      };
    }
    const m = state[monsterId] || { mastered: [], caught: false };
    const mastered = (m.mastered || []).length;
    return {
      mastered,
      stage: window.stageFor(mastered),
      level: window.levelFor(mastered),
      caught: !!m.caught || mastered >= 10,
      masteredList: m.mastered || [],
    };
  }

  function getMonsterProgress(profileId, monsterId) {
    return progressFromState(loadState(profileId), monsterId);
  }

  function eventFromTransition(monsterId, prev, next, kindOverride) {
    let kind = kindOverride;
    if (!kind) {
      if (!prev.caught && next.caught)         kind = 'caught';
      else if (next.stage > prev.stage)        kind = next.stage === 4 ? 'mega' : 'evolve';
      else if (next.level > prev.level)        kind = 'levelup';
      else                                     return null;
    }
    return {
      kind,
      monsterId,
      monster: window.MONSTERS[monsterId],
      stage: next.stage,
      prevStage: prev.stage,
      level: next.level,
      prevLevel: prev.level,
      mastered: next.mastered,
    };
  }

  // Core: record a mastered word. Returns every milestone event the write triggers,
  // across the directly-updated monster AND any aggregate whose sources include it.
  function recordMastery(profileId, monsterId, wordSlug) {
    if (AGGREGATES[monsterId]) {
      // Aggregates don't accept direct writes — they're pure derivations.
      return [];
    }
    const prevState = loadState(profileId);
    const m = prevState[monsterId] || { mastered: [], caught: false };
    if (m.mastered.includes(wordSlug)) {
      // already counted — no events, no pulse
      return [];
    }

    const prevChild = progressFromState(prevState, monsterId);

    const updatedChild = {
      ...m,
      mastered: [...m.mastered, wordSlug],
      // `caught` is redundant with mastered.length >= 10 but kept so existing data migrates cleanly.
      caught: m.caught || (m.mastered.length + 1) >= 10,
    };
    const nextState = { ...prevState, [monsterId]: updatedChild };

    const events = [];
    const nextChild = progressFromState(nextState, monsterId);
    const childEv   = eventFromTransition(monsterId, prevChild, nextChild);
    if (childEv) events.push(childEv);

    // Check every aggregate that lists this monster as a source.
    for (const [aggId, agg] of Object.entries(AGGREGATES)) {
      if (!agg.sources.includes(monsterId)) continue;
      const prevAgg = progressFromState(prevState, aggId);
      const nextAgg = progressFromState(nextState, aggId);
      const aggEv   = eventFromTransition(aggId, prevAgg, nextAgg);
      if (aggEv) events.push(aggEv);
    }

    saveState(profileId, nextState);

    // Fire a cheap progress signal so chips / dashboard playgrounds can pulse.
    try {
      window.dispatchEvent(new CustomEvent('monster:progress', {
        detail: {
          monsterId,
          mastered: nextChild.mastered,
          aggregates: Object.entries(AGGREGATES)
            .filter(([, a]) => a.sources.includes(monsterId))
            .map(([id]) => id),
        },
      }));
    } catch { /* CustomEvent unsupported — safe to skip */ }

    return events;
  }

  function resetAll(profileId) {
    localStorage.removeItem(keyFor(profileId));
  }

  window.MonsterEngine = {
    getState: loadState,
    getMonsterProgress,
    recordMastery,
    resetAll,
  };
})();
