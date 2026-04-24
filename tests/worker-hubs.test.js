import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../src/subjects/spelling/data/content-data.js';
import { coreOnlyVersionOneContent } from './helpers/spelling-content.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function seedAdultAccount(server, {
  id,
  email,
  displayName,
  platformRole = 'parent',
  provider = null,
  providerSubject = null,
  now = 1,
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, ?, ?, NULL, ?, ?, 0)
  `).run(id, email, displayName, platformRole, now, now);

  if (provider) {
    server.DB.db.prepare(`
      INSERT INTO account_identities (id, account_id, provider, provider_subject, email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`identity-${id}-${provider}`, id, provider, providerSubject || id, email, now, now);
  }
}

async function seedLearnerData(server, accountId, platformRole = 'parent') {
  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    authSession: server.authSessionFor(accountId, { platformRole }),
  });
  await repositories.hydrate();
  repositories.learners.write({
    byId: {
      'learner-a': {
        id: 'learner-a',
        name: 'Ava',
        yearGroup: 'Y5',
        goal: 'sats',
        dailyMinutes: 15,
        avatarColor: '#3E6FA8',
        createdAt: 1,
      },
    },
    allIds: ['learner-a'],
    selectedId: 'learner-a',
  });
  repositories.subjectStates.writeData('learner-a', 'spelling', {
    prefs: { mode: 'smart' },
    progress: {
      possess: { stage: 4, attempts: 4, correct: 4, wrong: 0, dueDay: 999999, lastDay: 10, lastResult: true },
      bicycle: { stage: 1, attempts: 3, correct: 1, wrong: 2, dueDay: 0, lastDay: 11, lastResult: false },
    },
  });
  repositories.practiceSessions.write({
    id: 'sess-parent',
    learnerId: 'learner-a',
    subjectId: 'spelling',
    sessionKind: 'learning',
    status: 'completed',
    sessionState: null,
    summary: {
      label: 'Smart review',
      cards: [{ label: 'Correct', value: '6/8' }],
      mistakes: [
        { slug: 'bicycle', word: 'bicycle', family: 'cycle', year: '5-6', yearLabel: 'Years 5-6', familyWords: [] },
      ],
    },
    createdAt: 10,
    updatedAt: 20,
  });
  repositories.eventLog.append({
    id: 'retry-parent',
    type: 'spelling.retry-cleared',
    subjectId: 'spelling',
    learnerId: 'learner-a',
    family: 'cycle',
    yearBand: '5-6',
    createdAt: 30,
  });
  await repositories.flush();
}

test('worker parent hub allows parent or admin platform roles with readable learner membership', async () => {
  const server = createWorkerRepositoryServer();
  await seedLearnerData(server, 'adult-parent', 'parent');

  const allowedResponse = await server.fetchAs('adult-parent', 'https://repo.test/api/hubs/parent?learnerId=learner-a', {}, {
    'x-ks2-dev-platform-role': 'parent',
  });
  const allowedPayload = await allowedResponse.json();

  assert.equal(allowedResponse.status, 200);
  assert.equal(allowedPayload.parentHub.permissions.canViewParentHub, true);
  assert.equal(allowedPayload.parentHub.learnerOverview.dueWords, 1);
  assert.ok(allowedPayload.parentHub.misconceptionPatterns.some((entry) => /cycle/i.test(entry.label)));

  const adminResponse = await server.fetchAs('adult-parent', 'https://repo.test/api/hubs/parent?learnerId=learner-a', {}, {
    'x-ks2-dev-platform-role': 'admin',
  });
  const adminPayload = await adminResponse.json();
  assert.equal(adminResponse.status, 200);
  assert.equal(adminPayload.parentHub.permissions.canViewParentHub, true);
  assert.equal(adminPayload.parentHub.permissions.platformRole, 'admin');

  server.close();
});

test('worker hubs supplement operator legacy core-only content with seeded runtime additions', async () => {
  const server = createWorkerRepositoryServer();
  try {
    await seedLearnerData(server, 'adult-parent', 'admin');

    const initialResponse = await server.fetchAs('adult-parent', 'https://repo.test/api/content/spelling', {}, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const initial = await initialResponse.json();
    const legacy = coreOnlyVersionOneContent(initial.content);
    const requestId = 'legacy-core-content-runtime-1';
    const writeResponse = await server.fetchAs('adult-parent', 'https://repo.test/api/content/spelling', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: legacy,
        mutation: {
          requestId,
          correlationId: requestId,
          expectedAccountRevision: initial.mutation.accountRevision,
        },
      }),
    }, {
      'x-ks2-dev-platform-role': 'admin',
    });
    const written = await writeResponse.json();
    assert.equal(writeResponse.status, 200);
    assert.equal(written.content.publication.publishedVersion, 1);
    assert.equal(written.content.releases[0].snapshot.words.some((word) => word.spellingPool === 'extra'), false);

    const hubResponse = await server.fetchAs('adult-parent', 'https://repo.test/api/hubs/parent?learnerId=learner-a');
    const hubPayload = await hubResponse.json();

    assert.equal(hubResponse.status, 200);
    assert.equal(
      hubPayload.parentHub.progressSnapshots[0].totalPublishedWords,
      SEEDED_SPELLING_CONTENT_BUNDLE.releases.at(-1).snapshot.words.length,
    );
  } finally {
    server.close();
  }
});

test('worker admin account roles are listed and assignable by admins only', async () => {
  const server = createWorkerRepositoryServer();
  seedAdultAccount(server, {
    id: 'adult-admin',
    email: 'fol2hk@gmail.com',
    displayName: 'James',
    platformRole: 'admin',
    provider: 'google',
    providerSubject: 'google-james',
  });
  seedAdultAccount(server, {
    id: 'adult-parent',
    email: 'parent@example.com',
    displayName: 'Parent',
    platformRole: 'parent',
    provider: 'google',
    providerSubject: 'google-parent',
  });
  seedAdultAccount(server, {
    id: 'adult-ops',
    email: 'ops@example.com',
    displayName: 'Ops',
    platformRole: 'ops',
  });
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, account_type, demo_expires_at
    )
    VALUES ('demo-role-target', NULL, 'Demo Visitor', 'parent', NULL, 1, 1, 'demo', ?)
  `).run(Date.now() + 60_000);

  const listResponse = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/accounts', {}, {
    'x-ks2-dev-platform-role': 'admin',
  });
  const listPayload = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(listPayload.currentAccount.platformRole, 'admin');
  assert.ok(listPayload.accounts.some((account) => (
    account.id === 'adult-admin'
    && account.email === 'fol2hk@gmail.com'
    && account.platformRole === 'admin'
    && account.providers.includes('google')
  )));
  assert.equal(listPayload.accounts.some((account) => account.id === 'demo-role-target'), false);

  const deniedList = await server.fetchAs('adult-ops', 'https://repo.test/api/admin/accounts', {}, {
    'x-ks2-dev-platform-role': 'ops',
  });
  const deniedListPayload = await deniedList.json();
  assert.equal(deniedList.status, 403);
  assert.equal(deniedListPayload.code, 'account_roles_forbidden');

  const updateResponse = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/accounts/role', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accountId: 'adult-parent',
      platformRole: 'ops',
      requestId: 'role-change-1',
    }),
  }, {
    'x-ks2-dev-platform-role': 'admin',
  });
  const updatePayload = await updateResponse.json();
  assert.equal(updateResponse.status, 200);
  assert.equal(updatePayload.updatedAccount.platformRole, 'ops');
  assert.ok(updatePayload.accounts.some((account) => account.id === 'adult-parent' && account.platformRole === 'ops'));

  const storedRole = server.DB.db.prepare('SELECT platform_role FROM adult_accounts WHERE id = ?').get('adult-parent')?.platform_role;
  assert.equal(storedRole, 'ops');
  const receipt = server.DB.db.prepare('SELECT mutation_kind, scope_id FROM mutation_receipts WHERE request_id = ?').get('role-change-1');
  assert.equal(receipt?.mutation_kind, 'admin.account_role.update');
  assert.equal(receipt?.scope_id, 'adult-parent');

  const replayResponse = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/accounts/role', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accountId: 'adult-parent',
      platformRole: 'ops',
      requestId: 'role-change-1',
    }),
  }, {
    'x-ks2-dev-platform-role': 'admin',
  });
  const replayPayload = await replayResponse.json();
  assert.equal(replayResponse.status, 200);
  assert.equal(replayPayload.roleMutation.replayed, true);

  const demoUpdate = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/accounts/role', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accountId: 'demo-role-target',
      platformRole: 'admin',
      requestId: 'role-demo-blocked',
    }),
  }, {
    'x-ks2-dev-platform-role': 'admin',
  });
  const demoUpdatePayload = await demoUpdate.json();
  assert.equal(demoUpdate.status, 403);
  assert.equal(demoUpdatePayload.code, 'demo_account_role_forbidden');
  assert.equal(
    server.DB.db.prepare('SELECT platform_role FROM adult_accounts WHERE id = ?').get('demo-role-target')?.platform_role,
    'parent',
  );

  server.DB.db.prepare("UPDATE adult_accounts SET platform_role = 'admin' WHERE id = 'demo-role-target'").run();
  const demoAdminHub = await server.fetchAs('demo-role-target', 'https://repo.test/api/hubs/admin', {}, {
    'x-ks2-dev-platform-role': 'admin',
  });
  const demoAdminHubPayload = await demoAdminHub.json();
  assert.equal(demoAdminHub.status, 403);
  assert.equal(demoAdminHubPayload.code, 'admin_hub_forbidden');

  const deniedUpdate = await server.fetchAs('adult-ops', 'https://repo.test/api/admin/accounts/role', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accountId: 'adult-parent',
      platformRole: 'admin',
      requestId: 'role-change-denied',
    }),
  }, {
    'x-ks2-dev-platform-role': 'ops',
  });
  const deniedUpdatePayload = await deniedUpdate.json();
  assert.equal(deniedUpdate.status, 403);
  assert.equal(deniedUpdatePayload.code, 'account_roles_forbidden');

  server.close();
});

test('worker prevents demoting the last admin account', async () => {
  const server = createWorkerRepositoryServer();
  seedAdultAccount(server, {
    id: 'adult-admin',
    email: 'fol2hk@gmail.com',
    displayName: 'James',
    platformRole: 'admin',
    provider: 'google',
  });

  const blockedResponse = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/accounts/role', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accountId: 'adult-admin',
      platformRole: 'parent',
      requestId: 'role-demote-last-admin',
    }),
  }, {
    'x-ks2-dev-platform-role': 'admin',
  });
  const blockedPayload = await blockedResponse.json();
  assert.equal(blockedResponse.status, 409);
  assert.equal(blockedPayload.code, 'last_admin_required');
  assert.equal(
    server.DB.db.prepare('SELECT platform_role FROM adult_accounts WHERE id = ?').get('adult-admin')?.platform_role,
    'admin',
  );

  seedAdultAccount(server, {
    id: 'adult-admin-2',
    email: 'second-admin@example.com',
    displayName: 'Second Admin',
    platformRole: 'admin',
  });

  const allowedResponse = await server.fetchAs('adult-admin', 'https://repo.test/api/admin/accounts/role', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accountId: 'adult-admin',
      platformRole: 'parent',
      requestId: 'role-demote-with-backup-admin',
    }),
  }, {
    'x-ks2-dev-platform-role': 'admin',
  });
  const allowedPayload = await allowedResponse.json();
  assert.equal(allowedResponse.status, 200);
  assert.equal(allowedPayload.updatedAccount.platformRole, 'parent');

  server.close();
});

test('worker admin hub requires admin or operations role and exposes content plus audit summaries', async () => {
  const server = createWorkerRepositoryServer();
  await seedLearnerData(server, 'adult-admin', 'admin');
  const now = Date.now();
  server.DB.db.exec(`
    INSERT INTO demo_operation_metrics (metric_key, metric_count, updated_at)
    VALUES
      ('sessions_created', 6, ${now - 50}),
      ('active_sessions', 99, ${now - 40}),
      ('conversions', 2, ${now - 30}),
      ('cleanup_count', 1, ${now - 20}),
      ('rate_limit_blocks', 4, ${now - 10}),
      ('tts_fallbacks', 3, ${now});

    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, account_type, demo_expires_at)
    VALUES
      ('demo-active-a', NULL, 'Demo Active A', 'parent', NULL, 1, 1, 'demo', ${now + 60000}),
      ('demo-active-b', NULL, 'Demo Active B', 'parent', NULL, 1, 1, 'demo', ${now + 120000}),
      ('demo-expired', NULL, 'Demo Expired', 'parent', NULL, 1, 1, 'demo', ${now - 60000});
  `);

  const adminResponse = await server.fetchAs('adult-admin', 'https://repo.test/api/hubs/admin?learnerId=learner-a&auditLimit=10', {}, {
    'x-ks2-dev-platform-role': 'admin',
  });
  const adminPayload = await adminResponse.json();

  assert.equal(adminResponse.status, 200);
  assert.equal(adminPayload.adminHub.permissions.canViewAdminHub, true);
  assert.equal(adminPayload.adminHub.contentReleaseStatus.subjectId, 'spelling');
  assert.ok(adminPayload.adminHub.contentReleaseStatus.runtimeWordCount > 0);
  assert.ok(adminPayload.adminHub.auditLogLookup.entries.some((entry) => entry.mutationKind === 'learners.write'));
  assert.equal(adminPayload.adminHub.demoOperations.sessionsCreated, 6);
  assert.equal(adminPayload.adminHub.demoOperations.activeSessions, 2);
  assert.equal(adminPayload.adminHub.demoOperations.conversions, 2);
  assert.equal(adminPayload.adminHub.demoOperations.cleanupCount, 1);
  assert.equal(adminPayload.adminHub.demoOperations.rateLimitBlocks, 4);
  assert.equal(adminPayload.adminHub.demoOperations.ttsFallbacks, 3);
  assert.equal(adminPayload.adminHub.learnerSupport.accessibleLearners[0].learnerName, 'Ava');

  const parentDenied = await server.fetchAs('adult-admin', 'https://repo.test/api/hubs/admin', {}, {
    'x-ks2-dev-platform-role': 'parent',
  });
  const parentDeniedPayload = await parentDenied.json();
  assert.equal(parentDenied.status, 403);
  assert.equal(parentDeniedPayload.code, 'admin_hub_forbidden');

  server.close();
});

test('worker parent hub lists readable learners while preserving read-only access mode', async () => {
  const server = createWorkerRepositoryServer();
  await seedLearnerData(server, 'adult-owner', 'parent');

  const nowTs = Date.now();
  server.DB.db.exec(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES ('adult-viewer', 'viewer@example.test', 'Viewer', 'parent', NULL, ${nowTs}, ${nowTs}, 0);
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES ('adult-viewer', 'learner-a', 'viewer', 0, ${nowTs}, ${nowTs});
  `);

  const response = await server.fetchAs('adult-viewer', 'https://repo.test/api/hubs/parent', {}, {
    'x-ks2-dev-platform-role': 'parent',
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.learnerId, 'learner-a');
  assert.equal(payload.parentHub.permissions.membershipRole, 'viewer');
  assert.equal(payload.parentHub.permissions.canMutateLearnerData, false);
  assert.equal(payload.parentHub.permissions.accessModeLabel, 'Read-only learner');
  assert.equal(payload.parentHub.accessibleLearners.length, 1);
  assert.equal(payload.parentHub.accessibleLearners[0].learnerId, 'learner-a');
  assert.equal(payload.parentHub.accessibleLearners[0].writable, false);

  server.close();
});

test('worker admin hub marks viewer diagnostics as read-only', async () => {
  const server = createWorkerRepositoryServer();
  await seedLearnerData(server, 'adult-owner', 'parent');

  const nowTs = Date.now();
  server.DB.db.exec(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES ('adult-ops', 'ops@example.test', 'Ops', 'ops', NULL, ${nowTs}, ${nowTs}, 0);
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES ('adult-ops', 'learner-a', 'viewer', 0, ${nowTs}, ${nowTs});
  `);

  const response = await server.fetchAs('adult-ops', 'https://repo.test/api/hubs/admin', {}, {
    'x-ks2-dev-platform-role': 'ops',
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.adminHub.permissions.canViewAdminHub, true);
  assert.equal(payload.adminHub.permissions.canManageAccountRoles, false);
  assert.equal(payload.adminHub.learnerSupport.accessibleLearners[0].membershipRole, 'viewer');
  assert.equal(payload.adminHub.learnerSupport.accessibleLearners[0].writable, false);
  assert.equal(payload.adminHub.learnerSupport.accessibleLearners[0].accessModeLabel, 'Read-only learner');

  server.close();
});
