import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// UI Refactor P3 U4 — Practice Stage Contract tests.
//
// Verifies:
//   1. Stage renders children (content passthrough)
//   2. motion="none" produces no animation CSS class
//   3. Missing asset fallback uses solid colour (no broken image reference)
//   4. prefers-reduced-motion support via CSS class
//   5. Children never shift position (no layout-affecting properties in stage)
//   6. Decorative-only contract (no interactive elements in stage itself)
//   7. 3+ subject adoption gate

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readSource(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8');
}

// ---------------------------------------------------------------------------
// Source-level analysis of PracticeStage.jsx
// ---------------------------------------------------------------------------

const STAGE_SOURCE = readSource('src/platform/ui/PracticeStage.jsx');

test('PracticeStage exports a named function', () => {
  assert.ok(
    STAGE_SOURCE.includes('export function PracticeStage'),
    'PracticeStage.jsx must export a named function PracticeStage',
  );
});

test('PracticeStage renders children (content passthrough)', () => {
  assert.ok(
    STAGE_SOURCE.includes('{children}'),
    'PracticeStage must render {children} for content passthrough',
  );
});

test('PracticeStage motion="none" produces no animation class', () => {
  // The MOTION_CLASSES map must have none -> empty string
  assert.ok(
    STAGE_SOURCE.includes("none: ''"),
    'MOTION_CLASSES must map "none" to empty string (no animation class)',
  );
});

test('PracticeStage uses solid colour fallback, never references image assets', () => {
  // No <img>, no url(), no src= in PracticeStage source
  assert.ok(!STAGE_SOURCE.includes('<img'), 'PracticeStage must not render <img> elements');
  assert.ok(!STAGE_SOURCE.includes('url('), 'PracticeStage must not reference url() for images');
  assert.ok(!STAGE_SOURCE.includes('src='), 'PracticeStage must not use src= attribute');
  // Must reference subject-themes for accent colour fallback
  assert.ok(
    STAGE_SOURCE.includes('getSubjectTheme'),
    'PracticeStage must use getSubjectTheme for colour fallback',
  );
});

test('PracticeStage supports prefers-reduced-motion via CSS class', () => {
  assert.ok(
    STAGE_SOURCE.includes('ps-reduced-motion-safe'),
    'PracticeStage must apply ps-reduced-motion-safe class for reduced-motion support',
  );
  assert.ok(
    STAGE_SOURCE.includes('reducedMotionFallback'),
    'PracticeStage must accept reducedMotionFallback prop',
  );
});

test('PracticeStage has no layout-affecting animation properties', () => {
  // Must not contain margin/padding/width/height manipulation — only
  // transforms and opacity are acceptable for motion.
  const forbidden = ['marginTop', 'marginLeft', 'paddingTop', 'paddingLeft', 'width:', 'height:'];
  for (const prop of forbidden) {
    assert.ok(
      !STAGE_SOURCE.includes(prop),
      `PracticeStage must not use layout-affecting property "${prop}"`,
    );
  }
});

test('PracticeStage is decorative-only — no interactive elements', () => {
  // The stage wrapper itself must not contain buttons, links, or inputs
  // (children are the callers responsibility, not the stage)
  assert.ok(!STAGE_SOURCE.includes('<button'), 'PracticeStage must not render <button>');
  assert.ok(!STAGE_SOURCE.includes('<a '), 'PracticeStage must not render <a>');
  assert.ok(!STAGE_SOURCE.includes('<input'), 'PracticeStage must not render <input>');
  assert.ok(!STAGE_SOURCE.includes('onClick'), 'PracticeStage must not have onClick handlers');
});

test('PracticeStage component is small (under 55 lines of meaningful code)', () => {
  const lines = STAGE_SOURCE.split('\n');
  // Count non-blank, non-comment lines
  const meaningful = lines.filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('//') && !t.startsWith('*');
  });
  assert.ok(
    meaningful.length <= 55,
    `PracticeStage has ${meaningful.length} meaningful lines, exceeds 55-line budget`,
  );
});

// ---------------------------------------------------------------------------
// Subject adoption gate — at least 3 subjects must import PracticeStage
// ---------------------------------------------------------------------------

const ADOPTION_PATHS = [
  'src/subjects/spelling/components/SpellingSessionScene.jsx',
  'src/subjects/grammar/components/GrammarSetupScene.jsx',
  'src/subjects/grammar/components/GrammarSessionScene.jsx',
  'src/subjects/punctuation/components/PunctuationSetupScene.jsx',
  'src/subjects/punctuation/components/PunctuationSessionScene.jsx',
];

test('PracticeStage adopted in 3+ subject scenes (adoption gate)', () => {
  const subjects = new Set();
  for (const filePath of ADOPTION_PATHS) {
    const source = readSource(filePath);
    if (source.includes('PracticeStage')) {
      // Extract subject from path
      const match = filePath.match(/subjects\/([^/]+)\//);
      if (match) subjects.add(match[1]);
    }
  }
  assert.ok(
    subjects.size >= 3,
    `PracticeStage must be adopted in 3+ subjects, found ${subjects.size}: ${[...subjects].join(', ')}`,
  );
});

test('P4 U6 ready subject stages opt into visible CSS motion classes', () => {
  const expectations = [
    {
      path: 'src/subjects/spelling/components/SpellingSessionScene.jsx',
      patterns: [/motion=\{awaitingAdvance \? 'celebration' : 'active'\}/],
    },
    {
      path: 'src/subjects/grammar/components/GrammarSetupScene.jsx',
      patterns: [/motion="calm"/],
    },
    {
      path: 'src/subjects/grammar/components/GrammarSessionScene.jsx',
      patterns: [/motion=\{isFeedback \? 'celebration' : 'active'\}/],
    },
    {
      path: 'src/subjects/punctuation/components/PunctuationSetupScene.jsx',
      patterns: [/motion="calm"/],
    },
    {
      path: 'src/subjects/punctuation/components/PunctuationSessionScene.jsx',
      patterns: [/motion=\{phase === 'feedback' \? 'celebration' : 'active'\}/],
    },
  ];

  for (const expectation of expectations) {
    const source = readSource(expectation.path);
    for (const pattern of expectation.patterns) {
      assert.match(source, pattern, `${expectation.path} must opt into a non-none PracticeStage motion class`);
    }
  }
});

test('PracticeStage adoption preserves data-action selectors in spelling', () => {
  const source = readSource('src/subjects/spelling/components/SpellingSessionScene.jsx');
  const requiredSelectors = [
    'data-action="spelling-submit-form"',
    'spelling-replay',
    'spelling-continue',
    'spelling-end-early',
  ];
  for (const sel of requiredSelectors) {
    assert.ok(source.includes(sel), `SpellingSessionScene must preserve "${sel}" after PracticeStage adoption`);
  }
});

test('PracticeStage adoption preserves data-action selectors in grammar setup', () => {
  const source = readSource('src/subjects/grammar/components/GrammarSetupScene.jsx');
  assert.ok(source.includes('data-grammar-phase-root="dashboard"'), 'GrammarSetupScene must preserve data-grammar-phase-root');
  assert.ok(source.includes('data-action="grammar-set-mode"'), 'GrammarSetupScene must preserve grammar-set-mode');
});

test('PracticeStage adoption preserves data-action selectors in grammar session', () => {
  const source = readSource('src/subjects/grammar/components/GrammarSessionScene.jsx');
  assert.ok(source.includes('data-grammar-phase-root="session"'), 'GrammarSessionScene must preserve data-grammar-phase-root');
});

test('PracticeStage adoption preserves data-punctuation selectors in punctuation setup', () => {
  const source = readSource('src/subjects/punctuation/components/PunctuationSetupScene.jsx');
  assert.ok(source.includes('data-punctuation-phase="setup"'), 'PunctuationSetupScene must preserve data-punctuation-phase');
});

test('PracticeStage adoption preserves data-punctuation selectors in punctuation session', () => {
  const source = readSource('src/subjects/punctuation/components/PunctuationSessionScene.jsx');
  assert.ok(source.includes('data-punctuation-session-scene'), 'PunctuationSessionScene must preserve data-punctuation-session-scene');
  assert.ok(source.includes('data-punctuation-phase'), 'PunctuationSessionScene must preserve data-punctuation-phase');
});
