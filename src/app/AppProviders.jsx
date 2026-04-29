import { createContext, useContext } from 'react';

const AppControllerContext = createContext(null);

export function AppProviders({ controller, runtime, children }) {
  return (
    <AppControllerContext.Provider value={{ controller, runtime }}>
      {children}
    </AppControllerContext.Provider>
  );
}

export function useAppController() {
  const value = useContext(AppControllerContext);
  if (!value) throw new Error('App controller context is missing.');
  return value;
}
