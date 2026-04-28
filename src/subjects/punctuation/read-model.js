import { currentReleaseRewardEntries, projectPunctuationStars } from './star-projection.js';
import { stageFor, PUNCTUATION_STAR_THRESHOLDS, PUNCTUATION_GRAND_STAR_THRESHOLDS } from '../../platform/game/monsters.js';
import {
  PUNCTUATION_CLIENT_SKILLS,
} from './punctuation-manifest.js';

export { PUNCTUATION_CLIENT_SKILLS };

const DAY_MS = 24 * 60 * 60 * 1000;
const CURRENT_RELEASE_ID = 'punctuation-r4-full-14-skill-structure';
const TOTAL_REWARD_UNITS = 14;
const DAILY_TARGET_ATTEMPTS = 4;

const ITEM_MODE_LABELS = Object.freeze({
  choose: 'Choice',
  insert: 'Insert punctuation',
  fix: 'Proofreading',
  transfer: 'Transfer writing',
  combine: 'Sentence combining',
  paragraph: 'Paragraph repair',
});

const SESSION_MODE_LABELS = Object.freeze({
  smart: 'Smart review',
  guided: 'Guided learn',
  weak: 'Weak spots',
  gps: 'GPS test',
  endmarks: 'Endmarks focus',
  apostrophe: 'Apostrophe focus',
  speech: 'Speech focus',
  comma_flow: 'Comma / flow focus',
  boundary: 'Boundary focus',
  structure: 'Structure focus',
});

function asTs(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function positiveTs(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function humanLabel(value) {
  return String(value || '')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function itemModeLabel(value) {
  return ITEM_MODE_LABELS[value] || humanLabel(value) || 'Practice item';
}

function sessionModeLabel(value) {
  return SESSION_MODE_LABELS[value] || humanLabel(value) || 'Practice session';
}

function normaliseStringArray(value) {
  return (Array.isArray(value) ? value : []).filter((entry) => typeof entry === 'string' && entry);
}

function normaliseMemoryState(value) {
  const raw = isPlainObject(value) ? value : {};
  return {
    attempts: Math.max(0, Number(raw.attempts) || 0),
    correct: Math.max(0, Number(raw.correct) || 0),
    incorrect: Math.max(0, Number(raw.incorrect) || 0),
    streak: Math.max(0, Number(raw.streak) || 0),
    lapses: Math.max(0, Number(raw.lapses) || 0),
    dueAt: Math.max(0, Number(raw.dueAt) || 0),
    firstCorrectAt: positiveTs(raw.firstCorrectAt),
    lastCorrectAt: positiveTs(raw.lastCorrectAt),
    lastSeen: Math.max(0, Number(raw.lastSeen) || 0),
  };
}

function memorySnapshot(value, nowTs) {
  const state = normaliseMemoryState(value);
  const attempts = state.attempts;
  const accuracy = attempts ? state.correct / attempts : 0;
  const correctSpanDays = state.firstCorrectAt != null && state.lastCorrectAt != null && state.lastCorrectAt >= state.firstCorrectAt
    ? Math.floor((state.lastCorrectAt - state.firstCorrectAt) / DAY_MS)
    : 0;
  let bucket = 'new';
  if (!attempts) bucket = 'new';
  else if (accuracy < 0.65 || (state.lapses >= 2 && state.streak === 0)) bucket = 'weak';
  else if (state.streak >= 3 && accuracy >= 0.8 && correctSpanDays >= 7) bucket = 'secure';
  else if (state.dueAt && state.dueAt <= nowTs) bucket = 'due';
  else bucket = 'learning';
  const mastery = attempts === 0
    ? 0
    : Math.round(100 * (
        accuracy * 0.55
        + Math.min(correctSpanDays / 14, 1) * 0.25
        + Math.min(state.streak / 4, 1) * 0.20
      ));
  return { state, attempts, accuracy, bucket, mastery, secure: bucket === 'secure', due: state.dueAt > 0 && state.dueAt <= nowTs };
}

function percent(correct, attempts) {
  const total = Math.max(0, Number(attempts) || 0);
  if (!total) return null;
  return Math.round((Math.max(0, Number(correct) || 0) / total) * 100);
}

function skillById() {
  return new Map(PUNCTUATION_CLIENT_SKILLS.map((skill) => [skill.id, skill]));
}

function skillNames(skills, skillIds = []) {
  return normaliseStringArray(skillIds)
    .map((skillId) => skills.get(skillId)?.name || humanLabel(skillId))
    .filter(Boolean);
}

function normaliseAttempt(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const itemMode = typeof raw.itemMode === 'string' ? raw.itemMode : (typeof raw.mode === 'string' ? raw.mode : '');
  const supportLevel = Math.max(0, Number(raw.supportLevel) || 0);
  return {
    ts: asTs(raw.ts, 0),
    sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : null,
    itemId: typeof raw.itemId === 'string' ? raw.itemId : '',
    variantSignature: typeof raw.variantSignature === 'string' ? raw.variantSignature : '',
    itemMode,
    mode: itemMode,
    skillIds: normaliseStringArray(raw.skillIds),
    rewardUnitId: typeof raw.rewardUnitId === 'string' ? raw.rewardUnitId : '',
    sessionMode: typeof raw.sessionMode === 'string' ? raw.sessionMode : 'smart',
    testMode: raw.testMode === 'gps' ? 'gps' : null,
    supportLevel,
    supportKind: typeof raw.supportKind === 'string' ? raw.supportKind : (supportLevel > 0 ? 'guided' : null),
    correct: raw.correct === true,
    misconceptionTags: normaliseStringArray(raw.misconceptionTags),
    facetOutcomes: (Array.isArray(raw.facetOutcomes) ? raw.facetOutcomes : [])
      .filter(isPlainObject)
      .map((facet) => ({
        id: typeof facet.id === 'string' ? facet.id : '',
        label: typeof facet.label === 'string' ? facet.label : '',
        ok: facet.ok === true,
      }))
      .filter((facet) => facet.id),
  };
}

function groupAttemptAccuracy(attempts, keyFn, labelFn) {
  const groups = new Map();
  for (const attempt of attempts) {
    const id = keyFn(attempt) || 'unknown';
    const current = groups.get(id) || {
      subjectId: 'punctuation',
      id,
      label: labelFn(id),
      attempts: 0,
      correct: 0,
      wrong: 0,
      accuracy: null,
    };
    current.attempts += 1;
    if (attempt.correct) current.correct += 1;
    else current.wrong += 1;
    current.accuracy = percent(current.correct, current.attempts);
    groups.set(id, current);
  }
  return [...groups.values()]
    .sort((a, b) => b.attempts - a.attempts || String(a.label).localeCompare(String(b.label)));
}

function facetRows(progress, skills, nowTs) {
  const facets = isPlainObject(progress.facets) ? progress.facets : {};
  return Object.entries(facets)
    .map(([id, rawState]) => {
      const [skillId, itemMode] = id.split('::');
      const snap = memorySnapshot(rawState, nowTs);
      const state = snap.state;
      const skill = skills.get(skillId);
      return {
        subjectId: 'punctuation',
        id,
        skillId,
        skillName: skill?.name || humanLabel(skillId),
        itemMode: itemMode || '',
        itemModeLabel: itemModeLabel(itemMode),
        label: `${skill?.name || humanLabel(skillId)} · ${itemModeLabel(itemMode)}`,
        status: snap.bucket,
        attempts: state.attempts,
        correct: state.correct,
        wrong: state.incorrect,
        accuracy: percent(state.correct, state.attempts),
        mastery: snap.mastery,
        dueAt: state.dueAt,
        lastSeenAt: state.lastSeen,
      };
    })
    .filter((entry) => entry.attempts > 0)
    .sort((a, b) => {
      const statusOrder = { weak: 0, due: 1, learning: 2, new: 3, secure: 4 };
      return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
        || a.mastery - b.mastery
        || b.wrong - a.wrong
        || b.lastSeenAt - a.lastSeenAt
        || String(a.label).localeCompare(String(b.label));
    });
}

function recentMistakes(attempts, skills) {
  return attempts
    .filter((attempt) => !attempt.correct)
    .slice(-8)
    .reverse()
    .map((attempt) => {
      const names = skillNames(skills, attempt.skillIds);
      const primarySkill = skills.get(attempt.skillIds[0]);
      return {
        subjectId: 'punctuation',
        itemId: attempt.itemId,
        label: `${primarySkill?.name || names[0] || 'Punctuation'} · ${itemModeLabel(attempt.itemMode)}`,
        itemMode: attempt.itemMode,
        itemModeLabel: itemModeLabel(attempt.itemMode),
        sessionMode: attempt.sessionMode,
        sessionModeLabel: sessionModeLabel(attempt.sessionMode),
        skillIds: attempt.skillIds,
        skillNames: names,
        rewardUnitId: attempt.rewardUnitId,
        misconceptionTags: attempt.misconceptionTags.slice(0, 6),
        facetOutcomes: attempt.facetOutcomes
          .filter((facet) => facet.ok !== true)
          .map((facet) => ({ id: facet.id, label: facet.label || humanLabel(facet.id), ok: false }))
          .slice(0, 6),
        supportLevel: attempt.supportLevel,
        supportKind: attempt.supportKind,
        testMode: attempt.testMode,
        createdAt: attempt.ts,
      };
    });
}

function misconceptionPatterns(attempts) {
  const patterns = new Map();
  for (const attempt of attempts) {
    for (const tag of attempt.misconceptionTags) {
      const current = patterns.get(tag) || {
        subjectId: 'punctuation',
        id: tag,
        label: `${humanLabel(tag)} pattern`,
        count: 0,
        lastSeenAt: 0,
        source: 'punctuation-attempts',
      };
      current.count += 1;
      current.lastSeenAt = Math.max(current.lastSeenAt, attempt.ts);
      patterns.set(tag, current);
    }
  }
  return [...patterns.values()]
    .sort((a, b) => b.count - a.count || b.lastSeenAt - a.lastSeenAt)
    .slice(0, 8);
}

function dayIndex(value) {
  return Math.floor(asTs(value, 0) / DAY_MS);
}

function streakSummary(attempts, nowTs) {
  const today = dayIndex(nowTs);
  const activeDays = [...new Set(attempts.map((attempt) => dayIndex(attempt.ts)).filter((day) => day >= 0))]
    .sort((a, b) => a - b);
  const activeDaySet = new Set(activeDays);
  let currentDays = 0;
  for (let day = today; day >= 0 && activeDaySet.has(day); day -= 1) currentDays += 1;
  let bestDays = 0;
  let run = 0;
  let previous = null;
  for (const day of activeDays) {
    run = previous != null && day === previous + 1 ? run + 1 : 1;
    bestDays = Math.max(bestDays, run);
    previous = day;
  }
  return { currentDays, bestDays, activeDays: activeDays.length };
}

function dailyGoal(attempts, nowTs) {
  const today = dayIndex(nowTs);
  const attemptsToday = attempts.filter((attempt) => dayIndex(attempt.ts) === today);
  return {
    targetAttempts: DAILY_TARGET_ATTEMPTS,
    attemptsToday: attemptsToday.length,
    correctToday: attemptsToday.filter((attempt) => attempt.correct).length,
    completed: attemptsToday.length >= DAILY_TARGET_ATTEMPTS,
    progressPercent: Math.min(100, Math.round((attemptsToday.length / DAILY_TARGET_ATTEMPTS) * 100)),
  };
}

function recentSessionRows(practiceSessions) {
  return (Array.isArray(practiceSessions) ? practiceSessions : [])
    .filter((record) => record?.subjectId === 'punctuation')
    .sort((a, b) => asTs(b.updatedAt, 0) - asTs(a.updatedAt, 0))
    .slice(0, 6)
    .map((record) => {
      const total = Math.max(0, Number(record?.summary?.total) || 0);
      const correct = Math.max(0, Number(record?.summary?.correct) || 0);
      return {
        id: record.id,
        subjectId: 'punctuation',
        status: record.status,
        sessionKind: record.sessionKind || record?.summary?.sessionMode || 'smart',
        label: record?.summary?.label || sessionModeLabel(record.sessionKind || 'smart'),
        updatedAt: asTs(record.updatedAt, asTs(record.createdAt, 0)),
        mistakeCount: Math.max(0, total - correct),
        headline: total ? `${correct}/${total}` : '',
      };
    });
}

function skillRowsFromAttempts(attempts, skills) {
  return PUNCTUATION_CLIENT_SKILLS.map((skill) => {
    const rows = attempts.filter((attempt) => attempt.skillIds.includes(skill.id));
    const correct = rows.filter((attempt) => attempt.correct).length;
    return {
      subjectId: 'punctuation',
      skillId: skill.id,
      name: skill.name,
      clusterId: skill.clusterId,
      attempts: rows.length,
      correct,
      wrong: rows.length - correct,
      accuracy: percent(correct, rows.length),
    };
  });
}

function buildStrengths(skillRows) {
  return skillRows
    .filter((row) => row.attempts > 0 && (row.accuracy ?? 0) >= 80)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0) || b.attempts - a.attempts)
    .slice(0, 3)
    .map((row) => ({
      subjectId: 'punctuation',
      id: row.skillId,
      label: row.name,
      detail: `${row.correct}/${row.attempts} accurate attempts`,
      secureCount: row.correct,
      dueCount: 0,
      troubleCount: row.wrong,
    }));
}

function buildWeaknesses(weakestFacets) {
  return weakestFacets
    .filter((row) => row.status === 'weak' || row.status === 'due')
    .slice(0, 3)
    .map((row) => ({
      subjectId: 'punctuation',
      id: row.id,
      label: row.label,
      detail: `${row.status} · ${row.correct}/${row.attempts} correct`,
      secureCount: row.status === 'secure' ? 1 : 0,
      dueCount: row.status === 'due' ? 1 : 0,
      troubleCount: row.status === 'weak' ? 1 : 0,
    }));
}

function activeSessionRecord(practiceSessions) {
  return (Array.isArray(practiceSessions) ? practiceSessions : [])
    .filter((record) => record?.subjectId === 'punctuation')
    .find((record) => record?.status === 'active') || null;
}

export function buildPunctuationLearnerReadModel({
  subjectStateRecord = null,
  practiceSessions = [],
  now = Date.now,
} = {}) {
  const nowTs = typeof now === 'function' ? asTs(now(), Date.now()) : asTs(now, Date.now());
  const stateRecord = isPlainObject(subjectStateRecord) ? subjectStateRecord : {};
  const data = isPlainObject(stateRecord.data) ? stateRecord.data : {};
  const progress = isPlainObject(data.progress) ? data.progress : {};
  const items = isPlainObject(progress.items) ? progress.items : {};
  const rewardUnits = isPlainObject(progress.rewardUnits) ? progress.rewardUnits : {};
  const attempts = (Array.isArray(progress.attempts) ? progress.attempts : []).map(normaliseAttempt);
  const correct = attempts.filter((attempt) => attempt.correct).length;
  const skills = skillById();
  const itemSnapshots = Object.entries(items).map(([itemId, value]) => ({ itemId, ...memorySnapshot(value, nowTs) }));
  const secureItems = itemSnapshots.filter((entry) => entry.bucket === 'secure').length;
  const dueItems = itemSnapshots.filter((entry) => entry.bucket === 'due').length;
  const weakItems = itemSnapshots.filter((entry) => entry.bucket === 'weak').length;
  const trackedRewardUnitEntries = currentReleaseRewardEntries(rewardUnits, CURRENT_RELEASE_ID);
  const trackedRewardUnitCount = trackedRewardUnitEntries.length;
  const securedRewardUnitCount = trackedRewardUnitEntries.filter(
    (entry) => asTs(entry.securedAt, 0) > 0,
  ).length;
  // U7: compute deep-secured reward units from facet evidence.
  // A reward unit is deep-secured when:
  //   (a) it has securedAt > 0, AND
  //   (b) at least one facet for a skill in that unit's cluster is deep-secure
  //       (memorySnapshot.secure === true AND raw lapses === 0).
  // This mirrors the deep-secure criteria used by computeMasteryStars in
  // star-projection.js (lines 368-372).
  const clusterToSkillIds = new Map();
  for (const skill of PUNCTUATION_CLIENT_SKILLS) {
    if (!clusterToSkillIds.has(skill.clusterId)) clusterToSkillIds.set(skill.clusterId, new Set());
    clusterToSkillIds.get(skill.clusterId).add(skill.id);
  }
  const facetEntries = isPlainObject(progress.facets) ? progress.facets : {};
  let deepSecuredRewardUnitCount = 0;
  for (const entry of trackedRewardUnitEntries) {
    if (asTs(entry.securedAt, 0) <= 0) continue;
    const entryClusterId = typeof entry.clusterId === 'string' ? entry.clusterId : '';
    const skillIds = clusterToSkillIds.get(entryClusterId);
    if (!skillIds) continue;
    let hasDeepSecureFacet = false;
    for (const [facetId, facetState] of Object.entries(facetEntries)) {
      const [skillId] = facetId.split('::');
      if (!skillIds.has(skillId)) continue;
      const snap = memorySnapshot(facetState, nowTs);
      const rawLapses = Math.max(0, Number((isPlainObject(facetState) ? facetState : {}).lapses) || 0);
      if (snap.secure && rawLapses === 0) {
        hasDeepSecureFacet = true;
        break;
      }
    }
    if (hasDeepSecureFacet) deepSecuredRewardUnitCount += 1;
  }
  // U4: project Star counts from learning evidence. The ledger provides
  // per-monster breakdowns (tryStars, practiceStars, secureStars,
  // masteryStars, total) and a grand Star total. `starDerivedStage` is
  // computed here so the read-model consumer can display star-derived
  // monster stages. `maxStageEver` is left as 0 — the read-model does
  // not have access to the monster codex state (lives in
  // `gameStateRepository`); the view-model merges codex state at render
  // time to produce the final displayStage.
  const starLedger = projectPunctuationStars(progress, CURRENT_RELEASE_ID);
  const starViewPerMonster = {};
  for (const [monsterId, starEntry] of Object.entries(starLedger.perMonster)) {
    const starDerivedStage = stageFor(starEntry.total, PUNCTUATION_STAR_THRESHOLDS);
    starViewPerMonster[monsterId] = {
      tryStars: starEntry.tryStars,
      practiceStars: starEntry.practiceStars,
      secureStars: starEntry.secureStars,
      masteryStars: starEntry.masteryStars,
      total: starEntry.total,
      starDerivedStage,
    };
  }
  const grandStarDerivedStage = stageFor(
    starLedger.grand.grandStars,
    PUNCTUATION_GRAND_STAR_THRESHOLDS,
  );
  const starView = {
    perMonster: starViewPerMonster,
    grand: {
      grandStars: starLedger.grand.grandStars,
      total: starLedger.grand.total,
      starDerivedStage: grandStarDerivedStage,
    },
  };

  const weakestFacets = facetRows(progress, skills, nowTs);
  const skillRows = skillRowsFromAttempts(attempts, skills);
  const strengths = buildStrengths(skillRows);
  const weaknesses = buildWeaknesses(weakestFacets);
  const sessions = recentSessionRows(practiceSessions);
  const activeSession = activeSessionRecord(practiceSessions);
  const patterns = misconceptionPatterns(attempts);
  const lastActivityAt = Math.max(
    ...attempts.map((attempt) => attempt.ts),
    ...itemSnapshots.map((entry) => entry.state.lastSeen),
    ...sessions.map((session) => session.updatedAt),
    asTs(stateRecord.updatedAt, 0),
    0,
  );

  let currentFocus = {
    subjectId: 'punctuation',
    recommendedMode: 'smart',
    label: 'Keep Punctuation warm with Smart review',
    detail: attempts.length
      ? `${attempts.length} recorded attempt${attempts.length === 1 ? '' : 's'} across the current release.`
      : 'No Punctuation attempts are stored yet.',
    dueCount: dueItems,
    troubleCount: weakItems,
    activeSessionId: null,
  };
  if (activeSession) {
    currentFocus = {
      subjectId: 'punctuation',
      recommendedMode: activeSession.sessionKind || 'smart',
      label: `Continue ${sessionModeLabel(activeSession.sessionKind || 'smart')}`,
      detail: 'A live Punctuation round is saved for this learner.',
      dueCount: dueItems,
      troubleCount: weakItems,
      activeSessionId: activeSession.id,
    };
  } else if (weaknesses.length) {
    currentFocus = {
      subjectId: 'punctuation',
      recommendedMode: 'weak',
      label: 'Run a Punctuation weak spots drill next',
      detail: weaknesses[0].label,
      dueCount: dueItems,
      troubleCount: weakItems || weaknesses.length,
      activeSessionId: null,
    };
  } else if (dueItems) {
    currentFocus = {
      subjectId: 'punctuation',
      recommendedMode: 'smart',
      label: 'Clear due Punctuation practice',
      detail: `${dueItems} item${dueItems === 1 ? '' : 's'} are due for spaced review.`,
      dueCount: dueItems,
      troubleCount: weakItems,
      activeSessionId: null,
    };
  }

  const hasEvidence = attempts.length > 0 || sessions.length > 0;
  const accuracy = percent(correct, attempts.length);
  return {
    subjectId: 'punctuation',
    hasEvidence,
    currentFocus,
    starView,
    progressSnapshot: {
      subjectId: 'punctuation',
      releaseId: CURRENT_RELEASE_ID,
      totalRewardUnits: TOTAL_REWARD_UNITS,
      trackedRewardUnits: trackedRewardUnitCount,
      securedRewardUnits: securedRewardUnitCount,
      deepSecuredRewardUnits: deepSecuredRewardUnitCount,
      trackedItems: itemSnapshots.length,
      secureItems,
      dueItems,
      weakItems,
      attempts: attempts.length,
      accuracyPercent: accuracy,
    },
    overview: {
      attempts: attempts.length,
      correct,
      accuracyPercent: accuracy,
      sessionsCompleted: Math.max(0, Number(progress.sessionsCompleted) || 0),
      securedRewardUnits: securedRewardUnitCount,
      dueItems,
      weakItems,
      lastActivityAt,
    },
    skillRows,
    bySessionMode: groupAttemptAccuracy(attempts, (attempt) => attempt.sessionMode || 'smart', sessionModeLabel),
    byItemMode: groupAttemptAccuracy(attempts, (attempt) => attempt.itemMode || 'unknown', itemModeLabel),
    weakestFacets: weakestFacets.slice(0, 8),
    recentMistakes: recentMistakes(attempts, skills),
    misconceptionPatterns: patterns,
    recentSessions: sessions,
    strengths,
    weaknesses,
    dailyGoal: dailyGoal(attempts, nowTs),
    streak: streakSummary(attempts, nowTs),
    releaseDiagnostics: {
      subjectId: 'punctuation',
      releaseId: CURRENT_RELEASE_ID,
      publishedSkillCount: PUNCTUATION_CLIENT_SKILLS.length,
      publishedRewardUnitCount: TOTAL_REWARD_UNITS,
      trackedRewardUnitCount: trackedRewardUnitCount,
      sessionCount: sessions.length,
      weakPatternCount: patterns.length,
      productionExposureStatus: 'enabled',
    },
  };
}
