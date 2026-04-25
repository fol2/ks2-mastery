import {
  GRAMMAR_CONCEPTS,
  GRAMMAR_TEMPLATE_METADATA,
} from './content.js';

const AI_ENRICHMENT_KINDS = Object.freeze(['explanation', 'revision-card', 'parent-summary']);
const KIND_SET = new Set(AI_ENRICHMENT_KINDS);
const TEMPLATE_IDS = new Set(GRAMMAR_TEMPLATE_METADATA.map((template) => template.id));
const SCORE_BEARING_KEYS = new Set([
  'accepted',
  'acceptedanswer',
  'acceptedanswers',
  'answer',
  'answertext',
  'correct',
  'correctanswer',
  'correctanswers',
  'mark',
  'marking',
  'marks',
  'modelanswer',
  'question',
  'questionbody',
  'questiontext',
  'rubric',
  'score',
  'scoreditem',
  'solution',
  'solutions',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value, limit = 480) {
  const text = String(value || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? text.slice(0, limit).trim() : text;
}

function normaliseKind(value) {
  const kind = cleanText(value, 40).toLowerCase().replace(/[\s_]+/g, '-');
  return KIND_SET.has(kind) ? kind : 'explanation';
}

function failure(kind, code, message, now) {
  return {
    kind,
    status: 'failed',
    nonScored: true,
    generatedAt: now,
    error: {
      code,
      message,
    },
  };
}

function parseAiResponse(value) {
  if (isPlainObject(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

function normaliseScoreKey(key) {
  return cleanText(key, 80).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function containsScoreBearingShape(value) {
  if (Array.isArray(value)) return value.some(containsScoreBearingShape);
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, entry]) => (
    SCORE_BEARING_KEYS.has(normaliseScoreKey(key)) || containsScoreBearingShape(entry)
  ));
}

function conceptForPayload(payload, state) {
  const requested = cleanText(payload.conceptId || payload.skillId, 80);
  const current = Array.isArray(state?.session?.currentItem?.skillIds)
    ? cleanText(state.session.currentItem.skillIds[0], 80)
    : '';
  const id = requested || current || '';
  return GRAMMAR_CONCEPTS.find((concept) => concept.id === id) || null;
}

function conceptById(id) {
  const conceptId = cleanText(id, 80);
  return GRAMMAR_CONCEPTS.find((concept) => concept.id === conceptId) || null;
}

function masteryNodeFor(state, conceptId) {
  const node = state?.mastery?.concepts?.[conceptId];
  return isPlainObject(node) ? node : {};
}

function conceptPriority(state, concept, now) {
  const node = masteryNodeFor(state, concept.id);
  const attempts = Math.max(0, Number(node.attempts) || 0);
  const correct = Math.max(0, Number(node.correct) || 0);
  const wrong = Math.max(0, Number(node.wrong) || 0);
  const strength = Number.isFinite(Number(node.strength)) ? Number(node.strength) : 0.5;
  const dueAt = Math.max(0, Number(node.dueAt) || 0);
  if (!attempts) return 70;
  if (strength < 0.42 || wrong > correct + 1) return 100;
  if (dueAt && dueAt <= now) return 90;
  if (strength < 0.7) return 60;
  return 20;
}

function fallbackConceptForPayload(payload, state, now) {
  const explicit = conceptForPayload(payload, state);
  if (explicit) return explicit;
  const focused = conceptById(state?.prefs?.focusConceptId);
  if (focused) return focused;

  const ranked = GRAMMAR_CONCEPTS
    .map((concept, index) => ({
      concept,
      index,
      priority: conceptPriority(state, concept, now),
    }))
    .sort((a, b) => (b.priority - a.priority) || (a.index - b.index));
  return ranked[0]?.concept || GRAMMAR_CONCEPTS[0] || null;
}

function templatesForConcept(concept, limit = 3) {
  if (!concept) return [];
  return GRAMMAR_TEMPLATE_METADATA
    .filter((template) => Array.isArray(template.skillIds) && template.skillIds.includes(concept.id))
    .slice(0, limit)
    .map((template) => ({
      templateId: template.id,
      label: template.label,
    }));
}

function parentSummaryConcepts(state, now) {
  return GRAMMAR_CONCEPTS
    .map((concept, index) => {
      const node = masteryNodeFor(state, concept.id);
      const attempts = Math.max(0, Number(node.attempts) || 0);
      const correct = Math.max(0, Number(node.correct) || 0);
      const wrong = Math.max(0, Number(node.wrong) || 0);
      let status = 'new';
      if (attempts) {
        const strength = Number.isFinite(Number(node.strength)) ? Number(node.strength) : 0.5;
        const dueAt = Math.max(0, Number(node.dueAt) || 0);
        if (strength < 0.42 || wrong > correct + 1) status = 'needs repair';
        else if (dueAt && dueAt <= now) status = 'due for review';
        else if (strength >= 0.82 && Math.max(0, Number(node.intervalDays) || 0) >= 7 && Math.max(0, Number(node.correctStreak) || 0) >= 3) status = 'secure';
        else status = 'building';
      }
      return {
        concept,
        index,
        status,
        attempts,
        priority: conceptPriority(state, concept, now),
      };
    })
    .sort((a, b) => (b.priority - a.priority) || (b.attempts - a.attempts) || (a.index - b.index))
    .slice(0, 3);
}

function buildFallbackResponse({ kind, payload, state, now }) {
  const concept = fallbackConceptForPayload(payload, state, now);
  const conceptName = concept?.name || 'Grammar';
  const summary = concept?.summary || 'Practise one reviewed Grammar idea at a time, then use deterministic questions for scored progress.';
  const notices = safeTextList(concept?.notices, 3, 180);
  const drills = templatesForConcept(concept, kind === 'revision-card' ? 3 : 2);

  if (kind === 'parent-summary') {
    const focus = parentSummaryConcepts(state, now);
    const focusText = focus.length
      ? focus.map((entry) => `${entry.concept.name}: ${entry.status}`).join('; ')
      : `${conceptName}: ready for practice`;
    return {
      title: 'Grammar parent summary draft',
      explanation: summary,
      parentSummary: {
        title: 'Grammar parent summary draft',
        body: `Grammar practice is tracking the KS2 concept map through Worker-marked evidence. Current focus: ${focusText}.`,
        nextSteps: [
          `Review ${focus[0]?.concept?.name || conceptName} with one short deterministic practice round.`,
          'Use support or retry actions for repair, then keep scored progress in normal Grammar practice.',
          'Treat AI content as a draft summary only; learning evidence still comes from marked Grammar items.',
        ],
      },
      drills,
    };
  }

  if (kind === 'revision-card') {
    return {
      title: `${conceptName} revision cards`,
      explanation: summary,
      keyPoints: notices,
      revisionCards: [
        {
          title: 'Concept check',
          front: `What should I remember about ${conceptName}?`,
          back: summary,
        },
        notices[0]
          ? {
            title: 'Watch for',
            front: notices[0],
            back: notices[1] || 'Use a reviewed Grammar item to check the idea in context.',
          }
          : null,
      ].filter(Boolean),
      drills,
    };
  }

  return {
    title: `${conceptName} explanation`,
    explanation: summary,
    keyPoints: notices.length ? notices : [
      'Use the visible prompt and options only.',
      'Scored progress comes from deterministic Grammar questions.',
    ],
    revisionCards: [],
    drills,
  };
}

function safeTextList(value, limit = 5, textLimit = 180) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => cleanText(entry, textLimit))
    .filter(Boolean)
    .slice(0, limit);
}

function compileRevisionCards(value) {
  return (Array.isArray(value) ? value : [])
    .map((card) => {
      const raw = isPlainObject(card) ? card : {};
      const title = cleanText(raw.title, 90);
      const front = cleanText(raw.front || raw.prompt, 180);
      const back = cleanText(raw.back || raw.check, 220);
      if (!front && !back) return null;
      return {
        ...(title ? { title } : {}),
        ...(front ? { front } : {}),
        ...(back ? { back } : {}),
      };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function compileDrills(value) {
  const drills = [];
  for (const raw of Array.isArray(value) ? value.slice(0, 6) : []) {
    const entry = isPlainObject(raw) ? raw : {};
    const templateId = cleanText(entry.templateId || entry.id, 120);
    if (!templateId) continue;
    if (!TEMPLATE_IDS.has(templateId)) {
      return {
        error: {
          code: 'grammar_ai_enrichment_invalid_template',
          message: 'AI enrichment may only reference reviewed deterministic Grammar templates.',
        },
      };
    }
    const template = GRAMMAR_TEMPLATE_METADATA.find((item) => item.id === templateId);
    drills.push({
      templateId,
      label: cleanText(entry.label || template?.label || templateId, 120),
      conceptIds: Array.isArray(template?.skillIds) ? template.skillIds.slice() : [],
      questionType: cleanText(template?.questionType, 80),
      deterministic: true,
    });
  }
  return { drills };
}

function compilePayload({ kind, payload, response, state, now }) {
  if (!isPlainObject(response) || !Object.keys(response).length) {
    return failure(kind, 'grammar_ai_enrichment_empty', 'AI enrichment returned no usable content.', now);
  }
  if (containsScoreBearingShape(response)) {
    return failure(kind, 'grammar_ai_enrichment_score_bearing', 'AI enrichment cannot contain score-bearing questions, answers, rubrics, or marking fields.', now);
  }

  const concept = conceptForPayload(payload, state);
  const drills = compileDrills(response.drills || response.revisionDrills);
  if (drills.error) return failure(kind, drills.error.code, drills.error.message, now);

  const explanation = {
    title: cleanText(response.title || response.heading || 'Grammar explanation', 90),
    body: cleanText(response.explanation || response.body || response.summary, 520),
    keyPoints: safeTextList(response.keyPoints || response.points, 5, 180),
  };
  const revisionCards = compileRevisionCards(response.revisionCards || response.cards);
  const parentSummary = isPlainObject(response.parentSummary)
    ? {
      title: cleanText(response.parentSummary.title || 'Parent summary', 90),
      body: cleanText(response.parentSummary.body || response.parentSummary.summary, 520),
      nextSteps: safeTextList(response.parentSummary.nextSteps, 4, 160),
    }
    : null;

  const hasContent = Boolean(explanation.body || explanation.keyPoints.length || revisionCards.length || parentSummary?.body || drills.drills.length);
  if (!hasContent) {
    return failure(kind, 'grammar_ai_enrichment_empty', 'AI enrichment returned no usable content.', now);
  }

  return {
    kind,
    status: 'ready',
    nonScored: true,
    source: 'server-validated-ai',
    generatedAt: now,
    concept: concept
      ? {
        id: concept.id,
        name: concept.name,
        domain: concept.domain,
      }
      : null,
    explanation,
    revisionCards,
    parentSummary,
    revisionDrills: drills.drills,
    notices: [
      'This enrichment is non-scored.',
      'Practice progress still comes from deterministic Grammar items.',
    ],
  };
}

export function compileGrammarAiEnrichment({
  payload = {},
  state = {},
  now = Date.now(),
} = {}) {
  const kind = normaliseKind(payload.kind || payload.type || payload.mode);
  const hasProviderResponse = ['aiResponse', 'response', 'enrichment']
    .some((key) => Object.prototype.hasOwnProperty.call(payload, key));
  try {
    const response = hasProviderResponse
      ? parseAiResponse(payload.aiResponse ?? payload.response ?? payload.enrichment)
      : buildFallbackResponse({ kind, payload, state, now });
    return compilePayload({ kind, payload, response, state, now });
  } catch (_error) {
    return failure(kind, 'grammar_ai_enrichment_malformed', 'AI enrichment response was not valid JSON.', now);
  }
}

export { AI_ENRICHMENT_KINDS };
