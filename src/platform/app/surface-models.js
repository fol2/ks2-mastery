export function persistenceLabel(snapshot) {
  if (snapshot?.mode === 'remote-sync') return 'Remote sync';
  if (snapshot?.mode === 'degraded') {
    return snapshot?.remoteAvailable ? 'Sync degraded' : 'Local storage degraded';
  }
  return 'Local-only';
}

export function selectedLearnerModel(appState) {
  const learnerId = appState.learners.selectedId;
  const learner = learnerId ? appState.learners.byId[learnerId] : null;
  return learner
    ? { id: learner.id, name: learner.name, yearGroup: learner.yearGroup }
    : null;
}
