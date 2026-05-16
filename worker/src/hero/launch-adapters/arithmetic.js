const LAUNCHER_TO_MODE = Object.freeze({
  'smart-practice': 'smart',
  'trouble-practice': 'clinic',
  'mini-test': 'test',
  'guardian-check': 'smart',
  'gps-check': 'test',
});

export function mapToSubjectPayload(taskEnvelope) {
  const mode = LAUNCHER_TO_MODE[taskEnvelope?.launcher];
  if (!mode) return { launchable: false, reason: 'launcher-not-supported-for-subject' };
  return {
    launchable: true,
    subjectId: 'arithmetic',
    payload: {
      mode,
      goal: taskEnvelope?.intent === 'due-review' ? 'due' : '10q',
      testForm: mode === 'test' ? 'short' : 'short',
      heroContext: taskEnvelope?.heroContext || null,
    },
  };
}
