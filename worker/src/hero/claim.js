import {
  validateClaimRequest,
  isAlreadyCompleted,
  FORBIDDEN_CLAIM_FIELDS,
} from '../../../shared/hero/claim-contract.js';
import { HERO_CLAIM_GRACE_HOURS } from '../../../shared/hero/constants.js';

/**
 * Pure claim resolver — receives pre-loaded data, returns a result object.
 * Does NOT perform DB reads or writes.
 */
export function resolveHeroClaimCommand({ body, heroProgressState, practiceSessionRows, subjectUiStates, nowTs }) {
  // 1. Validate request body
  const validation = validateClaimRequest(body);
  if (!validation.valid) {
    return {
      ok: false,
      code: validation.errors.some(e => FORBIDDEN_CLAIM_FIELDS.some(f => e.includes(f)))
        ? 'hero_claim_forbidden_fields'
        : 'hero_claim_invalid_request',
      reason: validation.errors.join('; '),
    };
  }

  const { questId, questFingerprint, taskId, requestId, practiceSessionId } = body;
  const learnerId = body.learnerId;

  // 2. Check if task is already completed in progress state
  if (isAlreadyCompleted(heroProgressState, taskId)) {
    return {
      ok: true,
      status: 'already-completed',
      taskId,
      questId,
      reason: 'Task was already claimed',
    };
  }

  // 3. Verify task exists in progress state (should be status='started' from U4)
  const progressTask = heroProgressState?.daily?.tasks?.[taskId];
  if (!progressTask) {
    return {
      ok: false,
      code: 'hero_claim_task_not_in_quest',
      reason: 'Task not found in current hero progress',
    };
  }

  // 4. Verify quest identity matches
  if (heroProgressState.daily.questId !== questId) {
    return {
      ok: false,
      code: 'hero_quest_stale',
      reason: 'Quest identity does not match current progress',
    };
  }
  if (heroProgressState.daily.questFingerprint && heroProgressState.daily.questFingerprint !== questFingerprint) {
    return {
      ok: false,
      code: 'hero_quest_fingerprint_mismatch',
      reason: 'Quest fingerprint does not match',
    };
  }

  // 5. Verify dateKey + grace window
  const taskDateKey = progressTask.dateKey || heroProgressState.daily.dateKey;
  if (!isWithinGraceWindow(taskDateKey, nowTs)) {
    return {
      ok: false,
      code: 'hero_claim_stale_or_expired',
      reason: 'Task date is outside the grace window',
    };
  }

  // 6. Find completion evidence
  const evidence = findCompletionEvidence({
    taskId,
    questId,
    questFingerprint,
    learnerId,
    subjectId: progressTask.subjectId,
    practiceSessionId,
    practiceSessionRows,
    subjectUiStates,
  });

  if (!evidence.found) {
    return {
      ok: false,
      code: 'hero_claim_no_evidence',
      reason: evidence.reason || 'No completed session evidence found',
    };
  }
  if (evidence.learnerMismatch) {
    return {
      ok: false,
      code: 'hero_claim_cross_learner_rejected',
      reason: 'Session belongs to a different learner',
    };
  }
  if (!evidence.completed) {
    return {
      ok: false,
      code: 'hero_claim_evidence_not_completed',
      reason: evidence.reason || 'Session found but not completed',
    };
  }

  // 7. Return successful claim result
  return {
    ok: true,
    status: 'claimed',
    taskId,
    questId,
    questFingerprint,
    subjectId: progressTask.subjectId,
    practiceSessionId: evidence.practiceSessionId,
    effortTarget: progressTask.effortTarget || 0,
    requestId,
    evidence: {
      source: evidence.source,
      sessionStatus: evidence.sessionStatus,
      summaryStatus: evidence.summaryStatus,
      subjectId: progressTask.subjectId,
      heroContextPhase: 'p3',
    },
  };
}

export function findCompletionEvidence({ taskId, questId, questFingerprint, learnerId, subjectId, practiceSessionId, practiceSessionRows, subjectUiStates }) {
  // Strategy 1: Check practice_sessions with heroContext in summary
  if (practiceSessionRows && practiceSessionRows.length > 0) {
    // If a specific practiceSessionId was provided, check it first
    if (practiceSessionId) {
      const specific = practiceSessionRows.find(r => r.id === practiceSessionId);
      if (specific) {
        const result = validatePracticeSession(specific, { taskId, questId, questFingerprint, learnerId, subjectId });
        if (result.found) return result;
      }
    }

    // Search all recent completed sessions for matching heroContext
    for (const row of practiceSessionRows) {
      if (row.status !== 'completed') continue;
      if (row.subject_id !== subjectId) continue;
      if (row.learner_id !== learnerId) {
        return { found: true, completed: false, learnerMismatch: true, reason: 'Session belongs to different learner' };
      }
      const summary = safeParseJson(row.summary_json);
      if (!summary?.heroContext) continue;
      if (summary.heroContext.source !== 'hero-mode') continue;
      if (summary.heroContext.questId !== questId) continue;
      if (summary.heroContext.taskId !== taskId) continue;
      if (summary.heroContext.questFingerprint !== questFingerprint) continue;

      return {
        found: true,
        completed: true,
        source: 'practice-session',
        practiceSessionId: row.id,
        sessionStatus: row.status,
        summaryStatus: 'completed',
        reason: null,
      };
    }
  }

  // Strategy 2: Check subject ui_json for still-present completed session
  if (subjectUiStates && subjectUiStates[subjectId]) {
    const ui = subjectUiStates[subjectId];
    if (ui?.session?.heroContext?.source === 'hero-mode' &&
        ui.session.heroContext.questId === questId &&
        ui.session.heroContext.taskId === taskId) {
      // Session still present in ui_json — check if it looks completed
      // This is a fallback for the race window before subject clears session
      return {
        found: true,
        completed: false, // still active — not yet completed
        source: 'subject-ui-json',
        practiceSessionId: null,
        sessionStatus: 'active',
        summaryStatus: null,
        reason: 'Session still active in subject state',
      };
    }
  }

  return {
    found: false,
    completed: false,
    source: 'unknown',
    practiceSessionId: null,
    sessionStatus: null,
    summaryStatus: null,
    reason: 'No matching hero session evidence found',
  };
}

function validatePracticeSession(row, { taskId, questId, questFingerprint, learnerId, subjectId }) {
  if (row.learner_id !== learnerId) {
    return { found: true, completed: false, learnerMismatch: true, reason: 'Session belongs to different learner' };
  }
  if (row.subject_id !== subjectId) {
    return { found: false, completed: false, reason: 'Subject mismatch' };
  }
  if (row.status !== 'completed') {
    return { found: true, completed: false, source: 'practice-session', sessionStatus: row.status, reason: 'Session not completed' };
  }
  const summary = safeParseJson(row.summary_json);
  if (!summary?.heroContext) {
    return { found: true, completed: true, source: 'practice-session', practiceSessionId: row.id, sessionStatus: 'completed', summaryStatus: 'completed', reason: 'Completed but no heroContext in summary (pre-P3 session)' };
  }
  if (summary.heroContext.questId !== questId || summary.heroContext.taskId !== taskId) {
    return { found: true, completed: false, reason: 'heroContext identity mismatch' };
  }
  if (summary.heroContext.questFingerprint !== questFingerprint) {
    return { found: true, completed: false, reason: 'heroContext fingerprint mismatch' };
  }
  return {
    found: true,
    completed: true,
    source: 'practice-session',
    practiceSessionId: row.id,
    sessionStatus: 'completed',
    summaryStatus: 'completed',
    reason: null,
  };
}

export function isWithinGraceWindow(dateKey, nowTs) {
  if (!dateKey) return false;
  // dateKey format: YYYY-MM-DD
  // The date ends at midnight of the NEXT day in UTC (approximation for Europe/London)
  // Grace window extends HERO_CLAIM_GRACE_HOURS past that
  try {
    const parts = dateKey.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    // End of the dateKey day in UTC
    const dayEndUtc = Date.UTC(year, month, day + 1);
    const graceEndTs = dayEndUtc + (HERO_CLAIM_GRACE_HOURS * 60 * 60 * 1000);
    return nowTs <= graceEndTs;
  } catch {
    return false;
  }
}

function safeParseJson(str) {
  if (!str) return null;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return null; }
}
