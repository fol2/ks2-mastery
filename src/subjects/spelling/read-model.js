import { WORD_BY_SLUG as DEFAULT_WORD_BY_SLUG } from './data/word-data.js';
import {
  GUARDIAN_SECURE_STAGE,
  normaliseGuardianMap,
  normaliseYearFilter,
} from './service-contract.js';
import {
  computeGuardianMissionState,
  deriveGuardianAggregates,
  selectGuardianWords,
} from '../../../shared/spelling/service.js';
import { normaliseBufferedGeminiVoice, normaliseTtsProvider } from './tts-providers.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// U2: single source of truth lives in service-contract.js. Re-using the
// canonical export keeps this read-model aligned with the service layer
// (selectGuardianWords, getPostMasteryState) and the view-model
// (wordBankFilterMatchesStatus) — changing the constant in the contract
// propagates to every surface that gates on Mega.
const SECURE_STAGE = GUARDIAN_SECURE_STAGE;

function asTs(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normaliseProgressRecord(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    stage: Number.isFinite(Number(raw.stage)) ? Number(raw.stage) : 0,
    attempts: Number.isFinite(Number(raw.attempts)) ? Number(raw.attempts) : 0,
    correct: Number.isFinite(Number(raw.correct)) ? Number(raw.correct) : 0,
    wrong: Number.isFinite(Number(raw.wrong)) ? Number(raw.wrong) : 0,
    dueDay: Number.isFinite(Number(raw.dueDay)) ? Number(raw.dueDay) : 0,
    lastDay: Number.isFinite(Number(raw.lastDay)) ? Number(raw.lastDay) : null,
    lastResult: typeof raw.lastResult === 'boolean' ? raw.lastResult : null,
  };
}

function todayDay(nowTs = Date.now()) {
  return Math.floor(asTs(nowTs, Date.now()) / DAY_MS);
}

function accuracyPercent(correct, wrong) {
  const attempts = Math.max(0, Number(correct) || 0) + Math.max(0, Number(wrong) || 0);
  if (!attempts) return null;
  return Math.round((Math.max(0, Number(correct) || 0) / attempts) * 100);
}

function isTroubleProgress(progress, currentDay) {
  return progress.wrong > 0 && (progress.wrong >= progress.correct || progress.dueDay <= currentDay);
}

function yearLabel(value) {
  return value === '5-6' ? 'Years 5-6' : 'Years 3-4';
}

function familyLabel(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? `${text} family` : 'Mixed spelling families';
}

function runtimeWordMap(runtimeSnapshot) {
  const bySlug = runtimeSnapshot?.wordBySlug && isPlainObject(runtimeSnapshot.wordBySlug)
    ? runtimeSnapshot.wordBySlug
    : DEFAULT_WORD_BY_SLUG;
  const words = Array.isArray(runtimeSnapshot?.words)
    ? runtimeSnapshot.words
    : Object.values(bySlug);
  return {
    words,
    bySlug,
  };
}

function groupBy(items, keyFn) {
  const output = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    const current = output.get(key) || [];
    current.push(item);
    output.set(key, current);
  }
  return output;
}

function sortTop(entries, scoreFn, limit = 3) {
  return [...entries]
    .sort((a, b) => {
      const scoreDelta = scoreFn(b) - scoreFn(a);
      if (scoreDelta) return scoreDelta;
      return String(a.label || a.id || '').localeCompare(String(b.label || b.id || ''));
    })
    .slice(0, limit);
}

function sessionLabel(kind) {
  if (kind === 'test') return 'SATs 20';
  if (kind === 'single') return 'Single word';
  if (kind === 'trouble') return 'Trouble drill';
  if (kind === 'boss') return 'Boss Dictation';
  if (kind === 'guardian') return 'Guardian Mission';
  return 'Smart review';
}

const POST_MASTERY_PREVIEW_LENGTH = 8;

/**
 * Pure post-mastery selector. No side effects, no event-log replay — just
 * derives the aggregates the Setup / Summary / Word Bank scenes need from the
 * current `{prefs, progress, guardian}` data map plus the runtime content
 * snapshot.
 *
 * `now` defaults to `Date.now` so callers that don't care about determinism
 * can omit it; the U4 tests always inject a fixed `now` to keep assertions
 * reproducible.
 */
export function getSpellingPostMasteryState({
  subjectStateRecord = null,
  runtimeSnapshot = null,
  now = Date.now,
} = {}) {
  const nowTs = typeof now === 'function' ? asTs(now(), Date.now()) : asTs(now, Date.now());
  const currentDay = todayDay(nowTs);
  const stateRecord = subjectStateRecord && typeof subjectStateRecord === 'object' && !Array.isArray(subjectStateRecord)
    ? subjectStateRecord
    : {};
  const progressMap = isPlainObject(stateRecord?.data?.progress) ? stateRecord.data.progress : {};
  const rawGuardianMap = isPlainObject(stateRecord?.data?.guardian) ? stateRecord.data.guardian : {};
  const guardianMap = normaliseGuardianMap(rawGuardianMap, currentDay);
  const runtime = runtimeWordMap(runtimeSnapshot);

  // allWordsMega requires BOTH: (1) the secure-core count equals the
  // published-core count, AND (2) the published core count is non-zero.
  // Extra-pool entries are excluded entirely from either side of the
  // comparison — graduation is a statutory-pool concept only.
  let publishedCoreCount = 0;
  for (const word of runtime.words) {
    if (!word) continue;
    if ((word.spellingPool === 'extra' ? 'extra' : 'core') === 'core') publishedCoreCount += 1;
  }
  let secureCoreCount = 0;
  for (const [slug, entry] of Object.entries(progressMap)) {
    const progress = normaliseProgressRecord(entry);
    if (progress.stage < SECURE_STAGE) continue;
    const word = runtime.bySlug[slug] || DEFAULT_WORD_BY_SLUG[slug];
    const pool = word ? (word.spellingPool === 'extra' ? 'extra' : 'core') : 'core';
    if (pool !== 'core') continue;
    secureCoreCount += 1;
  }
  const allWordsMega = publishedCoreCount > 0 && secureCoreCount === publishedCoreCount;

  // U2: orphan sanitiser — only entries whose slug is still a valid Guardian
  // candidate (known in runtime, stage >= Mega, pool !== extra) contribute to
  // the counts or the earliest-due calculation. Persisted orphan records are
  // preserved in `data.guardian`; they simply stay out of the numbers until
  // the content bundle re-publishes their slug at core-pool + stage >= Mega.
  //
  // U1: alongside the legacy aggregate counts we derive decomposed counts
  // (wobbling-due vs non-wobbling-due) and collect the eligible-entries list
  // so the dashboard state machine (`computeGuardianMissionState`) can branch
  // copy without re-scanning the map.
  //
  // The derivation lives in `shared/spelling/service.js::deriveGuardianAggregates`
  // so the service-layer `getPostMasteryState` and this read-model consume
  // exactly the same walk — any future refinement (e.g. a richer orphan
  // predicate) lands in one place. The invariant
  // `wobblingDueCount + nonWobblingDueCount === guardianDueCount` is
  // guaranteed by that helper; tests in spelling-guardian.test.js pin it.
  const aggregates = deriveGuardianAggregates({
    guardianMap,
    progressMap,
    wordBySlug: runtime.bySlug,
    todayDay: currentDay,
  });
  const {
    eligibleGuardianEntries,
    guardianDueCount,
    wobblingDueCount,
    nonWobblingDueCount,
    wobblingCount,
    nextGuardianDueDay,
    unguardedMegaCount,
  } = aggregates;

  const guardianAvailableCount = unguardedMegaCount + eligibleGuardianEntries.length;
  const guardianMissionState = computeGuardianMissionState({
    allWordsMega,
    eligibleGuardianEntries,
    unguardedMegaCount,
    todayDay: currentDay,
    policy: { allowOptionalPatrol: true },
  });
  const guardianMissionAvailable = guardianMissionState !== 'locked' && guardianMissionState !== 'rested';

  // Recommended words — a deterministic preview for UI consumers. We only
  // produce this when the learner has actually graduated; otherwise the
  // preview would be meaningless (no Guardian surface to consume it yet).
  // A constant seeded random (() => 0.5) keeps the output deterministic
  // across renders and test runs; the UI is explicitly documented as a
  // snapshot preview, not a stochastic reselection.
  const recommendedWords = allWordsMega
    ? selectGuardianWords({
        guardianMap,
        progressMap,
        wordBySlug: runtime.bySlug,
        todayDay: currentDay,
        length: POST_MASTERY_PREVIEW_LENGTH,
        random: () => 0.5,
      })
    : [];

  return {
    allWordsMega,
    guardianDueCount,
    wobblingCount,
    wobblingDueCount,
    nonWobblingDueCount,
    unguardedMegaCount,
    guardianAvailableCount,
    guardianMissionState,
    guardianMissionAvailable,
    recommendedWords,
    nextGuardianDueDay,
  };
}

export function buildSpellingLearnerReadModel({
  subjectStateRecord = null,
  practiceSessions = [],
  eventLog = [],
  runtimeSnapshot = null,
  now = Date.now,
} = {}) {
  const nowTs = typeof now === 'function' ? asTs(now(), Date.now()) : asTs(now, Date.now());
  const currentDay = todayDay(nowTs);
  const stateRecord = subjectStateRecord && typeof subjectStateRecord === 'object' && !Array.isArray(subjectStateRecord)
    ? subjectStateRecord
    : {};
  const progressMap = isPlainObject(stateRecord?.data?.progress) ? stateRecord.data.progress : {};
  const prefs = isPlainObject(stateRecord?.data?.prefs) ? stateRecord.data.prefs : {};
  const runtime = runtimeWordMap(runtimeSnapshot);
  const trackedRows = Object.entries(progressMap).map(([slug, entry]) => {
    const progress = normaliseProgressRecord(entry);
    const word = runtime.bySlug[slug] || DEFAULT_WORD_BY_SLUG[slug] || {
      slug,
      word: slug,
      family: '',
      year: '3-4',
      yearLabel: 'Years 3-4',
      spellingPool: 'core',
    };
    const secure = progress.stage >= SECURE_STAGE;
    const due = progress.attempts > 0 && progress.dueDay <= currentDay && !secure;
    const trouble = isTroubleProgress(progress, currentDay);
    return {
      slug,
      word: word.word,
      family: word.family || '',
      familyLabel: familyLabel(word.family),
      year: word.year || '3-4',
      yearLabel: word.yearLabel || yearLabel(word.year),
      spellingPool: word.spellingPool === 'extra' ? 'extra' : 'core',
      progress,
      secure,
      due,
      trouble,
      accuracy: accuracyPercent(progress.correct, progress.wrong),
    };
  });

  const secureRows = trackedRows.filter((row) => row.secure);
  const dueRows = trackedRows.filter((row) => row.due);
  const troubleRows = trackedRows.filter((row) => row.trouble);
  const accuracy = accuracyPercent(
    trackedRows.reduce((sum, row) => sum + row.progress.correct, 0),
    trackedRows.reduce((sum, row) => sum + row.progress.wrong, 0),
  );

  const sessionRecords = (Array.isArray(practiceSessions) ? practiceSessions : [])
    .filter((record) => record?.subjectId === 'spelling')
    .sort((a, b) => asTs(b.updatedAt, 0) - asTs(a.updatedAt, 0));
  const activeSession = sessionRecords.find((record) => record?.status === 'active') || null;

  const byFamily = [...groupBy(trackedRows, (row) => row.family || row.year).entries()].map(([id, rows]) => {
    const secureCount = rows.filter((row) => row.secure).length;
    const dueCount = rows.filter((row) => row.due).length;
    const troubleCount = rows.filter((row) => row.trouble).length;
    const averageStage = rows.length
      ? rows.reduce((sum, row) => sum + row.progress.stage, 0) / rows.length
      : 0;
    return {
      id,
      label: rows[0]?.family ? familyLabel(rows[0].family) : yearLabel(rows[0]?.year),
      secureCount,
      dueCount,
      troubleCount,
      averageStage: Number(averageStage.toFixed(2)),
      rows,
    };
  });

  const strengths = sortTop(
    byFamily.filter((entry) => entry.secureCount > 0),
    (entry) => entry.secureCount * 10 + entry.averageStage,
    3,
  ).map((entry) => ({
    subjectId: 'spelling',
    id: entry.id,
    label: entry.label,
    detail: `${entry.secureCount} secure word${entry.secureCount === 1 ? '' : 's'}`,
    secureCount: entry.secureCount,
    dueCount: entry.dueCount,
    troubleCount: entry.troubleCount,
  }));

  const weaknesses = sortTop(
    byFamily.filter((entry) => entry.dueCount > 0 || entry.troubleCount > 0),
    (entry) => entry.troubleCount * 12 + entry.dueCount * 7 - entry.averageStage,
    3,
  ).map((entry) => ({
    subjectId: 'spelling',
    id: entry.id,
    label: entry.label,
    detail: `${entry.dueCount} due · ${entry.troubleCount} trouble`,
    secureCount: entry.secureCount,
    dueCount: entry.dueCount,
    troubleCount: entry.troubleCount,
  }));

  const misconceptionMap = new Map();
  for (const record of sessionRecords) {
    const mistakes = Array.isArray(record?.summary?.mistakes) ? record.summary.mistakes : [];
    for (const mistake of mistakes) {
      const key = `summary:${mistake.family || mistake.year || 'mixed'}`;
      const current = misconceptionMap.get(key) || {
        id: key,
        label: mistake.family ? `${mistake.family} family mistakes` : `${mistake.yearLabel || yearLabel(mistake.year)} mistakes`,
        count: 0,
        lastSeenAt: 0,
        source: 'session-summary',
      };
      current.count += 1;
      current.lastSeenAt = Math.max(current.lastSeenAt, asTs(record.updatedAt, 0));
      misconceptionMap.set(key, current);
    }
  }

  for (const event of Array.isArray(eventLog) ? eventLog : []) {
    if (event?.subjectId !== 'spelling') continue;
    if (event?.type !== 'spelling.retry-cleared') continue;
    const key = `retry:${event.family || event.yearBand || 'mixed'}`;
    const label = event.family
      ? `${event.family} family needed corrections`
      : `${event.yearBand === '5-6' ? 'Years 5-6' : 'Years 3-4'} words needed corrections`;
    const current = misconceptionMap.get(key) || {
      id: key,
      label,
      count: 0,
      lastSeenAt: 0,
      source: 'retry-cleared',
    };
    current.count += 1;
    current.lastSeenAt = Math.max(current.lastSeenAt, asTs(event.createdAt, 0));
    misconceptionMap.set(key, current);
  }

  const misconceptionPatterns = [...misconceptionMap.values()]
    .sort((a, b) => (b.count - a.count) || (b.lastSeenAt - a.lastSeenAt))
    .slice(0, 5);

  const recentSessions = sessionRecords.slice(0, 6).map((record) => {
    const summaryCards = Array.isArray(record?.summary?.cards) ? record.summary.cards : [];
    const mistakeCount = Array.isArray(record?.summary?.mistakes) ? record.summary.mistakes.length : 0;
    const scoreCard = summaryCards.find((card) => String(card?.label || '').toLowerCase().includes('correct')) || null;
    return {
      id: record.id,
      subjectId: 'spelling',
      status: record.status,
      sessionKind: record.sessionKind,
      label: record?.summary?.label || sessionLabel(record.sessionKind),
      updatedAt: asTs(record.updatedAt, asTs(record.createdAt, 0)),
      mistakeCount,
      headline: scoreCard?.value != null ? `${scoreCard.value}` : '',
    };
  });

  let currentFocus = {
    subjectId: 'spelling',
    recommendedMode: 'smart',
    label: 'Keep spelling warm with Smart Review',
    detail: secureRows.length
      ? `${secureRows.length} secure words ready for light review.`
      : 'No secure words yet. Start a fresh Smart Review round.',
    dueCount: dueRows.length,
    troubleCount: troubleRows.length,
    activeSessionId: null,
    currentWord: null,
  };

  if (activeSession) {
    const currentSlug = activeSession?.sessionState?.currentSlug || null;
    const currentWord = currentSlug ? (runtime.bySlug[currentSlug]?.word || currentSlug) : null;
    // Post-Mega modes (boss / guardian) must resume into their own scenes, not
    // the SATs Test Setup or Smart Review Setup. Without this branch the
    // Resume button routed Boss learners straight into SATs Test Setup and
    // persisted `mode: 'test'` (fol2/ks2-mastery#235 review follow-up).
    const kind = activeSession.sessionKind;
    const recommendedMode = kind === 'boss'
      ? 'boss'
      : kind === 'guardian'
      ? 'guardian'
      : kind === 'test'
      ? 'test'
      : 'smart';
    currentFocus = {
      subjectId: 'spelling',
      recommendedMode,
      label: `Continue ${sessionLabel(kind)}`,
      detail: currentWord ? `Current word: ${currentWord}.` : 'A live spelling round is saved for this learner.',
      dueCount: dueRows.length,
      troubleCount: troubleRows.length,
      activeSessionId: activeSession.id,
      currentWord,
    };
  } else if (weaknesses.length) {
    currentFocus = {
      subjectId: 'spelling',
      recommendedMode: 'trouble',
      label: 'Run a Trouble Drill next',
      detail: `${weaknesses[0].label} is carrying the heaviest current load.`,
      dueCount: dueRows.length,
      troubleCount: troubleRows.length,
      activeSessionId: null,
      currentWord: null,
    };
  } else if (dueRows.length) {
    currentFocus = {
      subjectId: 'spelling',
      recommendedMode: 'smart',
      label: 'Clear due spelling words',
      detail: `${dueRows.length} word${dueRows.length === 1 ? '' : 's'} are due for spaced review.`,
      dueCount: dueRows.length,
      troubleCount: troubleRows.length,
      activeSessionId: null,
      currentWord: null,
    };
  }

  const lastActivityAt = Math.max(
    ...trackedRows.map((row) => (row.progress.lastDay == null ? 0 : row.progress.lastDay * DAY_MS)),
    ...sessionRecords.map((record) => asTs(record.updatedAt, 0)),
    ...((Array.isArray(eventLog) ? eventLog : []).filter((event) => event?.subjectId === 'spelling').map((event) => asTs(event.createdAt, 0))),
    0,
  );

  // Post-mastery aggregates — computed via the same selector that external
  // callers use, so `buildSpellingLearnerReadModel(...).postMastery` and
  // `getSpellingPostMasteryState(...)` stay in lockstep (single source of
  // truth). `recommendedMode` is the only field that layers extra logic on
  // top: we prefer 'guardian' when the learner has graduated AND something
  // is actually due; otherwise we inherit the recommendation the legacy
  // branch above has already computed (smart / trouble / active-session).
  const postMasteryState = getSpellingPostMasteryState({
    subjectStateRecord: stateRecord,
    runtimeSnapshot,
    now,
  });
  const postMastery = {
    ...postMasteryState,
    recommendedMode: postMasteryState.allWordsMega && postMasteryState.guardianDueCount > 0
      ? 'guardian'
      : currentFocus.recommendedMode,
  };

  return {
    subjectId: 'spelling',
    prefs: {
      mode: typeof prefs.mode === 'string' ? prefs.mode : 'smart',
      yearFilter: normaliseYearFilter(prefs.yearFilter, 'core'),
      roundLength: typeof prefs.roundLength === 'string' ? prefs.roundLength : '20',
      extraWordFamilies: Boolean(prefs.extraWordFamilies),
      ttsProvider: normaliseTtsProvider(prefs.ttsProvider),
      bufferedGeminiVoice: normaliseBufferedGeminiVoice(prefs.bufferedGeminiVoice),
    },
    currentFocus,
    progressSnapshot: {
      subjectId: 'spelling',
      totalPublishedWords: Array.isArray(runtime.words) ? runtime.words.length : 0,
      trackedWords: trackedRows.length,
      secureWords: secureRows.length,
      dueWords: dueRows.length,
      troubleWords: troubleRows.length,
      accuracyPercent: accuracy,
    },
    overview: {
      trackedWords: trackedRows.length,
      secureWords: secureRows.length,
      dueWords: dueRows.length,
      troubleWords: troubleRows.length,
      accuracyPercent: accuracy,
      lastActivityAt,
    },
    strengths,
    weaknesses,
    misconceptionPatterns,
    recentSessions,
    postMastery,
  };
}
