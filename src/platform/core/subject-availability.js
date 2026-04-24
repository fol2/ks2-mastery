export const SUBJECT_EXPOSURE_GATES = Object.freeze({
  punctuation: 'punctuationProduction',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normaliseSubjectExposureGates(value = {}) {
  const raw = isPlainObject(value) ? value : {};
  const entries = Object.entries(raw)
    .filter(([key]) => typeof key === 'string' && key.trim())
    .map(([key, enabled]) => [key.trim(), enabled === true]);
  return Object.freeze(Object.fromEntries(entries));
}

export function subjectExposureGateId(subject) {
  if (typeof subject?.exposureGate === 'string') return subject.exposureGate.trim();
  return '';
}

export function isSubjectExposed(subject, gates = {}) {
  const gateId = subjectExposureGateId(subject);
  if (!gateId) return true;
  return normaliseSubjectExposureGates(gates)[gateId] === true;
}

export function exposedSubjects(subjects = [], gates = {}) {
  return subjects.filter((subject) => isSubjectExposed(subject, gates));
}
