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

function safeWorkedExample(concept) {
  const worked = isPlainObject(concept?.worked) ? concept.worked : {};
  if (!worked.prompt && !worked.answer && !worked.why) return null;
  return {
    prompt: typeof worked.prompt === 'string' ? worked.prompt : '',
    exampleResponse: typeof worked.answer === 'string' ? worked.answer : '',
    why: typeof worked.why === 'string' ? worked.why : '',
  };
}

function safeContrast(concept) {
  const contrast = isPlainObject(concept?.contrast) ? concept.contrast : {};
  if (!contrast.good && !contrast.nearMiss && !contrast.why) return null;
  return {
    secureExample: typeof contrast.good === 'string' ? contrast.good : '',
    nearMiss: typeof contrast.nearMiss === 'string' ? contrast.nearMiss : '',
    why: typeof contrast.why === 'string' ? contrast.why : '',
  };
}

function supportGuidanceForSession(session) {
  const level = Math.max(0, Number(session?.supportLevel) || 0);
  if (!level) return null;
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
      workedExample: safeWorkedExample(primary),
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
    contrast: safeContrast(primary),
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
    supportLevel: Number.isFinite(Number(session.supportLevel)) ? Math.max(0, Number(session.supportLevel)) : 0,
    supportGuidance: supportGuidanceForSession(session),
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
  return Object.entries(questionTypes)
    .map(([id, rawNode]) => {
      const node = rawNode || {};
      const correct = Number(node.correct) || 0;
      const wrong = Number(node.wrong) || 0;
      const attempts = Number(node.attempts) || 0;
      return {
        subjectId: 'grammar',
        id,
        label: GRAMMAR_QUESTION_TYPES[id] || humanLabel(id),
        status: grammarConceptStatus(node, now),
        attempts,
        correct,
        wrong,
        accuracyPercent: accuracyPercent(correct, wrong),
        strength: Number.isFinite(Number(node.strength)) ? Number(node.strength) : 0.25,
        dueAt: asTs(node.dueAt, 0),
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
    session: safeSession(safeState.session),
    feedback: isPlainObject(safeState.feedback) ? cloneSerialisable(safeState.feedback) : null,
    summary: isPlainObject(safeState.summary) ? cloneSerialisable(safeState.summary) : null,
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
    projections: projections ? cloneSerialisable(projections) : null,
    error: typeof safeState.error === 'string' ? safeState.error : '',
  };
}
