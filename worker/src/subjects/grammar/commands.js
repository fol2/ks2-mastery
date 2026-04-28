import { NotFoundError } from '../../errors.js';
import { combineCommandEvents } from '../../projections/events.js';
import { buildCommandProjectionReadModel } from '../../projections/read-models.js';
import { projectGrammarRewards } from '../../projections/rewards.js';
import { createServerGrammarEngine } from './engine.js';
import { buildGrammarReadModel } from './read-models.js';
import { GRAMMAR_CONTENT_RELEASE_ID } from './content.js';
import { resolveProjectionInput } from '../projection-input.js';
import {
  deriveGrammarConceptStarEvidence,
  computeGrammarMonsterStars,
  GRAMMAR_GRAND_STAR_MODEL_VERSION,
} from '../../../../shared/grammar/grammar-stars.js';
import { GRAMMAR_EVENT_TYPES } from '../../../../src/subjects/grammar/event-hooks.js';
import {
  GRAMMAR_AGGREGATE_CONCEPTS,
  GRAMMAR_MONSTER_CONCEPTS,
  monsterIdForGrammarConcept,
} from '../../../../src/platform/game/mastery/grammar.js';
import { GRAMMAR_GRAND_MONSTER_ID } from '../../../../src/platform/game/mastery/shared.js';

const GRAMMAR_COMMANDS = Object.freeze([
  'start-session',
  'submit-answer',
  'save-mini-test-response',
  'move-mini-test',
  'finish-mini-test',
  'continue-session',
  'end-session',
  'save-prefs',
  'retry-current-question',
  'use-faded-support',
  'show-worked-solution',
  'start-similar-problem',
  'request-ai-enrichment',
  'save-transfer-evidence',
  'reset-learner',
]);

/**
 * Derives star-evidence-updated events for concepts affected by an answer.
 *
 * For each concept touched by answer-submitted events, computes Stars from
 * the post-answer engine state. For each monster whose computed Stars exceed
 * the current starHighWater from the game state, emits a star-evidence-updated
 * event that the reward subscriber will handle to persist the latch.
 *
 * The engine remains Star-unaware; this derivation happens at the command
 * handler layer, preserving the P5 architecture boundary.
 */
function deriveStarEvidenceEvents({ domainEvents, engineState, learnerId, gameState, requestId }) {
  // Collect concept IDs from answer-submitted events.
  const answerEvents = domainEvents.filter(
    (e) => e && e.type === 'grammar.answer-submitted',
  );
  if (!answerEvents.length) return [];

  const affectedConceptIds = new Set();
  for (const event of answerEvents) {
    const ids = Array.isArray(event.conceptIds) ? event.conceptIds : [];
    for (const id of ids) {
      if (GRAMMAR_AGGREGATE_CONCEPTS.includes(id)) affectedConceptIds.add(id);
    }
  }
  if (!affectedConceptIds.size) return [];

  // For each affected concept, derive evidence tiers from the post-answer
  // engine state.
  const concepts = engineState?.mastery?.concepts || {};
  const recentAttempts = Array.isArray(engineState?.recentAttempts)
    ? engineState.recentAttempts
    : [];

  // Determine which monsters are affected by the answered concepts.
  const monsterConceptMap = new Map(); // monsterId → Set<conceptId>
  for (const conceptId of affectedConceptIds) {
    // Always add to Concordium.
    if (!monsterConceptMap.has(GRAMMAR_GRAND_MONSTER_ID)) {
      monsterConceptMap.set(GRAMMAR_GRAND_MONSTER_ID, new Set());
    }
    monsterConceptMap.get(GRAMMAR_GRAND_MONSTER_ID).add(conceptId);

    // Add to direct monster.
    const directId = monsterIdForGrammarConcept(conceptId);
    if (directId) {
      if (!monsterConceptMap.has(directId)) monsterConceptMap.set(directId, new Set());
      monsterConceptMap.get(directId).add(conceptId);
    }
  }

  const starEvents = [];
  const codexState = gameState || {};

  for (const [monsterId, _affectedConcepts] of monsterConceptMap) {
    // Compute evidence for ALL concepts of this monster (not just the affected
    // ones) because computeGrammarMonsterStars aggregates across all concepts.
    const monsterConceptIds = monsterId === GRAMMAR_GRAND_MONSTER_ID
      ? GRAMMAR_AGGREGATE_CONCEPTS
      : (GRAMMAR_MONSTER_CONCEPTS[monsterId] || []);

    const evidenceMap = {};
    for (const conceptId of monsterConceptIds) {
      evidenceMap[conceptId] = deriveGrammarConceptStarEvidence({
        conceptId,
        conceptNode: concepts[conceptId] || null,
        recentAttempts,
      });
    }

    const starResult = computeGrammarMonsterStars(monsterId, evidenceMap);
    if (starResult.stars < 1) continue;

    // Read current starHighWater from monster codex state.
    const monsterEntry = codexState[monsterId];
    const hasCurrentGrandStarModel =
      monsterId !== GRAMMAR_GRAND_MONSTER_ID
      || Number(monsterEntry?.starModelVersion) === GRAMMAR_GRAND_STAR_MODEL_VERSION;
    const existingHW = monsterEntry && typeof monsterEntry === 'object' && hasCurrentGrandStarModel
      ? Math.max(0, Math.floor(Number(monsterEntry.starHighWater) || 0))
      : 0;

    if (starResult.stars > existingHW) {
      // Emit for the first affected concept that maps to this monster.
      // The subscriber looks up the direct monster from the conceptId.
      const representativeConcept = [..._affectedConcepts][0];
      starEvents.push({
        id: `grammar.star-evidence.${learnerId || 'learner'}.${monsterId}.${requestId || 'no-req'}.${starResult.stars}`,
        type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
        subjectId: 'grammar',
        learnerId,
        contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
        conceptId: representativeConcept,
        monsterId,
        computedStars: starResult.stars,
        previousStarHighWater: existingHW,
        createdAt: Date.now(),
      });
    }
  }

  return starEvents;
}

export function createGrammarCommandHandlers({ now, random } = {}) {
  async function handleGrammarCommand(command, context) {
    if (!GRAMMAR_COMMANDS.includes(command.command)) {
      throw new NotFoundError('Grammar command is not available.', {
        code: 'subject_command_not_found',
        subjectId: 'grammar',
        command: command.command,
      });
    }

    const nowValue = Number.isFinite(Number(context.now)) ? Number(context.now) : Date.now();
    const runtimeRecord = await context.repository.readSubjectRuntime(
      context.session.accountId,
      command.learnerId,
      'grammar',
      // U6 queryCount budget: runSubjectCommandMutation already ran
      // requireLearnerWriteAccess; skip the duplicate membership read.
      { skipAccessCheck: true },
    );
    const engine = createServerGrammarEngine({
      now: typeof now === 'function' ? now : () => nowValue,
    });
    const result = engine.apply({
      learnerId: command.learnerId,
      subjectRecord: runtimeRecord.subjectRecord,
      latestSession: runtimeRecord.latestSession,
      command: command.command,
      payload: command.payload,
      requestId: command.requestId,
    });
    // U6: extend the Punctuation no-op short-circuit pattern — skip the
    // projection load entirely when the engine did not mutate learner
    // state. Otherwise consume the persisted projection hot-path input.
    const projectionInput = result.changed === false
      ? null
      : await resolveProjectionInput(context, {
          learnerId: command.learnerId,
          currentRevision: Number(command.expectedLearnerRevision) || 0,
          capacity: context.capacity || null,
        });
    const projectionState = projectionInput
      ? projectionInput.projectionState
      : { gameState: null, events: [] };
    // U4 (Phase 6): derive star-evidence-updated events from the post-answer
    // engine state. These are injected into the domain event stream before
    // the reward projection so the subscriber can persist starHighWater at
    // evidence time rather than deferring to concept-secured.
    const starEvidenceEvents = result.changed === false
      ? []
      : deriveStarEvidenceEvents({
          domainEvents: result.events,
          engineState: result.state,
          learnerId: command.learnerId,
          gameState: projectionState.gameState?.['monster-codex'] || null,
          requestId: command.requestId,
        });
    const allDomainEvents = starEvidenceEvents.length
      ? [...result.events, ...starEvidenceEvents]
      : result.events;
    const projectedRewards = result.changed === false
      ? { gameState: projectionState.gameState, changedGameState: null, rewardEvents: [] }
      : projectGrammarRewards({
          learnerId: command.learnerId,
          domainEvents: allDomainEvents,
          gameState: projectionState.gameState,
          random,
        });
    const projectedEvents = result.changed === false
      ? { events: [], domainEvents: [], reactionEvents: [], toastEvents: [] }
      : combineCommandEvents({
          domainEvents: allDomainEvents,
          reactionEvents: projectedRewards.rewardEvents,
          existingEvents: projectionState.events,
          seedTokens: projectionInput?.tokens || [],
        });
    const projections = buildCommandProjectionReadModel({
      gameState: projectedRewards.gameState,
      domainEvents: projectedEvents.domainEvents,
      reactionEvents: projectedEvents.reactionEvents,
      toastEvents: projectedEvents.toastEvents,
    });

    return {
      learnerId: command.learnerId,
      changed: result.changed,
      subjectReadModel: buildGrammarReadModel({
        learnerId: command.learnerId,
        state: result.state,
        projections,
        now: nowValue,
        aiEnrichment: result.aiEnrichment,
      }),
      projections,
      events: projectedEvents.events,
      domainEvents: projectedEvents.domainEvents,
      reactionEvents: projectedEvents.reactionEvents,
      toastEvents: projectedEvents.toastEvents,
      runtimeWrite: result.changed === false
        ? null
        : {
          state: result.state,
          data: result.data,
          practiceSession: result.practiceSession,
          gameState: projectedRewards.changedGameState,
          events: projectedEvents.events,
          // U6 queryCount budget: when the engine re-uses the same
          // practice session id, tell the persistence plan so the
          // no-op abandon UPDATE can be elided.
          previousActiveSessionId: runtimeRecord.latestSession?.status === 'active'
            ? runtimeRecord.latestSession.id
            : null,
        },
      // U6: thread the projection input to the persistence plan (see
      // spelling/commands.js for the rationale).
      projectionContext: result.changed === false ? null : projectionInput,
    };
  }

  return Object.fromEntries(GRAMMAR_COMMANDS.map((name) => [name, handleGrammarCommand]));
}
