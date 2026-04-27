function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normaliseQuestShape(raw) {
  const quest = isPlainObject(raw) ? raw : {};
  return {
    questId: typeof quest.questId === 'string' ? quest.questId : '',
    status: typeof quest.status === 'string' ? quest.status : 'shadow',
    effortTarget: Number.isFinite(Number(quest.effortTarget)) ? Number(quest.effortTarget) : 0,
    effortPlanned: Number.isFinite(Number(quest.effortPlanned)) ? Number(quest.effortPlanned) : 0,
    tasks: Array.isArray(quest.tasks) ? quest.tasks : [],
  };
}

function normaliseLockedSubject(raw) {
  const entry = isPlainObject(raw) ? raw : {};
  return {
    subjectId: typeof entry.subjectId === 'string' ? entry.subjectId : '',
    reason: typeof entry.reason === 'string' ? entry.reason : 'unknown',
  };
}

function normaliseEligibleSubject(raw) {
  const entry = isPlainObject(raw) ? raw : {};
  return {
    subjectId: typeof entry.subjectId === 'string' ? entry.subjectId : '',
    reason: typeof entry.reason === 'string' ? entry.reason : '',
  };
}
