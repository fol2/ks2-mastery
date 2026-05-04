import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// UI Refactor P3 U1 — Subject Theme Token Contract tests.
//
// Verifies:
//   1. Punctuation scenes have zero raw `#B8873F` hex in JSX (grep ratchet)
//   2. Spelling setup has zero inline `--btn-accent` in JSX
//   3. Grammar accent consumption unchanged (CSS-level, no inline overrides)
//   4. SubjectThemeScope renders correct attributes
//   5. Dark-mode tokens resolve for all three ready subjects
//   6. Unknown subjectId doesn't crash SubjectThemeScope
//   7. data-* journey selectors preserved in migrated files

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readSource(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8');
}

// ---------------------------------------------------------------------------
// 1. Punctuation scenes: zero raw #B8873F in JSX (except CSS-var fallbacks)
// ---------------------------------------------------------------------------

const PUNCTUATION_SCENE_PATHS = [
  'src/subjects/punctuation/components/PunctuationSetupScene.jsx',
  'src/subjects/punctuation/components/PunctuationSessionScene.jsx',
  'src/subjects/punctuation/components/PunctuationSummaryScene.jsx',
  'src/subjects/punctuation/components/PunctuationMapScene.jsx',
];

test('Punctuation scenes: no bare #B8873F in JSX — must use CSS variable', () => {
  for (const filePath of PUNCTUATION_SCENE_PATHS) {
    const source = readSource(filePath);
    const lines = source.split('\n');
    const violations = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment-only lines
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
      // A bare hex literal NOT inside a var() fallback is a violation.
      // Matches: '#B8873F' or "#B8873F" without a preceding `var(` on the same line.
      if (/#B8873F/i.test(line) && !line.includes('var(')) {
        violations.push({ file: filePath, line: i + 1, text: line.trim() });
      }
    }
    assert.equal(
      violations.length,
      0,
      `Found bare #B8873F hex in ${filePath} at line(s): ${violations.map((v) => v.line).join(', ')}. ` +
      'Use var(--subject-accent, #B8873F) instead.',
    );
  }
});

test('Punctuation scenes: no bare #E8C88E in JSX', () => {
  for (const filePath of PUNCTUATION_SCENE_PATHS) {
    const source = readSource(filePath);
    const lines = source.split('\n');
    const violations = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
      if (/#E8C88E/i.test(line) && !line.includes('var(')) {
        violations.push({ file: filePath, line: i + 1 });
      }
    }
    assert.equal(violations.length, 0, `Found bare #E8C88E hex in ${filePath}`);
  }
});

// ---------------------------------------------------------------------------
// 2. Spelling setup: zero inline --btn-accent
// ---------------------------------------------------------------------------

test('Spelling setup: no inline --btn-accent style override', () => {
  const source = readSource('src/subjects/spelling/components/SpellingSetupScene.jsx');
  // Match pattern: style={{ ... '--btn-accent' ... }}
  // A style prop containing '--btn-accent' as a key is a violation.
  const inlineAccentPattern = /style=\{\{[^}]*['"]--btn-accent['"]/;
  assert.equal(
    inlineAccentPattern.test(source),
    false,
    'SpellingSetupScene.jsx still contains an inline --btn-accent style override. ' +
    'The SubjectThemeScope CSS remap should provide --btn-accent.',
  );
});

// ---------------------------------------------------------------------------
// 3. Grammar accent consumption: CSS-level, no new inline overrides
// ---------------------------------------------------------------------------

test('Grammar setup: accent still consumed via CSS class, not inline --btn-accent', () => {
  const source = readSource('src/subjects/grammar/components/GrammarSetupScene.jsx');
  // Grammar should NOT have inline --btn-accent — it uses .grammar-setup-main CSS
  const inlineAccentPattern = /style=\{\{[^}]*['"]--btn-accent['"]/;
  assert.equal(
    inlineAccentPattern.test(source),
    false,
    'GrammarSetupScene.jsx should not use inline --btn-accent — accent flows via CSS.',
  );
});

test('Grammar accent CSS rule exists in app.css', () => {
  const css = readSource('styles/app.css');
  assert.ok(
    css.includes('--grammar-accent:'),
    'styles/app.css must declare --grammar-accent token.',
  );
  assert.ok(
    css.includes('.grammar-setup-main'),
    'styles/app.css must have a .grammar-setup-main selector for accent remap.',
  );
});

// ---------------------------------------------------------------------------
// 4. SubjectThemeScope renders correct attributes
// ---------------------------------------------------------------------------

test('SubjectThemeScope module exports a named function', () => {
  const source = readSource('src/platform/ui/SubjectThemeScope.jsx');
  assert.ok(
    source.includes('export function SubjectThemeScope'),
    'SubjectThemeScope.jsx must export a named function SubjectThemeScope',
  );
});

test('SubjectThemeScope source renders data-subject and className', () => {
  const source = readSource('src/platform/ui/SubjectThemeScope.jsx');
  assert.ok(source.includes('data-subject'), 'Must render data-subject attribute');
  assert.ok(source.includes('subject-theme'), 'Must render subject-theme className');
  assert.ok(source.includes('children'), 'Must render children');
});

// ---------------------------------------------------------------------------
// 5. Dark-mode tokens for all three ready subjects (spelling, grammar, punctuation)
// ---------------------------------------------------------------------------

test('Dark-mode subject-theme tokens exist for spelling, grammar, punctuation', () => {
  const css = readSource('styles/app.css');
  const readySubjects = ['spelling', 'grammar', 'punctuation'];
  for (const subject of readySubjects) {
    const darkSelector = `[data-theme="dark"] .subject-theme[data-subject="${subject}"]`;
    assert.ok(
      css.includes(darkSelector),
      `Missing dark-mode override for .subject-theme[data-subject="${subject}"]`,
    );
  }
});

test('Dark-mode subject-theme tokens also cover prefers-color-scheme fallback', () => {
  const css = readSource('styles/app.css');
  const readySubjects = ['spelling', 'grammar', 'punctuation'];
  for (const subject of readySubjects) {
    // The :root:not([data-theme="light"]) selector covers system-preference dark mode
    const selectorFragment = `:not([data-theme="light"]) .subject-theme[data-subject="${subject}"]`;
    assert.ok(
      css.includes(selectorFragment),
      `Missing prefers-color-scheme dark fallback for subject "${subject}"`,
    );
  }
});

// ---------------------------------------------------------------------------
// 6. Unknown subjectId doesn't crash SubjectThemeScope
// ---------------------------------------------------------------------------

test('SubjectThemeScope handles falsy subjectId without crash', () => {
  const source = readSource('src/platform/ui/SubjectThemeScope.jsx');
  // Implementation uses `subjectId || undefined` so falsy values produce no data-subject
  assert.ok(
    source.includes('subjectId || undefined'),
    'SubjectThemeScope should guard falsy subjectId with || undefined',
  );
});

// ---------------------------------------------------------------------------
// 7. data-* journey selectors preserved in migrated files
// ---------------------------------------------------------------------------

test('Punctuation Setup scene preserves journey selectors', () => {
  const source = readSource('src/subjects/punctuation/components/PunctuationSetupScene.jsx');
  const requiredSelectors = [
    'data-punctuation-phase',
    'data-punctuation-cta',
    'data-section="hero"',
    'data-section="progress-row"',
    'SubjectCompanionPanel',
    'data-section="map-link"',
    'data-section="secondary"',
    'punctuation-start',
  ];
  for (const sel of requiredSelectors) {
    assert.ok(source.includes(sel), `PunctuationSetupScene must preserve "${sel}"`);
  }
});

test('Punctuation Session scene preserves journey selectors', () => {
  const source = readSource('src/subjects/punctuation/components/PunctuationSessionScene.jsx');
  const requiredSelectors = [
    'data-punctuation-session-scene',
    'data-punctuation-phase',
    'data-punctuation-submit',
    'data-punctuation-skip',
    'data-punctuation-continue',
  ];
  for (const sel of requiredSelectors) {
    assert.ok(source.includes(sel), `PunctuationSessionScene must preserve "${sel}"`);
  }
});

test('Punctuation Summary scene preserves journey selectors', () => {
  const source = readSource('src/subjects/punctuation/components/PunctuationSummaryScene.jsx');
  const requiredSelectors = [
    'data-punctuation-summary',
    'punctuation-start',
    'punctuation-open-map',
    'punctuation-back',
    'data-punctuation-start-again',
  ];
  for (const sel of requiredSelectors) {
    assert.ok(source.includes(sel), `PunctuationSummaryScene must preserve "${sel}"`);
  }
});

test('Punctuation Map scene preserves journey selectors', () => {
  const source = readSource('src/subjects/punctuation/components/PunctuationMapScene.jsx');
  const requiredSelectors = [
    'data-punctuation-map',
    'data-punctuation-phase="map"',
  ];
  for (const sel of requiredSelectors) {
    assert.ok(source.includes(sel), `PunctuationMapScene must preserve "${sel}"`);
  }
});

test('Spelling setup preserves data-action selectors', () => {
  const source = readSource('src/subjects/spelling/components/SpellingSetupScene.jsx');
  assert.ok(
    source.includes('dataAction="spelling-start"'),
    'SpellingSetupScene must preserve dataAction="spelling-start"',
  );
});

// ---------------------------------------------------------------------------
// Subject theme registry contract
// ---------------------------------------------------------------------------

test('subject-themes.js exports all six subjects', async () => {
  const mod = await import('../src/platform/ui/subject-themes.js');
  const expected = ['spelling', 'grammar', 'punctuation', 'reading', 'reasoning', 'arithmetic'];
  for (const id of expected) {
    assert.ok(mod.SUBJECT_THEMES[id], `Missing theme for subject "${id}"`);
    assert.equal(mod.SUBJECT_THEMES[id].subjectId, id);
    assert.ok(mod.SUBJECT_THEMES[id].accent, `${id} must have accent`);
    assert.ok(mod.SUBJECT_THEMES[id].accentInk, `${id} must have accentInk`);
    assert.ok(mod.SUBJECT_THEMES[id].accentSoft, `${id} must have accentSoft`);
    assert.ok(mod.SUBJECT_THEMES[id].accentBorder, `${id} must have accentBorder`);
  }
});

test('subject-themes.js getSubjectTheme returns undefined for unknown', async () => {
  const mod = await import('../src/platform/ui/subject-themes.js');
  assert.equal(mod.getSubjectTheme('nonexistent'), undefined);
  assert.equal(mod.getSubjectTheme(''), undefined);
  assert.equal(mod.getSubjectTheme(null), undefined);
});

test('subject-themes.js SUBJECT_IDS is frozen array of 6', async () => {
  const mod = await import('../src/platform/ui/subject-themes.js');
  assert.equal(mod.SUBJECT_IDS.length, 6);
  assert.ok(Object.isFrozen(mod.SUBJECT_IDS));
});

// ---------------------------------------------------------------------------
// CSS accent remap: the :where() rule must carry all four aliases
// ---------------------------------------------------------------------------

test('Subject-theme CSS remap carries btn-accent, card-accent, progress-accent, accent', () => {
  const css = readSource('styles/app.css');
  assert.ok(css.includes(':where(.subject-theme[data-subject])'), 'Missing :where() remap rule');
  // The remap block must set all four aliases
  const remapBlock = css.slice(css.indexOf(':where(.subject-theme[data-subject])'));
  const nextBrace = remapBlock.indexOf('}');
  const body = remapBlock.slice(0, nextBrace);
  assert.ok(body.includes('--btn-accent'), 'Remap must set --btn-accent');
  assert.ok(body.includes('--card-accent'), 'Remap must set --card-accent');
  assert.ok(body.includes('--progress-accent'), 'Remap must set --progress-accent');
  assert.ok(body.includes('--accent:'), 'Remap must set --accent');
});
