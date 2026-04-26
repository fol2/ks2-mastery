import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SH2-U5: parser-level parity test. Every production surface that hosts
// a genuinely-empty branch must import the shared `EmptyState` primitive
// so the canonical three-part copy pattern (what happened / is progress
// safe / what action is available) stays consistent across Parent Hub,
// MonsterMeadow, Codex, WordBank, and Grammar dashboard.
//
// Also asserts `ErrorCard` lands in ≥ 2 production sites. The error
// primitive is the paired counterpart to EmptyState — keeping the count
// at 2 right now prevents a regression where a new surface invents its
// own error banner (a bespoke `<div class="error">` styled red) instead
// of adopting the primitive.
//
// Allowlist exists so surfaces that intentionally don't use the
// primitive (e.g. subject-internal chips like Punctuation's "Everything
// was secure" which is positive feedback, not an empty branch) can be
// added deliberately rather than accidentally going unnoticed.
//
// Parser strategy mirrors `tests/toast-positioning-contract.test.js`:
// read source files as text, grep for imports + selector patterns, no
// module-resolution loader required.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EMPTY_STATE_CONSUMERS = [
  'src/surfaces/hubs/ParentHubSurface.jsx',
  'src/surfaces/home/MonsterMeadow.jsx',
  'src/surfaces/home/CodexSurface.jsx',
  'src/surfaces/home/CodexCreatureLightbox.jsx',
  'src/subjects/spelling/components/SpellingWordBankScene.jsx',
  'src/subjects/grammar/components/GrammarSetupScene.jsx',
];

function readFile(relative) {
  return readFileSync(path.join(rootDir, relative), 'utf8');
}

test('every plan-mandated surface imports the shared EmptyState primitive', () => {
  for (const file of EMPTY_STATE_CONSUMERS) {
    const source = readFile(file);
    assert.match(
      source,
      /import\s*\{[^}]*\bEmptyState\b[^}]*\}\s*from\s*['"][^'"]*platform\/ui\/EmptyState\.jsx?['"]/,
      `${file} must import EmptyState from the shared primitive at src/platform/ui/EmptyState.jsx. ` +
      'If this surface legitimately no longer needs the primitive, update the EMPTY_STATE_CONSUMERS allowlist in this test deliberately.',
    );
    // Belt-and-braces: the surface must actually render the primitive.
    // A stray import without a call site would leave the canonical copy
    // pattern unenforced.
    assert.match(
      source,
      /<EmptyState\b/,
      `${file} imports EmptyState but never uses it — a tree-shake would remove the import. ` +
      'Either render the primitive in the empty branch or remove the import.',
    );
  }
});

test('EmptyState has ≥ 6 unique production import sites', () => {
  // Six is the plan-mandated minimum. The allowlist above is the
  // canonical count. If a future unit adds a seventh consumer, add it
  // to the list so the test catches accidental removals.
  assert.ok(
    EMPTY_STATE_CONSUMERS.length >= 6,
    `Plan-mandated minimum is 6 EmptyState consumers; got ${EMPTY_STATE_CONSUMERS.length}.`,
  );
});

test('WordBank empty copy follows the canonical three-part structure', () => {
  const source = readFile('src/subjects/spelling/components/SpellingWordBankScene.jsx');
  // Canonical copy from the plan, part 1: what happened.
  assert.match(source, /No words yet/, 'WordBank empty must say "No words yet"');
  // Part 2: is progress safe (reassurance phrase).
  assert.match(source, /Your progress is saved/, 'WordBank empty must include "Your progress is saved" reassurance');
  // Part 3: what action is available.
  assert.match(
    source,
    /Play a spelling round to add your first word/,
    'WordBank empty must include the canonical action copy "Play a spelling round to add your first word"',
  );
});

test('MonsterMeadow empty copy follows the canonical three-part structure', () => {
  const source = readFile('src/surfaces/home/MonsterMeadow.jsx');
  assert.match(source, /Nothing caught yet/, 'MonsterMeadow empty headline "Nothing caught yet"');
  assert.match(source, /meadow stays tidy/i, 'MonsterMeadow empty reassurance "Your meadow stays tidy"');
  assert.match(
    source,
    /Finish a round to see your first monster appear/,
    'MonsterMeadow empty action "Finish a round to see your first monster appear"',
  );
});

test('Codex fresh-learner copy follows the canonical three-part structure', () => {
  const source = readFile('src/surfaces/home/CodexSurface.jsx');
  assert.match(source, /Codex is empty/);
  assert.match(source, /Progress is stored safely/);
  assert.match(source, /Complete a round to unlock your first entry/);
});

test('Parent Hub Recent Sessions + Current Focus copy includes reassurance (progress is safe)', () => {
  const source = readFile('src/surfaces/hubs/ParentHubSurface.jsx');
  // Recent Sessions empty (canonical Parent Hub copy that the plan cites
  // as the voice template).
  assert.match(source, /No completed or active sessions are stored yet/);
  assert.match(source, /Progress stays safe/, 'Parent Hub Recent Sessions reassurance is explicit');
  // Current Focus empty.
  assert.match(source, /No due work is surfaced yet/);
  assert.match(source, /Progress is recorded safely/, 'Parent Hub Current Focus reassurance is explicit');
});

test('Grammar dashboard-empty copy keeps the existing anchor AND adds reassurance', () => {
  const source = readFile('src/subjects/grammar/components/GrammarSetupScene.jsx');
  // The pre-U5 "Start your first round…" anchor stays because the
  // existing child-copy regression tests assert on it. The U5 upgrade
  // wraps it in EmptyState + adds the reassurance sentence.
  assert.match(source, /Grammar is ready/, 'Grammar dashboard-empty headline');
  assert.match(source, /Progress is saved as you practise/, 'Grammar dashboard-empty reassurance');
  assert.match(source, /Start your first round to see your scores here/);
});

// ---------- ErrorCard parity ---------- //

const ERROR_CARD_CONSUMERS = [
  'src/surfaces/subject/SubjectRuntimeFallback.jsx',
  'src/surfaces/hubs/hub-utils.js',
];

test('ErrorCard has ≥ 2 production import sites', () => {
  assert.ok(
    ERROR_CARD_CONSUMERS.length >= 2,
    `ErrorCard is meant to ship in ≥ 2 production sites; allowlist has ${ERROR_CARD_CONSUMERS.length}.`,
  );
  for (const file of ERROR_CARD_CONSUMERS) {
    const source = readFile(file);
    assert.match(
      source,
      /import\s*\{[^}]*\bErrorCard\b[^}]*\}\s*from\s*['"][^'"]*platform\/ui\/ErrorCard\.jsx?['"]/,
      `${file} must import ErrorCard from the shared primitive at src/platform/ui/ErrorCard.jsx`,
    );
    assert.match(
      source,
      /<ErrorCard\b/,
      `${file} imports ErrorCard but never renders it`,
    );
  }
});
