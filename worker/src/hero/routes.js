// Hero Mode P0 — Route handler for GET /api/hero/read-model.
//
// Shadow-only, read-only, zero-write endpoint. Returns the full Hero
// shadow read model for the authenticated learner. Feature-gated behind
// HERO_MODE_SHADOW_ENABLED.

import { json } from '../http.js';
import { NotFoundError } from '../errors.js';
import { buildHeroShadowReadModel } from './read-model.js';

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
  // 1. Feature flag gate
  if (!envFlagEnabled(env.HERO_MODE_SHADOW_ENABLED)) {
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

  // 5. Assemble the shadow read model (v3: pass accountId and env for
  //    quest fingerprint and the HERO_MODE_CHILD_UI_ENABLED gate).
  const nowTs = typeof now === 'function' ? now() : Date.now();
  const result = buildHeroShadowReadModel({
    learnerId,
    accountId: session.accountId || '',
    subjectReadModels,
    now: nowTs,
    env,
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
  const responseHero = envFlagEnabled(env.HERO_MODE_CHILD_UI_ENABLED) ? safeResult : result;

  return json({ ok: true, hero: responseHero });
}

