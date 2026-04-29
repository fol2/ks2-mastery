import {
  PUNCTUATION_CONTENT_MANIFEST,
  PUNCTUATION_MANIFEST_VALIDATION,
  PUNCTUATION_RELEASE_ID,
} from '../../../../shared/punctuation/content.js';
import { PUNCTUATION_EVENT_TYPES } from '../../../../shared/punctuation/events.js';
import { PUNCTUATION_TELEMETRY_EVENTS } from '../../../../shared/punctuation/telemetry-events.js';
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
import { buildPunctuationDiagnostic } from './diagnostic.js';
import { resolveProjectionInput } from '../projection-input.js';

// U9: `record-event` is a new telemetry-only command. It routes through
// the same `repository.runSubjectCommand` path as the 8 existing
// commands (so `requireLearnerWriteAccess` fires) but DOES NOT engage
// the engine / projection pipeline — its handler at
// `./events.js:applyRecordEventCommand` validates the per-kind payload
// allowlist and writes a single row to `punctuation_events`.
const PUNCTUATION_TELEMETRY_COMMAND = 'record-event';

// P7-U8: Punctuation Doctor diagnostic read model. Routes through the
// same `repository.runSubjectCommand` path (so `requireLearnerWriteAccess`
// fires) but does NOT engage the engine/projection pipeline — its handler
// reads state and returns a safe diagnostic payload.
const PUNCTUATION_DIAGNOSTIC_COMMAND = 'punctuation-diagnostic';

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
  PUNCTUATION_DIAGNOSTIC_COMMAND,
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

/**
 * U11: Derives learning-health telemetry events from the post-command state.
 *
 * Emitted telemetry events:
 * - SCHEDULER_REASON_SELECTED: after item selection, with reason/familyId/skillId
 * - GENERATED_SIGNATURE_REPEATED: when selected signature was already exposed
 * - MISCONCEPTION_RETRY_PASSED: correct answer on a misconception-retry item
 * - STAR_EVIDENCE_DEDUPED_BY_SIGNATURE: when star evidence dedup occurs
 *
 * Payloads NEVER include raw answers, validators, rubrics, or child-sensitive data.
 */
function deriveTelemetryEvents({ state, command, previousState, starEvidenceEvents }) {
  const events = [];
  const session = state?.session;
  if (!session) return events;

  const selectionReason = session.selectionReason;
  const currentItem = session.currentItem;
  const itemSignature = currentItem?.variantSignature || '';
  const familyId = currentItem?.generatorFamilyId || currentItem?.familyId || '';
  const skillId = (Array.isArray(currentItem?.skillIds) ? currentItem.skillIds[0] : '') || '';
  const clusterId = currentItem?.clusterId || '';
  const rewardUnitId = currentItem?.rewardUnitId || '';
  const mode = currentItem?.mode || '';
  const submitFeedback = command.command === 'submit-answer' && state.phase === 'feedback'
    ? state.feedback
    : null;

  // After item selection: emit SCHEDULER_REASON_SELECTED
  if (
    selectionReason &&
    session.phase === 'active-item' &&
    (command.command === 'start-session' || command.command === 'continue-session')
  ) {
    events.push({
      type: PUNCTUATION_TELEMETRY_EVENTS.SCHEDULER_REASON_SELECTED,
      reason: selectionReason,
      familyId,
      skillId,
      clusterId,
      rewardUnitId,
      mode,
    });

    // Check if the selected signature was already exposed in this session
    const selectedSignatures = Array.isArray(session.selectedSignatures) ? session.selectedSignatures : [];
    if (itemSignature && selectedSignatures.filter((s) => s === itemSignature).length > 1) {
      events.push({
        type: PUNCTUATION_TELEMETRY_EVENTS.GENERATED_SIGNATURE_REPEATED,
        variantSignature: itemSignature,
        skillId,
        clusterId,
        mode,
      });
    }

    // Emit reason-specific scheduled events
    if (selectionReason === 'misconception-retry') {
      events.push({
        type: PUNCTUATION_TELEMETRY_EVENTS.MISCONCEPTION_RETRY_SCHEDULED,
        skillId,
        clusterId,
        familyId,
      });
    } else if (selectionReason === 'spaced-return') {
      events.push({
        type: PUNCTUATION_TELEMETRY_EVENTS.SPACED_RETURN_SCHEDULED,
        skillId,
        clusterId,
        familyId,
      });
    } else if (selectionReason === 'retention-after-secure') {
      events.push({
        type: PUNCTUATION_TELEMETRY_EVENTS.RETENTION_AFTER_SECURE_SCHEDULED,
        skillId,
        clusterId,
        familyId,
      });
    }
  }

  // After correct answer on misconception-retry: emit MISCONCEPTION_RETRY_PASSED
  if (submitFeedback) {
    const prevSession = previousState?.session;
    const prevReason = prevSession?.selectionReason;
    if (submitFeedback?.kind === 'success' && prevReason === 'misconception-retry') {
      events.push({
        type: PUNCTUATION_TELEMETRY_EVENTS.MISCONCEPTION_RETRY_PASSED,
        skillId: prevSession?.currentItem?.skillIds?.[0] || '',
        clusterId: prevSession?.currentItem?.clusterId || '',
        variantSignature: prevSession?.currentItem?.variantSignature || '',
      });
    }
    if (submitFeedback?.kind === 'success' && prevReason === 'spaced-return') {
      events.push({
        type: PUNCTUATION_TELEMETRY_EVENTS.SPACED_RETURN_PASSED,
        skillId: prevSession?.currentItem?.skillIds?.[0] || '',
        clusterId: prevSession?.currentItem?.clusterId || '',
      });
    }
    if (submitFeedback?.kind === 'success' && prevReason === 'retention-after-secure') {
      events.push({
        type: PUNCTUATION_TELEMETRY_EVENTS.RETENTION_AFTER_SECURE_PASSED,
        skillId: prevSession?.currentItem?.skillIds?.[0] || '',
        clusterId: prevSession?.currentItem?.clusterId || '',
      });
    }
  }

  // Star evidence dedup: after a correct submit-answer, if the same
  // variantSignature was already used for a correct attempt earlier in
  // this session, the star projection will dedup it. Emit a telemetry
  // event so dashboards can track dedup frequency.
  if (submitFeedback?.kind === 'success' && itemSignature) {
    const signatures = Array.isArray(session.selectedSignatures) ? session.selectedSignatures : [];
    const priorCorrectSameSignature = signatures.filter((s) => s === itemSignature).length > 1;
    if (priorCorrectSameSignature) {
      events.push({
        type: PUNCTUATION_TELEMETRY_EVENTS.STAR_EVIDENCE_DEDUPED_BY_SIGNATURE,
        variantSignature: itemSignature,
        skillId,
        clusterId,
      });
    }
  }

  return events;
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

    // P7-U8: Punctuation Doctor diagnostic read model. Reads state but
    // does NOT mutate it — branches early like `record-event` to bypass
    // the engine/projection pipeline. Gated behind admin auth: the
    // caller must have `platformRole: 'admin'` in the session context.
    if (command.command === PUNCTUATION_DIAGNOSTIC_COMMAND) {
      if (context.session?.platformRole !== 'admin') {
        throw new NotFoundError('Punctuation diagnostic requires admin access.', {
          code: 'subject_command_not_found',
          subjectId: 'punctuation',
          command: command.command,
        });
      }
      const runtimeRecord = await context.repository.readSubjectRuntime(
        context.session.accountId,
        command.learnerId,
        'punctuation',
        { skipAccessCheck: true },
      );
      // readSubjectRuntimeBundle returns { subjectRecord, latestSession } —
      // it does NOT include gameState. Load the learner's projection state
      // separately to get the monster-codex entries (starHighWater, maxStageEver).
      const projectionBundle = await context.repository.readLearnerProjectionState(
        context.session.accountId,
        command.learnerId,
      );
      const codexEntries = projectionBundle?.gameState?.['monster-codex'] || {};
      const rawStats = command.payload?.telemetryStats;
      const telemetryStats = rawStats && typeof rawStats === 'object' && !Array.isArray(rawStats)
        ? rawStats
        : {};
      const diagnostic = buildPunctuationDiagnostic(
        runtimeRecord.subjectRecord,
        codexEntries,
        telemetryStats,
      );
      return {
        learnerId: command.learnerId,
        ok: true,
        changed: false,
        diagnostic,
      };
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
    // U11: capture pre-command state for telemetry derivation (scheduler reason tracking).
    const previousState = runtimeRecord.subjectRecord?.ui || null;
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
    // U11: derive learning-health telemetry events from scheduler decisions.
    const telemetryEvents = result.changed === false
      ? []
      : deriveTelemetryEvents({
          state: result.state,
          command,
          previousState,
          starEvidenceEvents,
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
      telemetryEvents,
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
