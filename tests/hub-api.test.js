import test from 'node:test';
import assert from 'node:assert/strict';

import { createHubApi } from '../src/platform/hubs/api.js';
import { createStaticHeaderRepositoryAuthSession } from '../src/platform/core/repositories/auth-session.js';
import {
  BUNDLED_MONSTER_VISUAL_CONFIG,
  MONSTER_VISUAL_CONTEXTS,
} from '../src/platform/game/monster-visual-config.js';
import { bundledEffectConfig } from '../src/platform/game/render/effect-config-defaults.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('hub api client calls parent hub with learner query and auth headers', async () => {
  const calls = [];
  const api = createHubApi({
    baseUrl: 'https://repo.test',
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('/api/hubs/parent/recent-sessions')) {
        return jsonResponse({
          ok: true,
          learnerId: 'learner-a',
          recentSessions: [{ id: 'lazy-session', label: 'Lazy session' }],
          page: { hasMore: false, nextCursor: null },
        });
      }
      return jsonResponse({ ok: true, learnerId: 'learner-a', parentHub: { permissions: {} } });
    },
    authSession: createStaticHeaderRepositoryAuthSession({
      cacheScopeKey: 'account:adult-parent',
      headers: { 'x-test-auth': 'adult-parent' },
    }),
  });

  const payload = await api.readParentHub('learner-a');

  assert.equal(payload.learnerId, 'learner-a');
  assert.deepEqual(payload.parentHub.recentSessions, [{ id: 'lazy-session', label: 'Lazy session' }]);
  assert.equal(payload.parentHistory.recentSessions.status, 'loaded');
  assert.equal(calls.length, 2);
  const requestUrl = new URL(calls[0].url);
  assert.equal(requestUrl.pathname, '/api/hubs/parent');
  assert.equal(requestUrl.searchParams.get('learnerId'), 'learner-a');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers['x-test-auth'], 'adult-parent');
  const historyUrl = new URL(calls[1].url);
  assert.equal(historyUrl.pathname, '/api/hubs/parent/recent-sessions');
  assert.equal(historyUrl.searchParams.get('learnerId'), 'learner-a');
  assert.equal(historyUrl.searchParams.get('limit'), '6');
  assert.equal(calls[1].init.headers['x-test-auth'], 'adult-parent');
});

test('hub api client calls admin hub with learner, request id, audit limit, and auth headers', async () => {
  const calls = [];
  const api = createHubApi({
    baseUrl: 'https://repo.test',
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ ok: true, adminHub: { permissions: {} } });
    },
    authSession: createStaticHeaderRepositoryAuthSession({
      cacheScopeKey: 'account:adult-ops',
      headers: { 'x-test-auth': 'adult-ops' },
    }),
  });

  await api.readAdminHub({
    learnerId: 'learner-b',
    requestId: 'audit-req-1',
    auditLimit: 12,
  });

  assert.equal(calls.length, 1);
  const requestUrl = new URL(calls[0].url);
  assert.equal(requestUrl.pathname, '/api/hubs/admin');
  assert.equal(requestUrl.searchParams.get('learnerId'), 'learner-b');
  assert.equal(requestUrl.searchParams.get('requestId'), 'audit-req-1');
  assert.equal(requestUrl.searchParams.get('auditLimit'), '12');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers['x-test-auth'], 'adult-ops');
});

test('hub api client supports same-origin relative URLs when no base URL is configured', async () => {
  const calls = [];
  const api = createHubApi({
    baseUrl: '',
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).startsWith('/api/hubs/parent/recent-sessions')) {
        return jsonResponse({ ok: true, learnerId: 'learner-a', recentSessions: [], page: {} });
      }
      return jsonResponse({ ok: true, learnerId: 'learner-a', parentHub: { permissions: {} } });
    },
  });

  await api.readParentHub('learner-a');
  await api.readAdminHub({ learnerId: 'learner-a', requestId: 'audit-1', auditLimit: 7 });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, '/api/hubs/parent?learnerId=learner-a');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[1].url, '/api/hubs/parent/recent-sessions?learnerId=learner-a&limit=6');
  assert.equal(calls[1].init.method, 'GET');
  assert.equal(calls[2].url, '/api/hubs/admin?learnerId=learner-a&requestId=audit-1&auditLimit=7');
  assert.equal(calls[2].init.method, 'GET');
});

test('hub api client reads paginated parent history routes', async () => {
  const calls = [];
  const api = createHubApi({
    baseUrl: '',
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ ok: true, learnerId: 'learner-a', page: { hasMore: false } });
    },
    authSession: createStaticHeaderRepositoryAuthSession({
      cacheScopeKey: 'account:adult-parent',
      headers: { 'x-test-auth': 'adult-parent' },
    }),
  });

  await api.readParentRecentSessions({ learnerId: 'learner-a', limit: 12, cursor: '100:session-1' });
  await api.readParentActivity({ learnerId: 'learner-a', limit: 9, cursor: '200:event-1' });

  assert.equal(calls[0].url, '/api/hubs/parent/recent-sessions?learnerId=learner-a&limit=12&cursor=100%3Asession-1');
  assert.equal(calls[0].init.headers['x-test-auth'], 'adult-parent');
  assert.equal(calls[1].url, '/api/hubs/parent/activity?learnerId=learner-a&limit=9&cursor=200%3Aevent-1');
  assert.equal(calls[1].init.headers['x-test-auth'], 'adult-parent');
});

test('hub api client writes monster visual draft, publish, and restore routes', async () => {
  const calls = [];
  const api = createHubApi({
    baseUrl: '',
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ ok: true, monsterVisualConfig: { status: {} } });
    },
  });

  await api.saveMonsterVisualConfigDraft({
    draft: { assets: {} },
    mutation: { requestId: 'draft-1', expectedDraftRevision: 0 },
  });
  await api.publishMonsterVisualConfig({
    mutation: { requestId: 'publish-1', expectedDraftRevision: 1 },
  });
  await api.restoreMonsterVisualConfigVersion({
    version: 2,
    mutation: { requestId: 'restore-1', expectedDraftRevision: 2 },
  });

  assert.equal(calls[0].url, '/api/admin/monster-visual-config/draft');
  assert.equal(calls[0].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    draft: { assets: {} },
    mutation: { requestId: 'draft-1', expectedDraftRevision: 0 },
  });
  assert.equal(calls[1].url, '/api/admin/monster-visual-config/publish');
  assert.equal(calls[1].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    mutation: { requestId: 'publish-1', expectedDraftRevision: 1 },
  });
  assert.equal(calls[2].url, '/api/admin/monster-visual-config/restore');
  assert.equal(calls[2].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[2].init.body), {
    version: 2,
    mutation: { requestId: 'restore-1', expectedDraftRevision: 2 },
  });
});

test('hub api client reads admin ops KPI with auth headers threaded', async () => {
  const calls = [];
  const api = createHubApi({
    baseUrl: 'https://repo.test',
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ ok: true, dashboardKpis: { accounts: { total: 1 } } });
    },
    authSession: createStaticHeaderRepositoryAuthSession({
      cacheScopeKey: 'account:adult-admin',
      headers: { 'x-test-auth': 'adult-admin' },
    }),
  });

  await api.readAdminOpsKpi();

  assert.equal(calls.length, 1);
  const requestUrl = new URL(calls[0].url);
  assert.equal(requestUrl.pathname, '/api/admin/ops/kpi');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers['x-test-auth'], 'adult-admin');
});

test('hub api client reads admin ops activity stream with limit query param', async () => {
  const calls = [];
  const api = createHubApi({
    baseUrl: '',
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ ok: true, opsActivityStream: { entries: [] } });
    },
    authSession: createStaticHeaderRepositoryAuthSession({
      cacheScopeKey: 'account:adult-ops',
      headers: { 'x-test-auth': 'adult-ops' },
    }),
  });

  await api.readAdminOpsActivity({ limit: 25 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/admin/ops/activity?limit=25');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers['x-test-auth'], 'adult-ops');
});

test('hub api client reads admin ops accounts metadata via dedicated narrow GET (PR #188 H1)', async () => {
  const calls = [];
  const api = createHubApi({
    baseUrl: '',
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ ok: true, accounts: [] });
    },
    authSession: createStaticHeaderRepositoryAuthSession({
      cacheScopeKey: 'account:adult-admin',
      headers: { 'x-test-auth': 'adult-admin' },
    }),
  });

  await api.readAdminOpsAccountsMetadata();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/admin/ops/accounts-metadata');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers['x-test-auth'], 'adult-admin');
});

test('hub api client reads admin ops error events with status and limit query params', async () => {
  const calls = [];
  const api = createHubApi({
    baseUrl: '',
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ ok: true, errorLogSummary: { entries: [] } });
    },
  });

  await api.readAdminOpsErrorEvents({ status: 'open', limit: 10 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/admin/ops/error-events?status=open&limit=10');
  assert.equal(calls[0].init.method, 'GET');
});

test('hub api client writes account ops metadata PUT with JSON body', async () => {
  const calls = [];
  const api = createHubApi({
    baseUrl: '',
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ ok: true });
    },
    authSession: createStaticHeaderRepositoryAuthSession({
      cacheScopeKey: 'account:adult-admin',
      headers: { 'x-test-auth': 'adult-admin' },
    }),
  });

  await api.updateAccountOpsMetadata({
    accountId: 'acc1',
    patch: { opsStatus: 'suspended' },
    expectedRowVersion: 7,
    mutation: { requestId: 'r1', correlationId: 'r1' },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/admin/accounts/acc1/ops-metadata');
  assert.equal(calls[0].init.method, 'PUT');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  assert.equal(calls[0].init.headers['x-test-auth'], 'adult-admin');
  // U8 CAS: hub API must forward the client-observed expectedRowVersion in
  // the PUT body so the Worker helper can enforce CAS.
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    patch: { opsStatus: 'suspended' },
    expectedRowVersion: 7,
    mutation: { requestId: 'r1', correlationId: 'r1' },
  });
});

test('hub api client encodes account id segments that need escaping', async () => {
  const calls = [];
  const api = createHubApi({
    baseUrl: '',
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ ok: true });
    },
  });

  await api.updateAccountOpsMetadata({
    accountId: 'acc/slash?raw',
    patch: { planLabel: 'x' },
    mutation: { requestId: 'r1' },
  });

  assert.equal(calls[0].url, '/api/admin/accounts/acc%2Fslash%3Fraw/ops-metadata');
});

test('hub api client writes ops error event status PUT with JSON body', async () => {
  const calls = [];
  const api = createHubApi({
    baseUrl: '',
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ ok: true });
    },
  });

  await api.updateOpsErrorEventStatus({
    eventId: 'e1',
    status: 'resolved',
    mutation: { requestId: 'r2', correlationId: 'r2' },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/admin/ops/error-events/e1/status');
  assert.equal(calls[0].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    status: 'resolved',
    mutation: { requestId: 'r2', correlationId: 'r2' },
  });
});

test('postClientErrorEvent posts to the public endpoint without admin auth headers', async () => {
  const calls = [];
  const api = createHubApi({
    baseUrl: '',
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ ok: true, eventId: 'evt-1', deduped: false });
    },
    authSession: createStaticHeaderRepositoryAuthSession({
      cacheScopeKey: 'account:adult-admin',
      headers: { 'x-test-auth': 'adult-admin', authorization: 'Bearer secret' },
    }),
  });

  const result = await api.postClientErrorEvent({
    errorKind: 'TypeError',
    messageFirstLine: 'x undef',
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/ops/error-event');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  // Must NOT reuse the admin auth session headers on the public endpoint.
  assert.equal(calls[0].init.headers['x-test-auth'], undefined);
  assert.equal(calls[0].init.headers.authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    errorKind: 'TypeError',
    messageFirstLine: 'x undef',
  });
});

test('admin ops methods propagate structured error shape (status, code, payload)', async () => {
  const api = createHubApi({
    baseUrl: '',
    fetch: async () => new Response(JSON.stringify({ ok: false, code: 'forbidden', message: 'no' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    }),
  });

  await assert.rejects(
    async () => api.readAdminOpsKpi(),
    (error) => {
      assert.equal(error.status, 403);
      assert.equal(error.code, 'forbidden');
      assert.equal(error.payload.code, 'forbidden');
      assert.equal(error.payload.message, 'no');
      assert.equal(error.message, 'no');
      return true;
    },
  );
});

// --- merged publish path: visual + effect together (U5) ---

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function reviewedMergedDraft() {
  const draft = clone(BUNDLED_MONSTER_VISUAL_CONFIG);
  for (const entry of Object.values(draft.assets || {})) {
    entry.review = entry.review || { contexts: {} };
    entry.review.contexts = entry.review.contexts || {};
    for (const context of MONSTER_VISUAL_CONTEXTS) {
      entry.review.contexts[context] = {
        reviewed: true,
        reviewedAt: 0,
        reviewedBy: 'test-admin',
      };
    }
  }
  draft.effect = bundledEffectConfig();
  draft.source = 'draft';
  return draft;
}

async function adminFetch(server, path, init = {}) {
  return server.fetchAs('adult-admin', `https://repo.test${path}`, init, {
    'x-ks2-dev-platform-role': 'admin',
  });
}

async function adminHubVisual(server) {
  const response = await adminFetch(server, '/api/hubs/admin');
  const payload = await response.json();
  return payload.adminHub.monsterVisualConfig;
}

test('worker accepts merged visual + effect publish payload and stores both atomically', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const initial = await adminHubVisual(server);
    const draft = reviewedMergedDraft();
    draft.assets['vellhorn-b1-3'].baseline.facing = 'right';

    const saveResponse = await adminFetch(server, '/api/admin/monster-visual-config/draft', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draft,
        mutation: {
          requestId: 'merged-draft-save',
          expectedDraftRevision: initial.status.draftRevision,
        },
      }),
    });
    const savePayload = await saveResponse.json();
    assert.equal(saveResponse.status, 200);
    assert.equal(savePayload.monsterVisualConfig.draft.assets['vellhorn-b1-3'].baseline.facing, 'right');
    assert.ok(
      savePayload.monsterVisualConfig.draft.effect && typeof savePayload.monsterVisualConfig.draft.effect === 'object',
      'effect sub-document was preserved on draft save',
    );
    assert.ok(savePayload.monsterVisualConfig.draft.effect.catalog.shiny, 'bundled catalog kinds round-tripped');

    const publishResponse = await adminFetch(server, '/api/admin/monster-visual-config/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mutation: {
          requestId: 'merged-publish-1',
          expectedDraftRevision: savePayload.monsterVisualConfig.status.draftRevision,
        },
      }),
    });
    const publishPayload = await publishResponse.json();
    assert.equal(publishResponse.status, 200);
    assert.equal(publishPayload.monsterVisualConfig.status.publishedVersion, 2);
    assert.equal(publishPayload.monsterVisualConfig.published.assets['vellhorn-b1-3'].baseline.facing, 'right');
    assert.ok(publishPayload.monsterVisualConfig.published.effect, 'published config carries effect sub-document');
    assert.ok(publishPayload.monsterVisualConfig.published.effect.catalog.shiny, 'published effect catalog round-trips');

    const receipt = server.DB.db.prepare('SELECT mutation_kind, scope_type FROM mutation_receipts WHERE request_id = ?').get('merged-publish-1');
    assert.equal(receipt.mutation_kind, 'monster_visual_config.publish');
    assert.equal(receipt.scope_type, 'platform');

    const versionRow = server.DB.db.prepare('SELECT config_json FROM platform_monster_visual_config_versions WHERE version = ?').get(2);
    const versionConfig = JSON.parse(versionRow.config_json);
    assert.ok(versionConfig.effect, 'historical version persists effect sub-document');
    assert.ok(versionConfig.effect.catalog.shiny);
  } finally {
    server.close();
  }
});

test('worker rejects publish when the draft has no effect sub-document', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const initial = await adminHubVisual(server);
    const draft = reviewedMergedDraft();
    delete draft.effect;
    // Force-write the row so the draft does NOT carry an effect — direct
    // DB manipulation lets us simulate a malformed publish state without
    // routing through the save path (which now backfills bundled defaults).
    server.DB.db.prepare(`
      UPDATE platform_monster_visual_config
      SET draft_json = ?,
          draft_revision = ?,
          draft_updated_at = ?,
          draft_updated_by_account_id = ?
      WHERE id = ?
    `).run(
      JSON.stringify(draft),
      1,
      Date.UTC(2026, 3, 24, 13, 0),
      'adult-admin',
      'global',
    );

    const publishResponse = await adminFetch(server, '/api/admin/monster-visual-config/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mutation: {
          requestId: 'missing-effect-publish',
          expectedDraftRevision: 1,
        },
      }),
    });
    const publishPayload = await publishResponse.json();

    assert.equal(publishResponse.status, 400);
    assert.equal(publishPayload.code, 'monster_visual_publish_blocked');
    assert.ok(publishPayload.validation.errors.some((issue) => /effect/i.test(issue.message || '') && /required/i.test(issue.message || '')));

    const after = await adminHubVisual(server);
    assert.equal(after.status.publishedVersion, 1, 'live published config did not change');
    assert.equal(after.published.assets['vellhorn-b1-3'].baseline.facing, 'left');
  } finally {
    server.close();
  }
});

test('worker rejects publish when the visual is valid but a catalog entry is unreviewed', async () => {
  // Visual sub-document is fully reviewed. The effect catalog has a single
  // entry flipped to `reviewed: false` — the strict-publish gate must aggregate
  // both validators and surface the catalog issue to the admin.
  const server = createWorkerRepositoryServer();
  try {
    // Read first so the row exists before we force-write a malformed draft —
    // mirrors the missing-effect-publish test's bootstrap pattern.
    await adminHubVisual(server);
    const draft = reviewedMergedDraft();
    // Pick any bundled catalog entry and unreview it.
    draft.effect.catalog.shiny.reviewed = false;
    server.DB.db.prepare(`
      UPDATE platform_monster_visual_config
      SET draft_json = ?,
          draft_revision = ?,
          draft_updated_at = ?,
          draft_updated_by_account_id = ?
      WHERE id = ?
    `).run(
      JSON.stringify(draft),
      1,
      Date.UTC(2026, 3, 24, 13, 0),
      'adult-admin',
      'global',
    );

    const publishResponse = await adminFetch(server, '/api/admin/monster-visual-config/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mutation: {
          requestId: 'effect-unreviewed-publish',
          expectedDraftRevision: 1,
        },
      }),
    });
    const publishPayload = await publishResponse.json();

    assert.equal(publishResponse.status, 400);
    assert.equal(publishPayload.code, 'monster_visual_publish_blocked');
    assert.ok(
      publishPayload.validation.errors.some((entry) => /reviewed/i.test(entry.message || '') && /shiny/.test(entry.message || '')),
      `expected aggregated validation error naming the unreviewed catalog entry, got ${JSON.stringify(publishPayload.validation.errors)}`,
    );

    const after = await adminHubVisual(server);
    assert.equal(after.status.publishedVersion, 1, 'live published config did not change');
  } finally {
    server.close();
  }
});

test('worker restore returns merged visual + effect into the draft', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const initial = await adminHubVisual(server);
    // Save then publish a merged draft so version 2 exists.
    const merged = reviewedMergedDraft();
    merged.assets['vellhorn-b1-3'].baseline.facing = 'right';

    const saveResponse = await adminFetch(server, '/api/admin/monster-visual-config/draft', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draft: merged,
        mutation: {
          requestId: 'restore-merged-save',
          expectedDraftRevision: initial.status.draftRevision,
        },
      }),
    });
    const savePayload = await saveResponse.json();
    assert.equal(saveResponse.status, 200);

    const publishResponse = await adminFetch(server, '/api/admin/monster-visual-config/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mutation: {
          requestId: 'restore-merged-publish',
          expectedDraftRevision: savePayload.monsterVisualConfig.status.draftRevision,
        },
      }),
    });
    const publishPayload = await publishResponse.json();
    assert.equal(publishResponse.status, 200);

    // Now restore version 1 (the original seeded publish).
    const restoreResponse = await adminFetch(server, '/api/admin/monster-visual-config/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        version: 1,
        mutation: {
          requestId: 'restore-merged-restore',
          expectedDraftRevision: publishPayload.monsterVisualConfig.status.draftRevision,
        },
      }),
    });
    const restorePayload = await restoreResponse.json();
    assert.equal(restoreResponse.status, 200);
    assert.ok(restorePayload.monsterVisualConfig.draft.effect, 'restored draft carries effect sub-document');
    assert.ok(restorePayload.monsterVisualConfig.draft.effect.catalog, 'restored draft effect.catalog present');
    assert.ok(restorePayload.monsterVisualConfig.draft.effect.bindings, 'restored draft effect.bindings present');
    assert.equal(restorePayload.monsterVisualConfig.draft.assets['vellhorn-b1-3'].baseline.facing, 'left',
      'restored draft visual reverted to version 1');
  } finally {
    server.close();
  }
});
