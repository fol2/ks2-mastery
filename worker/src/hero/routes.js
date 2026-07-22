// Hero Mode P0 — Route handler for GET /api/hero/read-model.
//
// Shadow-only, read-only, zero-write endpoint. Returns the full Hero
// shadow read model for the authenticated learner. Feature-gated behind
// HERO_MODE_SHADOW_ENABLED.

import { json } from '../http.js';
import { NotFoundError } from '../errors.js';
import { buildHeroShadowReadModel } from './read-model.js';
import { resolveHeroFlagsForAccount } from '../../../shared/hero/account-override.js';
import { heroCampMonsterIdsFromRewardTracks } from './exposure.js';

const HERO_READ_MODEL_IN_FLIGHT_LIMIT = 64;
const heroReadModelInFlight = new Map();

// Temporary production trace for the Nelson 503 investigation. Keep every
// field on a closed, non-identifying allowlist so an exceeded-CPU invocation
// leaves a useful last checkpoint without logging learner or account data.
function logN503HeroCheckpoint(capacity, phase, counts = {}) {
  try {
    // eslint-disable-next-line no-console
    console.log('[DEBUG-N503]', JSON.stringify({
      event: 'n503.hero-read-model.phase',
      requestId: capacity?.requestId || null,
      phase,
      subjectCount: Number.isFinite(counts.subjectCount) ? counts.subjectCount : null,
      recentSessionCount: Number.isFinite(counts.recentSessionCount) ? counts.recentSessionCount : null,
      taskCount: Number.isFinite(counts.taskCount) ? counts.taskCount : null,
    }));
  } catch { /* best-effort diagnostic only */ }
}

function heroReadModelInFlightKey({ accountId, learnerId }) {
  return [
    'hero-read-model-v1',
    accountId || '',
    learnerId || '',
  ].join('\u0000');
}

async function readHeroReadModelInFlight({ accountId, learnerId }, loadPayload) {
  const key = heroReadModelInFlightKey({ accountId, learnerId });
  const existing = heroReadModelInFlight.get(key);
  if (existing) {
    return existing;
  }

  if (heroReadModelInFlight.size >= HERO_READ_MODEL_IN_FLIGHT_LIMIT) {
    return loadPayload();
  }

  const pending = Promise.resolve().then(loadPayload);
  heroReadModelInFlight.set(key, pending);
  try {
    return await pending;
  } finally {
    if (heroReadModelInFlight.get(key) === pending) {
      heroReadModelInFlight.delete(key);
    }
  }
}

function envFlagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function campMonsterIdsFromSubjectExposure(subjectReadModels, { now, env } = {}) {
  const rewardTracks = subjectReadModels?.spelling?.content?.rewardTracks;
  return heroCampMonsterIdsFromRewardTracks(rewardTracks, { now, env });
}

/**
 * GET /api/hero/read-model
 *
 * @param {Object} params
 * @param {Request} params.request
 * @param {URL}     params.url
 * @param {Object}  params.session — authenticated session
 * @param {Object}  params.account — ensured adult account row
 * @param {Object}  params.repository — createWorkerRepository instance
 * @param {Object}  params.env — Worker environment bindings
 * @param {Function} params.now — epoch-ms factory
 * @param {Object}  [params.capacity] — CapacityCollector (optional)
 * @returns {Response}
 */
export async function handleHeroReadModel({
  request,
  url,
  session,
  account,
  repository,
  env,
  now,
  capacity,
}) {
  logN503HeroCheckpoint(capacity, 'route-enter');

  // 1. Apply per-account override before feature flag gate (pA2 #683 fix).
  //    Without this, internal cohort accounts with global flags OFF cannot
  //    access the read-model — the override only applied on command routes.
  //    pA5 U4: use full resolver to capture overrideStatus for emergency/excluded guard.
  const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: session.accountId });

  // pA5 U4: Emergency-off or excluded — return empty/hidden Hero state.
  // State remains dormant (no mutation, no deletion). Event logged for ops.
  if (overrideStatus === 'emergency-off' || overrideStatus === 'excluded') {
    try {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({
        event: 'hero_read_model_blocked',
        learnerId: url.searchParams.get('learnerId') || account.selected_learner_id || '',
        accountId: session.accountId,
        overrideStatus,
      }));
    } catch { /* best-effort */ }

    // Return a valid response shape with Hero effectively hidden.
    // No overrideStatus, no account lists, no rollout salt in the response.
    return json({
      ok: true,
      hero: {
        version: 6,
        heroEnabled: false,
        ui: { enabled: false },
        dailyQuest: null,
        activeHeroSession: null,
        economy: null,
        camp: null,
      },
    });
  }

  if (!envFlagEnabled(resolvedEnv.HERO_MODE_SHADOW_ENABLED)) {
    throw new NotFoundError('Hero shadow read model is not available.', {
      code: 'hero_shadow_disabled',
    });
  }

  // 2. Resolve learner ID
  const learnerId = url.searchParams.get('learnerId')
    || account.selected_learner_id
    || '';

  // 3. Validate learner access — reuses the repository's authz gate so a
  //    caller without membership receives a 403 before any data read.
  await repository.requireLearnerReadAccess(session.accountId, learnerId);
  logN503HeroCheckpoint(capacity, 'access-checked');

  const payload = await readHeroReadModelInFlight({
    accountId: session.accountId,
    learnerId,
  }, async () => {
    const nowTs = typeof now === 'function' ? now() : Date.now();

    // 4. Load per-subject read models for the learner.
    //    This uses the same public read-model projection as bootstrap so Hero
    //    sees provider-readable subject signals rather than raw storage slots.
    logN503HeroCheckpoint(capacity, 'subject-read-start');
    const subjectReadModels = await repository.readHeroSubjectReadModels(learnerId, {
      accountId: session.accountId,
      now: nowTs,
    });
    logN503HeroCheckpoint(capacity, 'subject-read-done', {
      subjectCount: Object.keys(subjectReadModels || {}).length,
    });

    // 4b. P3 U7: load progress bundle for the v4 read model when progress enabled.
    const progressFlagEnabled = envFlagEnabled(resolvedEnv.HERO_MODE_PROGRESS_ENABLED);
    const economyFlagEnabled = envFlagEnabled(resolvedEnv.HERO_MODE_ECONOMY_ENABLED);
    const campFlagEnabled = envFlagEnabled(resolvedEnv.HERO_MODE_CAMP_ENABLED);
    const campMonsterIds = campMonsterIdsFromSubjectExposure(subjectReadModels, {
      now: nowTs,
      env: resolvedEnv,
    });
    const heroProgressData = progressFlagEnabled
      ? await repository.readHeroProgressData(learnerId)
      : { heroProgressState: null, recentCompletedSessions: [] };
    logN503HeroCheckpoint(capacity, 'progress-read-done', {
      recentSessionCount: heroProgressData.recentCompletedSessions?.length || 0,
    });

    // 5. Assemble the shadow read model (v3, v4, v5, or v6: pass accountId and env for
    //    quest fingerprint and the HERO_MODE_CHILD_UI_ENABLED gate).
    const result = buildHeroShadowReadModel({
      learnerId,
      accountId: session.accountId || '',
      subjectReadModels,
      now: nowTs,
      env: resolvedEnv,
      heroProgressState: heroProgressData.heroProgressState,
      recentCompletedSessions: heroProgressData.recentCompletedSessions,
      progressEnabled: progressFlagEnabled,
      economyEnabled: progressFlagEnabled && economyFlagEnabled,
      campEnabled: progressFlagEnabled && economyFlagEnabled && campFlagEnabled,
      campMonsterIds,
    });
    logN503HeroCheckpoint(capacity, 'assemble-done', {
      taskCount: result.dailyQuest?.tasks?.length || 0,
    });

    // U10: structured observability — fire-and-forget, never blocks the response.
    try {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({
        event: 'hero_read_model_loaded',
        learnerId,
        version: result.version,
        uiEnabled: result.ui?.enabled || false,
        taskCount: result.dailyQuest?.tasks?.length || 0,
        activeSession: Boolean(result.activeHeroSession),
      }));
    } catch { /* best-effort */ }

    // Strip debug block from the child-visible response — debug data is
    // only available via operator scripts / event_log, never over HTTP.
    const { debug, ...safeResult } = result;

    return { ok: true, hero: safeResult };
  });

  return json(payload);
}

export function __clearHeroReadModelInFlightForTests() {
  heroReadModelInFlight.clear();
}

export function __heroReadModelInFlightSizeForTests() {
  return heroReadModelInFlight.size;
}

export const __readHeroReadModelInFlightForTests = readHeroReadModelInFlight;
