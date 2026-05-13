import {
  REASONING_CONTENT_RELEASE_ID,
  REASONING_MISCONCEPTIONS,
  REASONING_MINIMAL_HINTS,
  REASONING_SATS_SET_BLUEPRINTS,
  REASONING_SKILLS,
  REASONING_TEMPLATES,
  evaluateReasoningQuestion,
  generateReasoningQuestion,
  reasoningContentSummary,
  safeReasoningQuestion,
} from '../../../../shared/reasoning/content.js';

const TEMPLATE_MAP = Object.freeze(Object.fromEntries(REASONING_TEMPLATES.map((template) => [template.id, template])));
const SKILL_IDS = Object.freeze(Object.keys(REASONING_SKILLS));
const DEFAULT_ROUND_LENGTH = 6;

const DEFAULT_PREFS = Object.freeze({
  mode: 'smart',
  focusSkillId: '',
  roundLength: DEFAULT_ROUND_LENGTH,
  setSize: 8,
  viewMode: 'one',
});

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function uid(prefix = 'reasoning') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function randomInt(random, min, max) {
  const raw = typeof random === 'function' ? Number(random()) : Math.random();
  const bounded = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999, raw)) : 0;
  return Math.floor(bounded * (max - min + 1)) + min;
}

function newSeed(random, salt = 0) {
  const base = randomInt(random, 1, 1_000_000_000);
  if (!salt) return base;
  return (((base + (Number(salt) || 0) * 104_729 - 1) % 1_000_000_000) + 1);
}

function normalisePrefs(raw = {}) {
  const mode = ['smart', 'skill', 'trouble', 'worked', 'faded', 'sats', 'satsset'].includes(raw.mode) ? raw.mode : 'smart';
  const focusSkillId = Object.prototype.hasOwnProperty.call(REASONING_SKILLS, raw.focusSkillId || raw.skillId)
    ? (raw.focusSkillId || raw.skillId)
    : '';
  const roundLength = clamp(Math.round(Number(raw.roundLength) || DEFAULT_ROUND_LENGTH), 3, 12);
  const setSize = [8, 12].includes(Number(raw.setSize)) ? Number(raw.setSize) : 8;
  const viewMode = raw.viewMode === 'list' ? 'list' : 'one';
  return { ...DEFAULT_PREFS, mode, focusSkillId, roundLength, setSize, viewMode };
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

function nodeStatus(node, nowValue = Date.now()) {
  if (!node || !node.attempts) return 'new';
  if ((node.wrong || 0) > (node.correct || 0) + 1) return 'weak';
  if ((node.attempts || 0) >= 2 && (node.strength || 0) < 0.42) return 'weak';
  if ((node.dueAt || 0) <= nowValue) return 'due';
  if ((node.strength || 0) >= 0.82 && (node.intervalDays || 0) >= 7 && (node.correctStreak || 0) >= 3) return 'secured';
  return 'learning';
}

function ensureNode(map, key) {
  if (!map[key]) map[key] = defaultNode();
  return map[key];
}

function defaultData() {
  return {
    version: 1,
    releaseId: REASONING_CONTENT_RELEASE_ID,
    prefs: clone(DEFAULT_PREFS),
    skills: {},
    templates: {},
    items: {},
    misconceptions: {},
    retryQueue: [],
    recentTemplateStarts: [],
    events: [],
    sessions: [],
    evidenceKeys: [],
    lastPracticeDay: null,
    streakDays: 0,
  };
}

function defaultState(learnerId = '') {
  return {
    subjectId: 'reasoning',
    version: 1,
    learnerId,
    releaseId: REASONING_CONTENT_RELEASE_ID,
    phase: 'setup',
    prefs: clone(DEFAULT_PREFS),
    session: null,
    feedback: null,
    summary: null,
    error: '',
  };
}

function normaliseData(raw = {}) {
  const data = { ...defaultData(), ...(raw && typeof raw === 'object' ? clone(raw) : {}) };
  data.prefs = normalisePrefs(data.prefs || {});
  data.skills = data.skills || {};
  data.templates = data.templates || {};
  data.items = data.items || {};
  data.misconceptions = data.misconceptions || {};
  data.retryQueue = Array.isArray(data.retryQueue) ? data.retryQueue.filter((entry) => entry?.templateId) : [];
  data.recentTemplateStarts = Array.isArray(data.recentTemplateStarts) ? data.recentTemplateStarts.slice(-40) : [];
  data.events = Array.isArray(data.events) ? data.events.slice(-700) : [];
  data.sessions = Array.isArray(data.sessions) ? data.sessions.slice(-100) : [];
  data.evidenceKeys = Array.isArray(data.evidenceKeys) ? data.evidenceKeys.filter(Boolean).slice(-2000) : [];
  return data;
}

function normaliseState(raw = {}, learnerId = '') {
  const state = { ...defaultState(learnerId), ...(raw && typeof raw === 'object' ? clone(raw) : {}) };
  state.subjectId = 'reasoning';
  state.learnerId = learnerId;
  state.releaseId = REASONING_CONTENT_RELEASE_ID;
  state.prefs = normalisePrefs(state.prefs || {});
  state.error = state.error || '';
  return state;
}

function todayKey(ts = Date.now()) {
  const d = new Date(ts);
  return [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0'), String(d.getUTCDate()).padStart(2, '0')].join('-');
}

function diffDays(aKey, bKey) {
  const a = new Date(`${aKey}T00:00:00Z`);
  const b = new Date(`${bKey}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function updateStreak(data, nowValue) {
  const today = todayKey(nowValue);
  if (!data.lastPracticeDay) {
    data.lastPracticeDay = today;
    data.streakDays = 1;
    return;
  }
  if (data.lastPracticeDay === today) return;
  const gap = diffDays(data.lastPracticeDay, today);
  data.streakDays = gap === 1 ? (data.streakDays || 0) + 1 : 1;
  data.lastPracticeDay = today;
}

function outcomeQuality(result, attemptCount, supportLevel, strict) {
  if (result.correct) {
    if (strict) return 5;
    if (supportLevel >= 2) return 3;
    if (supportLevel === 1) return attemptCount === 1 ? 3.4 : 3;
    if (attemptCount <= 1) return 5;
    if (attemptCount === 2) return 3.6;
    return 3.2;
  }
  if (result.score > 0) return 1.5;
  return 0;
}

function updateNodeFromQuality(node, quality, nowValue) {
  node.attempts += 1;
  node.lastSeenAt = new Date(nowValue).toISOString();
  if (quality >= 4.8) {
    node.correct += 1;
    node.correctStreak += 1;
    node.strength = clamp(node.strength + 0.13, 0.05, 0.99);
    node.intervalDays = node.intervalDays ? Math.min(45, node.intervalDays * 2) : 1;
    node.dueAt = nowValue + node.intervalDays * 86_400_000;
  } else if (quality >= 4) {
    node.correct += 1;
    node.correctStreak += 1;
    node.strength = clamp(node.strength + 0.09, 0.05, 0.98);
    node.intervalDays = node.intervalDays ? Math.min(28, node.intervalDays * 1.7) : 1;
    node.dueAt = nowValue + node.intervalDays * 86_400_000;
  } else if (quality >= 3) {
    node.correct += 1;
    node.correctStreak = Math.max(1, node.correctStreak);
    node.strength = clamp(node.strength + 0.04, 0.05, 0.95);
    node.intervalDays = node.intervalDays ? Math.max(0.25, node.intervalDays * 0.9) : 0.25;
    node.dueAt = nowValue + Math.max(6 * 3_600_000, node.intervalDays * 86_400_000);
  } else {
    node.wrong += 1;
    node.correctStreak = 0;
    node.strength = clamp(node.strength - (quality > 0 ? 0.08 : 0.15), 0.02, 0.95);
    node.intervalDays = Math.max(0.04, (node.intervalDays || 0.2) * 0.45);
    node.dueAt = nowValue + (quality > 0 ? 20 : 12) * 60_000;
    node.lastWrongAt = new Date(nowValue).toISOString();
  }
}

function bumpMisconception(data, tag, nowValue) {
  if (!tag) return;
  if (!data.misconceptions[tag]) data.misconceptions[tag] = { count: 0, lastSeenAt: null };
  data.misconceptions[tag].count += 1;
  data.misconceptions[tag].lastSeenAt = new Date(nowValue).toISOString();
}

function questionFromRef(ref) {
  if (!ref?.templateId) return null;
  return generateReasoningQuestion(ref.templateId, ref.seed);
}

function currentQuestionRef(session) {
  return session?.questionRefs?.[session.currentQuestionIndex || 0] || null;
}

function currentQuestion(session) {
  return questionFromRef(currentQuestionRef(session));
}

function responseHasValue(value) {
  if (Array.isArray(value)) return value.some(responseHasValue);
  if (value && typeof value === 'object') return Object.values(value).some(responseHasValue);
  return String(value == null ? '' : value).trim() !== '';
}

function totalMarks(session) {
  return (session?.questionRefs || []).reduce((sum, ref) => sum + (questionFromRef(ref)?.marks || 0), 0);
}

function currentScore(session) {
  return Object.values(session?.results || {}).reduce((sum, result) => sum + (Number(result?.score) || 0), 0);
}

function markedCount(session) {
  return Object.keys(session?.results || {}).length;
}

function answeredCount(session) {
  return (session?.questionRefs || []).filter((ref) => responseHasValue(session?.responses?.[ref.itemId])).length;
}

function sessionComplete(session) {
  return !!session && markedCount(session) >= (session.questionRefs || []).length;
}

function resultStatus(session, ref) {
  const result = session?.results?.[ref.itemId] || null;
  if (result) return result.correct ? 'correct' : result.score > 0 ? 'partial' : 'wrong';
  return responseHasValue(session?.responses?.[ref.itemId]) ? 'saved' : 'blank';
}

function templateWeakness(data, template, nowValue) {
  const tNode = data.templates[template.id] || defaultNode();
  const skillNodes = (template.skillIds || []).map((id) => data.skills[id] || defaultNode());
  let score = 1 + (1 - (tNode.strength || 0.25)) * 2;
  score += average(skillNodes.map((node) => 1 - (node.strength || 0.25))) * 3;
  if (!tNode.attempts) score += 0.8;
  if (tNode.dueAt && tNode.dueAt <= nowValue) score += 1.6;
  if (skillNodes.some((node) => node.lastWrongAt && nowValue - new Date(node.lastWrongAt).getTime() < 3 * 86_400_000)) score += 1.4;
  const recentCount = (data.recentTemplateStarts || []).slice(-12).filter((entry) => entry.templateId === template.id).length;
  score *= Math.pow(0.58, recentCount);
  const recentSkillIds = data.events.slice(-10).flatMap((event) => event.skillIds || []);
  const repeatSkills = (template.skillIds || []).filter((id) => recentSkillIds.includes(id)).length;
  if (repeatSkills >= 2) score *= 0.75;
  return Math.max(0.05, score);
}

function weightedPick(weighted, random) {
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = (typeof random === 'function' ? random() : Math.random()) * total;
  for (const [item, weight] of weighted) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  return weighted[weighted.length - 1]?.[0] || null;
}

function weakSkillIds(data, nowValue) {
  return SKILL_IDS.slice().sort((a, b) => {
    const A = data.skills[a] || defaultNode();
    const B = data.skills[b] || defaultNode();
    const scoreA = (1 - (A.strength || 0.25)) + ((A.wrong || 0) / Math.max(1, A.attempts || 0)) + (nodeStatus(A, nowValue) === 'due' ? 0.5 : 0);
    const scoreB = (1 - (B.strength || 0.25)) + ((B.wrong || 0) / Math.max(1, B.attempts || 0)) + (nodeStatus(B, nowValue) === 'due' ? 0.5 : 0);
    return scoreB - scoreA;
  });
}

function takeDueRetry(data, focusSkillId, nowValue) {
  const due = data.retryQueue
    .filter((entry) => entry.dueAt <= nowValue && (!focusSkillId || (entry.skillIds || []).includes(focusSkillId)))
    .sort((a, b) => a.dueAt - b.dueAt);
  return due[0] || null;
}

function removeRetryForRef(data, ref) {
  if (!ref?.templateId) return;
  data.retryQueue = (data.retryQueue || []).filter((entry) => (
    entry.templateId !== ref.templateId || Number(entry.seed) !== Number(ref.seed)
  ));
}

function unspentCandidatePool(candidates, usedTemplateIds = []) {
  const usedIds = (usedTemplateIds || []).filter(Boolean);
  const used = new Set(usedIds);
  if (!used.size) return candidates;
  const fresh = candidates.filter((template) => !used.has(template.id));
  if (fresh.length) return fresh;
  if (!candidates.length) return candidates;
  const offset = usedIds.length % candidates.length;
  return candidates.slice(offset).concat(candidates.slice(0, offset));
}

function chooseTemplate(data, prefs, mode, random, nowValue, usedTemplateIds = []) {
  const weakSet = new Set(weakSkillIds(data, nowValue).slice(0, 6));
  let candidates = REASONING_TEMPLATES.filter((template) => {
    if (prefs.focusSkillId && mode === 'skill') return template.skillIds.includes(prefs.focusSkillId);
    if (mode === 'trouble') return template.skillIds.some((id) => weakSet.has(id));
    if ((mode === 'sats' || mode === 'satsset') && !template.satsFriendly) return false;
    return true;
  });
  if (!candidates.length) candidates = REASONING_TEMPLATES.slice();
  candidates = unspentCandidatePool(candidates, usedTemplateIds);
  const weighted = candidates.map((template) => {
    let weight = templateWeakness(data, template, nowValue);
    if (prefs.focusSkillId && template.skillIds.includes(prefs.focusSkillId)) weight *= 2.1;
    const priorUses = usedTemplateIds.filter((id) => id === template.id).length;
    if (priorUses) weight *= Math.pow(0.32, priorUses);
    if (mode === 'worked' || mode === 'faded') {
      const skillStatuses = (template.skillIds || []).map((id) => nodeStatus(data.skills[id] || defaultNode(), nowValue));
      if (skillStatuses.includes('new') || skillStatuses.includes('weak')) weight *= 1.5;
    }
    return [template, Math.max(0.05, weight)];
  });
  return weightedPick(weighted, random) || REASONING_TEMPLATES[0];
}

function chooseTemplateForSatsSlot(data, skillPool, random, nowValue, usedTemplateIds = []) {
  let candidates = REASONING_TEMPLATES.filter((template) => template.satsFriendly && template.skillIds.some((id) => skillPool.includes(id)));
  if (!candidates.length) candidates = REASONING_TEMPLATES.filter((template) => template.satsFriendly);
  candidates = unspentCandidatePool(candidates, usedTemplateIds);
  const weighted = candidates.map((template) => {
    const priorUses = usedTemplateIds.filter((id) => id === template.id).length;
    const weight = templateWeakness(data, template, nowValue) * (priorUses ? Math.pow(0.28, priorUses) : 1);
    return [template, Math.max(0.05, weight)];
  });
  return weightedPick(weighted, random) || REASONING_TEMPLATES[0];
}

function buildQuestionRef(template, seed) {
  return { templateId: template.id, seed, itemId: `${template.id}:${seed}` };
}

function publicQuestionId(index) {
  return `q${index + 1}`;
}

function questionIndexForRef(session, ref) {
  if (!session || !ref) return -1;
  return (session.questionRefs || []).findIndex((itemRef) => itemRef === ref || itemRef.itemId === ref.itemId);
}

function publicQuestionIdForRef(session, ref) {
  const index = questionIndexForRef(session, ref);
  return index >= 0 ? publicQuestionId(index) : '';
}

function expectedQuestionMatches(session, ref, expectedQuestionId) {
  const expected = String(expectedQuestionId || '');
  if (!expected) return true;
  return expected === ref?.itemId || expected === publicQuestionIdForRef(session, ref);
}

function responseForRef(responses, session, ref) {
  if (!responses || typeof responses !== 'object' || !ref?.itemId) return { found: false, value: undefined };
  const publicId = publicQuestionIdForRef(session, ref);
  if (publicId && Object.prototype.hasOwnProperty.call(responses, publicId)) {
    return { found: true, value: responses[publicId] };
  }
  if (Object.prototype.hasOwnProperty.call(responses, ref.itemId)) {
    return { found: true, value: responses[ref.itemId] };
  }
  return { found: false, value: undefined };
}

function buildQuestionRefs(data, prefs, { nowValue, random }) {
  const mode = prefs.mode;
  const due = ['smart', 'skill', 'trouble'].includes(mode) ? takeDueRetry(data, mode === 'skill' ? prefs.focusSkillId : '', nowValue) : null;
  if (due) return [buildQuestionRef(TEMPLATE_MAP[due.templateId] || REASONING_TEMPLATES[0], due.seed)];
  if (mode === 'satsset') {
    const size = prefs.setSize || 8;
    const blueprint = prefs.focusSkillId
      ? Array.from({ length: size }, () => [prefs.focusSkillId])
      : (REASONING_SATS_SET_BLUEPRINTS[size] || Array.from({ length: size }, () => []));
    const used = [];
    return Array.from({ length: size }, (_, index) => {
      const template = chooseTemplateForSatsSlot(data, blueprint[index] || [], random, nowValue, used);
      used.push(template.id);
      return buildQuestionRef(template, newSeed(random, index + 1));
    });
  }
  const length = mode === 'sats' ? 1 : prefs.roundLength;
  const used = [];
  return Array.from({ length }, (_, index) => {
    const template = chooseTemplate(data, prefs, mode, random, nowValue, used);
    used.push(template.id);
    return buildQuestionRef(template, newSeed(random, index + 1));
  });
}

function presentationFor(mode) {
  if (mode === 'worked') return 'worked';
  if (mode === 'faded') return 'faded';
  return 'independent';
}

function buildSession(data, prefs, { nowValue, random, heroContext } = {}) {
  const questionRefs = buildQuestionRefs(data, prefs, { nowValue, random });
  if (!questionRefs.length) return null;
  for (const ref of questionRefs) data.recentTemplateStarts.push({ templateId: ref.templateId, at: nowValue });
  data.recentTemplateStarts = data.recentTemplateStarts.slice(-40);
  const presentation = presentationFor(prefs.mode);
  const support = {};
  if (presentation === 'worked' || presentation === 'faded') {
    const level = presentation === 'worked' ? 2 : 1;
    for (const ref of questionRefs) support[ref.itemId] = { level, requestedAt: nowValue, seededByMode: true };
  }
  return {
    id: uid('reasoning_session'),
    mode: prefs.mode,
    strict: prefs.mode === 'sats' || prefs.mode === 'satsset',
    delayedFeedback: prefs.mode === 'satsset' || prefs.viewMode === 'list',
    presentation,
    startedAt: nowValue,
    timeLimitMin: prefs.mode === 'satsset' ? (prefs.setSize === 12 ? 30 : 20) : null,
    currentQuestionIndex: 0,
    viewMode: prefs.mode === 'satsset' ? 'list' : prefs.viewMode,
    questionRefs,
    responses: {},
    results: {},
    attempts: {},
    support,
    heroContext: heroContext || null,
  };
}

function buildQuestionNav(session) {
  return (session?.questionRefs || []).map((ref, index) => {
    const result = session.results?.[ref.itemId] || null;
    const q = questionFromRef(ref);
    const item = {
      id: publicQuestionId(index),
      index,
      current: index === session.currentQuestionIndex,
      status: resultStatus(session, ref),
      score: result?.score ?? null,
      maxScore: q?.marks || 0,
    };
    if (result || (session.support?.[ref.itemId]?.level > 0)) item.templateId = ref.templateId;
    return item;
  });
}

function buildSessionReadModel(session, includeFeedbackForAll = false) {
  if (!session) return null;
  const ref = currentQuestionRef(session);
  const question = currentQuestion(session);
  const result = session.results?.[ref?.itemId] || null;
  return {
    id: session.id,
    mode: session.mode,
    strict: !!session.strict,
    delayedFeedback: !!session.delayedFeedback,
    presentation: session.presentation || 'independent',
    startedAt: session.startedAt,
    timeLimitMin: session.timeLimitMin || null,
    currentQuestionIndex: session.currentQuestionIndex || 0,
    questionCount: session.questionRefs.length,
    markedCount: markedCount(session),
    answeredCount: answeredCount(session),
    score: currentScore(session),
    maxScore: totalMarks(session),
    questionNav: buildQuestionNav(session),
    questions: (session.questionRefs || []).map((itemRef, index) => {
      const itemQuestion = questionFromRef(itemRef);
      const itemResult = session.results?.[itemRef.itemId] || null;
      return {
        ...safeReasoningQuestion(itemQuestion, {
          includeSkill: Boolean(itemResult),
          includeFeedback: Boolean(itemResult) || includeFeedbackForAll || (session.support?.[itemRef.itemId]?.level > 0),
          publicId: publicQuestionId(index),
        }),
        index,
        status: resultStatus(session, itemRef),
        response: clone(session.responses?.[itemRef.itemId] || {}),
        result: itemResult ? clone(itemResult) : null,
        supportLevel: session.support?.[itemRef.itemId]?.level || 0,
      };
    }).filter(Boolean),
    currentQuestion: safeReasoningQuestion(question, {
      includeSkill: Boolean(result),
      includeFeedback: Boolean(result) || (session.support?.[ref?.itemId]?.level > 0),
      publicId: publicQuestionIdForRef(session, ref),
    }),
    response: clone(session.responses?.[ref?.itemId] || {}),
    result: result ? clone(result) : null,
    supportLevel: session.support?.[ref?.itemId]?.level || 0,
    heroContext: session.heroContext || null,
  };
}

function buildFeedback(session, feedback) {
  if (!feedback?.questionRef) return null;
  const currentRef = currentQuestionRef(session);
  if (currentRef?.itemId && feedback.questionRef.itemId !== currentRef.itemId) return null;
  const question = questionFromRef(feedback.questionRef);
  const result = feedback.result || null;
  const supportLevel = feedback.supportLevel || session?.support?.[feedback.questionRef.itemId]?.level || 0;
  const final = feedback.final === true;
  const includeFullFeedback = final || supportLevel > 0;
  return {
    question: safeReasoningQuestion(question, {
      includeSkill: includeFullFeedback,
      includeFeedback: includeFullFeedback,
      publicId: publicQuestionIdForRef(session, feedback.questionRef),
    }),
    result: sanitiseFeedbackResult(result, { includeFullFeedback }),
    final,
    supportLevel,
    hint: result?.minimalHint || REASONING_MINIMAL_HINTS[result?.misconception] || '',
    misconceptionLabel: result?.misconception && final ? REASONING_MISCONCEPTIONS[result.misconception] || result.misconception : '',
  };
}

function sanitiseFeedbackResult(result, { includeFullFeedback = false } = {}) {
  if (!result) return null;
  if (includeFullFeedback) return clone(result);
  return {
    correct: Boolean(result.correct),
    score: Number(result.score) || 0,
    maxScore: Number(result.maxScore) || 0,
    feedbackShort: result.feedbackShort || '',
    minimalHint: result.minimalHint || REASONING_MINIMAL_HINTS[result.misconception] || '',
  };
}

function currentRefsForStats(data) {
  return data.events || [];
}

function buildSkillRows(data, nowValue) {
  return SKILL_IDS.map((id) => {
    const node = data.skills[id] || defaultNode();
    const skill = REASONING_SKILLS[id];
    return {
      id,
      name: skill.name,
      domain: skill.domain,
      attempts: node.attempts || 0,
      correct: node.correct || 0,
      wrong: node.wrong || 0,
      strength: Math.round((node.strength || 0.25) * 100),
      status: nodeStatus(node, nowValue),
      dueAt: node.dueAt || 0,
    };
  });
}

function buildTemplateRows(data, nowValue) {
  return REASONING_TEMPLATES.map((template) => {
    const node = data.templates[template.id] || defaultNode();
    return {
      id: template.id,
      label: template.label,
      domain: template.domain,
      attempts: node.attempts || 0,
      correct: node.correct || 0,
      strength: Math.round((node.strength || 0.25) * 100),
      status: nodeStatus(node, nowValue),
    };
  }).sort((a, b) => (a.status === 'weak' ? -1 : 0) - (b.status === 'weak' ? -1 : 0) || a.strength - b.strength).slice(0, 40);
}

function buildAnalytics(data, nowValue) {
  const skills = buildSkillRows(data, nowValue);
  const events = currentRefsForStats(data).slice(-40).reverse();
  const misconceptionPatterns = Object.entries(data.misconceptions || {})
    .map(([id, row]) => ({ id, label: REASONING_MISCONCEPTIONS[id] || id, count: row.count || 0, lastSeenAt: row.lastSeenAt || null }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  return {
    available: true,
    skills,
    templates: buildTemplateRows(data, nowValue),
    misconceptionPatterns,
    recentActivity: events.map((event) => ({
      timestamp: event.timestamp,
      templateId: event.templateId,
      templateLabel: TEMPLATE_MAP[event.templateId]?.label || event.templateId,
      skillIds: event.skillIds || [],
      score: event.score,
      maxScore: event.maxScore,
      correct: event.correct,
      misconception: event.misconception || null,
      supportLevel: event.supportLevel || 0,
      mode: event.mode,
    })),
    reviewQueue: (data.retryQueue || []).filter((entry) => entry.dueAt <= nowValue).slice(0, 12),
  };
}

function buildStats(data, nowValue) {
  const events = data.events || [];
  const total = events.length;
  const correct = events.filter((event) => event.correct).length;
  const independent = events.filter((event) => !event.supportLevel);
  const independentCorrect = independent.filter((event) => event.correct).length;
  const skills = buildSkillRows(data, nowValue);
  const due = skills.filter((row) => row.status === 'due').length + (data.retryQueue || []).filter((entry) => entry.dueAt <= nowValue).length;
  const weak = skills.filter((row) => row.status === 'weak').length;
  const securedSkills = skills.filter((row) => row.status === 'secured').length;
  return {
    overview: {
      totalQuestions: total,
      accuracy: total ? Math.round((correct / total) * 100) : 0,
      independentAccuracy: independent.length ? Math.round((independentCorrect / independent.length) * 100) : 0,
      due,
      weak,
      securedSkills,
      streakDays: data.streakDays || 0,
      evidenceStars: data.evidenceKeys?.length || 0,
      content: reasoningContentSummary(),
    },
    skills,
  };
}

function parentSummary(stats, analytics) {
  const overview = stats?.overview || {};
  if (!overview.totalQuestions) {
    return 'No Reasoning practice has been logged yet. Start with Smart Review to build a baseline across number, calculation, fractions, measure, geometry, statistics and checking.';
  }
  const weakSkills = (analytics?.skills || []).filter((row) => row.status === 'weak' || row.status === 'due').slice(0, 3).map((row) => row.name);
  const weakCopy = weakSkills.length ? ` The next useful focus is ${weakSkills.join(', ')}.` : ' Keep using mixed review to protect secure reasoning.';
  return `Reasoning accuracy is ${overview.accuracy}% across ${overview.totalQuestions} marked questions, with independent accuracy at ${overview.independentAccuracy}%.${weakCopy}`;
}

function buildReadModel({ learnerId, state, data, projections, nowValue }) {
  const stats = buildStats(data, nowValue);
  const analytics = buildAnalytics(data, nowValue);
  return {
    subjectId: 'reasoning',
    version: 1,
    learnerId,
    releaseId: REASONING_CONTENT_RELEASE_ID,
    phase: state.phase || 'setup',
    prefs: state.prefs || data.prefs || clone(DEFAULT_PREFS),
    pendingCommand: '',
    error: state.error || '',
    content: reasoningContentSummary(),
    session: buildSessionReadModel(state.session || null, state.phase === 'summary'),
    feedback: buildFeedback(state.session, state.feedback),
    summary: state.summary ? clone(state.summary) : null,
    stats,
    analytics,
    parentSummary: parentSummary(stats, analytics),
    projections: projections ? { available: true } : undefined,
  };
}

function moveIndex(session, move = {}) {
  if (!session) return false;
  const before = session.currentQuestionIndex || 0;
  const count = session.questionRefs.length;
  if (Number.isFinite(Number(move.questionIndex))) {
    session.currentQuestionIndex = clamp(Math.floor(Number(move.questionIndex)), 0, Math.max(0, count - 1));
    return session.currentQuestionIndex !== before;
  }
  const delta = Number(move.delta) || 0;
  session.currentQuestionIndex = clamp((session.currentQuestionIndex || 0) + delta, 0, Math.max(0, count - 1));
  return session.currentQuestionIndex !== before;
}

function applyMoveQuestion({ state, payload }) {
  if (moveIndex(state.session, payload || {})) state.feedback = null;
}

function storeResponse(session, ref, response) {
  if (!session || !ref?.itemId) return;
  if (session.results?.[ref.itemId]) return;
  session.responses[ref.itemId] = clone(response || {});
}

function enqueueRetry(data, ref, question, result, nowValue, reason = '') {
  if (!ref?.templateId || !question) return;
  data.retryQueue.push({
    templateId: ref.templateId,
    seed: ref.seed,
    dueAt: nowValue + (result.correct ? 6 * 3_600_000 : 15 * 60_000),
    skillIds: question.skillIds || [],
    reason: reason || (result.correct ? 'supported-or-shaky' : 'recent-miss'),
  });
  data.retryQueue = data.retryQueue.sort((a, b) => a.dueAt - b.dueAt).slice(0, 300);
}

function maybeEvidenceEvent({ learnerId, ref, question, result, quality, requestId, nowValue, supportLevel, attemptCount }) {
  if (!result.correct || quality < 4.8 || supportLevel > 0) return null;
  const primarySkill = question.skillIds?.[0] || '';
  if (!primarySkill) return null;
  const bucket = quality >= 4.8 ? 'independent' : supportLevel ? `support-${supportLevel}` : `attempt-${attemptCount}`;
  const masteryKey = `${REASONING_CONTENT_RELEASE_ID}:reasoning-evidence:${primarySkill}:${ref.templateId}:${ref.seed}:${bucket}`;
  return {
    id: `reasoning.evidence-earned.${learnerId || 'learner'}.${ref.itemId}.${bucket}.${requestId || uid('req')}`,
    type: 'reasoning.evidence-earned',
    subjectId: 'reasoning',
    learnerId,
    createdAt: nowValue,
    contentReleaseId: REASONING_CONTENT_RELEASE_ID,
    skillId: primarySkill,
    skillIds: question.skillIds || [],
    templateId: ref.templateId,
    itemId: ref.itemId,
    masteryKey,
    quality,
  };
}

function finaliseQuestion({ data, session, ref, question, result, learnerId, requestId, nowValue }) {
  const attemptCount = session.attempts[ref.itemId] || 1;
  const supportLevel = session.support?.[ref.itemId]?.level || 0;
  const quality = outcomeQuality(result, attemptCount, supportLevel, session.strict);
  removeRetryForRef(data, ref);
  updateStreak(data, nowValue);
  for (const skillId of question.skillIds || []) updateNodeFromQuality(ensureNode(data.skills, skillId), quality, nowValue);
  updateNodeFromQuality(ensureNode(data.templates, ref.templateId), quality, nowValue);
  updateNodeFromQuality(ensureNode(data.items, ref.itemId), quality, nowValue);
  if (result.misconception) bumpMisconception(data, result.misconception, nowValue);
  if (!result.correct || quality < 4) enqueueRetry(data, ref, question, result, nowValue);
  const event = {
    timestamp: new Date(nowValue).toISOString(),
    templateId: ref.templateId,
    itemId: ref.itemId,
    mode: session.mode,
    skillIds: question.skillIds || [],
    score: result.score,
    maxScore: result.maxScore,
    correct: result.correct,
    attempts: attemptCount,
    supportLevel,
    misconception: result.misconception || null,
    response: clone(session.responses?.[ref.itemId] || {}),
    durationSec: Math.round((nowValue - (session.startedAt || nowValue)) / 1000),
  };
  data.events.push(event);
  data.events = data.events.slice(-700);
  const domainEvents = [{
    id: `reasoning.answer-submitted.${learnerId || 'learner'}.${ref.itemId}.${requestId || uid('req')}`,
    type: 'reasoning.answer-submitted',
    subjectId: 'reasoning',
    learnerId,
    createdAt: nowValue,
    templateId: ref.templateId,
    itemId: ref.itemId,
    skillIds: question.skillIds || [],
    score: result.score,
    maxScore: result.maxScore,
    correct: result.correct,
    misconception: result.misconception || null,
    supportLevel,
    response: clone(session.responses?.[ref.itemId] || {}),
  }];
  const evidenceEvent = maybeEvidenceEvent({ learnerId, ref, question, result, quality, requestId, nowValue, supportLevel, attemptCount });
  if (evidenceEvent && !data.evidenceKeys.includes(evidenceEvent.masteryKey)) {
    data.evidenceKeys.push(evidenceEvent.masteryKey);
    domainEvents.push(evidenceEvent);
  }
  return domainEvents;
}

function summariseSession(session) {
  const score = currentScore(session);
  const maxScore = totalMarks(session);
  const questionCount = session.questionRefs?.length || 0;
  return {
    sessionId: session.id,
    mode: session.mode,
    score,
    maxScore,
    questionCount,
    accuracy: maxScore ? Math.round((score / maxScore) * 100) : 0,
    completedAt: new Date().toISOString(),
  };
}

function maybeFinishSession({ state, data, session, nowValue }) {
  if (!sessionComplete(session)) return;
  const summary = { ...summariseSession(session), completedAt: new Date(nowValue).toISOString() };
  state.phase = 'summary';
  state.summary = summary;
  state.feedback = null;
  data.sessions.push(summary);
  data.sessions = data.sessions.slice(-100);
}

function currentPracticeSessionRecord(state, data, nowValue) {
  const session = state.session;
  if (!session) return null;
  const completed = state.phase === 'summary' || sessionComplete(session);
  return {
    id: session.id,
    subjectId: 'reasoning',
    status: completed ? 'completed' : 'active',
    mode: session.mode,
    startedAt: new Date(session.startedAt || nowValue).toISOString(),
    updatedAt: new Date(nowValue).toISOString(),
    summary: completed ? state.summary || summariseSession(session) : null,
    state: { sessionId: session.id, questionCount: session.questionRefs?.length || 0 },
    data: { releaseId: data.releaseId || REASONING_CONTENT_RELEASE_ID },
  };
}

function applyStart({ learnerId, state, data, payload, requestId, nowValue, random }) {
  const prefs = normalisePrefs({ ...data.prefs, ...(payload || {}) });
  const session = buildSession(data, prefs, { nowValue, random, heroContext: payload?.heroContext || null });
  if (!session) {
    state.error = 'Reasoning could not build a question set right now.';
    return [];
  }
  data.prefs = prefs;
  state.prefs = prefs;
  state.phase = 'session';
  state.session = session;
  state.feedback = null;
  state.summary = null;
  state.error = '';
  return [{
    id: `reasoning.session-started.${learnerId || 'learner'}.${session.id}.${requestId || uid('req')}`,
    type: 'reasoning.session-started',
    subjectId: 'reasoning',
    learnerId,
    createdAt: nowValue,
    sessionId: session.id,
    mode: session.mode,
    questionCount: session.questionRefs.length,
  }];
}

function applySubmit({ learnerId, state, data, payload, requestId, nowValue }) {
  const session = state.session;
  const ref = currentQuestionRef(session);
  const question = currentQuestion(session);
  if (!session || !ref || !question) return [];
  if (payload?.expectedSessionId && payload.expectedSessionId !== session.id) return [];
  if (!expectedQuestionMatches(session, ref, payload?.expectedQuestionId)) return [];
  if (session.results?.[ref.itemId]) return [];
  const response = clone(payload?.response || {});
  storeResponse(session, ref, response);
  session.attempts[ref.itemId] = (session.attempts[ref.itemId] || 0) + 1;
  const result = evaluateReasoningQuestion(question, response);
  const firstWrong = !result.correct && !session.strict && session.presentation === 'independent' && session.attempts[ref.itemId] < 2 && !(session.support?.[ref.itemId]?.level >= 2);
  if (firstWrong) {
    state.feedback = { questionRef: ref, result: sanitiseFeedbackResult(result, { includeFullFeedback: false }), final: false };
    return [];
  }
  session.results[ref.itemId] = clone(result);
  state.feedback = { questionRef: ref, result, final: true };
  const events = finaliseQuestion({ data, session, ref, question, result, learnerId, requestId, nowValue });
  if (!session.delayedFeedback && session.currentQuestionIndex < session.questionRefs.length - 1) {
    // Stay on the marked question so the learner sees feedback; Next moves later.
  }
  maybeFinishSession({ state, data, session, nowValue });
  if (state.phase === 'summary') {
    events.push({
      id: `reasoning.session-completed.${learnerId || 'learner'}.${session.id}.${requestId || uid('req')}`,
      type: 'reasoning.session-completed',
      subjectId: 'reasoning',
      learnerId,
      createdAt: nowValue,
      sessionId: session.id,
      mode: session.mode,
      score: currentScore(session),
      maxScore: totalMarks(session),
      questionCount: session.questionRefs.length,
    });
  }
  return events;
}

function applySaveResponse({ state, payload }) {
  const session = state.session;
  const ref = currentQuestionRef(session);
  if (!session || !ref) return;
  if (payload?.expectedSessionId && payload.expectedSessionId !== session.id) return;
  const responses = payload?.responses && typeof payload.responses === 'object' ? payload.responses : null;
  if (responses) {
    for (const itemRef of session.questionRefs || []) {
      const entry = responseForRef(responses, session, itemRef);
      if (entry.found) storeResponse(session, itemRef, entry.value);
    }
  } else {
    if (!expectedQuestionMatches(session, ref, payload?.expectedQuestionId)) return;
    storeResponse(session, ref, payload?.response || {});
  }
  let moved = false;
  if (payload?.advance) moved = moveIndex(session, { delta: 1 }) || moved;
  if (payload?.move) moved = moveIndex(session, payload.move) || moved;
  if (moved) state.feedback = null;
}

function applyMarkSession({ learnerId, state, data, payload, requestId, nowValue }) {
  const session = state.session;
  if (!session) return [];
  if (payload?.expectedSessionId && payload.expectedSessionId !== session.id) return [];
  if (payload?.responses && typeof payload.responses === 'object') {
    for (const ref of session.questionRefs || []) {
      const entry = responseForRef(payload.responses, session, ref);
      if (!session.results?.[ref.itemId] && entry.found) storeResponse(session, ref, entry.value);
    }
  }
  const events = [];
  for (const ref of session.questionRefs || []) {
    if (session.results?.[ref.itemId]) continue;
    const question = questionFromRef(ref);
    if (!question) continue;
    const response = clone(session.responses?.[ref.itemId] || {});
    session.attempts[ref.itemId] = Math.max(1, session.attempts[ref.itemId] || 1);
    const result = evaluateReasoningQuestion(question, response);
    session.results[ref.itemId] = clone(result);
    events.push(...finaliseQuestion({ data, session, ref, question, result, learnerId, requestId, nowValue }));
  }
  maybeFinishSession({ state, data, session, nowValue });
  if (state.phase === 'summary') {
    events.push({
      id: `reasoning.session-completed.${learnerId || 'learner'}.${session.id}.${requestId || uid('req')}`,
      type: 'reasoning.session-completed',
      subjectId: 'reasoning',
      learnerId,
      createdAt: nowValue,
      sessionId: session.id,
      mode: session.mode,
      score: currentScore(session),
      maxScore: totalMarks(session),
      questionCount: session.questionRefs.length,
    });
  }
  return events;
}

function applySupport({ state, payload, nowValue }) {
  const session = state.session;
  const ref = currentQuestionRef(session);
  if (!session || !ref) return;
  if (payload?.expectedSessionId && payload.expectedSessionId !== session.id) return;
  if (!expectedQuestionMatches(session, ref, payload?.expectedQuestionId)) return;
  if (session.strict || session.results?.[ref.itemId]) return;
  const currentLevel = session.support?.[ref.itemId]?.level || 0;
  const attempted = (session.attempts?.[ref.itemId] || 0) > 0;
  const teachingMode = session.presentation === 'worked' || session.presentation === 'faded';
  if (!attempted && !teachingMode && !currentLevel) return;
  const level = payload?.kind === 'worked' ? 2 : 1;
  session.support[ref.itemId] = { level: Math.max(level, currentLevel), requestedAt: nowValue };
  state.feedback = { questionRef: ref, result: null, final: false, supportLevel: session.support[ref.itemId].level };
}

function applyContinue({ state }) {
  const session = state.session;
  if (!session) return;
  if (state.phase === 'summary') return;
  if (session.currentQuestionIndex < session.questionRefs.length - 1) {
    session.currentQuestionIndex += 1;
    state.feedback = null;
    return;
  }
  if (sessionComplete(session)) state.phase = 'summary';
}

export function createServerReasoningEngine({ now = () => Date.now(), random = Math.random } = {}) {
  function apply({ learnerId = '', subjectRecord = null, latestSession = null, command = '', payload = {}, requestId = '' } = {}) {
    const nowValue = Number(now()) || Date.now();
    const data = normaliseData(subjectRecord?.data || subjectRecord?.subjectData || {});
    const state = normaliseState(subjectRecord?.ui || subjectRecord?.state || {}, learnerId);
    let events = [];
    let changed = true;

    if (command === 'start-session') events = applyStart({ learnerId, state, data, payload, requestId, nowValue, random });
    else if (command === 'save-prefs') {
      const prefs = normalisePrefs({ ...data.prefs, ...(payload?.prefs || payload || {}) });
      data.prefs = prefs;
      state.prefs = prefs;
      state.error = '';
    } else if (command === 'save-response') applySaveResponse({ state, payload });
    else if (command === 'submit-answer') events = applySubmit({ learnerId, state, data, payload, requestId, nowValue });
    else if (command === 'move-question') applyMoveQuestion({ state, payload });
    else if (command === 'mark-section' || command === 'mark-session') events = applyMarkSession({ learnerId, state, data, payload, requestId, nowValue });
    else if (command === 'request-support') applySupport({ state, payload, nowValue });
    else if (command === 'continue-session') applyContinue({ state });
    else if (command === 'end-session') {
      if (state.session) {
        state.phase = 'summary';
        state.summary = { ...summariseSession(state.session), completedAt: new Date(nowValue).toISOString(), abandoned: true };
        state.feedback = null;
      }
    } else if (command === 'reset-learner') {
      return {
        changed: true,
        state: defaultState(learnerId),
        data: defaultData(),
        stats: buildStats(defaultData(), nowValue),
        analytics: buildAnalytics(defaultData(), nowValue),
        events: [],
        practiceSession: null,
      };
    } else {
      changed = false;
    }

    const stats = buildStats(data, nowValue);
    const analytics = buildAnalytics(data, nowValue);
    return {
      changed,
      state,
      data,
      stats,
      analytics,
      content: reasoningContentSummary(),
      events,
      practiceSession: currentPracticeSessionRecord(state, data, nowValue),
      readModel: buildReadModel({ learnerId, state, data, nowValue }),
    };
  }
  return { apply };
}

export {
  DEFAULT_PREFS,
  buildReadModel as buildReasoningReadModelFromEngine,
  buildSessionReadModel,
  normalisePrefs,
};
