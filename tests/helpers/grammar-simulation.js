// Seeded replay helper for Grammar U6 adaptive-selection simulation.
//
// Used by `tests/grammar-learning-integrity.test.js` to aggregate principle
// assertions across 8 canonical seeds. The helper wraps:
//   - buildGrammarPracticeQueue
//   - buildGrammarMiniPack
//   - applyGrammarAttemptToState (for mastery-gain principle)
//
// Design notes:
//  - The selection engine already accepts a numeric `seed` directly and
//    plumbs it through an internal seeded RNG. We therefore pass seeds
//    through unchanged — no external sha256 or Math.random dependency.
//  - `simulateAcrossSeeds(seeds, fn)` returns { seeds, results, failures }
//    so callers can aggregate across all seeds AND report which specific
//    seed(s) violated a principle. The returned shape mirrors the named-
//    shape pattern used by `tests/spelling-mega-invariant.test.js` — a
//    property-style top-level assertion plus seed-level diagnostics.

import {
  buildGrammarMiniPack,
  buildGrammarPracticeQueue,
} from '../../worker/src/subjects/grammar/selection.js';
import {
  applyGrammarAttemptToState,
  createInitialGrammarState,
} from '../../worker/src/subjects/grammar/engine.js';
import {
  createGrammarQuestion,
  evaluateGrammarQuestion,
  grammarTemplateById,
  serialiseGrammarQuestion,
  GRAMMAR_CONCEPTS,
  GRAMMAR_TEMPLATE_METADATA,
} from '../../worker/src/subjects/grammar/content.js';

// -----------------------------------------------------------------------------
// Canonical seed list — named in docs/plans/.../grammar-phase4 U6. Kept as
// a frozen array so drift-by-copy between callers is impossible.
// -----------------------------------------------------------------------------

export const CANONICAL_SEEDS = Object.freeze([1, 7, 13, 42, 100, 2025, 31415, 65535]);

// Frozen "now" anchor used across the simulation. Matches the anchor used in
// tests/grammar-selection.test.js so behavioural comparisons stay consistent.
export const SIM_NOW_MS = 1_777_000_000_000;

// -----------------------------------------------------------------------------
// Simulation primitives
// -----------------------------------------------------------------------------

/**
 * Run `fn` once per seed in `seeds`, collecting results and failures.
 *
 * @param {number[]} seeds — list of numeric seeds (must be non-empty).
 * @param {(seed:number, index:number) => unknown} fn — per-seed closure.
 *        Return value is captured in `results`. Throwing is captured in
 *        `failures` so the caller can aggregate and report which specific
 *        seeds violated a property.
 * @returns {{ seeds:number[], results:Array<{seed:number, value:unknown}>, failures:Array<{seed:number, error:Error}> }}
 */
export function simulateAcrossSeeds(seeds, fn) {
  if (!Array.isArray(seeds) || seeds.length === 0) {
    throw new Error('simulateAcrossSeeds: seeds must be a non-empty array.');
  }
  if (typeof fn !== 'function') {
    throw new Error('simulateAcrossSeeds: fn must be a function.');
  }
  const results = [];
  const failures = [];
  seeds.forEach((seed, index) => {
    try {
      const value = fn(seed, index);
      results.push({ seed, value });
    } catch (error) {
      failures.push({ seed, error });
    }
  });
  return { seeds: seeds.slice(), results, failures };
}

/**
 * Build a queue under a specific seed with sensible simulation defaults.
 *
 * @param {object} options
 * @returns {Array<{templateId:string, skillIds:string[], questionType:string, generative:boolean, satsFriendly:boolean}>}
 */
export function buildQueueForSeed({
  seed,
  size = 10,
  mode = 'smart',
  focusConceptId = '',
  mastery = null,
  recentAttempts = [],
  now = SIM_NOW_MS,
} = {}) {
  return buildGrammarPracticeQueue({
    mode,
    focusConceptId,
    mastery,
    recentAttempts,
    seed,
    size,
    now,
  });
}

/**
 * Build a mini-pack under a specific seed with sensible simulation defaults.
 */
export function buildMiniPackForSeed({
  seed,
  size = 8,
  focusConceptId = '',
  mastery = null,
  recentAttempts = [],
  now = SIM_NOW_MS,
} = {}) {
  return buildGrammarMiniPack({
    size,
    focusConceptId,
    mastery,
    recentAttempts,
    seed,
    now,
  });
}

// -----------------------------------------------------------------------------
// State builders for principle fixtures
// -----------------------------------------------------------------------------

/**
 * Construct a normalised grammar state with ONE concept forced into the
 * target selection-engine status. Status names match conceptStatus() in
 * selection.js:
 *   - 'due'      — dueAt in the past, strong correctStreak
 *   - 'weak'     — wrong>=3, correctStreak<2
 *   - 'secured'  — strength>=0.82, correctStreak>=3, not due
 *   - 'new'      — no attempts (the engine default for untouched concepts)
 *
 * All other concepts default to 'new' unless `othersStatus` is set.
 *
 * @param {object} options
 * @param {string} options.conceptId — the concept to single out.
 * @param {'due'|'weak'|'secured'|'new'|'learning'} options.status — target status.
 * @param {'due'|'weak'|'secured'|'new'|'learning'=} options.othersStatus — status for all other concepts (default: 'new').
 * @returns {object} grammar state (engine-shape).
 */
export function stateWithConceptStatus({ conceptId, status, othersStatus = 'new' } = {}) {
  const state = createInitialGrammarState();
  const primary = masteryNodeForStatus(status);
  const others = masteryNodeForStatus(othersStatus);
  for (const concept of GRAMMAR_CONCEPTS) {
    if (concept.id === conceptId) {
      state.mastery.concepts[concept.id] = primary;
    } else if (othersStatus !== 'new') {
      state.mastery.concepts[concept.id] = others;
    }
  }
  return state;
}

/**
 * Construct a state where ALL concepts share the same status. Used for the
 * "all concepts secured" edge case.
 */
export function stateWithAllConcepts(status) {
  const state = createInitialGrammarState();
  const node = masteryNodeForStatus(status);
  for (const concept of GRAMMAR_CONCEPTS) {
    state.mastery.concepts[concept.id] = { ...node };
  }
  return state;
}

/**
 * Inject a "recent miss" attempt for a specific concept. The attempt is
 * placed at the end of recentAttempts so it is the freshest signal.
 *
 * @param {object} state — mutated in place.
 * @param {string} conceptId
 * @param {number=} now — ms timestamp for the miss (default: SIM_NOW_MS).
 */
export function pushRecentMiss(state, conceptId, now = SIM_NOW_MS) {
  const template = GRAMMAR_TEMPLATE_METADATA.find((t) => (t.skillIds || []).includes(conceptId));
  if (!template) {
    throw new Error(`pushRecentMiss: no template found for concept '${conceptId}'.`);
  }
  state.recentAttempts = [...(state.recentAttempts || []), {
    contentReleaseId: 'grammar-legacy-reviewed-2026-04-24',
    templateId: template.id,
    itemId: `${template.id}::miss-${conceptId}`,
    seed: 0,
    questionType: template.questionType,
    conceptIds: [conceptId],
    response: {},
    result: { correct: false },
    supportLevel: 0,
    attempts: 1,
    createdAt: now,
  }];
  return state.recentAttempts[state.recentAttempts.length - 1];
}

// -----------------------------------------------------------------------------
// Mastery-gain simulation (supported vs independent)
// -----------------------------------------------------------------------------

/**
 * Apply a single correct attempt against a fresh state and return the
 * resulting concept strength delta for the PRIMARY concept of the chosen
 * template. Used by the "supported-correct < independent-correct mastery
 * gain" principle.
 *
 * @param {object} options
 * @param {number} options.seed — seed used both to pick the template from a
 *        queue and to pass into `createGrammarQuestion`. Determinism is
 *        guaranteed as long as the engine's selection & generator both
 *        honour the same seed.
 * @param {'independent'|'worked'} options.flavour — selects the support posture.
 * @returns {{ quality:number, strengthAfter:number, conceptId:string, templateId:string }}
 */
export function runSingleAttemptMasteryGain({ seed, flavour }) {
  const state = createInitialGrammarState();
  // Pick a deterministic SAT-friendly single-choice template so we can
  // resolve the correct answer via evaluate() probing without having to
  // hand-craft per-template responses.
  const template = pickChoiceTemplateForSeed(seed);
  const question = createGrammarQuestion({ templateId: template.id, seed });
  if (!question || !Array.isArray(question.inputSpec?.options)) {
    throw new Error(`runSingleAttemptMasteryGain: template ${template.id} is not a single_choice question.`);
  }
  const correctOption = question.inputSpec.options.find(
    (option) => evaluateGrammarQuestion(question, { answer: option.value })?.correct,
  );
  if (!correctOption) {
    throw new Error(`runSingleAttemptMasteryGain: no correct option probed for template ${template.id} seed ${seed}.`);
  }
  const item = serialiseGrammarQuestion(question);

  const config = flavour === 'worked'
    ? { mode: 'worked', supportLevel: 2, attempts: 1 }
    : { mode: 'smart', supportLevel: 0, attempts: 1 };

  const applied = applyGrammarAttemptToState(state, {
    learnerId: 'u6-sim-learner',
    item,
    response: { answer: correctOption.value },
    ...config,
    requestId: `u6-sim-${flavour}-${seed}`,
    now: SIM_NOW_MS,
  });

  const primaryConceptId = template.skillIds[0];
  const strengthAfter = Number(state.mastery.concepts[primaryConceptId]?.strength) || 0;
  return {
    quality: Number(applied.quality) || 0,
    strengthAfter,
    conceptId: primaryConceptId,
    templateId: template.id,
  };
}

/**
 * Apply N rounds of correct independent attempts, each round picks the
 * next template from a seeded queue. Returns the final `concepts` mastery
 * map keyed by conceptId. Used by the "20-round replay spread improvement"
 * integration principle.
 *
 * The round picks the first item from a size-1 queue (matching how the
 * engine picks a live next item via `weightedTemplatePick`).
 */
export function run20RoundReplay({ seed, rounds = 20 }) {
  const state = createInitialGrammarState();
  let roundSeed = seed;
  for (let i = 0; i < rounds; i += 1) {
    roundSeed = (roundSeed + (i + 1) * 104729) >>> 0;
    const queue = buildGrammarPracticeQueue({
      mode: 'smart',
      focusConceptId: '',
      mastery: state.mastery,
      recentAttempts: state.recentAttempts,
      seed: roundSeed,
      size: 1,
      now: SIM_NOW_MS + i * 60000,
    });
    const entry = queue[0];
    if (!entry) continue;
    // Only advance rounds when we can probe a correct answer (single_choice).
    const template = grammarTemplateById(entry.templateId);
    const question = createGrammarQuestion({ templateId: template.id, seed: roundSeed });
    if (!question) continue;
    if (question.inputSpec?.type !== 'single_choice' || !Array.isArray(question.inputSpec.options)) {
      // Skip non-choice templates in the replay — we want deterministic
      // correct answers without hand-crafting per-template responses.
      continue;
    }
    const correctOption = question.inputSpec.options.find(
      (option) => evaluateGrammarQuestion(question, { answer: option.value })?.correct,
    );
    if (!correctOption) continue;
    applyGrammarAttemptToState(state, {
      learnerId: 'u6-sim-replay',
      item: serialiseGrammarQuestion(question),
      response: { answer: correctOption.value },
      supportLevel: 0,
      attempts: 1,
      mode: 'smart',
      requestId: `u6-replay-${seed}-${i}`,
      now: SIM_NOW_MS + i * 60000,
    });
  }
  return state.mastery.concepts;
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

function masteryNodeForStatus(status) {
  // These shapes are calibrated against `conceptStatus(node, nowTs)` in
  // worker/src/subjects/grammar/selection.js:61-67. Keeping the constant
  // shapes in one place so a status rename caught at review lands in one
  // file, not scattered across every test.
  if (status === 'due') {
    return {
      attempts: 6,
      correct: 5,
      wrong: 1,
      strength: 0.7,
      intervalDays: 5,
      dueAt: SIM_NOW_MS - 60_000, // overdue by 1 minute
      lastSeenAt: null,
      lastWrongAt: null,
      correctStreak: 3,
    };
  }
  if (status === 'weak') {
    return {
      attempts: 6,
      correct: 1,
      wrong: 5,
      strength: 0.25,
      intervalDays: 0,
      dueAt: SIM_NOW_MS + 86_400_000, // not overdue — isolates weakness
      lastSeenAt: null,
      lastWrongAt: null,
      correctStreak: 0,
    };
  }
  if (status === 'secured') {
    return {
      attempts: 10,
      correct: 10,
      wrong: 0,
      strength: 0.95,
      intervalDays: 21,
      dueAt: SIM_NOW_MS + 21 * 86_400_000, // not due for 21 days
      lastSeenAt: null,
      lastWrongAt: null,
      correctStreak: 8,
    };
  }
  if (status === 'learning') {
    return {
      attempts: 3,
      correct: 2,
      wrong: 1,
      strength: 0.55,
      intervalDays: 2,
      dueAt: SIM_NOW_MS + 2 * 86_400_000,
      lastSeenAt: null,
      lastWrongAt: null,
      correctStreak: 1,
    };
  }
  // 'new' — untouched.
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

/**
 * Pick a deterministic single_choice template for a given seed. Mini-pack
 * balance and mastery-gain assertions only need a stable single-choice
 * template — the specific one does not matter. Choosing by (seed mod N)
 * keeps the per-seed template stable across test runs.
 *
 * Only `inputSpec.type === 'single_choice'` templates are eligible — that is
 * the only input shape where we can generically probe the correct answer by
 * iterating over `inputSpec.options`. Multi-field / table / textarea
 * templates require template-specific response construction and are out of
 * scope for this helper.
 */
function pickChoiceTemplateForSeed(seed) {
  // Pre-probe every template once to identify those whose generator emits a
  // single_choice question. Cached across calls because the template set is
  // fixed at module load.
  if (!SINGLE_CHOICE_TEMPLATES.length) {
    for (const metadata of GRAMMAR_TEMPLATE_METADATA) {
      const probe = createGrammarQuestion({ templateId: metadata.id, seed: 1 });
      if (probe?.inputSpec?.type === 'single_choice' && Array.isArray(probe.inputSpec.options)) {
        SINGLE_CHOICE_TEMPLATES.push(metadata);
      }
    }
    SINGLE_CHOICE_TEMPLATES.sort((a, b) => a.id.localeCompare(b.id));
  }
  if (SINGLE_CHOICE_TEMPLATES.length === 0) {
    throw new Error('pickChoiceTemplateForSeed: no single_choice templates found in GRAMMAR_TEMPLATE_METADATA.');
  }
  return SINGLE_CHOICE_TEMPLATES[(Number(seed) >>> 0) % SINGLE_CHOICE_TEMPLATES.length];
}

const SINGLE_CHOICE_TEMPLATES = [];

// -----------------------------------------------------------------------------
// Diagnostic helpers — keep assertion messages readable when an aggregate
// principle fails.
// -----------------------------------------------------------------------------

export function conceptHitsInQueue(queue, conceptId) {
  if (!Array.isArray(queue)) return [];
  const hits = [];
  queue.forEach((entry, index) => {
    if ((entry?.skillIds || []).includes(conceptId)) hits.push(index);
  });
  return hits;
}

export function templateCountsInQueue(queue) {
  const counts = new Map();
  for (const entry of queue || []) {
    counts.set(entry.templateId, (counts.get(entry.templateId) || 0) + 1);
  }
  return counts;
}

export function questionTypeCountsInPack(pack) {
  const counts = new Map();
  for (const entry of pack || []) {
    counts.set(entry.questionType, (counts.get(entry.questionType) || 0) + 1);
  }
  return counts;
}

/**
 * True iff `queue` contains any run of length >= 3 of consecutive entries
 * that share at least one concept id.
 */
export function hasConsecutiveConceptRun(queue, minRun = 3) {
  if (!Array.isArray(queue) || queue.length < minRun) return false;
  for (let i = 0; i <= queue.length - minRun; i += 1) {
    const first = new Set(queue[i]?.skillIds || []);
    if (first.size === 0) continue;
    let runOk = true;
    for (let j = 1; j < minRun; j += 1) {
      const next = new Set(queue[i + j]?.skillIds || []);
      const shared = [...first].some((id) => next.has(id));
      if (!shared) { runOk = false; break; }
    }
    if (runOk) return true;
  }
  return false;
}
