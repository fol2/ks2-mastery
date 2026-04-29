// P6 U5: Playwright browser proof — ops-role redaction and visibility contract.
//
// Closes the P5 fixme for ops-role interactive proof. This test file exercises
// the security contract at browser level rather than at unit/integration level:
//
//   1. Ops role CANNOT see Copy JSON button (admin-only export)
//   2. Ops role CAN see Copy Summary button (parent-safe export)
//   3. Ops role sees MASKED identifiers (account IDs, emails, learner IDs)
//   4. Ops role CANNOT see mutation buttons (seed harness, role management)
//   5. Contrast: admin role CAN see all of the above
//
// Strategy: uses page.route() to intercept Worker API responses with
// deterministic fixture data, identical to admin-debug-bundle-workflow tests.
// No real signed-in session or database state required.

import { test, expect } from '@playwright/test';
import { createAdminFixtureAccount, createOpsFixtureAccount } from './admin-fixtures.mjs';

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const ADMIN_BUNDLE_FIXTURE = createAdminFixtureAccount();
const OPS_BUNDLE_FIXTURE = createOpsFixtureAccount();

// The 7 bundle section keys that must render as <details> elements.
const BUNDLE_SECTION_KEYS = [
  'accountSummary',
  'linkedLearners',
  'recentErrors',
  'errorOccurrences',
  'recentDenials',
  'recentMutations',
  'capacityState',
];

// ---------------------------------------------------------------------------
// Admin hub payload factory — mirrors admin-debug-bundle-workflow.playwright.test.mjs
// ---------------------------------------------------------------------------

function makeAdminHubPayload(role = 'admin') {
  const bundleFixture = role === 'admin' ? ADMIN_BUNDLE_FIXTURE : OPS_BUNDLE_FIXTURE;
  return {
    ok: true,
    adminHub: {
      permissions: {
        canViewAdminHub: true,
        platformRole: role,
        platformRoleLabel: role === 'admin' ? 'Admin' : 'Ops',
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
      debugBundle: {
        data: bundleFixture,
        loading: false,
        error: null,
      },
      errorLogCentre: { summaries: [], occurrences: [] },
      requestDenials: { denials: [] },
      accountOpsMetadata: { accounts: [] },
      postMegaSeedHarness: { shapes: ['all-mega', 'no-mega', 'partial-mega'] },
      contentReleaseStatus: {
        publishedVersion: 1,
        publishedReleaseId: 'rel-001',
        runtimeWordCount: 500,
        runtimeSentenceCount: 100,
        currentDraftId: 'draft-001',
        currentDraftVersion: 2,
        draftUpdatedAt: 1714200000000,
      },
      importValidationStatus: {
        ok: true,
        errorCount: 0,
        warningCount: 0,
        source: 'bundled baseline',
        importedAt: 1714200000000,
        errors: [],
      },
      postMasteryDebug: null,
      accountSearch: { results: [], status: 'idle' },
      accountDirectory: { accounts: [], status: 'idle' },
      contentOverview: null,
    },
    session: {
      signedIn: true,
      accountId: 'acct-fixture-admin-001',
      platformRole: role,
    },
  };
}

// ---------------------------------------------------------------------------
// Route interception setup
// ---------------------------------------------------------------------------

function makeAuthSessionResponse(role = 'admin') {
  return {
    ok: true,
    session: {
      accountId: 'acct-fixture-admin-001',
      provider: 'google',
      platformRole: role,
      accountType: 'real',
      demo: false,
      demoExpiresAt: null,
      email: 'operator@ks2-mastery.test',
      displayName: 'Fixture Operator',
    },
    account: {
      id: 'acct-fixture-admin-001',
      email: 'operator@ks2-mastery.test',
      displayName: 'Fixture Operator',
      selectedLearnerId: 'lrn-fixture-a1',
      repoRevision: 42,
      platformRole: role,
      accountType: 'real',
      demo: false,
      demoExpiresAt: null,
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

function makeBootstrapResponse(role = 'admin') {
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
    meta: {
      capacity: { bootstrapCapacity: 1000, commandCapacity: 5000 },
    },
    session: {
      accountId: 'acct-fixture-admin-001',
      platformRole: role,
    },
    subjectExposureGates: {
      spelling: true,
      grammar: true,
      punctuation: true,
    },
  };
}

async function setupRoutes(page, { role = 'admin' } = {}) {
  const bundleFixture = role === 'admin' ? ADMIN_BUNDLE_FIXTURE : OPS_BUNDLE_FIXTURE;

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname === '/api/auth/session') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeAuthSessionResponse(role)),
      });
      return;
    }

    if (pathname === '/api/bootstrap') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeBootstrapResponse(role)),
      });
      return;
    }

    if (pathname === '/api/hubs/admin') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeAdminHubPayload(role)),
      });
      return;
    }

    if (pathname === '/api/admin/debug-bundle') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(bundleFixture),
      });
      return;
    }

    if (pathname.startsWith('/api/admin/accounts')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, accounts: [] }),
      });
      return;
    }

    if (pathname.startsWith('/api/admin/ops/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    // Catch-all
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

async function navigateToAdmin(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Wait for admin link to appear (both admin and ops roles get this link)
  const adminLink = page.locator('a[href="/admin"]');
  await expect(adminLink).toBeVisible({ timeout: 15_000 });
  await adminLink.click();

  // Wait for admin section tabs to render
  const firstTab = page.locator('[data-section="overview"]');
  await expect(firstTab).toBeVisible({ timeout: 15_000 });
}

async function navigateToDebugSection(page) {
  await navigateToAdmin(page);
  const debugTab = page.locator('[data-section="debug"]');
  await expect(debugTab).toBeVisible({ timeout: 10_000 });
  await debugTab.click();
  await expect(page.locator('[data-testid="debug-bundle-panel"]')).toBeVisible({ timeout: 10_000 });
}

async function navigateToContentSection(page) {
  await navigateToAdmin(page);
  const contentTab = page.locator('[data-section="content"]');
  await expect(contentTab).toBeVisible({ timeout: 10_000 });
  await contentTab.click();
}

async function navigateToAccountsSection(page) {
  await navigateToAdmin(page);
  const accountsTab = page.locator('[data-section="accounts"]');
  await expect(accountsTab).toBeVisible({ timeout: 10_000 });
  await accountsTab.click();
}

// ---------------------------------------------------------------------------
// OPS ROLE: Debug Bundle redaction and button-visibility contract
// ---------------------------------------------------------------------------

test.describe('Ops-role browser proof — Debug Bundle redaction', () => {
  test.use({ reducedMotion: 'reduce' });

  test('ops role can access admin panel and navigate to debug section', async ({ page }) => {
    await setupRoutes(page, { role: 'ops' });
    await navigateToDebugSection(page);

    // The debug bundle panel rendered — ops can access the admin hub
    const panel = page.locator('[data-testid="debug-bundle-panel"]');
    await expect(panel).toBeVisible();
  });

  test('ops role CANNOT see Copy JSON button', async ({ page }) => {
    await setupRoutes(page, { role: 'ops' });
    await navigateToDebugSection(page);

    // Wait for bundle result to render (pre-populated via fixture)
    await expect(page.locator('[data-testid="debug-bundle-result"]')).toBeVisible({ timeout: 10_000 });

    // Copy Summary IS visible for ops (parent-safe audience)
    const copySummaryBtn = page.locator('[data-testid="bundle-copy-summary-btn"]');
    await expect(copySummaryBtn).toBeVisible();

    // Copy JSON MUST NOT be present for ops role (canExportJson=false in ops fixture)
    const copyJsonBtn = page.locator('[data-testid="bundle-copy-json-btn"]');
    await expect(copyJsonBtn).toHaveCount(0);
  });

  test('ops role sees masked account IDs (not raw identifiers)', async ({ page }) => {
    await setupRoutes(page, { role: 'ops' });
    await navigateToDebugSection(page);
    await expect(page.locator('[data-testid="debug-bundle-result"]')).toBeVisible({ timeout: 10_000 });

    // Expand Account Summary section
    const accountSection = page.locator('[data-testid="bundle-section-accountSummary"]');
    await accountSection.locator('summary').click();

    // Ops fixture has masked account ID: 'dmin-001' (last 8 chars)
    await expect(accountSection).toContainText('dmin-001');

    // Must NOT contain the full unmasked account ID
    const sectionText = await accountSection.textContent();
    expect(sectionText).not.toContain('acct-fixture-admin-001');
  });

  test('ops role sees masked email (asterisks present)', async ({ page }) => {
    await setupRoutes(page, { role: 'ops' });
    await navigateToDebugSection(page);
    await expect(page.locator('[data-testid="debug-bundle-result"]')).toBeVisible({ timeout: 10_000 });

    // Expand Account Summary section
    const accountSection = page.locator('[data-testid="bundle-section-accountSummary"]');
    await accountSection.locator('summary').click();

    // Ops fixture has masked email: '*********************y.test'
    await expect(accountSection).toContainText('***');

    // Must NOT contain the full email
    const sectionText = await accountSection.textContent();
    expect(sectionText).not.toContain('operator@ks2-mastery.test');
  });

  test('ops role sees masked learner IDs in linked learners', async ({ page }) => {
    await setupRoutes(page, { role: 'ops' });
    await navigateToDebugSection(page);
    await expect(page.locator('[data-testid="debug-bundle-result"]')).toBeVisible({ timeout: 10_000 });

    // Expand Linked Learners section
    const learnersSection = page.locator('[data-testid="bundle-section-linkedLearners"]');
    await learnersSection.locator('summary').click();

    // Ops fixture learner IDs are masked: 'ture-a1' not 'lrn-fixture-a1'
    const learnersText = await learnersSection.textContent();
    expect(learnersText).not.toContain('lrn-fixture-a1');
    expect(learnersText).not.toContain('lrn-fixture-b2');

    // Learner names are NOT sensitive — they remain visible
    expect(learnersText).toContain('Alice Fixture');
  });

  test('ops role bundle still renders all 7 sections', async ({ page }) => {
    await setupRoutes(page, { role: 'ops' });
    await navigateToDebugSection(page);
    await expect(page.locator('[data-testid="debug-bundle-result"]')).toBeVisible({ timeout: 10_000 });

    for (const sectionKey of BUNDLE_SECTION_KEYS) {
      const section = page.locator(`[data-testid="bundle-section-${sectionKey}"]`);
      await expect(section).toBeVisible({ timeout: 5_000 });
    }
  });
});

// ---------------------------------------------------------------------------
// OPS ROLE: Mutation button visibility (Content + Accounts sections)
// ---------------------------------------------------------------------------

test.describe('Ops-role browser proof — mutation button gates', () => {
  test.use({ reducedMotion: 'reduce' });

  test('ops role sees "Admin-only" warning on seed harness instead of apply button', async ({ page }) => {
    await setupRoutes(page, { role: 'ops' });
    await navigateToContentSection(page);

    // The post-mega seed harness panel renders a warning for non-admin roles
    const seedPanel = page.locator('[data-panel="post-mega-seed-harness"]');
    await expect(seedPanel).toBeVisible({ timeout: 10_000 });

    // Verify it shows the ops-role block message
    await expect(seedPanel).toContainText('Only admin accounts can apply QA seed shapes');

    // The "Apply seed" button must NOT be visible
    const applyBtn = seedPanel.locator('[data-action="post-mega-seed-apply"]');
    await expect(applyBtn).toHaveCount(0);
  });

  test('ops role sees "Admin-only role management" warning in accounts', async ({ page }) => {
    await setupRoutes(page, { role: 'ops' });
    await navigateToAccountsSection(page);

    // The account roles section shows a warning for non-admin
    const warningText = page.locator('text=Only admin accounts can list accounts or change platform roles');
    await expect(warningText).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// ADMIN ROLE: Contrast — proves admin CAN see everything ops cannot
// ---------------------------------------------------------------------------

test.describe('Admin-role contrast — confirms admin sees full controls', () => {
  test.use({ reducedMotion: 'reduce' });

  test('admin role CAN see Copy JSON button', async ({ page }) => {
    await setupRoutes(page, { role: 'admin' });
    await navigateToDebugSection(page);
    await expect(page.locator('[data-testid="debug-bundle-result"]')).toBeVisible({ timeout: 10_000 });

    // Copy JSON IS visible for admin (canExportJson=true in admin fixture)
    const copyJsonBtn = page.locator('[data-testid="bundle-copy-json-btn"]');
    await expect(copyJsonBtn).toBeVisible();

    // Copy Summary also visible
    const copySummaryBtn = page.locator('[data-testid="bundle-copy-summary-btn"]');
    await expect(copySummaryBtn).toBeVisible();
  });

  test('admin role sees FULL unmasked account IDs', async ({ page }) => {
    await setupRoutes(page, { role: 'admin' });
    await navigateToDebugSection(page);
    await expect(page.locator('[data-testid="debug-bundle-result"]')).toBeVisible({ timeout: 10_000 });

    // Expand Account Summary
    const accountSection = page.locator('[data-testid="bundle-section-accountSummary"]');
    await accountSection.locator('summary').click();

    // Admin sees full account ID
    await expect(accountSection).toContainText('acct-fixture-admin-001');

    // Admin sees full email
    await expect(accountSection).toContainText('operator@ks2-mastery.test');
  });

  test('admin role sees FULL learner IDs in linked learners', async ({ page }) => {
    await setupRoutes(page, { role: 'admin' });
    await navigateToDebugSection(page);
    await expect(page.locator('[data-testid="debug-bundle-result"]')).toBeVisible({ timeout: 10_000 });

    // Expand Linked Learners
    const learnersSection = page.locator('[data-testid="bundle-section-linkedLearners"]');
    await learnersSection.locator('summary').click();

    // Admin sees full learner IDs
    await expect(learnersSection).toContainText('lrn-fixture-a1');
    await expect(learnersSection).toContainText('lrn-fixture-b2');
  });

  test('admin role sees seed harness apply button (no ops-role block)', async ({ page }) => {
    await setupRoutes(page, { role: 'admin' });
    await navigateToContentSection(page);

    // The post-mega seed harness panel renders the full interface for admin
    const seedPanel = page.locator('[data-panel="post-mega-seed-harness"]');
    await expect(seedPanel).toBeVisible({ timeout: 10_000 });

    // Admin sees the apply button
    const applyBtn = seedPanel.locator('[data-action="post-mega-seed-apply"]');
    await expect(applyBtn).toBeVisible();

    // The ops-role block message must NOT be present
    const panelText = await seedPanel.textContent();
    expect(panelText).not.toContain('Only admin accounts can apply QA seed shapes');
  });

  test('admin role can access account roles management', async ({ page }) => {
    await setupRoutes(page, { role: 'admin' });
    await navigateToAccountsSection(page);

    // The admin-only warning must NOT be present
    const warningText = page.locator('text=Only admin accounts can list accounts or change platform roles');
    await expect(warningText).toHaveCount(0);

    // Instead, the refresh accounts button should be visible
    const refreshBtn = page.locator('text=Refresh accounts');
    await expect(refreshBtn).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// SECURITY: Clipboard content integrity (parent-safe copy does not leak raw PII)
// ---------------------------------------------------------------------------

test.describe('Ops-role browser proof — clipboard safety', () => {
  test.use({ reducedMotion: 'reduce' });

  test('Copy Summary clipboard content does not contain raw email or account ID', async ({ page, context }) => {
    // Grant clipboard permissions for this test context
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await setupRoutes(page, { role: 'ops' });
    await navigateToDebugSection(page);
    await expect(page.locator('[data-testid="debug-bundle-result"]')).toBeVisible({ timeout: 10_000 });

    // Click Copy Summary
    const copySummaryBtn = page.locator('[data-testid="bundle-copy-summary-btn"]');
    await expect(copySummaryBtn).toBeVisible();
    await copySummaryBtn.click();

    // Wait for the "Summary copied" feedback chip
    await expect(page.locator('[data-testid="bundle-copy-feedback"]')).toContainText('copied', { timeout: 5_000 });

    // Read clipboard content
    const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());

    // The ops fixture humanSummary is:
    // 'Debug Bundle for ***dmin-001: 2 linked learners, 1 recent error, 1 denial, 1 mutation, 1 capacity metric. Generated 2024-04-28T14:26:40 UTC.'
    //
    // It must NOT contain the raw full account ID or email
    expect(clipboardContent).not.toContain('acct-fixture-admin-001');
    expect(clipboardContent).not.toContain('operator@ks2-mastery.test');

    // It should contain the masked reference from humanSummary
    expect(clipboardContent).toContain('dmin-001');
  });
});
