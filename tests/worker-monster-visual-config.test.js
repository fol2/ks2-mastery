import test from 'node:test';
import assert from 'node:assert/strict';

import { BUNDLED_MONSTER_VISUAL_CONFIG } from '../src/platform/game/monster-visual-config.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

async function json(response) {
  return response.json();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function raceBeforeStatementRun(db, predicate, onBeforeRun) {
  let triggered = false;
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      if (!predicate(String(sql || ''))) return statement;
      return {
        bind(...params) {
          const bound = statement.bind(...params);
          return {
            async run() {
              if (!triggered) {
                triggered = true;
                await onBeforeRun({ sql, params });
              }
              return bound.run();
            },
            first: (...args) => bound.first(...args),
            all: (...args) => bound.all(...args),
          };
        },
      };
    },
    batch: (...args) => db.batch(...args),
    exec: (...args) => db.exec(...args),
  };
}

function insertMonsterVisualConfigRow(db, {
  draft = BUNDLED_MONSTER_VISUAL_CONFIG,
  published = BUNDLED_MONSTER_VISUAL_CONFIG,
  draftRevision = 0,
  publishedVersion = 1,
  now = Date.UTC(2026, 3, 24, 12, 0),
  actorAccountId = 'system',
} = {}) {
  db.db.prepare(`
    INSERT INTO platform_monster_visual_config (
      id,
      draft_json,
      draft_revision,
      draft_updated_at,
      draft_updated_by_account_id,
      published_json,
      published_version,
      published_at,
      published_by_account_id,
      manifest_hash,
      schema_version
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'global',
    JSON.stringify({ ...clone(draft), source: 'draft' }),
    draftRevision,
    now,
    actorAccountId,
    JSON.stringify({ ...clone(published), source: 'published', version: publishedVersion }),
    publishedVersion,
    now,
    actorAccountId,
    BUNDLED_MONSTER_VISUAL_CONFIG.manifestHash,
    1,
  );
}

function raceMonsterVisualConfigRow(db, {
  draft = BUNDLED_MONSTER_VISUAL_CONFIG,
  published = BUNDLED_MONSTER_VISUAL_CONFIG,
  draftRevision = 1,
  publishedVersion = 1,
  now = Date.UTC(2026, 3, 24, 12, 0),
  actorAccountId = 'adult-admin',
} = {}) {
  db.db.prepare(`
    UPDATE platform_monster_visual_config
    SET draft_json = ?,
        draft_revision = ?,
        draft_updated_at = ?,
        draft_updated_by_account_id = ?,
        published_json = ?,
        published_version = ?,
        published_at = ?,
        published_by_account_id = ?,
        manifest_hash = ?,
        schema_version = ?
    WHERE id = ?
  `).run(
    JSON.stringify({ ...clone(draft), source: 'draft' }),
    draftRevision,
    now,
    actorAccountId,
    JSON.stringify({ ...clone(published), source: 'published', version: publishedVersion }),
    publishedVersion,
    now,
    actorAccountId,
    BUNDLED_MONSTER_VISUAL_CONFIG.manifestHash,
    1,
    'global',
  );
}

async function fetchAdmin(server, path, init = {}) {
  return server.fetchAs('adult-admin', `https://repo.test${path}`, init, {
    'x-ks2-dev-platform-role': 'admin',
  });
}

async function adminHub(server, accountId = 'adult-admin', role = 'admin') {
  const response = await server.fetchAs(accountId, 'https://repo.test/api/hubs/admin', {}, {
    'x-ks2-dev-platform-role': role,
  });
  assert.equal(response.status, 200);
  return json(response);
}

test('admin hub exposes seeded global monster visual config state', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const payload = await adminHub(server);
    const visual = payload.adminHub.monsterVisualConfig;

    assert.equal(visual.permissions.canManageMonsterVisualConfig, true);
    assert.equal(visual.status.publishedVersion, 1);
    assert.equal(visual.status.draftRevision, 0);
    assert.equal(visual.status.validation.ok, true);
    assert.equal(visual.draft.assets['vellhorn-b1-3'].baseline.facing, 'left');
    assert.equal(visual.published.assets['vellhorn-b1-3'].baseline.facing, 'left');
    assert.equal(visual.versions.length, 1);
  } finally {
    server.close();
  }
});

test('bootstrap tolerates a concurrent singleton row insert', async () => {
  const server = createWorkerRepositoryServer();
  try {
    server.env.DB = raceBeforeStatementRun(
      server.DB,
      sql => /INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+platform_monster_visual_config\s*\(/i.test(sql),
      () => insertMonsterVisualConfigRow(server.DB),
    );

    const response = await fetchAdmin(server, '/api/bootstrap');
    const payload = await json(response);

    assert.equal(response.status, 200);
    assert.equal(payload.monsterVisualConfig.publishedVersion, 1);
    assert.equal(payload.monsterVisualConfig.config.assets['vellhorn-b1-3'].baseline.facing, 'left');
  } finally {
    server.close();
  }
});

test('bootstrap falls back to bundled monster visuals when config storage is unavailable', async () => {
  const server = createWorkerRepositoryServer();
  try {
    server.DB.db.exec('DROP TABLE platform_monster_visual_config;');

    const response = await fetchAdmin(server, '/api/bootstrap');
    const payload = await json(response);

    assert.equal(response.status, 200);
    assert.equal(payload.monsterVisualConfig.publishedVersion, 0);
    assert.equal(payload.monsterVisualConfig.config.assets['vellhorn-b1-3'].baseline.facing, 'left');
  } finally {
    server.close();
  }
});

test('ops can inspect monster visual config but cannot mutate it', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const payload = await adminHub(server, 'adult-ops', 'ops');
    assert.equal(payload.adminHub.monsterVisualConfig.permissions.canManageMonsterVisualConfig, false);

    const denied = await server.fetchAs('adult-ops', 'https://repo.test/api/admin/monster-visual-config/draft', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draft: payload.adminHub.monsterVisualConfig.draft,
        mutation: {
          requestId: 'ops-visual-save-1',
          expectedDraftRevision: payload.adminHub.monsterVisualConfig.status.draftRevision,
        },
      }),
    }, {
      'x-ks2-dev-platform-role': 'ops',
    });
    const deniedPayload = await denied.json();

    assert.equal(denied.status, 403);
    assert.equal(deniedPayload.code, 'monster_visual_config_forbidden');
  } finally {
    server.close();
  }
});

test('monster visual draft save rolls back when the mutation receipt cannot be stored', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const initial = (await adminHub(server)).adminHub.monsterVisualConfig;
    const draft = clone(initial.draft);
    draft.assets['vellhorn-b1-3'].baseline.facing = 'right';
    const body = {
      draft,
      mutation: {
        requestId: 'visual-receipt-rollback-save',
        expectedDraftRevision: initial.status.draftRevision,
      },
    };

    server.env.DB = raceBeforeStatementRun(
      server.DB,
      sql => /INSERT\s+INTO\s+mutation_receipts/i.test(sql),
      () => {
        throw new Error('receipt storage unavailable');
      },
    );

    const failedSave = await fetchAdmin(server, '/api/admin/monster-visual-config/draft', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(failedSave.status, 500);

    const afterFailure = (await adminHub(server)).adminHub.monsterVisualConfig;
    assert.equal(afterFailure.status.draftRevision, 0);
    assert.equal(afterFailure.draft.assets['vellhorn-b1-3'].baseline.facing, 'left');
    assert.equal(
      server.DB.db.prepare('SELECT COUNT(*) AS count FROM mutation_receipts WHERE request_id = ?').get(body.mutation.requestId).count,
      0,
    );

    const retry = await fetchAdmin(server, '/api/admin/monster-visual-config/draft', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const retryPayload = await json(retry);

    assert.equal(retry.status, 200);
    assert.equal(retryPayload.monsterVisualConfig.status.draftRevision, 1);
    assert.equal(retryPayload.monsterVisualConfig.draft.assets['vellhorn-b1-3'].baseline.facing, 'right');
  } finally {
    server.close();
  }
});

test('admin saves, publishes, and restores global monster visual config with receipts', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const initial = (await adminHub(server)).adminHub.monsterVisualConfig;
    const draft = clone(initial.draft);
    draft.assets['vellhorn-b1-3'].baseline.facing = 'right';

    const saveResponse = await fetchAdmin(server, '/api/admin/monster-visual-config/draft', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draft,
        mutation: {
          requestId: 'visual-save-1',
          expectedDraftRevision: initial.status.draftRevision,
        },
      }),
    });
    const savePayload = await json(saveResponse);
    assert.equal(saveResponse.status, 200);
    assert.equal(savePayload.monsterVisualConfig.status.draftRevision, 1);
    assert.equal(savePayload.monsterVisualConfig.draft.assets['vellhorn-b1-3'].baseline.facing, 'right');

    const publishResponse = await fetchAdmin(server, '/api/admin/monster-visual-config/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mutation: {
          requestId: 'visual-publish-1',
          expectedDraftRevision: savePayload.monsterVisualConfig.status.draftRevision,
        },
      }),
    });
    const publishPayload = await json(publishResponse);
    assert.equal(publishResponse.status, 200);
    assert.equal(publishPayload.monsterVisualConfig.status.publishedVersion, 2);
    assert.equal(publishPayload.monsterVisualConfig.status.draftRevision, 2);
    assert.equal(publishPayload.monsterVisualConfig.published.assets['vellhorn-b1-3'].baseline.facing, 'right');
    const publishedVersion = server.DB.db.prepare('SELECT config_json FROM platform_monster_visual_config_versions WHERE version = ?').get(2);
    assert.equal(JSON.parse(publishedVersion.config_json).assets['vellhorn-b1-3'].baseline.facing, 'right');

    const bootstrapResponse = await fetchAdmin(server, '/api/bootstrap');
    const bootstrapPayload = await json(bootstrapResponse);
    assert.equal(bootstrapResponse.status, 200);
    assert.equal(bootstrapPayload.monsterVisualConfig.publishedVersion, 2);
    assert.equal(bootstrapPayload.monsterVisualConfig.config.assets['vellhorn-b1-3'].baseline.facing, 'right');

    const restoreResponse = await fetchAdmin(server, '/api/admin/monster-visual-config/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        version: 1,
        mutation: {
          requestId: 'visual-restore-1',
          expectedDraftRevision: publishPayload.monsterVisualConfig.status.draftRevision,
        },
      }),
    });
    const restorePayload = await json(restoreResponse);
    assert.equal(restoreResponse.status, 200);
    assert.equal(restorePayload.monsterVisualConfig.status.draftRevision, 3);
    assert.equal(restorePayload.monsterVisualConfig.draft.assets['vellhorn-b1-3'].baseline.facing, 'left');
    assert.equal(restorePayload.monsterVisualConfig.published.assets['vellhorn-b1-3'].baseline.facing, 'right');

    const receipt = server.DB.db.prepare('SELECT mutation_kind, scope_type, scope_id FROM mutation_receipts WHERE request_id = ?').get('visual-publish-1');
    assert.equal(receipt.mutation_kind, 'monster_visual_config.publish');
    assert.equal(receipt.scope_type, 'platform');
    assert.equal(receipt.scope_id, 'monster-visual-config');
  } finally {
    server.close();
  }
});

test('restore rejects invalid monster visual version payloads', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const initial = (await adminHub(server)).adminHub.monsterVisualConfig;
    const response = await fetchAdmin(server, '/api/admin/monster-visual-config/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        version: 'not-a-version',
        mutation: {
          requestId: 'visual-restore-invalid-version',
          expectedDraftRevision: initial.status.draftRevision,
        },
      }),
    });
    const payload = await json(response);

    assert.equal(response.status, 400);
    assert.equal(payload.code, 'monster_visual_version_invalid');

    const after = (await adminHub(server)).adminHub.monsterVisualConfig;
    assert.equal(after.status.draftRevision, initial.status.draftRevision);
  } finally {
    server.close();
  }
});

test('publish blocks incomplete review state without changing the live published config', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const initial = (await adminHub(server)).adminHub.monsterVisualConfig;
    const draft = clone(BUNDLED_MONSTER_VISUAL_CONFIG);
    draft.reviewedAt = 0;
    draft.assets['vellhorn-b1-3'].review.contexts.codexFeature.reviewed = false;

    const saveResponse = await fetchAdmin(server, '/api/admin/monster-visual-config/draft', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draft,
        mutation: {
          requestId: 'visual-invalid-save-1',
          expectedDraftRevision: initial.status.draftRevision,
        },
      }),
    });
    const savePayload = await json(saveResponse);
    assert.equal(saveResponse.status, 200);

    const publishResponse = await fetchAdmin(server, '/api/admin/monster-visual-config/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mutation: {
          requestId: 'visual-invalid-publish-1',
          expectedDraftRevision: savePayload.monsterVisualConfig.status.draftRevision,
        },
      }),
    });
    const publishPayload = await json(publishResponse);

    assert.equal(publishResponse.status, 400);
    assert.equal(publishPayload.code, 'monster_visual_publish_blocked');
    assert.ok(publishPayload.validation.errors.some((issue) => (
      issue.code === 'monster_visual_review_required'
      && issue.assetKey === 'vellhorn-b1-3'
      && issue.context === 'codexFeature'
    )));

    const after = (await adminHub(server)).adminHub.monsterVisualConfig;
    assert.equal(after.status.publishedVersion, 1);
    assert.equal(after.published.assets['vellhorn-b1-3'].baseline.facing, 'left');
  } finally {
    server.close();
  }
});

test('concurrent monster visual draft saves reject stale draft revisions', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const initial = (await adminHub(server)).adminHub.monsterVisualConfig;
    const firstDraft = clone(initial.draft);
    firstDraft.assets['vellhorn-b1-3'].baseline.facing = 'right';
    const secondDraft = clone(initial.draft);
    secondDraft.assets['vellhorn-b1-2'].baseline.facing = 'right';

    const firstSave = await fetchAdmin(server, '/api/admin/monster-visual-config/draft', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draft: firstDraft,
        mutation: {
          requestId: 'visual-stale-first',
          expectedDraftRevision: initial.status.draftRevision,
        },
      }),
    });
    assert.equal(firstSave.status, 200);

    const staleSave = await fetchAdmin(server, '/api/admin/monster-visual-config/draft', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draft: secondDraft,
        mutation: {
          requestId: 'visual-stale-second',
          expectedDraftRevision: initial.status.draftRevision,
        },
      }),
    });
    const stalePayload = await json(staleSave);

    assert.equal(staleSave.status, 409);
    assert.equal(stalePayload.code, 'stale_write');
    assert.equal(stalePayload.expectedRevision, 0);
    assert.equal(stalePayload.currentRevision, 1);
  } finally {
    server.close();
  }
});

test('draft save revision guard stays atomic without a transaction feature flag', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const initial = (await adminHub(server)).adminHub.monsterVisualConfig;
    const requestedDraft = clone(initial.draft);
    requestedDraft.assets['vellhorn-b1-3'].baseline.facing = 'right';
    const racingDraft = clone(initial.draft);
    racingDraft.assets['vellhorn-b1-2'].baseline.facing = 'right';

    server.env.DB = raceBeforeStatementRun(
      server.DB,
      sql => /UPDATE\s+platform_monster_visual_config/i.test(sql) && !/published_json/i.test(sql),
      () => raceMonsterVisualConfigRow(server.DB, {
        draft: racingDraft,
        published: initial.published,
        draftRevision: 1,
        publishedVersion: 1,
      }),
    );

    const staleSave = await fetchAdmin(server, '/api/admin/monster-visual-config/draft', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draft: requestedDraft,
        mutation: {
          requestId: 'visual-atomic-save-race',
          expectedDraftRevision: initial.status.draftRevision,
        },
      }),
    });
    const stalePayload = await json(staleSave);

    assert.equal(staleSave.status, 409);
    assert.equal(stalePayload.code, 'stale_write');
    assert.equal(stalePayload.expectedRevision, 0);
    assert.equal(stalePayload.currentRevision, 1);

    const after = (await adminHub(server)).adminHub.monsterVisualConfig;
    assert.equal(after.status.draftRevision, 1);
    assert.equal(after.draft.assets['vellhorn-b1-2'].baseline.facing, 'right');
    assert.equal(after.draft.assets['vellhorn-b1-3'].baseline.facing, 'left');
  } finally {
    server.close();
  }
});

test('publish keeps live state and version history atomic without a transaction feature flag', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const initial = (await adminHub(server)).adminHub.monsterVisualConfig;
    const requestedDraft = clone(initial.draft);
    requestedDraft.assets['vellhorn-b1-3'].baseline.facing = 'right';

    const saveResponse = await fetchAdmin(server, '/api/admin/monster-visual-config/draft', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draft: requestedDraft,
        mutation: {
          requestId: 'visual-atomic-publish-save',
          expectedDraftRevision: initial.status.draftRevision,
        },
      }),
    });
    const savePayload = await json(saveResponse);
    assert.equal(saveResponse.status, 200);

    const racingPublished = clone(initial.published);
    racingPublished.assets['vellhorn-b1-2'].baseline.facing = 'right';
    server.env.DB = raceBeforeStatementRun(
      server.DB,
      sql => /UPDATE\s+platform_monster_visual_config/i.test(sql) && /published_json/i.test(sql),
      () => raceMonsterVisualConfigRow(server.DB, {
        draft: { ...clone(racingPublished), source: 'draft' },
        published: racingPublished,
        draftRevision: 2,
        publishedVersion: 2,
      }),
    );

    const stalePublish = await fetchAdmin(server, '/api/admin/monster-visual-config/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mutation: {
          requestId: 'visual-atomic-publish-race',
          expectedDraftRevision: savePayload.monsterVisualConfig.status.draftRevision,
        },
      }),
    });
    const stalePayload = await json(stalePublish);

    assert.equal(stalePublish.status, 409);
    assert.equal(stalePayload.code, 'stale_write');
    assert.equal(stalePayload.expectedRevision, 1);
    assert.equal(stalePayload.currentRevision, 2);

    const after = (await adminHub(server)).adminHub.monsterVisualConfig;
    assert.equal(after.status.draftRevision, 2);
    assert.equal(after.status.publishedVersion, 2);
    assert.equal(after.published.assets['vellhorn-b1-2'].baseline.facing, 'right');
    assert.equal(after.published.assets['vellhorn-b1-3'].baseline.facing, 'left');
    assert.equal(after.versions.filter(version => version.version === 2).length, 1);
  } finally {
    server.close();
  }
});
