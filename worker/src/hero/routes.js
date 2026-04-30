// Hero Mode P0 — Route handler for GET /api/hero/read-model.
//
// Shadow-only, read-only, zero-write endpoint. Returns the full Hero
// shadow read model for the authenticated learner. Feature-gated behind
// HERO_MODE_SHADOW_ENABLED.

import { json } from '../http.js';
import { NotFoundError } from '../errors.js';
import { buildHeroShadowReadModel } from './read-model.js';
import { resolveHeroFlagsForAccount } from '../../../shared/hero/account-override.js';

function envFlagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
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

  // 4. Load per-subject read models for the learner.
  //    This is the P0 minimal path: we read raw child_subject_state and
  //    pass each subject's data object directly to the provider. The
  //    providers are designed to handle null/empty gracefully.
  const subjectReadModels = await repository.readHeroSubjectReadModels(learnerId);

  // 4b. P3 U7: load progress bundle for the v4 read model when progress enabled.
  const progressFlagEnabled = envFlagEnabled(resolvedEnv.HERO_MODE_PROGRESS_ENABLED);
  const economyFlagEnabled = envFlagEnabled(resolvedEnv.HERO_MODE_ECONOMY_ENABLED);
  const campFlagEnabled = envFlagEnabled(resolvedEnv.HERO_MODE_CAMP_ENABLED);
  const heroProgressData = progressFlagEnabled
    ? await repository.readHeroProgressData(learnerId)
    : { heroProgressState: null, recentCompletedSessions: [] };

  // 5. Assemble the shadow read model (v3, v4, v5, or v6: pass accountId and env for
  //    quest fingerprint and the HERO_MODE_CHILD_UI_ENABLED gate).
  const nowTs = typeof now === 'function' ? now() : Date.now();
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
  // useful for shadow/internal diagnostics but must not leak to the child browser.
  const { debug, ...safeResult } = result;
  const responseHero = envFlagEnabled(resolvedEnv.HERO_MODE_CHILD_UI_ENABLED) ? safeResult : result;

  return json({ ok: true, hero: responseHero });
}

