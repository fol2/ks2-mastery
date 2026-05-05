import {
  READING_CONTENT_RELEASE_ID,
  READING_MODES,
  READING_PASSAGES,
  READING_TEST_PAPERS,
  READING_SKILLS,
  readingContentSummary,
  readingPassageMap,
  readingQuestionRefMap,
} from '../../../../shared/reading/content.js';

const PASSAGE_MAP = readingPassageMap();
const QUESTION_REF_MAP = readingQuestionRefMap();
const SKILL_IDS = Object.freeze(Object.keys(READING_SKILLS));
const PUNCTUATION_SKILL_IDS = new Set(['P1', 'P2', 'P3', 'P4']);

const DEFAULT_PREFS = Object.freeze({
  mode: 'smart',
  focusSkillId: '',
  genre: '',
  difficulty: '',
  viewMode: 'one',
  paperId: 'random',
  showParagraphNumbers: true,
});

const MINIMAL_HINTS = Object.freeze({
  '2a': 'Reread the sentence with the word in it. Try a meaning that keeps the whole sentence sensible.',
  '2b': 'Go back to the exact place in the text and hunt for the detail, not just the general topic.',
  '2c': 'Step back from single details. What is the biggest idea the paragraph or section is really about?',
  '2d': 'Answer the idea first, then prove it with a short phrase from the text.',
  '2e': 'Use clues from what has just happened or what the character has learned.',
  '2f': 'Think about how the writer moves from one part of the text to the next.',
  '2g': 'Name the word or phrase, then explain the picture, feeling or effect it creates.',
  '2h': 'Make sure you mention both things being compared, not just one.',
  P1: 'Use the punctuation to chunk the sentence into sense groups before you decide what it is doing.',
  P2: 'Let the punctuation guide the voice: who is speaking, and what tone does the end punctuation suggest?',
  P3: 'Notice what extra information is tucked inside the dashes, brackets or commas.',
  P4: 'Ask what the punctuation is preparing for or linking: a list, an explanation, or two closely connected ideas.',
});

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function uid(prefix = 'reading') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function normaliseText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenise(value) {
  return normaliseText(value).split(' ').filter(Boolean);
}

function hasStem(tokens, stem) {
  const s = String(stem || '').toLowerCase();
  return tokens.some((token) => token === s || token.startsWith(s));
}

function groupMatches(tokens, group) {
  return (group || []).every((stem) => String(stem || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => hasStem(tokens, part)));
}

export function checkMatches(text, check) {
  if (!check) return false;
  const norm = normaliseText(text);
  const tokens = tokenise(text);
  if (!norm) return false;
  if (check.exactAny && check.exactAny.some((answer) => {
    const candidate = normaliseText(answer);
    return norm === candidate || norm.includes(candidate) || candidate.includes(norm);
  })) return true;
  if (check.containsAny && check.containsAny.some((answer) => norm.includes(normaliseText(answer)))) return true;
  if (check.keywordAny && check.keywordAny.some((group) => groupMatches(tokens, group))) return true;
  return false;
}

function overlapRatio(a, b) {
  const setA = new Set(tokenise(a).filter((token) => token.length > 2));
  const setB = new Set(tokenise(b).filter((token) => token.length > 2));
  if (!setA.size || !setB.size) return 0;
  let overlap = 0;
  for (const token of setA) if (setB.has(token)) overlap += 1;
  return overlap / Math.min(setA.size, setB.size);
}

function evidenceMatches(text, check) {
  if (!text || !check) return false;
  if (checkMatches(text, check)) return true;
  if (check.containsAny && check.containsAny.some((snippet) => overlapRatio(text, snippet) >= 0.55)) return true;
  return false;
}

function scoreRubric(text, rubric, maxScore) {
  let score = 0;
  const matched = [];
  for (const point of rubric || []) {
    if (checkMatches(text, point.check)) {
      score += 1;
      matched.push(point.label || 'Point');
    }
  }
  return { score: Math.min(maxScore || score, score), matched };
}

function setEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function isResponseNonEmpty(value) {
  if (Array.isArray(value)) return value.some(isResponseNonEmpty);
  if (value && typeof value === 'object') return Object.values(value).some(isResponseNonEmpty);
  return String(value == null ? '' : value).trim() !== '';
}

function defaultNode() {
  return {
    attempts: 0,
    correct: 0,
    wrong: 0,
    strength: 0.25,
    intervalDays: 0,
    dueAt: 0,
    lastSeenAt: null,
    lastWrongAt: null,
    correctStreak: 0,
  };
}

function defaultData() {
  return {
    version: 1,
    contentReleaseId: READING_CONTENT_RELEASE_ID,
    prefs: { ...DEFAULT_PREFS },
    skills: {},
    passages: {},
    questions: {},
    genres: {},
    qtypes: {},
    misconceptions: {},
    retryQueue: [],
    events: [],
    sessions: [],
    lastPracticeDay: null,
    streakDays: 0,
    securedSkillKeys: [],
  };
}

function defaultState() {
  return {
    version: 1,
    subjectId: 'reading',
    releaseId: READING_CONTENT_RELEASE_ID,
    phase: 'setup',
    session: null,
    feedback: null,
    summary: null,
    prefs: { ...DEFAULT_PREFS },
    pendingCommand: '',
    error: '',
    updatedAt: Date.now(),
  };
}

function normalisePrefs(raw = {}) {
  const mode = READING_MODES.includes(raw.mode) ? raw.mode : DEFAULT_PREFS.mode;
  const focusSkillId = SKILL_IDS.includes(raw.focusSkillId || raw.skillId) ? (raw.focusSkillId || raw.skillId) : '';
  const genre = ['fiction', 'non-fiction', 'poetry'].includes(raw.genre) ? raw.genre : '';
  const difficulty = ['1', '2', '3', '4', '5'].includes(String(raw.difficulty || '')) ? String(raw.difficulty) : '';
  const viewMode = raw.viewMode === 'list' ? 'list' : 'one';
  const paperId = raw.paperId && (raw.paperId === 'random' || READING_TEST_PAPERS.some((paper) => paper.id === raw.paperId))
    ? raw.paperId
    : 'random';
  return {
    ...DEFAULT_PREFS,
    mode,
    focusSkillId,
    genre,
    difficulty,
    viewMode,
    paperId,
    showParagraphNumbers: raw.showParagraphNumbers !== false,
  };
}

function normaliseData(raw) {
  const base = defaultData();
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? clone(raw) : {};
  return {
    ...base,
    ...data,
    version: 1,
    contentReleaseId: READING_CONTENT_RELEASE_ID,
    prefs: normalisePrefs(data.prefs || {}),
    skills: data.skills || {},
    passages: data.passages || {},
    questions: data.questions || {},
    genres: data.genres || {},
    qtypes: data.qtypes || {},
    misconceptions: data.misconceptions || {},
    retryQueue: Array.isArray(data.retryQueue) ? data.retryQueue.slice(0, 500) : [],
    events: Array.isArray(data.events) ? data.events.slice(-1200) : [],
    sessions: Array.isArray(data.sessions) ? data.sessions.slice(-180) : [],
    securedSkillKeys: Array.isArray(data.securedSkillKeys) ? data.securedSkillKeys : [],
  };
}

function normaliseState(raw, data) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? clone(raw) : {};
  const state = { ...defaultState(), ...source };
  state.prefs = normalisePrefs(state.prefs || data.prefs || {});
  state.feedback = state.feedback && typeof state.feedback === 'object' ? state.feedback : null;
  state.summary = state.summary && typeof state.summary === 'object' ? state.summary : null;
  state.session = state.session && typeof state.session === 'object' ? state.session : null;
  state.phase = ['setup', 'question', 'feedback', 'summary'].includes(state.phase) ? state.phase : (state.session ? 'question' : 'setup');
  return state;
}

function ensureNode(collection, key) {
  if (!collection[key]) collection[key] = defaultNode();
  return collection[key];
}

function nodeStatus(node) {
  const now = Date.now();
  if (!node || !node.attempts) return 'new';
  if ((node.strength || 0) < 0.42 || (node.wrong || 0) > (node.correct || 0) + 1) return 'weak';
  if ((node.dueAt || 0) <= now) return 'due';
  if ((node.strength || 0) >= 0.82 && (node.intervalDays || 0) >= 7 && (node.correctStreak || 0) >= 3) return 'secured';
  return 'learning';
}

function outcomeQuality(result, attempts = 1, supportLevel = 0) {
  if (result.correct) {
    if (supportLevel >= 2) return 3;
    if (supportLevel === 1) return attempts === 1 ? 3.4 : 3;
    if (attempts === 1) return 5;
    if (attempts === 2) return 3.7;
    return 3.2;
  }
  if (result.score > 0) return 1.5;
  return 0;
}

function updateNodeFromQuality(node, quality, nowValue) {
  node.attempts += 1;
  node.lastSeenAt = nowValue;
  if (quality >= 4.8) {
    node.correct += 1;
    node.correctStreak += 1;
    node.strength = clamp(node.strength + 0.13, 0.05, 0.99);
    node.intervalDays = node.intervalDays ? Math.min(45, node.intervalDays * 2) : 1;
    node.dueAt = nowValue + node.intervalDays * 86400000;
  } else if (quality >= 4) {
    node.correct += 1;
    node.correctStreak += 1;
    node.strength = clamp(node.strength + 0.09, 0.05, 0.98);
    node.intervalDays = node.intervalDays ? Math.min(28, node.intervalDays * 1.7) : 1;
    node.dueAt = nowValue + node.intervalDays * 86400000;
  } else if (quality >= 3) {
    node.correct += 1;
    node.correctStreak = Math.max(1, node.correctStreak);
    node.strength = clamp(node.strength + 0.04, 0.05, 0.95);
    node.intervalDays = node.intervalDays ? Math.max(0.25, node.intervalDays * 0.9) : 0.25;
    node.dueAt = nowValue + Math.max(6 * 3600000, node.intervalDays * 86400000);
  } else {
    node.wrong += 1;
    node.correctStreak = 0;
    node.strength = clamp(node.strength - (quality > 0 ? 0.08 : 0.15), 0.02, 0.95);
    node.intervalDays = Math.max(0.04, (node.intervalDays || 0.2) * 0.45);
    node.dueAt = nowValue + (quality > 0 ? 20 : 12) * 60000;
    node.lastWrongAt = nowValue;
  }
}

function defaultMisconceptionForSkill(skill) {
  return ({
    '2a': 'vocab_out_of_context',
    '2b': 'misread_detail',
    '2c': 'summary_too_narrow',
    '2d': 'weak_evidence',
    '2e': 'prediction_not_text_based',
    '2f': 'whole_text_structure',
    '2g': 'author_choice_literal_only',
    '2h': 'comparison_partial',
    P1: 'punctuation_meaning',
    P2: 'punctuation_voice',
    P3: 'punctuation_extra_info',
    P4: 'punctuation_linking',
  })[skill] || 'misread_detail';
}

function makeResult(question, score, maxScore, details = {}) {
  const finalScore = clamp(Number(score) || 0, 0, maxScore);
  return {
    questionId: question.id,
    skillId: question.skill,
    score: finalScore,
    maxScore,
    correct: finalScore === maxScore,
    misconception: details.misconception || null,
    feedbackShort: details.feedbackShort || '',
    feedbackLong: details.feedbackLong || '',
    modelAnswer: details.modelAnswer || question.modelAnswer || '',
    evidenceSnippets: details.evidenceSnippets || [],
    matched: details.matched || [],
  };
}

export function evaluateReadingQuestion(question, response = {}) {
  const qType = question.type;
  const evidenceSnippets = (question.evidenceCheck && question.evidenceCheck.containsAny)
    ? question.evidenceCheck.containsAny.slice(0, 3)
    : [];
  if (qType === 'mcq') {
    const raw = response.answer;
    const hasChoice = !(raw === '' || raw === null || raw === undefined);
    const selected = hasChoice ? Number(raw) : NaN;
    const correct = hasChoice && selected === Number(question.correct);
    return makeResult(question, correct ? question.marks : 0, question.marks, {
      misconception: correct ? null : (question.skill === '2a' ? 'vocab_out_of_context' : 'selection_slip'),
      feedbackShort: correct ? 'Correct.' : (hasChoice ? 'Not quite. Check the text again.' : 'Choose one option first.'),
      feedbackLong: question.explanation || '',
      evidenceSnippets,
    });
  }
  if (qType === 'short') {
    const correct = checkMatches(String(response.answer || ''), question.check);
    return makeResult(question, correct ? question.marks : 0, question.marks, {
      misconception: correct ? null : defaultMisconceptionForSkill(question.skill),
      feedbackShort: correct ? 'Correct.' : 'Not quite yet.',
      feedbackLong: question.explanation || '',
      evidenceSnippets,
    });
  }
  if (qType === 'evidenceShort') {
    const answerOk = checkMatches(String(response.answer || ''), question.answerCheck);
    const evidenceOk = evidenceMatches(String(response.evidence || ''), question.evidenceCheck);
    const answerMarks = Number(question.answerMarks || 1);
    const evidenceMarks = Number(question.evidenceMarks || 1);
    const score = (answerOk ? answerMarks : 0) + (evidenceOk ? evidenceMarks : 0);
    let misconception = null;
    if (!answerOk && !evidenceOk) misconception = defaultMisconceptionForSkill(question.skill);
    else if (answerOk && !evidenceOk) misconception = 'weak_evidence';
    else if (!answerOk && evidenceOk) misconception = defaultMisconceptionForSkill(question.skill);
    return makeResult(question, score, question.marks, {
      misconception,
      feedbackShort: score === question.marks ? 'Correct.' : score > 0 ? 'Partly right.' : 'Not quite yet.',
      feedbackLong: question.explanation || '',
      evidenceSnippets,
    });
  }
  if (qType === 'open') {
    const combined = `${String(response.answer || '')} ${String(response.evidence || '')}`.trim();
    const scored = scoreRubric(combined, question.rubric || [], question.marks);
    return makeResult(question, scored.score, question.marks, {
      misconception: scored.score === question.marks ? null : defaultMisconceptionForSkill(question.skill),
      feedbackShort: scored.score === question.marks ? 'Strong answer.' : scored.score > 0 ? 'Partly there.' : 'This needs tighter text-based thinking.',
      feedbackLong: question.explanation || '',
      evidenceSnippets,
      matched: scored.matched,
    });
  }
  if (qType === 'multiSelect') {
    const selected = new Set((response.answer || []).map(Number));
    const correctSet = new Set((question.correctSet || []).map(Number));
    let score = 0;
    if (setEqual(selected, correctSet)) score = question.marks;
    else {
      let good = 0;
      let bad = 0;
      selected.forEach((value) => { if (correctSet.has(value)) good += 1; else bad += 1; });
      if (!bad && good > 0 && question.marks > 1) score = Math.min(question.marks - 1, 1);
    }
    return makeResult(question, score, question.marks, {
      misconception: score === question.marks ? null : defaultMisconceptionForSkill(question.skill),
      feedbackShort: score === question.marks ? 'Correct.' : score > 0 ? 'Some choices are right.' : 'Check each option against the text carefully.',
      feedbackLong: question.explanation || '',
      evidenceSnippets,
    });
  }
  if (qType === 'match') {
    const mapping = response.map || {};
    const prompts = question.prompts || [];
    let correctCount = 0;
    prompts.forEach((_, index) => { if (String(mapping[index]) === String(question.correctMap[index])) correctCount += 1; });
    const score = correctCount === prompts.length ? question.marks : Math.floor((correctCount / Math.max(1, prompts.length)) * question.marks);
    return makeResult(question, score, question.marks, {
      misconception: score === question.marks ? null : (question.skill === '2h' ? 'comparison_partial' : 'misread_detail'),
      feedbackShort: score === question.marks ? 'Correct.' : correctCount ? 'Some matches are right.' : 'Try matching each detail to its exact job in the text.',
      feedbackLong: question.explanation || '',
      evidenceSnippets,
    });
  }
  if (qType === 'order') {
    const orderMap = response.order || {};
    const correct = question.correctPositions || [];
    let correctCount = 0;
    correct.forEach((position, index) => { if (Number(orderMap[index]) === Number(position)) correctCount += 1; });
    const score = correctCount === correct.length ? question.marks : Math.floor((correctCount / Math.max(1, correct.length)) * question.marks);
    return makeResult(question, score, question.marks, {
      misconception: score === question.marks ? null : 'sequence_tracking',
      feedbackShort: score === question.marks ? 'Correct order.' : correctCount ? 'Some parts are in the right place.' : 'Track the sequence more carefully across the text.',
      feedbackLong: question.explanation || '',
      evidenceSnippets,
    });
  }
  return makeResult(question, 0, question.marks || 1, {
    misconception: 'misread_detail',
    feedbackShort: 'This question type is not available.',
  });
}

function relevantQuestionsForMode(passage, mode, skillFilter, allowSkillFallback = true) {
  let questions = (passage.questions || []).slice();
  if (skillFilter) questions = questions.filter((question) => question.skill === skillFilter);
  if (mode === 'guided') questions = questions.filter((question) => passage.difficulty <= 3 && !PUNCTUATION_SKILL_IDS.has(question.skill));
  if (mode === 'evidence') questions = questions.filter((question) => question.type === 'evidenceShort' || ['2d', '2g', '2h'].includes(question.skill));
  if (mode === 'vocab') questions = questions.filter((question) => question.skill === '2a');
  if (mode === 'inference') questions = questions.filter((question) => ['2d', '2g', '2h', '2f'].includes(question.skill));
  if (mode === 'punct') questions = questions.filter((question) => PUNCTUATION_SKILL_IDS.has(question.skill));
  if (mode === 'stamina') questions = passage.isLong ? questions.filter((question) => !PUNCTUATION_SKILL_IDS.has(question.skill)) : [];
  if (!questions.length && skillFilter && allowSkillFallback) questions = (passage.questions || []).filter((question) => !PUNCTUATION_SKILL_IDS.has(question.skill));
  return questions;
}

function questionWeakness(data, question) {
  const qNode = data.questions[question.id] || defaultNode();
  const sNode = data.skills[question.skill] || defaultNode();
  const tNode = data.qtypes[question.type] || defaultNode();
  let score = (1 - qNode.strength) * 3 + (1 - sNode.strength) * 2 + (1 - tNode.strength);
  if (!qNode.attempts) score += 0.9;
  if (qNode.dueAt && qNode.dueAt <= Date.now()) score += 2;
  return score;
}

function hasStrictModeMatch(data, prefs) {
  if (!prefs.focusSkillId) return false;
  return READING_PASSAGES.some((passage) => {
    if (prefs.genre && passage.genre !== prefs.genre) return false;
    if (prefs.difficulty && Number(passage.difficulty) !== Number(prefs.difficulty)) return false;
    return relevantQuestionsForMode(passage, prefs.mode, prefs.focusSkillId, false).length > 0;
  });
}

function chooseWeightedPassage(data, prefs, random) {
  const strictSkillMatch = hasStrictModeMatch(data, prefs);
  const candidates = READING_PASSAGES.filter((passage) => {
    if (prefs.genre && passage.genre !== prefs.genre) return false;
    if (prefs.difficulty && Number(passage.difficulty) !== Number(prefs.difficulty)) return false;
    if (prefs.mode === 'guided' && passage.difficulty > 3) return false;
    if (prefs.mode === 'stamina' && !passage.isLong) return false;
    return relevantQuestionsForMode(passage, prefs.mode, prefs.focusSkillId, !strictSkillMatch).length > 0;
  });
  if (!candidates.length) return null;
  const weighted = candidates.map((passage) => {
    const pNode = data.passages[passage.id] || defaultNode();
    const gNode = data.genres[passage.genre] || defaultNode();
    const questions = relevantQuestionsForMode(passage, prefs.mode, prefs.focusSkillId, !strictSkillMatch);
    let weight = 1 + (1 - pNode.strength) * 1.7 + (1 - gNode.strength);
    if (!pNode.attempts) weight += 0.7;
    weight += average(questions.map((question) => questionWeakness(data, question)));
    const recentCount = data.events.slice(-12).filter((event) => event.passageId === passage.id).length;
    weight *= Math.pow(0.58, recentCount);
    return [passage, Math.max(0.05, weight)];
  });
  let roll = random() * weighted.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [passage, weight] of weighted) {
    roll -= weight;
    if (roll <= 0) return passage;
  }
  return weighted[weighted.length - 1][0];
}

function chooseQuestionIds(data, passage, prefs) {
  const strictSkillMatch = hasStrictModeMatch(data, prefs);
  let questions = relevantQuestionsForMode(passage, prefs.mode, prefs.focusSkillId, !strictSkillMatch);
  if (!questions.length) questions = (passage.questions || []).slice();
  if (prefs.mode === 'guided') return questions.slice(0, Math.min(4, questions.length)).map((question) => question.id);
  if (prefs.mode === 'stamina') return questions.map((question) => question.id);
  questions.sort((a, b) => questionWeakness(data, b) - questionWeakness(data, a));
  const limit = prefs.mode === 'smart' ? 4 : prefs.mode === 'punct' ? 3 : 5;
  const picked = [];
  const seenSkills = new Set();
  for (const question of questions) {
    if (picked.length >= limit) break;
    if (seenSkills.has(question.skill) && picked.length < Math.min(3, questions.length)) continue;
    picked.push(question);
    seenSkills.add(question.skill);
  }
  for (const question of questions) {
    if (picked.length >= Math.min(limit, questions.length)) break;
    if (!picked.includes(question)) picked.push(question);
  }
  const order = Object.fromEntries((passage.questions || []).map((question, index) => [question.id, index]));
  return picked.map((question) => question.id).sort((a, b) => order[a] - order[b]);
}

function choosePaper(data, requestedPaperId, random) {
  if (requestedPaperId && requestedPaperId !== 'random') {
    return READING_TEST_PAPERS.find((paper) => paper.id === requestedPaperId) || READING_TEST_PAPERS[0];
  }
  const recent = data.sessions.filter((session) => session.mode === 'test' && session.paperId).slice(-6);
  const penalties = Object.fromEntries(READING_TEST_PAPERS.map((paper) => [paper.id, 0]));
  recent.forEach((session, index) => { penalties[session.paperId] = (penalties[session.paperId] || 0) + (recent.length - index); });
  const weighted = READING_TEST_PAPERS.map((paper) => [paper, Math.max(0.15, 1 / (1 + (penalties[paper.id] || 0) * 0.35))]);
  let roll = random() * weighted.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [paper, weight] of weighted) {
    roll -= weight;
    if (roll <= 0) return paper;
  }
  return weighted[0][0];
}

function buildPracticeSession(data, prefs, { nowValue, random, heroContext } = {}) {
  if (prefs.mode === 'test') {
    const paper = choosePaper(data, prefs.paperId, random);
    return {
      id: uid('reading_session'),
      mode: 'test',
      strict: true,
      delayedFeedback: true,
      viewMode: prefs.viewMode,
      startedAt: nowValue,
      timeLimitMin: paper.timeLimitMin || 60,
      paperId: paper.id,
      paperTitle: paper.title,
      currentSectionIndex: 0,
      currentQuestionIndex: 0,
      marked: false,
      heroContext: heroContext || null,
      sections: paper.sections.map((section) => ({
        passageId: section.passageId,
        questionIds: section.questionIds.slice(),
        responses: {},
        results: {},
        attempts: {},
        support: {},
        startedAtByQuestion: {},
      })),
    };
  }
  const passage = chooseWeightedPassage(data, prefs, random);
  if (!passage) return null;
  const questionIds = chooseQuestionIds(data, passage, prefs);
  return {
    id: uid('reading_session'),
    mode: prefs.mode,
    strict: false,
    delayedFeedback: prefs.mode === 'stamina' || prefs.viewMode === 'list',
    viewMode: prefs.viewMode,
    startedAt: nowValue,
    currentSectionIndex: 0,
    currentQuestionIndex: 0,
    marked: false,
    heroContext: heroContext || null,
    sections: [{
      passageId: passage.id,
      questionIds,
      responses: {},
      results: {},
      attempts: {},
      support: {},
      startedAtByQuestion: {},
    }],
  };
}

function currentSection(session) {
  return session?.sections?.[session.currentSectionIndex] || null;
}

function currentQuestion(session) {
  const section = currentSection(session);
  if (!section) return null;
  const qid = section.questionIds[session.currentQuestionIndex];
  return qid ? QUESTION_REF_MAP[qid]?.question || null : null;
}

function totalMarks(session) {
  return (session?.sections || []).reduce((sum, section) => sum + section.questionIds.reduce((inner, qid) => inner + (QUESTION_REF_MAP[qid]?.question?.marks || 0), 0), 0);
}

function currentScore(session) {
  return (session?.sections || []).reduce((sum, section) => sum + Object.values(section.results || {}).reduce((inner, result) => inner + (result.score || 0), 0), 0);
}

function markedCount(session) {
  return (session?.sections || []).reduce((sum, section) => sum + Object.keys(section.results || {}).length, 0);
}

function questionCount(session) {
  return (session?.sections || []).reduce((sum, section) => sum + section.questionIds.length, 0);
}

function sessionComplete(session) {
  return !!session && markedCount(session) >= questionCount(session);
}

function bumpMisconception(data, tag, nowValue) {
  if (!tag) return;
  if (!data.misconceptions[tag]) data.misconceptions[tag] = { count: 0, lastSeenAt: null };
  data.misconceptions[tag].count += 1;
  data.misconceptions[tag].lastSeenAt = nowValue;
}

function updateStreak(data, nowValue) {
  const day = Math.floor(nowValue / 86400000);
  if (!data.lastPracticeDay) {
    data.lastPracticeDay = day;
    data.streakDays = 1;
    return;
  }
  if (data.lastPracticeDay === day) return;
  data.streakDays = day === data.lastPracticeDay + 1 ? (data.streakDays || 0) + 1 : 1;
  data.lastPracticeDay = day;
}

function applyQuestionUpdate({ data, learnerId, session, section, qid, result, response, nowValue, requestId }) {
  const ref = QUESTION_REF_MAP[qid];
  if (!ref) return [];
  const question = ref.question;
  const passage = PASSAGE_MAP[ref.passageId];
  const attempts = Math.max(1, Number(section.attempts[qid]) || 1);
  const supportLevel = Math.max(0, Number(section.support[qid]) || 0);
  const quality = outcomeQuality(result, attempts, supportLevel);
  updateStreak(data, nowValue);
  updateNodeFromQuality(ensureNode(data.skills, question.skill), quality, nowValue);
  updateNodeFromQuality(ensureNode(data.passages, ref.passageId), quality, nowValue);
  updateNodeFromQuality(ensureNode(data.questions, qid), quality, nowValue);
  updateNodeFromQuality(ensureNode(data.genres, passage.genre), quality, nowValue);
  updateNodeFromQuality(ensureNode(data.qtypes, question.type), quality, nowValue);
  bumpMisconception(data, result.misconception, nowValue);

  if (!result.correct || quality < 4) {
    data.retryQueue.push({
      questionId: qid,
      passageId: ref.passageId,
      skillId: question.skill,
      dueAt: nowValue + (result.correct ? 6 * 3600000 : 15 * 60000),
      reason: result.correct ? 'supported-or-shaky' : 'recent-miss',
    });
    data.retryQueue = data.retryQueue.sort((a, b) => a.dueAt - b.dueAt).slice(0, 500);
  }

  const event = {
    id: `reading.answer.${learnerId || 'learner'}.${qid}.${requestId || uid('req')}`,
    type: 'reading.answer-submitted',
    subjectId: 'reading',
    learnerId,
    contentReleaseId: READING_CONTENT_RELEASE_ID,
    passageId: ref.passageId,
    questionId: qid,
    skillId: question.skill,
    genre: passage.genre,
    qType: question.type,
    mode: session.mode,
    score: result.score,
    maxScore: result.maxScore,
    correct: result.correct,
    independent: result.correct && attempts === 1 && supportLevel === 0,
    attempts,
    supportLevel,
    misconception: result.misconception || '',
    createdAt: nowValue,
  };
  data.events.push(event);
  data.events = data.events.slice(-1200);
  return [event];
}

function deriveSecuredSkillEvents({ data, learnerId, nowValue, requestId }) {
  const known = new Set(data.securedSkillKeys || []);
  const events = [];
  for (const skillId of SKILL_IDS.filter((id) => !PUNCTUATION_SKILL_IDS.has(id))) {
    const node = data.skills[skillId];
    if (!node) continue;
    if (nodeStatus(node) !== 'secured') continue;
    const key = `${READING_CONTENT_RELEASE_ID}:${skillId}`;
    if (known.has(key)) continue;
    known.add(key);
    events.push({
      id: `reading.skill-secured.${learnerId || 'learner'}.${skillId}.${requestId || uid('req')}`,
      type: 'reading.skill-secured',
      subjectId: 'reading',
      learnerId,
      contentReleaseId: READING_CONTENT_RELEASE_ID,
      skillId,
      strength: node.strength,
      attempts: node.attempts,
      createdAt: nowValue,
    });
  }
  data.securedSkillKeys = [...known];
  return events;
}

function finaliseSessionIfComplete({ data, state, learnerId, nowValue, requestId }) {
  const session = state.session;
  if (!session || !sessionComplete(session)) return [];
  const summary = {
    sessionId: session.id,
    mode: session.mode,
    paperId: session.paperId || '',
    paperTitle: session.paperTitle || '',
    questionCount: questionCount(session),
    score: currentScore(session),
    maxScore: totalMarks(session),
    accuracy: totalMarks(session) ? Math.round((currentScore(session) / totalMarks(session)) * 100) : 0,
    completedAt: nowValue,
  };
  data.sessions.push(summary);
  data.sessions = data.sessions.slice(-180);
  state.summary = summary;
  state.feedback = null;
  state.session = null;
  state.phase = 'summary';
  return [{
    id: `reading.session-completed.${learnerId || 'learner'}.${summary.sessionId}.${requestId || uid('req')}`,
    type: 'reading.session-completed',
    subjectId: 'reading',
    learnerId,
    contentReleaseId: READING_CONTENT_RELEASE_ID,
    sessionId: summary.sessionId,
    mode: summary.mode,
    score: summary.score,
    maxScore: summary.maxScore,
    questionCount: summary.questionCount,
    heroContext: session.heroContext || null,
    createdAt: nowValue,
  }];
}

function markQuestion({ data, state, learnerId, section, qid, response, nowValue, requestId }) {
  const ref = QUESTION_REF_MAP[qid];
  if (!ref || section.results[qid]) return [];
  const question = ref.question;
  section.responses[qid] = response || section.responses[qid] || {};
  section.attempts[qid] = Math.max(1, Number(section.attempts[qid]) || 1);
  const result = evaluateReadingQuestion(question, section.responses[qid]);
  section.results[qid] = result;
  state.feedback = {
    questionId: qid,
    result,
    hint: result.correct ? '' : (question.hint || MINIMAL_HINTS[question.skill] || ''),
  };
  state.phase = result.correct || state.session?.delayedFeedback ? 'feedback' : 'feedback';
  return applyQuestionUpdate({ data, learnerId, session: state.session, section, qid, result, response: section.responses[qid], nowValue, requestId });
}

function moveQuestion(session, payload = {}) {
  const sectionIndex = Number.isFinite(Number(payload.sectionIndex)) ? Number(payload.sectionIndex) : null;
  if (sectionIndex !== null) {
    session.currentSectionIndex = clamp(sectionIndex, 0, Math.max(0, session.sections.length - 1));
    const section = currentSection(session);
    session.currentQuestionIndex = clamp(Number(payload.questionIndex) || 0, 0, Math.max(0, (section?.questionIds?.length || 1) - 1));
    return;
  }
  if (Number.isFinite(Number(payload.questionIndex))) {
    const section = currentSection(session);
    session.currentQuestionIndex = clamp(Number(payload.questionIndex), 0, Math.max(0, (section?.questionIds?.length || 1) - 1));
    return;
  }
  const delta = Number(payload.delta) || 0;
  if (!delta) return;
  const section = currentSection(session);
  if (!section) return;
  if (delta > 0) {
    if (session.currentQuestionIndex < section.questionIds.length - 1) session.currentQuestionIndex += 1;
    else if (session.currentSectionIndex < session.sections.length - 1) {
      session.currentSectionIndex += 1;
      session.currentQuestionIndex = 0;
    }
  } else if (delta < 0) {
    if (session.currentQuestionIndex > 0) session.currentQuestionIndex -= 1;
    else if (session.currentSectionIndex > 0) {
      session.currentSectionIndex -= 1;
      const previous = currentSection(session);
      session.currentQuestionIndex = Math.max(0, (previous?.questionIds?.length || 1) - 1);
    }
  }
}

function buildPracticeSessionRow(session, status = 'active', nowValue = Date.now()) {
  if (!session) return null;
  return {
    id: session.id,
    subjectId: 'reading',
    mode: session.mode,
    status,
    startedAt: session.startedAt || nowValue,
    completedAt: status === 'completed' ? nowValue : null,
    score: currentScore(session),
    maxScore: totalMarks(session),
    total: questionCount(session),
    correct: (session.sections || []).reduce((sum, section) => sum + Object.values(section.results || {}).filter((result) => result.correct).length, 0),
    sessionState: {
      mode: session.mode,
      paperId: session.paperId || '',
      paperTitle: session.paperTitle || '',
      heroContext: session.heroContext || null,
    },
  };
}

function safeDataForReadModels(data) {
  const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  return {
    ...defaultData(),
    ...source,
    skills: source.skills || {},
    passages: source.passages || {},
    questions: source.questions || {},
    genres: source.genres || {},
    qtypes: source.qtypes || {},
    misconceptions: source.misconceptions || {},
    retryQueue: Array.isArray(source.retryQueue) ? source.retryQueue : [],
    events: Array.isArray(source.events) ? source.events : [],
  };
}

function buildStats(data) {
  data = safeDataForReadModels(data);
  const skillRows = SKILL_IDS.map((skillId) => {
    const node = data.skills[skillId] || defaultNode();
    return {
      id: skillId,
      name: READING_SKILLS[skillId]?.name || skillId,
      domain: READING_SKILLS[skillId]?.domain || '',
      attempts: node.attempts || 0,
      correct: node.correct || 0,
      wrong: node.wrong || 0,
      strength: Math.round((node.strength || 0) * 100),
      status: nodeStatus(node),
      dueAt: node.dueAt || 0,
    };
  });
  const events = data.events || [];
  const total = events.length;
  const correct = events.filter((event) => event.correct).length;
  const independent = events.filter((event) => event.independent).length;
  const due = skillRows.filter((row) => row.status === 'due').length + (data.retryQueue || []).filter((entry) => entry.dueAt <= Date.now()).length;
  const weak = skillRows.filter((row) => row.status === 'weak').length;
  const secured = skillRows.filter((row) => row.status === 'secured').length;
  return {
    overview: {
      totalQuestions: total,
      correct,
      accuracy: total ? Math.round((correct / total) * 100) : 0,
      independentAccuracy: total ? Math.round((independent / total) * 100) : 0,
      due,
      weak,
      securedSkills: secured,
      streakDays: data.streakDays || 0,
      content: readingContentSummary(),
    },
    skills: skillRows,
  };
}

function buildAnalytics(data) {
  data = safeDataForReadModels(data);
  const events = data.events || [];
  const byGenre = ['fiction', 'non-fiction', 'poetry'].map((genre) => {
    const rows = events.filter((event) => event.genre === genre);
    return {
      genre,
      attempts: rows.length,
      accuracy: rows.length ? Math.round((rows.filter((event) => event.correct).length / rows.length) * 100) : 0,
    };
  });
  const byType = [...new Set(events.map((event) => event.qType).filter(Boolean))].map((qType) => {
    const rows = events.filter((event) => event.qType === qType);
    return {
      qType,
      attempts: rows.length,
      accuracy: rows.length ? Math.round((rows.filter((event) => event.correct).length / rows.length) * 100) : 0,
    };
  });
  const misconceptionPatterns = Object.entries(data.misconceptions || {})
    .map(([id, value]) => ({ id, count: value.count || 0, lastSeenAt: value.lastSeenAt || null }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  return {
    available: true,
    generatedAt: Date.now(),
    skills: buildStats(data).skills,
    byGenre,
    byType,
    misconceptionPatterns,
    recentActivity: events.slice(-15).reverse(),
    reviewQueue: (data.retryQueue || []).filter((entry) => entry.dueAt <= Date.now()).slice(0, 12),
  };
}

export function createServerReadingEngine({ now = Date.now, random = Math.random } = {}) {
  function nowValue() {
    const value = Number(typeof now === 'function' ? now() : now);
    return Number.isFinite(value) ? value : Date.now();
  }

  function apply({ learnerId, subjectRecord = null, latestSession = null, command, payload = {}, requestId = '' } = {}) {
    const t = nowValue();
    let data = normaliseData(subjectRecord?.data || subjectRecord?.snapshot?.data || subjectRecord?.state?.data || {});
    let state = normaliseState(subjectRecord?.state || {}, data);
    const events = [];
    let changed = true;
    let previousActiveSessionId = latestSession?.status === 'active' ? latestSession.id : null;
    let practiceSession = null;

    if (command === 'reset-learner') {
      data = defaultData();
      state = defaultState();
      events.push({ id: `reading.reset.${learnerId}.${requestId || uid('req')}`, type: 'reading.learner-reset', subjectId: 'reading', learnerId, contentReleaseId: READING_CONTENT_RELEASE_ID, createdAt: t });
    } else if (command === 'save-prefs') {
      const prefs = normalisePrefs({ ...data.prefs, ...(payload.prefs || payload || {}) });
      data.prefs = prefs;
      state.prefs = prefs;
      state.updatedAt = t;
      state.error = '';
      events.push({ id: `reading.prefs.${learnerId}.${requestId || uid('req')}`, type: 'reading.prefs-saved', subjectId: 'reading', learnerId, contentReleaseId: READING_CONTENT_RELEASE_ID, createdAt: t });
    } else if (command === 'start-session') {
      const prefs = normalisePrefs({ ...data.prefs, ...(payload || {}) });
      data.prefs = prefs;
      const session = buildPracticeSession(data, prefs, { nowValue: t, random, heroContext: payload.heroContext || null });
      if (!session) {
        state = { ...state, error: 'No reading passage matches that setup yet.', phase: 'setup', session: null, feedback: null, updatedAt: t };
      } else {
        state = { ...state, prefs, phase: 'question', session, feedback: null, summary: null, error: '', updatedAt: t };
        practiceSession = buildPracticeSessionRow(session, 'active', t);
        events.push({ id: `reading.session-started.${learnerId}.${session.id}`, type: 'reading.session-started', subjectId: 'reading', learnerId, contentReleaseId: READING_CONTENT_RELEASE_ID, sessionId: session.id, mode: session.mode, heroContext: session.heroContext || null, createdAt: t });
      }
    } else if (command === 'save-response') {
      const session = state.session;
      if (!session) changed = false;
      else {
        const section = currentSection(session);
        const question = currentQuestion(session);
        if (section && question) {
          const qid = question.id;
          section.responses[qid] = clone(payload.response || {});
          if (payload.advance) moveQuestion(session, { delta: 1 });
          state.feedback = null;
          state.phase = 'question';
          state.updatedAt = t;
          practiceSession = buildPracticeSessionRow(session, 'active', t);
        }
      }
    } else if (command === 'submit-answer') {
      const session = state.session;
      const section = currentSection(session);
      const question = currentQuestion(session);
      if (!session || !section || !question) changed = false;
      else {
        const qid = question.id;
        if (payload.expectedSessionId && payload.expectedSessionId !== session.id) changed = false;
        else if (payload.expectedQuestionId && payload.expectedQuestionId !== qid) changed = false;
        else {
          section.responses[qid] = clone(payload.response || {});
          section.attempts[qid] = (Number(section.attempts[qid]) || 0) + 1;
          if (!section.startedAtByQuestion[qid]) section.startedAtByQuestion[qid] = t;
          const resultEvents = markQuestion({ data, state, learnerId, section, qid, response: section.responses[qid], nowValue: t, requestId });
          events.push(...resultEvents, ...deriveSecuredSkillEvents({ data, learnerId, nowValue: t, requestId }));
          state.updatedAt = t;
          events.push(...finaliseSessionIfComplete({ data, state, learnerId, nowValue: t, requestId }));
          practiceSession = buildPracticeSessionRow(state.session || { ...session, sections: session.sections }, state.session ? 'active' : 'completed', t);
        }
      }
    } else if (command === 'mark-section' || command === 'mark-session') {
      const session = state.session;
      if (!session) changed = false;
      else {
        const sections = command === 'mark-section' ? [currentSection(session)].filter(Boolean) : session.sections;
        for (const section of sections) {
          for (const qid of section.questionIds) {
            if (section.results[qid]) continue;
            events.push(...markQuestion({ data, state, learnerId, section, qid, response: section.responses[qid] || {}, nowValue: t, requestId }));
          }
        }
        session.marked = sessionComplete(session);
        events.push(...deriveSecuredSkillEvents({ data, learnerId, nowValue: t, requestId }));
        events.push(...finaliseSessionIfComplete({ data, state, learnerId, nowValue: t, requestId }));
        state.updatedAt = t;
        practiceSession = buildPracticeSessionRow(state.session || { ...session, sections: session.sections }, state.session ? 'active' : 'completed', t);
      }
    } else if (command === 'move-question') {
      if (!state.session) changed = false;
      else {
        moveQuestion(state.session, payload || {});
        state.phase = 'question';
        state.feedback = null;
        state.updatedAt = t;
        practiceSession = buildPracticeSessionRow(state.session, 'active', t);
      }
    } else if (command === 'continue-session') {
      if (!state.session) changed = false;
      else {
        moveQuestion(state.session, { delta: 1 });
        state.phase = 'question';
        state.feedback = null;
        state.updatedAt = t;
        practiceSession = buildPracticeSessionRow(state.session, 'active', t);
      }
    } else if (command === 'end-session') {
      if (!state.session) changed = false;
      else {
        const abandoned = state.session;
        state.session = null;
        state.feedback = null;
        state.phase = 'setup';
        state.updatedAt = t;
        practiceSession = buildPracticeSessionRow(abandoned, 'abandoned', t);
        events.push({ id: `reading.session-ended.${learnerId}.${abandoned.id}.${requestId || uid('req')}`, type: 'reading.session-ended', subjectId: 'reading', learnerId, contentReleaseId: READING_CONTENT_RELEASE_ID, sessionId: abandoned.id, mode: abandoned.mode, status: 'abandoned', createdAt: t });
      }
    } else {
      changed = false;
    }

    if (changed !== false) {
      state.prefs = data.prefs;
      state.updatedAt = t;
    }
    const stats = buildStats(data);
    const analytics = buildAnalytics(data);
    return {
      changed,
      state,
      data,
      prefs: data.prefs,
      stats,
      analytics,
      events,
      practiceSession,
      previousActiveSessionId,
    };
  }

  return { apply };
}

export const __readingEngineInternals = {
  defaultData,
  defaultState,
  normalisePrefs,
  buildStats,
  buildAnalytics,
  totalMarks,
  currentScore,
};
