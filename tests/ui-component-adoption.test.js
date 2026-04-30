import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// P2 U1 (partial — completed in U7): closed allowlist of production
// surfaces that have adopted the shared `Button` primitive. Mirrors
// `tests/empty-state-parity.test.js` in shape: every surface in the
// allowlist must import `Button` from the shared primitive AND
// actually render `<Button` in source. A stray import without a
// render call would tree-shake away and leave the contract
// unenforced.
//
// U1 lands the first 5 consumers (Grammar setup primary CTA,
// HeroQuestCard primary CTAs, Punctuation setup primary CTA, Home
// hero primary + ghost CTAs, AdminPanelFrame stale-data refresh).
// U7 widens the allowlist with the third-consumer falsifier
// (Spelling setup) and any other ratified migrations from later
// units.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BUTTON_CONSUMERS = [
  'src/subjects/grammar/components/GrammarSetupScene.jsx',
  'src/surfaces/home/HeroQuestCard.jsx',
  'src/subjects/punctuation/components/PunctuationSetupScene.jsx',
  'src/surfaces/home/HomeSurface.jsx',
  'src/surfaces/hubs/AdminPanelFrame.jsx',
  // P2 U7: third-consumer falsifier successfully migrated SpellingSetupScene
  // to <Button>. Adding the surface to the allowlist locks the adoption
  // — a future refactor that removes the import would now fail this test.
  'src/subjects/spelling/components/SpellingSetupScene.jsx',
];

// P2 U2: closed allowlist of production surfaces that have adopted the
// shared `Card` primitive. Every entry must import `Card` from the
// shared primitive AND render `<Card` in source. The hub-utils file
// re-exports the AccessDeniedCard helper used by Admin + Parent hubs.
const CARD_CONSUMERS = [
  'src/surfaces/subject/SubjectRuntimeFallback.jsx',
  'src/surfaces/hubs/hub-utils.js',
];

// P2 U2: SectionHeader does not yet have a load-bearing migration site
// (the plan lists the primitive as net-new with low-risk wrapper sites
// only). The allowlist is empty at U2 close and grows in U7's
// third-consumer falsifier pass.
const SECTION_HEADER_CONSUMERS = [];

// P2 U3: ProgressMeter migration sites — Punctuation monster meter
// (`PunctuationSetupScene` line ~159 was bespoke `style={{ width: pct }}`
// before this unit) and the Home subject-card progress span.
const PROGRESS_METER_CONSUMERS = [
  'src/subjects/punctuation/components/PunctuationSetupScene.jsx',
  'src/surfaces/home/SubjectCard.jsx',
];

// P2 U3: StatCard migration sites — the Punctuation Setup progress row
// renders three StatCards ("Due today" / "Wobbly" / "Grand Stars").
const STAT_CARD_CONSUMERS = [
  'src/subjects/punctuation/components/PunctuationSetupScene.jsx',
];

function readFile(relative) {
  return readFileSync(path.join(rootDir, relative), 'utf8');
}

test('every U1 surface imports the shared Button primitive', () => {
  for (const file of BUTTON_CONSUMERS) {
    const source = readFile(file);
    assert.match(
      source,
      /import\s*\{[^}]*\bButton\b[^}]*\}\s*from\s*['"][^'"]*platform\/ui\/Button(\.jsx)?['"]/,
      `${file} must import Button from the shared primitive at src/platform/ui/Button.jsx. ` +
      'If this surface legitimately no longer needs the primitive, update the BUTTON_CONSUMERS '
      + 'allowlist deliberately.',
    );
    assert.match(
      source,
      /<Button\b/,
      `${file} imports Button but never uses it — a tree-shake would remove the import. ` +
      'Either render the primitive in the migrated CTA(s) or remove the import.',
    );
  }
});

test('Button has ≥ 5 unique production import sites at U1 close', () => {
  // Five is the U1-mandated minimum. U7's third-consumer falsifier
  // pass extends this list (Spelling + any ratified later migrations).
  assert.ok(
    BUTTON_CONSUMERS.length >= 5,
    `U1 minimum is 5 Button consumers; got ${BUTTON_CONSUMERS.length}.`,
  );
});

test('every U2 surface imports the shared Card primitive', () => {
  for (const file of CARD_CONSUMERS) {
    const source = readFile(file);
    assert.match(
      source,
      /import\s*\{[^}]*\bCard\b[^}]*\}\s*from\s*['"][^'"]*platform\/ui\/Card(\.jsx)?['"]/,
      `${file} must import Card from the shared primitive at src/platform/ui/Card.jsx. ` +
      'If this surface legitimately no longer needs the primitive, update the CARD_CONSUMERS '
      + 'allowlist deliberately.',
    );
    assert.match(
      source,
      /<Card\b/,
      `${file} imports Card but never uses it — a tree-shake would remove the import. ` +
      'Either render the primitive in the migrated wrapper(s) or remove the import.',
    );
  }
});

test('Card has ≥ 2 unique production import sites at U2 close', () => {
  // U2 plan calls out 2–3 low-risk wrapper migrations
  // (SubjectRuntimeFallback, AccessDeniedCard, optionally Home). Two is
  // the load-bearing minimum that proves the slot-composition shape.
  assert.ok(
    CARD_CONSUMERS.length >= 2,
    `U2 minimum is 2 Card consumers; got ${CARD_CONSUMERS.length}.`,
  );
});

test('SectionHeader allowlist consumers (if any) import + render the primitive', () => {
  // Empty at U2 close — see SECTION_HEADER_CONSUMERS comment. The test
  // exists so adding an entry to the allowlist is enough to enforce
  // adoption without rewriting the test.
  for (const file of SECTION_HEADER_CONSUMERS) {
    const source = readFile(file);
    assert.match(
      source,
      /import\s*\{[^}]*\bSectionHeader\b[^}]*\}\s*from\s*['"][^'"]*platform\/ui\/SectionHeader(\.jsx)?['"]/,
      `${file} must import SectionHeader from src/platform/ui/SectionHeader.jsx`,
    );
    assert.match(
      source,
      /<SectionHeader\b/,
      `${file} imports SectionHeader but never renders it — tree-shake would remove the import.`,
    );
  }
});

test('every U3 surface imports the shared ProgressMeter primitive', () => {
  for (const file of PROGRESS_METER_CONSUMERS) {
    const source = readFile(file);
    assert.match(
      source,
      /import\s*\{[^}]*\bProgressMeter\b[^}]*\}\s*from\s*['"][^'"]*platform\/ui\/ProgressMeter(\.jsx)?['"]/,
      `${file} must import ProgressMeter from src/platform/ui/ProgressMeter.jsx. ` +
      'If this surface no longer needs the primitive, update PROGRESS_METER_CONSUMERS deliberately.',
    );
    assert.match(
      source,
      /<ProgressMeter\b/,
      `${file} imports ProgressMeter but never renders it — tree-shake would remove the import.`,
    );
  }
});

test('ProgressMeter has >= 2 unique production import sites at U3 close', () => {
  // Plan U3 lists 2 load-bearing migrations: Punctuation monster meter +
  // Home subject-card meter. Two is the proof of pioneer-then-pattern.
  assert.ok(
    PROGRESS_METER_CONSUMERS.length >= 2,
    `U3 minimum is 2 ProgressMeter consumers; got ${PROGRESS_METER_CONSUMERS.length}.`,
  );
});

test('every U3 surface imports the shared StatCard primitive', () => {
  for (const file of STAT_CARD_CONSUMERS) {
    const source = readFile(file);
    assert.match(
      source,
      /import\s*\{[^}]*\bStatCard\b[^}]*\}\s*from\s*['"][^'"]*platform\/ui\/StatCard(\.jsx)?['"]/,
      `${file} must import StatCard from src/platform/ui/StatCard.jsx.`,
    );
    assert.match(
      source,
      /<StatCard\b/,
      `${file} imports StatCard but never renders it — tree-shake would remove the import.`,
    );
  }
});

test('StatCard has >= 1 unique production import site at U3 close', () => {
  // Plan U3 lists the 3-up Punctuation progress row as the load-bearing
  // adoption site. The third-consumer falsifier sweep lands later.
  assert.ok(
    STAT_CARD_CONSUMERS.length >= 1,
    `U3 minimum is 1 StatCard consumer; got ${STAT_CARD_CONSUMERS.length}.`,
  );
});
