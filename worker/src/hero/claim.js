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
export function resolveHeroClaimCommand({ body, heroProgressState, practiceSessionRows, nowTs, economyEnabled }) {
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
    economyEnabled,
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
      code: evidence.code || 'hero_claim_evidence_not_completed',
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

export function findCompletionEvidence({ taskId, questId, questFingerprint, learnerId, subjectId, practiceSessionId, practiceSessionRows, economyEnabled }) {
  // The bounded practice_sessions table is the sole completion authority.
  // Active rows carry heroContext in session_state_json; completed rows carry
  // it in summary_json. Production queries project just those fragments, while
  // the full JSON fallback below keeps this pure resolver easy to unit-test.
  if (practiceSessionRows && practiceSessionRows.length > 0) {
    // If a specific practiceSessionId was provided, check it first
    if (practiceSessionId) {
      const specific = practiceSessionRows.find(r => r.id === practiceSessionId);
      if (specific) {
        const result = validatePracticeSession(specific, { taskId, questId, questFingerprint, learnerId, subjectId, economyEnabled });
        if (result.found) return result;
      }
    }

    // Search the bounded candidates for matching heroContext. A newer active
    // session must not mask an older completed session for the same task.
    let activeMatch = null;
    for (const row of practiceSessionRows) {
      if (row.subject_id !== subjectId) continue;
      if (row.learner_id !== learnerId) {
        return { found: true, completed: false, learnerMismatch: true, reason: 'Session belongs to different learner' };
      }
      const heroContext = practiceSessionHeroContext(row);
      if (!heroContextMatches(heroContext, { taskId, questId, questFingerprint })) continue;

      if (row.status === 'active') {
        activeMatch ||= {
          found: true,
          completed: false,
          source: 'practice-session',
          practiceSessionId: row.id,
          sessionStatus: 'active',
          summaryStatus: null,
          reason: 'Session still active',
        };
        continue;
      }
      if (row.status !== 'completed') continue;

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
    if (activeMatch) return activeMatch;
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

function validatePracticeSession(row, { taskId, questId, questFingerprint, learnerId, subjectId, economyEnabled }) {
  if (row.learner_id !== learnerId) {
    return { found: true, completed: false, learnerMismatch: true, reason: 'Session belongs to different learner' };
  }
  if (row.subject_id !== subjectId) {
    return { found: false, completed: false, reason: 'Subject mismatch' };
  }
  if (row.status !== 'completed') {
    const heroContext = practiceSessionHeroContext(row);
    if (row.status !== 'active' || !heroContextMatches(heroContext, { taskId, questId, questFingerprint })) {
      return { found: false, completed: false, reason: 'Session identity mismatch' };
    }
    return { found: true, completed: false, source: 'practice-session', practiceSessionId: row.id, sessionStatus: row.status, reason: 'Session not completed' };
  }
  const heroContext = practiceSessionHeroContext(row);
  if (!heroContext) {
    if (economyEnabled) {
      return { found: true, completed: false, code: 'hero_claim_missing_hero_context', reason: 'Economy requires heroContext evidence' };
    }
    return { found: true, completed: true, source: 'practice-session', practiceSessionId: row.id, sessionStatus: 'completed', summaryStatus: 'completed', reason: 'Completed but no heroContext in summary (pre-P3 session)' };
  }
  if (heroContext.questId !== questId || heroContext.taskId !== taskId) {
    return { found: true, completed: false, reason: 'heroContext identity mismatch' };
  }
  if (heroContext.questFingerprint !== questFingerprint) {
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

function practiceSessionHeroContext(row) {
  const projectedCandidates = row?.status === 'active'
    ? [row?.active_hero_context_json, row?.summary_hero_context_json]
    : [row?.summary_hero_context_json];
  for (const candidate of projectedCandidates) {
    const projected = safeParseJson(candidate);
    if (projected && typeof projected === 'object' && !Array.isArray(projected)) return projected;
  }
  const documentCandidates = row?.status === 'active'
    ? [row?.session_state_json, row?.summary_json]
    : [row?.summary_json];
  for (const candidate of documentCandidates) {
    const document = safeParseJson(candidate);
    if (document?.heroContext && typeof document.heroContext === 'object') {
      return document.heroContext;
    }
  }
  return null;
}

function heroContextMatches(heroContext, { taskId, questId, questFingerprint }) {
  return heroContext?.source === 'hero-mode'
    && heroContext.questId === questId
    && heroContext.taskId === taskId
    && heroContext.questFingerprint === questFingerprint;
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
