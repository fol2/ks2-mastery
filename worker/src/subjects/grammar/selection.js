import {
  GRAMMAR_CONCEPTS,
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
  grammarQuestionVariantSignature,
  grammarTemplateGeneratorFamilyId,
} from './content.js';

export const SELECTION_WEIGHTS = Object.freeze({
  due: 3.0,
  weak: 2.2,
  newConcept: 0.8,
  recentMiss: 1.6,
  qtWeakness: 1.3,
  templateFreshness: 1.15,
  variantFreshness: 1.45,
  conceptFreshness: 1.1,
  focus: 1.8,
  generative: 1.15,
});

const GRAMMAR_CONCEPT_IDS = new Set(GRAMMAR_CONCEPTS.map((concept) => concept.id));

function seededRandom(seed) {
  let t = (Number(seed) || 0) >>> 0;
  return function random() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function defaultNode() {
  return {
    attempts: 0,
    correct: 0,
    wrong: 0,
    strength: 0.25,
    intervalDays: 0,
    dueAt: 0,
    correctStreak: 0,
  };
}

function nodeFromMastery(mastery, kind, id) {
  const bag = isPlainObject(mastery?.[kind]) ? mastery[kind] : {};
  const raw = isPlainObject(bag[id]) ? bag[id] : null;
  if (!raw) return defaultNode();
  return {
    attempts: Number(raw.attempts) || 0,
    correct: Number(raw.correct) || 0,
    wrong: Number(raw.wrong) || 0,
    strength: Number.isFinite(Number(raw.strength)) ? Number(raw.strength) : 0.25,
    intervalDays: Number(raw.intervalDays) || 0,
    dueAt: Number(raw.dueAt) || 0,
    correctStreak: Number(raw.correctStreak) || 0,
  };
}

function conceptStatus(node, nowTs) {
  if (!node || node.attempts === 0) return 'new';
  if (node.wrong >= 3 && node.correctStreak < 2) return 'weak';
  if (Number(node.dueAt) && Number(node.dueAt) <= nowTs) return 'due';
  if (node.strength >= 0.82 && node.correctStreak >= 3) return 'secured';
  return 'learning';
}

function templateFitsMode(template, mode) {
  if (!template) return false;
  if (mode === 'satsset' && !template.satsFriendly) return false;
  if (mode === 'surgery' && !(template.tags || []).includes('surgery')) return false;
  if (mode === 'builder' && !(template.tags || []).includes('builder')) return false;
  return true;
}

function templateFits(template, { mode, focusConceptId } = {}) {
  if (!templateFitsMode(template, mode)) return false;
  if (focusConceptId && !(template.skillIds || []).includes(focusConceptId)) return false;
  return true;
}

function normaliseRecentAttempts(recentAttempts) {
  if (!Array.isArray(recentAttempts)) return [];
  return recentAttempts
    .filter((entry) => isPlainObject(entry) && typeof entry.templateId === 'string' && entry.templateId.length > 0)
    .slice(-40);
}

function recentTemplateIndex(recentAttempts) {
  const index = new Map();
  const attempts = normaliseRecentAttempts(recentAttempts);
  const horizon = attempts.length;
  attempts.forEach((attempt, position) => {
    const distance = horizon - position; // 1..N, 1 = most recent
    const entry = index.get(attempt.templateId) || { lastDistance: Infinity, count: 0, lastMissDistance: Infinity };
    entry.count += 1;
    if (distance < entry.lastDistance) entry.lastDistance = distance;
    const result = isPlainObject(attempt.result) ? attempt.result : {};
    if (result.correct === false && distance < entry.lastMissDistance) {
      entry.lastMissDistance = distance;
    }
    index.set(attempt.templateId, entry);
  });
  return index;
}

function recentConceptIndex(recentAttempts) {
  const index = new Map();
  const attempts = normaliseRecentAttempts(recentAttempts);
  const horizon = attempts.length;
  attempts.forEach((attempt, position) => {
    const distance = horizon - position;
    const conceptIds = Array.isArray(attempt.conceptIds) ? attempt.conceptIds : [];
    const result = isPlainObject(attempt.result) ? attempt.result : {};
    for (const conceptId of conceptIds) {
      const existing = index.get(conceptId) || { lastDistance: Infinity, count: 0, lastMissDistance: Infinity };
      existing.count += 1;
      if (distance < existing.lastDistance) existing.lastDistance = distance;
      if (result.correct === false && distance < existing.lastMissDistance) {
        existing.lastMissDistance = distance;
      }
      index.set(conceptId, existing);
    }
  });
  return index;
}

function variantKey(generatorFamilyId, variantSignature) {
  if (!generatorFamilyId || !variantSignature) return '';
  return `${generatorFamilyId}:${variantSignature}`;
}

function candidateVariantMetadata(template, seed) {
  if (!template) return { generatorFamilyId: '', variantSignature: '' };
  const generatorFamilyId = grammarTemplateGeneratorFamilyId(template);
  if (!template.generative) return { generatorFamilyId, variantSignature: '' };
  const question = createGrammarQuestion({ templateId: template.id, seed });
  return {
    generatorFamilyId,
    variantSignature: grammarQuestionVariantSignature(question) || '',
  };
}

function recentVariantIndex(recentAttempts) {
  const index = new Map();
  const attempts = normaliseRecentAttempts(recentAttempts);
  const horizon = attempts.length;
  attempts.forEach((attempt, position) => {
    const key = variantKey(attempt.generatorFamilyId, attempt.variantSignature);
    if (!key) return;
    const distance = horizon - position;
    const entry = index.get(key) || { lastDistance: Infinity, count: 0, lastMissDistance: Infinity };
    entry.count += 1;
    if (distance < entry.lastDistance) entry.lastDistance = distance;
    const result = isPlainObject(attempt.result) ? attempt.result : {};
    if (result.correct === false && distance < entry.lastMissDistance) {
      entry.lastMissDistance = distance;
    }
    index.set(key, entry);
  });
  return index;
}

function addPlannedGeneratedVariant(index, template, seed) {
  const candidateVariant = candidateVariantMetadata(template, seed);
  const key = variantKey(candidateVariant.generatorFamilyId, candidateVariant.variantSignature);
  if (!key) return;
  const entry = index.get(key) || { lastDistance: Infinity, count: 0, lastMissDistance: Infinity };
  index.set(key, {
    ...entry,
    count: entry.count + 1,
    lastDistance: Math.min(entry.lastDistance, 1),
  });
}

function hasRecentGeneratedVariant(template, recentVariants, candidateSeed) {
  const candidateVariant = candidateVariantMetadata(template, candidateSeed);
  if (!candidateVariant.variantSignature) return false;
  const recentVariant = recentVariants?.get(variantKey(candidateVariant.generatorFamilyId, candidateVariant.variantSignature));
  return Boolean(recentVariant && recentVariant.lastDistance <= 6);
}

function variantFreshTemplates(pool, recentVariants, candidateSeed) {
  const fresh = pool.filter((template) => !hasRecentGeneratedVariant(template, recentVariants, candidateSeed));
  return fresh.length > 0 ? fresh : pool;
}

function questionTypeWeakness(mastery, questionType) {
  const node = nodeFromMastery(mastery, 'questionTypes', questionType);
  if (node.attempts === 0) return 0;
  if (node.strength < 0.5) return 1;
  if (node.wrong >= 3 && node.correctStreak < 2) return 1;
  return 0;
}

function weightFor(template, context) {
  const {
    mastery,
    focusConceptId,
    recentTemplates,
    recentConcepts,
    recentVariants,
    candidateSeed,
    nowTs,
  } = context;

  const conceptNodes = template.skillIds.map((id) => nodeFromMastery(mastery, 'concepts', id));
  const averageStrength = conceptNodes.reduce((sum, node) => sum + node.strength, 0) / Math.max(1, conceptNodes.length);
  const statuses = conceptNodes.map((node) => conceptStatus(node, nowTs));

  let weight = 1 + (1 - averageStrength) * 4;

  if (statuses.includes('new')) weight += SELECTION_WEIGHTS.newConcept;
  if (statuses.includes('weak')) weight += SELECTION_WEIGHTS.weak;
  if (statuses.includes('due')) weight += SELECTION_WEIGHTS.due;

  // Recent miss bonus: concepts with a miss in the last 10 attempts get boosted
  const conceptMisses = template.skillIds
    .map((id) => recentConcepts.get(id))
    .filter((entry) => entry && entry.lastMissDistance <= 10);
  if (conceptMisses.length > 0) weight *= SELECTION_WEIGHTS.recentMiss;

  // Question-type weakness bonus
  if (questionTypeWeakness(mastery, template.questionType)) {
    weight *= SELECTION_WEIGHTS.qtWeakness;
  }

  // Template freshness penalty
  const templateEntry = recentTemplates.get(template.id);
  if (templateEntry) {
    if (templateEntry.lastDistance <= 3) {
      weight /= (SELECTION_WEIGHTS.templateFreshness + 0.35 * (4 - templateEntry.lastDistance));
    } else if (templateEntry.count >= 2) {
      weight /= SELECTION_WEIGHTS.templateFreshness;
    }
  }

  // Generated variant freshness penalty. The signature is derived from visible
  // prompt/input surface data only, so it avoids repeating the same generated
  // variant without storing hidden answers in learner-facing read models.
  const candidateVariant = candidateVariantMetadata(template, candidateSeed);
  const recentVariant = recentVariants?.get(variantKey(candidateVariant.generatorFamilyId, candidateVariant.variantSignature));
  if (recentVariant) {
    if (recentVariant.lastDistance <= 6) {
      weight /= (SELECTION_WEIGHTS.variantFreshness + 0.25 * (7 - recentVariant.lastDistance));
    } else {
      weight /= SELECTION_WEIGHTS.variantFreshness;
    }
  }

  // Concept freshness penalty: all skillIds seen within last 2 attempts
  const freshConcepts = template.skillIds
    .map((id) => recentConcepts.get(id))
    .filter((entry) => entry && entry.lastDistance <= 2);
  if (freshConcepts.length === template.skillIds.length && template.skillIds.length > 0) {
    weight /= SELECTION_WEIGHTS.conceptFreshness;
  }

  if (focusConceptId && template.skillIds.includes(focusConceptId)) {
    weight *= SELECTION_WEIGHTS.focus;
  }
  if (template.generative) weight *= SELECTION_WEIGHTS.generative;

  return Math.max(0.05, weight);
}

// Focus-aware pool rebuilder: when a focus concept is set, the focused subset
// is returned, but if the focused subset is smaller than the requested queue
// size we broaden to mode candidates so the queue still reaches the target
// length. The focus weight (SELECTION_WEIGHTS.focus) still biases picks
// towards focus templates inside the broadened pool.
function focusAwarePool(mode, focusConceptId, targetSize) {
  const modeCandidates = GRAMMAR_TEMPLATE_METADATA.filter((template) => templateFitsMode(template, mode));
  if (modeCandidates.length === 0) return GRAMMAR_TEMPLATE_METADATA.slice();
  if (!focusConceptId) return modeCandidates;
  const focused = modeCandidates.filter((template) => (template.skillIds || []).includes(focusConceptId));
  if (focused.length === 0) return modeCandidates;
  if (focused.length >= targetSize) return focused;
  return modeCandidates;
}

function normaliseFocus(focusConceptId) {
  return typeof focusConceptId === 'string' && GRAMMAR_CONCEPT_IDS.has(focusConceptId) ? focusConceptId : '';
}

function pickTemplate({ pool, rng, mastery, focusConceptId, recentTemplates, recentConcepts, recentVariants, candidateSeed, nowTs }) {
  const candidatePool = variantFreshTemplates(pool, recentVariants, candidateSeed);
  const weighted = candidatePool.map((template) => [template, weightFor(template, {
    mastery,
    focusConceptId,
    recentTemplates,
    recentConcepts,
    recentVariants,
    candidateSeed,
    nowTs,
  })]);
  const total = weighted.reduce((sum, entry) => sum + entry[1], 0);
  if (!(total > 0)) return weighted[0]?.[0] || pool[0];
  let roll = rng() * total;
  for (const [template, weight] of weighted) {
    roll -= weight;
    if (roll <= 0) return template;
  }
  return weighted.at(-1)?.[0] || pool[0];
}

function urgentConceptScore(conceptId, mastery, recentConcepts, nowTs) {
  const node = nodeFromMastery(mastery, 'concepts', conceptId);
  const status = conceptStatus(node, nowTs);
  const recent = recentConcepts.get(conceptId);
  const missDistance = Number(recent?.lastMissDistance) || Infinity;
  let score = 0;

  if (missDistance <= 10) {
    score += 100 + (11 - missDistance);
  }
  if (status === 'weak') {
    score += 60;
  } else if (status === 'due') {
    score += 35;
  }

  return score;
}

function urgentTemplatePool(pool, mastery, recentConcepts, nowTs) {
  const availableConcepts = new Set();
  for (const template of pool) {
    for (const conceptId of template.skillIds || []) {
      availableConcepts.add(conceptId);
    }
  }

  const scoredConcepts = GRAMMAR_CONCEPTS
    .map((concept) => ({
      conceptId: concept.id,
      score: availableConcepts.has(concept.id)
        ? urgentConceptScore(concept.id, mastery, recentConcepts, nowTs)
        : 0,
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.conceptId.localeCompare(b.conceptId));

  if (scoredConcepts.length === 0) return [];

  const topScore = scoredConcepts[0].score;
  const topConcepts = new Set(
    scoredConcepts
      .filter((entry) => entry.score === topScore)
      .map((entry) => entry.conceptId),
  );

  return pool.filter((template) => (template.skillIds || []).some((conceptId) => topConcepts.has(conceptId)));
}

function recentAttemptForQueueTemplate(template, seed) {
  const variant = candidateVariantMetadata(template, seed);
  return {
    templateId: template.id,
    conceptIds: (template.skillIds || []).slice(),
    questionType: template.questionType,
    result: { correct: true },
    generatorFamilyId: variant.generatorFamilyId || grammarTemplateGeneratorFamilyId(template),
    variantSignature: variant.variantSignature || '',
  };
}

function queueEntry(template) {
  return {
    templateId: template.id,
    skillIds: (template.skillIds || []).slice(),
    questionType: template.questionType,
    generative: Boolean(template.generative),
    satsFriendly: Boolean(template.satsFriendly),
  };
}

export function buildGrammarPracticeQueue({
  mode,
  focusConceptId = '',
  mastery = null,
  recentAttempts = [],
  seed = 1,
  size = 1,
  now = Date.now(),
} = {}) {
  const safeSize = Math.max(0, Math.floor(Number(size) || 0));
  if (safeSize === 0) return [];
  const normalisedFocus = normaliseFocus(focusConceptId);
  const pool = focusAwarePool(mode, normalisedFocus, safeSize);
  const nowTs = Number(now) || Date.now();
  const rng = seededRandom(Number(seed) || 1);
  const workingRecent = Array.isArray(recentAttempts) ? recentAttempts.slice() : [];
  const workingRecentVariants = recentVariantIndex(recentAttempts);
  const queue = [];

  if (normalisedFocus) {
    const focusTemplates = pool.filter((template) => (template.skillIds || []).includes(normalisedFocus));
    if (focusTemplates.length > 0 && focusTemplates.length < safeSize) {
      for (const template of focusTemplates) {
        if (queue.length >= safeSize) break;
        const candidateSeed = ((Number(seed) || 1) + queue.length * 104729) >>> 0;
        const recentVariants = workingRecentVariants;
        if (hasRecentGeneratedVariant(template, recentVariants, candidateSeed)) continue;
        queue.push(queueEntry(template));
        workingRecent.push(recentAttemptForQueueTemplate(template, candidateSeed));
        addPlannedGeneratedVariant(workingRecentVariants, template, candidateSeed);
      }
    }
  }

  if (queue.length < safeSize) {
    const candidateSeed = ((Number(seed) || 1) + queue.length * 104729) >>> 0;
    const recentTemplates = recentTemplateIndex(workingRecent);
    const recentConcepts = recentConceptIndex(workingRecent);
    const recentVariants = workingRecentVariants;
    const priorityPool = urgentTemplatePool(pool, mastery, recentConcepts, nowTs);
    if (priorityPool.length > 0) {
      const template = pickTemplate({
        pool: priorityPool,
        rng,
        mastery,
        focusConceptId: normalisedFocus,
        recentTemplates,
        recentConcepts,
        recentVariants,
        candidateSeed,
        nowTs,
      });
      queue.push(queueEntry(template));
      workingRecent.push(recentAttemptForQueueTemplate(template, candidateSeed));
      addPlannedGeneratedVariant(workingRecentVariants, template, candidateSeed);
    }
  }

  while (queue.length < safeSize) {
    const candidateSeed = ((Number(seed) || 1) + queue.length * 104729) >>> 0;
    const recentTemplates = recentTemplateIndex(workingRecent);
    const recentConcepts = recentConceptIndex(workingRecent);
    const recentVariants = workingRecentVariants;
    const template = pickTemplate({
      pool,
      rng,
      mastery,
      focusConceptId: normalisedFocus,
      recentTemplates,
      recentConcepts,
      recentVariants,
      candidateSeed,
      nowTs,
    });
    queue.push(queueEntry(template));
    workingRecent.push(recentAttemptForQueueTemplate(template, candidateSeed));
    addPlannedGeneratedVariant(workingRecentVariants, template, candidateSeed);
  }
  return queue;
}

export function buildGrammarMiniPack({
  size = 8,
  focusConceptId = '',
  mastery = null,
  recentAttempts = [],
  seed = 1,
  now = Date.now(),
} = {}) {
  // Contract parity with buildGrammarPracticeQueue: size=0 returns an empty
  // array rather than silently coercing to a single-item pack. Surfaced by
  // the U6 seeded simulation suite (tests/grammar-learning-integrity.test.js).
  const requestedSize = Math.floor(Number(size) || 0);
  if (requestedSize <= 0) return [];
  const safeSize = Math.max(1, requestedSize);
  const normalisedFocus = normaliseFocus(focusConceptId);
  const pool = focusAwarePool('satsset', normalisedFocus, safeSize);
  const nowTs = Number(now) || Date.now();
  const rng = seededRandom(Number(seed) || 1);
  const workingRecent = Array.isArray(recentAttempts) ? recentAttempts.slice() : [];
  const workingRecentVariants = recentVariantIndex(recentAttempts);
  const seeds = Array.from({ length: safeSize }, (_, index) => ((Number(seed) || 1) + index * 104729) >>> 0);
  const pack = [];
  const usedTemplateIds = new Set();
  const usedQuestionTypes = new Map(); // questionType -> count

  // Focus-saturation phase: when a focus concept is set and its pool is narrower
  // than the requested pack size, seed the pack with the focus templates first so
  // the learner sees each focus template at least once before broadening.
  if (normalisedFocus) {
    const focusTemplates = pool.filter((t) => (t.skillIds || []).includes(normalisedFocus));
    if (focusTemplates.length > 0 && focusTemplates.length < safeSize) {
      for (const template of focusTemplates) {
        if (pack.length >= safeSize) break;
        const candidateSeed = seeds[pack.length] || Number(seed) || 1;
        const recentVariants = workingRecentVariants;
        if (hasRecentGeneratedVariant(template, recentVariants, candidateSeed)) continue;
        pack.push(queueEntry(template));
        usedTemplateIds.add(template.id);
        usedQuestionTypes.set(template.questionType, (usedQuestionTypes.get(template.questionType) || 0) + 1);
        workingRecent.push(recentAttemptForQueueTemplate(template, candidateSeed));
        addPlannedGeneratedVariant(workingRecentVariants, template, candidateSeed);
      }
    }
  }

  while (pack.length < safeSize) {
    // Pool smaller than requested size: allow duplicates by resetting
    // the distinct-template set whenever it exhausts the pool.
    if (usedTemplateIds.size >= pool.length) usedTemplateIds.clear();
    const distinctAvailable = pool.filter((t) => !usedTemplateIds.has(t.id));
    // Question-type quota: cap same type at ceil(size/3) unless pool forces it.
    // Contract: mini-packs assume size >= 6. For sizes < 6 the floor of 2
    // matches or exceeds the pack size so the quota is effectively inert —
    // that is the intended degenerate behaviour for very small packs.
    const qtCap = Math.max(2, Math.ceil(safeSize / 3));
    const quotaFiltered = distinctAvailable.filter((t) => (usedQuestionTypes.get(t.questionType) || 0) < qtCap);

    const roundPool = quotaFiltered.length > 0
      ? quotaFiltered
      : (distinctAvailable.length > 0 ? distinctAvailable : pool);

    const recentTemplates = recentTemplateIndex(workingRecent);
    const recentConcepts = recentConceptIndex(workingRecent);
    const recentVariants = workingRecentVariants;
    const candidateSeed = seeds[pack.length] || Number(seed) || 1;
    const template = pickTemplate({
      pool: roundPool,
      rng,
      mastery,
      focusConceptId: normalisedFocus,
      recentTemplates,
      recentConcepts,
      recentVariants,
      candidateSeed,
      nowTs,
    });

    pack.push(queueEntry(template));
    usedTemplateIds.add(template.id);
    usedQuestionTypes.set(template.questionType, (usedQuestionTypes.get(template.questionType) || 0) + 1);
    workingRecent.push(recentAttemptForQueueTemplate(template, candidateSeed));
    addPlannedGeneratedVariant(workingRecentVariants, template, candidateSeed);
  }

  return pack.slice(0, safeSize);
}
