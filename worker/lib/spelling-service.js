import { WORDS, WORD_BY_SLUG } from "../generated/spelling-data.js";
import { createSpellingEngineRuntime } from "../generated/spelling-runtime.js";

export const SPELLING_MODES = Object.freeze({
  SMART: "smart",
  TROUBLE: "trouble",
  TEST: "test",
  SINGLE: "single",
});

function today() {
  return Date.now();
}

function createStorageAdapter(childId, childState) {
  const bucket = new Map();
  const progressKey = `ks2-spell-progress-${childId || "default"}`;
  const monsterKey = `ks2-monsters-${childId || "default"}`;

  bucket.set(progressKey, JSON.stringify(childState.spellingProgress || {}));
  bucket.set(monsterKey, JSON.stringify(childState.monsterState || {}));

  return {
    getItem(key) {
      return bucket.has(key) ? bucket.get(key) : null;
    },
    setItem(key, value) {
      bucket.set(key, String(value));
    },
    removeItem(key) {
      bucket.delete(key);
    },
    snapshot() {
      return {
        spellingProgress: safeJson(bucket.get(progressKey), {}),
        monsterState: safeJson(bucket.get(monsterKey), {}),
        spellingPrefs: childState.spellingPrefs || {},
      };
    },
  };
}

function safeJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function sanitiseWord(word) {
  if (!word) return null;
  return {
    slug: word.slug,
    word: word.word,
    family: word.family,
    familyWords: Array.isArray(word.familyWords) ? word.familyWords.slice() : [],
    year: word.year,
    yearLabel: word.yearLabel,
    sentence: word.sentence,
    sentences: Array.isArray(word.sentences) ? word.sentences.slice() : [],
  };
}

function buildMonsterProgress(monsterState, monsterId) {
  const entry = monsterState?.[monsterId] || { mastered: [], caught: false };
  const mastered = Array.isArray(entry.mastered) ? entry.mastered.length : 0;
  return {
    mastered,
    stage: stageFor(mastered),
    level: levelFor(mastered),
    caught: Boolean(entry.caught) || mastered >= 10,
    masteredList: Array.isArray(entry.mastered) ? entry.mastered.slice() : [],
  };
}

function stageFor(mastered) {
  if (mastered >= 100) return 4;
  if (mastered >= 80) return 3;
  if (mastered >= 50) return 2;
  if (mastered >= 10) return 1;
  return 0;
}

function levelFor(mastered) {
  return Math.min(10, Math.floor(mastered / 10));
}

function recordMonsterMastery(monsterState, monsterId, wordSlug) {
  const all = { ...(monsterState || {}) };
  const entry = all[monsterId] || { mastered: [], caught: false };
  if (entry.mastered.includes(wordSlug)) return { state: all, event: null };
  const prevMastered = entry.mastered.length;
  const prevStage = stageFor(prevMastered);
  const prevLevel = levelFor(prevMastered);
  entry.mastered = [...entry.mastered, wordSlug];
  const newMastered = entry.mastered.length;
  const newStage = stageFor(newMastered);
  const newLevel = levelFor(newMastered);

  let kind = null;
  if (!entry.caught && newMastered >= 10) {
    entry.caught = true;
    kind = "caught";
  } else if (newStage > prevStage) {
    kind = newStage === 4 ? "mega" : "evolve";
  } else if (newLevel > prevLevel) {
    kind = "levelup";
  }

  all[monsterId] = entry;
  if (!kind) return { state: all, event: null };
  return {
    state: all,
    event: {
      kind,
      monsterId,
      stage: newStage,
      level: newLevel,
      mastered: newMastered,
    },
  };
}

function buildProgressMeta(session) {
  const total = Array.isArray(session.uniqueWords) ? session.uniqueWords.length : 0;
  if (session.type === "test") {
    const results = Array.isArray(session.results) ? session.results : [];
    return {
      total,
      checked: results.length,
      done: results.length,
      wrongCount: results.filter((item) => !item.correct).length,
    };
  }

  const statusEntries = Object.values(session.status || {});
  return {
    total,
    checked: statusEntries.filter((info) => info.attempts > 0).length,
    done: statusEntries.filter((info) => info.done).length,
    wrongCount: statusEntries.filter((info) => info.hadWrong).length,
  };
}

function buildSessionPayload(engine, childId, session, currentCard) {
  const resolvedCard = currentCard || (
    session?.currentSlug && session?.currentPrompt
      ? {
          slug: session.currentSlug,
          word: WORD_BY_SLUG[session.currentSlug] || null,
          prompt: session.currentPrompt,
        }
      : null
  );
  const progressStage = resolvedCard && resolvedCard.slug
    ? engine.getProgress(childId, resolvedCard.slug).stage
    : 0;
  return {
    id: session.id,
    type: session.type,
    mode: session.mode,
    label: session.label,
    phase: session.phase,
    fallbackToSmart: Boolean(session.fallbackToSmart),
    progress: buildProgressMeta(session),
    currentCard: resolvedCard && resolvedCard.word
      ? {
          slug: resolvedCard.slug,
          word: sanitiseWord(resolvedCard.word),
          prompt: resolvedCard.prompt,
          progressStage,
        }
      : null,
  };
}

function runtimeForChild(childId, childState) {
  const storage = createStorageAdapter(childId, childState);
  const engine = createSpellingEngineRuntime({
    words: WORDS,
    wordMeta: WORD_BY_SLUG,
    storage,
    tts: null,
  });
  return { engine, storage };
}

export function buildBootstrapStats(childId, childState) {
  const { engine } = runtimeForChild(childId, childState);
  const monsterState = childState.monsterState || {};
  return {
    spelling: {
      stats: {
        all: engine.lifetimeStats(childId, "all"),
        y3_4: engine.lifetimeStats(childId, "y3-4"),
        y5_6: engine.lifetimeStats(childId, "y5-6"),
      },
      prefs: {
        yearFilter: childState.spellingPrefs?.yearFilter || "all",
        roundLength: childState.spellingPrefs?.roundLength || "20",
        showCloze: typeof childState.spellingPrefs?.showCloze === "boolean" ? childState.spellingPrefs.showCloze : true,
        autoSpeak: typeof childState.spellingPrefs?.autoSpeak === "boolean" ? childState.spellingPrefs.autoSpeak : true,
      },
    },
    monsters: {
      inklet: buildMonsterProgress(monsterState, "inklet"),
      glimmerbug: buildMonsterProgress(monsterState, "glimmerbug"),
    },
  };
}

export function savePrefs(childState, prefs) {
  return {
    ...childState,
    spellingPrefs: {
      yearFilter: prefs.yearFilter || "all",
      roundLength: prefs.roundLength || "20",
      showCloze: typeof prefs.showCloze === "boolean" ? prefs.showCloze : true,
      autoSpeak: typeof prefs.autoSpeak === "boolean" ? prefs.autoSpeak : true,
    },
  };
}

export function createSessionForChild(childId, childState, options) {
  const { engine, storage } = runtimeForChild(childId, childState);
  const selectedWords = Array.isArray(options.words)
    ? options.words.map((slug) => WORD_BY_SLUG[slug]).filter(Boolean)
    : null;
  const result = engine.createSession({
    mode: options.mode,
    yearFilter: options.yearFilter,
    length: options.length,
    words: selectedWords,
    profileId: childId,
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason || "Could not start a spelling session.",
      childState: storage.snapshot(),
    };
  }

  const advance = engine.advanceCard(result.session, childId);
  return {
    ok: true,
    childState: storage.snapshot(),
    sessionState: result.session,
    payload: buildSessionPayload(engine, childId, result.session, advance.done ? null : advance),
  };
}

export function advanceSession(childId, childState, sessionState) {
  const { engine, storage } = runtimeForChild(childId, childState);
  const advance = engine.advanceCard(sessionState, childId);
  if (advance.done) {
    return {
      done: true,
      summary: engine.finalise(sessionState),
      childState: storage.snapshot(),
    };
  }
  return {
    done: false,
    payload: buildSessionPayload(engine, childId, sessionState, advance),
    childState: storage.snapshot(),
  };
}

export function submitSession(childId, childState, sessionState, typed) {
  const { engine, storage } = runtimeForChild(childId, childState);
  const isTest = sessionState.type === "test";
  const result = isTest
    ? engine.submitTest(sessionState, childId, typed)
    : engine.submitLearning(sessionState, childId, typed);

  let monsterState = storage.snapshot().monsterState || {};
  let monsterEvent = null;

  if (result?.outcome?.justMastered && sessionState.currentSlug) {
    const monsterId = engine.monsterForWord(sessionState.currentSlug);
    const monsterUpdate = recordMonsterMastery(monsterState, monsterId, sessionState.currentSlug);
    monsterState = monsterUpdate.state;
    monsterEvent = monsterUpdate.event;
  }

  const nextChildState = {
    ...storage.snapshot(),
    monsterState,
  };

  return {
    result,
    childState: nextChildState,
    monsterEvent,
    payload: buildSessionPayload(engine, childId, sessionState, null),
  };
}

export function skipSession(childId, childState, sessionState) {
  const { engine, storage } = runtimeForChild(childId, childState);
  const result = engine.skipCurrent(sessionState);
  return {
    result,
    childState: storage.snapshot(),
    payload: buildSessionPayload(engine, childId, sessionState, null),
  };
}
