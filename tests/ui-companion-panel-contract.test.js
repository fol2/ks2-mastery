import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// P3 U5: SubjectCompanionPanel contract tests.
//
// Validates:
//   1. Empty monsters renders emptyState message
//   2. Stats rendered with dl/dt/dd pattern
//   3. Unknown subjectId renders empty state without crash
//   4. No mastery mutation — no store imports in the component
//   5. SectionHeader adopted
//   6. Three-subject adoption gate (spelling, punctuation, grammar)

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readSrc(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8');
}

const COMPANION_SRC = readSrc('src/platform/ui/SubjectCompanionPanel.jsx');

// --- 1. Empty monsters path ---
test('SubjectCompanionPanel: renders emptyState string in source', () => {
  // The component must include a path that renders emptyState text when
  // monsters is empty — look for the emptyState prop usage in an empty branch.
  assert.ok(
    COMPANION_SRC.includes('companion-panel-empty'),
    'Expected a .companion-panel-empty class for the empty-state message',
  );
  assert.ok(
    COMPANION_SRC.includes('{emptyState}'),
    'Expected emptyState prop rendered directly',
  );
});

// --- 2. Stats rendered with dl/dt/dd ---
test('SubjectCompanionPanel: uses dl/dt/dd for stats', () => {
  assert.ok(COMPANION_SRC.includes('<dl'), 'Expected a <dl> element for stats');
  assert.ok(COMPANION_SRC.includes('<dt>'), 'Expected <dt> elements for stat labels');
  assert.ok(COMPANION_SRC.includes('<dd>'), 'Expected <dd> elements for stat values');
});

// --- 3. Unknown subjectId → empty state without crash ---
test('SubjectCompanionPanel: handles unknown subjectId gracefully', () => {
  // The component must guard against unknown subjects. Look for the
  // KNOWN_SUBJECTS set and the early-return path.
  assert.ok(
    COMPANION_SRC.includes('KNOWN_SUBJECTS'),
    'Expected a KNOWN_SUBJECTS allowlist',
  );
  assert.ok(
    COMPANION_SRC.includes('companion-panel--unknown'),
    'Expected a dedicated class for unknown-subject fallback',
  );
});

// --- 4. No mastery mutation (no store imports) ---
test('SubjectCompanionPanel: does not import any state store', () => {
  const forbidden = [
    'useStore', 'useMastery', 'useGameState', 'dispatch(',
    'createStore', 'zustand', 'redux',
  ];
  for (const token of forbidden) {
    assert.ok(
      !COMPANION_SRC.includes(token),
      `SubjectCompanionPanel must not import or reference "${token}" — display-only contract`,
    );
  }
});

// --- 5. SectionHeader adopted ---
test('SubjectCompanionPanel: imports and renders SectionHeader', () => {
  assert.ok(
    COMPANION_SRC.includes("from './SectionHeader.jsx'"),
    'Expected import of SectionHeader from the same platform/ui directory',
  );
  assert.ok(
    COMPANION_SRC.includes('<SectionHeader'),
    'Expected SectionHeader to be rendered in the component',
  );
});

// --- 6. Three-subject adoption gate ---
const ADOPTION_SURFACES = [
  'src/subjects/spelling/components/SpellingSetupScene.jsx',
  'src/subjects/punctuation/components/PunctuationSetupScene.jsx',
  'src/subjects/grammar/components/GrammarSetupScene.jsx',
];

test('SubjectCompanionPanel: adopted in all three subject setup scenes', () => {
  for (const surface of ADOPTION_SURFACES) {
    const src = readSrc(surface);
    assert.ok(
      src.includes('SubjectCompanionPanel'),
      `Expected ${surface} to import SubjectCompanionPanel`,
    );
    assert.ok(
      src.includes('<SubjectCompanionPanel'),
      `Expected ${surface} to render <SubjectCompanionPanel`,
    );
  }
});

test('SubjectCompanionPanel: each adoption passes subjectId prop', () => {
  const expectedIds = ['spelling', 'punctuation', 'grammar'];
  for (let i = 0; i < ADOPTION_SURFACES.length; i++) {
    const src = readSrc(ADOPTION_SURFACES[i]);
    assert.ok(
      src.includes(`subjectId="${expectedIds[i]}"`),
      `Expected ${ADOPTION_SURFACES[i]} to pass subjectId="${expectedIds[i]}"`,
    );
  }
});
