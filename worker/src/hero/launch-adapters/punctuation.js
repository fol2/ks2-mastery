const LAUNCHER_TO_MODE = Object.freeze({
  'smart-practice': 'smart',
  'trouble-practice': 'weak',
  'gps-check': 'gps',
});

export function mapToSubjectPayload(taskEnvelope) {
  const mode = LAUNCHER_TO_MODE[taskEnvelope?.launcher];
  if (!mode) {
    return { launchable: false, reason: 'launcher-not-supported-for-subject' };
  }
  return { launchable: true, subjectId: 'punctuation', payload: { mode } };
}
