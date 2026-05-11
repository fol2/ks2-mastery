const LAUNCHER_TO_MODE = Object.freeze({
  'smart-practice': 'smart',
  'trouble-practice': 'trouble',
  'mini-test': 'satsset',
  'guardian-check': 'smart',
  'gps-check': 'sats',
});

export function mapToSubjectPayload(taskEnvelope) {
  const mode = LAUNCHER_TO_MODE[taskEnvelope?.launcher];
  if (!mode) return { launchable: false, reason: 'launcher-not-supported-for-subject' };
  return {
    launchable: true,
    subjectId: 'reasoning',
    payload: {
      mode,
      viewMode: mode === 'satsset' ? 'list' : 'one',
      setSize: mode === 'satsset' ? 8 : undefined,
      heroContext: taskEnvelope?.heroContext || null,
    },
  };
}
