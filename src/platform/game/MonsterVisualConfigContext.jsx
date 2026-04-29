import { createContext, useContext } from 'react';

const MonsterVisualConfigContext = createContext(null);

export function MonsterVisualConfigProvider({ value = null, children }) {
  return (
    <MonsterVisualConfigContext.Provider value={value || null}>
      {children}
    </MonsterVisualConfigContext.Provider>
  );
}

export function useMonsterVisualConfig() {
  return useContext(MonsterVisualConfigContext) || null;
}
