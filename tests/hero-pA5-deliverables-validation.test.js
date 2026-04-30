/**
 * Hero Mode pA5 — Deliverables Validation Test
 *
 * Validates ALL contract deliverables exist and contain the required
 * structural elements per the pA5 (Staged Default-On) specification.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

function readDoc(relativePath) {
  const fullPath = resolve(ROOT, relativePath);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, 'utf8');
}

// ── Required deliverables ────────────────────────────────────────────

const REQUIRED_DOCS = [
  'docs/plans/james/hero-mode/A/hero-pA5-rollout-log.md',
  'docs/plans/james/hero-mode/A/hero-pA5-metrics-summary.md',
  'docs/plans/james/hero-mode/A/hero-pA5-support-summary.md',
  'docs/plans/james/hero-mode/A/hero-pA5-production-decision.md',
];

const REQUIRED_SCRIPT = 'scripts/hero-pA5-rollout-resolver-evidence.mjs';

// ── File existence ───────────────────────────────────────────────────

describe('pA5 Contract Deliverables — Existence', () => {
  it('scripts/hero-pA5-rollout-resolver-evidence.mjs exists', () => {
    assert.ok(existsSync(resolve(ROOT, REQUIRED_SCRIPT)), `Missing: ${REQUIRED_SCRIPT}`);
  });

  it('docs/plans/james/hero-mode/A/hero-pA5-rollout-log.md exists', () => {
    assert.ok(existsSync(resolve(ROOT, REQUIRED_DOCS[0])), `Missing: ${REQUIRED_DOCS[0]}`);
  });

  it('docs/plans/james/hero-mode/A/hero-pA5-metrics-summary.md exists', () => {
    assert.ok(existsSync(resolve(ROOT, REQUIRED_DOCS[1])), `Missing: ${REQUIRED_DOCS[1]}`);
  });

  it('docs/plans/james/hero-mode/A/hero-pA5-support-summary.md exists', () => {
    assert.ok(existsSync(resolve(ROOT, REQUIRED_DOCS[2])), `Missing: ${REQUIRED_DOCS[2]}`);
  });

  it('docs/plans/james/hero-mode/A/hero-pA5-production-decision.md exists', () => {
    assert.ok(existsSync(resolve(ROOT, REQUIRED_DOCS[3])), `Missing: ${REQUIRED_DOCS[3]}`);
  });
});

// ── Rollout log structure ────────────────────────────────────────────

describe('Rollout Log — Structural Validation', () => {
  const content = readDoc(REQUIRED_DOCS[0]);

  it('contains required table columns', () => {
    assert.ok(content, 'Rollout log document missing');
    assert.ok(content.includes('Date'), 'Missing column: Date');
    assert.ok(content.includes('Flag') || content.includes('Secret'), 'Missing column: Flag/Secret');
    assert.ok(content.includes('Population'), 'Missing column: Population');
    assert.ok(content.includes('Operator'), 'Missing column: Operator');
    assert.ok(content.includes('Smoke'), 'Missing column: Smoke');
    assert.ok(
      content.includes('Conditions') || content.includes('Stop') || content.includes('Warning'),
      'Missing column: Stop/Warning Conditions'
    );
    assert.ok(content.includes('Decision'), 'Missing column: Decision');
  });
});

// ── Metrics summary content ──────────────────────────────────────────

describe('Metrics Summary — Content Validation', () => {
  const content = readDoc(REQUIRED_DOCS[1]);

  it('references all 14 launch metrics', () => {
    assert.ok(content, 'Metrics summary document missing');

    const launchTerms = [
      [/eligible\s+learner/i, 'eligible learner'],
      [/exposed\s+account/i, 'exposed account'],
      [/quest\s+shown/i, 'Quest shown'],
      [/quest\s+start/i, 'Quest start'],
      [/task\s+start/i, 'task start'],
      [/task\s+completion/i, 'task completion'],
      [/daily.*completion|completion.*count/i, 'daily completion'],
      [/claim\s+success/i, 'claim success'],
      [/claim\s+rejection/i, 'claim rejection'],
      [/coin\s+award/i, 'coin award'],
      [/camp\s+open/i, 'Camp open'],
      [/camp\s+invite/i, 'Camp invite'],
      [/4xx/i, '4xx'],
      [/5xx/i, '5xx'],
    ];

    for (const [pattern, label] of launchTerms) {
      assert.ok(pattern.test(content), `Missing launch metric reference: ${label}`);
    }
  });

  it('references all 10 product metrics', () => {
    assert.ok(content, 'Metrics summary document missing');

    const productTerms = [
      [/start\s+rate/i, 'start rate'],
      [/completion\s+rate/i, 'completion rate'],
      [/return\s+rate/i, 'return rate'],
      [/subject\s+mix/i, 'subject mix'],
      [/task.intent/i, 'task-intent'],
      [/abandonment/i, 'abandonment'],
      [/confusion/i, 'confusion'],
      [/camp.before|before.*learning/i, 'Camp-before-learning'],
      [/extra.*practice|after.*cap/i, 'extra practice after cap'],
      [/warning/i, 'warning'],
    ];

    for (const [pattern, label] of productTerms) {
      assert.ok(pattern.test(content), `Missing product metric reference: ${label}`);
    }
  });

  it('references all 10 safety metrics', () => {
    assert.ok(content, 'Metrics summary document missing');

    const safetyTerms = [
      [/duplicate.*award|duplicate\s+daily/i, 'duplicate daily award'],
      [/duplicate.*debit|duplicate\s+camp/i, 'duplicate Camp debit'],
      [/negative\s+balance/i, 'negative balance'],
      [/dead\s+cta/i, 'dead CTA'],
      [/claim\s+without/i, 'claim without completion'],
      [/raw\s+child/i, 'raw child content'],
      [/mutating|stars.*mastery|mastery.*drift/i, 'mutating Stars/mastery'],
      [/excluded/i, 'exposure to excluded'],
      [/rollback\s+failure/i, 'rollback failure'],
      [/5xx\s+spike/i, '5xx spike'],
    ];

    for (const [pattern, label] of safetyTerms) {
      assert.ok(pattern.test(content), `Missing safety metric reference: ${label}`);
    }
  });
});

// ── Production decision content ──────────────────────────────────────

describe('Production Decision — Outcome Strings', () => {
  const content = readDoc(REQUIRED_DOCS[3]);

  it('contains all 4 exact outcome strings', () => {
    assert.ok(content, 'Production decision document missing');
    assert.ok(content.includes('NORMALISE HERO MODE'), 'Missing outcome: NORMALISE HERO MODE');
    assert.ok(
      content.includes('HOLD AT CURRENT ROLLOUT PERCENTAGE'),
      'Missing outcome: HOLD AT CURRENT ROLLOUT PERCENTAGE'
    );
    assert.ok(
      content.includes('ROLL BACK TO COHORT ONLY'),
      'Missing outcome: ROLL BACK TO COHORT ONLY'
    );
    assert.ok(
      content.includes('KEEP DORMANT AND REWORK'),
      'Missing outcome: KEEP DORMANT AND REWORK'
    );
  });
});

// ── Evidence integrity ───────────────────────────────────────────────

describe('Evidence Integrity', () => {
  it('no deliverable contains real-production provenance as countable data', () => {
    const allPaths = [...REQUIRED_DOCS, REQUIRED_SCRIPT];
    for (const relPath of allPaths) {
      const content = readDoc(relPath);
      if (!content) continue;

      // If 'real-production' appears, it must be annotated as example-only
      if (content.includes('real-production')) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('real-production')) {
            const context = lines.slice(Math.max(0, i - 2), i + 3).join('\n').toLowerCase();
            assert.ok(
              context.includes('example') || context.includes('do not count') || context.includes('template'),
              `File ${relPath} line ${i + 1} has 'real-production' without example annotation`
            );
          }
        }
      }
    }
  });

  it('resolver evidence script is valid JS (imports without throwing)', async () => {
    const scriptPath = resolve(ROOT, REQUIRED_SCRIPT);
    assert.ok(existsSync(scriptPath), `Script missing: ${REQUIRED_SCRIPT}`);

    // Dynamic import validates that the file is parseable and its imports resolve
    // Use pathToFileURL for Windows compatibility (bare paths need file:// protocol)
    const { pathToFileURL } = await import('node:url');
    const scriptUrl = pathToFileURL(scriptPath).href;
    await assert.doesNotReject(
      () => import(scriptUrl),
      `${REQUIRED_SCRIPT} throws on import`
    );
  });
});
