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
