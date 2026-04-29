import { createContext, useContext } from 'react';

export const SubjectRouteContext = createContext(null);

export function useSubjectRouteContext() {
  const value = useContext(SubjectRouteContext);
  if (!value) {
    throw new Error('useSubjectRouteContext must be used inside SubjectRouteContext.Provider.');
  }
  return value;
}
