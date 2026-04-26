export const SPELLING_SERVICE_STATE_VERSION = 2;

export const SPELLING_ROOT_PHASES = Object.freeze(['dashboard', 'session', 'summary', 'word-bank']);
export const SPELLING_MODES = Object.freeze(['smart', 'trouble', 'test', 'single', 'guardian', 'boss']);

export const GUARDIAN_INTERVALS = Object.freeze([3, 7, 14, 30, 60, 90]);
export const GUARDIAN_MAX_REVIEW_LEVEL = GUARDIAN_INTERVALS.length - 1;
export const GUARDIAN_MIN_ROUND_LENGTH = 5;
export const GUARDIAN_MAX_ROUND_LENGTH = 8;
export const GUARDIAN_DEFAULT_ROUND_LENGTH = 8;

// Boss Dictation round bounds (U9). A Boss round draws a uniform random sample
// from the learner's Mega core-pool slugs and rides as a `type: 'test'`-shaped
// session (no retry, no cloze, no skip) with a dedicated `submitBossAnswer`
// path that NEVER demotes `progress.stage` / `dueDay` / `lastDay` / `lastResult`.
// See docs/plans/2026-04-25-005-feat-post-mega-spelling-guardian-hardening-plan.md (U9).
export const BOSS_MIN_ROUND_LENGTH = 8;
export const BOSS_MAX_ROUND_LENGTH = 12;
export const BOSS_DEFAULT_ROUND_LENGTH = 10;

/**
 * Canonical set of dashboard/selector-facing Guardian mission states. Order
 * matches the state-machine priority as enforced in `computeGuardianMissionState`:
 * 'locked' (not post-Mega) > 'first-patrol' (fresh graduate, empty map) >
 * 'wobbling' (urgent recovery dominates due) > 'due' (normal daily patrol) >
 * 'optional-patrol' (nothing due but a round can be produced) > 'rested'
 * (terminal — Begin disabled).
 *
 * The 'rested' terminal state disables the Begin button; every other state
 * opens it. Consumers should derive the `guardianMissionAvailable` boolean
 * from this set via `!== 'locked' && !== 'rested'` rather than re-enumerating
 * enabled states.
 *
 * `computeGuardianMissionState` uses this frozen list at runtime as a
 * sanity check: the returned state must be a member of this set, otherwise
 * a typo in the state-machine implementation is caught immediately rather
 * than leaking an unknown label into UI copy.
 */
export const GUARDIAN_MISSION_STATES = Object.freeze([
  'locked',
  'first-patrol',
  'wobbling',
  'due',
  'optional-patrol',
  'rested',
]);
/**
 * Single-source factory for the "locked" post-mastery snapshot. Three fallbacks
 * used to be duplicated in-line:
 *   1. `client-read-models.js::getPostMasteryState` (remote-sync stub before
 *      the first command round-trip hydrates `subjectUi.spelling.postMastery`).
 *   2. `spelling-view-model.js::buildSpellingViewModel` (session-phase shortcut
 *      when `getPostMasteryState` is not worth calling).
 *   3. `computeGuardianMissionState(...) === 'locked'` (the state-machine
 *      return value).
 *
 * Any future field we add to the post-mastery shape must be defaulted in one
 * place, or the remote-sync dashboard risks reading `undefined` for a
 * gating scalar. Callers that want to override a field (e.g. populate
 * `todayDay` from the live clock) can spread the factory output:
 *
 *   { ...createLockedPostMasteryState(), todayDay: currentDay }
 *
 * The factory returns a fresh object every call so callers can mutate the
 * result without aliasing hazards.
 */
export function createLockedPostMasteryState() {
  return {
    allWordsMega: false,
    guardianDueCount: 0,
    wobblingCount: 0,
    wobblingDueCount: 0,
    nonWobblingDueCount: 0,
    unguardedMegaCount: 0,
    guardianAvailableCount: 0,
    guardianMissionState: 'locked',
    guardianMissionAvailable: false,
    nextGuardianDueDay: null,
    todayDay: 0,
    guardianMap: {},
    recommendedWords: [],
  };
}

// Canonical secure-stage threshold shared by the service layer, the
// post-mastery read-model, and the Word Bank view-model. Prior to U2 this
// constant was duplicated as `GUARDIAN_SECURE_STAGE` in shared/spelling/service.js
// and `SECURE_STAGE` in src/subjects/spelling/read-model.js — consolidating
// here is a single source of truth so `isGuardianEligibleSlug` (below) and
// the read-model post-mastery counts cannot drift apart.
export const GUARDIAN_SECURE_STAGE = 4;

/**
 * Orphan sanitiser predicate (U2). A slug is a valid Guardian candidate iff:
 *   1. The current content bundle publishes it (wordBySlug has a record).
 *   2. The learner's progress stage meets `GUARDIAN_SECURE_STAGE` (Mega).
 *   3. The published record is in the `core` pool (extra-pool words never
 *      graduate — `allWordsMega` is a core-pool concept).
 *
 * The check is read-side only: orphan records stay in persisted storage so a
 * content rollback that re-introduces the slug finds its record intact.
 * The three filters above collapse an orphan entry out of the selector,
 * the post-mastery counts, and the Word Bank Guardian chips — keeping
 * selector, read-model, and view-model aligned on a single rule.
 *
 * Lives in `service-contract.js` (not `shared/spelling/service.js`) so the
 * Word Bank view-model can import the predicate without dragging the full
 * spelling service module (and its statutory-word-data imports) into the
 * client bundle. See `scripts/audit-client-bundle.mjs` for the bundle-shape
 * contract this boundary protects.
 *
 * Tolerant of null/garbage inputs: returns false rather than throwing so
 * a partially-corrupt persisted blob cannot crash the read path.
 *
 * @param {string} slug           Candidate slug.
 * @param {object|null} progressMap  slug -> legacy progress record.
 * @param {object|null} wordBySlug   slug -> word metadata.
 * @returns {boolean}
 */
export function isGuardianEligibleSlug(slug, progressMap, wordBySlug) {
  if (!slug || typeof slug !== 'string') return false;
  if (!wordBySlug || typeof wordBySlug !== 'object') return false;
  const word = wordBySlug[slug];
  if (!word || typeof word !== 'object') return false;
  if (word.spellingPool === 'extra') return false;
  if (!progressMap || typeof progressMap !== 'object') return false;
  const record = progressMap[slug];
  const stage = Number(record?.stage);
  if (!Number.isFinite(stage) || stage < GUARDIAN_SECURE_STAGE) return false;
  return true;
}

/**
 * Shared mode predicates (U6). Post-Mega modes are the subset of
 * `SPELLING_MODES` that require `postMastery.allWordsMega === true` before
 * a session may start. They also share Mega-safety semantics downstream:
 * no wrong answer may demote `progress.stage` / `dueDay` / `lastDay` /
 * `lastResult`, and the session runs single-attempt (no retry, no cloze,
 * no skip) with dedicated submit paths (`submitGuardianAnswer` /
 * `submitBossAnswer`).
 *
 * Before U6 the literal `mode === 'guardian' || mode === 'boss'` was
 * duplicated across `module.js::spelling-shortcut-start` and
 * `remote-actions.js::spelling-shortcut-start`. Duplicating the gate is a
 * hazard for future post-Mega modes (Pattern Quest lands in U11,
 * Word Detective later): a new mode would need to be added in both
 * dispatchers AND any other gating call-site, and a missed site would
 * silently regress the Mega-safety contract.
 *
 * Contract: **add a new post-Mega mode here and it applies everywhere**.
 * When U11 extends Pattern Quest, `isPostMasteryMode` gains
 * `|| mode === 'pattern-quest'` at the single predicate below; the 2
 * existing literal call-sites (and any future ones) automatically pick
 * up the new mode without edits elsewhere.
 *
 * Three helpers, three shapes:
 *   - `isPostMasteryMode(mode)` — "this mode requires graduation"
 *     (shortcut-start gate, dashboard visibility).
 *   - `isMegaSafeMode(mode, options)` — "this mode cannot demote
 *     `progress.stage`". Includes the Trouble Drill practice-only branch
 *     (U3) where a trouble round with `practiceOnly: true` is Mega-safe.
 *   - `isSingleAttemptMegaSafeMode(mode)` — "this mode runs single-attempt
 *     no-retry". Same shape as `isPostMasteryMode` today; kept separate
 *     because future post-Mega modes (e.g. Pattern Quest choose-card
 *     multi-step) may expand `isPostMasteryMode` without being
 *     single-attempt.
 *
 * Pre-U11 note: `isPostMasteryMode('pattern-quest')` returns `false` so
 * no dispatcher accidentally routes a mode the service layer does not
 * yet understand. U11 flips it to `true` at the same time `SPELLING_MODES`
 * learns the string.
 *
 * @param {string} mode   A spelling `session.mode` value.
 * @returns {boolean}     `true` iff this is a post-Mega graduated mode.
 */
export function isPostMasteryMode(mode) {
  return mode === 'guardian' || mode === 'boss';
}

/**
 * "Mega-safe" means a wrong answer during this mode MUST NOT demote
 * `progress.stage` / `dueDay` / `lastDay` / `lastResult`. The set covers
 * the post-Mega modes (Guardian / Boss) plus the Trouble Drill
 * practice-only branch added in U3 — a practice-only trouble round is a
 * deliberate "practice without punishment" surface so a learner who
 * drills a mistake list cannot accidentally demote a Mega slug that
 * happened to land in trouble via FSRS scheduling.
 *
 * `options.practiceOnly` is strict boolean — any non-true value (falsy
 * coercion, missing key, numeric 1) is rejected so a stray `practiceOnly: 1`
 * from an optimistic-patch round-trip cannot accidentally unlock
 * Mega-safety for a regular trouble round.
 *
 * @param {string} mode                  A spelling `session.mode` value.
 * @param {object} [options]             Optional flags from the session.
 * @param {boolean} [options.practiceOnly]  True iff the trouble round is
 *   a practice-only surface (never demote).
 * @returns {boolean}                    `true` iff this mode cannot demote.
 */
export function isMegaSafeMode(mode, options = {}) {
  if (isPostMasteryMode(mode)) return true;
  if (mode !== 'trouble') return false;
  if (!options || typeof options !== 'object') return false;
  return options.practiceOnly === true;
}

/**
 * "Single-attempt Mega-safe" means this mode runs one submit per card with
 * no retry phase and no cloze hint — the entire round is assessed on the
 * first typed answer. Shares the same set as `isPostMasteryMode` today
 * but kept as a separate predicate because future post-Mega modes (e.g.
 * Pattern Quest's multi-step choose-card flow) may extend
 * `isPostMasteryMode` without extending this one.
 *
 * @param {string} mode   A spelling `session.mode` value.
 * @returns {boolean}     `true` iff this mode is single-attempt no-retry.
 */
export function isSingleAttemptMegaSafeMode(mode) {
  return mode === 'guardian' || mode === 'boss';
}
export const SPELLING_YEAR_FILTERS = Object.freeze(['core', 'y3-4', 'y5-6', 'extra']);
export const LEGACY_SPELLING_YEAR_FILTER_ALIASES = Object.freeze({
  all: 'core',
});
export const SPELLING_SESSION_TYPES = Object.freeze(['learning', 'test']);
export const SPELLING_SESSION_PHASES = Object.freeze(['question', 'retry', 'correction']);
export const SPELLING_FEEDBACK_KINDS = Object.freeze(['success', 'error', 'info', 'warn']);

export function createInitialSpellingState() {
  return {
    version: SPELLING_SERVICE_STATE_VERSION,
    phase: 'dashboard',
    session: null,
    feedback: null,
    summary: null,
    error: '',
    awaitingAdvance: false,
  };
}

export function defaultLearningStatus(needed = 1) {
  return {
    attempts: 0,
    successes: 0,
    needed,
    hadWrong: false,
    wrongAnswers: [],
    done: false,
    applied: false,
  };
}

export function normaliseMode(value, fallback = 'smart') {
  return SPELLING_MODES.includes(value) ? value : fallback;
}

export function normaliseYearFilter(value, fallback = 'core') {
  const candidate = typeof value === 'string' ? value : '';
  const aliased = LEGACY_SPELLING_YEAR_FILTER_ALIASES[candidate] || candidate;
  const normalisedFallback = SPELLING_YEAR_FILTERS.includes(fallback)
    ? fallback
    : LEGACY_SPELLING_YEAR_FILTER_ALIASES[fallback] || 'core';
  return SPELLING_YEAR_FILTERS.includes(aliased) ? aliased : normalisedFallback;
}

export function normaliseRoundLength(value, mode = 'smart') {
  if (mode === 'test') return 20;
  if (value === 'all') return 'all';
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : '20';
}

export function normaliseBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  return fallback;
}

export function normaliseString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function normaliseOptionalString(value) {
  return typeof value === 'string' && value ? value : null;
}

export function normaliseNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normaliseTimestamp(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normaliseStringArray(value, filterFn = null) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => typeof entry === 'string' && entry)
    .filter((entry) => (typeof filterFn === 'function' ? filterFn(entry) : true));
}

/**
 * U8: Storage-failure warning surface.
 *
 * Allowed reason strings for `feedback.persistenceWarning`. Kept as a frozen
 * allow-list so a renamed or typo'd reason never reaches the UI. The only
 * reason today is `storage-save-failed`; new entries land here before the
 * service + UI accept them.
 *
 * `SPELLING_PERSISTENCE_WARNING_REASONS` is the frozen array (iteration /
 * contains). `SPELLING_PERSISTENCE_WARNING_REASON` is a frozen record of
 * named constants so every call site can refer to the reason symbolically
 * rather than duplicating the literal — review-fix for the sev-60
 * maintainability finding.
 */
export const SPELLING_PERSISTENCE_WARNING_REASONS = Object.freeze(['storage-save-failed']);
export const SPELLING_PERSISTENCE_WARNING_REASON = Object.freeze({
  STORAGE_SAVE_FAILED: 'storage-save-failed',
});

/**
 * U8 review fix: banner copy extracted so future wording tweaks live in one
 * place. The wording was updated from the original "Progress could not be
 * saved on this device. Export or free storage." to the more accurate
 * partial-write message below. On a Guardian submit where the progress
 * write succeeded but the guardian write failed (or vice versa), the
 * learner's answer WAS counted in-memory for this round, but the storage
 * state is partially stale — they may see the same word re-appear after a
 * reload. The copy acknowledges that accurately.
 */
export const SPELLING_PERSISTENCE_WARNING_COPY = Object.freeze({
  STORAGE_SAVE_FAILED: 'We could not save your progress on this device. Your answer counted for this round, but you may see this word again after a reload. Free up storage or export your progress.',
});

function normalisePersistenceWarning(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const reason = typeof raw.reason === 'string' ? raw.reason : '';
  if (!SPELLING_PERSISTENCE_WARNING_REASONS.includes(reason)) return null;
  return { reason };
}

export function normaliseFeedback(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const persistenceWarning = normalisePersistenceWarning(value.persistenceWarning);
  const feedback = {
    kind: SPELLING_FEEDBACK_KINDS.includes(value.kind) ? value.kind : 'info',
    headline: normaliseString(value.headline),
    answer: normaliseString(value.answer),
    attemptedAnswer: normaliseString(value.attemptedAnswer).trim().slice(0, 80),
    body: normaliseString(value.body),
    footer: normaliseString(value.footer),
    familyWords: normaliseStringArray(value.familyWords),
  };

  if (
    !feedback.headline
    && !feedback.answer
    && !feedback.attemptedAnswer
    && !feedback.body
    && !feedback.footer
    && !feedback.familyWords.length
    && !persistenceWarning
  ) {
    return null;
  }

  // U8: attach persistenceWarning only when present so the happy-path feedback
  // shape stays byte-identical for downstream consumers that JSON-serialise or
  // structural-compare the feedback object.
  if (persistenceWarning) feedback.persistenceWarning = persistenceWarning;

  return feedback;
}

export function normaliseSummaryCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
  const label = normaliseString(card.label);
  const sub = normaliseString(card.sub);
  const value = typeof card.value === 'number' || typeof card.value === 'string'
    ? card.value
    : '';
  if (!label && value === '' && !sub) return null;
  return { label, value, sub };
}

/* Derive the round-level totals the UI needs for the summary scene from the
   engine's card list. The legacy engine emits different card shapes for the
   learning and test flows — learning cards expose the total on the first
   card ("Words in round" / "Practice words") while test cards encode it as
   "correct/total" on the "Score" card. Keeping the derivation here means
   every UI that reads a summary gets the same normalised shape without the
   legacy engine changing. */
function deriveSummaryTotals(mode, cards, mistakes) {
  const firstValue = cards.length ? cards[0].value : '';
  let totalWords = 0;
  let correct = 0;

  // Boss (U10) and SATs Test share the same testSummary card shape
  // (`Score: 7/10`, `Accuracy: 70%`, `Correct: 7`, `Needs more work: 3`). The
  // score-card "N/M" parse therefore applies to both; without adding 'boss'
  // here the else-branch would fall back to `firstValue = '7/10'` →
  // Number.parseInt → 7, which would lead to `totalWords = 7` and
  // `correct = 7 - mistakes.length = 4`. That would surface as a Boss summary
  // claiming only 7 words landed when 10 were played.
  if (mode === 'test' || mode === 'boss') {
    const scoreCard = cards.find((card) => card.label === 'Score');
    if (scoreCard && typeof scoreCard.value === 'string') {
      const match = /^(\d+)\s*\/\s*(\d+)$/.exec(scoreCard.value);
      if (match) {
        correct = Number(match[1]);
        totalWords = Number(match[2]);
      }
    }
    if (!totalWords) {
      const correctCard = cards.find((card) => card.label === 'Correct');
      if (correctCard && typeof correctCard.value === 'number') {
        correct = correctCard.value;
      }
      totalWords = correct + mistakes.length;
    }
  } else {
    if (typeof firstValue === 'number') {
      totalWords = firstValue;
    } else {
      const parsed = Number.parseInt(String(firstValue ?? ''), 10);
      totalWords = Number.isFinite(parsed) ? parsed : 0;
    }
    correct = Math.max(0, totalWords - mistakes.length);
  }

  totalWords = Math.max(0, totalWords);
  correct = Math.max(0, Math.min(totalWords, correct));
  const accuracy = totalWords > 0 ? Math.round((correct / totalWords) * 100) : null;
  return { totalWords, correct, accuracy };
}

export function normaliseSummary(value, isKnownSlug) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const cards = Array.isArray(value.cards)
    ? value.cards.map(normaliseSummaryCard).filter(Boolean)
    : [];
  const mistakes = Array.isArray(value.mistakes)
    ? value.mistakes
        .map((word) => {
          if (!word || typeof word !== 'object' || Array.isArray(word)) return null;
          if (!isKnownSlug(word.slug)) return null;
          return {
            slug: word.slug,
            word: normaliseString(word.word),
            family: normaliseString(word.family),
            year: normaliseString(word.year),
            yearLabel: normaliseString(word.yearLabel),
            familyWords: normaliseStringArray(word.familyWords),
          };
        })
        .filter(Boolean)
    : [];
  const mode = normaliseMode(value.mode, 'smart');
  const derived = deriveSummaryTotals(mode, cards, mistakes);
  const providedTotal = Number(value.totalWords);
  const providedCorrect = Number(value.correct);
  const providedAccuracy = value.accuracy;
  const totalWords = Number.isInteger(providedTotal) && providedTotal >= 0
    ? providedTotal
    : derived.totalWords;
  const correct = Number.isInteger(providedCorrect) && providedCorrect >= 0
    ? Math.min(totalWords, providedCorrect)
    : derived.correct;
  const accuracy = typeof providedAccuracy === 'number' && Number.isFinite(providedAccuracy)
    ? providedAccuracy
    : derived.accuracy;
  return {
    mode,
    label: normaliseString(value.label, 'Spelling round'),
    message: normaliseString(value.message, 'Round complete.'),
    cards,
    mistakes,
    elapsedMs: normaliseNonNegativeInteger(value.elapsedMs, 0),
    totalWords,
    correct,
    accuracy,
  };
}

export function normaliseStats(value) {
  const stats = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    total: normaliseNonNegativeInteger(stats.total, 0),
    secure: normaliseNonNegativeInteger(stats.secure, 0),
    due: normaliseNonNegativeInteger(stats.due, 0),
    fresh: normaliseNonNegativeInteger(stats.fresh, 0),
    trouble: normaliseNonNegativeInteger(stats.trouble, 0),
    attempts: normaliseNonNegativeInteger(stats.attempts, 0),
    correct: normaliseNonNegativeInteger(stats.correct, 0),
    accuracy: typeof stats.accuracy === 'number' || stats.accuracy === null
      ? stats.accuracy
      : null,
  };
}

export function cloneSerialisable(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function clampReviewLevel(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return 0;
  if (parsed > GUARDIAN_MAX_REVIEW_LEVEL) return GUARDIAN_MAX_REVIEW_LEVEL;
  return Math.floor(parsed);
}

function normaliseNullableDay(value) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function normaliseDay(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

/**
 * Normalise a per-word guardian record to the canonical shape. Garbage
 * or missing input yields a safe default record. The default `nextDueDay`
 * must be supplied by the caller (usually `todayDay()`), because this
 * module must stay pure — it cannot call `Date.now()` directly without
 * breaking deterministic tests in shared/spelling/service.js.
 */
export function normaliseGuardianRecord(rawValue, todayDay = 0) {
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
  const safeToday = Number.isFinite(Number(todayDay)) && Number(todayDay) >= 0 ? Math.floor(Number(todayDay)) : 0;
  return {
    reviewLevel: clampReviewLevel(raw.reviewLevel),
    lastReviewedDay: normaliseNullableDay(raw.lastReviewedDay),
    nextDueDay: normaliseDay(raw.nextDueDay, safeToday),
    correctStreak: normaliseNonNegativeInteger(raw.correctStreak, 0),
    lapses: normaliseNonNegativeInteger(raw.lapses, 0),
    renewals: normaliseNonNegativeInteger(raw.renewals, 0),
    wobbling: normaliseBoolean(raw.wobbling, false),
  };
}

/**
 * Normalise a slug -> guardian record map. Drops entries with empty/invalid
 * slugs or with values that cannot be objects. Preserves valid slugs, with
 * each record individually normalised.
 */
export function normaliseGuardianMap(rawValue, todayDay = 0) {
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
  const output = {};
  for (const [slug, entry] of Object.entries(raw)) {
    if (!slug || typeof slug !== 'string') continue;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    output[slug] = normaliseGuardianRecord(entry, todayDay);
  }
  return output;
}
