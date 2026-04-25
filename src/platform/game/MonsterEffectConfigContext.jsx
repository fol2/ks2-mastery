import React, { createContext, useContext } from 'react';

// Mirrors MonsterVisualConfigContext: a single value prop that the caller
// has already resolved (with bundled fallback applied). Consumers like
// <MonsterRender> and <CelebrationLayer> read `bindings`,
// `celebrationTunables`, and `catalog` from this hook.
//
// `useMonsterEffectConfig()` returns `null` when no provider is mounted —
// the consumers fall back to today's per-displayState defaults in that case.

const MonsterEffectConfigContext = createContext(null);

export function MonsterEffectConfigProvider({ value = null, children }) {
  return (
    <MonsterEffectConfigContext.Provider value={value || null}>
      {children}
    </MonsterEffectConfigContext.Provider>
  );
}

export function useMonsterEffectConfig() {
  return useContext(MonsterEffectConfigContext) || null;
}
