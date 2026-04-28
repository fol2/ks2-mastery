export function deriveTaskCompletionStatus(progressTask, activeSession) {
  if (!progressTask) return 'not-started';
  if (progressTask.status === 'completed') return 'completed';
  if (progressTask.status === 'blocked') return 'blocked';

  if (progressTask.status === 'started') {
    if (activeSession && activeSession.taskId === progressTask.taskId) {
      return 'in-progress';
    }
    return 'completed-unclaimed';
  }
  return 'not-started';
}

export function deriveDailyCompletionStatus(progressDaily) {
  if (!progressDaily) return 'none';
  if (progressDaily.status === 'completed') return 'completed';
  if (progressDaily.status === 'expired') return 'expired';
  if (!progressDaily.taskOrder?.length) return 'none';

  const allDone = progressDaily.taskOrder.every(id =>
    progressDaily.tasks?.[id]?.status === 'completed'
  );
  return allDone ? 'completed' : 'active';
}

export function isHeroSessionTerminal(subjectId, phase, sessionPresent) {
  if (sessionPresent) return false;

  switch (subjectId) {
    case 'grammar':
      return phase === 'summary' || phase === 'dashboard';
    case 'spelling':
      return phase === 'idle' || phase === 'dashboard' || phase === 'complete';
    case 'punctuation':
      return phase === 'summary' || phase === 'complete' || phase === 'idle';
    default:
      return false;
  }
}
