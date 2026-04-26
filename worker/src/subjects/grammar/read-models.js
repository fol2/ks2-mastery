import { cloneSerialisable } from '../../../../src/platform/core/repositories/helpers.js';
import {
  GRAMMAR_CONCEPTS,
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_QUESTION_TYPES,
  GRAMMAR_TEMPLATE_METADATA,
} from './content.js';
import {
  GRAMMAR_ENABLED_MODES,
  GRAMMAR_LOCKED_MODES,
  GRAMMAR_SERVER_AUTHORITY,
} from './engine.js';
import {
  deriveGrammarConfidence,
  GRAMMAR_CONFIDENCE_LABELS,
  GRAMMAR_RECENT_ATTEMPT_HORIZON,
  grammarConceptStatus,
} from '../../../../shared/grammar/confidence.js';
import {
  GRAMMAR_TRANSFER_PROMPTS,
  GRAMMAR_TRANSFER_MAX_PROMPTS as GRAMMAR_TRANSFER_MAX_PROMPTS_LIMIT,
  GRAMMAR_TRANSFER_HISTORY_PER_PROMPT as GRAMMAR_TRANSFER_HISTORY_PER_PROMPT_LIMIT,
  GRAMMAR_TRANSFER_WRITING_CAP as GRAMMAR_TRANSFER_WRITING_CAP_LIMIT,
  grammarTransferPromptSummary,
} from './transfer-prompts.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeInputSpec(inputSpec) {
  if (!isPlainObject(inputSpec)) return null;
  const clone = cloneSerialisable(inputSpec);
  if (clone?.options && Array.isArray(clone.options)) {
    clone.options = clone.options.map((option) => ({
      value: String(option.value ?? ''),
      label: String(option.label ?? option.value ?? ''),
    }));
  }
  if (clone?.rows && Array.isArray(clone.rows)) {
    clone.rows = clone.rows.map((row) => ({
      key: String(row.key || ''),
      label: String(row.label || ''),
    }));
  }
  return clone;
}

function safeCurrentItem(item) {
  if (!isPlainObject(item)) return null;
  return {
    contentReleaseId: item.contentReleaseId === GRAMMAR_CONTENT_RELEASE_ID ? GRAMMAR_CONTENT_RELEASE_ID : '',
    templateId: typeof item.templateId === 'string' ? item.templateId : '',
    templateLabel: typeof item.templateLabel === 'string' ? item.templateLabel : '',
    domain: typeof item.domain === 'string' ? item.domain : '',
    skillIds: Array.isArray(item.skillIds) ? item.skillIds.filter(Boolean).map(String) : [],
    questionType: typeof item.questionType === 'string' ? item.questionType : '',
    seed: Number.isFinite(Number(item.seed)) ? Number(item.seed) : 0,
    itemId: typeof item.itemId === 'string' ? item.itemId : '',
    marks: Number.isFinite(Number(item.marks)) ? Number(item.marks) : 1,
    promptText: typeof item.promptText === 'string' ? item.promptText : '',
    inputSpec: safeInputSpec(item.inputSpec),
    reflectionPrompt: typeof item.reflectionPrompt === 'string' ? item.reflectionPrompt : '',
    checkLine: typeof item.checkLine === 'string' ? item.checkLine : '',
    replay: isPlainObject(item.replay)
      ? {
        contentReleaseId: item.replay.contentReleaseId === GRAMMAR_CONTENT_RELEASE_ID ? GRAMMAR_CONTENT_RELEASE_ID : '',
        templateId: typeof item.replay.templateId === 'string' ? item.replay.templateId : '',
        seed: Number.isFinite(Number(item.replay.seed)) ? Number(item.replay.seed) : 0,
        itemId: typeof item.replay.itemId === 'string' ? item.replay.itemId : '',
        conceptIds: Array.isArray(item.replay.conceptIds) ? item.replay.conceptIds.filter(Boolean).map(String) : [],
        questionType: typeof item.replay.questionType === 'string' ? item.replay.questionType : '',
      }
      : null,
  };
}

function safeMiniTestQuestion(entry, index, currentIndex, { includeItem = false, includeMarked = false } = {}) {
  const item = safeCurrentItem(entry?.item);
  const output = {
    index: Number.isFinite(Number(entry?.index)) ? Number(entry.index) : index,
    itemId: item?.itemId || '',
    templateId: item?.templateId || '',
    templateLabel: item?.templateLabel || '',
    questionType: item?.questionType || '',
    marks: Number.isFinite(Number(item?.marks)) ? Number(item.marks) : 1,
    answered: Boolean(entry?.answered),
    current: index === currentIndex,
    response: isPlainObject(entry?.response) ? cloneSerialisable(entry.response) : {},
    savedAt: Number.isFinite(Number(entry?.savedAt)) ? Number(entry.savedAt) : 0,
  };
  if (includeItem) output.item = item;
  if (includeMarked && isPlainObject(entry?.marked)) {
    const result = isPlainObject(entry.marked.result) ? entry.marked.result : {};
    output.marked = {
      response: isPlainObject(entry.marked.response) ? cloneSerialisable(entry.marked.response) : {},
      result: {
        correct: Boolean(result.correct),
        score: Number.isFinite(Number(result.score)) ? Number(result.score) : 0,
        maxScore: Number.isFinite(Number(result.maxScore)) ? Number(result.maxScore) : output.marks,
        misconception: typeof result.misconception === 'string' ? result.misconception : null,
        feedbackShort: typeof result.feedbackShort === 'string' ? result.feedbackShort : '',
        feedbackLong: typeof result.feedbackLong === 'string' ? result.feedbackLong : '',
        answerText: typeof result.answerText === 'string' ? result.answerText : '',
        minimalHint: typeof result.minimalHint === 'string' ? result.minimalHint : '',
      },
    };
  }
  return output;
}

function safeMiniTest(miniTest, now = Date.now()) {
  if (!isPlainObject(miniTest)) return null;
  const questions = Array.isArray(miniTest.questions) ? miniTest.questions : [];
  const currentIndex = Math.min(
    Math.max(0, Math.floor(Number(miniTest.currentIndex) || 0)),
    Math.max(0, questions.length - 1),
  );
  const expiresAt = Number.isFinite(Number(miniTest.expiresAt)) ? Number(miniTest.expiresAt) : 0;
  const nowTs = asTs(now, Date.now());
  return {
    setSize: Number.isFinite(Number(miniTest.setSize)) ? Number(miniTest.setSize) : questions.length,
    startedAt: asTs(miniTest.startedAt, 0),
    timeLimitMs: Number.isFinite(Number(miniTest.timeLimitMs)) ? Number(miniTest.timeLimitMs) : 0,
    expiresAt,
    remainingMs: expiresAt ? Math.max(0, expiresAt - nowTs) : 0,
    currentIndex,
    finished: Boolean(miniTest.finished),
    timedOut: Boolean(miniTest.timedOut),
    questions: questions.map((entry, index) => safeMiniTestQuestion(entry, index, currentIndex, {
      includeItem: true,
    })),
  };
}

function safeMiniTestReview(review) {
  if (!isPlainObject(review)) return null;
  const questions = Array.isArray(review.questions) ? review.questions : [];
  return {
    setSize: Number.isFinite(Number(review.setSize)) ? Number(review.setSize) : questions.length,
    timeLimitMs: Number.isFinite(Number(review.timeLimitMs)) ? Number(review.timeLimitMs) : 0,
    startedAt: asTs(review.startedAt, 0),
    finishedAt: asTs(review.finishedAt, 0),
    questions: questions.map((entry, index) => safeMiniTestQuestion(entry, index, -1, {
      includeItem: true,
      includeMarked: true,
    })),
  };
}

function safeGoal(goal, now = Date.now()) {
  if (!isPlainObject(goal)) return { type: 'questions' };
  const type = ['questions', 'timed', 'due'].includes(goal.type) ? goal.type : 'questions';
  const expiresAt = asTs(goal.expiresAt, 0);
  const nowTs = asTs(now, Date.now());
  const output = {
    type,
    targetCount: Number.isFinite(Number(goal.targetCount)) ? Number(goal.targetCount) : 0,
    startedAt: asTs(goal.startedAt, 0),
  };
  if (type === 'timed') {
    output.timeLimitMs = Number.isFinite(Number(goal.timeLimitMs)) ? Number(goal.timeLimitMs) : 0;
    output.expiresAt = expiresAt;
    output.remainingMs = expiresAt ? Math.max(0, expiresAt - nowTs) : 0;
  }
  if (type === 'due') {
    output.initialDueCount = Number.isFinite(Number(goal.initialDueCount)) ? Number(goal.initialDueCount) : 0;
  }
  return output;
}

function safeSummary(summary) {
  if (!isPlainObject(summary)) return null;
  const output = {
    sessionId: typeof summary.sessionId === 'string' ? summary.sessionId : '',
    mode: typeof summary.mode === 'string' ? summary.mode : 'smart',
    startedAt: asTs(summary.startedAt, 0),
    completedAt: asTs(summary.completedAt, 0),
    answered: Number.isFinite(Number(summary.answered)) ? Number(summary.answered) : 0,
    correct: Number.isFinite(Number(summary.correct)) ? Number(summary.correct) : 0,
    totalScore: Number.isFinite(Number(summary.totalScore)) ? Number(summary.totalScore) : 0,
    totalMarks: Number.isFinite(Number(summary.totalMarks)) ? Number(summary.totalMarks) : 0,
    targetCount: Number.isFinite(Number(summary.targetCount)) ? Number(summary.targetCount) : 0,
    goal: safeGoal(summary.goal, summary.completedAt),
  };
  if (Object.prototype.hasOwnProperty.call(summary, 'timedOut')) {
    output.timedOut = Boolean(summary.timedOut);
  }
  const miniTestReview = safeMiniTestReview(summary.miniTestReview);
  if (miniTestReview) output.miniTestReview = miniTestReview;
  return output;
}

function conceptById(conceptId) {
  return GRAMMAR_CONCEPTS.find((concept) => concept.id === conceptId) || null;
}

function conceptSupportSummary(concept) {
  if (!concept) return null;
  return {
    id: concept.id,
    name: concept.name,
    domain: concept.domain,
    summary: concept.summary,
  };
}

function normaliseComparableText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKC')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function addCurrentSurfaceText(texts, value) {
  const normalised = normaliseComparableText(value);
  if (normalised.length >= 4) texts.add(normalised);
}

function addChoiceSurfaceTexts(texts, options) {
  if (!Array.isArray(options)) return;
  for (const option of options) {
    if (Array.isArray(option)) {
      addCurrentSurfaceText(texts, option[0]);
      addCurrentSurfaceText(texts, option[1]);
    } else if (isPlainObject(option)) {
      addCurrentSurfaceText(texts, option.value);
      addCurrentSurfaceText(texts, option.label);
    } else {
      addCurrentSurfaceText(texts, option);
    }
  }
}

function addInputSurfaceTexts(texts, inputSpec) {
  if (!isPlainObject(inputSpec)) return;
  addCurrentSurfaceText(texts, inputSpec.label);
  addChoiceSurfaceTexts(texts, inputSpec.options);

  if (Array.isArray(inputSpec.rows)) {
    for (const row of inputSpec.rows) {
      if (!isPlainObject(row)) continue;
      addCurrentSurfaceText(texts, row.label);
      addChoiceSurfaceTexts(texts, row.options);
    }
  }

  if (Array.isArray(inputSpec.fields)) {
    for (const field of inputSpec.fields) {
      if (!isPlainObject(field)) continue;
      addCurrentSurfaceText(texts, field.label);
      addChoiceSurfaceTexts(texts, field.options);
    }
  }
}

function currentItemSurfaceTexts(item) {
  const texts = new Set();
  if (!isPlainObject(item)) return texts;
  addCurrentSurfaceText(texts, item.promptText);
  addCurrentSurfaceText(texts, item.reflectionPrompt);
  addCurrentSurfaceText(texts, item.checkLine);
  if (Array.isArray(item.solutionLines)) {
    for (const line of item.solutionLines) addCurrentSurfaceText(texts, line);
  }
  addInputSurfaceTexts(texts, item.inputSpec);
  return texts;
}

function overlapsCurrentItemSurface(value, currentTexts) {
  const candidate = normaliseComparableText(value);
  if (candidate.length < 4) return false;
  for (const current of currentTexts) {
    if (candidate === current) return true;
    if (current.length >= 12 && candidate.includes(current)) return true;
    if (current.includes(candidate)) return true;
  }
  return false;
}

function safeGuidanceText(value, currentTexts) {
  if (typeof value !== 'string') return '';
  return overlapsCurrentItemSurface(value, currentTexts) ? '' : value;
}

function safeWorkedExample(concept, currentTexts = new Set()) {
  const worked = isPlainObject(concept?.worked) ? concept.worked : {};
  if (!worked.prompt && !worked.answer && !worked.why) return null;
  const prompt = safeGuidanceText(worked.prompt, currentTexts);
  const exampleResponse = safeGuidanceText(worked.answer, currentTexts);
  const why = safeGuidanceText(worked.why, currentTexts);
  if (!prompt && !exampleResponse && !why) return null;
  const model = {};
  if (prompt) model.prompt = prompt;
  if (exampleResponse) model.exampleResponse = exampleResponse;
  if (why) model.why = why;
  return model;
}

function safeContrast(concept, currentTexts = new Set()) {
  const contrast = isPlainObject(concept?.contrast) ? concept.contrast : {};
  if (!contrast.good && !contrast.nearMiss && !contrast.why) return null;
  const secureExample = safeGuidanceText(contrast.good, currentTexts);
  const nearMiss = safeGuidanceText(contrast.nearMiss, currentTexts);
  const why = safeGuidanceText(contrast.why, currentTexts);
  if (!secureExample && !nearMiss && !why) return null;
  const model = {};
  if (secureExample) model.secureExample = secureExample;
  if (nearMiss) model.nearMiss = nearMiss;
  if (why) model.why = why;
  return model;
}

function supportGuidanceForSession(session) {
  const level = Math.max(0, Number(session?.supportLevel) || 0);
  if (!level) return null;
  const currentTexts = currentItemSurfaceTexts(session?.currentItem);
  const conceptIds = Array.isArray(session?.currentItem?.skillIds)
    ? session.currentItem.skillIds.filter(Boolean).map(String)
    : [];
  const concepts = conceptIds
    .map(conceptById)
    .filter(Boolean);
  const primary = concepts[0] || null;
  const summaries = concepts
    .map(conceptSupportSummary)
    .filter(Boolean);

  if (level >= 2) {
    return {
      kind: 'worked',
      level,
      title: 'Worked example',
      concepts: summaries,
      workedExample: safeWorkedExample(primary, currentTexts),
      notices: Array.isArray(primary?.notices) ? primary.notices.slice(0, 2) : [],
    };
  }

  return {
    kind: 'faded',
    level,
    title: 'Faded guidance',
    concepts: summaries,
    summary: typeof primary?.summary === 'string' ? primary.summary : '',
    notices: Array.isArray(primary?.notices) ? primary.notices.slice(0, 3) : [],
    contrast: safeContrast(primary, currentTexts),
  };
}

function safeSession(session, now = Date.now()) {
  if (!isPlainObject(session)) return null;
  return {
    id: typeof session.id === 'string' ? session.id : '',
    type: typeof session.type === 'string' ? session.type : 'practice',
    mode: typeof session.mode === 'string' ? session.mode : 'smart',
    focusConceptId: typeof session.focusConceptId === 'string' ? session.focusConceptId : '',
    startedAt: Number.isFinite(Number(session.startedAt)) ? Number(session.startedAt) : 0,
    targetCount: Number.isFinite(Number(session.targetCount)) ? Number(session.targetCount) : 0,
    answered: Number.isFinite(Number(session.answered)) ? Number(session.answered) : 0,
    correct: Number.isFinite(Number(session.correct)) ? Number(session.correct) : 0,
    totalScore: Number.isFinite(Number(session.totalScore)) ? Number(session.totalScore) : 0,
    totalMarks: Number.isFinite(Number(session.totalMarks)) ? Number(session.totalMarks) : 0,
    currentIndex: Number.isFinite(Number(session.currentIndex)) ? Number(session.currentIndex) : 0,
    currentItem: safeCurrentItem(session.currentItem),
    goal: safeGoal(session.goal, now),
    miniTest: safeMiniTest(session.miniTest, now),
    repair: isPlainObject(session.repair)
      ? {
        retryingCurrent: Boolean(session.repair.retryingCurrent),
        similarProblems: Number.isFinite(Number(session.repair.similarProblems)) ? Number(session.repair.similarProblems) : 0,
        requestedFadedSupport: Boolean(session.repair.requestedFadedSupport),
        workedSolutionShown: Boolean(session.repair.workedSolutionShown),
      }
      : null,
    supportLevel: Number.isFinite(Number(session.supportLevel)) ? Math.max(0, Number(session.supportLevel)) : 0,
    supportGuidance: supportGuidanceForSession(session),
    serverAuthority: session.serverAuthority === GRAMMAR_SERVER_AUTHORITY ? GRAMMAR_SERVER_AUTHORITY : null,
  };
}

// U6 confidence taxonomy — five labels driven by strength, streak, recent
// misses, and spacing. See `shared/grammar/confidence.js` for the single
// source of truth (U8 lifted the derivation + label array + status machine
// into that shared module so client and Worker can never drift).
//
//   emerging     <= 2 attempts (thin evidence, show as "Emerging")
//   needs-repair weak status OR >= 2 recent misses
//   secure       strength >= 0.82 AND correctStreak >= 3 AND intervalDays >= 7
//   consolidating strength >= 0.82 AND correctStreak >= 3 AND intervalDays < 7
//                (heavy same-week practice, not yet spaced)
//   building     everything else

function intervalDaysFromNode(node) {
  if (!node) return 0;
  if (Number.isFinite(Number(node.intervalDays))) return Number(node.intervalDays);
  return 0;
}

function recentWindow(recentAttempts) {
  return Array.isArray(recentAttempts) ? recentAttempts.slice(-GRAMMAR_RECENT_ATTEMPT_HORIZON) : [];
}

function recentMissCountForConcept(recentAttempts, conceptId) {
  if (!conceptId) return 0;
  let count = 0;
  for (const attempt of recentWindow(recentAttempts)) {
    const conceptIds = Array.isArray(attempt?.conceptIds) ? attempt.conceptIds : [];
    const result = isPlainObject(attempt?.result) ? attempt.result : {};
    if (conceptIds.includes(conceptId) && result.correct === false) count += 1;
  }
  return count;
}

function recentMissCountForQuestionType(recentAttempts, questionType) {
  if (!questionType) return 0;
  let count = 0;
  for (const attempt of recentWindow(recentAttempts)) {
    const result = isPlainObject(attempt?.result) ? attempt.result : {};
    if (attempt?.questionType === questionType && result.correct === false) count += 1;
  }
  return count;
}

// Aligned to GRAMMAR_RECENT_ATTEMPT_HORIZON so distinctTemplates and
// recentMisses are directly comparable "recent" signals.
function distinctTemplatesFor(recentAttempts, matcher) {
  const seen = new Set();
  for (const attempt of recentWindow(recentAttempts)) {
    if (matcher(attempt) && typeof attempt?.templateId === 'string' && attempt.templateId) {
      seen.add(attempt.templateId);
    }
  }
  return seen.size;
}

function conceptMap(state, now) {
  const mastery = isPlainObject(state?.mastery?.concepts) ? state.mastery.concepts : {};
  const recentAttempts = Array.isArray(state?.recentAttempts) ? state.recentAttempts : [];
  return GRAMMAR_CONCEPTS.map((concept) => {
    const node = mastery[concept.id] || null;
    const status = grammarConceptStatus(node, now);
    const attempts = Number(node?.attempts) || 0;
    const strength = Number.isFinite(Number(node?.strength)) ? Number(node.strength) : 0.25;
    const correctStreak = Number(node?.correctStreak) || 0;
    const intervalDays = intervalDaysFromNode(node);
    const recentMisses = recentMissCountForConcept(recentAttempts, concept.id);
    const distinctTemplates = distinctTemplatesFor(recentAttempts, (attempt) =>
      Array.isArray(attempt?.conceptIds) && attempt.conceptIds.includes(concept.id));
    const confidenceLabel = deriveGrammarConfidence({
      status, attempts, strength, correctStreak, intervalDays, recentMisses,
    });
    return {
      id: concept.id,
      name: concept.name,
      domain: concept.domain,
      summary: concept.summary,
      punctuationForGrammar: Boolean(concept.punctuationForGrammar),
      status,
      attempts,
      correct: Number(node?.correct) || 0,
      wrong: Number(node?.wrong) || 0,
      strength,
      dueAt: Number(node?.dueAt) || 0,
      correctStreak,
      intervalDays,
      // U6 confidence projection — never mutated into state; derived per read.
      confidence: {
        label: confidenceLabel,
        sampleSize: attempts,
        intervalDays,
        distinctTemplates,
        recentMisses,
      },
    };
  });
}

function statsFromConcepts(concepts) {
  const counts = { total: concepts.length, new: 0, learning: 0, weak: 0, due: 0, secured: 0 };
  for (const concept of concepts) {
    counts[concept.status] = (counts[concept.status] || 0) + 1;
  }
  // Phase 4 U1: internal template counts are surfaced under `contentStats` so
  // the client read-model contract never exposes a `templates` key. The
  // forbidden-key universal floor bans `templates` on every authenticated
  // response surface; renaming the emit here is the Worker-side half of the
  // two-layer fix (the client normaliser's allow-list picker is the other).
  return {
    concepts: counts,
    contentStats: {
      total: GRAMMAR_TEMPLATE_METADATA.length,
      selectedResponse: GRAMMAR_TEMPLATE_METADATA.filter((template) => template.isSelectedResponse).length,
      constructedResponse: GRAMMAR_TEMPLATE_METADATA.filter((template) => !template.isSelectedResponse).length,
    },
  };
}

function asTs(value, fallback = 0) {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function accuracyPercent(correct, wrong) {
  const total = Math.max(0, Number(correct) || 0) + Math.max(0, Number(wrong) || 0);
  if (!total) return null;
  return Math.round((Math.max(0, Number(correct) || 0) / total) * 100);
}

function humanLabel(id) {
  return String(id || '')
    .replace(/_confusion$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function progressSnapshotFromConcepts(concepts) {
  const correct = concepts.reduce((sum, concept) => sum + (Number(concept.correct) || 0), 0);
  const wrong = concepts.reduce((sum, concept) => sum + (Number(concept.wrong) || 0), 0);
  return {
    subjectId: 'grammar',
    totalConcepts: concepts.length,
    trackedConcepts: concepts.filter((concept) => (Number(concept.attempts) || 0) > 0).length,
    securedConcepts: concepts.filter((concept) => concept.status === 'secured').length,
    dueConcepts: concepts.filter((concept) => concept.status === 'due').length,
    weakConcepts: concepts.filter((concept) => concept.status === 'weak').length,
    untouchedConcepts: concepts.filter((concept) => concept.status === 'new').length,
    accuracyPercent: accuracyPercent(correct, wrong),
  };
}

function misconceptionPatternsFromState(state) {
  const misconceptions = isPlainObject(state?.misconceptions) ? state.misconceptions : {};
  return Object.entries(misconceptions)
    .map(([id, rawEntry]) => {
      const entry = isPlainObject(rawEntry) ? rawEntry : {};
      return {
        subjectId: 'grammar',
        id,
        label: `${humanLabel(id)} pattern`,
        count: Math.max(0, Math.floor(Number(entry.count) || 0)),
        lastSeenAt: asTs(entry.lastSeenAt, 0),
        source: 'grammar-state',
      };
    })
    .filter((entry) => entry.count > 0)
    .sort((a, b) => (b.count - a.count) || (b.lastSeenAt - a.lastSeenAt))
    .slice(0, 5);
}

function questionTypeSummaryFromState(state, now) {
  const questionTypes = isPlainObject(state?.mastery?.questionTypes) ? state.mastery.questionTypes : {};
  const recentAttempts = Array.isArray(state?.recentAttempts) ? state.recentAttempts : [];
  return Object.entries(questionTypes)
    .map(([id, rawNode]) => {
      const node = rawNode || {};
      const correct = Number(node.correct) || 0;
      const wrong = Number(node.wrong) || 0;
      const attempts = Number(node.attempts) || 0;
      const status = grammarConceptStatus(node, now);
      const strength = Number.isFinite(Number(node.strength)) ? Number(node.strength) : 0.25;
      const correctStreak = Number(node.correctStreak) || 0;
      const intervalDays = intervalDaysFromNode(node);
      const recentMisses = recentMissCountForQuestionType(recentAttempts, id);
      const distinctTemplates = distinctTemplatesFor(recentAttempts, (attempt) => attempt?.questionType === id);
      const confidenceLabel = deriveGrammarConfidence({
        status, attempts, strength, correctStreak, intervalDays, recentMisses,
      });
      return {
        subjectId: 'grammar',
        id,
        label: GRAMMAR_QUESTION_TYPES[id] || humanLabel(id),
        status,
        attempts,
        correct,
        wrong,
        accuracyPercent: accuracyPercent(correct, wrong),
        strength,
        dueAt: asTs(node.dueAt, 0),
        intervalDays,
        confidence: {
          label: confidenceLabel,
          sampleSize: attempts,
          intervalDays,
          distinctTemplates,
          recentMisses,
        },
      };
    })
    .filter((entry) => entry.attempts > 0)
    .sort((a, b) => {
      const troubleDelta = (b.wrong - a.wrong) || (Number(a.accuracyPercent ?? 101) - Number(b.accuracyPercent ?? 101));
      if (troubleDelta) return troubleDelta;
      return String(a.label).localeCompare(String(b.label));
    })
    .slice(0, 6);
}

function recentActivityFromAttempts(attempts = []) {
  return (Array.isArray(attempts) ? attempts : [])
    .slice(-8)
    .reverse()
    .map((attempt) => {
      const result = isPlainObject(attempt?.result) ? attempt.result : {};
      const supportUsed = typeof attempt?.supportUsed === 'string' ? attempt.supportUsed : 'none';
      const supportLevelAtScoring = Number.isFinite(Number(attempt?.supportLevelAtScoring))
        ? Math.max(0, Math.min(2, Number(attempt.supportLevelAtScoring)))
        : Math.max(0, Math.min(2, Number(attempt?.supportLevel) || 0));
      return {
        subjectId: 'grammar',
        templateId: typeof attempt?.templateId === 'string' ? attempt.templateId : '',
        itemId: typeof attempt?.itemId === 'string' ? attempt.itemId : '',
        questionType: typeof attempt?.questionType === 'string' ? attempt.questionType : '',
        questionTypeLabel: GRAMMAR_QUESTION_TYPES[attempt?.questionType] || humanLabel(attempt?.questionType),
        conceptIds: Array.isArray(attempt?.conceptIds) ? attempt.conceptIds.filter(Boolean).map(String) : [],
        correct: Boolean(result.correct),
        score: Number(result.score) || 0,
        maxScore: Number(result.maxScore) || 1,
        misconception: typeof result.misconception === 'string' ? result.misconception : '',
        // U3 item-level support attribution. Older attempts have been
        // normalised at load time so these fields are always present.
        firstAttemptIndependent: Boolean(attempt?.firstAttemptIndependent),
        supportUsed,
        supportLevelAtScoring,
        createdAt: asTs(attempt?.createdAt, 0),
      };
    });
}

function evidenceSummary({ concepts, patterns }) {
  const snapshot = progressSnapshotFromConcepts(concepts);
  return [
    {
      id: 'retrieval',
      label: 'Retrieval evidence',
      detail: `${snapshot.trackedConcepts}/${snapshot.totalConcepts} concepts have answer evidence.`,
    },
    {
      id: 'spacing',
      label: 'Spaced review',
      detail: `${snapshot.dueConcepts} due · ${snapshot.weakConcepts} weak · ${snapshot.untouchedConcepts} untouched.`,
    },
    {
      id: 'misconceptions',
      label: 'Misconception repair',
      detail: patterns.length ? `${patterns[0].label} is the strongest current signal.` : 'No recurring misconception pattern recorded yet.',
    },
  ];
}

function safeAiTextList(value, limit = 5) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function safeAiEnrichment(raw) {
  if (!isPlainObject(raw)) return null;
  const kind = ['explanation', 'revision-card', 'parent-summary'].includes(raw.kind)
    ? raw.kind
    : 'explanation';
  const status = raw.status === 'ready' ? 'ready' : 'failed';
  const output = {
    kind,
    status,
    nonScored: raw.nonScored !== false,
    generatedAt: asTs(raw.generatedAt, 0),
  };
  if (raw.source === 'server-validated-ai') output.source = raw.source;
  if (isPlainObject(raw.error)) {
    output.error = {
      code: typeof raw.error.code === 'string' ? raw.error.code : 'grammar_ai_enrichment_failed',
      message: typeof raw.error.message === 'string' ? raw.error.message : 'Grammar enrichment is unavailable.',
    };
  }
  if (isPlainObject(raw.concept)) {
    output.concept = {
      id: typeof raw.concept.id === 'string' ? raw.concept.id : '',
      name: typeof raw.concept.name === 'string' ? raw.concept.name : '',
      domain: typeof raw.concept.domain === 'string' ? raw.concept.domain : '',
    };
  } else {
    output.concept = null;
  }
  if (isPlainObject(raw.explanation)) {
    output.explanation = {
      title: typeof raw.explanation.title === 'string' ? raw.explanation.title : '',
      body: typeof raw.explanation.body === 'string' ? raw.explanation.body : '',
      keyPoints: safeAiTextList(raw.explanation.keyPoints, 5),
    };
  }
  output.revisionCards = (Array.isArray(raw.revisionCards) ? raw.revisionCards : [])
    .filter(isPlainObject)
    .map((card) => ({
      title: typeof card.title === 'string' ? card.title : '',
      front: typeof card.front === 'string' ? card.front : '',
      back: typeof card.back === 'string' ? card.back : '',
    }))
    .filter((card) => card.front || card.back)
    .slice(0, 4);
  output.parentSummary = isPlainObject(raw.parentSummary)
    ? {
      title: typeof raw.parentSummary.title === 'string' ? raw.parentSummary.title : '',
      body: typeof raw.parentSummary.body === 'string' ? raw.parentSummary.body : '',
      nextSteps: safeAiTextList(raw.parentSummary.nextSteps, 4),
    }
    : null;
  output.revisionDrills = (Array.isArray(raw.revisionDrills) ? raw.revisionDrills : [])
    .filter(isPlainObject)
    .map((drill) => ({
      templateId: typeof drill.templateId === 'string' ? drill.templateId : '',
      label: typeof drill.label === 'string' ? drill.label : '',
      conceptIds: Array.isArray(drill.conceptIds) ? drill.conceptIds.filter(Boolean).map(String) : [],
      questionType: typeof drill.questionType === 'string' ? drill.questionType : '',
      deterministic: drill.deterministic !== false,
    }))
    .filter((drill) => drill.templateId)
    .slice(0, 6);
  output.notices = safeAiTextList(raw.notices, 4);
  return output;
}

function capabilityMetadata() {
  const modes = {
    learn: { label: 'Learn a concept', detail: 'Focused retrieval on one concept at a time.' },
    smart: { label: 'Smart mixed review', detail: 'Worker-selected review across Grammar concepts.' },
    satsset: { label: 'KS2-style mini-set', detail: 'A short mixed set with SATs-friendly question shapes.' },
    trouble: { label: 'Weak concepts drill', detail: 'Targets the weakest Grammar concepts with retry pressure.' },
    surgery: { label: 'Sentence surgery', detail: 'Fix and rewrite sentence-level Grammar errors.' },
    builder: { label: 'Sentence builder', detail: 'Build and rewrite sentences from structured prompts.' },
    worked: { label: 'Worked examples', detail: 'Practise with a model example before answering.' },
    faded: { label: 'Faded guidance', detail: 'Practise with prompts and contrasts, but no answer to the current item.' },
  };
  return {
    enabledModes: Array.from(GRAMMAR_ENABLED_MODES).map((id) => ({ id, ...(modes[id] || { label: id }) })),
    lockedModes: Array.from(GRAMMAR_LOCKED_MODES).map((id) => ({ id, label: modes[id]?.label || id, reason: 'coming-next' })),
    aiEnrichment: {
      enabled: true,
      nonScored: true,
      kinds: ['explanation', 'revision-card', 'parent-summary'],
    },
  };
}

export function buildGrammarReadModel({
  learnerId,
  state,
  projections = null,
  now = Date.now(),
  aiEnrichment = null,
} = {}) {
  const safeState = cloneSerialisable(state) || {};
  const concepts = conceptMap(safeState, now);
  const misconceptionPatterns = misconceptionPatternsFromState(safeState);
  const recentAttempts = Array.isArray(safeState.recentAttempts) ? safeState.recentAttempts.slice(-12).map(cloneSerialisable) : [];
  return {
    subjectId: 'grammar',
    learnerId,
    version: 1,
    authority: GRAMMAR_SERVER_AUTHORITY,
    content: {
      releaseId: safeState.contentReleaseId === GRAMMAR_CONTENT_RELEASE_ID
        ? GRAMMAR_CONTENT_RELEASE_ID
        : '',
      conceptCount: GRAMMAR_CONCEPTS.length,
      templateCount: GRAMMAR_TEMPLATE_METADATA.length,
      questionTypes: cloneSerialisable(GRAMMAR_QUESTION_TYPES) || {},
    },
    phase: typeof safeState.phase === 'string' ? safeState.phase : 'dashboard',
    awaitingAdvance: Boolean(safeState.awaitingAdvance),
    session: safeSession(safeState.session, now),
    feedback: isPlainObject(safeState.feedback) ? cloneSerialisable(safeState.feedback) : null,
    summary: safeSummary(safeState.summary),
    prefs: isPlainObject(safeState.prefs) ? cloneSerialisable(safeState.prefs) : {},
    stats: statsFromConcepts(concepts),
    analytics: {
      concepts,
      misconceptionCounts: isPlainObject(safeState.misconceptions) ? cloneSerialisable(safeState.misconceptions) : {},
      misconceptionPatterns,
      questionTypeSummary: questionTypeSummaryFromState(safeState, now),
      progressSnapshot: progressSnapshotFromConcepts(concepts),
      evidenceSummary: evidenceSummary({ concepts, patterns: misconceptionPatterns }),
      recentAttempts,
      recentActivity: recentActivityFromAttempts(recentAttempts),
    },
    capabilities: capabilityMetadata(),
    aiEnrichment: safeAiEnrichment(aiEnrichment || safeState.aiEnrichment),
    transferLane: grammarTransferLaneReadModel(safeState),
    projections: projections ? cloneSerialisable(projections) : null,
    error: typeof safeState.error === 'string' ? safeState.error : '',
  };
}

// U7 non-scored transfer writing lane read-model projection. The prompt
// catalogue is delivered from the Worker via this read model so the React
// surface does not import worker/src/subjects/grammar/transfer-prompts.js
// directly. Saved evidence is emitted redacted (latest + bounded history per
// prompt) and never derived from scored state.
function grammarTransferLaneReadModel(state) {
  const evidenceMap = isPlainObject(state?.transferEvidence) ? state.transferEvidence : {};
  return {
    mode: 'non-scored',
    prompts: GRAMMAR_TRANSFER_PROMPTS.map(grammarTransferPromptSummary),
    limits: {
      maxPrompts: GRAMMAR_TRANSFER_MAX_PROMPTS_LIMIT,
      historyPerPrompt: GRAMMAR_TRANSFER_HISTORY_PER_PROMPT_LIMIT,
      writingCapChars: GRAMMAR_TRANSFER_WRITING_CAP_LIMIT,
    },
    evidence: Object.entries(evidenceMap)
      .map(([promptId, entry]) => {
        const base = isPlainObject(entry) ? entry : {};
        const latest = isPlainObject(base.latest) ? base.latest : null;
        const history = Array.isArray(base.history) ? base.history : [];
        return {
          promptId,
          latest: latest ? {
            writing: typeof latest.writing === 'string' ? latest.writing : '',
            selfAssessment: Array.isArray(latest.selfAssessment) ? latest.selfAssessment.slice() : [],
            savedAt: asTs(latest.savedAt, 0),
            source: 'transfer-lane',
          } : null,
          history: history.map((snapshot) => ({
            writing: typeof snapshot?.writing === 'string' ? snapshot.writing : '',
            savedAt: asTs(snapshot?.savedAt, 0),
            source: 'transfer-lane',
          })),
          updatedAt: asTs(base.updatedAt, 0),
        };
      })
      .filter((entry) => entry.latest || entry.history.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt),
  };
}
