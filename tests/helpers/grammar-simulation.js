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

// -----------------------------------------------------------------------------
// Multi-day Star-curve simulation (Phase 5 U3)
// -----------------------------------------------------------------------------

import {
  GRAMMAR_MONSTER_STAR_MAX,
  GRAMMAR_STAR_STAGE_THRESHOLDS,
  GRAMMAR_CONCEPT_STAR_WEIGHTS,
  deriveGrammarConceptStarEvidence,
  computeGrammarMonsterStars,
  grammarStarStageFor,
} from '../../shared/grammar/grammar-stars.js';

import {
  GRAMMAR_MONSTER_CONCEPTS,
  GRAMMAR_AGGREGATE_CONCEPTS,
} from '../../src/platform/game/mastery/grammar.js';

/** One simulated day in milliseconds. */
export const DAY_MS = 86_400_000;

/**
 * Seeded PRNG matching the one used in grammar-concordium-invariant.test.js.
 * Returns values in [0, 1).
 */
export function makeSeededRandom(seed = 1) {
  let value = seed >>> 0;
  return function seededRandom() {
    value += 0x6D2B79F5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

// All 13 Grammar concepts that map to direct monsters.
const DIRECT_GRAMMAR_CONCEPTS = Object.values(GRAMMAR_MONSTER_CONCEPTS).flat();

// The 5 Punctuation-for-Grammar concepts (in Concordium only).
const PUNCTUATION_CONCEPTS = GRAMMAR_AGGREGATE_CONCEPTS.filter(
  (c) => !DIRECT_GRAMMAR_CONCEPTS.includes(c),
);

/**
 * Create a fresh per-concept mastery map for the simulation.
 * Each concept tracks the minimal fields needed for evidence-tier derivation.
 *
 * The initial strength of 0.10 models a fresh concept with no prior exposure.
 * Strength grows by +0.08 per correct (slower than the +0.15 in the real
 * engine, which already accounts for quality-weighted adjustments that make
 * the effective gain closer to 0.08 for typical answers). This means reaching
 * secure (>= 0.82) takes ~9 consecutive correct answers from scratch.
 */
function createSimConceptMap() {
  const map = {};
  for (const conceptId of GRAMMAR_AGGREGATE_CONCEPTS) {
    map[conceptId] = {
      attempts: 0,
      correct: 0,
      wrong: 0,
      independentCorrects: 0,
      strength: 0.10,
      intervalDays: 0,
      correctStreak: 0,
      distinctTemplates: new Set(),
      dueDay: 0, // day number when next due
      wasSecured: false, // latched: was ever at secure threshold
      retentionProven: false, // latched: independent correct after secure
      secureDaySeen: null, // day when first reached secure (for retention timing)
    };
  }
  return map;
}

/**
 * Determine which evidence tiers are unlocked for a concept node.
 * This mirrors deriveGrammarConceptStarEvidence but operates on our
 * simplified simulation nodes rather than engine recentAttempts.
 */
function simEvidenceForConcept(node) {
  const evidence = {
    firstIndependentWin: false,
    repeatIndependentWin: false,
    variedPractice: false,
    secureConfidence: false,
    retainedAfterSecure: false,
  };
  if (node.independentCorrects >= 1) evidence.firstIndependentWin = true;
  if (node.independentCorrects >= 2) evidence.repeatIndependentWin = true;
  if (node.distinctTemplates.size >= 2) evidence.variedPractice = true;

  const isSecure = node.strength >= 0.82 && node.intervalDays >= 7 && node.correctStreak >= 3;
  if (isSecure || node.wasSecured) {
    evidence.secureConfidence = true;
  }

  if (node.retentionProven) {
    evidence.retainedAfterSecure = true;
  }
  return evidence;
}

/**
 * Compute Stars for a monster using simulation concept nodes.
 */
function simMonsterStars(monsterId, conceptMap) {
  const conceptIds = monsterId === 'concordium'
    ? GRAMMAR_AGGREGATE_CONCEPTS
    : (GRAMMAR_MONSTER_CONCEPTS[monsterId] || []);

  const evidenceMap = {};
  for (const cid of conceptIds) {
    evidenceMap[cid] = simEvidenceForConcept(conceptMap[cid]);
  }
  return computeGrammarMonsterStars(monsterId, evidenceMap);
}

/**
 * Pick concepts for today's round using a scheduling heuristic that models
 * real Smart Practice behaviour:
 *
 *  1. Due concepts first (dueDay <= currentDay) — spaced repetition review
 *  2. Secured-but-not-retained concepts — retention review candidates
 *  3. Weakest non-due concepts (lowest strength) — struggling areas
 *  4. Fresh concepts (never attempted) — new material introduction
 *
 * The scheduler introduces at most 1-2 fresh concepts per day (matching the
 * real engine's pacing) and reserves ~30% of the round for retention review
 * of secured concepts that have not yet proven retention.
 *
 * Each concept appears at most twice per day to avoid artificial cramming.
 *
 * Returns up to `count` concept IDs.
 */
function pickConceptsForDay(conceptMap, currentDay, count, rng) {
  const due = [];
  const needsRetention = [];
  const weak = [];
  const fresh = [];

  for (const conceptId of DIRECT_GRAMMAR_CONCEPTS) {
    const node = conceptMap[conceptId];
    if (node.attempts === 0) {
      fresh.push(conceptId);
    } else if (node.dueDay <= currentDay) {
      due.push(conceptId);
    } else if (node.wasSecured && !node.retentionProven) {
      needsRetention.push(conceptId);
    } else {
      weak.push(conceptId);
    }
  }

  // Sort weak by strength ascending (weakest first).
  weak.sort((a, b) => conceptMap[a].strength - conceptMap[b].strength);
  // Shuffle retention and fresh pools for variety.
  shuffleArray(needsRetention, rng);
  shuffleArray(fresh, rng);

  const picks = [];
  const conceptCount = new Map();

  function tryAdd(conceptId) {
    if (picks.length >= count) return false;
    const c = conceptCount.get(conceptId) || 0;
    if (c >= 2) return false; // max 2 per concept per day
    picks.push(conceptId);
    conceptCount.set(conceptId, c + 1);
    return true;
  }

  // Phase 1: due concepts (spaced repetition).
  for (const cid of due) tryAdd(cid);

  // Phase 2: retention review — ~30% of remaining capacity.
  const retentionSlots = Math.max(1, Math.floor((count - picks.length) * 0.3));
  for (let i = 0; i < retentionSlots && i < needsRetention.length; i++) {
    tryAdd(needsRetention[i]);
  }

  // Phase 3: weak concepts.
  for (const cid of weak) tryAdd(cid);

  // Phase 4: fresh concepts — at most 2 new per day.
  let freshAdded = 0;
  for (const cid of fresh) {
    if (freshAdded >= 2) break;
    if (tryAdd(cid)) freshAdded++;
  }

  // Phase 5: fill remaining slots by cycling through all available.
  const allPool = [...due, ...needsRetention, ...weak, ...fresh];
  let poolIdx = 0;
  while (picks.length < count && allPool.length > 0) {
    tryAdd(allPool[poolIdx % allPool.length]);
    poolIdx++;
    if (poolIdx > allPool.length * 3) break; // safety valve
  }

  return picks;
}

function shuffleArray(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

/**
 * Apply the result of a single question attempt to a concept node.
 *
 * @param {object} node - The simulation concept node (mutated in place).
 * @param {boolean} correct - Whether the answer was correct.
 * @param {boolean} independent - Whether the answer was independent (no support).
 * @param {number} rng - A call to the seeded PRNG (for template assignment).
 * @param {number} currentDay - The current simulation day.
 */
function applySimAttempt(node, correct, independent, rng, currentDay) {
  node.attempts++;

  // Assign a "template" — we use a simple numeric scheme. Each concept
  // can cycle through 4 simulated templates (matching the 2-template
  // minimum needed for variedPractice).
  const templateId = Math.floor(rng() * 4);
  node.distinctTemplates.add(templateId);

  if (correct) {
    node.correct++;
    if (independent) {
      node.independentCorrects++;

      // Check retention BEFORE updating strength/streak, because
      // "retained after secure" means the learner was PREVIOUSLY secure
      // and is now answering correctly again. The concept must have been
      // secured on a PREVIOUS day (not today) to count as retention.
      if (node.wasSecured && !node.retentionProven && node.secureDaySeen !== null && currentDay > node.secureDaySeen) {
        node.retentionProven = true;
      }
    }
    node.correctStreak++;

    // Strength gain: +0.08 per correct. From 0.10, reaching 0.82 takes
    // ceil((0.82 - 0.10) / 0.08) = 9 consecutive correct answers.
    // With spaced repetition, this spans multiple days.
    node.strength = Math.min(0.99, node.strength + 0.08);

    // SM-2-like interval advancement:
    //   0 -> 1 -> 2 -> 4 -> 7 -> 12 -> 21 -> 37 -> 64 -> 90
    // This models the real engine's graduated spacing. Reaching
    // intervalDays >= 7 takes at least 4 consecutive correct reviews
    // across different days.
    if (node.intervalDays === 0) {
      node.intervalDays = 1;
    } else if (node.intervalDays === 1) {
      node.intervalDays = 2;
    } else {
      node.intervalDays = Math.min(90, Math.round(node.intervalDays * 1.75));
    }
    node.dueDay = currentDay + node.intervalDays;
  } else {
    node.wrong++;
    node.correctStreak = 0;
    // Wrong answer reduces strength and resets interval partially.
    node.strength = Math.max(0.02, node.strength - 0.12);
    // Interval does not fully reset — drop to max(1, floor(interval/3)).
    node.intervalDays = Math.max(1, Math.floor(node.intervalDays / 3));
    node.dueDay = currentDay + 1;
  }

  // Latch secure status: strength >= 0.82, interval >= 7 days, streak >= 3.
  if (
    !node.wasSecured &&
    node.strength >= 0.82 &&
    node.intervalDays >= 7 &&
    node.correctStreak >= 3
  ) {
    node.wasSecured = true;
    node.secureDaySeen = currentDay;
  }
}

/**
 * Also update punctuation concepts (for Concordium). These advance
 * independently via the Punctuation subject with its own practice sessions.
 *
 * Models a child doing Punctuation practice on most school days:
 * - Ideal: 5 days/week, 2 punctuation concepts per session
 * - Typical: 4 days/week, 1-2 punctuation concepts per session
 * - Struggling: 3 days/week, 1 punctuation concept per session
 *
 * Punctuation concepts follow the same mastery model (strength, interval,
 * streak) since they feed into Concordium via the cross-subject pipeline.
 */
function advancePunctuationConcepts(conceptMap, currentDay, rng, profile) {
  // Determine if today is a punctuation practice day.
  const dayOfWeek = currentDay % 7; // 0=Mon..6=Sun
  const isWeekend = dayOfWeek >= 5;
  if (isWeekend) return; // No weekend practice

  const practiceChance = profile === 'ideal' ? 1.0 : profile === 'typical' ? 0.8 : 0.6;
  if (rng() > practiceChance) return;

  const conceptsPerSession = profile === 'ideal' ? 2 : profile === 'typical' ? (rng() < 0.5 ? 2 : 1) : 1;
  const correctRate = profile === 'ideal' ? 0.90 : profile === 'typical' ? 0.75 : 0.55;

  // Pick punctuation concepts: due first, then by lowest strength.
  const sorted = PUNCTUATION_CONCEPTS.slice().sort((a, b) => {
    const aNode = conceptMap[a];
    const bNode = conceptMap[b];
    // Due concepts first.
    const aDue = aNode.dueDay <= currentDay ? 0 : 1;
    const bDue = bNode.dueDay <= currentDay ? 0 : 1;
    if (aDue !== bDue) return aDue - bDue;
    // Then by strength ascending.
    return aNode.strength - bNode.strength;
  });

  for (let i = 0; i < conceptsPerSession && i < sorted.length; i++) {
    const cid = sorted[i];
    const node = conceptMap[cid];
    const isCorrect = rng() < correctRate;
    applySimAttempt(node, isCorrect, isCorrect, rng, currentDay);
  }
}

/**
 * Run a multi-day Grammar star-curve simulation for a learner profile.
 *
 * @param {string} profileName - 'ideal' | 'typical' | 'struggling'
 * @param {object} options
 * @param {number} options.questionsPerDay - Questions per day (5 or 10).
 * @param {number} options.seed - Seed for deterministic PRNG.
 * @param {number} [options.maxDays=150] - Maximum days to simulate.
 * @returns {object} Milestone timeline results.
 */
export function simulateStarCurveProfile(profileName, { questionsPerDay, seed, maxDays = 150 } = {}) {
  const rng = makeSeededRandom(seed);
  const conceptMap = createSimConceptMap();

  // Profile-specific parameters.
  const correctRate = profileName === 'ideal' ? 0.90
    : profileName === 'typical' ? 0.75 : 0.55;
  const supportRate = profileName === 'ideal' ? 0.00
    : profileName === 'typical' ? 0.20 : 0.40;

  // Track milestone days.
  const milestones = {
    daysToFirstDirectEgg: null,
    daysToFirstHatch: null,
    daysToFirstDirectMega: null,
    daysToFirstConcordiumEgg: null,
    daysToGrandConcordium: null,
    finalStars: {},
    dayLog: [],
  };

  const directMonsters = ['bracehart', 'chronalyx', 'couronnail'];

  for (let day = 1; day <= maxDays; day++) {
    // Pick concepts for today's round.
    const todaysConcepts = pickConceptsForDay(conceptMap, day, questionsPerDay, rng);

    // Simulate each question.
    for (const conceptId of todaysConcepts) {
      const node = conceptMap[conceptId];
      const isCorrect = rng() < correctRate;
      const isSupported = rng() < supportRate;
      const isIndependent = isCorrect && !isSupported;

      applySimAttempt(node, isCorrect, isIndependent, rng, day);
    }

    // Advance punctuation concepts for Concordium.
    advancePunctuationConcepts(conceptMap, day, rng, profileName);

    // Compute Stars for all monsters.
    const starsByMonster = {};
    for (const mid of [...directMonsters, 'concordium']) {
      starsByMonster[mid] = simMonsterStars(mid, conceptMap).stars;
    }

    // Check milestones for direct monsters.
    if (milestones.daysToFirstDirectEgg === null) {
      for (const mid of directMonsters) {
        if (starsByMonster[mid] >= GRAMMAR_STAR_STAGE_THRESHOLDS.egg) {
          milestones.daysToFirstDirectEgg = day;
          break;
        }
      }
    }
    if (milestones.daysToFirstHatch === null) {
      for (const mid of directMonsters) {
        if (starsByMonster[mid] >= GRAMMAR_STAR_STAGE_THRESHOLDS.hatch) {
          milestones.daysToFirstHatch = day;
          break;
        }
      }
    }
    if (milestones.daysToFirstDirectMega === null) {
      for (const mid of directMonsters) {
        if (starsByMonster[mid] >= GRAMMAR_STAR_STAGE_THRESHOLDS.mega) {
          milestones.daysToFirstDirectMega = day;
          break;
        }
      }
    }

    // Check Concordium milestones.
    if (milestones.daysToFirstConcordiumEgg === null) {
      if (starsByMonster.concordium >= GRAMMAR_STAR_STAGE_THRESHOLDS.egg) {
        milestones.daysToFirstConcordiumEgg = day;
      }
    }
    if (milestones.daysToGrandConcordium === null) {
      if (starsByMonster.concordium >= GRAMMAR_STAR_STAGE_THRESHOLDS.mega) {
        milestones.daysToGrandConcordium = day;
      }
    }

    // Snapshot for day log (sparse — only when milestones change or every 7 days).
    if (
      day <= 3 ||
      day % 7 === 0 ||
      day === maxDays ||
      milestones.daysToFirstDirectEgg === day ||
      milestones.daysToFirstHatch === day ||
      milestones.daysToFirstDirectMega === day ||
      milestones.daysToFirstConcordiumEgg === day ||
      milestones.daysToGrandConcordium === day
    ) {
      milestones.dayLog.push({ day, stars: { ...starsByMonster } });
    }

    // Early exit when all milestones hit.
    if (
      milestones.daysToFirstDirectEgg !== null &&
      milestones.daysToFirstHatch !== null &&
      milestones.daysToFirstDirectMega !== null &&
      milestones.daysToFirstConcordiumEgg !== null &&
      milestones.daysToGrandConcordium !== null
    ) {
      milestones.finalStars = starsByMonster;
      break;
    }
  }

  // Compute final Stars if not already set.
  if (!milestones.finalStars || Object.keys(milestones.finalStars).length === 0) {
    const starsByMonster = {};
    for (const mid of [...directMonsters, 'concordium']) {
      starsByMonster[mid] = simMonsterStars(mid, conceptMap).stars;
    }
    milestones.finalStars = starsByMonster;
  }

  return milestones;
}

/**
 * Run a profile simulation across multiple seeds and return aggregated results.
 *
 * @param {string} profileName
 * @param {object} options
 * @param {number} options.questionsPerDay
 * @param {number[]} options.seeds
 * @param {number} [options.maxDays]
 * @returns {{ seeds: number[], results: object[], medians: object }}
 */
export function simulateStarCurveAcrossSeeds(profileName, { questionsPerDay, seeds, maxDays } = {}) {
  const results = [];
  for (const seed of seeds) {
    results.push({
      seed,
      ...simulateStarCurveProfile(profileName, { questionsPerDay, seed, maxDays }),
    });
  }

  // Compute medians for each milestone across seeds.
  const milestoneKeys = [
    'daysToFirstDirectEgg',
    'daysToFirstHatch',
    'daysToFirstDirectMega',
    'daysToFirstConcordiumEgg',
    'daysToGrandConcordium',
  ];

  const medians = {};
  for (const key of milestoneKeys) {
    const values = results
      .map((r) => r[key])
      .filter((v) => v !== null)
      .sort((a, b) => a - b);
    medians[key] = values.length > 0
      ? values[Math.floor(values.length / 2)]
      : null;
  }

  return { seeds, results, medians };
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
