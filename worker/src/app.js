import {
  clearSessionCookie,
  completeSocialLogin,
  createSessionAuthBoundary,
  deleteCurrentSession,
  loginWithEmail,
  registerWithEmail,
  startSocialLogin,
} from './auth.js';
import { requireDatabase } from './d1.js';
import { errorResponse } from './errors.js';
import { json, readForm, readJson } from './http.js';
import { createWorkerRepository } from './repository.js';
import { handleTextToSpeechRequest } from './tts.js';
import {
  createDemoSession,
  isProductionRuntime,
  protectDemoParentHubRead,
  protectDemoSubjectCommand,
  requireSameOrigin,
  resetDemoAccount,
} from './demo/sessions.js';
import { normaliseSubjectCommandRequest } from './subjects/command-contract.js';
import { createWorkerSubjectRuntime } from './subjects/runtime.js';
import { ForbiddenError, NotFoundError } from './errors.js';
import { SUBJECT_EXPOSURE_GATES } from '../../src/platform/core/subject-availability.js';

function withCookies(response, cookies = []) {
  cookies.filter(Boolean).forEach((cookie) => response.headers.append('set-cookie', cookie));
  return response;
}

function redirect(location, status = 302, cookies = []) {
  const response = new Response(null, {
    status,
    headers: {
      location,
      'cache-control': 'no-store',
    },
  });
  return withCookies(response, cookies);
}

function isDemoSubresourceRequest(request) {
  const mode = request.headers.get('sec-fetch-mode');
  const dest = request.headers.get('sec-fetch-dest');
  const hasFetchMetadata = Boolean(
    mode
    || dest
    || request.headers.get('sec-fetch-site')
    || request.headers.get('sec-fetch-user'),
  );
  if (!hasFetchMetadata) return false;
  if (mode && mode !== 'navigate') return true;
  if (dest && dest !== 'document') return true;
  return false;
}

function callbackErrorRedirect(request, message) {
  const url = new URL(request.url);
  return redirect(`${url.origin}/?auth_error=${encodeURIComponent(message || 'Could not complete sign-in.')}`);
}

function mutationFromRequest(body, request) {
  const payload = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const raw = payload.mutation && typeof payload.mutation === 'object' && !Array.isArray(payload.mutation)
    ? payload.mutation
    : {};
  const requestId = raw.requestId || request.headers.get('x-ks2-request-id') || null;
  const correlationId = raw.correlationId || request.headers.get('x-ks2-correlation-id') || requestId || null;
  return {
    ...raw,
    requestId,
    correlationId,
  };
}

async function sessionPayload({ session, auth, env, now }) {
  if (!session) {
    return {
      ok: true,
      auth: auth.describe(),
      session: null,
      account: null,
      learnerCount: 0,
    };
  }

  const repository = createWorkerRepository({ env, now });
  const account = await repository.ensureAccount(session);
  const learnerIds = await repository.accessibleLearnerIds(session.accountId);
  return {
    ok: true,
    auth: auth.describe(),
    subjectExposureGates: subjectExposureGatesFromEnv(env),
    account: account
      ? {
        id: account.id,
        email: account.email,
        displayName: account.display_name,
        selectedLearnerId: account.selected_learner_id || null,
        repoRevision: Number(account.repo_revision) || 0,
        platformRole: account.platform_role || session.platformRole || 'parent',
        accountType: account.account_type || session.accountType || 'real',
        demo: (account.account_type || session.accountType) === 'demo',
        demoExpiresAt: Number(account.demo_expires_at) || session.demoExpiresAt || null,
      }
      : null,
    session: session
      ? {
        ...session,
        demo: Boolean(session.demo),
        accountType: session.accountType || 'real',
        demoExpiresAt: session.demoExpiresAt || null,
      }
      : null,
    learnerCount: learnerIds.length,
  };
}

async function existingDemoSessionPayload({ session, env, now }) {
  const repository = createWorkerRepository({ env, now });
  const account = await repository.ensureAccount(session);
  const learnerIds = await repository.accessibleLearnerIds(session.accountId);
  return {
    ok: true,
    subjectExposureGates: subjectExposureGatesFromEnv(env),
    session: {
      accountId: session.accountId,
      learnerId: account?.selected_learner_id || learnerIds[0] || null,
      provider: 'demo',
      demo: true,
      expiresAt: session.demoExpiresAt || null,
    },
  };
}

function shouldUsePublicReadModels(request, env = {}) {
  if (request.headers.get('x-ks2-public-read-models') === '1') return true;
  return isProductionRuntime(env);
}

function envFlagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

export function subjectExposureGatesFromEnv(env = {}) {
  return {
    [SUBJECT_EXPOSURE_GATES.punctuation]: envFlagEnabled(env.PUNCTUATION_SUBJECT_ENABLED),
  };
}

function requireSubjectCommandAvailable(command, env = {}) {
  if (command?.subjectId !== 'punctuation') return;
  if (subjectExposureGatesFromEnv(env)[SUBJECT_EXPOSURE_GATES.punctuation]) return;
  throw new NotFoundError('Subject command is not available.', {
    code: 'subject_command_not_found',
    subjectId: command.subjectId,
    command: command.command,
  });
}

function requireDemoWriteAllowed(session) {
  if (session?.demo) {
    throw new ForbiddenError('Demo writes must use server-owned routes.', {
      code: 'subject_command_required',
    });
  }
}

function requireLegacyRuntimeWriteAllowed(session, env = {}) {
  if (session?.demo || isProductionRuntime(env)) {
    throw new ForbiddenError('Runtime writes must use the subject command boundary.', {
      code: 'subject_command_required',
    });
  }
}

async function publicSourceAssetResponse(request, env = {}) {
  const url = new URL(request.url);
  const headers = {
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Not found.', { status: 404, headers });
  }
  if (url.pathname === '/src/bundles/app.bundle.js' && env.ASSETS) {
    return env.ASSETS.fetch(request);
  }
  return new Response('Not found.', { status: 404, headers });
}

function isPublicSourceLockdownPath(pathname) {
  return pathname.startsWith('/src/')
    || pathname.startsWith('/shared/')
    || pathname.startsWith('/worker/')
    || pathname.startsWith('/tests/')
    || pathname.startsWith('/docs/')
    || pathname.startsWith('/legacy/')
    || pathname === '/migration-plan.md';
}

export function createWorkerApp({
  now = Date.now,
  fetchFn = (...args) => fetch(...args),
  subjectRuntime = createWorkerSubjectRuntime(),
} = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const auth = createSessionAuthBoundary({ env });

      try {
        if (isPublicSourceLockdownPath(url.pathname)) {
          return publicSourceAssetResponse(request, env);
        }

        if (url.pathname === '/api/health') {
          let databaseStatus = 'missing';
          try {
            requireDatabase(env);
            databaseStatus = 'd1';
          } catch {
            databaseStatus = 'missing';
          }
          return json({
            ok: true,
            name: 'ks2-platform-v2-worker',
            mode: databaseStatus === 'd1' ? 'repository-d1-mvp' : 'repository-missing-db',
            auth: auth.describe(),
            mutationPolicy: {
              version: 1,
              idempotency: 'request-receipts',
              learnerScope: 'compare-and-swap',
              accountScope: 'compare-and-swap',
            },
            now: new Date(now()).toISOString(),
          });
        }

        if (url.pathname === '/api/demo/session' && request.method === 'POST') {
          const currentSession = await auth.getSession(request);
          if (currentSession && !currentSession.demo) {
            return json({
              ok: false,
              code: 'demo_session_conflict',
              message: 'Sign out before starting a demo session.',
            }, 409);
          }
          if (currentSession?.demo) {
            return json(await existingDemoSessionPayload({
              session: currentSession,
              env,
              now,
            }));
          }
          const result = await createDemoSession({
            env,
            request,
            now: now(),
          });
          return withCookies(json(result.payload, result.status), result.cookies);
        }

        if (url.pathname === '/demo' && request.method === 'GET') {
          const currentSession = await auth.getSession(request);
          if (currentSession && !currentSession.demo) {
            return redirect(`${url.origin}/`, 302);
          }
          if (currentSession?.demo) {
            return redirect(`${url.origin}/?demo=1`, 302);
          }
          if (isDemoSubresourceRequest(request)) {
            return json({
              ok: false,
              code: 'demo_navigation_required',
              message: 'Open the demo directly to start a session.',
            }, 403);
          }
          const result = await createDemoSession({
            env,
            request,
            now: now(),
            allowMissingOrigin: true,
          });
          return redirect(`${url.origin}/?demo=1`, 302, result.cookies);
        }

        if (url.pathname === '/api/session' && request.method === 'GET') {
          return json(await sessionPayload({
            session: await auth.requireSession(request),
            auth,
            env,
            now,
          }));
        }

        if (url.pathname === '/api/auth/session' && request.method === 'GET') {
          return json(await sessionPayload({
            session: await auth.getSession(request),
            auth,
            env,
            now,
          }));
        }

        if (url.pathname === '/api/auth/register' && request.method === 'POST') {
          requireSameOrigin(request, env);
          const body = await readJson(request);
          const result = await registerWithEmail(env, request, body);
          return withCookies(json(result.payload, result.status), result.cookies);
        }

        if (url.pathname === '/api/auth/login' && request.method === 'POST') {
          requireSameOrigin(request, env);
          const body = await readJson(request);
          const result = await loginWithEmail(env, request, body);
          return withCookies(json(result.payload, result.status), result.cookies);
        }

        if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
          requireSameOrigin(request, env);
          try {
            await deleteCurrentSession(env, request);
          } finally {
            return withCookies(json({ ok: true }), [clearSessionCookie(request)]);
          }
        }

        const oauthStart = /^\/api\/auth\/([^/]+)\/start$/.exec(url.pathname);
        if (oauthStart && request.method === 'POST') {
          requireSameOrigin(request, env);
          const body = await readJson(request);
          const result = await startSocialLogin(env, request, oauthStart[1], body);
          return withCookies(json(result.payload, result.status), result.cookies);
        }

        const oauthCallback = /^\/api\/auth\/([^/]+)\/callback$/.exec(url.pathname);
        if (oauthCallback && (request.method === 'GET' || request.method === 'POST')) {
          const payload = request.method === 'POST'
            ? await readForm(request)
            : Object.fromEntries(url.searchParams.entries());
          try {
            const result = await completeSocialLogin(env, request, oauthCallback[1], payload);
            return redirect(`${url.origin}/?auth=success`, 302, result.cookies);
          } catch (error) {
            return callbackErrorRedirect(request, error?.message);
          }
        }

        const repository = createWorkerRepository({ env, now });
        const session = await auth.requireSession(request);
        const account = await repository.ensureAccount(session);

        const subjectCommandMatch = /^\/api\/subjects\/([^/]+)\/command$/.exec(url.pathname);
        if (subjectCommandMatch && request.method === 'POST') {
          requireSameOrigin(request, env);
          const body = await readJson(request);
          const command = normaliseSubjectCommandRequest({
            routeSubjectId: subjectCommandMatch[1],
            body,
            request,
          });
          requireSubjectCommandAvailable(command, env);
          await protectDemoSubjectCommand({
            env,
            request,
            session,
            command,
            now: now(),
          });
          const result = await repository.runSubjectCommand(
            session.accountId,
            command,
            () => subjectRuntime.dispatch(command, {
              env,
              request,
              session,
              account,
              repository,
              now: now(),
            }),
          );
          return json({
            ok: true,
            ...result,
          });
        }

        if (url.pathname === '/api/bootstrap' && request.method === 'GET') {
          const bundle = await repository.bootstrap(session.accountId, {
            publicReadModels: shouldUsePublicReadModels(request, env),
          });
          return json({
            ok: true,
            version: '0.9.0',
            mode: 'repository-d1-mvp',
            auth: auth.describe(),
            session: {
              accountId: session.accountId,
              provider: session.provider,
              platformRole: account?.platform_role || session.platformRole || 'parent',
              accountType: account?.account_type || session.accountType || 'real',
              demo: (account?.account_type || session.accountType) === 'demo',
              demoExpiresAt: Number(account?.demo_expires_at) || session.demoExpiresAt || null,
            },
            mutationPolicy: {
              version: 1,
              strategy: 'account-and-learner-revision-cas',
              idempotency: 'request-receipts',
              merge: 'none',
            },
            subjectExposureGates: subjectExposureGatesFromEnv(env),
            ...bundle,
          });
        }

        if (url.pathname === '/api/demo/reset' && request.method === 'POST') {
          await resetDemoAccount({
            env,
            request,
            session,
            now: now(),
          });
          const bundle = await repository.bootstrap(session.accountId, {
            publicReadModels: shouldUsePublicReadModels(request, env),
          });
          return json({
            ok: true,
            session: {
              accountId: session.accountId,
              provider: session.provider,
              accountType: 'demo',
              demo: true,
              demoExpiresAt: session.demoExpiresAt || null,
            },
            subjectExposureGates: subjectExposureGatesFromEnv(env),
            ...bundle,
          });
        }

        if (url.pathname === '/api/learners/reset-progress' && request.method === 'POST') {
          requireSameOrigin(request, env);
          requireDemoWriteAllowed(session);
          const body = await readJson(request);
          const result = await repository.resetLearnerRuntime(
            session.accountId,
            body.learnerId,
            mutationFromRequest(body, request),
          );
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/tts' && request.method === 'POST') {
          return await handleTextToSpeechRequest({
            env,
            request,
            session,
            repository,
            now: now(),
            fetchFn,
          });
        }

        if (url.pathname === '/api/content/spelling' && request.method === 'GET') {
          const result = await repository.exportSubjectContent(session.accountId, 'spelling');
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/subjects/spelling/word-bank' && request.method === 'GET') {
          const learnerId = url.searchParams.get('learnerId') || account?.selected_learner_id || '';
          const result = await repository.readSpellingWordBank(session.accountId, learnerId, {
            query: url.searchParams.get('q') || url.searchParams.get('query') || '',
            status: url.searchParams.get('status') || 'all',
            year: url.searchParams.get('year') || 'all',
            page: url.searchParams.get('page') || 1,
            pageSize: url.searchParams.get('pageSize') || 250,
            detailSlug: url.searchParams.get('detailSlug') || '',
          });
          return json({ ok: true, wordBank: result });
        }

        if (url.pathname === '/api/hubs/parent' && request.method === 'GET') {
          await protectDemoParentHubRead({
            env,
            request,
            session,
            now: now(),
          });
          const learnerId = url.searchParams.get('learnerId') || null;
          const result = await repository.readParentHub(session.accountId, learnerId);
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/hubs/admin' && request.method === 'GET') {
          const result = await repository.readAdminHub(session.accountId, {
            learnerId: url.searchParams.get('learnerId') || null,
            requestId: url.searchParams.get('requestId') || null,
            auditLimit: url.searchParams.get('auditLimit') || 20,
          });
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/admin/accounts' && request.method === 'GET') {
          const result = await repository.listAdminAccounts(session.accountId);
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/admin/accounts/role' && request.method === 'PUT') {
          requireSameOrigin(request, env);
          const body = await readJson(request);
          const result = await repository.updateAdminAccountRole(session.accountId, {
            targetAccountId: body.accountId,
            platformRole: body.platformRole,
            requestId: body.requestId || request.headers.get('x-ks2-request-id') || null,
            correlationId: body.correlationId || request.headers.get('x-ks2-correlation-id') || null,
          });
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/admin/monster-visual-config/draft' && request.method === 'PUT') {
          requireSameOrigin(request, env);
          const body = await readJson(request);
          const result = await repository.saveMonsterVisualConfigDraft(session.accountId, {
            draft: body.draft || body.config,
            mutation: mutationFromRequest(body, request),
          });
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/admin/monster-visual-config/publish' && request.method === 'POST') {
          requireSameOrigin(request, env);
          const body = await readJson(request);
          const result = await repository.publishMonsterVisualConfig(session.accountId, {
            mutation: mutationFromRequest(body, request),
          });
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/admin/monster-visual-config/restore' && request.method === 'POST') {
          requireSameOrigin(request, env);
          const body = await readJson(request);
          const result = await repository.restoreMonsterVisualConfigVersion(session.accountId, {
            version: body.version,
            mutation: mutationFromRequest(body, request),
          });
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/content/spelling' && request.method === 'PUT') {
          requireSameOrigin(request, env);
          const body = await readJson(request);
          const result = await repository.writeSubjectContent(
            session.accountId,
            'spelling',
            body.content,
            mutationFromRequest(body, request),
          );
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/learners' && request.method === 'PUT') {
          requireSameOrigin(request, env);
          requireDemoWriteAllowed(session);
          const body = await readJson(request);
          const result = await repository.writeLearners(session.accountId, body.learners, mutationFromRequest(body, request));
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/child-subject-state' && request.method === 'PUT') {
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.writeSubjectState(
            session.accountId,
            body.learnerId,
            body.subjectId,
            body.record,
            mutationFromRequest(body, request),
          );
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/child-subject-state' && request.method === 'DELETE') {
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.clearSubjectState(
            session.accountId,
            body.learnerId,
            body.subjectId || null,
            mutationFromRequest(body, request),
          );
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/practice-sessions' && request.method === 'PUT') {
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.writePracticeSession(session.accountId, body.record || {}, mutationFromRequest(body, request));
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/practice-sessions' && request.method === 'DELETE') {
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.clearPracticeSessions(
            session.accountId,
            body.learnerId,
            body.subjectId || null,
            mutationFromRequest(body, request),
          );
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/child-game-state' && request.method === 'PUT') {
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.writeGameState(
            session.accountId,
            body.learnerId,
            body.systemId,
            body.state,
            mutationFromRequest(body, request),
          );
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/child-game-state' && request.method === 'DELETE') {
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.clearGameState(
            session.accountId,
            body.learnerId,
            body.systemId || null,
            mutationFromRequest(body, request),
          );
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/event-log' && request.method === 'POST') {
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.appendEvent(session.accountId, body.event, mutationFromRequest(body, request));
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/event-log' && request.method === 'DELETE') {
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.clearEventLog(session.accountId, body.learnerId, mutationFromRequest(body, request));
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/debug/reset' && request.method === 'POST') {
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.resetAccountScope(session.accountId, mutationFromRequest(body, request));
          return json({ ok: true, ...result });
        }

        if (env.ASSETS && request.method === 'GET') {
          return env.ASSETS.fetch(request);
        }

        return json({ ok: false, message: 'Not found.' }, 404);
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}
