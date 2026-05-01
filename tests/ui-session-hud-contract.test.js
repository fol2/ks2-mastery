// UI Refactor P3 U3 — Session HUD contract tests.
//
// Verifies the shared SessionHUD component meets its behavioural contract:
//   1. Progress never exceeds 100%
//   2. remainingCount cannot be negative
//   3. zero-total renders safe fallback, not NaN
//   4. aria-valuenow, aria-valuemin, aria-valuemax present
//   5. Accessible label describes progress
//   6. Reduced-motion produces static progress (CSS-level, verified via source)
//   7. No forbidden copy patterns
//   8. SubjectThemeScope integration (uses subject tokens for accent)
//   9. Component is stateless (no store imports)
//  10. Adoption in all three ready subjects

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readSource(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8');
}

const HUD_SOURCE = readSource('src/platform/ui/SessionHUD.jsx');

// ---------------------------------------------------------------------------
// 1. Progress never exceeds 100%
// ---------------------------------------------------------------------------

test('U3 SessionHUD: progress percentage clamped to 100 max via Math.min', () => {
  // The source must clamp percent to max 100
  assert.ok(
    HUD_SOURCE.includes('Math.min(100,'),
    'SessionHUD must clamp percentage to 100 via Math.min(100, ...)',
  );
});

test('U3 SessionHUD: safeAnswered cannot exceed safeTotal', () => {
  // safeAnswered = Math.min(safeTotal, ...)
  assert.ok(
    HUD_SOURCE.includes('Math.min(safeTotal, Math.max(0,'),
    'SessionHUD must clamp answered to safeTotal',
  );
});

// ---------------------------------------------------------------------------
// 2. remainingCount cannot be negative
// ---------------------------------------------------------------------------

test('U3 SessionHUD: remainingCount floored to 0', () => {
  assert.ok(
    HUD_SOURCE.includes('Math.max(0, remainingNumber)') &&
      HUD_SOURCE.includes('Math.min(safeTotal, Math.max(0, remainingNumber))'),
    'SessionHUD must floor remainingCount to 0',
  );
});

// ---------------------------------------------------------------------------
// 3. zero-total renders safe fallback, not NaN
// ---------------------------------------------------------------------------

test('U3 SessionHUD: zero total renders "Getting ready" fallback', () => {
  assert.ok(
    HUD_SOURCE.includes("'Getting ready\\u2026'") || HUD_SOURCE.includes("'Getting ready…'"),
    'SessionHUD must render a safe fallback string when total is 0',
  );
});

test('U3 SessionHUD: safeTotal uses Math.max(0, ...) to avoid negative', () => {
  assert.ok(
    HUD_SOURCE.includes('Math.max(0, Number(totalCount)'),
    'SessionHUD must normalise totalCount to non-negative',
  );
});

// ---------------------------------------------------------------------------
// 4. aria-valuenow, aria-valuemin, aria-valuemax present (via ProgressMeter)
// ---------------------------------------------------------------------------

test('U3 SessionHUD: uses ProgressMeter which provides ARIA attributes', () => {
  assert.ok(
    HUD_SOURCE.includes("import { ProgressMeter }"),
    'SessionHUD must import ProgressMeter',
  );
  assert.ok(
    HUD_SOURCE.includes('<ProgressMeter'),
    'SessionHUD must render a ProgressMeter element',
  );
});

test('U3 ProgressMeter: has aria-valuenow, aria-valuemin, aria-valuemax', () => {
  const source = readSource('src/platform/ui/ProgressMeter.jsx');
  assert.ok(source.includes('aria-valuenow'), 'ProgressMeter must have aria-valuenow');
  assert.ok(source.includes('aria-valuemin'), 'ProgressMeter must have aria-valuemin');
  assert.ok(source.includes('aria-valuemax'), 'ProgressMeter must have aria-valuemax');
  assert.ok(source.includes('role="progressbar"'), 'ProgressMeter must have role="progressbar"');
});

// ---------------------------------------------------------------------------
// 5. Accessible label describes progress
// ---------------------------------------------------------------------------

test('U3 SessionHUD: passes a descriptive aria label to ProgressMeter', () => {
  assert.ok(
    HUD_SOURCE.includes('Question progress:'),
    'SessionHUD must include "Question progress:" in the aria label',
  );
  assert.ok(
    HUD_SOURCE.includes('answered'),
    'SessionHUD aria label must mention "answered"',
  );
});

// ---------------------------------------------------------------------------
// 6. Reduced-motion produces static progress (CSS-level)
// ---------------------------------------------------------------------------

test('U3 SessionHUD: CSS reduces motion on progress-meter-fill', () => {
  const css = readSource('styles/app.css');
  // The existing CSS has @media (prefers-reduced-motion: reduce) rule for
  // .progress-meter-fill that sets transition: none
  assert.ok(
    css.includes('prefers-reduced-motion: reduce'),
    'app.css must have a prefers-reduced-motion rule',
  );
  assert.ok(
    css.includes('.progress-meter-fill') && css.includes('transition: none'),
    'app.css must disable progress-meter-fill transition under reduced-motion',
  );
});

// ---------------------------------------------------------------------------
// 7. No forbidden copy patterns
// ---------------------------------------------------------------------------

const FORBIDDEN_COPY = [
  'lose your streak',
  'Earn coins',
  'failed this monster',
  'Mega lost',
];

// Strip single-line comments before checking for forbidden copy — the
// constraint is that these strings never appear in rendered JSX output,
// not that they cannot be mentioned in documentation comments.
function stripComments(source) {
  return source.split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');
}

test('U3 SessionHUD: no forbidden copy patterns in rendered output', () => {
  const code = stripComments(HUD_SOURCE);
  for (const pattern of FORBIDDEN_COPY) {
    assert.ok(
      !code.toLowerCase().includes(pattern.toLowerCase()),
      `SessionHUD must not contain forbidden copy "${pattern}" in rendered output`,
    );
  }
});

// ---------------------------------------------------------------------------
// 8. SubjectThemeScope integration — data-subject attribute present
// ---------------------------------------------------------------------------

test('U3 SessionHUD: renders data-subject for theme cascade', () => {
  assert.ok(
    HUD_SOURCE.includes('data-subject'),
    'SessionHUD must render data-subject attribute for SubjectThemeScope integration',
  );
});

// ---------------------------------------------------------------------------
// 9. Component is stateless — no store subscription
// ---------------------------------------------------------------------------

test('U3 SessionHUD: no store import (stateless contract)', () => {
  const code = stripComments(HUD_SOURCE);
  assert.ok(
    !code.includes('usePlatformStore'),
    'SessionHUD must not import usePlatformStore',
  );
  assert.ok(
    !code.includes('useStore'),
    'SessionHUD must not import useStore',
  );
  assert.ok(
    !code.includes('useState'),
    'SessionHUD must not use useState (stateless)',
  );
  assert.ok(
    !code.includes('useEffect'),
    'SessionHUD must not use useEffect (stateless)',
  );
});

// ---------------------------------------------------------------------------
// 10. Adoption in all three ready subjects
// ---------------------------------------------------------------------------

test('U3 SessionHUD: adopted in SpellingSessionScene', () => {
  const source = readSource('src/subjects/spelling/components/SpellingSessionScene.jsx');
  assert.ok(
    source.includes("import { SessionHUD }"),
    'SpellingSessionScene must import SessionHUD',
  );
  assert.ok(
    source.includes('<SessionHUD'),
    'SpellingSessionScene must render SessionHUD',
  );
  assert.ok(
    source.includes('subjectId="spelling"'),
    'SpellingSessionScene must pass subjectId="spelling" to SessionHUD',
  );
});

test('U3 SessionHUD: adopted in GrammarSessionScene', () => {
  const source = readSource('src/subjects/grammar/components/GrammarSessionScene.jsx');
  assert.ok(
    source.includes("import { SessionHUD }"),
    'GrammarSessionScene must import SessionHUD',
  );
  assert.ok(
    source.includes('<SessionHUD'),
    'GrammarSessionScene must render SessionHUD',
  );
  assert.ok(
    source.includes('subjectId="grammar"'),
    'GrammarSessionScene must pass subjectId="grammar" to SessionHUD',
  );
});

test('U3 SessionHUD: adopted in PunctuationSessionScene', () => {
  const source = readSource('src/subjects/punctuation/components/PunctuationSessionScene.jsx');
  assert.ok(
    source.includes("import { SessionHUD }"),
    'PunctuationSessionScene must import SessionHUD',
  );
  assert.ok(
    source.includes('<SessionHUD'),
    'PunctuationSessionScene must render SessionHUD',
  );
  assert.ok(
    source.includes('subjectId="punctuation"'),
    'PunctuationSessionScene must pass subjectId="punctuation" to SessionHUD',
  );
});

// ---------------------------------------------------------------------------
// 11. Existing data-action / data-value selectors preserved
// ---------------------------------------------------------------------------

test('U3 Spelling session: preserves all data-action selectors', () => {
  const source = readSource('src/subjects/spelling/components/SpellingSessionScene.jsx');
  // P3 U2: Button primitive uses `dataAction` prop (renders as `data-action`
  // in the DOM). Accept either the raw HTML attribute or the JSX prop form.
  const requiredActions = [
    'spelling-back',
    'spelling-submit-form',
    'spelling-replay',
    'spelling-replay-slow',
    'spelling-continue',
    'spelling-skip',
    'spelling-end-early',
  ];
  for (const action of requiredActions) {
    const hasRaw = source.includes(`data-action="${action}"`);
    const hasProp = source.includes(`dataAction="${action}"`);
    assert.ok(hasRaw || hasProp, `SpellingSessionScene must preserve data-action="${action}" (via raw attribute or dataAction prop)`);
  }
});

test('U3 Grammar session: preserves data-grammar-phase-root selector', () => {
  const source = readSource('src/subjects/grammar/components/GrammarSessionScene.jsx');
  assert.ok(
    source.includes('data-grammar-phase-root="session"'),
    'GrammarSessionScene must preserve data-grammar-phase-root="session"',
  );
});

test('U3 Punctuation session: preserves data-punctuation selectors', () => {
  const source = readSource('src/subjects/punctuation/components/PunctuationSessionScene.jsx');
  const requiredSelectors = [
    'data-punctuation-session-scene',
    'data-punctuation-phase',
    'data-punctuation-submit',
    'data-punctuation-skip',
    'data-punctuation-continue',
    'data-punctuation-end-round',
  ];
  for (const sel of requiredSelectors) {
    assert.ok(source.includes(sel), `PunctuationSessionScene must preserve "${sel}"`);
  }
});

// ---------------------------------------------------------------------------
// 12. Module-level export contract
// ---------------------------------------------------------------------------

test('U3 SessionHUD: exports a named function', () => {
  assert.ok(
    HUD_SOURCE.includes('export function SessionHUD'),
    'SessionHUD.jsx must export a named function SessionHUD',
  );
});

test('U3 SessionHUD: module imports ProgressMeter from correct path', () => {
  assert.ok(
    HUD_SOURCE.includes("from './ProgressMeter.jsx'"),
    'SessionHUD must import ProgressMeter from the platform ui directory',
  );
});
