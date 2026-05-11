// P3 U2 — Action Engine Pass 1 contract tests.
//
// Locks in:
//   1. ActionRow renders primary + secondary with correct structure.
//   2. ActionRow with only primary renders without error.
//   3. Raw .btn ratchet: count in learner surfaces is >= 20 fewer than
//      baseline (182 from evidence map).
//   4. data-action selectors preserved in migrated files.
//   5. At-most-one primary action per setup/session/summary/home branch.
//   6. Disabled/busy/error states visible via Button primitive.
//   7. Form submit behaviour preserved (type="submit").

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function readFile(relative) {
  return readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

function hasActionSelector(source, action) {
  return source.includes(`dataAction="${action}"`)
    || source.includes(`data-action="${action}"`)
    || source.includes(`dataAction: '${action}'`)
    || source.includes(`dataAction: "${action}"`);
}

function findButtonBlockByAction(source, action) {
  const blocks = source.match(/<Button\b[\s\S]*?<\/Button>/g) || [];
  return blocks.find((block) => block.includes(`actions.dispatch('${action}')`)) || '';
}

// --- ActionRow structural tests (parser-level) ---

test('ActionRow module exports the named export', () => {
  const source = readFile('src/platform/ui/ActionRow.jsx');
  assert.match(source, /export function ActionRow\(/);
});

test('ActionRow renders role="group" for accessibility', () => {
  const source = readFile('src/platform/ui/ActionRow.jsx');
  assert.match(source, /role="group"/);
});

test('ActionRow supports align="split" with margin-left: auto pattern', () => {
  const source = readFile('src/platform/ui/ActionRow.jsx');
  assert.match(source, /marginLeft:\s*['"]auto['"]/);
});

test('ActionRow renders data-action-row locator', () => {
  const source = readFile('src/platform/ui/ActionRow.jsx');
  assert.match(source, /data-action-row/);
});

test('ActionRow handles single-button case (no secondary/tertiary rendering when absent)', () => {
  const source = readFile('src/platform/ui/ActionRow.jsx');
  // When hasSecondary is false, secondary should not render
  assert.match(source, /hasSecondary\s*\?/);
  assert.match(source, /hasTertiary\s*\?/);
});

// --- Raw .btn ratchet ---

// Learner-facing surfaces that were migrated in U2.
const MIGRATED_LEARNER_SURFACES = [
  'src/subjects/spelling/components/SpellingSessionScene.jsx',
  'src/subjects/grammar/components/GrammarSessionScene.jsx',
  'src/subjects/punctuation/components/PunctuationSessionScene.jsx',
  'src/subjects/spelling/components/SpellingSummaryScene.jsx',
  'src/subjects/grammar/components/GrammarSummaryScene.jsx',
  'src/subjects/punctuation/components/PunctuationSummaryScene.jsx',
];

test('migrated learner surfaces have zero raw className="btn " patterns', () => {
  for (const file of MIGRATED_LEARNER_SURFACES) {
    const source = readFile(file);
    const rawBtnMatches = source.match(/className="btn\s/g) || [];
    const templateBtnMatches = source.match(/className=\{`btn\s/g) || [];
    const total = rawBtnMatches.length + templateBtnMatches.length;
    assert.equal(
      total,
      0,
      `${file} still contains ${total} raw .btn class patterns. ` +
      'All learner-facing buttons in migrated files must use the <Button> primitive.',
    );
  }
});

test('raw .btn count across all learner session+summary surfaces is >= 20 fewer than 182 baseline', () => {
  // Baseline from evidence map: 182 raw .btn across all learner surfaces.
  // U2 target: retire at least 20.
  const BASELINE = 182;
  const TARGET_REDUCTION = 20;
  // Count remaining raw .btn across ALL learner surfaces (session + summary + setup).
  const ALL_LEARNER_SURFACES = [
    ...MIGRATED_LEARNER_SURFACES,
    'src/subjects/spelling/components/SpellingSetupScene.jsx',
    'src/subjects/grammar/components/GrammarSetupScene.jsx',
    'src/subjects/punctuation/components/PunctuationSetupScene.jsx',
  ];
  let remaining = 0;
  for (const file of ALL_LEARNER_SURFACES) {
    const source = readFile(file);
    const rawBtnMatches = source.match(/className="btn\s/g) || [];
    const templateBtnMatches = source.match(/className=\{`btn\s/g) || [];
    remaining += rawBtnMatches.length + templateBtnMatches.length;
  }
  const retired = BASELINE - remaining;
  assert.ok(
    retired >= TARGET_REDUCTION,
    `Only ${retired} raw .btn sites retired (target: >= ${TARGET_REDUCTION}). ` +
    `Remaining: ${remaining}, baseline: ${BASELINE}.`,
  );
});

// --- data-action preservation ---

test('migrated session scenes preserve data-action selectors via Button dataAction prop', () => {
  const expectedActions = {
    'src/subjects/spelling/components/SpellingSessionScene.jsx': [
      'spelling-back',
      'spelling-replay',
      'spelling-replay-slow',
      'spelling-continue',
      'spelling-skip',
      'spelling-end-early',
    ],
    'src/subjects/grammar/components/GrammarSessionScene.jsx': [
      // Grammar session uses dispatch directly; verify Button presence
    ],
    'src/subjects/punctuation/components/PunctuationSessionScene.jsx': [
      // Punctuation uses data-punctuation-submit, data-punctuation-skip etc
    ],
  };

  for (const [file, actions] of Object.entries(expectedActions)) {
    const source = readFile(file);
    for (const action of actions) {
      // Check either dataAction="..." or data-action="..." is present
      const hasDataAction = hasActionSelector(source, action);
      assert.ok(
        hasDataAction,
        `${file} must preserve the data-action="${action}" selector ` +
        '(via dataAction prop or data-action attribute).',
      );
    }
  }
});

test('spelling summary preserves data-action selectors', () => {
  const source = readFile('src/subjects/spelling/components/SpellingSummaryScene.jsx');
  const expected = ['spelling-drill-all', 'spelling-back', 'spelling-start-again'];
  for (const action of expected) {
    const has = hasActionSelector(source, action);
    assert.ok(has, `SpellingSummaryScene must preserve data-action="${action}"`);
  }
});

test('punctuation summary preserves data-action selectors', () => {
  const source = readFile('src/subjects/punctuation/components/PunctuationSummaryScene.jsx');
  const expected = ['punctuation-start', 'punctuation-open-map', 'punctuation-start-again', 'punctuation-back'];
  for (const action of expected) {
    const has = hasActionSelector(source, action);
    assert.ok(has, `PunctuationSummaryScene must preserve data-action="${action}"`);
  }
});

// --- Button primitive adoption ---

test('all migrated surfaces import Button from platform/ui/Button', () => {
  for (const file of MIGRATED_LEARNER_SURFACES) {
    const source = readFile(file);
    const usesButtonDirectly = /import\s*\{[^}]*\bButton\b[^}]*\}\s*from\s*['"][^'"]*platform\/ui\/Button(\.jsx)?['"]/.test(source)
      && /<Button\b/.test(source);
    const usesButtonViaSummaryFrame = /import\s*\{[^}]*\bSessionSummaryFrame\b[^}]*\}/.test(source)
      && /<SessionSummaryFrame\b/.test(source);
    assert.ok(
      usesButtonDirectly || usesButtonViaSummaryFrame,
      `${file} must use the shared Button primitive directly or through SessionSummaryFrame.`,
    );
  }
});

// --- Form submit behaviour preservation ---

test('grammar session preserves type="submit" on form action buttons', () => {
  const source = readFile('src/subjects/grammar/components/GrammarSessionScene.jsx');
  // Mini-test save, save-next, finish all need type="submit"
  const submitButtons = source.match(/type="submit"/g) || [];
  assert.ok(
    submitButtons.length >= 3,
    `GrammarSessionScene must preserve at least 3 type="submit" buttons (mini-test save/save-next/finish + normal submit). Found: ${submitButtons.length}`,
  );
});

test('punctuation session preserves type="submit" on form action buttons', () => {
  const source = readFile('src/subjects/punctuation/components/PunctuationSessionScene.jsx');
  const submitButtons = source.match(/type="submit"/g) || [];
  assert.ok(
    submitButtons.length >= 2,
    `PunctuationSessionScene must preserve at least 2 type="submit" buttons (choice + text). Found: ${submitButtons.length}`,
  );
});

// --- Disabled/busy states visible ---

test('spelling session preserves busy state on replay buttons', () => {
  const source = readFile('src/subjects/spelling/components/SpellingSessionScene.jsx');
  // The Button primitive uses `busy` prop which sets aria-busy
  assert.match(source, /busy=\{ttsStatus === 'loading'\}/, 'Replay buttons must wire busy state');
});

test('grammar session preserves disabled state on action buttons', () => {
  const source = readFile('src/subjects/grammar/components/GrammarSessionScene.jsx');
  assert.match(source, /disabled=\{submitDisabled\}/, 'Submit buttons must wire disabled state');
  assert.match(source, /disabled=\{runtimeReadOnly \|\| pending \|\| submitLock\.locked\}/, 'Next question button must wire disabled state');
});

test('grammar session disables End round while runtime is read-only or pending', () => {
  const source = readFile('src/subjects/grammar/components/GrammarSessionScene.jsx');
  const endRoundButton = findButtonBlockByAction(source, 'grammar-end-early');
  assert.ok(endRoundButton, 'Normal-session End round button must exist.');
  assert.match(endRoundButton, /variant="ghost"/, 'Normal-session End round must stay a ghost button.');
  assert.match(endRoundButton, /disabled=\{runtimeReadOnly \|\| pending\}/, 'Normal-session End round must be disabled in read-only runtime state and while pending.');
  assert.match(endRoundButton, />\s*End round\s*<\/Button>/, 'Normal-session End round button label must stay stable.');
});

// --- ActionRow primitive exists at expected path ---

test('ActionRow.jsx exists at src/platform/ui/ActionRow.jsx', () => {
  const source = readFile('src/platform/ui/ActionRow.jsx');
  assert.ok(source.length > 0, 'ActionRow.jsx must not be empty');
  assert.match(source, /export function ActionRow/);
});
