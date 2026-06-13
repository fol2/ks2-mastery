import { test, expect } from '@playwright/test';

const RELEASE_ID = 'rel-global-31';

const release = {
  releaseId: RELEASE_ID,
  subjectId: 'spelling',
  status: 'published',
  snapshotHash: 'hash-rel-31',
  packageId: 'pkg-31',
  publishedAt: Date.UTC(2026, 5, 12, 9, 0, 0),
  publishedByAccountId: 'admin-publisher',
  history: {
    releaseId: RELEASE_ID,
    package: {
      packageId: 'pkg-31',
      title: 'Published operations proof',
      templateId: 'content-operations-proof',
      state: 'published',
    },
    approvedByAccountId: 'admin-reviewer',
    approvedAt: Date.UTC(2026, 5, 12, 8, 55, 0),
    publishedByAccountId: 'admin-publisher',
    publishedAt: Date.UTC(2026, 5, 12, 9, 0, 0),
    changedEntities: {
      operationCount: 2,
      entityCount: 2,
      entityTypes: [
        { entityType: 'spelling.word', operationCount: 1, entityCount: 1 },
        { entityType: 'spelling.rewardTrack', operationCount: 1, entityCount: 1 },
      ],
      actionCounts: { set: 2 },
      fieldPaths: ['explanation', 'heroExposure.state'],
      preview: [],
    },
    assetChanges: {
      uploadCount: 1,
      referenceCount: 1,
      hash: 'asset-reference-hash',
      preview: [{
        assetUploadId: 'coasset-proof-1',
        referenceId: 'coref-proof-1',
        assetKind: 'monster-image',
        monsterId: 'inklet',
        branchId: 'default',
        stageId: 'base',
        validationStatus: 'passed',
      }],
    },
    productionProof: {
      status: 'recorded',
      hasCallerProof: true,
      capturedAt: Date.UTC(2026, 5, 12, 9, 2, 0),
      capturedByAccountId: 'admin-publisher',
      requiredSurfaces: [
        { key: 'spellingSetup', label: 'Spelling setup' },
        { key: 'wordBank', label: 'Word Bank' },
        { key: 'heroCodex', label: 'Hero / Codex' },
        { key: 'monsterRendering', label: 'Monster rendering' },
      ],
      linkedSurfaces: [
        { key: 'spellingSetup', label: 'Spelling setup' },
        { key: 'wordBank', label: 'Word Bank' },
        { key: 'heroCodex', label: 'Hero / Codex' },
        { key: 'monsterRendering', label: 'Monster rendering' },
      ],
      missingSurfaces: [],
      warnings: [],
    },
  },
};

function makeCompactRelease(entry = release) {
  const proof = entry.history.productionProof;
  return {
    ...entry,
    history: {
      ...entry.history,
      productionProof: {
        status: proof.status,
        hasCallerProof: proof.hasCallerProof,
        capturedAt: proof.capturedAt,
        requiredSurfaceCount: proof.requiredSurfaces.length,
        linkedSurfaceCount: proof.linkedSurfaces.length,
        missingSurfaceCount: proof.missingSurfaces.length,
        warningCount: proof.warnings.length,
      },
    },
  };
}

const compactRelease = makeCompactRelease(release);

const overview = {
  subjectId: 'spelling',
  latestRelease: compactRelease,
  packageCounts: { draft: 0, blocked: 0, approved: 0 },
  lanes: {
    blocked: [],
    readyForApproval: [],
    approvedPendingPublish: [],
    drafts: [],
    recentReleases: [compactRelease],
  },
  actor: {
    accountId: 'admin-a',
    platformRole: 'admin',
    capabilities: {
      'content_operations.edit': true,
      'content_operations.approve': true,
      'content_operations.publish': true,
    },
  },
};

function makeAuthSessionResponse() {
  return {
    ok: true,
    session: {
      accountId: 'acct-fixture-admin-001',
      provider: 'google',
      platformRole: 'admin',
      accountType: 'real',
      demo: false,
      email: 'operator@ks2-mastery.test',
      displayName: 'Fixture Operator',
    },
    account: {
      id: 'acct-fixture-admin-001',
      email: 'operator@ks2-mastery.test',
      displayName: 'Fixture Operator',
      selectedLearnerId: 'lrn-fixture-a1',
      repoRevision: 42,
      platformRole: 'admin',
      accountType: 'real',
      demo: false,
    },
    subjectExposureGates: {
      spelling: true,
      grammar: true,
      punctuation: true,
    },
    learnerCount: 1,
    auth: { method: 'session', valid: true },
  };
}

function makeBootstrapResponse() {
  return {
    ok: true,
    learnerId: 'lrn-fixture-a1',
    learners: [
      {
        id: 'lrn-fixture-a1',
        displayName: 'Alice Fixture',
        yearGroup: 'Year 4',
      },
    ],
    subjects: {
      spelling: { state: {}, readModel: {} },
      grammar: { state: {}, readModel: {} },
      punctuation: { state: {}, readModel: {} },
    },
    session: {
      accountId: 'acct-fixture-admin-001',
      platformRole: 'admin',
    },
    subjectExposureGates: {
      spelling: true,
      grammar: true,
      punctuation: true,
    },
  };
}

function makeAdminHubPayload() {
  return {
    ok: true,
    adminHub: {
      permissions: {
        canViewAdminHub: true,
        platformRole: 'admin',
        platformRoleLabel: 'Admin',
      },
      account: {
        accountId: 'acct-fixture-admin-001',
        email: 'operator@ks2-mastery.test',
        displayName: 'Fixture Operator',
        repoRevision: 42,
        selectedLearnerId: 'lrn-fixture-a1',
      },
      learnerSupport: {
        accessibleLearners: [
          { learnerId: 'lrn-fixture-a1', learnerName: 'Alice Fixture', displayName: 'Alice Fixture', yearGroup: 'Year 4' },
        ],
        selectedLearnerId: 'lrn-fixture-a1',
        selectedDiagnostics: null,
      },
      dashboardKpis: {},
      opsActivityStream: [],
      errorLogSummary: {},
      errorLogCentre: { summaries: [], occurrences: [] },
      requestDenials: { denials: [] },
      accountOpsMetadata: { accounts: [] },
      postMegaSeedHarness: { shapes: ['all-mega', 'no-mega', 'partial-mega'] },
      contentReleaseStatus: {
        publishedVersion: 1,
        publishedReleaseId: RELEASE_ID,
        runtimeWordCount: 500,
        runtimeSentenceCount: 100,
      },
      importValidationStatus: {
        ok: true,
        errorCount: 0,
        warningCount: 0,
        errors: [],
      },
      accountSearch: { results: [], status: 'idle' },
      accountDirectory: { accounts: [], status: 'idle' },
        contentOverview: null,
        contentOperations: {
          overview,
          packages: { packages: [] },
          releases: { releases: [compactRelease] },
        },
      monsterVisualConfig: {
        permissions: { canManageMonsterVisualConfig: true, canViewMonsterVisualConfig: true },
        status: { validation: { ok: true, errorCount: 0, warningCount: 0, errors: [], warnings: [] } },
        draft: null,
        published: null,
        versions: [],
        mutation: {},
      },
    },
    session: {
      signedIn: true,
      accountId: 'acct-fixture-admin-001',
      platformRole: 'admin',
    },
  };
}

async function setupRoutes(page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname === '/api/auth/session') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeAuthSessionResponse()) });
      return;
    }
    if (pathname === '/api/bootstrap') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeBootstrapResponse()) });
      return;
    }
    if (pathname === '/api/hubs/admin') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeAdminHubPayload()) });
      return;
    }
    if (pathname === '/api/admin/content-operations/subjects/spelling/overview') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, overview }) });
      return;
    }
    if (pathname === '/api/admin/content-operations/packages') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, packages: [] }) });
      return;
    }
    if (pathname === '/api/admin/content-operations/subjects/spelling/releases') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, releases: [compactRelease] }) });
      return;
    }
    if (pathname === `/api/admin/content-operations/subjects/spelling/releases/${RELEASE_ID}`) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, release }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
}

async function navigateToContentSection(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const adminLink = page.locator('a[href="/admin"]');
  await expect(adminLink).toBeVisible({ timeout: 15_000 });
  await adminLink.click();
  const contentTab = page.locator('[data-section="content"]');
  await expect(contentTab).toBeVisible({ timeout: 15_000 });
  await contentTab.click();
}

test.describe('Content Operations Centre production proof UI', () => {
  test.use({ reducedMotion: 'reduce' });

  test('Release History shows recorded proof and linked learner-facing surfaces', async ({ page }) => {
    await setupRoutes(page);
    await navigateToContentSection(page);

    await expect(page.locator('text=Content Operations Centre')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('tab', { name: 'Release history' }).click();

    const row = page.locator(`[data-content-ops-release-history-row="${RELEASE_ID}"]`);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.locator('[data-content-ops-release-proof-status="recorded"]')).toBeVisible();
    await expect(row).toContainText('4 linked surfaces');
  });
});
