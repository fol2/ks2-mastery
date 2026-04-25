import { MONSTERS } from '../monsters.js';
import {
  branchForMonster,
  DEFAULT_SYSTEM_ID,
  ensureMonsterBranches,
  GRAMMAR_GRAND_MONSTER_ID,
  GRAMMAR_MONSTER_IDS,
  isPlainObject,
  masteredList,
  releaseIdForEntry,
  saveMonsterState,
  toastBodyFor,
} from './shared.js';

export const GRAMMAR_REWARD_RELEASE_ID = 'grammar-legacy-reviewed-2026-04-24';
export const GRAMMAR_MONSTER_CONCEPTS = Object.freeze({
  bracehart: Object.freeze(['sentence_functions', 'clauses', 'relative_clauses']),
  glossbloom: Object.freeze(['word_classes', 'noun_phrases']),
  loomrill: Object.freeze(['adverbials', 'pronouns_cohesion']),
  chronalyx: Object.freeze(['tense_aspect', 'modal_verbs']),
  couronnail: Object.freeze(['standard_english', 'formality']),
  mirrane: Object.freeze(['active_passive', 'subject_object']),
});
export const GRAMMAR_AGGREGATE_CONCEPTS = Object.freeze([
  'sentence_functions',
  'word_classes',
  'noun_phrases',
  'adverbials',
  'clauses',
  'relative_clauses',
  'tense_aspect',
  'standard_english',
  'pronouns_cohesion',
  'formality',
  'active_passive',
  'subject_object',
  'modal_verbs',
  'parenthesis_commas',
  'speech_punctuation',
  'apostrophes_possession',
  'boundary_punctuation',
  'hyphen_ambiguity',
]);
const GRAMMAR_CONCEPT_TO_MONSTER = Object.freeze(Object.fromEntries(
  Object.entries(GRAMMAR_MONSTER_CONCEPTS)
    .flatMap(([monsterId, conceptIds]) => conceptIds.map((conceptId) => [conceptId, monsterId])),
));

function grammarTotal(entry, fallback = 1) {
  const count = Number(entry?.conceptTotal);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : Math.max(1, Number(fallback) || 1);
}

function grammarStageFor(mastered, total) {
  const denominator = Math.max(1, Number(total) || 1);
  const ratio = Math.max(0, Math.min(1, (Number(mastered) || 0) / denominator));
  if (ratio >= 1) return 4;
  if (ratio >= 0.75) return 3;
  if (ratio >= 0.5) return 2;
  if (ratio > 0) return 1;
  return 0;
}

function grammarMonsterConceptTotal(monsterId) {
  if (monsterId === GRAMMAR_GRAND_MONSTER_ID) return GRAMMAR_AGGREGATE_CONCEPTS.length;
  return GRAMMAR_MONSTER_CONCEPTS[monsterId]?.length || MONSTERS[monsterId]?.masteredMax || 1;
}

export function monsterIdForGrammarConcept(conceptId) {
  return GRAMMAR_CONCEPT_TO_MONSTER[conceptId] || null;
}

export function grammarMasteryKey(conceptId, releaseId = GRAMMAR_REWARD_RELEASE_ID) {
  return `grammar:${releaseId}:${conceptId}`;
}

function grammarConceptIdFromMasteryKey(key, releaseId = GRAMMAR_REWARD_RELEASE_ID) {
  if (typeof key !== 'string' || !key) return '';
  const prefix = `grammar:${releaseId}:`;
  if (key.startsWith(prefix)) return key.slice(prefix.length);
  return '';
}

function grammarMasteredList(entry, releaseId = GRAMMAR_REWARD_RELEASE_ID) {
  const scopedReleaseId = releaseIdForEntry(entry, releaseId) || GRAMMAR_REWARD_RELEASE_ID;
  const conceptIds = new Set();
  const keys = [];
  for (const key of masteredList(entry)) {
    const conceptId = grammarConceptIdFromMasteryKey(key, scopedReleaseId);
    if (!conceptId || conceptIds.has(conceptId)) continue;
    conceptIds.add(conceptId);
    keys.push(key);
  }
  return keys;
}

function grammarMasteredCount(entry, releaseId = GRAMMAR_REWARD_RELEASE_ID) {
  const mastered = masteredList(entry);
  if (mastered.length) return grammarMasteredList(entry, releaseId).length;
  const count = Number(entry?.masteredCount);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

export function progressForGrammarMonster(state, monsterId, { conceptTotal = null, releaseId = GRAMMAR_REWARD_RELEASE_ID } = {}) {
  const entry = isPlainObject(state?.[monsterId]) ? state[monsterId] : { mastered: [], caught: false };
  const mastered = grammarMasteredCount(entry, releaseId);
  const total = grammarTotal(entry, conceptTotal || grammarMonsterConceptTotal(monsterId));
  return {
    mastered,
    conceptTotal: total,
    stage: grammarStageFor(mastered, total),
    level: Math.min(10, Math.round((mastered / Math.max(1, total)) * 10)),
    caught: mastered >= 1,
    branch: branchForMonster(state, monsterId),
    masteredList: grammarMasteredList(entry, releaseId),
  };
}

function buildGrammarEvent({
  learnerId,
  kind,
  monsterId,
  previous,
  next,
  releaseId,
  conceptId,
  masteryKey,
  createdAt = Date.now(),
} = {}) {
  const monster = MONSTERS[monsterId];
  return {
    id: `reward.monster:${learnerId || 'default'}:grammar:${releaseId}:${conceptId}:${monsterId}:${kind}`,
    type: 'reward.monster',
    kind,
    learnerId,
    subjectId: 'grammar',
    systemId: DEFAULT_SYSTEM_ID,
    releaseId,
    conceptId,
    masteryKey,
    monsterId,
    monster,
    previous,
    next,
    createdAt,
    toast: {
      title: monster?.name || 'Reward update',
      body: toastBodyFor(kind),
    },
  };
}

function grammarEventFromTransition(payload, previous, next) {
  if (!previous.caught && next.caught) {
    return buildGrammarEvent({ ...payload, kind: 'caught', previous, next });
  }
  if (next.stage > previous.stage) {
    return buildGrammarEvent({ ...payload, kind: next.stage === 4 ? 'mega' : 'evolve', previous, next });
  }
  if (next.level > previous.level) {
    return buildGrammarEvent({ ...payload, kind: 'levelup', previous, next });
  }
  return null;
}

export function recordGrammarConceptMastery({
  learnerId,
  conceptId,
  releaseId = GRAMMAR_REWARD_RELEASE_ID,
  masteryKey = grammarMasteryKey(conceptId, releaseId),
  createdAt = Date.now(),
  gameStateRepository,
  random = Math.random,
} = {}) {
  if (!GRAMMAR_AGGREGATE_CONCEPTS.includes(conceptId) || !masteryKey) return [];
  const directMonsterId = monsterIdForGrammarConcept(conceptId);
  const before = ensureMonsterBranches(learnerId, gameStateRepository, {
    random,
    monsterIds: GRAMMAR_MONSTER_IDS,
  });
  const aggregateEntry = isPlainObject(before[GRAMMAR_GRAND_MONSTER_ID])
    ? before[GRAMMAR_GRAND_MONSTER_ID]
    : { mastered: [], caught: false };
  const aggregateMastered = masteredList(aggregateEntry);
  const directEntry = directMonsterId && isPlainObject(before[directMonsterId])
    ? before[directMonsterId]
    : { mastered: [], caught: false };
  const directMastered = directMonsterId ? masteredList(directEntry) : [];

  if (aggregateMastered.includes(masteryKey) && (!directMonsterId || directMastered.includes(masteryKey))) {
    return [];
  }

  const beforeAggregate = progressForGrammarMonster(before, GRAMMAR_GRAND_MONSTER_ID, {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  const beforeDirect = directMonsterId
    ? progressForGrammarMonster(before, directMonsterId, {
      conceptTotal: grammarMonsterConceptTotal(directMonsterId),
    })
    : null;

  const after = {
    ...before,
    [GRAMMAR_GRAND_MONSTER_ID]: {
      ...aggregateEntry,
      caught: true,
      conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
      releaseId,
      mastered: aggregateMastered.includes(masteryKey)
        ? aggregateMastered
        : [...aggregateMastered, masteryKey],
    },
  };

  if (directMonsterId) {
    after[directMonsterId] = {
      ...directEntry,
      caught: true,
      conceptTotal: grammarMonsterConceptTotal(directMonsterId),
      releaseId,
      mastered: directMastered.includes(masteryKey)
        ? directMastered
        : [...directMastered, masteryKey],
    };
  }

  const afterAggregate = progressForGrammarMonster(after, GRAMMAR_GRAND_MONSTER_ID, {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  const afterDirect = directMonsterId
    ? progressForGrammarMonster(after, directMonsterId, {
      conceptTotal: grammarMonsterConceptTotal(directMonsterId),
    })
    : null;
  saveMonsterState(learnerId, after, gameStateRepository);

  const events = [];
  if (directMonsterId) {
    const directEvent = grammarEventFromTransition({
      learnerId,
      monsterId: directMonsterId,
      releaseId,
      conceptId,
      masteryKey,
      createdAt,
    }, beforeDirect, afterDirect);
    if (directEvent) events.push(directEvent);
  }

  const aggregateEvent = grammarEventFromTransition({
    learnerId,
    monsterId: GRAMMAR_GRAND_MONSTER_ID,
    releaseId,
    conceptId,
    masteryKey,
    createdAt,
  }, beforeAggregate, afterAggregate);
  if (aggregateEvent) events.push(aggregateEvent);

  return events;
}

export function activeGrammarMonsterSummaryFromState(state = {}) {
  return grammarMonsterSummaryFromState(state)
    .filter((entry) => entry.progress.caught || entry.progress.mastered > 0);
}

export function grammarMonsterSummaryFromState(state = {}) {
  return GRAMMAR_MONSTER_IDS.map((monsterId) => ({
    subjectId: 'grammar',
    monster: MONSTERS[monsterId],
    progress: progressForGrammarMonster(state, monsterId, {
      conceptTotal: grammarMonsterConceptTotal(monsterId),
    }),
  }));
}
