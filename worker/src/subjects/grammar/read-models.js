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
  grammarConceptStatus,
} from './engine.js';

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

function safeSession(session) {
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
    serverAuthority: session.serverAuthority === GRAMMAR_SERVER_AUTHORITY ? GRAMMAR_SERVER_AUTHORITY : null,
  };
}

function conceptMap(state, now) {
  const mastery = isPlainObject(state?.mastery?.concepts) ? state.mastery.concepts : {};
  return GRAMMAR_CONCEPTS.map((concept) => {
    const node = mastery[concept.id] || null;
    return {
      id: concept.id,
      name: concept.name,
      domain: concept.domain,
      summary: concept.summary,
      punctuationForGrammar: Boolean(concept.punctuationForGrammar),
      status: grammarConceptStatus(node, now),
      attempts: Number(node?.attempts) || 0,
      correct: Number(node?.correct) || 0,
      wrong: Number(node?.wrong) || 0,
      strength: Number.isFinite(Number(node?.strength)) ? Number(node.strength) : 0.25,
      dueAt: Number(node?.dueAt) || 0,
      correctStreak: Number(node?.correctStreak) || 0,
    };
  });
}

function statsFromConcepts(concepts) {
  const counts = { total: concepts.length, new: 0, learning: 0, weak: 0, due: 0, secured: 0 };
  for (const concept of concepts) {
    counts[concept.status] = (counts[concept.status] || 0) + 1;
  }
  return {
    concepts: counts,
    templates: {
      total: GRAMMAR_TEMPLATE_METADATA.length,
      selectedResponse: GRAMMAR_TEMPLATE_METADATA.filter((template) => template.isSelectedResponse).length,
      constructedResponse: GRAMMAR_TEMPLATE_METADATA.filter((template) => !template.isSelectedResponse).length,
    },
  };
}

function capabilityMetadata() {
  const labels = {
    learn: 'Learn a concept',
    smart: 'Smart mixed review',
    satsset: 'KS2-style mini-set',
    trouble: 'Weak concepts drill',
    surgery: 'Sentence surgery',
    builder: 'Sentence builder',
    worked: 'Worked examples',
    faded: 'Faded guidance',
  };
  return {
    enabledModes: Array.from(GRAMMAR_ENABLED_MODES).map((id) => ({ id, label: labels[id] || id })),
    lockedModes: Array.from(GRAMMAR_LOCKED_MODES).map((id) => ({ id, label: labels[id] || id, reason: 'coming-next' })),
  };
}

export function buildGrammarReadModel({
  learnerId,
  state,
  projections = null,
  now = Date.now(),
} = {}) {
  const safeState = cloneSerialisable(state) || {};
  const concepts = conceptMap(safeState, now);
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
    session: safeSession(safeState.session),
    feedback: isPlainObject(safeState.feedback) ? cloneSerialisable(safeState.feedback) : null,
    summary: isPlainObject(safeState.summary) ? cloneSerialisable(safeState.summary) : null,
    prefs: isPlainObject(safeState.prefs) ? cloneSerialisable(safeState.prefs) : {},
    stats: statsFromConcepts(concepts),
    analytics: {
      concepts,
      misconceptionCounts: isPlainObject(safeState.misconceptions) ? cloneSerialisable(safeState.misconceptions) : {},
      recentAttempts: Array.isArray(safeState.recentAttempts) ? safeState.recentAttempts.slice(-12).map(cloneSerialisable) : [],
    },
    capabilities: capabilityMetadata(),
    projections: projections ? cloneSerialisable(projections) : null,
    error: typeof safeState.error === 'string' ? safeState.error : '',
  };
}
