import { WORD_BY_SLUG as DEFAULT_WORD_BY_SLUG } from './data/word-data.js';
import {
  GUARDIAN_SECURE_STAGE,
  SPELLING_CONTENT_RELEASE_ID,
  normaliseGuardianMap,
  normalisePostMegaRecord,
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
  // U11: Pattern Quest resume surface. Without this branch the Resume
  // card falls through to 'Smart review' and sends the learner into the
  // wrong scene on click.
  if (kind === 'pattern-quest') return 'Pattern Quest';
  return 'Smart review';
}

const POST_MASTERY_PREVIEW_LENGTH = 8;

// U1 (P2): allowlist regex for `blockingCoreSlugsPreview`. The preview ships
// to the Admin hub UI where (a) it could be screenshot / pasted into Slack,
// and (b) browser URL history could cache a malformed slug that survives
// beyond the in-memory admin state. Every slug is scrubbed through this
// regex before it joins the preview array — anything outside the expected
// KS2-slug shape is dropped, not rendered. H8 adversarial finding from the
// P2 plan §U1 reviewer pass.
//
// The tightened shape accepts only lowercase-letter/digit segments separated
// by single hyphens, each segment >=1 char, with at most 3 hyphens (i.e.
// up to 4 segments total). Overall length is capped at 32 characters. This
// keeps realistic KS2 curriculum slugs like `suffix-tion`, `i-before-e`,
// `prefix-un-in-im` but rejects editorial accidents such as
// `rude-word-test-do-not-ship` (5 segments, >32 chars), `abc---def`
// (double hyphen), `a-` (trailing hyphen), `TESTING-UPPER` (uppercase),
// `admin_internal` (underscore).
//
// Note: release-level publication state is enforced by the publisher; per-
// word publication is not a production contract (content producers do not
// set `word.published` per-word — `published` lives at release level only).
// Relying on a `word.published !== false` guard here would be vacuously true
// in production and give false confidence. The scrub therefore relies on
// shape + length only. A future follow-up could add a slug allowlist at
// the bundle publisher layer; that is out of scope for U1.
const BLOCKING_CORE_SLUG_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+){0,3}$/;
const BLOCKING_CORE_SLUG_MAX_LENGTH = 32;
const BLOCKING_CORE_SLUGS_PREVIEW_LIMIT = 10;

/**
 * Pure post-mastery selector. No side effects, no event-log replay — just
 * derives the aggregates the Setup / Summary / Word Bank scenes need from the
 * current `{prefs, progress, guardian}` data map plus the runtime content
 * snapshot.
 *
 * `now` defaults to `Date.now` so callers that don't care about determinism
 * can omit it; the U4 tests always inject a fixed `now` to keep assertions
 * reproducible.
 *
 * U1 (P2): `sourceHint` is an optional diagnostic label ('service' | 'worker'
 * | 'locked-fallback') that flows into `postMasteryDebug.source`. Callers
 * set this so the Admin hub "Post-mega diagnostic panel" can distinguish
 * a live service read from a remote-sync locked-fallback stub. Defaults to
 * 'service' because most callers are the synchronous service path; the
 * locked-fallback factory overrides to 'locked-fallback' explicitly.
 */
export function getSpellingPostMasteryState({
  subjectStateRecord = null,
  runtimeSnapshot = null,
  now = Date.now,
  sourceHint = 'service',
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
  // P2 U2: persisted sticky-graduation record. Null means "never graduated"
  // — fresh learners, pre-P2 persisted records (no migration needed because
  // `normalisePostMegaRecord` tolerates absent / malformed input), and any
  // legitimate pre-graduation state all map to null here.
  //
  // Declared with `let` so the pre-v3 backfill path below can mint an
  // in-memory record for learners who graduated before U2 shipped.
  let postMegaRecord = normalisePostMegaRecord(stateRecord?.data?.postMega);

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

  // P2 U2: Derive the three sticky-graduation surfaces from the persisted
  // `postMegaRecord` plus the live `allWordsMega` (renamed to allWordsMegaNow
  // internally to make the "live vs sticky" distinction loud). The dashboard
  // gate is a logical OR — a graduated learner keeps dashboard access even
  // if the content bundle later adds words they haven't drilled yet.
  //
  // `newCoreWordsSinceGraduation` is clamped at 0 for the retirement case
  // (publishedCoreCount < unlockedPublishedCoreCount). Retirements are
  // invisible to the child (M3 adversarial finding — keeps emotional
  // contract simple).
  const allWordsMegaNow = allWordsMega;

  // Pre-v3 graduated cohort backfill: if the learner is currently fully Mega
  // AND has no sticky record, mint one in-memory so postMegaDashboardAvailable
  // reflects their current graduation. The service layer writes the persisted
  // sticky-bit lazily on the next genuine submit via
  // detectAndPersistFirstGraduation (which now also accepts the pre-v3 path —
  // see service.js change). Without this, pre-v3 graduates silently lose the
  // dashboard when content adds a new core word because:
  //   1. They have `data.postMega: null` (never persisted under P1/P1.5).
  //   2. H1's first conjunct (`preSubmitAllMega === false`) rejects every
  //      submit because they're already at full Mega, so they never mint a
  //      sticky bit via normal play.
  //   3. A later content-add flips `allWordsMegaNow` to false,
  //      `postMegaUnlockedEver` stays false, `postMegaDashboardAvailable`
  //      becomes false — dashboard disappears (the exact emotional
  //      regression U2 exists to prevent).
  if (allWordsMegaNow && postMegaRecord === null) {
    postMegaRecord = {
      unlockedAt: (currentDay || 0) * DAY_MS,
      unlockedContentReleaseId: SPELLING_CONTENT_RELEASE_ID,
      unlockedPublishedCoreCount: publishedCoreCount,
      unlockedBy: 'pre-v3-backfill',
    };
  }

  const postMegaUnlockedEver = postMegaRecord != null;
  const postMegaDashboardAvailable = allWordsMegaNow || postMegaUnlockedEver;
  const unlockedPublishedCoreCount = postMegaRecord
    ? Number(postMegaRecord.unlockedPublishedCoreCount) || 0
    : 0;
  const newCoreWordsSinceGraduation = postMegaUnlockedEver
    ? Math.max(0, publishedCoreCount - unlockedPublishedCoreCount)
    : 0;

  // Recommended words — a deterministic preview for UI consumers. We only
  // produce this when the learner is currently Mega or post-graduation;
  // otherwise the preview would be meaningless (no Guardian surface to
  // consume it yet). A constant seeded random (() => 0.5) keeps the output
  // deterministic across renders and test runs.
  const recommendedWords = postMegaDashboardAvailable
    ? selectGuardianWords({
        guardianMap,
        progressMap,
        wordBySlug: runtime.bySlug,
        todayDay: currentDay,
        length: POST_MASTERY_PREVIEW_LENGTH,
        random: () => 0.5,
      })
    : [];

  // U1 (P2): post-mastery diagnostic panel support. These aggregates are
  // additive — every existing caller keeps its existing fields, and the
  // new sibling lets the Admin hub surface *why* a learner's post-Mega
  // dashboard is (or isn't) unlocked. PII-minimised: only slug strings
  // (curriculum-public) and integer counts. No learner name, email, or
  // adult account data flows through this object.
  //
  // Field definitions:
  //  - `source`: where the snapshot came from — 'service' (direct selector
  //     call), 'worker' (Worker engine response), 'locked-fallback' (the
  //     shared locked-state factory). Threaded in via `sourceHint`.
  //  - `publishedCoreCount` / `secureCoreCount` / `blockingCoreCount`: the
  //     raw integers behind the `allWordsMega` gate. `blockingCoreCount`
  //     is `publishedCoreCount - secureCoreCount` clamped at zero.
  //  - `blockingCoreSlugsPreview`: first N=10 core slugs (alphabetical)
  //     whose `progress[slug]?.stage !== 4` — i.e. what's preventing
  //     graduation. Filtered through `BLOCKING_CORE_SLUG_PATTERN` and
  //     `BLOCKING_CORE_SLUG_MAX_LENGTH` (shape + length scrub only —
  //     release-level publication is enforced by the publisher; per-word
  //     `published` is not a production contract) so misshapen slugs
  //     never surface in admin screenshots.
  //  - `extraWordsIgnoredCount`: count of progress entries whose word is
  //     in the extra pool. `allWordsMega` excludes the extra pool from
  //     either side of its comparison, so this value confirms the
  //     exclusion count for debugging an unexpected allWordsMega value.
  //  - `guardianMapCount`: size of the persisted guardian map (post
  //     normalisation). Useful when a learner has orphan entries that
  //     do not affect counts.
  //  - `contentReleaseId`: placeholder for U2 (which introduces
  //     `SPELLING_CONTENT_RELEASE_ID`). Null pre-U2 merge; shape in place
  //     so U2 populates without schema churn.
  //  - `allWordsMega`: mirror of the gate, so the admin panel does not
  //     need to correlate with the legacy top-level field.
  //  - `stickyUnlocked`: reads `data.postMega != null` on the persisted
  //     subject-state record. False pre-U2 merge; U2 sets it.
  const blockingCoreSlugsPreview = (() => {
    const stageBySlug = Object.create(null);
    for (const [slug, entry] of Object.entries(progressMap)) {
      stageBySlug[slug] = normaliseProgressRecord(entry).stage;
    }
    const blocking = [];
    for (const word of runtime.words) {
      if (!word || typeof word !== 'object') continue;
      const pool = word.spellingPool === 'extra' ? 'extra' : 'core';
      if (pool !== 'core') continue;
      // Release-level publication state is enforced by the publisher; per-
      // word publication is not a production contract — the shape + length
      // scrub below is the only line of defence in this selector.
      const slug = typeof word.slug === 'string' ? word.slug : '';
      if (!slug || slug.length > BLOCKING_CORE_SLUG_MAX_LENGTH || !BLOCKING_CORE_SLUG_PATTERN.test(slug)) continue;
      const stage = stageBySlug[slug];
      if (Number.isFinite(stage) && stage >= SECURE_STAGE) continue;
      blocking.push(slug);
    }
    blocking.sort((a, b) => a.localeCompare(b));
    return blocking.slice(0, BLOCKING_CORE_SLUGS_PREVIEW_LIMIT);
  })();

  const blockingCoreCount = Math.max(0, publishedCoreCount - secureCoreCount);

  let extraWordsIgnoredCount = 0;
  for (const [slug] of Object.entries(progressMap)) {
    const word = runtime.bySlug[slug] || DEFAULT_WORD_BY_SLUG[slug];
    const pool = word ? (word.spellingPool === 'extra' ? 'extra' : 'core') : 'core';
    if (pool === 'extra') extraWordsIgnoredCount += 1;
  }

  const guardianMapCount = Object.keys(guardianMap).length;
  const stickyUnlocked = isPlainObject(stateRecord?.data?.postMega);

  const resolvedSource = sourceHint === 'worker' || sourceHint === 'locked-fallback'
    ? sourceHint
    : 'service';

  const postMasteryDebug = {
    source: resolvedSource,
    publishedCoreCount,
    secureCoreCount,
    blockingCoreCount,
    blockingCoreSlugsPreview,
    extraWordsIgnoredCount,
    guardianMapCount,
    contentReleaseId: null,
    allWordsMega,
    stickyUnlocked,
  };

  return {
    // P2 U2: `allWordsMega` is kept as an ALIAS of `allWordsMegaNow` for
    // one release. Legacy consumers (Alt+4 gate in remote-actions.js,
    // module.js) still read this field; new consumers should gate on
    // `postMegaDashboardAvailable` instead.
    allWordsMega: allWordsMegaNow,
    allWordsMegaNow,
    postMegaUnlockedEver,
    postMegaDashboardAvailable,
    newCoreWordsSinceGraduation,
    publishedCoreCount,
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
    // PR #277 HIGH (correctness) fix — the SpellingSetupScene's
    // GraduationStatRibbon (line ~114) reads `postMastery.todayDay` to
    // compute `nextDueDelta`, and SpellingWordBankScene (lines 206-211,
    // 391-396) reads `postMastery.guardianMap` + `postMastery.todayDay`
    // to drive Guardian chip filtering and the word-bank stats. Prior to
    // this fix the Worker-emitted postMastery block omitted these two
    // fields, so after U4 hydration the Setup scene displayed
    // "Next check in 20562 days" (today fell back to 0 so
    // nextDueDelta === nextGuardianDueDay) and the Word Bank's Guardian
    // filters produced an empty mapping. Both values are already in scope
    // above (computed at lines ~167 and ~173) so this is a pure return-
    // shape fix — no derivation change, no contract drift.
    todayDay: currentDay,
    guardianMap,
    postMasteryDebug,
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
    // U11: Pattern Quest resumes back into its own mode. Without this branch
    // `recommendedMode` collapsed to 'smart', so Resume dispatched the
    // legacy Smart Review start-session and the Pattern Quest session was
    // abandoned silently.
    const recommendedMode = kind === 'boss'
      ? 'boss'
      : kind === 'guardian'
      ? 'guardian'
      : kind === 'pattern-quest'
      ? 'pattern-quest'
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
    // P2 U2: gate on the dashboard-availability flag (sticky OR live) rather
    // than `allWordsMega` alone. A learner who graduated before a content
    // release and has guardian work due should still land on Guardian as
    // the recommended mode even if `allWordsMegaNow` is false because a
    // handful of new core words were published since they graduated.
    recommendedMode: postMasteryState.postMegaDashboardAvailable && postMasteryState.guardianDueCount > 0
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
