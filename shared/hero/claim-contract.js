export const FORBIDDEN_CLAIM_FIELDS = ['subjectId', 'payload', 'coins', 'reward', 'balance', 'monster', 'shop', 'economy', 'amount'];

export const REQUIRED_CLAIM_FIELDS = ['command', 'learnerId', 'questId', 'questFingerprint', 'taskId', 'requestId', 'expectedLearnerRevision'];

export function validateClaimRequest(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body is required'] };
  }
  if (body.command !== 'claim-task') {
    errors.push('command must be "claim-task"');
  }
  for (const field of REQUIRED_CLAIM_FIELDS) {
    if (field === 'command') continue;
    if (!body[field] && body[field] !== 0) {
      errors.push(`${field} is required`);
    }
  }
  for (const field of FORBIDDEN_CLAIM_FIELDS) {
    if (body[field] !== undefined) {
      errors.push(`${field} is forbidden in claim requests`);
    }
  }
  if (typeof body.expectedLearnerRevision !== 'number') {
    errors.push('expectedLearnerRevision must be a number');
  }
  return { valid: errors.length === 0, errors };
}

export function isAlreadyCompleted(progressState, taskId) {
  if (!progressState?.daily?.tasks) return false;
  return progressState.daily.tasks[taskId]?.status === 'completed';
}

export function buildClaimRecord(params) {
  const { requestId, learnerId, dateKey, questId, questFingerprint, taskId, subjectId, practiceSessionId, result, reason, nowTs } = params;
  return {
    claimId: `hero-claim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    requestId,
    learnerId,
    dateKey,
    questId,
    questFingerprint,
    taskId,
    subjectId,
    practiceSessionId: practiceSessionId || null,
    result,
    reason: reason || null,
    createdAt: nowTs,
  };
}
