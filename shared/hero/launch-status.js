function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function determineLaunchStatus(subjectId, launcher, capabilityRegistry) {
  if (typeof subjectId !== 'string' || !subjectId) {
    return {
      launchable: false,
      status: 'not-launchable',
      reason: 'subjectId is required',
    };
  }
  if (typeof launcher !== 'string' || !launcher) {
    return {
      launchable: false,
      status: 'not-launchable',
      reason: 'launcher is required',
    };
  }

  const registry = isPlainObject(capabilityRegistry) ? capabilityRegistry : {};
  const subjectEntry = isPlainObject(registry[subjectId]) ? registry[subjectId] : null;

  if (!subjectEntry) {
    return {
      launchable: false,
      status: 'subject-unavailable',
      reason: `no capability entry for subject: ${subjectId}`,
    };
  }

  const launchers = isPlainObject(subjectEntry.launchers) ? subjectEntry.launchers : {};

  if (launchers[launcher] !== true) {
    return {
      launchable: false,
      status: 'not-launchable',
      reason: `launcher not supported for subject: ${subjectId}/${launcher}`,
    };
  }

  return {
    launchable: true,
    status: 'launchable',
    reason: '',
  };
}
