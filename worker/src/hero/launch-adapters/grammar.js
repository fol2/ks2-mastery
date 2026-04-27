const LAUNCHER_TO_MODE = Object.freeze({
  'smart-practice': 'smart',
  'trouble-practice': 'trouble',
});

export function mapToSubjectPayload(taskEnvelope) {
  const mode = LAUNCHER_TO_MODE[taskEnvelope?.launcher];
  if (!mode) {
    return { launchable: false, reason: 'launcher-not-supported-for-subject' };
  }
  return { launchable: true, subjectId: 'grammar', payload: { mode } };
}
