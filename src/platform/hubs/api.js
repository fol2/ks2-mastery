import {
  applyRepositoryAuthSession,
  createNoopRepositoryAuthSession,
} from '../core/repositories/auth-session.js';

function joinUrl(baseUrl, path) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const suffix = String(path || '').startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function buildRequestUrl(baseUrl, path, params = {}) {
  const target = joinUrl(baseUrl, path);
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  }

  if (String(baseUrl || '').trim()) {
    const url = new URL(target);
    for (const [key, value] of searchParams.entries()) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  const query = searchParams.toString();
  return query ? `${target}?${query}` : target;
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => '');
}

async function fetchHubJson(fetchFn, url, init, authSession) {
  const requestInit = await applyRepositoryAuthSession(authSession, init);
  const response = await fetchFn(url, requestInit);
  const payload = await parseResponse(response);
  if (!response.ok) {
    const message = payload?.message || `Hub request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.code || null;
    error.payload = payload;
    throw error;
  }
  return payload;
}

// U9 round 1 fix (adv-u9-r1-002): wrap a hub fetch with named circuit-breaker
// accounting. HTTP 5xx and network failures trip the breaker; HTTP 2xx/3xx
// record a success; HTTP 4xx are user errors (auth / validation) and record
// NEITHER so user fault cannot degrade the surface for other users.
//
// The wrapper re-throws every error after recording so callers observe the
// same control flow as the pre-U9 unwrapped path.
async function fetchHubJsonWithBreaker(fetchFn, url, init, authSession, breaker) {
  if (!breaker || typeof breaker.recordFailure !== 'function') {
    return fetchHubJson(fetchFn, url, init, authSession);
  }
  try {
    const requestInit = await applyRepositoryAuthSession(authSession, init);
    const response = await fetchFn(url, requestInit);
    if (response.status >= 500 && response.status <= 599) {
      breaker.recordFailure();
    } else if (response.ok) {
      breaker.recordSuccess();
    }
    // 4xx: neither — client-side error (auth / validation).
    const payload = await parseResponse(response);
    if (!response.ok) {
      const message = payload?.message || `Hub request failed (${response.status}).`;
      const error = new Error(message);
      error.status = response.status;
      error.code = payload?.code || null;
      error.payload = payload;
      throw error;
    }
    return payload;
  } catch (error) {
    // Re-throw without double-recording: 5xx already recorded above, and
    // only genuine network failures (no response.status on the thrown error)
    // should trip the breaker here. When a 5xx throws further down the
    // parsing path, `error.status` is set — skip the second recordFailure.
    if (error && typeof error === 'object' && typeof error.status === 'number') {
      throw error;
    }
    breaker.recordFailure();
    throw error;
  }
}

export function createHubApi({
  baseUrl,
  fetch = globalThis.fetch?.bind(globalThis),
  authSession = createNoopRepositoryAuthSession(),
  // U9 round 1 fix (adv-u9-r1-002): optional breaker handles. When supplied,
  // the hub API records 5xx / network failures via `recordFailure` and 2xx
  // via `recordSuccess` against the matching surface. When absent (e.g. tests
  // that do not need circuit-breaker wiring), the pre-U9 fetch path is used.
  breakers = null,
} = {}) {
  if (typeof fetch !== 'function') {
    throw new TypeError('Hub API requires a fetch implementation.');
  }

  const parentHubRecentSessionsBreaker = breakers?.parentHubRecentSessions || null;
  const parentHubActivityBreaker = breakers?.parentHubActivity || null;
  const classroomSummaryBreaker = breakers?.classroomSummary || null;

  async function readParentRecentSessions({ learnerId = null, limit = 6, cursor = null } = {}) {
    const url = buildRequestUrl(baseUrl, '/api/hubs/parent/recent-sessions', {
      learnerId,
      limit,
      cursor,
    });
    return fetchHubJsonWithBreaker(
      fetch,
      url,
      { method: 'GET' },
      authSession,
      parentHubRecentSessionsBreaker,
    );
  }

  async function readParentActivity({ learnerId = null, limit = 20, cursor = null } = {}) {
    const url = buildRequestUrl(baseUrl, '/api/hubs/parent/activity', {
      learnerId,
      limit,
      cursor,
    });
    return fetchHubJsonWithBreaker(
      fetch,
      url,
      { method: 'GET' },
      authSession,
      parentHubActivityBreaker,
    );
  }

  return {
    async readParentHub(learnerId = null) {
      const url = buildRequestUrl(baseUrl, '/api/hubs/parent', { learnerId });
      const payload = await fetchHubJson(fetch, url, { method: 'GET' }, authSession);
      const resolvedLearnerId = payload?.learnerId || learnerId || payload?.parentHub?.selectedLearnerId || '';
      try {
        const history = await readParentRecentSessions({
          learnerId: resolvedLearnerId,
          limit: 6,
        });
        if (Array.isArray(history?.recentSessions) && payload?.parentHub) {
          return {
            ...payload,
            parentHub: {
              ...payload.parentHub,
              recentSessions: history.recentSessions,
            },
            parentHistory: {
              recentSessions: {
                status: 'loaded',
                page: history.page || null,
              },
            },
          };
        }
      } catch (error) {
        return {
          ...payload,
          parentHistory: {
            recentSessions: {
              status: 'error',
              error: error?.message || 'Recent sessions could not be loaded.',
            },
          },
        };
      }
      return payload;
    },
    readParentRecentSessions,
    readParentActivity,
    async readAdminHub({
      learnerId = null,
      requestId = null,
      auditLimit = 20,
      includeOpsPanels = false,
      includeVisualConfig = false,
    } = {}) {
      const url = buildRequestUrl(baseUrl, '/api/hubs/admin', {
        learnerId,
        requestId,
        auditLimit,
        includeOpsPanels: includeOpsPanels ? 'true' : null,
        includeVisualConfig: includeVisualConfig ? 'true' : null,
      });
      // U9 round 1 fix (adv-u9-r1-002): the Admin Hub read surfaces the
      // per-learner Grammar/Punctuation/Spelling summary stats. When the
      // derived-read path goes hot the `classroomSummary` breaker opens so
      // the admin UX degrades to the "learner-list-only" banner per plan
      // line 882.
      return fetchHubJsonWithBreaker(
        fetch,
        url,
        { method: 'GET' },
        authSession,
        classroomSummaryBreaker,
      );
    },
    async saveMonsterVisualConfigDraft({ draft, mutation } = {}) {
      const url = buildRequestUrl(baseUrl, '/api/admin/monster-visual-config/draft');
      return fetchHubJson(fetch, url, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draft, mutation }),
      }, authSession);
    },
    async readMonsterVisualConfig({ includeFull = false } = {}) {
      const url = buildRequestUrl(baseUrl, '/api/admin/monster-visual-config', {
        includeFull: includeFull ? 'true' : null,
      });
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
    async publishMonsterVisualConfig({ mutation } = {}) {
      const url = buildRequestUrl(baseUrl, '/api/admin/monster-visual-config/publish');
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mutation }),
      }, authSession);
    },
    async restoreMonsterVisualConfigVersion({ version, mutation } = {}) {
      const url = buildRequestUrl(baseUrl, '/api/admin/monster-visual-config/restore');
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version, mutation }),
      }, authSession);
    },
    // P6 U8: Generic asset CAS routes — delegate to asset-specific handlers
    // on the Worker. The assetId identifies which asset the operation targets.
    async saveAssetDraft({ assetId, data, expectedDraftRevision, mutation } = {}) {
      const url = buildRequestUrl(
        baseUrl,
        `/api/admin/assets/${encodeURIComponent(assetId)}/draft`,
      );
      return fetchHubJson(fetch, url, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data, expectedDraftRevision, mutation }),
      }, authSession);
    },
    async publishAsset({ assetId, expectedDraftRevision, mutation } = {}) {
      const url = buildRequestUrl(
        baseUrl,
        `/api/admin/assets/${encodeURIComponent(assetId)}/publish`,
      );
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedDraftRevision, mutation }),
      }, authSession);
    },
    async restoreAssetVersion({ assetId, version, expectedPublishedVersion, mutation } = {}) {
      const url = buildRequestUrl(
        baseUrl,
        `/api/admin/assets/${encodeURIComponent(assetId)}/restore`,
      );
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version, expectedPublishedVersion, mutation }),
      }, authSession);
    },
    async readContentOperationsOverview({ limit = 30, includeHistory = false } = {}) {
      const url = buildRequestUrl(
        baseUrl,
        '/api/admin/content-operations/subjects/spelling/overview',
        {
          limit,
          includeHistory: includeHistory ? 'true' : null,
        },
      );
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
    async readContentOperationSpellingBrowse({
      packageId = null,
      query = '',
      pool = null,
      listId = null,
      limit = 75,
    } = {}) {
      const url = buildRequestUrl(
        baseUrl,
        '/api/admin/content-operations/subjects/spelling/browse',
        {
          packageId,
          query,
          pool,
          listId,
          limit,
        },
      );
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
    async readContentOperationSpellingWord({ slug, packageId = null } = {}) {
      if (!slug) throw new TypeError('Spelling word slug is required.');
      const safeSlug = encodeURIComponent(String(slug));
      const url = buildRequestUrl(
        baseUrl,
        `/api/admin/content-operations/subjects/spelling/words/${safeSlug}`,
        { packageId },
      );
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
    async readContentOperationSpellingSentence({ sentenceId, packageId = null } = {}) {
      if (!sentenceId) throw new TypeError('Spelling sentence id is required.');
      const safeSentenceId = encodeURIComponent(String(sentenceId));
      const url = buildRequestUrl(
        baseUrl,
        `/api/admin/content-operations/subjects/spelling/sentences/${safeSentenceId}`,
        { packageId },
      );
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
    async readContentOperationPackages({ state = null, limit = 50 } = {}) {
      const url = buildRequestUrl(baseUrl, '/api/admin/content-operations/packages', {
        state,
        limit,
      });
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
    async readContentOperationPackage({ packageId } = {}) {
      if (!packageId) throw new TypeError('Content operation package id is required.');
      const safePackageId = encodeURIComponent(String(packageId));
      const url = buildRequestUrl(baseUrl, `/api/admin/content-operations/packages/${safePackageId}`);
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
    async appendContentOperation({ packageId, operation, mutation } = {}) {
      if (!packageId) throw new TypeError('Content operation package id is required.');
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
        throw new TypeError('Content operation payload is required.');
      }
      const safePackageId = encodeURIComponent(String(packageId));
      const url = buildRequestUrl(baseUrl, `/api/admin/content-operations/packages/${safePackageId}/operations`);
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operation,
          mutation,
        }),
      }, authSession);
    },
    async deleteContentOperation({ packageId, operationId } = {}) {
      if (!packageId) throw new TypeError('Content operation package id is required.');
      if (!operationId) throw new TypeError('Content operation id is required.');
      const safePackageId = encodeURIComponent(String(packageId));
      const safeOperationId = encodeURIComponent(String(operationId));
      const url = buildRequestUrl(
        baseUrl,
        `/api/admin/content-operations/packages/${safePackageId}/operations/${safeOperationId}`,
      );
      return fetchHubJson(fetch, url, { method: 'DELETE' }, authSession);
    },
    async validateContentOperationPackage({ packageId, includeSnapshot = false, mutation } = {}) {
      if (!packageId) throw new TypeError('Content operation package id is required.');
      const safePackageId = encodeURIComponent(String(packageId));
      const url = buildRequestUrl(baseUrl, `/api/admin/content-operations/packages/${safePackageId}/validate`);
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          includeSnapshot: Boolean(includeSnapshot),
          mutation,
        }),
      }, authSession);
    },
    async generateContentOperationAudio({
      packageId,
      candidateId = '',
      itemIds = [],
      limit = null,
      override = false,
      reason = '',
      mutation,
    } = {}) {
      if (!packageId) throw new TypeError('Content operation package id is required.');
      const safePackageId = encodeURIComponent(String(packageId));
      const url = buildRequestUrl(baseUrl, `/api/admin/content-operations/packages/${safePackageId}/generate-audio`);
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          candidateId,
          itemIds: Array.isArray(itemIds) ? itemIds : [],
          limit,
          override: Boolean(override),
          reason,
          mutation,
        }),
      }, authSession);
    },
    async approveContentOperationPackage({
      packageId,
      candidateId,
      notes = '',
      audioFallback = null,
      mutation,
    } = {}) {
      if (!packageId) throw new TypeError('Content operation package id is required.');
      if (!candidateId) throw new TypeError('Content operation candidate id is required.');
      const safePackageId = encodeURIComponent(String(packageId));
      const url = buildRequestUrl(baseUrl, `/api/admin/content-operations/packages/${safePackageId}/approve`);
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          candidateId,
          notes,
          audioFallback,
          mutation,
        }),
      }, authSession);
    },
    async publishContentOperationPackage({
      packageId,
      proof = null,
      includeSnapshot = false,
      mutation,
    } = {}) {
      if (!packageId) throw new TypeError('Content operation package id is required.');
      const safePackageId = encodeURIComponent(String(packageId));
      const url = buildRequestUrl(baseUrl, `/api/admin/content-operations/packages/${safePackageId}/publish`);
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proof,
          includeSnapshot: Boolean(includeSnapshot),
          mutation,
        }),
      }, authSession);
    },
    async createContentOperationPackageRevert({
      packageId,
      reason = '',
      title = '',
      description = '',
      includeSnapshot = false,
      mutation,
    } = {}) {
      if (!packageId) throw new TypeError('Content operation package id is required.');
      const safeReason = String(reason || '').trim();
      if (!safeReason) throw new TypeError('Content operation package revert reason is required.');
      const safePackageId = encodeURIComponent(String(packageId));
      const url = buildRequestUrl(baseUrl, `/api/admin/content-operations/packages/${safePackageId}/create-revert`);
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reason: safeReason,
          title,
          description,
          includeSnapshot: Boolean(includeSnapshot),
          mutation,
        }),
      }, authSession);
    },
    async resolveContentOperationConflict({
      packageId,
      conflictId = '',
      conflict = null,
      resolution,
      value,
      includeSnapshot = false,
      mutation,
    } = {}) {
      if (!packageId) throw new TypeError('Content operation package id is required.');
      if (!resolution) throw new TypeError('Content operation conflict resolution is required.');
      const safePackageId = encodeURIComponent(String(packageId));
      const url = buildRequestUrl(baseUrl, `/api/admin/content-operations/packages/${safePackageId}/resolve-conflict`);
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conflictId,
          conflict,
          resolution,
          value,
          includeSnapshot: Boolean(includeSnapshot),
          mutation,
        }),
      }, authSession);
    },
    async readContentOperationReleases({ limit = 20, includeSnapshot = false, includeHistory = false } = {}) {
      if (includeSnapshot) {
        throw new TypeError('Content operation release lists cannot include snapshots. Use readContentOperationRelease with includeSnapshot for release detail.');
      }
      const url = buildRequestUrl(
        baseUrl,
        '/api/admin/content-operations/subjects/spelling/releases',
        {
          limit,
          includeHistory: includeHistory ? 'true' : null,
        },
      );
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
    async readContentOperationRelease({ releaseId, includeSnapshot = false, includeHistory = false } = {}) {
      if (!releaseId) throw new TypeError('Content operation release id is required.');
      const safeReleaseId = encodeURIComponent(String(releaseId));
      const url = buildRequestUrl(
        baseUrl,
        `/api/admin/content-operations/subjects/spelling/releases/${safeReleaseId}`,
        {
          includeSnapshot: includeSnapshot ? 'true' : null,
          includeHistory: includeHistory ? 'true' : null,
        },
      );
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
    async captureContentOperationReleaseProof({ releaseId, proof, includeSnapshot = false } = {}) {
      if (!releaseId) throw new TypeError('Content operation release id is required.');
      const safeReleaseId = encodeURIComponent(String(releaseId));
      const url = buildRequestUrl(
        baseUrl,
        `/api/admin/content-operations/subjects/spelling/releases/${safeReleaseId}/proof`,
        {
          includeSnapshot: includeSnapshot ? 'true' : null,
        },
      );
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proof }),
      }, authSession);
    },
    async rollbackContentOperationRelease({
      releaseId,
      reason = '',
      proof = null,
      includeSnapshot = false,
      mutation,
    } = {}) {
      if (!releaseId) throw new TypeError('Content operation release id is required.');
      const safeReason = String(reason || '').trim();
      if (!safeReason) throw new TypeError('Content operation rollback reason is required.');
      const safeReleaseId = encodeURIComponent(String(releaseId));
      const url = buildRequestUrl(baseUrl, `/api/admin/content-operations/releases/${safeReleaseId}/rollback`);
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reason: safeReason,
          proof,
          includeSnapshot: Boolean(includeSnapshot),
          mutation,
        }),
      }, authSession);
    },
    async readAdminOpsKpi() {
      const url = buildRequestUrl(baseUrl, '/api/admin/ops/kpi');
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
    async readAdminOpsActivity({ limit = 50 } = {}) {
      const url = buildRequestUrl(baseUrl, '/api/admin/ops/activity', { limit });
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
    async readAdminOpsErrorEvents({
      status = null,
      limit = 50,
      route = null,
      kind = null,
      lastSeenAfter = null,
      lastSeenBefore = null,
      release = null,
      reopenedAfterResolved = false,
    } = {}) {
      // U19: thread filter query params through the same GET as the
      // legacy status-only call. `buildRequestUrl` drops null / undefined
      // keys so an unset filter does not appear in the URL.
      const url = buildRequestUrl(baseUrl, '/api/admin/ops/error-events', {
        status,
        limit,
        route: route || null,
        kind: kind || null,
        lastSeenAfter: lastSeenAfter == null ? null : String(lastSeenAfter),
        lastSeenBefore: lastSeenBefore == null ? null : String(lastSeenBefore),
        release: release || null,
        reopenedAfterResolved: reopenedAfterResolved ? 'true' : null,
      });
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
    // PR #188 H1: dedicated narrow GET for the account-ops-metadata panel
    // so all four admin ops panels share a uniform refresh contract. Mirrors
    // the other three /api/admin/ops/* read routes (kpi, activity,
    // error-events). Worker implementation at /api/admin/ops/accounts-metadata.
    async readAdminOpsAccountsMetadata() {
      const url = buildRequestUrl(baseUrl, '/api/admin/ops/accounts-metadata');
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
    async readAdminProductionEvidence() {
      const url = buildRequestUrl(baseUrl, '/api/admin/ops/production-evidence');
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
    async updateAccountOpsMetadata({ accountId, patch, expectedRowVersion = null, mutation } = {}) {
      const url = buildRequestUrl(
        baseUrl,
        `/api/admin/accounts/${encodeURIComponent(accountId)}/ops-metadata`,
      );
      // U8 CAS: include the client-observed `expectedRowVersion` so the
      // Worker helper can reject stale writes with 409 and echo
      // `currentState`. The field is always sent (never omitted) so the
      // Worker's mutation-payload hash is stable across clients.
      const body = {
        patch,
        expectedRowVersion,
        mutation,
      };
      return fetchHubJson(fetch, url, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }, authSession);
    },
    async updateOpsErrorEventStatus({
      eventId,
      status,
      expectedPreviousStatus = null,
      mutation,
    } = {}) {
      const url = buildRequestUrl(
        baseUrl,
        `/api/admin/ops/error-events/${encodeURIComponent(eventId)}/status`,
      );
      // U5 review follow-up (Finding 2): forward the client-observed previous
      // status as a CAS pre-image so the Worker can reject stale dispatches
      // (two admins clicking from the same pre-read state) with a 409.
      const body = {
        status,
        mutation,
        ...(typeof expectedPreviousStatus === 'string' && expectedPreviousStatus
          ? { expectedPreviousStatus }
          : {}),
      };
      return fetchHubJson(fetch, url, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }, authSession);
    },
    // U10: admin-only archive + hard-delete for Grammar Writing Try
    // entries. The routes are POST-only (CSRF + idempotent via the
    // mutation envelope) and are guarded server-side by
    // `requireAdminHubAccess`. The client never claims the admin role —
    // the session cookie identifies the actor and the Worker derives
    // the role from the account record.
    async archiveGrammarTransferEvidence({ learnerId, promptId, mutation } = {}) {
      const url = buildRequestUrl(
        baseUrl,
        `/api/admin/learners/${encodeURIComponent(learnerId)}/grammar/transfer-evidence/${encodeURIComponent(promptId)}/archive`,
      );
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mutation }),
      }, authSession);
    },
    async deleteGrammarTransferEvidence({ learnerId, promptId, mutation } = {}) {
      const url = buildRequestUrl(
        baseUrl,
        `/api/admin/learners/${encodeURIComponent(learnerId)}/grammar/transfer-evidence/${encodeURIComponent(promptId)}/delete`,
      );
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mutation }),
      }, authSession);
    },
    // P2 U3: admin-gated seed harness. Caller supplies learnerId, one of the
    // 8 canonical shape names, optional day-epoch `today`, and a mutation
    // envelope. Server responds with `{ok, postMegaSeed, postMegaSeedMutation}`
    // where `postMegaSeed.dataKeys` is the sorted list of keys written so the
    // UI can render a diff hint ("Wrote progress + guardian + postMega").
    async seedPostMegaLearnerState({ learnerId, shapeName, today, mutation } = {}) {
      const url = buildRequestUrl(baseUrl, '/api/admin/spelling/seed-post-mega');
      const body = {
        learnerId,
        shapeName,
        mutation,
        ...(Number.isFinite(Number(today)) ? { today: Number(today) } : {}),
      };
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }, authSession);
    },
    async postClientErrorEvent(event) {
      const url = buildRequestUrl(baseUrl, '/api/ops/error-event');
      // R11/R15: public endpoint — must NOT reuse the admin auth session.
      const publicSession = createNoopRepositoryAuthSession();
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event ?? {}),
      }, publicSession);
    },
    // U12: fetch active marketing messages (announcements, maintenance
    // banners) for the client-runtime delivery banner. Any authenticated
    // user can call this endpoint — the Worker returns only published
    // messages with safe field projection. Fail-open: caller catches
    // errors and renders no banner.
    async fetchActiveMessages() {
      const url = buildRequestUrl(baseUrl, '/api/ops/active-messages');
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
  };
}
