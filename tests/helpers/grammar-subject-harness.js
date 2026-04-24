import { createLocalPlatformRepositories } from '../../src/platform/core/repositories/index.js';
import { SUBJECTS } from '../../src/platform/core/subject-registry.js';
import { normaliseGrammarReadModel } from '../../src/subjects/grammar/metadata.js';
import { createServerGrammarEngine } from '../../worker/src/subjects/grammar/engine.js';
import { buildGrammarReadModel } from '../../worker/src/subjects/grammar/read-models.js';
import { createAppHarness } from './app-harness.js';
import { readGrammarLegacyOracle } from './grammar-legacy-oracle.js';

const SUBJECT_ID = 'grammar';

function timestamp(now = Date.now) {
  const value = typeof now === 'function' ? Number(now()) : Number(now);
  return Number.isFinite(value) ? value : Date.now();
}

function requestId(prefix, learnerId, now) {
  return `${prefix}-${learnerId || 'learner'}-${timestamp(now)}`;
}

function readRuntime(repositories, learnerId) {
  return {
    subjectRecord: repositories.subjectStates.read(learnerId, SUBJECT_ID),
    latestSession: repositories.practiceSessions.latest(learnerId, SUBJECT_ID),
  };
}

function writeRuntime(repositories, learnerId, result) {
  if (result?.data) repositories.subjectStates.writeData(learnerId, SUBJECT_ID, result.data);
  if (result?.practiceSession) repositories.practiceSessions.write(result.practiceSession);
}

function transitionFromResult(result, learnerId, now) {
  return {
    ok: true,
    changed: result?.changed !== false,
    state: buildGrammarReadModel({
      learnerId,
      state: result.state,
      now: timestamp(now),
    }),
    events: Array.isArray(result?.events) ? result.events : [],
    audio: null,
  };
}

export function createGrammarTestService({ repositories, now = Date.now } = {}) {
  if (!repositories) {
    throw new TypeError('Grammar test service requires platform repositories.');
  }

  function apply(learnerId, command, payload = {}) {
    const engine = createServerGrammarEngine({ now });
    const runtime = readRuntime(repositories, learnerId);
    const result = engine.apply({
      learnerId,
      subjectRecord: runtime.subjectRecord,
      latestSession: runtime.latestSession,
      command,
      payload,
      requestId: requestId(command, learnerId, now),
    });
    writeRuntime(repositories, learnerId, result);
    const transition = transitionFromResult(result, learnerId, now);
    repositories.subjectStates.writeUi(learnerId, SUBJECT_ID, transition.state);
    return transition;
  }

  return {
    initState(rawState, learnerId) {
      return normaliseGrammarReadModel(rawState, learnerId);
    },
    getPrefs(learnerId) {
      return normaliseGrammarReadModel(repositories.subjectStates.read(learnerId, SUBJECT_ID).ui, learnerId).prefs;
    },
    savePrefs(learnerId, patch = {}) {
      const transition = apply(learnerId, 'save-prefs', { prefs: patch });
      return transition.state.prefs;
    },
    getStats(learnerId) {
      return normaliseGrammarReadModel(repositories.subjectStates.read(learnerId, SUBJECT_ID).ui, learnerId).stats.concepts;
    },
    getAnalyticsSnapshot(learnerId) {
      return normaliseGrammarReadModel(repositories.subjectStates.read(learnerId, SUBJECT_ID).ui, learnerId).analytics;
    },
    startSession(learnerId, payload = {}) {
      return apply(learnerId, 'start-session', payload);
    },
    submitAnswer(learnerId, _uiState, response = {}) {
      return apply(learnerId, 'submit-answer', { response });
    },
    continueSession(learnerId) {
      return apply(learnerId, 'continue-session');
    },
    endSession(learnerId) {
      return apply(learnerId, 'end-session');
    },
    resetLearner(learnerId) {
      repositories.subjectStates.clearLearner(learnerId);
      repositories.practiceSessions.clear(learnerId, SUBJECT_ID);
    },
  };
}

export function grammarResponseFormData(response = {}) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(response || {})) {
    if (Array.isArray(value)) {
      value.forEach((entry) => formData.append(key, entry));
    } else {
      formData.set(key, value);
    }
  }
  return formData;
}

export function grammarOracleResponseForItem(item) {
  const oracle = readGrammarLegacyOracle();
  const match = oracle.templates.find((template) => template.id === item?.templateId);
  return match?.correctResponse || {};
}

export function createGrammarHarness({ storage, subjects = SUBJECTS, now = () => 1_777_000_000_000 } = {}) {
  const repositories = createLocalPlatformRepositories({ storage });
  return createAppHarness({
    storage,
    repositories,
    subjects,
    now,
    extraServices: {
      grammar: createGrammarTestService({ repositories, now }),
    },
  });
}
