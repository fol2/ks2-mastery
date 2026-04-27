import {
  PUNCTUATION_CONTENT_MANIFEST,
  PUNCTUATION_MANIFEST_VALIDATION,
  PUNCTUATION_RELEASE_ID,
} from '../../../../shared/punctuation/content.js';
import { PUNCTUATION_EVENT_TYPES } from '../../../../shared/punctuation/events.js';
import { NotFoundError } from '../../errors.js';
import { combineCommandEvents } from '../../projections/events.js';
import { buildCommandProjectionReadModel } from '../../projections/read-models.js';
import { projectPunctuationRewards } from '../../projections/rewards.js';
import { projectPunctuationStars } from '../../../../src/subjects/punctuation/star-projection.js';
import {
  ACTIVE_PUNCTUATION_MONSTER_IDS,
  PUNCTUATION_GRAND_MONSTER_ID,
} from '../../../../src/subjects/punctuation/punctuation-manifest.js';
import { requestPunctuationContextPack } from './ai-enrichment.js';
import { createServerPunctuationEngine } from './engine.js';
import { buildPunctuationReadModel } from './read-models.js';
import { applyRecordEventCommand } from './events.js';
import { resolveProjectionInput } from '../projection-input.js';

// U9: `record-event` is a new telemetry-only command. It routes through
// the same `repository.runSubjectCommand` path as the 8 existing
// commands (so `requireLearnerWriteAccess` fires) but DOES NOT engage
// the engine / projection pipeline — its handler at
// `./events.js:applyRecordEventCommand` validates the per-kind payload
// allowlist and writes a single row to `punctuation_events`.
const PUNCTUATION_TELEMETRY_COMMAND = 'record-event';

const PUNCTUATION_COMMANDS = Object.freeze([
  'start-session',
  'submit-answer',
  'continue-session',
  'skip-item',
  'end-session',
  'save-prefs',
  'reset-learner',
  'request-context-pack',
  PUNCTUATION_TELEMETRY_COMMAND,
]);

function contentMeta() {
  return {
    releaseId: PUNCTUATION_CONTENT_MANIFEST.releaseId,
    releaseName: PUNCTUATION_CONTENT_MANIFEST.releaseName,
    fullSkillCount: PUNCTUATION_CONTENT_MANIFEST.fullSkillCount,
    publishedSkillCount: PUNCTUATION_CONTENT_MANIFEST.skills.filter((skill) => skill.published).length,
    publishedRewardUnitCount: PUNCTUATION_CONTENT_MANIFEST.rewardUnits.filter((unit) => unit.published).length,
    publishedScopeCopy: PUNCTUATION_CONTENT_MANIFEST.publishedScopeCopy,
    skills: PUNCTUATION_CONTENT_MANIFEST.skills
      .filter((skill) => skill.published)
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        clusterId: skill.clusterId,
      })),
  };
}

/**
 * Derives star-evidence-updated events for monsters affected by a command.
 *
 * Computes Stars from the post-command engine data via `projectPunctuationStars`.
 * For each monster whose computed Stars exceed the current `starHighWater` from
 * the persisted codex, emits a `punctuation.star-evidence-updated` event that
 * the reward subscriber will handle to persist the latch.
 *
 * The engine remains Star-unaware; this derivation happens at the command
 * handler layer, preserving the P5 architecture boundary.
 */
function deriveStarEvidenceEvents({ engineData, learnerId, gameState }) {
  const progress = engineData?.progress;
  if (!progress) return [];

  const starLedger = projectPunctuationStars(progress, PUNCTUATION_RELEASE_ID);
  if (!starLedger?.perMonster) return [];

  const codexState = gameState || {};
  const starEvents = [];

  // Check each direct monster.
  for (const monsterId of ACTIVE_PUNCTUATION_MONSTER_IDS) {
    // For direct monsters read from perMonster; for grand (quoral) read from grand.
    let liveStars;
    if (monsterId === PUNCTUATION_GRAND_MONSTER_ID) {
      liveStars = starLedger.grand?.grandStars ?? 0;
    } else {
      liveStars = starLedger.perMonster[monsterId]?.total ?? 0;
    }

    // IEEE 754 epsilon guard: floor with epsilon before comparison.
    const computedStars = Math.floor(liveStars + 1e-9);
    if (computedStars < 1) continue;

    // Read current starHighWater from monster codex state.
    const monsterEntry = codexState[monsterId];
    const existingHW = monsterEntry && typeof monsterEntry === 'object'
      ? Math.max(0, Math.floor((Number(monsterEntry.starHighWater) || 0) + 1e-9))
      : 0;

    if (computedStars > existingHW) {
      starEvents.push({
        id: `punctuation.star-evidence.${learnerId || 'learner'}.${monsterId}.${Date.now()}`,
        type: PUNCTUATION_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
        subjectId: 'punctuation',
        learnerId,
        monsterId,
        computedStars,
        previousStarHighWater: existingHW,
        createdAt: Date.now(),
      });
    }
  }

  return starEvents;
}

export function createPunctuationCommandHandlers({ now, random } = {}) {
  async function handlePunctuationCommand(command, context) {
    if (!PUNCTUATION_COMMANDS.includes(command.command)) {
      throw new NotFoundError('Punctuation command is not available.', {
        code: 'subject_command_not_found',
        subjectId: 'punctuation',
        command: command.command,
      });
    }

    // U9: `record-event` is a telemetry-only command. It does not
    // interact with the engine, the projection pipeline, the reward
    // state, or any read-model. Branch BEFORE the manifest-validation
    // gate below so telemetry stays writeable even if published content
    // transiently fails validation (e.g. during a content hotfix).
    if (command.command === PUNCTUATION_TELEMETRY_COMMAND) {
      return applyRecordEventCommand({ command, context });
    }

    if (!PUNCTUATION_MANIFEST_VALIDATION.ok) {
      throw new NotFoundError('No published punctuation content is available.', {
        code: 'punctuation_content_unavailable',
        subjectId: 'punctuation',
      });
    }

    const nowValue = Number.isFinite(Number(context.now)) ? Number(context.now) : Date.now();
    const runtimeRecord = await context.repository.readSubjectRuntime(
      context.session.accountId,
      command.learnerId,
      'punctuation',
      // U6 queryCount budget: runSubjectCommandMutation already ran
      // requireLearnerWriteAccess; skip the duplicate membership read.
      { skipAccessCheck: true },
    );
    const engine = createServerPunctuationEngine({
      now: typeof now === 'function' ? now : () => nowValue,
      random,
    });
    const result = engine.apply({
      learnerId: command.learnerId,
      subjectRecord: runtimeRecord.subjectRecord,
      latestSession: runtimeRecord.latestSession,
      command: command.command,
      payload: command.payload,
    });
    const contextPack = command.command === 'request-context-pack'
      ? await requestPunctuationContextPack({
          env: context.env,
          payload: command.payload,
          manifest: PUNCTUATION_CONTENT_MANIFEST,
        })
      : null;
    // U6: preserve the existing no-op short-circuit — do NOT load the
    // projection when the engine reported `changed === false`. For mutating
    // commands, load via the hot-path reader so dedupe reads the token ring
    // rather than re-scanning event_log.
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
    // P7-U4: derive star-evidence-updated events from the post-command
    // engine data. These are injected into the domain event stream before
    // the reward projection so the subscriber can persist starHighWater at
    // evidence time rather than deferring to unit-secured.
    const starEvidenceEvents = result.changed === false
      ? []
      : deriveStarEvidenceEvents({
          engineData: result.data,
          learnerId: command.learnerId,
          gameState: projectionState.gameState?.['monster-codex'] || null,
        });
    const allDomainEvents = starEvidenceEvents.length
      ? [...result.events, ...starEvidenceEvents]
      : result.events;
    const projectedRewards = result.changed === false
      ? { gameState: projectionState.gameState, changedGameState: null, rewardEvents: [] }
      : projectPunctuationRewards({
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

    const response = {
      learnerId: command.learnerId,
      ok: contextPack ? contextPack.status === 'ready' : true,
      changed: result.changed,
      contextPack,
      subjectReadModel: buildPunctuationReadModel({
        learnerId: command.learnerId,
        state: result.state,
        prefs: result.prefs,
        stats: result.stats,
        analytics: result.analytics,
        content: contentMeta(),
        data: result.data,
        contextPack,
      }),
      projections,
      events: projectedEvents.events,
      domainEvents: projectedEvents.domainEvents,
      reactionEvents: projectedEvents.reactionEvents,
      toastEvents: projectedEvents.toastEvents,
    };
    if (result.changed !== false) {
      response.runtimeWrite = {
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
      };
      // U6: thread the projection input to the persistence plan (see
      // spelling/commands.js for the rationale).
      response.projectionContext = projectionInput;
    }
    return response;
  }

  return Object.fromEntries(PUNCTUATION_COMMANDS.map((name) => [name, handlePunctuationCommand]));
}
