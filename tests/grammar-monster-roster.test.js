// Phase 3 U0 Grammar roster regression suite. Covers the 7 -> 4 + 3 roster
// flip, cluster remap, read-time normaliser, writer self-heal event
// suppression, projection-layer dedupe, home-surface landmines, and Codex
// power-rank ordering. Mirrors `tests/punctuation-rewards.test.js` in scope
// while adding the Grammar-specific writer self-heal assertions.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MONSTERS,
  MONSTERS_BY_SUBJECT,
} from '../src/platform/game/monsters.js';
import {
  GRAMMAR_AGGREGATE_CONCEPTS,
  GRAMMAR_CONCEPT_TO_MONSTER,
  GRAMMAR_MONSTER_CONCEPTS,
  GRAMMAR_REWARD_RELEASE_ID,
  activeGrammarMonsterSummaryFromState,
  grammarMasteryKey,
  grammarMonsterSummaryFromState,
  monsterIdForGrammarConcept,
  monsterSummaryFromSpellingAnalytics,
  monsterSummaryFromState,
  normaliseGrammarRewardState,
  progressForGrammarMonster,
  recordGrammarConceptMastery,
} from '../src/platform/game/monster-system.js';
import {
  GRAMMAR_MONSTER_IDS,
  GRAMMAR_RESERVED_MONSTER_IDS,
} from '../src/platform/game/mastery/shared.js';
import {
  GRAMMAR_MONSTER_ROUTES,
} from '../src/subjects/grammar/metadata.js';
import {
  buildCodexEntries,
  pickFeaturedCodexEntry,
} from '../src/surfaces/home/data.js';
import {
  combineCommandEvents,
  grammarTerminalConceptToken,
} from '../worker/src/projections/events.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeRepository(initialState = {}) {
  let state = clone(initialState);
  return {
    read() {
      return clone(state);
    },
    write(_learnerId, _systemId, nextState) {
      state = clone(nextState);
      return clone(state);
    },
    state() {
      return clone(state);
    },
  };
}

// -------- Roster shape ----------------------------------------------------

test('U0 shape: MONSTERS_BY_SUBJECT.grammar lists exactly the four active ids', () => {
  assert.deepEqual(
    MONSTERS_BY_SUBJECT.grammar,
    ['bracehart', 'chronalyx', 'couronnail', 'concordium'],
  );
});

test('U0 shape: MONSTERS_BY_SUBJECT.grammarReserve lists exactly the three retired ids', () => {
  assert.deepEqual(
    MONSTERS_BY_SUBJECT.grammarReserve,
    ['glossbloom', 'loomrill', 'mirrane'],
  );
});

test('U0 shape: GRAMMAR_MONSTER_IDS narrows to the four active ids', () => {
  assert.deepEqual([...GRAMMAR_MONSTER_IDS], ['bracehart', 'chronalyx', 'couronnail', 'concordium']);
});

test('U0 shape: GRAMMAR_RESERVED_MONSTER_IDS narrows to the three retired ids', () => {
  assert.deepEqual([...GRAMMAR_RESERVED_MONSTER_IDS], ['glossbloom', 'loomrill', 'mirrane']);
});

test('U0 shape: retired Grammar monsters still exist in the MONSTERS registry for asset tooling', () => {
  for (const id of ['glossbloom', 'loomrill', 'mirrane']) {
    assert.ok(MONSTERS[id], `${id} must remain in MONSTERS for asset tooling`);
  }
});

test('U0 shape: GRAMMAR_MONSTER_ROUTES has exactly four entries', () => {
  assert.equal(GRAMMAR_MONSTER_ROUTES.length, 4);
  assert.deepEqual(
    GRAMMAR_MONSTER_ROUTES.map((route) => route.id),
    ['bracehart', 'chronalyx', 'couronnail', 'concordium'],
  );
});

// -------- Cluster remap ----------------------------------------------------

test('U0 cluster remap: Bracehart absorbs Sentence structure + noun_phrases (6 concepts)', () => {
  assert.equal(GRAMMAR_MONSTER_CONCEPTS.bracehart.length, 6);
  for (const conceptId of ['sentence_functions', 'clauses', 'relative_clauses', 'noun_phrases', 'active_passive', 'subject_object']) {
    assert.ok(
      GRAMMAR_MONSTER_CONCEPTS.bracehart.includes(conceptId),
      `Bracehart cluster must include ${conceptId}`,
    );
  }
});

test('U0 cluster remap: Chronalyx absorbs Flow / Linkage (4 concepts)', () => {
  assert.equal(GRAMMAR_MONSTER_CONCEPTS.chronalyx.length, 4);
  for (const conceptId of ['tense_aspect', 'modal_verbs', 'adverbials', 'pronouns_cohesion']) {
    assert.ok(
      GRAMMAR_MONSTER_CONCEPTS.chronalyx.includes(conceptId),
      `Chronalyx cluster must include ${conceptId}`,
    );
  }
});

test('U0 cluster remap: Couronnail absorbs Word classes (3 concepts)', () => {
  assert.equal(GRAMMAR_MONSTER_CONCEPTS.couronnail.length, 3);
  for (const conceptId of ['word_classes', 'standard_english', 'formality']) {
    assert.ok(
      GRAMMAR_MONSTER_CONCEPTS.couronnail.includes(conceptId),
      `Couronnail cluster must include ${conceptId}`,
    );
  }
});

test('U0 cluster remap: 3 direct clusters cover 13 concepts (18 total - 5 punctuation-for-grammar)', () => {
  const total = Object.values(GRAMMAR_MONSTER_CONCEPTS)
    .reduce((sum, conceptIds) => sum + conceptIds.length, 0);
  assert.equal(total, 13);
});

test('U0 cluster remap: monsterIdForGrammarConcept routes concepts to new directs', () => {
  assert.equal(monsterIdForGrammarConcept('word_classes'), 'couronnail');
  assert.equal(monsterIdForGrammarConcept('modal_verbs'), 'chronalyx');
  assert.equal(monsterIdForGrammarConcept('active_passive'), 'bracehart');
  assert.equal(monsterIdForGrammarConcept('noun_phrases'), 'bracehart');
  assert.equal(monsterIdForGrammarConcept('adverbials'), 'chronalyx');
  assert.equal(monsterIdForGrammarConcept('subject_object'), 'bracehart');
});

test('U0 cluster remap: Concordium published total stays at 18', () => {
  const state = {
    concordium: { mastered: GRAMMAR_AGGREGATE_CONCEPTS.map((concept) => grammarMasteryKey(concept)), caught: true },
  };
  const progress = progressForGrammarMonster(state, 'concordium', { conceptTotal: 18 });
  assert.equal(progress.conceptTotal, 18);
  assert.equal(progress.mastered, 18);
  assert.equal(progress.stage, 4);
});

test('U0 cluster remap: punctuation-for-grammar concepts have no direct monster', () => {
  for (const conceptId of ['parenthesis_commas', 'speech_punctuation', 'apostrophes_possession', 'boundary_punctuation', 'hyphen_ambiguity']) {
    assert.equal(
      monsterIdForGrammarConcept(conceptId),
      null,
      `${conceptId} must not route to a direct monster; only Concordium aggregates it`,
    );
  }
});

// -------- Read-time normaliser --------------------------------------------

test('normaliseGrammarRewardState unions retired-id mastered into Concordium view', () => {
  const preFlipKey = grammarMasteryKey('word_classes');
  const state = {
    glossbloom: { caught: true, mastered: [preFlipKey], releaseId: GRAMMAR_REWARD_RELEASE_ID },
    concordium: { mastered: [], caught: false },
  };
  const view = normaliseGrammarRewardState(state);

  assert.ok(view.concordium.mastered.includes(preFlipKey)
    || view.concordium.mastered.some((key) => key.endsWith(':word_classes')));
  assert.equal(view.concordium.caught, true);
  // Retired entry unchanged in returned view.
  assert.deepEqual(view.glossbloom.mastered, [preFlipKey]);
});

test('normaliseGrammarRewardState dedupes by concept id even when retired releaseId differs', () => {
  const oldReleaseKey = 'grammar:legacy-old-release:word_classes';
  const currentKey = grammarMasteryKey('word_classes');
  const state = {
    glossbloom: { caught: true, mastered: [oldReleaseKey], releaseId: 'legacy-old-release' },
    concordium: { mastered: [currentKey], caught: true, releaseId: GRAMMAR_REWARD_RELEASE_ID },
  };
  const view = normaliseGrammarRewardState(state);

  // Deduped to one concept slot via concept id.
  const conceptSlots = new Set(view.concordium.mastered
    .map((key) => {
      const parts = key.split(':');
      return parts[parts.length - 1];
    }));
  assert.equal(conceptSlots.size, view.concordium.mastered.length, 'mastered list is deduped by concept id');
  assert.ok(conceptSlots.has('word_classes'));
});

test('normaliseGrammarRewardState returns source unchanged when no retired-id state exists', () => {
  const state = {
    bracehart: { mastered: [grammarMasteryKey('clauses')], caught: true },
    concordium: { mastered: [grammarMasteryKey('clauses')], caught: true },
  };
  const view = normaliseGrammarRewardState(state);
  assert.equal(view, state, 'no-op path returns the same reference');
});

test('normaliseGrammarRewardState does not mutate the input', () => {
  const preFlipKey = grammarMasteryKey('word_classes');
  const state = {
    glossbloom: { caught: true, mastered: [preFlipKey] },
    concordium: { mastered: [], caught: false },
  };
  const before = JSON.stringify(state);
  normaliseGrammarRewardState(state);
  assert.equal(JSON.stringify(state), before, 'input state must not be mutated');
});

test('normaliseGrammarRewardState preserves retired entries for asset-tool compatibility', () => {
  const preFlipKey = grammarMasteryKey('active_passive');
  const state = {
    mirrane: { caught: true, mastered: [preFlipKey] },
    concordium: { mastered: [], caught: false },
  };
  const view = normaliseGrammarRewardState(state);
  assert.ok(view.mirrane, 'mirrane entry retained');
  assert.deepEqual(view.mirrane.mastered, [preFlipKey]);
});

// -------- Active summary integration --------------------------------------

test('activeGrammarMonsterSummaryFromState surfaces Concordium for pre-flip Glossbloom-only learners via normaliser', () => {
  const preFlipKey = grammarMasteryKey('noun_phrases');
  const state = {
    glossbloom: { caught: true, mastered: [preFlipKey] },
  };

  // Without normalisation the active summary is empty (no active id has
  // progress).
  const rawActive = activeGrammarMonsterSummaryFromState(state);
  assert.equal(rawActive.length, 0, 'raw state does not surface retired-id progress');

  // With normalisation Concordium surfaces with the unioned progress.
  const normalised = normaliseGrammarRewardState(state);
  const active = activeGrammarMonsterSummaryFromState(normalised);
  assert.ok(active.length >= 1);
  assert.ok(
    active.some((entry) => entry.monster.id === 'concordium' && entry.progress.caught),
    'Concordium surfaces via the unioned view for pre-flip glossbloom-only learners',
  );
});

test('grammarMonsterSummaryFromState only iterates active ids (no reserved leaks)', () => {
  const summary = grammarMonsterSummaryFromState({});
  assert.deepEqual(
    summary.map((entry) => entry.monster.id).sort(),
    ['bracehart', 'chronalyx', 'concordium', 'couronnail'],
  );
});

// -------- Writer self-heal integration ------------------------------------

test('writer self-heal: retired-id evidence seeds new direct silently', () => {
  const preFlipKey = grammarMasteryKey('noun_phrases');
  const repository = makeRepository({
    glossbloom: { caught: true, conceptTotal: 2, mastered: [preFlipKey] },
  });

  const events = recordGrammarConceptMastery({
    learnerId: 'learner-self-heal',
    conceptId: 'noun_phrases',
    gameStateRepository: repository,
    random: () => 0,
  });

  // Bracehart `caught` suppressed for pre-flip retired-id holder.
  const bracehartCaught = events.filter((event) => event.monsterId === 'bracehart' && event.kind === 'caught');
  assert.equal(bracehartCaught.length, 0, 'Bracehart caught suppressed by self-heal');

  // Concordium caught fires (first time crossing the threshold).
  assert.ok(events.some((event) => event.monsterId === 'concordium' && event.kind === 'caught'));

  // State delta persists — Bracehart is now caught + mastered.
  const state = repository.state();
  assert.equal(state.bracehart?.caught, true);
  assert.deepEqual(state.bracehart.mastered, [preFlipKey]);
});

test('writer self-heal: fresh learner still earns the direct caught event', () => {
  const repository = makeRepository();

  const events = recordGrammarConceptMastery({
    learnerId: 'learner-fresh',
    conceptId: 'noun_phrases',
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.ok(events.some((event) => event.monsterId === 'bracehart' && event.kind === 'caught'));
  assert.ok(events.some((event) => event.monsterId === 'concordium' && event.kind === 'caught'));
});

// -------- Projection-layer dedupe (cross-monster) --------------------------

test('grammarTerminalConceptToken dedupes cross-monster caught events for the same concept', () => {
  const preFlip = {
    id: 'reward.monster:learner-a:grammar:release-x:word_classes:glossbloom:caught',
    type: 'reward.monster',
    kind: 'caught',
    learnerId: 'learner-a',
    subjectId: 'grammar',
    monsterId: 'glossbloom',
    conceptId: 'word_classes',
    releaseId: 'release-x',
  };
  const postFlip = {
    id: 'reward.monster:learner-a:grammar:release-x:word_classes:couronnail:caught',
    type: 'reward.monster',
    kind: 'caught',
    learnerId: 'learner-a',
    subjectId: 'grammar',
    monsterId: 'couronnail',
    conceptId: 'word_classes',
    releaseId: 'release-x',
  };

  const preToken = grammarTerminalConceptToken(preFlip);
  const postToken = grammarTerminalConceptToken(postFlip);
  assert.equal(preToken, postToken, 'same concept across different monsters produces the same token');

  // combineCommandEvents folds them via the concept-scoped dedupe.
  const combined = combineCommandEvents({ domainEvents: [preFlip, postFlip] });
  assert.equal(combined.events.length, 1, 'cross-monster caught for the same concept collapses');
});

test('grammarTerminalConceptToken returns null for non-Grammar events', () => {
  assert.equal(grammarTerminalConceptToken({
    type: 'reward.monster',
    kind: 'caught',
    learnerId: 'a',
    subjectId: 'punctuation',
    monsterId: 'quoral',
    releaseId: 'r',
    conceptId: 'x',
  }), null);
});

test('grammarTerminalConceptToken excludes Concordium grand events (direct-only dedupe)', () => {
  // The grand aggregate must always be allowed to emit alongside a direct
  // event for the same conceptId inside a single recordGrammarConceptMastery
  // call. If the token included Concordium, the direct would swallow the
  // grand caught and vice versa — breaking the atomic-emission contract.
  const grand = {
    type: 'reward.monster',
    kind: 'caught',
    learnerId: 'learner-a',
    subjectId: 'grammar',
    monsterId: 'concordium',
    conceptId: 'sentence_functions',
    releaseId: 'r',
  };
  assert.equal(grammarTerminalConceptToken(grand), null);

  // Direct + grand for the same concept both survive the combine pipeline.
  const direct = { ...grand, monsterId: 'bracehart' };
  const combined = combineCommandEvents({ domainEvents: [direct, grand] });
  assert.equal(combined.events.length, 2);
  assert.deepEqual(combined.events.map((event) => event.monsterId).sort(), ['bracehart', 'concordium']);
});

test('grammarTerminalConceptToken returns null for non-caught / non-mega kinds', () => {
  assert.equal(grammarTerminalConceptToken({
    type: 'reward.monster',
    kind: 'levelup',
    learnerId: 'a',
    subjectId: 'grammar',
    monsterId: 'bracehart',
    conceptId: 'clauses',
    releaseId: 'r',
  }), null);
});

test('cross-release caught events for the same concept still fire separately', () => {
  const r4 = {
    id: 'reward.monster:learner-a:grammar:r4:word_classes:couronnail:caught',
    type: 'reward.monster',
    kind: 'caught',
    learnerId: 'learner-a',
    subjectId: 'grammar',
    monsterId: 'couronnail',
    conceptId: 'word_classes',
    releaseId: 'r4',
  };
  const r5 = {
    ...r4,
    id: 'reward.monster:learner-a:grammar:r5:word_classes:couronnail:caught',
    releaseId: 'r5',
  };
  const combined = combineCommandEvents({ domainEvents: [r5], existingEvents: [r4] });
  assert.equal(combined.events.length, 1, 'different release ids still emit a new caught');
  assert.equal(combined.events[0].releaseId, 'r5');
});

// -------- Codex landmines (Punctuation P2 §2.U5) --------------------------

test('Codex landmine #1: pickFeaturedCodexEntry filters grammarReserve entries', () => {
  // Build a synthetic entry set with a reserved Grammar entry that has
  // apparent caught progress (simulating pre-flip persisted state).
  const entries = [
    {
      id: 'glossbloom',
      subjectId: 'grammarReserve',
      caught: true,
      level: 4,
      stage: 2,
      mastered: 1,
      progressPct: 50,
    },
    {
      id: 'bracehart',
      subjectId: 'grammar',
      caught: true,
      level: 1,
      stage: 1,
      mastered: 1,
      progressPct: 15,
    },
  ];
  const featured = pickFeaturedCodexEntry(entries);
  assert.ok(featured);
  assert.notEqual(featured.subjectId, 'grammarReserve');
  assert.equal(featured.id, 'bracehart');
});

test('Codex landmine #1 synthesis: withSynthesisedUncaughtMonsters excludes grammarReserve entries', () => {
  // buildCodexEntries -> withSynthesisedUncaughtMonsters is the upstream
  // pipeline. Call buildCodexEntries with an empty summary so the
  // synthesiser populates every uncaught monster, then assert none carry
  // `subjectId === 'grammarReserve'`.
  const entries = buildCodexEntries([]);
  const reservedLeak = entries.filter((entry) => entry.subjectId === 'grammarReserve');
  assert.equal(reservedLeak.length, 0, 'grammarReserve must never enter the Codex pipeline');
  const retiredIds = new Set(['glossbloom', 'loomrill', 'mirrane']);
  for (const entry of entries) {
    assert.equal(retiredIds.has(entry.id), false, `${entry.id} is a retired Grammar monster; must not appear in Codex entries`);
  }
});

test('Codex landmine #2: CODEX_POWER_RANK places Concordium above all Grammar directs and reserved', async () => {
  // buildCodexEntries does not expose CODEX_POWER_RANK directly; read it via
  // the ordering produced by pickFeaturedCodexEntry for a synthetic set that
  // only differs in rank. Each entry simulates `caught=false` so the ranking
  // falls through subject priority to the power-rank branch for uncaught
  // entries of the same subject.
  const grammarIds = ['bracehart', 'chronalyx', 'couronnail', 'glossbloom', 'loomrill', 'mirrane', 'concordium'];
  const entries = grammarIds.map((id) => ({
    id,
    subjectId: id === 'glossbloom' || id === 'loomrill' || id === 'mirrane' ? 'grammarReserve' : 'grammar',
    caught: true,
    level: 1,
    stage: 1,
    mastered: 1,
    progressPct: 10,
  }));

  // Reserved ids are filtered before ranking, leaving only active ids.
  const featured = pickFeaturedCodexEntry(entries);
  assert.equal(featured.id, 'concordium', 'Concordium outranks all active Grammar directs');

  // Drop Concordium to confirm reserved ids still cannot win.
  const withoutConcordium = entries.filter((entry) => entry.id !== 'concordium');
  const fallback = pickFeaturedCodexEntry(withoutConcordium);
  assert.notEqual(fallback.subjectId, 'grammarReserve', 'reserved ids never win the featured slot');
});

test('Codex landmine #3: withSynthesisedUncaughtMonsters uses an explicit allow-list (not Object.keys)', () => {
  // Object.keys(MONSTERS_BY_SUBJECT) includes `grammarReserve` and
  // `punctuationReserve`. The pipeline must not iterate either.
  const allKeys = Object.keys(MONSTERS_BY_SUBJECT);
  assert.ok(allKeys.includes('grammarReserve'));
  assert.ok(allKeys.includes('punctuationReserve'));

  // buildCodexEntries surface covers the allow-list path; a raw call
  // confirms no reserved-id entries appear.
  const entries = buildCodexEntries([]);
  const leakedSubjectIds = new Set(entries.map((entry) => entry.subjectId));
  assert.equal(leakedSubjectIds.has('grammarReserve'), false);
  assert.equal(leakedSubjectIds.has('punctuationReserve'), false);
});

// -------- Concept-to-monster lookup ---------------------------------------

test('GRAMMAR_CONCEPT_TO_MONSTER covers all 13 direct-cluster concepts', () => {
  // 13 = 18 aggregate - 5 punctuation-for-grammar
  assert.equal(Object.keys(GRAMMAR_CONCEPT_TO_MONSTER).length, 13);
  // Spot-check the remapped entries.
  assert.equal(GRAMMAR_CONCEPT_TO_MONSTER.word_classes, 'couronnail');
  assert.equal(GRAMMAR_CONCEPT_TO_MONSTER.noun_phrases, 'bracehart');
  assert.equal(GRAMMAR_CONCEPT_TO_MONSTER.adverbials, 'chronalyx');
});

// -------- spelling.js callsites route through the normaliser (U0 follower) --
// These pin the two `normaliseGrammarRewardState(state)` /
// `normaliseGrammarRewardState(branchState)` calls inside
// `src/platform/game/mastery/spelling.js`. Reverting either call would leave
// Concordium invisible on the home meadow for pre-flip learners whose only
// evidence lives under a retired direct id.

test('monsterSummaryFromState routes Grammar state through the normaliser for retired-id progress', () => {
  const preFlipKey = grammarMasteryKey('noun_phrases');
  const state = {
    glossbloom: { caught: true, mastered: [preFlipKey] },
    // No bracehart / concordium on disk — Concordium visibility must come
    // from the normaliser unioning retired-id evidence into the aggregate.
  };

  const summary = monsterSummaryFromState(state);
  const grammarConcordium = summary.find((entry) => (
    entry.subjectId === 'grammar' && entry.monster?.id === 'concordium'
  ));

  assert.ok(grammarConcordium, 'Concordium must appear in the combined meadow summary');
  assert.equal(grammarConcordium.progress.caught, true);
  assert.ok(grammarConcordium.progress.mastered >= 1,
    'Concordium mastered count must include the retired-id concept via the unioned view');
});

test('monsterSummaryFromSpellingAnalytics routes persisted branch state through the normaliser', () => {
  const preFlipKey = grammarMasteryKey('word_classes');
  const learnerId = 'learner-retired-id-only';

  // Persisted Codex state holds only a retired-id entry with mastered +
  // caught. This simulates a pre-flip learner whose evidence was recorded
  // under Glossbloom before the 7 -> 4 roster flip.
  const repository = makeRepository({
    glossbloom: { caught: true, mastered: [preFlipKey] },
  });

  // Empty analytics (no word rows) forces the fallback branch-state path.
  // That path unions the retired-id state via `normaliseGrammarRewardState`
  // before appending the active Grammar summary — without the normaliser
  // the Concordium aggregate would stay at zero.
  const analytics = { wordGroups: [] };

  const summary = monsterSummaryFromSpellingAnalytics(analytics, {
    learnerId,
    gameStateRepository: repository,
    persistBranches: false,
  });

  const grammarConcordium = summary.find((entry) => (
    entry.subjectId === 'grammar' && entry.monster?.id === 'concordium'
  ));

  assert.ok(grammarConcordium, 'Concordium must appear in the meadow summary from persisted retired-id state');
  assert.equal(grammarConcordium.progress.caught, true);
  assert.ok(grammarConcordium.progress.mastered >= 1,
    'Concordium mastered count must reflect the unioned retired-id evidence');
});
