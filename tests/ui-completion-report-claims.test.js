// P2 U7 completion-report claims guard.
//
// Plan: docs/plans/2026-04-29-011-refactor-ui-shared-primitives-plan.md §U7
// (lines 574, 594) — the U7 completion report MUST NOT contain forbidden
// marketing phrases that would over-claim what P2 has shipped.
//
// Extracted from tests/ui-token-contract.test.js so the token-contract
// suite stays focused on CSS-variable plumbing + hex-literal ratchets.
// Coupling a UI-token test to a documentation file path was a code
// smell flagged in U7 review; the dedicated home here makes the gate
// discoverable for future writers and the failure path unambiguous.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.resolve(
  REPO_ROOT,
  'docs/plans/james/ui-refactor/ui-refactor-p2-completion-report.md',
);

// Plan §574 lists three forbidden claim shapes. The exact strings here
// are stored in the test (not in the report) so a future writer can
// discuss the ratchet in prose without tripping it. Read these as
// closed-set anchors: matching any of them is the failure signal.
const FORBIDDEN_PHRASES = [
  'the design system is finished',
  'all colours and inline styles are tokenised',
  // "full verification passed" is also a structural claim that is
  // enforced by the report's required §7 "Verification commands"
  // section. The literal phrase itself is also banned: anyone writing
  // it without command output is over-claiming.
  'full verification passed',
];

test('completion report file exists at the plan-mandated path', async () => {
  // Hard-fail if the report is missing — the previous fail-soft pattern
  // (try/catch returning early) silently disarmed the gate during
  // pre-merge edits. The report MUST exist for U7 to be considered
  // complete (plan §596 verification gate), so an explicit existence
  // assertion is the right shape.
  let exists = false;
  try {
    await access(REPORT_PATH);
    exists = true;
  } catch {
    // fall through to the assertion's failure message
  }
  assert.ok(
    exists,
    `U7 completion report missing at ${REPORT_PATH} — plan §596 requires the file `
    + 'to exist before U7 ships. If the report has moved, update REPORT_PATH here too.',
  );
});

test('completion report does NOT contain forbidden marketing claims', async () => {
  const source = await readFile(REPORT_PATH, 'utf8');
  const lower = source.toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    assert.equal(
      lower.includes(phrase),
      false,
      `Completion report contains the forbidden phrase "${phrase}" — over-claims what P2 ships. `
      + 'Either rephrase, or, if the claim is genuinely backed by command evidence, anchor it '
      + 'next to the evidence in the §7 Verification commands section.',
    );
  }
});
