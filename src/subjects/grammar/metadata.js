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

// Phase 3 U0 cluster remap. The active Grammar roster collapses to 3 direct
// cluster monsters (Bracehart, Chronalyx, Couronnail) plus Concordium's
// whole-Grammar aggregate. Bracehart absorbs Sentence structure and Phrases;
// Chronalyx absorbs Flow / Linkage; Couronnail absorbs Word classes. The
// retired directs (Glossbloom, Loomrill, Mirrane) remain in MONSTERS for
// asset tooling but no longer appear in this route list.
export const GRAMMAR_MONSTER_ROUTES = Object.freeze([
  {
    id: 'bracehart',
    name: 'Bracehart',
    route: 'Sentences, clauses and phrases',
    conceptIds: [
      'sentence_functions',
      'clauses',
      'relative_clauses',
      'noun_phrases',
      'active_passive',
      'subject_object',
    ],
  },
  {
    id: 'chronalyx',
    name: 'Chronalyx',
    route: 'Verb forms and cohesion',
    conceptIds: [
      'tense_aspect',
      'modal_verbs',
      'adverbials',
      'pronouns_cohesion',
    ],
  },
  {
    id: 'couronnail',
    name: 'Couronnail',
    route: 'Word classes, Standard English and register',
    conceptIds: [
      'word_classes',
      'standard_english',
      'formality',
    ],
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
  // U10: additive learner-only pref driving the Writing Try "Hide from my
  // list" toggle. Evidence is untouched; the toggle only filters the
  // child-facing orphan list. Default must be an array so the client
  // normaliser produces stable shapes (a mutable array is freshly cloned
  // on every read, so Object.freeze on the pref container is sufficient).
  transferHiddenPromptIds: Object.freeze([]),
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
  // Phase 4 U1: keep the safe `contentStats` key present for legacy or local
  // payloads. Worker read-models provide the authoritative count payload and
  // are merged below when available.
  return {
    concepts: counts,
    contentStats: {},
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// U6a: Defensive mirror of Worker's transferLane read-model (source of truth:
// worker/src/subjects/grammar/read-models.js:840-874 and
// worker/src/subjects/grammar/transfer-prompts.js:95-104). The client never
// trusts Worker-side keys to be present, but also does not silently discard
// them: unknown top-level keys round-trip, malformed arrays coerce to [], and
// a missing transferLane returns a shape-stable zero-value object.
//
// The Worker deliberately asymmetrically omits `selfAssessment` from archived
// `history[*]` snapshots while including it on `latest`. Do NOT "repair" this
// asymmetry on the client — historical ticks are intentionally not surfaced.
//
// The Worker already redacts `reviewCopy` (adult-only) from each prompt
// summary and `requestId` from evidence snapshots. Client normaliser must NOT
// re-introduce either field. Tests assert both absent anywhere under
// `rm.transferLane` via a recursive scan.
//
// Evidence is server-sorted by `updatedAt` descending
// (worker/src/subjects/grammar/read-models.js:872). Client preserves insertion
// order from the Worker payload and never re-sorts.
const EMPTY_TRANSFER_LANE = Object.freeze({
  mode: '',
  prompts: Object.freeze([]),
  limits: Object.freeze({ maxPrompts: 0, historyPerPrompt: 0, writingCapChars: 0 }),
  evidence: Object.freeze([]),
});

function normaliseGrammarTransferPrompt(raw) {
  const prompt = isPlainObject(raw) ? raw : {};
  return {
    id: typeof prompt.id === 'string' ? prompt.id : '',
    title: typeof prompt.title === 'string' ? prompt.title : '',
    brief: typeof prompt.brief === 'string' ? prompt.brief : '',
    grammarTargets: Array.isArray(prompt.grammarTargets)
      ? prompt.grammarTargets.filter((entry) => typeof entry === 'string')
      : [],
    checklist: Array.isArray(prompt.checklist)
      ? prompt.checklist.filter((entry) => typeof entry === 'string')
      : [],
  };
}

function normaliseGrammarTransferSelfAssessment(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isPlainObject)
    .map((entry) => ({
      key: typeof entry.key === 'string' ? entry.key : '',
      checked: Boolean(entry.checked),
    }))
    .filter((entry) => entry.key);
}

function normaliseGrammarTransferLatest(raw) {
  if (!isPlainObject(raw)) return null;
  return {
    writing: typeof raw.writing === 'string' ? raw.writing : '',
    selfAssessment: normaliseGrammarTransferSelfAssessment(raw.selfAssessment),
    savedAt: asTimestamp(raw.savedAt, 0),
    source: typeof raw.source === 'string' ? raw.source : '',
  };
}

function normaliseGrammarTransferHistoryEntry(raw) {
  const entry = isPlainObject(raw) ? raw : {};
  return {
    writing: typeof entry.writing === 'string' ? entry.writing : '',
    savedAt: asTimestamp(entry.savedAt, 0),
    source: typeof entry.source === 'string' ? entry.source : '',
  };
}

function normaliseGrammarTransferEvidenceEntry(raw) {
  const entry = isPlainObject(raw) ? raw : {};
  return {
    promptId: typeof entry.promptId === 'string' ? entry.promptId : '',
    latest: normaliseGrammarTransferLatest(entry.latest),
    history: Array.isArray(entry.history)
      ? entry.history.map(normaliseGrammarTransferHistoryEntry)
      : [],
    updatedAt: asTimestamp(entry.updatedAt, 0),
  };
}

// Phase 3 U2: the Grammar Bank scene carries transient UI state — active
// status filter, active cluster filter, search query, currently open concept
// detail modal id. We keep it inside the Grammar read model (rather than the
// platform-level `transientUi`) because every other Grammar UI slice already
// lives here; mixing locations would make the dispatcher asymmetric. Valid
// filter ids are enforced by the U8 frozen sets; unknown ids collapse to
// `all`. The search query is capped at 80 characters to mirror Spelling.
const VALID_GRAMMAR_BANK_STATUS_FILTERS = new Set(['all', 'due', 'trouble', 'learning', 'nearly-secure', 'secure', 'new']);
const VALID_GRAMMAR_BANK_CLUSTER_FILTERS = new Set(['all', 'bracehart', 'chronalyx', 'couronnail', 'concordium']);
const EMPTY_GRAMMAR_BANK_UI = Object.freeze({
  statusFilter: 'all',
  clusterFilter: 'all',
  query: '',
  detailConceptId: '',
});

function normaliseGrammarBankUi(raw) {
  if (!isPlainObject(raw)) return { ...EMPTY_GRAMMAR_BANK_UI };
  const rawStatus = typeof raw.statusFilter === 'string' ? raw.statusFilter : 'all';
  const rawCluster = typeof raw.clusterFilter === 'string' ? raw.clusterFilter : 'all';
  const rawQuery = typeof raw.query === 'string' ? raw.query : '';
  const rawDetail = typeof raw.detailConceptId === 'string' ? raw.detailConceptId : '';
  return {
    statusFilter: VALID_GRAMMAR_BANK_STATUS_FILTERS.has(rawStatus) ? rawStatus : 'all',
    clusterFilter: VALID_GRAMMAR_BANK_CLUSTER_FILTERS.has(rawCluster) ? rawCluster : 'all',
    query: rawQuery.slice(0, 80),
    detailConceptId: rawDetail.slice(0, 64),
  };
}

// Phase 3 U6b: Writing Try scene carries transient UI state — the selected
// prompt id (null until the learner picks one), the in-progress writing
// draft, and the self-check ticks keyed by the checklist item's stable
// `check-<index>` key. We keep the state inside the Grammar read model for
// the same reason `bank` lives here: every Grammar UI slice routes through
// `normaliseGrammarReadModel`, so a mixed home would make the dispatcher
// asymmetric. The writing draft is capped server-side at 2000 chars but we
// slice again defensively so a malformed upstream value cannot push the
// textarea over the cap during SSR.
const EMPTY_GRAMMAR_TRANSFER_UI = Object.freeze({
  selectedPromptId: '',
  draft: '',
  ticks: Object.freeze({}),
});

function normaliseGrammarTransferTicks(raw) {
  if (!isPlainObject(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== 'string' || !key) continue;
    // Cap keys defensively so a malformed upstream tick map cannot grow
    // without bound through round-trips.
    out[key.slice(0, 64)] = Boolean(value);
  }
  return out;
}

// Defensive upper bound for `ui.transfer.draft`. The Worker's writing cap is
// 2000 chars (GRAMMAR_TRANSFER_WRITING_CAP), but the UI must be able to
// *detect* an over-cap draft so the Writing Try scene can render the
// "That is longer than we can save" warning + disable Save. Truncating
// here would hide the over-cap path from the scene. 5000 is chosen as a
// generous sanity limit so a runaway upstream value cannot grow without
// bound — it is more than double the Worker cap and well below any
// reasonable practical input.
const GRAMMAR_TRANSFER_DRAFT_HARD_MAX = 5000;

function normaliseGrammarTransferUi(raw) {
  if (!isPlainObject(raw)) return { selectedPromptId: '', draft: '', ticks: {} };
  const selectedPromptId = typeof raw.selectedPromptId === 'string' ? raw.selectedPromptId.slice(0, 64) : '';
  const draft = typeof raw.draft === 'string' ? raw.draft.slice(0, GRAMMAR_TRANSFER_DRAFT_HARD_MAX) : '';
  return {
    selectedPromptId,
    draft,
    ticks: normaliseGrammarTransferTicks(raw.ticks),
  };
}

function normaliseGrammarTransferLane(raw) {
  if (!isPlainObject(raw)) {
    return {
      mode: '',
      prompts: [],
      limits: { maxPrompts: 0, historyPerPrompt: 0, writingCapChars: 0 },
      evidence: [],
    };
  }
  const limits = isPlainObject(raw.limits) ? raw.limits : {};
  return {
    mode: typeof raw.mode === 'string' ? raw.mode : '',
    prompts: Array.isArray(raw.prompts) ? raw.prompts.map(normaliseGrammarTransferPrompt) : [],
    limits: {
      maxPrompts: Number(limits.maxPrompts) || 0,
      historyPerPrompt: Number(limits.historyPerPrompt) || 0,
      writingCapChars: Number(limits.writingCapChars) || 0,
    },
    evidence: Array.isArray(raw.evidence) ? raw.evidence.map(normaliseGrammarTransferEvidenceEntry) : [],
  };
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
  // Phase 4 U1: explicit allow-list picker. The previous `{ ...statsFromConcepts(), ...raw.stats }`
  // spread silently re-introduced any forbidden keys the Worker might still
  // emit (historically `templates`) by merging them back onto the client
  // read-model. The allow-list below keeps only the two keys the UI actually
  // consumes (`stats.concepts` and `stats.contentStats`); `raw.stats` itself
  // is never spread, so legacy or mis-shaped Worker payloads cannot leak
  // forbidden keys through this path.
  const fallbackStats = statsFromConcepts(concepts);
  const rawStats = raw.stats && typeof raw.stats === 'object' && !Array.isArray(raw.stats)
    ? raw.stats
    : {};
  const rawStatsConcepts = rawStats.concepts && typeof rawStats.concepts === 'object' && !Array.isArray(rawStats.concepts)
    ? rawStats.concepts
    : {};
  const rawStatsContentStats = rawStats.contentStats && typeof rawStats.contentStats === 'object' && !Array.isArray(rawStats.contentStats)
    ? rawStats.contentStats
    : {};
  const stats = {
    concepts: { ...fallbackStats.concepts, ...rawStatsConcepts },
    contentStats: { ...fallbackStats.contentStats, ...rawStatsContentStats },
  };
  // Phase 3 U1 widens the whitelist to accept `'bank'` and `'transfer'` so
  // that the U1 dashboard can dispatch `grammar-open-concept-bank` /
  // `grammar-open-transfer` before U2 + U6b land. The downstream scene files
  // ship in later units; today the surface renders a lightweight stub for
  // either phase so the state transition is safe. Phase 3 U5 adds
  // `'analytics'` so the summary's `Grown-up view` button can flip to the
  // adult analytics surface (previously mounted unconditionally below the
  // dashboard `<details>`).
  const phase = ['dashboard', 'bank', 'transfer', 'session', 'feedback', 'summary', 'analytics'].includes(raw.phase)
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
      templateCount: 70,
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
      // U10: normalise the `transferHiddenPromptIds` pref so a malformed
      // upstream value (missing / non-array / mixed types) never propagates
      // into the Writing Try scene filter. The spread above would preserve
      // a string or object, which would explode downstream `.includes()`.
      transferHiddenPromptIds: Array.isArray(raw.prefs?.transferHiddenPromptIds)
        ? raw.prefs.transferHiddenPromptIds
          .filter((value) => typeof value === 'string' && value)
          .map((value) => value.slice(0, 64))
          .slice(0, 40)
        : [],
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
    transferLane: normaliseGrammarTransferLane(raw.transferLane),
    // Phase 3 U2: persist the Grammar Bank filter + search state inside the
    // read model so filter selections survive StrictMode double-renders and
    // round-trip through the normaliser without stomping unrelated fields.
    bank: normaliseGrammarBankUi(raw.bank),
    // Phase 3 U6b: persist the Writing Try scene's transient UI state
    // (selected prompt, draft writing, self-check ticks) in the same slot
    // for the same reason as `bank` above. The draft is cleared on save
    // success (the dispatcher handles that) so the textarea returns to an
    // empty state after the evidence lands.
    ui: {
      transfer: normaliseGrammarTransferUi(raw.ui?.transfer),
    },
    projections: raw.projections || null,
    pendingCommand: raw.pendingCommand || '',
    error: typeof raw.error === 'string' ? raw.error : '',
  };
}

export { EMPTY_TRANSFER_LANE, normaliseGrammarTransferLane };
export {
  EMPTY_GRAMMAR_BANK_UI,
  VALID_GRAMMAR_BANK_STATUS_FILTERS,
  VALID_GRAMMAR_BANK_CLUSTER_FILTERS,
  normaliseGrammarBankUi,
};
export { EMPTY_GRAMMAR_TRANSFER_UI, normaliseGrammarTransferUi };

export function groupedGrammarConcepts(concepts = []) {
  const groups = new Map();
  for (const concept of concepts) {
    const domain = concept.domain || 'Grammar';
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push(concept);
  }
  return Array.from(groups.entries()).map(([domain, entries]) => ({ domain, concepts: entries }));
}
