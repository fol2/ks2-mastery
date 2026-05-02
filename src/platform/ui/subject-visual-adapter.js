export const SUBJECT_VISUAL_ADAPTER_SECTIONS = Object.freeze([
  'setup',
  'sessionHud',
  'companionPanel',
  'practiceStage',
  'summaryFrame',
]);

function freezeSectionMap(sections) {
  const next = {};
  for (const section of SUBJECT_VISUAL_ADAPTER_SECTIONS) {
    next[section] = Object.freeze({ ...(sections?.[section] || {}) });
  }
  return Object.freeze(next);
}

export function createReadySubjectVisualAdapter(subjectId, sections = {}) {
  return Object.freeze({
    kind: 'SubjectVisualAdapter',
    subjectId,
    status: 'ready',
    productionPracticeAvailable: true,
    sections: freezeSectionMap(sections),
  });
}

export function createPlaceholderSubjectVisualAdapter(subjectId, label) {
  return Object.freeze({
    kind: 'SubjectVisualAdapter',
    subjectId,
    status: 'unavailable',
    productionPracticeAvailable: false,
    unavailableCopy: `${label || 'This subject'} is not ready for practice yet.`,
    sections: freezeSectionMap({
      setup: { mode: 'placeholder', primaryAction: 'unavailable-info' },
      sessionHud: { mode: 'placeholder', available: false },
      companionPanel: { mode: 'placeholder', available: false },
      practiceStage: { mode: 'placeholder', available: false },
      summaryFrame: { mode: 'placeholder', available: false },
    }),
  });
}

export function isSubjectVisualAdapter(candidate) {
  return Boolean(
    candidate
    && candidate.kind === 'SubjectVisualAdapter'
    && typeof candidate.subjectId === 'string'
    && (candidate.status === 'ready' || candidate.status === 'unavailable')
    && typeof candidate.productionPracticeAvailable === 'boolean'
    && SUBJECT_VISUAL_ADAPTER_SECTIONS.every((section) => (
      candidate.sections
      && candidate.sections[section]
      && typeof candidate.sections[section] === 'object'
      && !Array.isArray(candidate.sections[section])
    )),
  );
}
