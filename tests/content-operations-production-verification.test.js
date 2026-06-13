import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  EXIT_USAGE,
  parseArgs,
  runCli,
  runContentOperationsProductionVerification,
} from '../scripts/verify-content-operations-production.mjs';

function jsonResponse(payload, init = {}) {
  const status = Number(init.status) || 200;
  const headers = new Headers({
    'content-type': 'application/json',
    ...(init.headers || {}),
  });
  return new Response(JSON.stringify(payload), {
    status,
    headers,
  });
}

const release = {
  releaseId: 'rel-global-31',
  subjectId: 'spelling',
  status: 'published',
  snapshotHash: 'hash-rel-31',
  packageId: 'pkg-31',
  publishedAt: Date.UTC(2026, 5, 12, 9, 0, 0),
  history: {
    productionProof: {
      status: 'missing',
      requiredSurfaces: [
        { key: 'spellingSetup', label: 'Spelling setup' },
        { key: 'wordBank', label: 'Word Bank' },
        { key: 'heroCodex', label: 'Hero / Codex' },
        { key: 'monsterRendering', label: 'Monster rendering' },
      ],
      linkedSurfaces: [],
      missingSurfaces: [
        { key: 'spellingSetup', label: 'Spelling setup' },
        { key: 'wordBank', label: 'Word Bank' },
        { key: 'heroCodex', label: 'Hero / Codex' },
        { key: 'monsterRendering', label: 'Monster rendering' },
      ],
    },
    assetChanges: {
      referenceCount: 1,
      uploadCount: 1,
    },
  },
  snapshot: {
    draft: {
      words: [{ slug: 'accident', word: 'accident' }],
    },
  },
};

function installContentOperationsFetch({
  releaseId = release.releaseId,
  snapshotHash = release.snapshotHash,
  contentReleaseId = releaseId,
  contentSnapshotHash = snapshotHash,
  captureLinkedSurfaces = ['spellingSetup', 'wordBank', 'heroCodex', 'monsterRendering'],
  captureMissingSurfaces = [],
  captureRequiredSurfaces = ['spellingSetup', 'wordBank', 'heroCodex', 'monsterRendering'],
  captureProofStatus = 'recorded',
  captureStatus = 200,
  bootstrapMonsterVisualConfig = null,
} = {}) {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const pathname = url.pathname;
    calls.push({
      pathname,
      search: url.search,
      method: init.method || 'GET',
      body: init.body ? JSON.parse(String(init.body)) : null,
      cookie: init.headers?.cookie || init.headers?.Cookie || '',
    });

    if (pathname === '/api/admin/content-operations/subjects/spelling/overview') {
      return jsonResponse({
        ok: true,
        overview: {
          latestRelease: { ...release, releaseId, snapshotHash, snapshot: undefined },
          lanes: { recentReleases: [{ ...release, releaseId, snapshotHash, snapshot: undefined }] },
          actor: {
            accountId: 'admin-a',
            capabilities: {
              'content_operations.view': true,
              'content_operations.publish': true,
            },
          },
        },
      });
    }
    if (pathname === '/api/admin/content-operations/subjects/spelling/releases') {
      return jsonResponse({
        ok: true,
        releases: [{ ...release, releaseId, snapshotHash, snapshot: undefined }],
      });
    }
    if (pathname === `/api/admin/content-operations/subjects/spelling/releases/${releaseId}`) {
      return jsonResponse({
        ok: true,
        release: { ...release, releaseId, snapshotHash },
      });
    }
    if (pathname === `/api/admin/content-operations/subjects/spelling/releases/${releaseId}/proof`) {
      if (captureStatus !== 200) {
        return jsonResponse({ ok: false, code: 'proof_capture_failed' }, { status: captureStatus });
      }
      return jsonResponse({
        ok: true,
        release: {
          ...release,
          releaseId,
          snapshotHash,
          history: {
            ...release.history,
            productionProof: {
              status: captureProofStatus,
              requiredSurfaces: captureRequiredSurfaces.map((key) => ({ key, label: key })),
              linkedSurfaces: captureLinkedSurfaces.map((key) => ({ key, label: key })),
              missingSurfaces: captureMissingSurfaces.map((key) => ({ key, label: key })),
            },
          },
        },
      });
    }
    if (pathname === '/api/content/spelling') {
      return jsonResponse({
        ok: true,
        content: { draft: { words: [{ slug: 'accident', word: 'accident' }] } },
        compatibility: {
          source: 'content_operation_release',
          releaseId: contentReleaseId,
          snapshotHash: contentSnapshotHash,
          legacyWriteDisabled: true,
        },
      });
    }
    if (pathname === '/api/demo/session') {
      return jsonResponse({
        ok: true,
        session: {
          demo: true,
          accountId: 'demo-account',
          learnerId: 'learner-demo',
        },
      }, {
        status: 201,
        headers: { 'set-cookie': 'ks2_session=demo-cookie; Path=/; HttpOnly' },
      });
    }
    if (pathname === '/api/bootstrap') {
      return jsonResponse({
        ok: true,
        session: { demo: true, accountId: 'demo-account' },
        learners: {
          selectedId: 'learner-demo',
          byId: { 'learner-demo': { stateRevision: 7 } },
        },
        subjectExposureGates: { spelling: true },
        subjects: { spelling: { state: {}, readModel: {} } },
        monsterVisualConfig: bootstrapMonsterVisualConfig || {
          publishedVersion: 2,
          compact: true,
          config: {
            runtimeAssetReferences: {
              byAssetKey: {
                'inklet-b1-0': {
                  src: '/api/content-operations/assets/monster-image/rel-global-31/ref',
                },
              },
            },
          },
          runtimeAssetReferences: {
            byAssetKey: {
              'inklet-b1-0': {
                src: '/api/content-operations/assets/monster-image/rel-global-31/ref',
              },
            },
          },
        },
      });
    }
    if (pathname === '/api/subjects/spelling/word-bank') {
      return jsonResponse({
        ok: true,
        wordBank: {
          learnerId: 'learner-demo',
          analytics: {
            wordBank: { returnedRows: 1 },
            wordGroups: [{ words: [{ slug: 'accident', title: 'accident' }] }],
          },
        },
      });
    }
    if (pathname === '/api/hero/read-model') {
      return jsonResponse({
        ok: true,
        hero: {
          mode: 'shadow',
          version: 3,
          childVisible: false,
        },
      });
    }
    return jsonResponse({ ok: false, error: `unexpected ${pathname}` }, { status: 500 });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = previousFetch;
    },
  };
}

test('parseArgs supports release, capture, output, cookie, and surface aliases', () => {
  const options = parseArgs([
    '--origin', 'https://preview.example.test',
    '--release-id', 'rel-a',
    '--capture-proof',
    '--out', 'reports/content-ops/proof.json',
    '--audio-proof', 'reports/content-ops/audio-proof.json',
    '--cookie', 'ks2_session=abc',
    '--surfaces', 'setup,word-bank,hero,monster',
    '--timeout-ms', '1234',
    '--json',
  ]);
  assert.equal(options.origin, 'https://preview.example.test');
  assert.equal(options.releaseId, 'rel-a');
  assert.equal(options.captureProof, true);
  assert.equal(options.outPath, 'reports/content-ops/proof.json');
  assert.equal(options.audioProofPath, 'reports/content-ops/audio-proof.json');
  assert.deepEqual(options.surfaces, ['spellingSetup', 'wordBank', 'heroCodex', 'monsterRendering']);
  assert.equal(options.timeoutMs, 1234);
  assert.equal(options.json, true);
});

test('runContentOperationsProductionVerification captures release proof and writes evidence', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'content-ops-proof-'));
  const outputPath = path.join(tmp, 'proof.json');
  const audioProofPath = path.join(tmp, 'audio-proof.json');
  await writeFile(audioProofPath, JSON.stringify({
    ok: true,
    proofType: 'spelling-audio-production',
    source: 'verify-spelling-audio-production',
    generatedAt: '2026-06-12T09:03:00.000Z',
    origin: 'https://repo.test',
    productionProof: {
      surfaces: {
        wordBank: {
          probes: { total: 3, failed: 0, word: 1, sentence: 1, crossAccount: 1 },
          crossAccount: { ok: true, voice: 'female' },
        },
      },
    },
  }), 'utf8');
  const installed = installContentOperationsFetch();
  try {
    const result = await runContentOperationsProductionVerification({
      origin: 'https://repo.test',
      cookie: 'ks2_session=admin-cookie',
      captureProof: true,
      outPath: outputPath,
      audioProofPath,
      timeoutMs: 1000,
    }, { env: {} });
    assert.equal(result.exitCode, 0);
    assert.equal(result.evidence.release.releaseId, release.releaseId);
    assert.deepEqual(Object.keys(result.evidence.productionProof.surfaces).sort(), [
      'heroCodex',
      'monsterRendering',
      'spellingSetup',
      'wordBank',
    ].sort());
    assert.equal(result.evidence.captureResult.productionProofStatus, 'recorded');
    assert.equal(
      result.evidence.productionProof.surfaces.wordBank.checks.audioProof.evidencePath,
      audioProofPath,
    );
    assert.ok(installed.calls.some((call) => call.pathname.endsWith('/proof') && call.method === 'POST'));
    const written = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(written.ok, true);
    assert.equal(JSON.stringify(written).includes('admin-cookie'), false);
  } finally {
    installed.restore();
    await rm(tmp, { recursive: true, force: true });
  }
});

test('runContentOperationsProductionVerification rejects partial proof capture', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'content-ops-proof-partial-capture-'));
  const outputPath = path.join(tmp, 'proof.json');
  const installed = installContentOperationsFetch({
    captureProofStatus: 'partial',
    captureLinkedSurfaces: ['spellingSetup', 'wordBank'],
    captureMissingSurfaces: ['heroCodex', 'monsterRendering'],
  });
  try {
    await assert.rejects(
      () => runContentOperationsProductionVerification({
        origin: 'https://repo.test',
        cookie: 'ks2_session=admin-cookie',
        captureProof: true,
        outPath: outputPath,
        timeoutMs: 1000,
        surfaces: ['spellingSetup', 'wordBank'],
      }, { env: {} }),
      /remained partial/,
    );
    const written = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(written.captureResult, null);
  } finally {
    installed.restore();
    await rm(tmp, { recursive: true, force: true });
  }
});

test('runContentOperationsProductionVerification writes pre-capture evidence when proof capture fails', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'content-ops-proof-failed-capture-'));
  const outputPath = path.join(tmp, 'proof.json');
  const installed = installContentOperationsFetch({ captureStatus: 503 });
  try {
    await assert.rejects(
      () => runContentOperationsProductionVerification({
        origin: 'https://repo.test',
        cookie: 'ks2_session=admin-cookie',
        captureProof: true,
        outPath: outputPath,
        timeoutMs: 1000,
      }, { env: {} }),
      /proof capture failed/i,
    );
    const written = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(written.ok, true);
    assert.equal(written.captureResult, null);
    assert.equal(written.productionProof.surfaces.wordBank.ok, true);
  } finally {
    installed.restore();
    await rm(tmp, { recursive: true, force: true });
  }
});

test('runContentOperationsProductionVerification accepts nested runtime asset references', async () => {
  const installed = installContentOperationsFetch({
    bootstrapMonsterVisualConfig: {
      publishedVersion: 2,
      compact: true,
      config: {
        runtimeAssetReferences: {
          byAssetKey: {
            'inklet-b1-0': {
              src: '/api/content-operations/assets/monster-image/rel-global-31/ref',
            },
          },
        },
      },
    },
  });
  try {
    const result = await runContentOperationsProductionVerification({
      origin: 'https://repo.test',
      cookie: 'ks2_session=admin-cookie',
      timeoutMs: 1000,
      surfaces: ['monsterRendering'],
    }, { env: {} });
    assert.equal(result.exitCode, 0);
    assert.equal(
      result.evidence.productionProof.surfaces.monsterRendering.checks.runtimeAssetReferenceCount,
      1,
    );
  } finally {
    installed.restore();
  }
});

test('runContentOperationsProductionVerification rejects runtime release mismatches', async () => {
  const installed = installContentOperationsFetch({
    releaseId: release.releaseId,
    snapshotHash: release.snapshotHash,
    contentReleaseId: 'rel-other',
    contentSnapshotHash: 'hash-other',
  });
  try {
    await assert.rejects(
      () => runContentOperationsProductionVerification({
        origin: 'https://repo.test',
        cookie: 'ks2_session=admin-cookie',
        timeoutMs: 1000,
      }, { env: {} }),
      /release id does not match/,
    );
  } finally {
    installed.restore();
  }
});

test('runCli returns usage when capture proof lacks an output path', async () => {
  const previousError = console.error;
  console.error = () => {};
  try {
    const code = await runCli([
      '--origin', 'https://repo.test',
      '--cookie', 'ks2_session=admin-cookie',
      '--capture-proof',
    ], { env: {} });
    assert.equal(code, EXIT_USAGE);
  } finally {
    console.error = previousError;
  }
});
