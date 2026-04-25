import { normaliseGrammarSpeechRate } from './speech.js';

export const GRAMMAR_SUBJECT_ID = 'grammar';
export const GRAMMAR_REGION_IMAGE = '/assets/regions/the-clause-conservatory/the-clause-conservatory-cover.1280.webp';
export const GRAMMAR_REGION_IMAGE_SMALL = '/assets/regions/the-clause-conservatory/the-clause-conservatory-cover.640.webp';

export const GRAMMAR_CLIENT_CONCEPTS = Object.freeze([
  {
    id: 'sentence_functions',
    domain: 'Sentence function',
    name: 'Sentence functions',
    summary: 'Statements tell, questions ask, commands instruct, and exclamations show strong feeling.',
    punctuationForGrammar: true,
  },
  {
    id: 'word_classes',
    domain: 'Word classes',
    name: 'Word classes',
    summary: 'Spot the job a word is doing in a sentence: noun, verb, adjective, adverb, determiner, pronoun, conjunction or preposition.',
    punctuationForGrammar: false,
  },
  {
    id: 'noun_phrases',
    domain: 'Phrases',
    name: 'Expanded noun phrases',
    summary: 'A noun phrase has a noun at its heart and can be expanded with adjectives, nouns or preposition phrases.',
    punctuationForGrammar: false,
  },
  {
    id: 'adverbials',
    domain: 'Adverbials',
    name: 'Adverbials and fronted adverbials',
    summary: 'Adverbials often show when, where or how. Fronted adverbials come first and usually take a comma in KS2 contexts.',
    punctuationForGrammar: true,
  },
  {
    id: 'clauses',
    domain: 'Clauses',
    name: 'Subordinate clauses and conjunctions',
    summary: 'A subordinate clause adds extra information and usually depends on a main clause.',
    punctuationForGrammar: false,
  },
  {
    id: 'relative_clauses',
    domain: 'Clauses',
    name: 'Relative clauses',
    summary: 'A relative clause adds extra information about a noun, often using who, which, that, where, when or whose.',
    punctuationForGrammar: false,
  },
  {
    id: 'tense_aspect',
    domain: 'Verb forms',
    name: 'Tense and aspect',
    summary: 'KS2 grammar includes past and present tense, progressive forms, present perfect and past perfect.',
    punctuationForGrammar: false,
  },
  {
    id: 'standard_english',
    domain: 'Standard English',
    name: 'Standard English forms',
    summary: 'KS2 GPS expects standard written forms such as "we were" rather than local spoken forms like "we was".',
    punctuationForGrammar: false,
  },
  {
    id: 'pronouns_cohesion',
    domain: 'Cohesion',
    name: 'Pronouns and cohesion',
    summary: 'Pronouns help avoid repetition, but the reader must still know clearly who or what each pronoun refers to.',
    punctuationForGrammar: false,
  },
  {
    id: 'formality',
    domain: 'Register',
    name: 'Formal and informal language',
    summary: 'KS2 tests both formal vocabulary and formal sentence structures.',
    punctuationForGrammar: false,
  },
  {
    id: 'active_passive',
    domain: 'Sentence structure',
    name: 'Active and passive voice',
    summary: 'Active voice foregrounds the doer. Passive voice foregrounds the thing affected or hides the doer.',
    punctuationForGrammar: false,
  },
  {
    id: 'subject_object',
    domain: 'Sentence structure',
    name: 'Subject and object',
    summary: 'The subject usually does the action; the object usually receives it.',
    punctuationForGrammar: false,
  },
  {
    id: 'modal_verbs',
    domain: 'Verb forms',
    name: 'Modal verbs and possibility',
    summary: 'Modal verbs such as might, should, will and must show different degrees of possibility, certainty, obligation or advice.',
    punctuationForGrammar: false,
  },
  {
    id: 'parenthesis_commas',
    domain: 'Punctuation for grammar',
    name: 'Parenthesis and commas',
    summary: 'Brackets, dashes and paired commas can mark extra information.',
    punctuationForGrammar: true,
  },
  {
    id: 'speech_punctuation',
    domain: 'Punctuation for grammar',
    name: 'Direct speech punctuation',
    summary: 'Direct speech punctuation depends on where the spoken words end and where the reporting clause begins.',
    punctuationForGrammar: true,
  },
  {
    id: 'apostrophes_possession',
    domain: 'Punctuation for grammar',
    name: 'Possession with apostrophes',
    summary: 'KS2 grammar expects pupils to distinguish singular possession from plural possession.',
    punctuationForGrammar: true,
  },
  {
    id: 'boundary_punctuation',
    domain: 'Punctuation for grammar',
    name: 'Colons, semi-colons and dashes',
    summary: 'These marks can show clear boundaries between ideas.',
    punctuationForGrammar: true,
  },
  {
    id: 'hyphen_ambiguity',
    domain: 'Punctuation for grammar',
    name: 'Hyphens to avoid ambiguity',
    summary: 'A hyphen can join words so the reader sees the intended meaning clearly.',
    punctuationForGrammar: true,
  },
]);

export const GRAMMAR_ENABLED_MODES = Object.freeze([
  { id: 'learn', label: 'Learn a concept', detail: 'Focused retrieval on one concept at a time.' },
  { id: 'smart', label: 'Smart mixed review', detail: 'Worker-selected review across Grammar concepts.' },
  { id: 'satsset', label: 'KS2-style mini-set', detail: 'A short mixed set with SATs-friendly question shapes.' },
  { id: 'trouble', label: 'Weak concepts drill', detail: 'Targets the weakest Grammar concepts with retry pressure.' },
  { id: 'surgery', label: 'Sentence surgery', detail: 'Fix and rewrite sentence-level Grammar errors.' },
  { id: 'builder', label: 'Sentence builder', detail: 'Build and rewrite sentences from structured prompts.' },
  { id: 'worked', label: 'Worked examples', detail: 'Practise with a model example before answering.' },
  { id: 'faded', label: 'Faded guidance', detail: 'Practise with prompts and contrasts, but no answer to the current item.' },
]);

export const GRAMMAR_LOCKED_MODES = Object.freeze([]);

export const GRAMMAR_MONSTER_ROUTES = Object.freeze([
  {
    id: 'bracehart',
    name: 'Bracehart',
    route: 'Sentences and clauses',
    conceptIds: ['sentence_functions', 'clauses', 'relative_clauses'],
  },
  {
    id: 'glossbloom',
    name: 'Glossbloom',
    route: 'Words and phrases',
    conceptIds: ['word_classes', 'noun_phrases'],
  },
  {
    id: 'loomrill',
    name: 'Loomrill',
    route: 'Adverbials and cohesion',
    conceptIds: ['adverbials', 'pronouns_cohesion'],
  },
  {
    id: 'chronalyx',
    name: 'Chronalyx',
    route: 'Verb forms',
    conceptIds: ['tense_aspect', 'modal_verbs'],
  },
  {
    id: 'couronnail',
    name: 'Couronnail',
    route: 'Standard English and register',
    conceptIds: ['standard_english', 'formality'],
  },
  {
    id: 'mirrane',
    name: 'Mirrane',
    route: 'Sentence voice',
    conceptIds: ['active_passive', 'subject_object'],
  },
  {
    id: 'concordium',
    name: 'Concordium',
    route: 'Whole Grammar mastery',
    conceptIds: GRAMMAR_CLIENT_CONCEPTS.map((concept) => concept.id),
  },
]);

export const DEFAULT_GRAMMAR_PREFS = Object.freeze({
  mode: 'smart',
  roundLength: 5,
  focusConceptId: '',
  goalType: 'questions',
  allowTeachingItems: false,
  showDomainBeforeAnswer: true,
  speechRate: 1,
});

export function grammarMonsterAsset(id, size = 320) {
  const safeId = String(id || '').replace(/[^a-z0-9-]/g, '');
  const safeSize = [320, 640, 1280].includes(Number(size)) ? Number(size) : 320;
  return `/assets/monsters/${safeId}/b1/${safeId}-b1-0.${safeSize}.webp`;
}

function conceptFallback(concept) {
  return {
    ...concept,
    status: 'new',
    attempts: 0,
    correct: 0,
    wrong: 0,
    strength: 0.25,
    dueAt: 0,
    correctStreak: 0,
  };
}

function mergeConcepts(rawConcepts) {
  const byId = new Map((Array.isArray(rawConcepts) ? rawConcepts : [])
    .filter((concept) => concept && typeof concept === 'object' && !Array.isArray(concept))
    .map((concept) => [concept.id, concept]));
  return GRAMMAR_CLIENT_CONCEPTS.map((concept) => {
    const workerConcept = byId.get(concept.id) || {};
    return {
      ...conceptFallback(concept),
      ...workerConcept,
      id: concept.id,
      name: typeof workerConcept.name === 'string' && workerConcept.name ? workerConcept.name : concept.name,
      domain: typeof workerConcept.domain === 'string' && workerConcept.domain ? workerConcept.domain : concept.domain,
      summary: typeof workerConcept.summary === 'string' && workerConcept.summary ? workerConcept.summary : concept.summary,
      punctuationForGrammar: typeof workerConcept.punctuationForGrammar === 'boolean'
        ? workerConcept.punctuationForGrammar
        : Boolean(concept.punctuationForGrammar),
    };
  });
}

function statsFromConcepts(concepts) {
  const counts = { total: concepts.length, new: 0, learning: 0, weak: 0, due: 0, secured: 0 };
  for (const concept of concepts) {
    const status = ['new', 'learning', 'weak', 'due', 'secured'].includes(concept.status)
      ? concept.status
      : 'new';
    counts[status] += 1;
  }
  return {
    concepts: counts,
    templates: {
      total: 51,
      selectedResponse: 31,
      constructedResponse: 20,
    },
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function humanLabel(id) {
  return String(id || '')
    .replace(/_confusion$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function asTimestamp(value, fallback = 0) {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function fallbackMisconceptionPatterns(counts = {}) {
  if (!isPlainObject(counts)) return [];
  return Object.entries(counts)
    .map(([id, rawEntry]) => {
      const entry = isPlainObject(rawEntry) ? rawEntry : {};
      return {
        subjectId: 'grammar',
        id,
        label: `${humanLabel(id)} pattern`,
        count: Math.max(0, Math.floor(Number(entry.count) || 0)),
        lastSeenAt: asTimestamp(entry.lastSeenAt, 0),
        source: 'grammar-state',
      };
    })
    .filter((entry) => entry.count > 0)
    .sort((a, b) => (b.count - a.count) || (b.lastSeenAt - a.lastSeenAt))
    .slice(0, 5);
}

function progressSnapshotFromConcepts(concepts) {
  const correct = concepts.reduce((sum, concept) => sum + (Number(concept.correct) || 0), 0);
  const wrong = concepts.reduce((sum, concept) => sum + (Number(concept.wrong) || 0), 0);
  const attempts = correct + wrong;
  return {
    subjectId: 'grammar',
    totalConcepts: concepts.length,
    trackedConcepts: concepts.filter((concept) => (Number(concept.attempts) || 0) > 0).length,
    securedConcepts: concepts.filter((concept) => concept.status === 'secured').length,
    dueConcepts: concepts.filter((concept) => concept.status === 'due').length,
    weakConcepts: concepts.filter((concept) => concept.status === 'weak').length,
    untouchedConcepts: concepts.filter((concept) => concept.status === 'new').length,
    accuracyPercent: attempts ? Math.round((correct / attempts) * 100) : null,
  };
}

function modeById(modes = []) {
  return new Map((Array.isArray(modes) ? modes : [])
    .filter((mode) => mode && typeof mode === 'object' && !Array.isArray(mode) && typeof mode.id === 'string')
    .map((mode) => [mode.id, mode]));
}

function mergeModeList(currentModes, rawModes = []) {
  const rawById = modeById(rawModes);
  return currentModes.map((mode) => {
    const rawMode = rawById.get(mode.id) || {};
    return {
      ...mode,
      ...rawMode,
      id: mode.id,
      label: typeof rawMode.label === 'string' && rawMode.label ? rawMode.label : mode.label,
      detail: typeof rawMode.detail === 'string' && rawMode.detail ? rawMode.detail : mode.detail,
      reason: typeof rawMode.reason === 'string' && rawMode.reason ? rawMode.reason : mode.reason,
    };
  });
}

function safeTextList(value, limit = 5) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normaliseAiEnrichment(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : null;
  if (!raw) return null;
  const status = raw.status === 'ready' ? 'ready' : 'failed';
  return {
    kind: ['explanation', 'revision-card', 'parent-summary'].includes(raw.kind) ? raw.kind : 'explanation',
    status,
    nonScored: raw.nonScored !== false,
    generatedAt: asTimestamp(raw.generatedAt, 0),
    source: raw.source === 'server-validated-ai' ? raw.source : '',
    error: isPlainObject(raw.error)
      ? {
        code: typeof raw.error.code === 'string' ? raw.error.code : 'grammar_ai_enrichment_failed',
        message: typeof raw.error.message === 'string' ? raw.error.message : 'Grammar enrichment is unavailable.',
      }
      : null,
    concept: isPlainObject(raw.concept)
      ? {
        id: typeof raw.concept.id === 'string' ? raw.concept.id : '',
        name: typeof raw.concept.name === 'string' ? raw.concept.name : '',
        domain: typeof raw.concept.domain === 'string' ? raw.concept.domain : '',
      }
      : null,
    explanation: isPlainObject(raw.explanation)
      ? {
        title: typeof raw.explanation.title === 'string' ? raw.explanation.title : '',
        body: typeof raw.explanation.body === 'string' ? raw.explanation.body : '',
        keyPoints: safeTextList(raw.explanation.keyPoints, 5),
      }
      : null,
    revisionCards: (Array.isArray(raw.revisionCards) ? raw.revisionCards : [])
      .filter(isPlainObject)
      .map((card) => ({
        title: typeof card.title === 'string' ? card.title : '',
        front: typeof card.front === 'string' ? card.front : '',
        back: typeof card.back === 'string' ? card.back : '',
      }))
      .filter((card) => card.front || card.back)
      .slice(0, 4),
    parentSummary: isPlainObject(raw.parentSummary)
      ? {
        title: typeof raw.parentSummary.title === 'string' ? raw.parentSummary.title : '',
        body: typeof raw.parentSummary.body === 'string' ? raw.parentSummary.body : '',
        nextSteps: safeTextList(raw.parentSummary.nextSteps, 4),
      }
      : null,
    revisionDrills: (Array.isArray(raw.revisionDrills) ? raw.revisionDrills : [])
      .filter(isPlainObject)
      .map((drill) => ({
        templateId: typeof drill.templateId === 'string' ? drill.templateId : '',
        label: typeof drill.label === 'string' ? drill.label : '',
        conceptIds: Array.isArray(drill.conceptIds) ? drill.conceptIds.filter(Boolean).map(String) : [],
        questionType: typeof drill.questionType === 'string' ? drill.questionType : '',
        deterministic: drill.deterministic !== false,
      }))
      .filter((drill) => drill.templateId)
      .slice(0, 6),
    notices: safeTextList(raw.notices, 4),
  };
}

export function normaliseGrammarReadModel(rawValue = {}, learnerId = '') {
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
  const concepts = mergeConcepts(raw.analytics?.concepts);
  const stats = raw.stats && typeof raw.stats === 'object' && !Array.isArray(raw.stats)
    ? {
      ...statsFromConcepts(concepts),
      ...raw.stats,
      concepts: { ...statsFromConcepts(concepts).concepts, ...(raw.stats.concepts || {}) },
      templates: { ...statsFromConcepts(concepts).templates, ...(raw.stats.templates || {}) },
    }
    : statsFromConcepts(concepts);
  const phase = ['dashboard', 'session', 'feedback', 'summary'].includes(raw.phase)
    ? raw.phase
    : 'dashboard';
  const rawAnalytics = isPlainObject(raw.analytics) ? raw.analytics : {};
  const misconceptionCounts = isPlainObject(rawAnalytics.misconceptionCounts) ? rawAnalytics.misconceptionCounts : {};
  const progressSnapshot = isPlainObject(rawAnalytics.progressSnapshot)
    ? { ...progressSnapshotFromConcepts(concepts), ...rawAnalytics.progressSnapshot }
    : progressSnapshotFromConcepts(concepts);

  return {
    subjectId: GRAMMAR_SUBJECT_ID,
    learnerId: raw.learnerId || learnerId,
    version: Number(raw.version) || 1,
    authority: raw.authority || 'client-metadata',
    content: {
      releaseId: raw.content?.releaseId || '',
      conceptCount: GRAMMAR_CLIENT_CONCEPTS.length,
      templateCount: 51,
      questionTypes: raw.content?.questionTypes || {},
    },
    phase,
    awaitingAdvance: Boolean(raw.awaitingAdvance),
    session: raw.session && typeof raw.session === 'object' && !Array.isArray(raw.session) ? raw.session : null,
    feedback: raw.feedback && typeof raw.feedback === 'object' && !Array.isArray(raw.feedback) ? raw.feedback : null,
    summary: raw.summary && typeof raw.summary === 'object' && !Array.isArray(raw.summary) ? raw.summary : null,
    prefs: {
      ...DEFAULT_GRAMMAR_PREFS,
      ...(raw.prefs && typeof raw.prefs === 'object' && !Array.isArray(raw.prefs) ? raw.prefs : {}),
      speechRate: normaliseGrammarSpeechRate(raw.prefs?.speechRate, DEFAULT_GRAMMAR_PREFS.speechRate),
    },
    stats,
    analytics: {
      concepts,
      misconceptionCounts,
      misconceptionPatterns: Array.isArray(rawAnalytics.misconceptionPatterns)
        ? rawAnalytics.misconceptionPatterns.slice(0, 5)
        : fallbackMisconceptionPatterns(misconceptionCounts),
      questionTypeSummary: Array.isArray(rawAnalytics.questionTypeSummary) ? rawAnalytics.questionTypeSummary.slice(0, 6) : [],
      progressSnapshot,
      evidenceSummary: Array.isArray(rawAnalytics.evidenceSummary) ? rawAnalytics.evidenceSummary.slice(0, 4) : [],
      recentAttempts: Array.isArray(rawAnalytics.recentAttempts) ? rawAnalytics.recentAttempts.slice(-12) : [],
      recentActivity: Array.isArray(rawAnalytics.recentActivity) ? rawAnalytics.recentActivity.slice(0, 8) : [],
    },
    capabilities: {
      enabledModes: mergeModeList(GRAMMAR_ENABLED_MODES, raw.capabilities?.enabledModes),
      lockedModes: mergeModeList(GRAMMAR_LOCKED_MODES, raw.capabilities?.lockedModes),
      aiEnrichment: {
        enabled: raw.capabilities?.aiEnrichment?.enabled !== false,
        nonScored: raw.capabilities?.aiEnrichment?.nonScored !== false,
        kinds: Array.isArray(raw.capabilities?.aiEnrichment?.kinds)
          ? raw.capabilities.aiEnrichment.kinds.filter(Boolean).map(String).slice(0, 3)
          : ['explanation', 'revision-card', 'parent-summary'],
      },
    },
    aiEnrichment: normaliseAiEnrichment(raw.aiEnrichment),
    projections: raw.projections || null,
    pendingCommand: raw.pendingCommand || '',
    error: typeof raw.error === 'string' ? raw.error : '',
  };
}

export function groupedGrammarConcepts(concepts = []) {
  const groups = new Map();
  for (const concept of concepts) {
    const domain = concept.domain || 'Grammar';
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push(concept);
  }
  return Array.from(groups.entries()).map(([domain, entries]) => ({ domain, concepts: entries }));
}
