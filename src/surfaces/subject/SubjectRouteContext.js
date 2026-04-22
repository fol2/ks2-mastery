import React from 'react';

export const SubjectRouteContext = React.createContext(null);

export function useSubjectRouteContext() {
  const value = React.useContext(SubjectRouteContext);
  if (!value) {
    throw new Error('useSubjectRouteContext must be used inside SubjectRouteContext.Provider.');
  }
  return value;
}
