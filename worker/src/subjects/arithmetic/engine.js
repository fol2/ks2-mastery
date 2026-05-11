import {
  ARITHMETIC_CONTENT_RELEASE_ID,
  ARITHMETIC_MISCONCEPTIONS,
  ARITHMETIC_REWARD_UNIT_MAP,
  ARITHMETIC_SKILLS,
  ARITHMETIC_TEMPLATE_MAP,
  ARITHMETIC_TEMPLATES,
  ARITHMETIC_TEST_BLUEPRINT_FULL,
  ARITHMETIC_TEST_BLUEPRINT_SHORT,
  arithmeticPublicQuestionId,
  arithmeticContentSummary,
  arithmeticRewardUnitIdForQuestion,
  evaluateArithmeticQuestion,
  generateArithmeticQuestion,
  hashString,
} from '../../../../shared/arithmetic/content.js';

const DAY_MS = 86400000;
const DEFAULT_PREFS = Object.freeze({
  mode: 'smart',
  focusSkillId: '',
  goal: '10q',
  testForm: 'short',
});

export const ARITHMETIC_EVENT_TYPES = Object.freeze({
  SESSION_STARTED: 'arithmetic.session-started',
  ANSWER_SUBMITTED: 'arithmetic.answer-submitted',
  SESSION_COMPLETED: 'arithmetic.session-completed',
  REWARD_UNIT_SECURED: 'arithmetic.reward-unit-secured',
  LEARNER_RESET: 'arithmetic.learner-reset',
});

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function iso(ts) {
  return new Date(ts).toISOString();
}

function uid(prefix, ...parts) {
  const hash = hashString(parts.join(':')).toString(36);
  return `${prefix}_${hash}`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function todayKey(ts) {
  const d = new Date(ts);
  return [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0'), String(d.getUTCDate()).padStart(2, '0')].join('-');
}

function diffDays(aKey, bKey) {
  if (!aKey || !bKey) return 0;
  return Math.round((new Date(`${bKey}T00:00:00Z`) - new Date(`${aKey}T00:00:00Z`)) / DAY_MS);
}

export function normaliseArithmeticPrefs(raw = {}) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const mode = ['smart', 'skill', 'speed', 'clinic', 'test'].includes(input.mode) ? input.mode : DEFAULT_PREFS.mode;
  const focusSkillId = ARITHMETIC_SKILLS[input.focusSkillId] ? input.focusSkillId : '';
  const goal = ['10q', '20q', 'due'].includes(input.goal) ? input.goal : DEFAULT_PREFS.goal;
  const testForm = ['short', 'full'].includes(input.testForm) ? input.testForm : DEFAULT_PREFS.testForm;
  return { mode, focusSkillId, goal, testForm };
}

export function defaultSkillNode() {
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

function normaliseNode(node) {
  return { ...defaultSkillNode(), ...(node && typeof node === 'object' ? node : {}) };
}

export function arithmeticStatusFromNode(node, now = Date.now()) {
  const n = normaliseNode(node);
  if (!n.attempts) return 'new';
  if ((n.strength || 0) < 0.42 || (n.wrong || 0) > (n.correct || 0) + 1) return 'weak';
  if ((n.dueAt || 0) <= now) return 'due';
  if ((n.strength || 0) >= 0.82 && (n.intervalDays || 0) >= 7 && (n.correctStreak || 0) >= 3) return 'secured';
  return 'learning';
}

export function createInitialArithmeticData() {
  return {
    prefs: { ...DEFAULT_PREFS },
    skills: {},
    templates: {},
    rewardUnits: {},
    misconceptions: {},
    retryQueue: [],
    recentAttempts: [],
    sessions: [],
    streak: { lastPracticeDay: null, days: 0 },
  };
}

export function createInitialArithmeticState() {
  return {
    version: 1,
    subjectId: 'arithmetic',
    releaseId: ARITHMETIC_CONTENT_RELEASE_ID,
    phase: 'setup',
    prefs: { ...DEFAULT_PREFS },
    session: null,
    feedback: null,
    summary: null,
    error: '',
  };
}

function normaliseData(raw) {
  const initial = createInitialArithmeticData();
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? clone(raw) : {};
  return {
    ...initial,
    ...data,
    prefs: normaliseArithmeticPrefs(data.prefs || initial.prefs),
    skills: data.skills && typeof data.skills === 'object' ? data.skills : {},
    templates: data.templates && typeof data.templates === 'object' ? data.templates : {},
    rewardUnits: data.rewardUnits && typeof data.rewardUnits === 'object' ? data.rewardUnits : {},
    misconceptions: data.misconceptions && typeof data.misconceptions === 'object' ? data.misconceptions : {},
    retryQueue: Array.isArray(data.retryQueue) ? data.retryQueue.slice(-200) : [],
    recentAttempts: Array.isArray(data.recentAttempts) ? data.recentAttempts.slice(-500) : [],
    sessions: Array.isArray(data.sessions) ? data.sessions.slice(-80) : [],
    streak: data.streak && typeof data.streak === 'object' ? data.streak : initial.streak,
  };
}

function normaliseState(raw, data) {
  const initial = createInitialArithmeticState();
  const state = raw && typeof raw === 'object' && !Array.isArray(raw) ? clone(raw) : {};
  return {
    ...initial,
    ...state,
    version: 1,
    subjectId: 'arithmetic',
    releaseId: ARITHMETIC_CONTENT_RELEASE_ID,
    prefs: normaliseArithmeticPrefs(state.prefs || data.prefs || initial.prefs),
    session: state.session || null,
    feedback: state.feedback || null,
    summary: state.summary || null,
    error: state.error || '',
  };
}

function ensureSkill(data, skillId) {
  if (!data.skills[skillId]) data.skills[skillId] = defaultSkillNode();
  return data.skills[skillId];
}

function ensureTemplate(data, templateId) {
  if (!data.templates[templateId]) data.templates[templateId] = defaultSkillNode();
  return data.templates[templateId];
}

function bumpStreak(data, now) {
  const today = todayKey(now);
  if (!data.streak?.lastPracticeDay) {
    data.streak = { lastPracticeDay: today, days: 1 };
    return;
  }
  if (data.streak.lastPracticeDay === today) return;
  const gap = diffDays(data.streak.lastPracticeDay, today);
  data.streak = { lastPracticeDay: today, days: gap === 1 ? (Number(data.streak.days) || 0) + 1 : 1 };
}

function outcomeQuality(result, sessionQuestion) {
  if (result.correct) {
    if (sessionQuestion?.attempts === 0 && !sessionQuestion?.supported) return 5;
    return 3.4;
  }
  if (result.score > 0) return 1.5;
  return 0;
}

function updateNode(node, quality, now) {
  node.attempts += 1;
  node.lastSeenAt = iso(now);
  if (quality >= 4.8) {
    node.correct += 1;
    node.correctStreak += 1;
    node.strength = clamp(node.strength + 0.13, 0.05, 0.99);
    node.intervalDays = node.intervalDays ? Math.min(45, node.intervalDays * 2) : 1;
    node.dueAt = now + node.intervalDays * DAY_MS;
  } else if (quality >= 3) {
    node.correct += 1;
    node.correctStreak = Math.max(1, node.correctStreak);
    node.strength = clamp(node.strength + 0.04, 0.05, 0.95);
    node.intervalDays = node.intervalDays ? Math.max(0.25, node.intervalDays * 0.9) : 0.25;
    node.dueAt = now + Math.max(6 * 3600000, node.intervalDays * DAY_MS);
  } else {
    node.wrong += 1;
    node.correctStreak = 0;
    node.strength = clamp(node.strength - (quality > 0 ? 0.08 : 0.15), 0.02, 0.95);
    node.intervalDays = Math.max(0.04, (node.intervalDays || 0.2) * 0.45);
    node.dueAt = now + (quality > 0 ? 20 : 12) * 60000;
    node.lastWrongAt = iso(now);
  }
}

function bumpMisconception(data, tag, now) {
  if (!tag) return;
  if (!data.misconceptions[tag]) data.misconceptions[tag] = { count: 0, lastSeenAt: null };
  data.misconceptions[tag].count += 1;
  data.misconceptions[tag].lastSeenAt = iso(now);
}

function recordAttempt(data, attempt) {
  data.recentAttempts.push(attempt);
  data.recentAttempts = data.recentAttempts.slice(-500);
}

function retryEntryFor(question, result, now) {
  return {
    questionSeed: question.seed,
    templateId: question.templateId,
    difficulty: question.difficulty,
    dueAt: now + (result.correct ? 6 * 3600000 : 15 * 60000),
    skillIds: question.skillIds.slice(),
    reason: result.correct ? 'supported-or-shaky' : 'recent-miss',
  };
}

function maybeQueueRetry(data, question, result, now) {
  if (result.correct) return;
  data.retryQueue.push(retryEntryFor(question, result, now));
  data.retryQueue = data.retryQueue.sort((a, b) => a.dueAt - b.dueAt).slice(-200);
}

function dueCount(data, now) {
  let count = data.retryQueue.filter((entry) => Number(entry.dueAt) <= now).length;
  for (const skillId of Object.keys(ARITHMETIC_SKILLS)) {
    const node = data.skills[skillId];
    if (node?.attempts && Number(node.dueAt) <= now) count += 1;
  }
  return count;
}

function statusRows(data, now) {
  return Object.entries(ARITHMETIC_SKILLS).map(([skillId, skill]) => {
    const node = normaliseNode(data.skills[skillId]);
    return {
      skillId,
      name: skill.name,
      strand: skill.strand,
      attempts: node.attempts,
      correct: node.correct,
      wrong: node.wrong,
      strength: Math.round((node.strength || 0) * 100),
      status: arithmeticStatusFromNode(node, now),
      dueAt: node.dueAt || 0,
    };
  });
}

export function buildArithmeticStats(data, now = Date.now()) {
  const attempts = data.recentAttempts || [];
  const total = attempts.length;
  const correct = attempts.filter((attempt) => attempt.correct).length;
  const rows = statusRows(data, now);
  return {
    overview: {
      totalQuestions: total,
      accuracy: total ? Math.round((correct / total) * 100) : 0,
      due: dueCount(data, now),
      weak: rows.filter((row) => row.status === 'weak').length,
      securedSkills: rows.filter((row) => row.status === 'secured').length,
      streakDays: Number(data.streak?.days) || 0,
      securedRewardUnits: Object.values(data.rewardUnits || {}).filter((entry) => entry?.secured).length,
    },
    skills: rows,
  };
}

export function buildArithmeticAnalytics(data, now = Date.now()) {
  const rows = statusRows(data, now);
  const strandMap = Object.fromEntries(Object.keys(arithmeticContentSummary().strands).map((strandId) => [strandId, []]));
  for (const row of rows) strandMap[row.strand]?.push(row.strength);
  const strands = Object.entries(strandMap).map(([strandId, values]) => ({
    strandId,
    name: arithmeticContentSummary().strands[strandId]?.name || strandId,
    strength: values.length ? Math.round(average(values)) : 0,
    status: values.length && average(values) >= 82 ? 'secured' : values.length && average(values) >= 60 ? 'learning' : 'needs-review',
  }));
  const misconceptions = Object.entries(data.misconceptions || {})
    .sort((a, b) => (b[1]?.count || 0) - (a[1]?.count || 0))
    .map(([id, entry]) => ({ id, label: ARITHMETIC_MISCONCEPTIONS[id] || id, count: entry.count || 0, lastSeenAt: entry.lastSeenAt || null }));
  return { skills: rows, strands, misconceptions, recentAttempts: (data.recentAttempts || []).slice(-20).reverse() };
}

function difficultyForTemplate(data, templateRef, mode) {
  const skillStrength = average(templateRef.skillIds.map((skillId) => normaliseNode(data.skills[skillId]).strength || 0.25));
  let band = skillStrength < 0.36 ? 0 : skillStrength < 0.68 ? 1 : 2;
  if (mode === 'clinic') band = Math.max(0, band - 1);
  if (mode === 'speed') band = Math.min(1, band);
  return band;
}

function chooseDueRetry(data, mode, focusSkillId, now) {
  const entries = data.retryQueue.filter((entry) => {
    if (Number(entry.dueAt) > now) return false;
    if ((mode === 'skill' || mode === 'speed') && focusSkillId && !entry.skillIds?.includes(focusSkillId)) return false;
    const templateRef = ARITHMETIC_TEMPLATE_MAP[entry.templateId];
    if (!templateRef) return false;
    if (mode === 'speed' && !templateRef.speedFriendly) return false;
    return true;
  }).sort((a, b) => a.dueAt - b.dueAt);
  if (!entries.length) return null;
  const selected = entries[0];
  const index = data.retryQueue.indexOf(selected);
  if (index >= 0) data.retryQueue.splice(index, 1);
  return selected;
}

function chooseTemplate(data, prefs, now, seedToken) {
  const mode = prefs.mode || 'smart';
  const focusSkillId = prefs.focusSkillId || '';
  let candidates = ARITHMETIC_TEMPLATES.filter((templateRef) => {
    if (mode === 'speed' && !templateRef.speedFriendly) return false;
    if ((mode === 'skill' || mode === 'speed') && focusSkillId) return templateRef.skillIds.includes(focusSkillId);
    return true;
  });
  if (mode === 'clinic') {
    const weakSkills = new Set(statusRows(data, now).filter((row) => row.status === 'weak').map((row) => row.skillId));
    const recentWrong = new Set((data.recentAttempts || []).slice(-20).filter((attempt) => !attempt.correct).flatMap((attempt) => attempt.skillIds || []));
    candidates = ARITHMETIC_TEMPLATES.filter((templateRef) => templateRef.skillIds.some((skillId) => weakSkills.has(skillId) || recentWrong.has(skillId)));
  }
  if (!candidates.length) candidates = ARITHMETIC_TEMPLATES.slice();
  const recentTemplateIds = (data.recentAttempts || []).slice(-6).map((attempt) => attempt.templateId);
  const weights = candidates.map((templateRef) => {
    const strength = average(templateRef.skillIds.map((skillId) => normaliseNode(data.skills[skillId]).strength || 0.25));
    let weight = 1 + (1 - strength) * 4;
    if (templateRef.skillIds.some((skillId) => arithmeticStatusFromNode(data.skills[skillId], now) === 'weak')) weight += 2;
    if (templateRef.skillIds.some((skillId) => arithmeticStatusFromNode(data.skills[skillId], now) === 'due')) weight += 1.4;
    const repeats = recentTemplateIds.filter((id) => id === templateRef.id).length;
    if (repeats) weight *= Math.pow(0.45, repeats);
    return Math.max(0.05, weight);
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  let roll = (hashString(seedToken) / 0xffffffff) * total;
  for (let index = 0; index < candidates.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return candidates[index];
  }
  return candidates[candidates.length - 1];
}

function generateNextQuestion({ data, prefs, now, requestId, sessionId, position }) {
  const retry = chooseDueRetry(data, prefs.mode, prefs.focusSkillId, now);
  if (retry) return generateArithmeticQuestion({ templateId: retry.templateId, seed: retry.questionSeed, difficulty: retry.difficulty });
  const seedToken = `${requestId}:${sessionId}:${position}:${data.recentAttempts.length}`;
  const templateRef = chooseTemplate(data, prefs, now, seedToken);
  const difficulty = difficultyForTemplate(data, templateRef, prefs.mode);
  return generateArithmeticQuestion({ templateId: templateRef.id, seed: hashString(seedToken), difficulty });
}

function buildPaper(form, requestId) {
  const blueprint = form === 'full' ? ARITHMETIC_TEST_BLUEPRINT_FULL : ARITHMETIC_TEST_BLUEPRINT_SHORT;
  return blueprint.map((slot, index) => ({
    index,
    question: generateArithmeticQuestion({ templateId: slot.templateId, difficulty: slot.difficulty, seed: hashString(`${requestId}:paper:${index}:${slot.templateId}`) }),
    response: {},
    working: '',
    result: null,
    status: 'blank',
  }));
}

function sessionTargetFor(goal) {
  if (goal === '20q') return 20;
  if (goal === '10q') return 10;
  return 0;
}

function goalComplete(session, data, now) {
  if (!session || session.mode === 'test') return false;
  if (session.goal === 'due') return session.dueStart > 0 && dueCount(data, now) === 0;
  const target = sessionTargetFor(session.goal);
  return target > 0 && (Number(session.answered) || 0) >= target;
}

function sessionSummary(session) {
  if (!session) return null;
  return {
    id: session.id,
    mode: session.mode,
    goal: session.goal,
    answered: session.answered || 0,
    correct: session.correct || 0,
    score: session.score || 0,
    maxScore: session.maxScore || 0,
    completedAt: session.completedAt || null,
  };
}

function practiceSessionRecord(learnerId, session, now, status = 'completed') {
  if (!session) return null;
  return {
    id: session.id,
    learnerId,
    subjectId: 'arithmetic',
    sessionKind: session.mode === 'test' ? 'test' : 'practice',
    status,
    startedAt: session.startedAt,
    updatedAt: iso(now),
    completedAt: status === 'completed' ? iso(now) : session.completedAt || null,
    sessionState: clone(session),
    summary: sessionSummary(session),
  };
}

function noChangeResult(state, data, now) {
  return {
    changed: false,
    state,
    data,
    events: [],
    stats: buildArithmeticStats(data, now),
    analytics: buildArithmeticAnalytics(data, now),
    practiceSession: null,
  };
}

function expectedSessionMatches(state, payload) {
  const expectedSessionId = typeof payload?.expectedSessionId === 'string' ? payload.expectedSessionId : '';
  return Boolean(expectedSessionId && state.session?.id) && state.session.id === expectedSessionId;
}

function expectedQuestionMatches(state, payload) {
  const expectedQuestionId = typeof payload?.expectedQuestionId === 'string' ? payload.expectedQuestionId : '';
  if (!expectedQuestionId) return false;
  const session = state.session;
  if (!session) return false;
  if (session.mode === 'test') {
    const index = Math.max(0, Math.min((session.paper?.length || 1) - 1, Number(payload?.index ?? session.currentIndex) || 0));
    return arithmeticPublicQuestionId({ sessionId: session.id, question: session.paper?.[index]?.question || null, index }) === expectedQuestionId;
  }
  return arithmeticPublicQuestionId({ sessionId: session.id, question: session.currentQuestion || null, index: session.currentIndex || 0 }) === expectedQuestionId;
}

function activeQuestionMatchesWhenPresent(state, payload) {
  if (!state.session?.currentQuestion) return true;
  return expectedQuestionMatches(state, payload);
}

function activeSessionCanAcceptSubmit(state) {
  const session = state.session;
  if (!session || session.status !== 'active') return false;
  if (session.mode !== 'test' && (session.waitingForContinue || state.feedback)) return false;
  return true;
}

function event(id, type, now, payload) {
  return { id, type, timestamp: iso(now), createdAt: iso(now), ...payload };
}

function rewardUnitAlreadySecured(data, unitId) {
  return Boolean(data.rewardUnits?.[unitId]?.secured);
}

function markRewardUnit(data, unitId, now) {
  const current = data.rewardUnits[unitId] || {};
  data.rewardUnits[unitId] = { ...current, secured: true, securedAt: iso(now) };
}

function applyLearning({ learnerId, data, question, result, response, now, requestId, sessionQuestion }) {
  const quality = outcomeQuality(result, sessionQuestion);
  bumpStreak(data, now);
  for (const skillId of question.skillIds || []) updateNode(ensureSkill(data, skillId), quality, now);
  updateNode(ensureTemplate(data, question.templateId), quality, now);
  if (result.misconception) bumpMisconception(data, result.misconception, now);
  maybeQueueRetry(data, question, result, now);
  const attempt = {
    id: uid('arith_attempt', learnerId, requestId, question.id, data.recentAttempts.length),
    timestamp: iso(now),
    templateId: question.templateId,
    questionId: question.id,
    skillIds: question.skillIds || [],
    score: result.score,
    maxScore: result.maxScore,
    correct: result.correct,
    misconception: result.misconception || null,
    response: clone(response),
  };
  recordAttempt(data, attempt);
  const events = [event(uid('arith_answer', learnerId, requestId, question.id), ARITHMETIC_EVENT_TYPES.ANSWER_SUBMITTED, now, {
    learnerId,
    subjectId: 'arithmetic',
    questionId: question.id,
    templateId: question.templateId,
    skillIds: question.skillIds || [],
    score: result.score,
    maxScore: result.maxScore,
    correct: result.correct,
    misconception: result.misconception || null,
  })];

  const unitId = arithmeticRewardUnitIdForQuestion(question);
  const unit = ARITHMETIC_REWARD_UNIT_MAP[unitId];
  if (result.correct && unit && !rewardUnitAlreadySecured(data, unitId)) {
    markRewardUnit(data, unitId, now);
    events.push(event(uid('arith_reward', learnerId, unitId), ARITHMETIC_EVENT_TYPES.REWARD_UNIT_SECURED, now, {
      learnerId,
      subjectId: 'arithmetic',
      rewardUnitId: unitId,
      templateId: question.templateId,
      difficulty: question.difficulty,
      strand: unit.strand,
      skillIds: unit.skillIds || question.skillIds || [],
      contentReleaseId: ARITHMETIC_CONTENT_RELEASE_ID,
      masteryKey: `${ARITHMETIC_CONTENT_RELEASE_ID}:arithmetic-unit:${unitId}`,
    }));
  }
  return events;
}

function completeSession({ learnerId, state, data, now, requestId, auto = false }) {
  if (!state.session) return [];
  state.session.status = 'completed';
  state.session.completedAt = iso(now);
  state.summary = { ...sessionSummary(state.session), autoCompleted: Boolean(auto) };
  state.feedback = null;
  state.phase = 'summary';
  data.sessions.push({ ...state.summary, createdAt: iso(now) });
  data.sessions = data.sessions.slice(-80);
  return [event(uid('arith_complete', learnerId, requestId, state.session.id), ARITHMETIC_EVENT_TYPES.SESSION_COMPLETED, now, {
    learnerId,
    subjectId: 'arithmetic',
    sessionId: state.session.id,
    mode: state.session.mode,
    answered: state.session.answered || 0,
    correct: state.session.correct || 0,
    score: state.session.score || 0,
    maxScore: state.session.maxScore || 0,
  })];
}

function startSession({ learnerId, state, data, payload, requestId, now }) {
  const prefs = normaliseArithmeticPrefs({ ...data.prefs, ...(payload || {}) });
  data.prefs = prefs;
  const sessionId = uid('arith_session', learnerId, requestId, now);
  const session = {
    id: sessionId,
    mode: prefs.mode,
    goal: prefs.goal,
    focusSkillId: prefs.focusSkillId,
    testForm: prefs.testForm,
    startedAt: iso(now),
    status: 'active',
    answered: 0,
    correct: 0,
    score: 0,
    maxScore: 0,
    dueStart: dueCount(data, now),
    currentQuestion: null,
    currentIndex: 0,
    paper: null,
    heroContext: payload?.heroContext || null,
  };
  if (prefs.mode === 'test') {
    session.paper = buildPaper(prefs.testForm, requestId);
    session.currentQuestion = session.paper[0]?.question || null;
    session.maxScore = session.paper.reduce((sum, entry) => sum + (entry.question?.marks || 1), 0);
    state.phase = 'test';
  } else {
    session.currentQuestion = generateNextQuestion({ data, prefs, now, requestId, sessionId, position: 0 });
    state.phase = 'session';
  }
  state.prefs = prefs;
  state.session = session;
  state.feedback = null;
  state.summary = null;
  state.error = '';
  return [event(uid('arith_start', learnerId, requestId, sessionId), ARITHMETIC_EVENT_TYPES.SESSION_STARTED, now, {
    learnerId,
    subjectId: 'arithmetic',
    sessionId,
    mode: prefs.mode,
    goal: prefs.goal,
  })];
}

function submitPractice({ learnerId, state, data, payload, requestId, now }) {
  const session = state.session;
  if (!session?.currentQuestion) return [];
  const response = payload?.response || {};
  const question = session.currentQuestion;
  const sessionQuestion = { attempts: 0 };
  const result = evaluateArithmeticQuestion(question, response);
  const events = applyLearning({ learnerId, data, question, result, response, now, requestId, sessionQuestion });
  session.answered += 1;
  if (result.correct) session.correct += 1;
  session.score += result.score;
  session.maxScore += result.maxScore;
  state.feedback = { questionId: question.id, result, response, solutionLines: question.solutionLines || [], checkLine: question.checkLine || '' };
  if (goalComplete(session, data, now)) {
    events.push(...completeSession({ learnerId, state, data, now, requestId }));
  } else {
    session.waitingForContinue = true;
    state.phase = 'session';
  }
  return events;
}

function submitTestSave({ state, payload }) {
  const session = state.session;
  if (!session?.paper) return;
  const index = Math.max(0, Math.min(session.paper.length - 1, Number(payload?.index ?? session.currentIndex) || 0));
  const entry = session.paper[index];
  if (entry) {
    entry.response = clone(payload?.response || {});
    entry.working = String(payload?.working || '');
    entry.status = Object.values(entry.response || {}).some((v) => String(v || '').trim()) ? 'saved' : 'blank';
  }
  const nextIndex = payload?.advance === false ? index : Math.min(session.paper.length - 1, index + 1);
  session.currentIndex = nextIndex;
  session.currentQuestion = session.paper[nextIndex]?.question || null;
}

function finishTest({ learnerId, state, data, payload, requestId, now }) {
  const session = state.session;
  if (!session?.paper) return [];
  submitTestSave({ state, payload });
  const events = [];
  session.answered = 0;
  session.correct = 0;
  session.score = 0;
  session.maxScore = 0;
  for (const entry of session.paper) {
    const result = evaluateArithmeticQuestion(entry.question, entry.response || {});
    entry.result = result;
    entry.status = result.correct ? 'correct' : result.score > 0 ? 'partial' : 'wrong';
    session.answered += Object.values(entry.response || {}).some((v) => String(v || '').trim()) ? 1 : 0;
    if (result.correct) session.correct += 1;
    session.score += result.score;
    session.maxScore += result.maxScore;
    events.push(...applyLearning({ learnerId, data, question: entry.question, result, response: entry.response || {}, now, requestId, sessionQuestion: { attempts: 0 } }));
  }
  events.push(...completeSession({ learnerId, state, data, now, requestId, auto: Boolean(payload?.auto) }));
  return events;
}

function continueSession({ learnerId, state, data, requestId, now }) {
  const session = state.session;
  if (!session || session.status !== 'active' || session.mode === 'test') return [];
  session.currentQuestion = generateNextQuestion({ data, prefs: state.prefs, now, requestId, sessionId: session.id, position: session.answered || 0 });
  session.currentIndex = session.answered || 0;
  session.waitingForContinue = false;
  state.feedback = null;
  state.phase = 'session';
  return [];
}

export function createServerArithmeticEngine({ now = Date.now } = {}) {
  function apply({ learnerId, subjectRecord, command, payload = {}, requestId = '' } = {}) {
    const nowValue = Number(now());
    const data = normaliseData(subjectRecord?.data || {});
    const state = normaliseState(subjectRecord?.ui || {}, data);
    const events = [];

    if (command === 'start-session') events.push(...startSession({ learnerId, state, data, payload, requestId, now: nowValue }));
    else if (command === 'submit-answer') {
      if (!expectedSessionMatches(state, payload) || !expectedQuestionMatches(state, payload) || !activeSessionCanAcceptSubmit(state)) {
        return noChangeResult(state, data, nowValue);
      }
      if (state.session?.mode === 'test') submitTestSave({ state, payload });
      else events.push(...submitPractice({ learnerId, state, data, payload, requestId, now: nowValue }));
    } else if (command === 'finish-test') {
      if (!expectedSessionMatches(state, payload) || !expectedQuestionMatches(state, payload) || state.session?.mode !== 'test' || state.session?.status !== 'active') {
        return noChangeResult(state, data, nowValue);
      }
      events.push(...finishTest({ learnerId, state, data, payload, requestId, now: nowValue }));
    }
    else if (command === 'continue-session') {
      if (!expectedSessionMatches(state, payload) || !expectedQuestionMatches(state, payload) || state.session?.mode === 'test' || !state.session?.waitingForContinue) {
        return noChangeResult(state, data, nowValue);
      }
      events.push(...continueSession({ learnerId, state, data, requestId, now: nowValue }));
    } else if (command === 'end-session') {
      if (!expectedSessionMatches(state, payload) || !activeQuestionMatchesWhenPresent(state, payload) || state.session?.status !== 'active') {
        return noChangeResult(state, data, nowValue);
      }
      events.push(...completeSession({ learnerId, state, data, now: nowValue, requestId }));
    }
    else if (command === 'save-prefs') {
      data.prefs = normaliseArithmeticPrefs({ ...data.prefs, ...(payload?.prefs || payload || {}) });
      state.prefs = data.prefs;
    } else if (command === 'reset-learner') {
      const resetState = createInitialArithmeticState();
      const resetData = createInitialArithmeticData();
      return {
        changed: true,
        state: resetState,
        data: resetData,
        events: [event(uid('arith_reset', learnerId, requestId, nowValue), ARITHMETIC_EVENT_TYPES.LEARNER_RESET, nowValue, { learnerId, subjectId: 'arithmetic' })],
        stats: buildArithmeticStats(resetData, nowValue),
        analytics: buildArithmeticAnalytics(resetData, nowValue),
        practiceSession: null,
      };
    } else {
      return { changed: false, state, data, events: [], stats: buildArithmeticStats(data, nowValue), analytics: buildArithmeticAnalytics(data, nowValue), practiceSession: null };
    }

    return {
      changed: true,
      state,
      data,
      events,
      stats: buildArithmeticStats(data, nowValue),
      analytics: buildArithmeticAnalytics(data, nowValue),
      practiceSession: state.session ? practiceSessionRecord(learnerId, state.session, nowValue, state.session.status === 'completed' ? 'completed' : 'active') : null,
    };
  }
  return { apply };
}

export const __arithmeticEngineInternals = Object.freeze({
  buildStats: buildArithmeticStats,
  buildAnalytics: buildArithmeticAnalytics,
  normalisePrefs: normaliseArithmeticPrefs,
});
