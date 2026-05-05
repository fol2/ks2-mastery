const LAUNCHER_TO_MODE = Object.freeze({
  'smart-practice': 'smart',
  'trouble-practice': 'smart',
  'mini-test': 'test',
  'guardian-check': 'smart',
  'gps-check': 'test',
});

export function mapToSubjectPayload(taskEnvelope) {
  const mode = LAUNCHER_TO_MODE[taskEnvelope?.launcher];
  if (!mode) return { launchable: false, reason: 'launcher-not-supported-for-subject' };
  return {
    launchable: true,
    subjectId: 'reading',
    payload: {
      mode,
      viewMode: mode === 'test' ? 'list' : 'one',
      heroContext: taskEnvelope?.heroContext || null,
    },
  };
}
