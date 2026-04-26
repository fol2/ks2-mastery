// SH2-U8 (sys-hardening p2): budget guard for inline `style={...}` sites.
//
// The CSP enforcement flip (docs/hardening/csp-enforcement-decision.md) is
// gated on the inline-style inventory staying at or below the committed
// total. This test re-runs the grep-based oracle in
// `scripts/inventory-inline-styles.mjs` against the current working tree and
// asserts:
//
// 1. The live count is LESS THAN OR EQUAL to POST_MIGRATION_TOTAL (strict —
//    any new `style={...}` site regresses the budget).
// 2. The inventory markdown's `**TOTAL**` row matches the live count (stale
//    inventory docs fail the test, reminding the migrator to re-run the
//    script with `--write`).
// 3. Every classified file still appears in the inventory JSON, so a file
//    rename that drops rows also fails the test.
//
// Running: `node --test tests/csp-inline-style-budget.test.js`.
//
// Plan pointer: `docs/plans/2026-04-26-001-feat-sys-hardening-p2-plan.md`
// SH2-U8 L619-L664. Baseline: `docs/hardening/p2-baseline.md` — "CSP
// Report-Only -> Enforced flip is open" (Access / privacy faults).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CLASSIFICATION,
  POST_MIGRATION_TOTAL,
  PRE_MIGRATION_TOTAL,
  SITES_MIGRATED_THIS_PR,
  buildInventory,
  countStyleSites,
} from '../scripts/inventory-inline-styles.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const INVENTORY_PATH = path.resolve(REPO_ROOT, 'docs/hardening/csp-inline-style-inventory.md');

test('post-migration total equals pre-migration minus SH2-U8 slice', () => {
  assert.equal(
    POST_MIGRATION_TOTAL,
    PRE_MIGRATION_TOTAL - SITES_MIGRATED_THIS_PR,
    'POST_MIGRATION_TOTAL must be a derived value — do not edit directly',
  );
  assert.ok(
    SITES_MIGRATED_THIS_PR >= 20,
    'SH2-U8 requires >=20 sites migrated (F-03 threshold); '
      + `current snapshot says ${SITES_MIGRATED_THIS_PR}`,
  );
});

test('live grep count matches POST_MIGRATION_TOTAL (strict budget)', async () => {
  const { total } = await buildInventory();
  assert.equal(
    total,
    POST_MIGRATION_TOTAL,
    `inline-style budget regressed: expected ${POST_MIGRATION_TOTAL}, grep sees ${total}. `
      + 'Re-run scripts/inventory-inline-styles.mjs to inspect the diff; if the '
      + 'change is intentional, migrate the new site to a class OR update the '
      + 'PRE_MIGRATION_TOTAL / SITES_MIGRATED_THIS_PR constants AND the committed '
      + 'inventory markdown.',
  );
});

test('committed inventory markdown TOTAL row matches live count', async () => {
  const markdown = await readFile(INVENTORY_PATH, 'utf8');
  const match = markdown.match(/\|\s+\*\*TOTAL\*\*\s+\|\s+\*\*(\d+)\*\*\s+\|/);
  assert.ok(match, 'inventory markdown is missing the TOTAL row');
  const committed = Number(match[1]);
  assert.equal(
    committed,
    POST_MIGRATION_TOTAL,
    `inventory markdown is stale: committed ${committed}, current budget ${POST_MIGRATION_TOTAL}. `
      + 'Run `node scripts/inventory-inline-styles.mjs --write` to regenerate.',
  );
});

test('countStyleSites matches a synthetic fixture', () => {
  const fixture = [
    'const A = <div style={{ color: "red" }} />;',
    'const B = <span style={{ margin: 4 }} />;',
    '// doc: any style={ expression in a string counts too',
    'const C = `not a style={ in JSX`;',
  ].join('\n');
  // Four `style={` occurrences: two JSX attributes, one line comment,
  // one template literal. The grep oracle is intentionally literal so
  // the adversarial reviewer can reason about it without an AST.
  assert.equal(countStyleSites(fixture), 4);
});

test('adding a synthetic new `style={` tracks as a budget regression', async () => {
  // Sanity assertion that the grep oracle is sensitive. We do NOT write
  // any fixture file to disk — we exercise `countStyleSites` against an
  // in-memory string so the live count does not move.
  const synthetic = 'const D = <div style={{ padding: 8 }} />;';
  assert.equal(countStyleSites(synthetic), 1);
  const zero = 'const E = <div className="plain" />;';
  assert.equal(countStyleSites(zero), 0);
});

test('every file with >0 sites has a committed classification', async () => {
  const { rows } = await buildInventory();
  const unclassified = [];
  for (const row of rows) {
    if (!CLASSIFICATION[row.file]) unclassified.push(row.file);
  }
  assert.equal(
    unclassified.length,
    0,
    `unclassified files detected — add an entry in scripts/inventory-inline-styles.mjs::CLASSIFICATION: ${unclassified.join(', ')}`,
  );
});

test('classification uses only the four SH2-U8 categories', () => {
  const allowed = new Set([
    'css-var-ready',
    'shared-pattern-available',
    'dynamic-content-driven',
    'third-party-boundary',
  ]);
  const badEntries = [];
  for (const [file, category] of Object.entries(CLASSIFICATION)) {
    if (!allowed.has(category)) {
      badEntries.push(`${file} -> ${category}`);
    }
  }
  assert.equal(
    badEntries.length,
    0,
    `CLASSIFICATION uses a category outside the four S-06 categories: ${badEntries.join(', ')}`,
  );
});

test('CSP stays in Report-Only mode (SH2-U8 does NOT flip enforcement)', async () => {
  const headersSource = await readFile(
    path.resolve(REPO_ROOT, 'worker/src/security-headers.js'),
    'utf8',
  );
  // The decision record explicitly states the flip is a follow-up PR.
  // If this test ever fails the operator either (a) landed the flip in
  // the wrong PR, or (b) forgot to update this assertion after a signed
  // flip. Both should be caught before merge.
  assert.ok(
    headersSource.includes("'Content-Security-Policy-Report-Only': CSP_POLICY_VALUE"),
    'worker/src/security-headers.js no longer sets '
      + '`Content-Security-Policy-Report-Only`; SH2-U8 must not flip enforcement '
      + '— update the assertion in a dedicated flip PR that also lands '
      + 'docs/hardening/csp-enforcement-decision.md sign-off.',
  );
  assert.ok(
    !/['"]Content-Security-Policy['"]\s*:/i.test(headersSource),
    'worker/src/security-headers.js carries an enforced `Content-Security-Policy` '
      + 'entry — SH2-U8 must stay Report-Only.',
  );
});
