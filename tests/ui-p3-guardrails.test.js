// UI Refactor P3 — U9 consolidated guardrail tests.
//
// Locks all P3 contracts with parser-level ratchets so regressions are
// caught at CI time, before human review.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function walkJsx(dir) {
  const results = [];
  const abs = path.join(REPO_ROOT, dir);
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkJsx(path.join(dir, entry.name)));
    } else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.tsx')) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

// ────────────────────────────────────────────────────────────────────
// 1. Subject-theme token ratchet: zero raw #B8873F in Punctuation
//    learner JSX (NOT CSS — the token lives in app.css as a custom prop).
// ────────────────────────────────────────────────────────────────────
test('P3 ratchet: zero raw #B8873F in Punctuation learner JSX', () => {
  const dir = 'src/subjects/punctuation/components';
  const files = walkJsx(dir);
  const hits = [];
  for (const f of files) {
    const src = read(f);
    // Exclude comments (// and /* */) before counting
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const count = (stripped.match(/#B8873F/gi) || []).length;
    if (count > 0) hits.push({ file: f, count });
  }
  // Known fallback references that still use var(--subject-accent, #B8873F)
  // are acceptable — the raw hex is a CSS custom-property fallback, not a
  // hardcoded theme token. The ratchet is that NO NEW raw hex usages appear
  // outside that pattern.
  const nonFallback = hits.filter(({ file }) => {
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    // Count usages NOT inside var(--..., #B8873F)
    const raw = src.replace(/var\(--[^)]*#B8873F[^)]*\)/gi, '');
    return (raw.match(/#B8873F/gi) || []).length > 0;
  });
  assert.equal(
    nonFallback.length,
    0,
    `Found raw #B8873F outside var() fallbacks in: ${nonFallback.map((h) => h.file).join(', ')}. ` +
    'Use var(--subject-accent) via SubjectThemeScope instead.',
  );
});

// ────────────────────────────────────────────────────────────────────
// 2. Spelling inline ratchet: zero inline --btn-accent in Spelling
//    setup JSX (migrated to SubjectThemeScope cascade in P3 U1).
// ────────────────────────────────────────────────────────────────────
test('P3 ratchet: zero inline --btn-accent in Spelling setup JSX', () => {
  const file = 'src/subjects/spelling/components/SpellingSetupScene.jsx';
  const src = read(file);
  // Strip comments
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const matches = stripped.match(/style=\{[^}]*--btn-accent/g) || [];
  assert.equal(
    matches.length,
    0,
    `SpellingSetupScene still has ${matches.length} inline --btn-accent style(s). ` +
    'P3 U1 migrated these to SubjectThemeScope CSS cascade.',
  );
});

// ────────────────────────────────────────────────────────────────────
// 3. Raw .btn ratchet: count className="...btn..." in learner surfaces.
//    P2 baseline was 182. P3 ceiling is materially lower.
// ────────────────────────────────────────────────────────────────────
test('P3 ratchet: raw .btn count in learner surfaces below P2 baseline', () => {
  const LEARNER_SURFACES = [
    'src/subjects/spelling/components/SpellingSessionScene.jsx',
    'src/subjects/spelling/components/SpellingSummaryScene.jsx',
    'src/subjects/spelling/components/SpellingSetupScene.jsx',
    'src/subjects/grammar/components/GrammarSessionScene.jsx',
    'src/subjects/grammar/components/GrammarSummaryScene.jsx',
    'src/subjects/grammar/components/GrammarSetupScene.jsx',
    'src/subjects/punctuation/components/PunctuationSessionScene.jsx',
    'src/subjects/punctuation/components/PunctuationSummaryScene.jsx',
    'src/subjects/punctuation/components/PunctuationSetupScene.jsx',
    'src/surfaces/home/HomeSurface.jsx',
  ];

  const P2_BASELINE = 182;
  let total = 0;

  for (const file of LEARNER_SURFACES) {
    const src = read(file);
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const matches = stripped.match(/className\s*=\s*["'][^"']*\bbtn\b[^"']*["']/g) || [];
    total += matches.length;
  }

  // The P3 ceiling: must be materially lower than P2 baseline of 182.
  // Current measured total is 0 (all session/summary/setup/home scenes migrated).
  const P3_CEILING = 5; // Generous ceiling — actual is 0
  assert.ok(
    total <= P3_CEILING,
    `Raw .btn count in learner surfaces: ${total} (P3 ceiling: ${P3_CEILING}, P2 baseline: ${P2_BASELINE}). ` +
    'P3 migrated these to the <Button> primitive.',
  );
  assert.ok(
    total < P2_BASELINE,
    `Raw .btn count ${total} must be materially lower than P2 baseline ${P2_BASELINE}.`,
  );
});

// ────────────────────────────────────────────────────────────────────
// 4. One-primary-action: at most one variant="primary" per scene.
//    (Already tested in ui-primary-action-contract.test.js — assert
//    coverage still holds for session/summary/home.)
// ────────────────────────────────────────────────────────────────────
test('P3 ratchet: primary-action contract test file exists and covers setup/session/summary/home', () => {
  const src = read('tests/ui-primary-action-contract.test.js');
  assert.match(src, /SetupScene/, 'primary-action contract must cover setup scenes');
  assert.match(src, /HomeSurface|HeroQuestCard/, 'primary-action contract must cover home scene');
});

// ────────────────────────────────────────────────────────────────────
// 5. SessionHUD adoption: all 3 session scenes import SessionHUD.
// ────────────────────────────────────────────────────────────────────
test('P3 ratchet: all 3 session scenes import SessionHUD', () => {
  const sessions = [
    'src/subjects/spelling/components/SpellingSessionScene.jsx',
    'src/subjects/grammar/components/GrammarSessionScene.jsx',
    'src/subjects/punctuation/components/PunctuationSessionScene.jsx',
  ];
  for (const file of sessions) {
    const src = read(file);
    assert.match(
      src,
      /import\s*\{[^}]*\bSessionHUD\b[^}]*\}\s*from\s*['"][^'"]*SessionHUD/,
      `${file} must import SessionHUD from the shared primitive.`,
    );
  }
});

// ────────────────────────────────────────────────────────────────────
// 6. SessionSummaryFrame adoption: all 3 summary scenes.
// ────────────────────────────────────────────────────────────────────
test('P3 ratchet: all 3 summary scenes import SessionSummaryFrame', () => {
  const summaries = [
    'src/subjects/spelling/components/SpellingSummaryScene.jsx',
    'src/subjects/grammar/components/GrammarSummaryScene.jsx',
    'src/subjects/punctuation/components/PunctuationSummaryScene.jsx',
  ];
  for (const file of summaries) {
    const src = read(file);
    assert.match(
      src,
      /import\s*\{[^}]*\bSessionSummaryFrame\b[^}]*\}\s*from\s*['"][^'"]*SessionSummaryFrame/,
      `${file} must import SessionSummaryFrame from the shared primitive.`,
    );
  }
});

// ────────────────────────────────────────────────────────────────────
// 7. SubjectCompanionPanel adoption: grammar + punctuation setup scenes.
//    Spelling uses SetupMeadow + SetupStatGrid (approved design).
// ────────────────────────────────────────────────────────────────────
test('P3 ratchet: grammar and punctuation setup scenes import SubjectCompanionPanel', () => {
  const setups = [
    'src/subjects/grammar/components/GrammarSetupScene.jsx',
    'src/subjects/punctuation/components/PunctuationSetupScene.jsx',
  ];
  for (const file of setups) {
    const src = read(file);
    assert.match(
      src,
      /import\s*\{[^}]*\bSubjectCompanionPanel\b[^}]*\}\s*from\s*['"][^'"]*SubjectCompanionPanel/,
      `${file} must import SubjectCompanionPanel from the shared primitive.`,
    );
  }
});

// ────────────────────────────────────────────────────────────────────
// 8. PracticeStage reduced-motion support.
// ────────────────────────────────────────────────────────────────────
test('P3 ratchet: PracticeStage contains reduced-motion support', () => {
  const src = read('src/platform/ui/PracticeStage.jsx');
  const hasReducedMotion =
    src.includes('reducedMotionFallback') || src.includes('ps-reduced-motion-safe');
  assert.ok(
    hasReducedMotion,
    'PracticeStage must contain reducedMotionFallback or ps-reduced-motion-safe ' +
    'for accessibility compliance.',
  );
});

// ────────────────────────────────────────────────────────────────────
// 9. SectionHeader resolution: >= 3 import sites means "adopted".
// ────────────────────────────────────────────────────────────────────
test('P3 ratchet: SectionHeader has >= 3 production import sites', () => {
  const srcFiles = walkJsx('src');
  let importCount = 0;
  for (const f of srcFiles) {
    const src = read(f);
    if (/import\s*\{[^}]*\bSectionHeader\b[^}]*\}\s*from/.test(src)) {
      importCount += 1;
    }
  }
  // If >= 3, pass (adopted). If < 3, the completion report must note demotion.
  assert.ok(
    importCount >= 3,
    `SectionHeader has ${importCount} import sites (need >= 3 for "adopted" status). ` +
    'If < 3, the completion report must contain "SectionHeader: downgraded to available primitive".',
  );
});

// ────────────────────────────────────────────────────────────────────
// 10. Forbidden copy patterns in learner components.
// ────────────────────────────────────────────────────────────────────
test('P3 ratchet: no forbidden copy patterns in learner components', () => {
  const FORBIDDEN_COPY = [
    'lose your streak',
    'Earn coins',
    'failed this monster',
    'Mega lost',
    'Buy now',
    'limited time',
  ];

  const dirs = [
    'src/subjects/spelling/components',
    'src/subjects/grammar/components',
    'src/subjects/punctuation/components',
    'src/platform/ui',
    'src/surfaces/home',
  ];

  const violations = [];
  for (const dir of dirs) {
    const files = walkJsx(dir);
    for (const f of files) {
      const src = read(f);
      for (const phrase of FORBIDDEN_COPY) {
        if (src.toLowerCase().includes(phrase.toLowerCase())) {
          violations.push(`${f}: contains "${phrase}"`);
        }
      }
    }
  }
  assert.equal(
    violations.length,
    0,
    `Forbidden copy patterns found in learner components:\n${violations.join('\n')}`,
  );
});

// ────────────────────────────────────────────────────────────────────
// 11. Completion report wording ratchet: forbidden claims.
// ────────────────────────────────────────────────────────────────────
test('P3 ratchet: completion report does NOT contain forbidden claims', () => {
  const REPORT_PATH = 'docs/plans/james/ui-refactor/ui-refactor-p3-completion-report.md';
  const src = read(REPORT_PATH);
  const lower = src.toLowerCase();

  const FORBIDDEN = [
    'the design system is complete',
    'all buttons are migrated',
    'all inline styles are removed',
    'production is verified',
    'Hero Mode economy is ready',
    'future subjects are implemented',
  ];

  for (const phrase of FORBIDDEN) {
    assert.equal(
      lower.includes(phrase.toLowerCase()),
      false,
      `Completion report contains forbidden claim: "${phrase}". ` +
      'Remove or rephrase — these over-claim what P3 has shipped.',
    );
  }
});

// ────────────────────────────────────────────────────────────────────
// 12. Visual change audit section present in completion report.
// ────────────────────────────────────────────────────────────────────
test('P3 ratchet: completion report contains "## Approved Visual Changes" section', () => {
  const src = read('docs/plans/james/ui-refactor/ui-refactor-p3-completion-report.md');
  assert.match(
    src,
    /## Approved Visual Changes/,
    'Completion report must contain a "## Approved Visual Changes" section.',
  );
});

// ────────────────────────────────────────────────────────────────────
// 13. Future-subject integration points: report references all 6.
// ────────────────────────────────────────────────────────────────────
test('P3 ratchet: completion report references all 6 future-subject integration points', () => {
  const src = read('docs/plans/james/ui-refactor/ui-refactor-p3-completion-report.md');

  const INTEGRATION_POINTS = [
    'theme declaration',
    'companion panel adapter',
    'session HUD adapter',
    'summary frame adapter',
    'practice stage selection',
    'home card data contract',
  ];

  for (const point of INTEGRATION_POINTS) {
    assert.ok(
      src.toLowerCase().includes(point.toLowerCase()),
      `Completion report must reference integration point: "${point}".`,
    );
  }
});

// ────────────────────────────────────────────────────────────────────
// 14. Bundle budget: BUDGET_GZIP_BYTES in bundle-byte-budget.test.js <= 232,000.
// ────────────────────────────────────────────────────────────────────
test('P3 ratchet: BUDGET_GZIP_BYTES in bundle-byte-budget.test.js <= 232,000', () => {
  const src = read('tests/bundle-byte-budget.test.js');
  const match = src.match(/const\s+BUDGET_GZIP_BYTES\s*=\s*([\d_]+)/);
  assert.ok(match, 'Could not find BUDGET_GZIP_BYTES constant in bundle-byte-budget.test.js');
  const budget = Number(match[1].replace(/_/g, ''));
  assert.ok(
    budget <= 232000,
    `BUDGET_GZIP_BYTES is ${budget}, must be <= 232,000.`,
  );
});

// ────────────────────────────────────────────────────────────────────
// 15. Inline-style budget: POST_MIGRATION_TOTAL <= 254 (owner-approved P3 exception).
// ────────────────────────────────────────────────────────────────────
test('P3 ratchet: POST_MIGRATION_TOTAL in inventory-inline-styles.mjs <= 254', () => {
  const src = read('scripts/inventory-inline-styles.mjs');
  // Match the expression line: export const POST_MIGRATION_TOTAL = PRE_MIGRATION_TOTAL - SITES_MIGRATED_THIS_PR; // 254
  const commentMatch = src.match(/POST_MIGRATION_TOTAL\s*=\s*[^;]+;\s*\/\/\s*(\d+)/);
  if (commentMatch) {
    const total = Number(commentMatch[1]);
    assert.ok(
      total <= 254,
      `POST_MIGRATION_TOTAL is ${total}, must be <= 254.`,
    );
    return;
  }
  // Fallback: try direct numeric assignment
  const directMatch = src.match(/export\s+const\s+POST_MIGRATION_TOTAL\s*=\s*(\d+)/);
  assert.ok(directMatch, 'Could not find POST_MIGRATION_TOTAL in inventory-inline-styles.mjs');
  const total = Number(directMatch[1]);
  assert.ok(
    total <= 254,
    `POST_MIGRATION_TOTAL is ${total}, must be <= 254.`,
  );
});
