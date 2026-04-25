import { WORDS as DEFAULT_WORDS, WORD_BY_SLUG as DEFAULT_WORD_BY_SLUG } from '../../src/subjects/spelling/data/word-data.js';
import { createLegacySpellingEngine } from './legacy-engine.js';
import {
  SPELLING_MASTERY_MILESTONES,
  createSpellingGuardianMissionCompletedEvent,
  createSpellingGuardianRecoveredEvent,
  createSpellingGuardianRenewedEvent,
  createSpellingGuardianWobbledEvent,
  createSpellingMasteryMilestoneEvent,
  createSpellingRetryClearedEvent,
  createSpellingSessionCompletedEvent,
  createSpellingWordSecuredEvent,
} from '../../src/subjects/spelling/events.js';
import {
  normaliseBufferedGeminiVoice,
  normaliseTtsProvider,
} from '../../src/subjects/spelling/tts-providers.js';
import {
  GUARDIAN_DEFAULT_ROUND_LENGTH,
  GUARDIAN_INTERVALS,
  GUARDIAN_MAX_REVIEW_LEVEL,
  GUARDIAN_MAX_ROUND_LENGTH,
  GUARDIAN_MIN_ROUND_LENGTH,
  cloneSerialisable,
  createInitialSpellingState,
  defaultLearningStatus,
  normaliseBoolean,
  normaliseFeedback,
  normaliseGuardianMap,
  normaliseGuardianRecord,
  normaliseMode,
  normaliseNonNegativeInteger,
  normaliseOptionalString,
  normaliseRoundLength,
  normaliseStats,
  normaliseString,
  normaliseStringArray,
  normaliseSummary,
  normaliseTimestamp,
  normaliseYearFilter,
  SPELLING_ROOT_PHASES,
  SPELLING_SERVICE_STATE_VERSION,
  SPELLING_SESSION_PHASES,
  SPELLING_SESSION_TYPES,
} from '../../src/subjects/spelling/service-contract.js';

const PREF_KEY = 'ks2-platform-v2.spelling-prefs';
const GUARDIAN_PROGRESS_KEY_PREFIX = 'ks2-spell-guardian-';
const PROGRESS_KEY_PREFIX = 'ks2-spell-progress-';
const GUARDIAN_SECURE_STAGE = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

function createNoopStorage() {
  return {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {},
  };
}

function prefsKey(learnerId) {
  return `${PREF_KEY}.${learnerId || 'default'}`;
}

function guardianMapKey(learnerId) {
  return `${GUARDIAN_PROGRESS_KEY_PREFIX}${learnerId || 'default'}`;
}

function progressMapKey(learnerId) {
  return `${PROGRESS_KEY_PREFIX}${learnerId || 'default'}`;
}

function intervalForLevel(level) {
  const index = Math.max(0, Math.min(GUARDIAN_MAX_REVIEW_LEVEL, Math.floor(Number(level) || 0)));
  return GUARDIAN_INTERVALS[index];
}

/**
 * Pure scheduler helpers — advance* functions never mutate their input record,
 * they return a new record. Day arithmetic is integer-only (Math.floor(ts/DAY_MS))
 * per the plan; no ISO strings anywhere in the guardian path.
 */

export function advanceGuardianOnCorrect(record, todayDay) {
  const safeToday = Number.isFinite(Number(todayDay)) ? Math.floor(Number(todayDay)) : 0;
  const source = normaliseGuardianRecord(record, safeToday);

  if (source.wobbling) {
    // Recovery path — clear wobbling, bump renewals, preserve reviewLevel.
    // Schedule resumes using the existing reviewLevel (does NOT advance).
    // The interval is indexed by the current (preserved) reviewLevel so the
    // learner picks up their spaced-practice ladder rather than starting over.
    return {
      ...source,
      wobbling: false,
      renewals: source.renewals + 1,
      correctStreak: source.correctStreak + 1,
      lastReviewedDay: safeToday,
      nextDueDay: safeToday + intervalForLevel(source.reviewLevel),
    };
  }

  // Non-wobbling success — bump reviewLevel (capped) and correctStreak. Interval
  // is indexed by the CURRENT (pre-advance) reviewLevel so the first success at
  // level 0 schedules +3 days; at cap (level 5) it stays +90.
  const nextLevel = Math.min(GUARDIAN_MAX_REVIEW_LEVEL, source.reviewLevel + 1);
  return {
    ...source,
    reviewLevel: nextLevel,
    correctStreak: source.correctStreak + 1,
    lastReviewedDay: safeToday,
    nextDueDay: safeToday + intervalForLevel(source.reviewLevel),
  };
}

export function advanceGuardianOnWrong(record, todayDay) {
  const safeToday = Number.isFinite(Number(todayDay)) ? Math.floor(Number(todayDay)) : 0;
  const source = normaliseGuardianRecord(record, safeToday);
  return {
    ...source,
    wobbling: true,
    lapses: source.lapses + 1,
    correctStreak: 0,
    lastReviewedDay: safeToday,
    nextDueDay: safeToday + 1,
  };
}

export function ensureGuardianRecord(guardianMap, slug, todayDay) {
  if (!slug || typeof slug !== 'string') return null;
  const map = guardianMap && typeof guardianMap === 'object' && !Array.isArray(guardianMap) ? guardianMap : {};
  if (Object.prototype.hasOwnProperty.call(map, slug) && map[slug]) {
    return map[slug];
  }
  const safeToday = Number.isFinite(Number(todayDay)) ? Math.floor(Number(todayDay)) : 0;
  const fresh = normaliseGuardianRecord({}, safeToday);
  map[slug] = fresh;
  return fresh;
}

function clampSelectionLength(length) {
  const parsed = Number(length);
  const base = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : GUARDIAN_DEFAULT_ROUND_LENGTH;
  if (base < GUARDIAN_MIN_ROUND_LENGTH) return GUARDIAN_MIN_ROUND_LENGTH;
  if (base > GUARDIAN_MAX_ROUND_LENGTH) return GUARDIAN_MAX_ROUND_LENGTH;
  return base;
}

function compareByDueDayThenSlug(a, b) {
  if (a.nextDueDay !== b.nextDueDay) return a.nextDueDay - b.nextDueDay;
  if (a.slug < b.slug) return -1;
  if (a.slug > b.slug) return 1;
  return 0;
}

function compareByLastReviewedThenSlug(a, b) {
  const aLast = a.lastReviewedDay != null ? a.lastReviewedDay : -1;
  const bLast = b.lastReviewedDay != null ? b.lastReviewedDay : -1;
  if (aLast !== bLast) return aLast - bLast;
  if (a.slug < b.slug) return -1;
  if (a.slug > b.slug) return 1;
  return 0;
}

function deterministicShuffle(items, random) {
  const output = items.slice();
  const rng = typeof random === 'function' ? random : Math.random;
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = output[i];
    output[i] = output[j];
    output[j] = tmp;
  }
  return output;
}

/**
 * Pure selection function. Picks 5-8 slugs (clamped by length input) from the
 * learner's guardian map + progress map, prioritising wobbling-due → due →
 * lazy-create sample → top-up of non-due guardians.
 *
 * @param {object} params
 * @param {object} params.guardianMap  slug -> normalised guardian record
 * @param {object} params.progressMap  slug -> legacy progress record
 * @param {object} params.wordBySlug   slug -> word metadata (spellingPool, etc.)
 * @param {number} params.todayDay     integer day (Math.floor(ts/DAY_MS))
 * @param {number} params.length       desired round length (clamped 5..8)
 * @param {Function} params.random     injected random; used for lazy-create shuffle
 * @returns {string[]} selected slugs (array of strings)
 */
export function selectGuardianWords({
  guardianMap = {},
  progressMap = {},
  wordBySlug = {},
  todayDay = 0,
  length = GUARDIAN_DEFAULT_ROUND_LENGTH,
  random = Math.random,
} = {}) {
  const target = clampSelectionLength(length);
  const safeToday = Number.isFinite(Number(todayDay)) ? Math.floor(Number(todayDay)) : 0;
  const guardianEntries = Object.entries(guardianMap || {}).map(([slug, record]) => ({
    slug,
    ...record,
  }));

  const wobblingDue = guardianEntries
    .filter((entry) => entry.wobbling === true && entry.nextDueDay <= safeToday)
    .sort(compareByDueDayThenSlug);
  const nonWobblingDue = guardianEntries
    .filter((entry) => entry.wobbling !== true && entry.nextDueDay <= safeToday)
    .sort(compareByDueDayThenSlug);

  const selected = [];
  const selectedSet = new Set();

  function push(slug) {
    if (!slug || typeof slug !== 'string') return;
    if (selectedSet.has(slug)) return;
    if (selected.length >= target) return;
    selected.push(slug);
    selectedSet.add(slug);
  }

  wobblingDue.forEach((entry) => push(entry.slug));
  if (selected.length < target) nonWobblingDue.forEach((entry) => push(entry.slug));

  // Lazy-create candidates: mega words (stage >= 4) that are NOT yet in the
  // guardian map at all. Filter by known slugs in wordBySlug so we never return
  // a slug the caller can't resolve.
  if (selected.length < target) {
    const lazyCandidates = [];
    for (const [slug, progress] of Object.entries(progressMap || {})) {
      if (!slug || typeof slug !== 'string') continue;
      if (!wordBySlug || !wordBySlug[slug]) continue;
      if (Object.prototype.hasOwnProperty.call(guardianMap || {}, slug)) continue;
      const stage = Number(progress?.stage);
      if (!(Number.isFinite(stage) && stage >= GUARDIAN_SECURE_STAGE)) continue;
      lazyCandidates.push(slug);
    }
    // Alphabetical baseline makes the shuffle deterministic under a seeded rng.
    lazyCandidates.sort();
    const shuffled = deterministicShuffle(lazyCandidates, random);
    for (const slug of shuffled) {
      if (selected.length >= target) break;
      push(slug);
    }
  }

  // Top-up from non-due guardians (sorted by oldest lastReviewedDay first). Only
  // engages if we're still below the minimum round length — matches the plan
  // ("if still under min length (5), top up"). Wobbling non-due entries still
  // keep priority over non-wobbling non-due entries so a recent wobble stays
  // visible when scheduling placed it slightly in the future.
  if (selected.length < GUARDIAN_MIN_ROUND_LENGTH) {
    const nonDue = guardianEntries
      .filter((entry) => entry.nextDueDay > safeToday && !selectedSet.has(entry.slug));
    const wobblingNonDue = nonDue
      .filter((entry) => entry.wobbling === true)
      .sort(compareByLastReviewedThenSlug);
    const stableNonDue = nonDue
      .filter((entry) => entry.wobbling !== true)
      .sort(compareByLastReviewedThenSlug);
    for (const entry of [...wobblingNonDue, ...stableNonDue]) {
      if (selected.length >= target) break;
      push(entry.slug);
    }
  }

  return selected;
}

function loadJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // local persistence is best-effort in the reference rebuild.
  }
}

function buildCloze(sentence, word) {
  const blanks = '_'.repeat(Math.max(String(word || '').length, 5));
  const escaped = String(word || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
  return String(sentence || '').replace(pattern, blanks);
}

function acceptedForPrompt(rawAccepted, fallback) {
  const accepted = normaliseStringArray(rawAccepted);
  const fallbackText = normaliseString(fallback);
  if (fallbackText && !accepted.map((entry) => entry.toLowerCase()).includes(fallbackText.toLowerCase())) {
    return [fallbackText, ...accepted];
  }
  return accepted.length ? accepted : (fallbackText ? [fallbackText] : []);
}

function normaliseWordVariants(variants) {
  if (!Array.isArray(variants)) return [];
  return variants
    .map((variant) => {
      if (!variant || typeof variant !== 'object' || Array.isArray(variant)) return null;
      const word = normaliseString(variant.word);
      if (!word) return null;
      return {
        word,
        accepted: acceptedForPrompt(variant.accepted, word),
        sentence: normaliseString(variant.sentence),
        sentences: normaliseStringArray(variant.sentences),
        explanation: normaliseString(variant.explanation),
      };
    })
    .filter(Boolean);
}

function explanationForPrompt(baseWord, promptedWord, prompt = null) {
  const promptExplanation = normaliseString(prompt?.explanation);
  if (promptExplanation) return promptExplanation;
  const target = normaliseString(promptedWord, baseWord?.word).toLowerCase();
  const variants = normaliseWordVariants(baseWord?.variants);
  const variant = variants.find((entry) => entry.word.toLowerCase() === target);
  return variant?.explanation || baseWord?.explanation || '';
}

function wordForPrompt(baseWord, prompt = null) {
  if (!baseWord) return null;
  const promptedWord = normaliseString(prompt?.word, baseWord.word);
  const sentence = normaliseString(prompt?.sentence, baseWord.sentence || '');
  if (promptedWord === baseWord.word && !prompt?.accepted) return baseWord;
  return {
    ...baseWord,
    word: promptedWord,
    accepted: acceptedForPrompt(prompt?.accepted, promptedWord),
    sentence,
    sentences: sentence ? [sentence] : (Array.isArray(baseWord.sentences) ? [...baseWord.sentences] : []),
    explanation: explanationForPrompt(baseWord, promptedWord, prompt),
  };
}

function isKnownSlug(slug, wordBySlug = DEFAULT_WORD_BY_SLUG) {
  return typeof slug === 'string' && Boolean(wordBySlug[slug]);
}

function uniqueStrings(values) {
  return [...new Set(values)];
}

function clockFrom(now) {
  return () => {
    const value = typeof now === 'function' ? Number(now()) : Date.now();
    return Number.isFinite(value) ? value : Date.now();
  };
}

function defaultLabelForMode(mode) {
  if (mode === 'trouble') return 'Trouble drill';
  if (mode === 'single') return 'Single-word drill';
  if (mode === 'test') return 'SATs 20 test';
  if (mode === 'guardian') return 'Guardian Mission';
  return 'Smart review';
}

function normalisePrefs(rawPrefs = {}) {
  const mode = normaliseMode(rawPrefs.mode, 'smart');
  return {
    mode,
    yearFilter: normaliseYearFilter(rawPrefs.yearFilter, 'core'),
    roundLength: normaliseRoundLength(rawPrefs.roundLength, mode),
    showCloze: normaliseBoolean(rawPrefs.showCloze, true),
    autoSpeak: normaliseBoolean(rawPrefs.autoSpeak, true),
    extraWordFamilies: normaliseBoolean(rawPrefs.extraWordFamilies, false),
    ttsProvider: normaliseTtsProvider(rawPrefs.ttsProvider),
    bufferedGeminiVoice: normaliseBufferedGeminiVoice(rawPrefs.bufferedGeminiVoice),
  };
}

function normaliseLearningStatus(entry, defaultNeeded) {
  const base = entry && typeof entry === 'object' && !Array.isArray(entry)
    ? entry
    : {};
  return {
    attempts: normaliseNonNegativeInteger(base.attempts, 0),
    successes: normaliseNonNegativeInteger(base.successes, 0),
    needed: Math.max(1, normaliseNonNegativeInteger(base.needed, defaultNeeded)),
    hadWrong: normaliseBoolean(base.hadWrong, false),
    wrongAnswers: normaliseStringArray(base.wrongAnswers),
    done: normaliseBoolean(base.done, false),
    applied: normaliseBoolean(base.applied, false),
  };
}

function normaliseTestResults(results, selectedSlugs) {
  const allowed = new Set(selectedSlugs);
  const seen = new Set();
  const list = Array.isArray(results) ? results : [];
  const clean = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const slug = typeof entry.slug === 'string' ? entry.slug : '';
    if (!allowed.has(slug) || seen.has(slug)) continue;
    clean.push({
      slug,
      answer: normaliseString(entry.answer),
      correct: normaliseBoolean(entry.correct, false),
    });
    seen.add(slug);
  }

  return clean;
}

function buildProgressMeta(session) {
  const total = Array.isArray(session?.uniqueWords) ? session.uniqueWords.length : 0;
  if (session?.type === 'test') {
    const results = Array.isArray(session?.results) ? session.results : [];
    return {
      total,
      checked: results.length,
      done: results.length,
      wrongCount: results.filter((item) => !item.correct).length,
    };
  }
  const statusEntries = Object.values(session?.status || {});
  return {
    total,
    checked: statusEntries.filter((info) => info.attempts > 0).length,
    done: statusEntries.filter((info) => info.done).length,
    wrongCount: statusEntries.filter((info) => info.hadWrong).length,
  };
}

function buildPrompt(engine, session, slug, wordBySlug = DEFAULT_WORD_BY_SLUG) {
  if (!isKnownSlug(slug, wordBySlug)) return null;
  const word = wordBySlug[slug];
  const current = session?.currentPrompt;
  const sentence = current?.slug === slug && typeof current.sentence === 'string'
    ? current.sentence
    : engine.peekPromptSentence(session, slug) || word.sentence || '';
  const promptedWord = current?.slug === slug && typeof current.word === 'string' && current.word
    ? current.word
    : word.word;
  return {
    slug,
    word: promptedWord,
    accepted: acceptedForPrompt(current?.slug === slug && current.accepted ? current.accepted : word.accepted, promptedWord),
    explanation: current?.slug === slug
      ? explanationForPrompt(word, promptedWord, current)
      : explanationForPrompt(word, promptedWord),
    sentence,
    cloze: buildCloze(sentence, promptedWord),
  };
}

function normalisePromptForSlug(rawPrompt, slug, wordBySlug = DEFAULT_WORD_BY_SLUG) {
  if (!isKnownSlug(slug, wordBySlug)) return null;
  if (!rawPrompt || typeof rawPrompt !== 'object' || Array.isArray(rawPrompt)) return null;
  if (typeof rawPrompt.slug === 'string' && rawPrompt.slug !== slug) return null;
  if (typeof rawPrompt.sentence !== 'string') return null;

  const word = wordBySlug[slug];
  const promptedWord = normaliseString(rawPrompt.word, word.word);
  return {
    slug,
    word: promptedWord,
    accepted: acceptedForPrompt(rawPrompt.accepted || word.accepted, promptedWord),
    explanation: explanationForPrompt(word, promptedWord, rawPrompt),
    sentence: rawPrompt.sentence,
    cloze: buildCloze(rawPrompt.sentence, promptedWord),
  };
}

function savedPromptForSlug(rawSession, slug, wordBySlug = DEFAULT_WORD_BY_SLUG) {
  return normalisePromptForSlug(rawSession?.currentPrompt, slug, wordBySlug)
    || normalisePromptForSlug(rawSession?.currentCard?.prompt, slug, wordBySlug);
}

function decorateSession(engine, learnerId, session, wordBySlug = DEFAULT_WORD_BY_SLUG, progressStore = null) {
  if (!session) return null;
  const currentPrompt = session.currentSlug ? buildPrompt(engine, session, session.currentSlug, wordBySlug) : null;
  const currentCard = session.currentSlug && currentPrompt
    ? {
        slug: session.currentSlug,
        word: wordForPrompt(wordBySlug[session.currentSlug], currentPrompt),
        prompt: currentPrompt,
      }
    : null;
  const currentProgress = currentCard?.slug
    ? (progressStore && typeof engine.progressForSlug === 'function'
      ? engine.progressForSlug(progressStore, currentCard.slug)
      : engine.getProgress(learnerId, currentCard.slug))
    : null;

  return {
    ...session,
    version: SPELLING_SERVICE_STATE_VERSION,
    currentPrompt,
    currentCard,
    progress: buildProgressMeta(session),
    currentStage: currentProgress?.stage || 0,
  };
}

function buildTransition(state, { events = [], audio = null, changed = true, ok = true } = {}) {
  return {
    ok,
    state,
    events: Array.isArray(events) ? events.filter(Boolean) : [],
    audio,
    changed,
  };
}

function copyState(rawState) {
  return cloneSerialisable(rawState) || createInitialSpellingState();
}

function masteryMilestoneForCount(secureCount) {
  return SPELLING_MASTERY_MILESTONES.includes(secureCount) ? secureCount : null;
}

function sessionCompletedEvents({ learnerId, session, summary, createdAt }) {
  if (session?.practiceOnly) return [];
  return [createSpellingSessionCompletedEvent({ learnerId, session, summary, createdAt })];
}

export function defaultSpellingPrefs() {
  return normalisePrefs();
}

export function createSpellingService({ repository, storage, tts, now, random, contentSnapshot } = {}) {
  const clock = clockFrom(now);
  const persistence = repository || {
    storage: storage || globalThis.localStorage || createNoopStorage(),
    syncPracticeSession() {},
    abandonPracticeSession() {},
    resetLearner() {},
  };
  const resolvedStorage = persistence.storage || storage || globalThis.localStorage || createNoopStorage();
  const randomFn = typeof random === 'function' ? random : Math.random;
  const runtimeWords = Array.isArray(contentSnapshot?.words)
    ? cloneSerialisable(contentSnapshot.words)
    : cloneSerialisable(DEFAULT_WORDS);
  const runtimeWordBySlug = contentSnapshot?.wordBySlug && typeof contentSnapshot.wordBySlug === 'object' && !Array.isArray(contentSnapshot.wordBySlug)
    ? cloneSerialisable(contentSnapshot.wordBySlug)
    : Object.fromEntries(runtimeWords.map((word) => [word.slug, cloneSerialisable(word)]));
  const isRuntimeKnownSlug = (slug) => isKnownSlug(slug, runtimeWordBySlug);
  const engine = createLegacySpellingEngine({
    words: runtimeWords,
    wordMeta: runtimeWordBySlug,
    storage: resolvedStorage,
    tts,
    now: clock,
    random,
  });

  function getPrefs(learnerId) {
    return normalisePrefs(loadJson(resolvedStorage, prefsKey(learnerId), {}));
  }

  function savePrefs(learnerId, prefs) {
    const next = normalisePrefs({ ...getPrefs(learnerId), ...(prefs || {}) });
    saveJson(resolvedStorage, prefsKey(learnerId), next);
    return next;
  }

  function progressSnapshot(learnerId) {
    return typeof engine.progressFor === 'function' ? engine.progressFor(learnerId) : null;
  }

  function progressForWord(learnerId, word, progressStore = null) {
    if (progressStore && typeof engine.progressForSlug === 'function') {
      return engine.progressForSlug(progressStore, word.slug);
    }
    return engine.getProgress(learnerId, word.slug);
  }

  function getStats(learnerId, yearFilter = 'core', progressStore = null) {
    return normaliseStats(engine.lifetimeStats(learnerId, normaliseYearFilter(yearFilter, 'core'), progressStore || undefined));
  }

  function analyticsWordRow(learnerId, word, progressStore = null) {
    const progress = progressForWord(learnerId, word, progressStore);
    const statusProgressStore = progressStore || { [word.slug]: progress };
    return {
      slug: word.slug,
      word: word.word,
      family: word.family,
      year: word.year,
      yearLabel: word.yearLabel,
      spellingPool: word.spellingPool === 'extra' ? 'extra' : 'core',
      familyWords: Array.isArray(word.familyWords) ? [...word.familyWords] : [],
      sentence: word.sentence || '',
      explanation: word.explanation || '',
      accepted: Array.isArray(word.accepted) ? [...word.accepted] : [word.slug],
      variants: normaliseWordVariants(word.variants),
      status: engine.statusForWord(learnerId, word, statusProgressStore),
      stageLabel: engine.stageLabel(progress.stage),
      progress: {
        stage: progress.stage,
        attempts: progress.attempts,
        correct: progress.correct,
        wrong: progress.wrong,
        dueDay: progress.dueDay,
        lastDay: progress.lastDay,
        lastResult: progress.lastResult,
      },
    };
  }

  function analyticsWordGroups(learnerId, progressStore = null) {
    const groups = [
      { key: 'y3-4', title: 'Years 3-4', spellingPool: 'core', year: '3-4' },
      { key: 'y5-6', title: 'Years 5-6', spellingPool: 'core', year: '5-6' },
      { key: 'extra', title: 'Extra', spellingPool: 'extra', year: 'extra' },
    ];
    return groups.map((group) => ({
      key: group.key,
      title: group.title,
      spellingPool: group.spellingPool,
      year: group.year,
      words: runtimeWords
        .filter((word) => (word.spellingPool === 'extra' ? 'extra' : 'core') === group.spellingPool && word.year === group.year)
        .map((word) => analyticsWordRow(learnerId, word, progressStore)),
    }));
  }

  function getWordBankEntry(learnerId, slug) {
    if (!isRuntimeKnownSlug(slug)) return null;
    return analyticsWordRow(learnerId, runtimeWordBySlug[slug], progressSnapshot(learnerId));
  }

  function currentTodayDay() {
    return Math.floor(clock() / DAY_MS);
  }

  /**
   * Strict FIFO card advance for Guardian Mission rounds. The legacy
   * advanceCard uses weighted selection over the queue window, which
   * randomises the per-round word order in ways the Guardian selection
   * contract explicitly wants to own. We bypass that and just shift the
   * queue head, rebuilding the currentPrompt via the existing helper.
   */
  function advanceGuardianCard(session) {
    if (!session) return { done: true };
    while (Array.isArray(session.queue) && session.queue.length) {
      const nextSlug = session.queue.shift();
      if (!nextSlug || !runtimeWordBySlug[nextSlug]) continue;
      if (session.status?.[nextSlug]?.done) continue;
      session.currentSlug = nextSlug;
      session.currentPrompt = buildPrompt(engine, session, nextSlug, runtimeWordBySlug);
      session.lastFamily = runtimeWordBySlug[nextSlug]?.family || null;
      session.lastYear = runtimeWordBySlug[nextSlug]?.year || null;
      return { done: false, slug: nextSlug, prompt: session.currentPrompt };
    }
    session.currentSlug = null;
    session.currentPrompt = null;
    return { done: true };
  }

  // Guardian state persists through the same storage proxy as prefs and progress
  // via the ks2-spell-guardian-<learnerId> key. Both the client repository and
  // the Worker engine recognise this prefix and route it through data.guardian
  // in the subject-state record (normalised by U1's normaliseGuardianMap).
  function loadGuardianMap(learnerId) {
    const raw = loadJson(resolvedStorage, guardianMapKey(learnerId), {});
    return normaliseGuardianMap(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}, currentTodayDay());
  }

  function saveGuardianMap(learnerId, map) {
    saveJson(resolvedStorage, guardianMapKey(learnerId), map || {});
  }

  // U7 merge-save: per-slug guardian writer.
  //
  // Narrows the read-to-write window WITHIN A SINGLE SERVICE INSTANCE that
  // shares one `repositories` object. Instead of "load the whole map into
  // memory, mutate in-place, save the whole map" (which loses any write that
  // landed on a different slug inside the same service between the load and
  // the save), this helper reloads the latest persisted map, merges in a
  // single slug's record, then saves.
  //
  // Stays synchronous on purpose: no `navigator.locks`, no `await`, no Promise.
  //
  // This does NOT provide cross-tab protection. In production, each tab calls
  // `createLocalPlatformRepositories` independently, and each instance holds
  // its OWN per-tab `collections` cache keyed on subject-state (see
  // `src/platform/core/repositories/local.js`). There is no `storage` event
  // listener invalidating that cache, so reads inside tab A never see writes
  // performed by tab B until tab A restarts. Closing that cross-tab race is
  // deferred to the `post-mega-spelling-storage-cas` plan (navigator.locks +
  // BroadcastChannel + writeVersion CAS + lockout banner).
  //
  // Same-slug concurrent writes inside one service instance still
  // last-writer-wins.
  //
  // `saveGuardianMap` stays on the API because `resetLearner` (U6) zeros the
  // whole map in one go; that single-write is the only caller that should NOT
  // go through the merge-save path.
  function saveGuardianRecord(learnerId, slug, record) {
    const safeSlug = typeof slug === 'string' ? slug : '';
    if (!safeSlug) return;
    // Reload from storage so any write performed earlier on this same service
    // instance (possibly via a DIFFERENT slug) is preserved through the merge.
    const latest = loadGuardianMap(learnerId);
    // Normalise on write so malformed records don't leak past one load cycle.
    latest[safeSlug] = normaliseGuardianRecord(record, currentTodayDay());
    saveGuardianMap(learnerId, latest);
  }

  function loadProgressFromStorage(learnerId) {
    const raw = loadJson(resolvedStorage, progressMapKey(learnerId), {});
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  }

  function saveProgressToStorage(learnerId, map) {
    saveJson(resolvedStorage, progressMapKey(learnerId), map || {});
  }

  function coreWordCount() {
    return runtimeWords.filter((word) => (word?.spellingPool === 'extra' ? 'extra' : 'core') === 'core').length;
  }

  function secureCoreCount(progressStore) {
    let count = 0;
    for (const word of runtimeWords) {
      if ((word.spellingPool === 'extra' ? 'extra' : 'core') !== 'core') continue;
      const progress = progressStore?.[word.slug];
      if (progress && Number(progress.stage) >= GUARDIAN_SECURE_STAGE) count += 1;
    }
    return count;
  }

  function isAllWordsMega(progressStore) {
    const total = coreWordCount();
    if (!total) return false;
    return secureCoreCount(progressStore) === total;
  }

  function getAnalyticsSnapshot(learnerId) {
    const progressStore = progressSnapshot(learnerId);
    return {
      version: SPELLING_SERVICE_STATE_VERSION,
      generatedAt: clock(),
      pools: {
        all: getStats(learnerId, 'core', progressStore),
        core: getStats(learnerId, 'core', progressStore),
        y34: getStats(learnerId, 'y3-4', progressStore),
        y56: getStats(learnerId, 'y5-6', progressStore),
        extra: getStats(learnerId, 'extra', progressStore),
      },
      wordGroups: analyticsWordGroups(learnerId, progressStore),
    };
  }

  /**
   * Live post-mastery snapshot for UI consumers. Derives the same aggregates
   * as `getSpellingPostMasteryState` (read-model) but against the in-memory
   * service state so the Setup scene, Alt+4 gate, and summary copy see a
   * consistent view without drilling a read-model through the container tree.
   *
   * Returns: { allWordsMega, guardianDueCount, wobblingCount, nextGuardianDueDay, todayDay, guardianMap }
   * The raw `guardianMap` is included so UI consumers can compute per-word
   * labels (e.g. "Wobbling — due tomorrow") via `guardianLabel` without a
   * second round-trip to storage.
   */
  function getPostMasteryState(learnerId) {
    const progressStore = progressSnapshot(learnerId) || {};
    const guardianMap = loadGuardianMap(learnerId);
    const today = currentTodayDay();
    const allWordsMega = isAllWordsMega(progressStore);

    let guardianDueCount = 0;
    let wobblingCount = 0;
    let nextGuardianDueDay = null;
    for (const record of Object.values(guardianMap)) {
      if (!record) continue;
      if (record.nextDueDay <= today) guardianDueCount += 1;
      if (record.wobbling === true) wobblingCount += 1;
      if (nextGuardianDueDay === null || record.nextDueDay < nextGuardianDueDay) {
        nextGuardianDueDay = record.nextDueDay;
      }
    }

    return {
      allWordsMega,
      guardianDueCount,
      wobblingCount,
      nextGuardianDueDay,
      todayDay: today,
      guardianMap,
    };
  }

  function buildResumeSession(rawSession, learnerId) {
    if (!rawSession || typeof rawSession !== 'object' || Array.isArray(rawSession)) {
      return { session: null, summary: null, error: 'This spelling session is missing its saved state.' };
    }

    const raw = cloneSerialisable(rawSession);
    const type = SPELLING_SESSION_TYPES.includes(raw.type) ? raw.type : null;
    if (!type) {
      return { session: null, summary: null, error: 'This spelling session has an unknown type.' };
    }

    let currentSlug = isRuntimeKnownSlug(raw.currentSlug) ? raw.currentSlug : null;
    let uniqueWords = uniqueStrings(normaliseStringArray(raw.uniqueWords, isRuntimeKnownSlug));
    if (currentSlug && !uniqueWords.includes(currentSlug)) uniqueWords = [...uniqueWords, currentSlug];
    if (!uniqueWords.length) {
      return { session: null, summary: null, error: 'This spelling session no longer points at valid words.' };
    }

    const mode = normaliseMode(raw.mode, type === 'test' ? 'test' : 'smart');
    const savedPrompt = savedPromptForSlug(raw, currentSlug, runtimeWordBySlug);
    const session = {
      version: SPELLING_SERVICE_STATE_VERSION,
      id: normaliseString(raw.id, `sess-${clock()}-${randomFn().toString(16).slice(2)}`),
      type,
      mode,
      label: normaliseString(raw.label, defaultLabelForMode(mode)),
      practiceOnly: normaliseBoolean(raw.practiceOnly, false) && type !== 'test',
      fallbackToSmart: normaliseBoolean(raw.fallbackToSmart, false),
      extraWordFamilies: normaliseBoolean(raw.extraWordFamilies, false) && type !== 'test',
      profileId: normaliseString(raw.profileId, learnerId || 'default'),
      uniqueWords,
      queue: [],
      status: {},
      results: [],
      sentenceHistory: raw.sentenceHistory && typeof raw.sentenceHistory === 'object' && !Array.isArray(raw.sentenceHistory)
        ? raw.sentenceHistory
        : {},
      currentSlug,
      currentPrompt: savedPrompt,
      phase: type === 'test'
        ? 'question'
        : (SPELLING_SESSION_PHASES.includes(raw.phase) ? raw.phase : 'question'),
      promptCount: normaliseNonNegativeInteger(raw.promptCount, 0),
      lastFamily: normaliseOptionalString(raw.lastFamily),
      lastYear: normaliseOptionalString(raw.lastYear),
      startedAt: normaliseTimestamp(raw.startedAt, clock()),
      guardianResults: mode === 'guardian' && raw.guardianResults && typeof raw.guardianResults === 'object' && !Array.isArray(raw.guardianResults)
        ? { ...raw.guardianResults }
        : (mode === 'guardian' ? {} : undefined),
    };

    if (currentSlug && !session.currentPrompt) {
      session.currentPrompt = buildPrompt(engine, session, currentSlug, runtimeWordBySlug);
    }

    if (type === 'learning') {
      const existingStatus = raw.status && typeof raw.status === 'object' && !Array.isArray(raw.status)
        ? raw.status
        : {};
      for (const slug of uniqueWords) {
        const progress = engine.getProgress(learnerId, slug);
        session.status[slug] = normaliseLearningStatus(existingStatus[slug], progress.attempts === 0 ? 2 : 1);
      }
    }

    if (type === 'test') {
      session.results = normaliseTestResults(raw.results, uniqueWords);
    }

    const queued = uniqueStrings(normaliseStringArray(raw.queue, isRuntimeKnownSlug));
    if (queued.length) {
      session.queue = queued;
    } else if (type === 'learning') {
      session.queue = uniqueWords.filter((slug) => slug !== currentSlug && !session.status[slug]?.done);
    } else {
      const answered = new Set(session.results.map((entry) => entry.slug));
      session.queue = uniqueWords.filter((slug) => slug !== currentSlug && !answered.has(slug));
    }

    if (session.currentSlug && !runtimeWordBySlug[session.currentSlug]) {
      session.currentSlug = null;
      session.currentPrompt = null;
    }

    if (!session.currentSlug) {
      const next = session.mode === 'guardian'
        ? advanceGuardianCard(session)
        : engine.advanceCard(session, learnerId);
      if (next.done) {
        return {
          session: null,
          summary: normaliseSummary(engine.finalise(session), isRuntimeKnownSlug),
          error: '',
        };
      }
    }

    return {
      session: decorateSession(engine, learnerId, session, runtimeWordBySlug),
      summary: null,
      error: '',
    };
  }

  function initState(rawState = null, learnerId = null) {
    const source = rawState && typeof rawState === 'object' && !Array.isArray(rawState)
      ? copyState(rawState)
      : createInitialSpellingState();

    let phase = SPELLING_ROOT_PHASES.includes(source.phase) ? source.phase : 'dashboard';
    let feedback = normaliseFeedback(source.feedback);
    let summary = normaliseSummary(source.summary, isRuntimeKnownSlug);
    let error = normaliseString(source.error);
    let session = null;
    let awaitingAdvance = normaliseBoolean(source.awaitingAdvance, false);

    if (phase === 'summary') {
      if (!summary) {
        return {
          ...createInitialSpellingState(),
          error: error || 'This spelling summary could not be restored.',
        };
      }
      return {
        version: SPELLING_SERVICE_STATE_VERSION,
        phase: 'summary',
        session: null,
        feedback: null,
        summary,
        error: '',
        awaitingAdvance: false,
      };
    }

    if (phase === 'session') {
      const restored = buildResumeSession(source.session, learnerId);
      if (restored.summary) {
        return {
          version: SPELLING_SERVICE_STATE_VERSION,
          phase: 'summary',
          session: null,
          feedback: null,
          summary: restored.summary,
          error: '',
          awaitingAdvance: false,
        };
      }

      if (!restored.session) {
        return {
          ...createInitialSpellingState(),
          error: restored.error || error || 'This spelling session could not be resumed.',
        };
      }

      session = restored.session;
      feedback = normaliseFeedback(source.feedback);
      awaitingAdvance = awaitingAdvance && Boolean(feedback);
      error = '';

      return {
        version: SPELLING_SERVICE_STATE_VERSION,
        phase: 'session',
        session,
        feedback,
        summary: null,
        error,
        awaitingAdvance,
      };
    }

    if (phase === 'word-bank') {
      return {
        version: SPELLING_SERVICE_STATE_VERSION,
        phase: 'word-bank',
        session: null,
        feedback: null,
        summary: null,
        error,
        awaitingAdvance: false,
      };
    }

    return {
      version: SPELLING_SERVICE_STATE_VERSION,
      phase: 'dashboard',
      session: null,
      feedback: null,
      summary: null,
      error,
      awaitingAdvance: false,
    };
  }

  function activeAudioCue(learnerId, state, slow = false) {
    const prefs = getPrefs(learnerId);
    if (!prefs.autoSpeak) return null;
    const word = state?.session?.currentCard?.word;
    if (!word) return null;
    return {
      word,
      sentence: state.session.currentCard.prompt?.sentence,
      slow,
    };
  }

  function startGuardianSession(learnerId, options = {}) {
    const progressStore = progressSnapshot(learnerId) || {};
    if (!isAllWordsMega(progressStore)) {
      return buildTransition({
        ...createInitialSpellingState(),
        feedback: {
          kind: 'warn',
          headline: 'Guardian Mission unlocks after every core word is secure',
          body: 'Keep reviewing Smart Review and Trouble Drill until every core word is secure — then Guardian Mission opens.',
        },
      }, { ok: false });
    }

    const today = currentTodayDay();
    const guardianMap = loadGuardianMap(learnerId);
    const desiredLength = options.length === 'all'
      ? GUARDIAN_MAX_ROUND_LENGTH
      : clampSelectionLength(Number(options.length) || GUARDIAN_DEFAULT_ROUND_LENGTH);

    const selectedSlugs = selectGuardianWords({
      guardianMap,
      progressMap: progressStore,
      wordBySlug: runtimeWordBySlug,
      todayDay: today,
      length: desiredLength,
      random: randomFn,
    });

    if (!selectedSlugs.length) {
      return buildTransition({
        ...createInitialSpellingState(),
        feedback: {
          kind: 'info',
          headline: 'No Guardian duties today',
          body: 'Every guarded word is still holding — come back tomorrow for the next Guardian Mission.',
        },
      }, { ok: false });
    }

    const selectedWords = selectedSlugs.map((slug) => runtimeWordBySlug[slug]).filter(Boolean);
    if (!selectedWords.length) {
      return buildTransition({
        ...createInitialSpellingState(),
        error: 'Guardian Mission could not resolve any words.',
      }, { ok: false });
    }

    const created = engine.createSession({
      profileId: learnerId,
      mode: 'guardian',
      yearFilter: 'core',
      length: selectedWords.length,
      words: selectedWords,
      practiceOnly: false,
      extraWordFamilies: false,
    });

    if (!created.ok) {
      return buildTransition({
        ...createInitialSpellingState(),
        error: created.reason || 'Could not start a Guardian Mission.',
      }, { ok: false });
    }

    // Legacy createSession labels 'guardian' as 'Smart review' via fallthrough.
    // Stamp the Guardian Mission label + mission-scoped bookkeeping here.
    created.session.mode = 'guardian';
    created.session.label = 'Guardian Mission';
    created.session.guardianResults = {};

    const firstCard = advanceGuardianCard(created.session);
    if (firstCard.done) {
      return buildTransition({
        ...createInitialSpellingState(),
        error: 'Guardian Mission could not prepare the first card.',
      }, { ok: false });
    }

    const session = decorateSession(engine, learnerId, created.session, runtimeWordBySlug, created.progressStore);
    const nextState = {
      version: SPELLING_SERVICE_STATE_VERSION,
      phase: 'session',
      session,
      feedback: null,
      summary: null,
      error: '',
      awaitingAdvance: false,
    };

    persistence.syncPracticeSession(learnerId, nextState);
    return buildTransition(nextState, { audio: activeAudioCue(learnerId, nextState) });
  }

  function startSession(learnerId, options = {}) {
    const mode = normaliseMode(options.mode, 'smart');
    if (mode === 'guardian') {
      return startGuardianSession(learnerId, options);
    }
    const yearFilter = mode === 'test'
      ? 'core'
      : normaliseYearFilter(options.yearFilter, 'core');
    const requestedWords = Array.isArray(options.words)
      ? uniqueStrings(options.words.map((slug) => normaliseString(slug).toLowerCase()).filter(Boolean))
      : null;
    const selectedWords = Array.isArray(options.words)
      ? uniqueStrings(options.words.map((slug) => (isRuntimeKnownSlug(slug) ? runtimeWordBySlug[slug] : null)).filter(Boolean).map((word) => word.slug)).map((slug) => runtimeWordBySlug[slug])
      : null;
    const length = mode === 'test'
      ? 20
      : options.length === 'all'
        ? Number.MAX_SAFE_INTEGER
        : Number(options.length) || 20;
    const practiceOnly = normaliseBoolean(options.practiceOnly, false) && mode !== 'test';

    if (requestedWords?.length && !selectedWords?.length) {
      return buildTransition({
        ...createInitialSpellingState(),
        error: 'Could not start a spelling session.',
      }, { ok: false });
    }

    const created = engine.createSession({
      profileId: learnerId,
      mode,
      yearFilter,
      length,
      words: selectedWords,
      practiceOnly,
      extraWordFamilies: normaliseBoolean(options.extraWordFamilies, false) && yearFilter === 'extra',
    });

    if (!created.ok) {
      return buildTransition({
        ...createInitialSpellingState(),
        error: created.reason || 'Could not start a spelling session.',
      }, { ok: false });
    }

    const firstCard = engine.advanceCard(created.session, learnerId, created.progressStore);
    const session = firstCard.done ? null : decorateSession(engine, learnerId, created.session, runtimeWordBySlug, created.progressStore);
    if (!session) {
      return buildTransition({
        ...createInitialSpellingState(),
        error: 'Could not prepare the first spelling card.',
      }, { ok: false });
    }

    const nextState = {
      version: SPELLING_SERVICE_STATE_VERSION,
      phase: 'session',
      session,
      feedback: created.fallback
        ? {
            kind: 'warn',
            headline: 'Trouble drill fell back to Smart Review.',
            body: 'There were no active trouble words, so the engine built a mixed review round instead.',
          }
        : null,
      summary: null,
      error: '',
      awaitingAdvance: false,
    };

    persistence.syncPracticeSession(learnerId, nextState);
    return buildTransition(nextState, { audio: activeAudioCue(learnerId, nextState) });
  }

  function invalidSessionTransition(message) {
    return buildTransition({
      ...createInitialSpellingState(),
      error: message,
    }, { ok: false });
  }

  function submitGuardianAnswer(learnerId, current, rawTyped) {
    const session = cloneSerialisable(current.session);
    const currentSlug = session.currentSlug;
    const baseWord = runtimeWordBySlug[currentSlug];
    if (!baseWord) {
      return invalidSessionTransition('This Guardian Mission card is missing its word metadata.');
    }
    const promptWord = wordForPrompt(baseWord, session.currentPrompt);
    const graded = engine.grade(promptWord, rawTyped);
    const correct = Boolean(graded.correct);

    // Session bookkeeping — single attempt per word, no retry/correction phase.
    const statusEntry = session.status?.[currentSlug] || {
      attempts: 0,
      successes: 0,
      needed: 1,
      hadWrong: false,
      wrongAnswers: [],
      done: false,
      applied: false,
    };
    statusEntry.attempts += 1;
    statusEntry.done = true;
    statusEntry.applied = true;
    if (correct) {
      statusEntry.successes = (statusEntry.successes || 0) + 1;
    } else {
      statusEntry.hadWrong = true;
      statusEntry.wrongAnswers = [...(statusEntry.wrongAnswers || []), rawTyped];
    }
    session.status = session.status || {};
    session.status[currentSlug] = statusEntry;
    session.promptCount = (session.promptCount || 0) + 1;
    session.phase = 'question';

    // Remove this slug from the queue (legacy engine pre-shifts on advanceCard,
    // but we also clean up defensively in case the queue still has the slug).
    if (Array.isArray(session.queue)) {
      session.queue = session.queue.filter((slug) => slug !== currentSlug);
    }

    // Update progress.attempts / correct / wrong only. Stage/dueDay/lastDay/
    // lastResult are preserved — Guardian never demotes Mega.
    const progressMap = loadProgressFromStorage(learnerId);
    const existingProgress = progressMap[currentSlug] && typeof progressMap[currentSlug] === 'object'
      ? progressMap[currentSlug]
      : { stage: 0, attempts: 0, correct: 0, wrong: 0, dueDay: 0, lastDay: null, lastResult: null };
    const nextProgress = { ...existingProgress };
    nextProgress.attempts = (nextProgress.attempts || 0) + 1;
    if (correct) nextProgress.correct = (nextProgress.correct || 0) + 1;
    else nextProgress.wrong = (nextProgress.wrong || 0) + 1;
    progressMap[currentSlug] = nextProgress;
    saveProgressToStorage(learnerId, progressMap);

    // Advance the guardian record. Lazy-create if this is the first Guardian
    // touch for the slug. We load a mutable copy for the read-side
    // (`ensureGuardianRecord` plus the wobbling inspection), then commit via
    // the per-slug `saveGuardianRecord` helper.
    //
    // U7 scope: this narrows the read-to-write window within a SINGLE service
    // instance. Two tabs each hold their own per-tab `repositories` cache, so
    // `saveGuardianRecord`'s reload only sees writes made through the same
    // cache — not writes from another tab. Closing the cross-tab race
    // requires the deferred `post-mega-spelling-storage-cas` plan
    // (navigator.locks + BroadcastChannel + writeVersion CAS).
    //
    // Composition note (U7-02, accepted limitation): `beforeRecord` is
    // captured here and used below to compute `wasWobbling` for the outcome
    // event. If another service instance concurrently writes the same slug
    // between this load and `saveGuardianRecord`'s internal reload, the event
    // still reports the outcome of THIS submission (renewed / recovered /
    // wobbled) against the state we observed — which matches user
    // expectations for the tab that actually produced the answer. The map on
    // storage ends last-writer-wins per slug. Full same-slug CAS is deferred
    // with the cross-tab work.
    //
    // Note: when U4's "I don't know" branch lands in `skipWord`, it must also
    // use `saveGuardianRecord` instead of the whole-map writer, otherwise the
    // "I don't know" wobble and a concurrent correct/wrong submit on the same
    // service instance can stomp each other. That wiring is owned by U4
    // itself; this comment is left here so the follow-up is obvious.
    const todayDay = currentTodayDay();
    const guardianMap = loadGuardianMap(learnerId);
    const beforeRecord = ensureGuardianRecord(guardianMap, currentSlug, todayDay);
    const wasWobbling = beforeRecord.wobbling === true;
    const updatedRecord = correct
      ? advanceGuardianOnCorrect(beforeRecord, todayDay)
      : advanceGuardianOnWrong(beforeRecord, todayDay);
    saveGuardianRecord(learnerId, currentSlug, updatedRecord);

    // Record the per-word outcome so the finalisation step can emit the
    // mission-completed event with accurate aggregate counts.
    const outcomeKind = !correct
      ? 'wobbled'
      : wasWobbling
        ? 'recovered'
        : 'renewed';
    session.guardianResults = session.guardianResults || {};
    session.guardianResults[currentSlug] = outcomeKind;

    const eventTime = clock();
    const events = [];
    if (outcomeKind === 'renewed') {
      events.push(createSpellingGuardianRenewedEvent({
        learnerId,
        session,
        slug: currentSlug,
        reviewLevel: updatedRecord.reviewLevel,
        nextDueDay: updatedRecord.nextDueDay,
        createdAt: eventTime,
        wordMeta: runtimeWordBySlug,
      }));
    } else if (outcomeKind === 'wobbled') {
      events.push(createSpellingGuardianWobbledEvent({
        learnerId,
        session,
        slug: currentSlug,
        lapses: updatedRecord.lapses,
        createdAt: eventTime,
        wordMeta: runtimeWordBySlug,
      }));
    } else {
      events.push(createSpellingGuardianRecoveredEvent({
        learnerId,
        session,
        slug: currentSlug,
        renewals: updatedRecord.renewals,
        reviewLevel: updatedRecord.reviewLevel,
        createdAt: eventTime,
        wordMeta: runtimeWordBySlug,
      }));
    }

    const daysUntilNextCheck = Math.max(0, updatedRecord.nextDueDay - todayDay);
    const feedback = correct
      ? {
          kind: wasWobbling ? 'success' : 'info',
          headline: wasWobbling ? 'Recovered.' : 'Guardian strong.',
          answer: promptWord.word,
          body: wasWobbling
            ? `This word is back under your guard. Next Guardian check in ${daysUntilNextCheck} day${daysUntilNextCheck === 1 ? '' : 's'}.`
            : `This word stays secure. Next Guardian check in ${daysUntilNextCheck} day${daysUntilNextCheck === 1 ? '' : 's'}.`,
        }
      : {
          kind: 'warn',
          headline: 'Wobbling.',
          answer: promptWord.word,
          body: 'Mega stays, but this word will return tomorrow for a Guardian check.',
          attemptedAnswer: rawTyped,
        };

    const nextState = {
      version: SPELLING_SERVICE_STATE_VERSION,
      phase: 'session',
      session: decorateSession(engine, learnerId, session, runtimeWordBySlug),
      feedback: normaliseFeedback(feedback),
      summary: null,
      error: '',
      awaitingAdvance: true,
    };

    persistence.syncPracticeSession(learnerId, nextState);
    return buildTransition(nextState, { events });
  }

  function submitAnswer(learnerId, rawState, typed) {
    const current = initState(rawState, learnerId);
    if (current.phase !== 'session' || !current.session) {
      return invalidSessionTransition('No active spelling session is available for that submission.');
    }

    if (current.awaitingAdvance) {
      return buildTransition(current, { changed: false });
    }

    const rawTyped = normaliseString(typed).trim();
    if (!rawTyped) {
      return buildTransition({
        ...current,
        feedback: {
          kind: 'warn',
          headline: 'Type an answer first.',
          body: 'No attempt was recorded.',
        },
        error: '',
        awaitingAdvance: false,
      });
    }

    if (current.session.mode === 'guardian') {
      return submitGuardianAnswer(learnerId, current, rawTyped);
    }

    const session = cloneSerialisable(current.session);
    const entryPhase = session.phase;
    const currentSlug = session.currentSlug;
    const result = session.type === 'test'
      ? engine.submitTest(session, learnerId, rawTyped)
      : engine.submitLearning(session, learnerId, rawTyped);

    if (!result) {
      return invalidSessionTransition('This spelling session became stale and was cleared.');
    }

    if (result.empty) {
      return buildTransition({
        ...current,
        feedback: {
          kind: 'warn',
          headline: 'Type an answer first.',
          body: 'No attempt was recorded.',
        },
        error: '',
        awaitingAdvance: false,
      });
    }

    const eventTime = clock();
    const events = [];
    if (currentSlug && result.correct && entryPhase !== 'question') {
      events.push(createSpellingRetryClearedEvent({
        learnerId,
        session,
        slug: currentSlug,
        fromPhase: entryPhase,
        attemptCount: session.status?.[currentSlug]?.attempts ?? null,
        createdAt: eventTime,
        wordMeta: runtimeWordBySlug,
      }));
    }
    if (result.outcome?.justMastered && currentSlug) {
      events.push(createSpellingWordSecuredEvent({
        learnerId,
        session,
        slug: currentSlug,
        stage: result.outcome.newStage,
        createdAt: eventTime,
        wordMeta: runtimeWordBySlug,
      }));

      const secureCount = getStats(learnerId, 'all').secure;
      const milestone = masteryMilestoneForCount(secureCount);
      if (milestone) {
        events.push(createSpellingMasteryMilestoneEvent({
          learnerId,
          session,
          milestone,
          secureCount,
          createdAt: eventTime,
        }));
      }
    }

    const nextState = {
      version: SPELLING_SERVICE_STATE_VERSION,
      phase: 'session',
      session: decorateSession(engine, learnerId, session, runtimeWordBySlug),
      feedback: normaliseFeedback({
        ...result.feedback,
        ...(session.type !== 'test' && result.correct === false ? { attemptedAnswer: rawTyped } : {}),
      }),
      summary: null,
      error: '',
      awaitingAdvance: result.nextAction === 'advance',
    };

    const audio = !nextState.awaitingAdvance && result.phase === 'retry'
      ? activeAudioCue(learnerId, nextState, true)
      : null;

    persistence.syncPracticeSession(learnerId, nextState);
    return buildTransition(nextState, { events, audio });
  }

  function guardianMissionEventsForSession(learnerId, session, summary, createdAt) {
    if (session?.mode !== 'guardian') return [];
    const results = session.guardianResults && typeof session.guardianResults === 'object' && !Array.isArray(session.guardianResults)
      ? session.guardianResults
      : {};
    let renewalCount = 0;
    let wobbledCount = 0;
    let recoveredCount = 0;
    for (const outcome of Object.values(results)) {
      if (outcome === 'renewed') renewalCount += 1;
      else if (outcome === 'wobbled') wobbledCount += 1;
      else if (outcome === 'recovered') recoveredCount += 1;
    }
    const events = [];
    const sessionCompleted = createSpellingSessionCompletedEvent({
      learnerId,
      session,
      summary,
      createdAt,
    });
    if (sessionCompleted) events.push(sessionCompleted);
    events.push(createSpellingGuardianMissionCompletedEvent({
      learnerId,
      session,
      renewalCount,
      wobbledCount,
      recoveredCount,
      createdAt,
    }));
    return events;
  }

  function continueSession(learnerId, rawState) {
    const current = initState(rawState, learnerId);
    if (current.phase !== 'session' || !current.session) {
      return invalidSessionTransition('No active spelling session is available to continue.');
    }

    if (!current.awaitingAdvance) {
      return buildTransition(current, { changed: false });
    }

    const session = cloneSerialisable(current.session);
    const advanced = session.mode === 'guardian'
      ? advanceGuardianCard(session)
      : engine.advanceCard(session, learnerId);

    if (advanced.done) {
      const summary = normaliseSummary(engine.finalise(session), isRuntimeKnownSlug);
      const nextState = {
        version: SPELLING_SERVICE_STATE_VERSION,
        phase: 'summary',
        session: null,
        feedback: null,
        summary,
        error: '',
        awaitingAdvance: false,
      };
      persistence.syncPracticeSession(learnerId, nextState);
      const createdAt = clock();
      const events = session.mode === 'guardian'
        ? guardianMissionEventsForSession(learnerId, session, summary, createdAt)
        : sessionCompletedEvents({ learnerId, session, summary, createdAt });
      return buildTransition(nextState, { events });
    }

    const nextState = {
      version: SPELLING_SERVICE_STATE_VERSION,
      phase: 'session',
      session: decorateSession(engine, learnerId, session, runtimeWordBySlug),
      feedback: null,
      summary: null,
      error: '',
      awaitingAdvance: false,
    };

    persistence.syncPracticeSession(learnerId, nextState);
    return buildTransition(nextState, { audio: activeAudioCue(learnerId, nextState) });
  }

  // U4: Guardian-native "I don't know" path. Routes through advanceGuardianOnWrong,
  // emits spelling.guardian.wobbled, records guardianResults[slug] = 'wobbled' so
  // mission-completed aggregates the count, and never mutates progress.stage /
  // dueDay / lastDay / lastResult. Mirrors the wrong-answer branch of
  // submitGuardianAnswer end-to-end: both set awaitingAdvance=true and let
  // continueSession handle the queue advance, so a double-tap on the button
  // no-ops on the second call (continueSession owns the Continue → next-card
  // transition, including the audio cue). See
  // docs/plans/2026-04-25-005-feat-post-mega-spelling-guardian-hardening-plan.md (U4).
  function skipGuardianWord(learnerId, current) {
    const session = cloneSerialisable(current.session);
    const currentSlug = session.currentSlug;
    const baseWord = currentSlug ? runtimeWordBySlug[currentSlug] : null;
    if (!baseWord || session.phase !== 'question') {
      return buildTransition({
        ...current,
        feedback: {
          kind: 'warn',
          headline: 'This word cannot be skipped right now.',
          body: 'Finish the retry or correction step first.',
        },
        error: '',
      });
    }

    // Session bookkeeping — matches submitGuardianAnswer wrong-path shape so
    // summary.mistakes picks this slug up for the practice-only drill (U3).
    const statusEntry = session.status?.[currentSlug] || {
      attempts: 0,
      successes: 0,
      needed: 1,
      hadWrong: false,
      wrongAnswers: [],
      done: false,
      applied: false,
    };
    statusEntry.attempts += 1;
    statusEntry.done = true;
    statusEntry.applied = true;
    statusEntry.hadWrong = true;
    session.status = session.status || {};
    session.status[currentSlug] = statusEntry;
    session.promptCount = (session.promptCount || 0) + 1;
    session.phase = 'question';

    // FIFO-clean: remove the skipped slug from the queue, never re-queue (unlike
    // legacy enqueueLater). submitGuardianAnswer does the same defensively.
    if (Array.isArray(session.queue)) {
      session.queue = session.queue.filter((slug) => slug !== currentSlug);
    }

    // Update progress.attempts + progress.wrong only. Stage/dueDay/lastDay/
    // lastResult are preserved — Mega-never-revoked invariant.
    const progressMap = loadProgressFromStorage(learnerId);
    const existingProgress = progressMap[currentSlug] && typeof progressMap[currentSlug] === 'object'
      ? progressMap[currentSlug]
      : { stage: 0, attempts: 0, correct: 0, wrong: 0, dueDay: 0, lastDay: null, lastResult: null };
    const nextProgress = { ...existingProgress };
    nextProgress.attempts = (nextProgress.attempts || 0) + 1;
    nextProgress.wrong = (nextProgress.wrong || 0) + 1;
    progressMap[currentSlug] = nextProgress;
    saveProgressToStorage(learnerId, progressMap);

    // Advance the guardian record the same way a wrong answer does.
    const todayDay = currentTodayDay();
    const guardianMap = loadGuardianMap(learnerId);
    const beforeRecord = ensureGuardianRecord(guardianMap, currentSlug, todayDay);
    const updatedRecord = advanceGuardianOnWrong(beforeRecord, todayDay);
    guardianMap[currentSlug] = updatedRecord;
    saveGuardianMap(learnerId, guardianMap);

    // Record the per-word outcome so guardianMissionEventsForSession counts
    // this as a wobble on the final mission-completed event.
    session.guardianResults = session.guardianResults || {};
    session.guardianResults[currentSlug] = 'wobbled';

    const eventTime = clock();
    const events = [];
    const wobbledEvent = createSpellingGuardianWobbledEvent({
      learnerId,
      session,
      slug: currentSlug,
      lapses: updatedRecord.lapses,
      createdAt: eventTime,
      wordMeta: runtimeWordBySlug,
    });
    if (wobbledEvent) events.push(wobbledEvent);

    // Set awaitingAdvance=true so continueSession handles the FIFO advance
    // (including activeAudioCue for the next card). This matches
    // submitGuardianAnswer exactly — double-taps on the button no-op because
    // the skipWord entry check already returns changed:false when
    // awaitingAdvance is set.
    const nextState = {
      version: SPELLING_SERVICE_STATE_VERSION,
      phase: 'session',
      session: decorateSession(engine, learnerId, session, runtimeWordBySlug),
      feedback: normaliseFeedback({
        kind: 'warn',
        headline: 'Wobbling.',
        answer: baseWord.word,
        body: 'Mega stays, but this word will return tomorrow for a Guardian check.',
      }),
      summary: null,
      error: '',
      awaitingAdvance: true,
    };
    persistence.syncPracticeSession(learnerId, nextState);
    return buildTransition(nextState, { events });
  }

  function skipWord(learnerId, rawState) {
    const current = initState(rawState, learnerId);
    if (current.phase !== 'session' || !current.session) {
      return invalidSessionTransition('No active spelling session is available to skip within.');
    }

    if (current.awaitingAdvance) {
      return buildTransition(current, { changed: false });
    }

    if (current.session.mode === 'guardian') {
      return skipGuardianWord(learnerId, current);
    }

    const session = cloneSerialisable(current.session);
    const skipped = engine.skipCurrent(session);
    if (!skipped) {
      return buildTransition({
        ...current,
        feedback: {
          kind: 'warn',
          headline: 'This word cannot be skipped right now.',
          body: 'Finish the retry or correction step first.',
        },
        error: '',
      });
    }

    const advanced = engine.advanceCard(session, learnerId);
    if (advanced.done) {
      const summary = normaliseSummary(engine.finalise(session), isRuntimeKnownSlug);
      const nextState = {
        version: SPELLING_SERVICE_STATE_VERSION,
        phase: 'summary',
        session: null,
        feedback: null,
        summary,
        error: '',
        awaitingAdvance: false,
      };
      persistence.syncPracticeSession(learnerId, nextState);
      return buildTransition(nextState, {
        events: sessionCompletedEvents({ learnerId, session, summary, createdAt: clock() }),
      });
    }

    const nextState = {
      version: SPELLING_SERVICE_STATE_VERSION,
      phase: 'session',
      session: decorateSession(engine, learnerId, session, runtimeWordBySlug),
      feedback: {
        kind: 'info',
        headline: 'Skipped for now.',
        body: 'This word has been moved later in the round.',
      },
      summary: null,
      error: '',
      awaitingAdvance: false,
    };
    persistence.syncPracticeSession(learnerId, nextState);
    return buildTransition(nextState);
  }

  function endSession(learnerId, rawState = null) {
    const current = rawState ? initState(rawState, learnerId) : createInitialSpellingState();
    if (current.phase === 'session' && current.session) {
      persistence.abandonPracticeSession(learnerId, current);
    }
    return buildTransition(createInitialSpellingState());
  }

  function stageLabel(stage) {
    return engine.stageLabel(stage);
  }

  function resetLearner(learnerId) {
    const currentPrefs = getPrefs(learnerId);
    engine.resetProgress(learnerId);
    persistence.resetLearner?.(learnerId);
    saveJson(resolvedStorage, prefsKey(learnerId), {
      ...defaultSpellingPrefs(),
      ttsProvider: currentPrefs.ttsProvider,
      bufferedGeminiVoice: currentPrefs.bufferedGeminiVoice,
    });
    // U6: explicitly zero the Guardian map on the storage proxy, so hosts
    // that wire a persistence adapter without `resetLearner` (or a raw
    // storage-only host) do not leak a non-empty ks2-spell-guardian-*
    // record across a learner reset. Idempotent on an already-empty map.
    saveGuardianMap(learnerId, {});
  }

  return {
    initState,
    getPrefs,
    savePrefs,
    getStats,
    getWordBankEntry,
    getAnalyticsSnapshot,
    getPostMasteryState,
    startSession,
    submitAnswer,
    continueSession,
    skipWord,
    endSession,
    stageLabel,
    resetLearner,
    // U7: synchronous per-slug guardian-map writer. Exposed on the service API
    // so (a) tests can assert the merge-save contract, and (b) future guardian
    // write sites (e.g. U4's "I don't know" branch) can call it directly
    // instead of going through a whole-map load/mutate/save.
    saveGuardianRecord,
  };
}
