#!/usr/bin/env node
// SH2-U8 (sys-hardening p2): inventory every `style={...}` site under
// `src/` so the CSP `style-src` migration away from `'unsafe-inline'`
// has a committed classification baseline.
//
// Reads every `*.jsx` / `*.tsx` / `*.js` / `*.ts` file under `src/`,
// finds every literal `style={` occurrence, and emits two outputs:
//   - a grand-total count and per-file count (stdout)
//   - the markdown inventory table at
//     `docs/hardening/csp-inline-style-inventory.md`
//
// Classification is keyed off the manually-curated JSON block inside
// the markdown (see `// PRE-CLASSIFIED` block below). The script's job
// is to KEEP THE COUNTS HONEST: if a site is added, removed, or moved,
// the build-time budget test (`tests/csp-inline-style-budget.test.js`)
// trips and this script is re-run by the owner to refresh the doc.
//
// CLI usage:
//   node ./scripts/inventory-inline-styles.mjs           # print summary
//   node ./scripts/inventory-inline-styles.mjs --write   # rewrite the
//                                                        # inventory markdown
//   node ./scripts/inventory-inline-styles.mjs --check   # exit 1 if the
//                                                        # committed count
//                                                        # is stale
//
// The CSP enforcement flip is a separate follow-up PR per SH2-U8; this
// file does NOT touch `worker/src/security-headers.js`.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.resolve(REPO_ROOT, 'src');
const INVENTORY_PATH = path.resolve(REPO_ROOT, 'docs/hardening/csp-inline-style-inventory.md');
const EXTENSIONS = new Set(['.jsx', '.tsx', '.js', '.ts']);
const STYLE_PATTERN = /style=\{/g;

// Skip generated output: the build step emits `src/bundles/<Name>-<HASH>.js`
// files that rename across builds. A concurrent test run (e.g.
// tests/bundle-audit.test.js) rewrites these files mid-flight, which races
// the grep walker and produces spurious `ENOENT` errors. The real source
// tree never puts hand-edited code under `src/bundles/`, so exclude it here.
const EXCLUDED_DIR_NAMES = new Set(['bundles']);

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
      files.push(...(await walkFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Count `style={` occurrences in a single file's text. A simple literal
 * match is sufficient here — the grep-based oracle in the CSP charter
 * (docs/hardening/charter.md) defines the budget as "the number of times
 * the bytes `style={` appear under src/", no AST analysis required.
 */
export function countStyleSites(text) {
  if (typeof text !== 'string' || text.length === 0) return 0;
  const matches = text.match(STYLE_PATTERN);
  return matches ? matches.length : 0;
}

export async function buildInventory() {
  const files = await walkFiles(SRC_DIR);
  const rows = [];
  let total = 0;
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const count = countStyleSites(text);
    if (count === 0) continue;
    const relative = path.relative(REPO_ROOT, file).split(path.sep).join('/');
    rows.push({ file: relative, count });
    total += count;
  }
  rows.sort((a, b) => (b.count - a.count) || a.file.localeCompare(b.file));
  return { total, rows };
}

// PRE-CLASSIFIED: manual S-06 classification per file. Each site in a
// file inherits the file's category unless the file is flagged `mixed`
// (in which case the inventory markdown carries the per-site breakdown).
//
// Categories:
//   css-var-ready         — static value substitutable with a class.
//   shared-pattern-available — repeating inline value already in stylesheet.
//   dynamic-content-driven — runtime interpolation (`${heroBg}`, user accent).
//   third-party-boundary  — integration constraint (portal, measured height).
//
// NEW CSS-variable inline styles whose value flows from server data MUST
// be numeric-clamped / allowlisted-string / `CSS.escape`-wrapped at the
// helper boundary. See `src/platform/game/monster-visual-style.js` for
// the canonical numeric-clamp pattern.
export const CLASSIFICATION = Object.freeze({
  // Shell surfaces — migration targets this PR
  'src/surfaces/shell/PersistenceBanner.jsx': 'shared-pattern-available',
  'src/surfaces/shell/MonsterCelebrationOverlay.jsx': 'dynamic-content-driven',
  'src/surfaces/shell/ToastShelf.jsx': 'dynamic-content-driven',
  'src/platform/react/ErrorBoundary.jsx': 'shared-pattern-available',
  'src/app/App.jsx': 'shared-pattern-available',

  // Auth / subject fallback / skeleton — migration targets this PR
  'src/surfaces/auth/DemoExpiryBanner.jsx': 'shared-pattern-available',
  'src/surfaces/auth/AuthSurface.jsx': 'shared-pattern-available',
  'src/surfaces/subject/SubjectRuntimeFallback.jsx': 'dynamic-content-driven',
  'src/surfaces/subject/SubjectRoute.jsx': 'dynamic-content-driven',
  'src/platform/ui/LoadingSkeleton.jsx': 'css-var-ready',

  // Hubs
  'src/surfaces/hubs/ReadOnlyLearnerNotice.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/hub-utils.js': 'shared-pattern-available',
  'src/surfaces/hubs/AdultLearnerSelect.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/MonsterVisualFieldControls.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/admin-panel-header.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/AdminHubSurface.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/AdminSectionTabs.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/AdminOverviewSection.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/AdminAccountsSection.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/AdminDebuggingSection.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/AdminDebugBundlePanel.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/AdminErrorTimelinePanel.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/AdminLearnerSupportPanel.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/AdminRequestDenialsPanel.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/AdminContentSection.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/AdminMarketingSection.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/ParentHubSurface.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/MonsterEffectBindingsPanel.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/MonsterEffectCatalogPanel.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/MonsterEffectCelebrationPanel.jsx': 'shared-pattern-available',
  'src/surfaces/hubs/AdminIncidentPanel.jsx': 'dynamic-content-driven',
  'src/surfaces/hubs/AdminProductionEvidencePanel.jsx': 'dynamic-content-driven',
  'src/surfaces/hubs/AdminBusinessSection.jsx': 'dynamic-content-driven',
  'src/surfaces/hubs/MonsterVisualConfigPanel.jsx': 'dynamic-content-driven',
  'src/surfaces/hubs/MonsterVisualPreviewGrid.jsx': 'dynamic-content-driven',

  // Home / codex
  'src/surfaces/home/HomeSurface.jsx': 'dynamic-content-driven',
  'src/surfaces/home/SubjectCard.jsx': 'dynamic-content-driven',
  'src/surfaces/home/MonsterMeadow.jsx': 'dynamic-content-driven',
  'src/surfaces/home/CodexHero.jsx': 'dynamic-content-driven',
  'src/surfaces/home/CodexCard.jsx': 'dynamic-content-driven',
  'src/surfaces/home/CodexCreature.jsx': 'dynamic-content-driven',
  'src/surfaces/home/CodexCreatureLightbox.jsx': 'dynamic-content-driven',
  'src/surfaces/home/CodexSubjectSection.jsx': 'dynamic-content-driven',

  // Profile
  'src/surfaces/profile/ProfileSettingsSurface.jsx': 'shared-pattern-available',

  // Platform UI — shared hero backdrop primitive (cross-fade + pan).
  // Sets `--hero-bg` and `--hero-pan-delay` per layer; both are
  // dynamic per render and per learner so they cannot be hoisted to a
  // static class.
  'src/platform/ui/HeroBackdrop.jsx': 'dynamic-content-driven',

  // Subjects — spelling
  'src/subjects/spelling/components/SpellingCommon.jsx': 'css-var-ready',
  'src/subjects/spelling/components/SpellingHeroBackdrop.jsx': 'dynamic-content-driven',
  'src/subjects/spelling/components/SpellingSetupScene.jsx': 'dynamic-content-driven',
  'src/subjects/spelling/components/SpellingSessionScene.jsx': 'dynamic-content-driven',
  'src/subjects/spelling/components/SpellingSummaryScene.jsx': 'dynamic-content-driven',
  'src/subjects/spelling/components/SpellingWordBankScene.jsx': 'dynamic-content-driven',
  'src/subjects/spelling/components/SpellingWordDetailModal.jsx': 'dynamic-content-driven',
  'src/subjects/spelling/components/PatternQuestScene.jsx': 'dynamic-content-driven',

  // Subjects — grammar / punctuation
  'src/subjects/grammar/components/GrammarSetupScene.jsx': 'shared-pattern-available',
  'src/subjects/punctuation/components/PunctuationSetupScene.jsx': 'shared-pattern-available',
  'src/subjects/punctuation/components/PunctuationMapScene.jsx': 'dynamic-content-driven',
  'src/subjects/punctuation/components/PunctuationSessionScene.jsx': 'dynamic-content-driven',
  'src/subjects/punctuation/components/PunctuationSummaryScene.jsx': 'dynamic-content-driven',

  // Platform UI
  'src/platform/ui/LengthPicker.jsx': 'shared-pattern-available',
  // P2 U2: Card primitive emits style={{ '--card-accent': accent }} only
  // when an accent string is supplied (typically `var(--grammar-accent)`
  // / future `var(--punctuation-accent)`). Pure CSS-variable passthrough
  // — no server data enters the style bag.
  'src/platform/ui/Card.jsx': 'css-var-ready',

  // Platform game / render
  'src/platform/game/render/BaseSprite.jsx': 'dynamic-content-driven',
  'src/platform/game/render/MonsterRender.jsx': 'dynamic-content-driven',
  'src/platform/game/render/effects/celebration-shell.js': 'third-party-boundary',
});

// Files whose inline-style count decreased in this PR (SH2-U8). See
// docs/hardening/csp-inline-style-inventory.md for the per-site breakdown.
// A file in this set may still carry residual inline styles when the remaining
// sites are `dynamic-content-driven` (deferred to a later migration PR).
export const MIGRATED_THIS_PR = Object.freeze(new Set([
  // SH2-U8 first slice
  'src/surfaces/shell/PersistenceBanner.jsx',
  'src/platform/react/ErrorBoundary.jsx',
  'src/app/App.jsx',
  'src/surfaces/auth/DemoExpiryBanner.jsx',
  'src/surfaces/auth/AuthSurface.jsx',
  'src/surfaces/subject/SubjectRuntimeFallback.jsx',
  'src/surfaces/hubs/ReadOnlyLearnerNotice.jsx',
  'src/surfaces/hubs/hub-utils.js',
  'src/surfaces/hubs/admin-panel-header.jsx',
  'src/surfaces/hubs/MonsterVisualFieldControls.jsx',
  'src/surfaces/profile/ProfileSettingsSurface.jsx',
  // U6 (P4) second slice — fully migrated to CSS classes
  'src/surfaces/hubs/AdminContentSection.jsx',
  'src/surfaces/hubs/AdminDebuggingSection.jsx',
  'src/surfaces/hubs/AdminAccountsSection.jsx',
]));

// Per-PR delta snapshot: previous total (PR base) minus the number of sites
// migrated in this PR. The budget test in `tests/csp-inline-style-budget.test.js`
// asserts the current grep total equals `POST_MIGRATION_TOTAL`, and the
// inventory markdown surfaces the same number under "Total site counts".
// NOTE: U9 (capacity release gates) merge added 5 `style={{ marginTop }}` sites
// to ParentHubSurface (+2) and AdminHubSurface (+3) for the new circuit-breaker
// degraded-state banners. These are `shared-pattern-available` and remain candidates
// for a future migration PR; the budget is bumped from 282 to 287 to record the
// post-merge baseline honestly.
// P5-U7: Monster strip progress bar uses 1 inline `style={{ width, backgroundColor }}`
// site in GrammarSetupScene.jsx for accent-coloured star bars. Budget 293 → 294.
// U10 (Admin P3): Asset & Effect Registry card + MonsterVisualConfigPanel added
// 11 inline style sites for registry detail grid, card layout, and editor panel.
// Budget 294 → 305.
// SH2-U8: first migration slice reduced 305 → 280 (25 sites).
// Intermediate PRs added 66 inline-style sites, bringing the baseline to 346.
// U6 (P4): second migration slice — AdminContentSection (65), AdminDebuggingSection
// (52), AdminAccountsSection (38) fully migrated to CSS classes. 346 → 191 (155 sites).
// All three files now carry 0 inline style sites; the CSS classes live in the
// `/* U6 (P4) */` section of styles/app.css.
// U11 (Marketing/Live Ops): split AdminDebuggingSection into four narrower
// admin panels — AdminErrorTimelinePanel (23), AdminDebugBundlePanel (14),
// AdminLearnerSupportPanel (12), AdminRequestDenialsPanel (3). The slice
// added 52 inline-style sites in the new panels and 20 across other admin
// surfaces edited alongside, lifting the post-migration baseline 191 → 263.
// The U8 invariant (POST_MIGRATION_TOTAL = PRE_MIGRATION_TOTAL - SITES_MIGRATED_THIS_PR)
// is preserved by raising PRE_MIGRATION_TOTAL by the same 72; the new panels
// remain `shared-pattern-available` candidates for a future migration slice.
//
// P5-U11: Migrated 34 inline styles (21 AdminMarketingSection + 13 AdminDebugBundlePanel)
// to CSS classes. Only dynamic-content-driven styles remain (1 each).
export const PRE_MIGRATION_TOTAL = 439;
export const SITES_MIGRATED_THIS_PR = 189;
export const POST_MIGRATION_TOTAL = PRE_MIGRATION_TOTAL - SITES_MIGRATED_THIS_PR; // 250

function classifyFile(relativePath) {
  return CLASSIFICATION[relativePath] || 'unclassified';
}

function renderMarkdown({ total, rows }) {
  const categories = new Map();
  for (const row of rows) {
    const category = classifyFile(row.file);
    if (!categories.has(category)) categories.set(category, 0);
    categories.set(category, categories.get(category) + row.count);
  }

  const categoryRows = Array.from(categories.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `| \`${category}\` | ${count} |`);

  const fileRows = rows.map((row) => {
    const category = classifyFile(row.file);
    const migrated = MIGRATED_THIS_PR.has(row.file) ? 'yes' : 'no';
    return `| \`${row.file}\` | ${row.count} | \`${category}\` | ${migrated} |`;
  });

  const header = `<!-- Generated by \`scripts/inventory-inline-styles.mjs\`. Re-run with \`--write\` after any migration. -->

# CSP inline-style inventory

**Plan pointer:** \`docs/plans/2026-04-26-001-feat-sys-hardening-p2-plan.md\` SH2-U8 (L619-L664).

**Baseline entry:** \`docs/hardening/p2-baseline.md\` — "CSP Report-Only -> Enforced flip is open" (Access / privacy faults).

Every \`style={...}\` site under \`src/\` is counted by the grep-based oracle in \`scripts/inventory-inline-styles.mjs\`. The budget test \`tests/csp-inline-style-budget.test.js\` asserts the total never regresses; any new \`style={...}\` site fails the test until it is added to a new inventory row with an explicit classification.

## Classification (4 categories, S-06 deepening)

1. \`css-var-ready\` — static value substitutable with a class (e.g. \`style={{ color: '#333' }}\`).
2. \`shared-pattern-available\` — repeating inline value already expressible via an existing stylesheet class (e.g. \`style={{ marginTop: 16 }}\`).
3. \`dynamic-content-driven\` — runtime string or numeric interpolation (e.g. \`style={{ backgroundImage: \\\`url(\\\${heroBg})\\\` }}\`) where a CSS variable carries the runtime value into a class-based rule. Server-sourced values MUST be numeric-clamped, allowlisted-string, or \`CSS.escape\`-wrapped before entering the style bag (see the helper pattern in \`src/platform/game/monster-visual-style.js\`).
4. \`third-party-boundary\` — integration constraint (React-portal styling, third-party library directly writing CSS).

## CSS-variable security contract (S-06)

Any NEW CSS-variable-driven inline style whose value flows from server data (monster config, learner display name, read-model fields) MUST satisfy ONE of:

- Numeric clamp with a fixed-precision \`toFixed(N)\` (see \`monsterVisualFrameStyle\` / \`monsterVisualCelebrationStyle\` in \`src/platform/game/monster-visual-style.js\` for the canonical pattern).
- Allowlist of fixed strings (enum lookup against a module-local \`Object.freeze\`d list). Any value not in the allowlist is dropped before reaching the style bag.
- \`CSS.escape\` wrapping for runtime strings that must survive verbatim. The wrapper returns the same string with special characters escaped for CSS identifier syntax.

SH2-U8 itself does NOT introduce any new site that triggers this contract: every site migrated in this PR drops an inline style in favour of a class (no new server-sourced CSS-variable bags). The contract is committed here so the next migration PR has the rule ready to cite. Existing \`dynamic-content-driven\` sites left for future work also inherit this contract; a PR that introduces a new such site without the sanitisation fails adversarial review.

## Dark-mode classification

When an inline \`style={}\` site carries a themed colour (e.g. the literal hex \`#3E6FA8\` which equals \`--brand\` in light mode but is \`#6E9ED6\` in dark mode), migrating it to \`.btn.primary\`'s default \`var(--btn-accent, var(--brand))\` is NOT pixel-identical in dark mode. This is an INTENTIONAL theme unification: the pre-migration inline hard-locked the light-mode hex across ALL themes (theme-blind), while the post-migration class follows theme.

SH2-U8 treats this as a deliberate classification decision (NOT a visual regression). Four call sites are affected in this PR — the three \`.btn.primary\` sign-in / retry / return buttons in \`src/surfaces/auth/AuthSurface.jsx\` and the sign-in button in \`src/surfaces/auth/DemoExpiryBanner.jsx\`. Inline code comments at those sites cite this section.

The SH2-U6 visual-baseline suite (\`tests/playwright/visual-baselines.playwright.test.mjs\`) currently captures only the light-mode rendering; the dark-mode render intentionally diverges. A future SH2 slice may extend the baseline suite with a dark-mode capture for \`auth-standard\` / \`auth-forbidden\` / \`auth-transient-error\` / \`demo-expiry-banner\` scenes to pin the theme-aware rendering; this is tracked for the next inventory PR (see "Next slice selection guidance" below).

Future migration PRs that drop an inline themed colour MUST either (a) add an inline comment citing this section and note the intentional theme unification in the PR body, or (b) replace the inline with a BYTE-identical CSS rule (e.g. \`background: #3E6FA8\` in a class) that preserves theme-blindness.

## Next slice selection guidance

Future migration PRs should:

1. Pick the highest-count \`shared-pattern-available\` files first (cheapest ROI).
   - Current top target: \`src/surfaces/hubs/AdminHubSurface.jsx\` (85 sites) — WARNING: complex hub surface. The next slice MUST regenerate visual baselines AND add narrow visual-regression scenes for any migrated admin panel before merge.
   - Second tier: \`src/surfaces/hubs/MonsterEffectCatalogPanel.jsx\` (19), \`src/surfaces/hubs/MonsterEffectBindingsPanel.jsx\` (12), \`src/surfaces/hubs/MonsterEffectCelebrationPanel.jsx\` (7), \`src/surfaces/hubs/ParentHubSurface.jsx\` (8). These are smaller, hub-adjacent migrations that also require hub-baseline coverage.
2. Defer \`dynamic-content-driven\` sites until CSS-variable sanitisation helpers are in place (see S-06 contract above). Every new such site must satisfy numeric-clamp, allowlist, OR \`CSS.escape\` — no exceptions.
3. Each migration PR should migrate >=20 sites (F-03 threshold) and target pixel-identity via SH2-U6 baselines. If the migration carries a themed colour (see "Dark-mode classification" above), ADD a dark-mode baseline capture in the same PR OR document the intentional theme unification in the PR body.

## Total site counts

| Category | Count |
| --- | --- |
${categoryRows.join('\n')}
| **TOTAL** | **${total}** |

## Per-file inventory

| File | \`style={\` count | Category | Migrated in SH2-U8 |
| --- | --- | --- | --- |
${fileRows.join('\n')}
`;

  return header;
}

export async function writeInventory(inventory) {
  const markdown = renderMarkdown(inventory);
  await writeFile(INVENTORY_PATH, markdown, 'utf8');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const inventory = await buildInventory();
  const shouldWrite = args.has('--write');
  const shouldCheck = args.has('--check');

  if (shouldWrite) {
    await writeInventory(inventory);
    // eslint-disable-next-line no-console
    console.log(`wrote ${INVENTORY_PATH} (${inventory.total} sites, ${inventory.rows.length} files)`);
    return;
  }

  if (shouldCheck) {
    const existing = await readFile(INVENTORY_PATH, 'utf8').catch(() => '');
    const match = existing.match(/\|\s+\*\*TOTAL\*\*\s+\|\s+\*\*(\d+)\*\*\s+\|/);
    if (!match) {
      // eslint-disable-next-line no-console
      console.error('inventory markdown is missing the TOTAL row — re-run with --write');
      process.exit(1);
    }
    const committed = Number(match[1]);
    if (committed !== inventory.total) {
      // eslint-disable-next-line no-console
      console.error(`inventory is stale: committed ${committed} sites, grep sees ${inventory.total}`);
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log(`inventory in sync (${inventory.total} sites)`);
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`total: ${inventory.total} sites across ${inventory.rows.length} files`);
  for (const row of inventory.rows) {
    // eslint-disable-next-line no-console
    console.log(`  ${row.count.toString().padStart(3, ' ')}  ${row.file}  (${classifyFile(row.file)})`);
  }
}

const isCli = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isCli) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
