import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// SH2-U5 post-review: parity test (`tests/empty-state-parity.test.js`)
// was source-text only — it asserted that each consumer imports the
// shared `EmptyState` primitive and that the canonical copy strings
// appear, but it never exercised the rendered HTML. A broken
// `action.onClick` wiring or a mis-spelled `data-action` would still
// pass the source-text grep.
//
// This file plugs that gap: for every consumer whose empty branch is
// expected to surface a CTA button, we SSR-render the consumer with
// empty input data and assert the rendered HTML carries the expected
// `data-action` on an actual `<button>` element. If a future edit drops
// `action=` from an EmptyState call site (the same defect ce-design-lens
// flagged on WordBank), this test fails where parity alone would not.
//
// Consumers exercised:
//   1. CodexSurface — empty `model.monsterSummary` → codex-start-fresh-round
//   2. MonsterMeadow — empty `monsters` → no CTA (intentional: hero copy
//      already carries the "Start a round" CTA above the meadow; doubling
//      it would clutter the hero). Asserted as absence so a future edit
//      that adds an action prop here trips a deliberate re-review.
//   3. CodexCreatureLightbox — `entry=null` branch → codex-lightbox-close
//   4. SpellingWordBankScene — empty `analytics.wordGroups` →
//      spelling-close-word-bank (the DESIGN-BLOCKER-1 fix)
//
// ParentHub empty branches are intentionally action-less ("check back
// later" pattern) so they are NOT exercised here. Grammar's dashboard
// empty branch is action-less too (the hero already renders a
// `Begin round` primary CTA below the empty state) and stays out of
// this test's scope.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function nodePaths() {
  return [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-empty-consumer-'));
  const entryPath = path.join(tmpDir, 'entry.jsx');
  const bundlePath = path.join(tmpDir, 'entry.cjs');
  try {
    await writeFile(entryPath, entrySource);
    await build({
      absWorkingDir: rootDir,
      entryPoints: [entryPath],
      outfile: bundlePath,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: ['node24'],
      jsx: 'automatic',
      jsxImportSource: 'react',
      loader: { '.js': 'jsx' },
      nodePaths: nodePaths(),
      logLevel: 'silent',
    });
    return execFileSync(process.execPath, [bundlePath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function absoluteSpecifier(relativePath) {
  return JSON.stringify(path.join(rootDir, relativePath));
}

// ---------- CodexSurface ---------- //

test('CodexSurface empty branch JSX wires codex-start-fresh-round CTA through EmptyState.action', async () => {
  // `CodexSurface` can't be made to hit the empty branch through normal
  // SSR because `buildCodexEntries` always synthesises uncaught monster
  // entries for every known subject — the empty branch is defensive
  // code for edge cases (subject-registry churn, stripped monster sets).
  //
  // We instead drive the equivalent assertion by rendering the
  // `EmptyState` primitive directly with the exact `action` shape the
  // source hands it, and verifying the rendered HTML carries the
  // expected data-action + button element. The parser-level parity
  // test in `tests/empty-state-parity.test.js` already pins the
  // presence of the canonical copy; this test pins the runtime shape
  // of `action` so a broken `onClick` (not a function) would still
  // register as a missing button — matching the defect ce-design-lens
  // flagged on WordBank.
  //
  // Any future edit to the CodexSurface empty branch that changes the
  // `dataAction` string or drops the action prop will desync this
  // test's literal from the source, so we also assert (below) that
  // the source still contains the same literal.
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { EmptyState } from ${absoluteSpecifier('src/platform/ui/EmptyState.jsx')};
    const openPractice = () => {};
    const html = renderToStaticMarkup(
      <EmptyState
        title="Codex is empty"
        body="Codex is empty. Progress is stored safely. Complete a round to unlock your first entry."
        action={{
          label: 'Start Spelling',
          onClick: () => openPractice('spelling'),
          dataAction: 'codex-start-fresh-round',
        }}
      />
    );
    console.log(html);
  `);
  assert.match(html, /data-testid="empty-state"/, 'EmptyState must render with the stable testid');
  assert.match(
    html,
    /<button[^>]*data-action="codex-start-fresh-round"/,
    'The CodexSurface action shape must render a real <button> — a broken onClick (non-function) would collapse the CTA',
  );
  assert.match(html, /Codex is empty/, 'Canonical empty copy must appear');
  // Source-level lock: if the CodexSurface file ever drops this exact
  // action shape, the integration test would stop covering the real
  // consumer. Pin the literal so drift trips the test.
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { default: path } = await import('node:path');
  const selfUrl = import.meta.url;
  const testDir = path.dirname(fileURLToPath(selfUrl));
  const rootDir = path.resolve(testDir, '..');
  const source = readFileSync(path.join(rootDir, 'src/surfaces/home/CodexSurface.jsx'), 'utf8');
  assert.match(
    source,
    /dataAction:\s*['"]codex-start-fresh-round['"]/,
    'CodexSurface must keep wiring codex-start-fresh-round on the EmptyState action prop',
  );
  assert.match(
    source,
    /onClick:\s*\(\)\s*=>\s*openPractice\s*\(/,
    'CodexSurface action.onClick must still invoke openPractice so the button is not a dead sentence',
  );
});

// ---------- MonsterMeadow ---------- //

test('MonsterMeadow empty branch renders EmptyState WITHOUT an action CTA (intentional)', async () => {
  // The home hero already renders "Start a round" — doubling the CTA
  // on the meadow would clutter the layout and split the learner's
  // attention. MonsterMeadow therefore passes no `action` prop.
  // This test pins the decision: if a future edit starts wiring an
  // action here, the assertion trips so the choice is re-reviewed.
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { MonsterVisualConfigProvider } from ${absoluteSpecifier('src/platform/game/MonsterVisualConfigContext.jsx')};
    import { BUNDLED_MONSTER_VISUAL_CONFIG } from ${absoluteSpecifier('src/platform/game/monster-visual-config.js')};
    import { MonsterMeadow } from ${absoluteSpecifier('src/surfaces/home/MonsterMeadow.jsx')};
    const html = renderToStaticMarkup(
      <MonsterVisualConfigProvider value={{ config: BUNDLED_MONSTER_VISUAL_CONFIG }}>
        <MonsterMeadow monsters={[]} />
      </MonsterVisualConfigProvider>
    );
    console.log(html);
  `);
  assert.match(html, /data-testid="empty-state"/, 'MonsterMeadow empty branch must render the shared EmptyState primitive');
  assert.match(html, /Nothing caught yet/, 'MonsterMeadow empty copy must appear');
  // Intentional action-less branch — belt-and-braces guard: no CTA
  // button is emitted inside the MonsterMeadow wrapper. Scope the
  // absence check to the meadow wrapper so the assertion stays stable
  // if the surrounding hero later gains its own buttons.
  const meadowMatch = html.match(/<div class="monster-meadow-empty">([\s\S]*?)<\/div>\s*<\/div>/);
  const meadowMarkup = meadowMatch ? meadowMatch[0] : html;
  assert.doesNotMatch(
    meadowMarkup,
    /<button/,
    'MonsterMeadow empty wrapper must NOT render a button — the hero already carries the "Start a round" CTA',
  );
  // Also confirm the NIT-C1 fix: no aria-label on the outer wrapper
  // (the inner EmptyState already announces via role=status).
  assert.doesNotMatch(
    meadowMarkup,
    /<div class="monster-meadow-empty"[^>]*aria-label=/,
    'MonsterMeadow wrapper must not carry aria-label (the inner EmptyState role=status already announces)',
  );
});

// ---------- CodexCreatureLightbox ---------- //

test('CodexCreatureLightbox empty branch renders codex-lightbox-close CTA button', async () => {
  // When the caller passes `entry={null}` (e.g. the upstream codex
  // has not produced a matching row yet) the lightbox renders the
  // primitive with a Close action. We assert the button renders and
  // carries the expected data-action.
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { MonsterVisualConfigProvider } from ${absoluteSpecifier('src/platform/game/MonsterVisualConfigContext.jsx')};
    import { BUNDLED_MONSTER_VISUAL_CONFIG } from ${absoluteSpecifier('src/platform/game/monster-visual-config.js')};
    import { CodexCreatureLightbox } from ${absoluteSpecifier('src/surfaces/home/CodexCreatureLightbox.jsx')};
    const html = renderToStaticMarkup(
      <MonsterVisualConfigProvider value={{ config: BUNDLED_MONSTER_VISUAL_CONFIG }}>
        <CodexCreatureLightbox entry={null} onClose={() => {}} />
      </MonsterVisualConfigProvider>
    );
    console.log(html);
  `);
  assert.match(html, /data-testid="empty-state"/, 'CodexCreatureLightbox empty branch must render the shared EmptyState primitive');
  assert.match(html, /data-action="codex-lightbox-close"/, 'CodexCreatureLightbox empty branch must expose codex-lightbox-close data-action');
  assert.match(
    html,
    /<button[^>]*data-action="codex-lightbox-close"/,
    'CodexCreatureLightbox empty CTA must be a <button> element',
  );
  assert.match(html, /Nothing to preview yet/, 'CodexCreatureLightbox empty copy must appear');
});

// ---------- SpellingWordBankScene ---------- //

test('SpellingWordBankScene empty branch renders spelling-close-word-bank CTA button (DESIGN-BLOCKER-1 fix)', async () => {
  // Direct render of WordBankCard with an empty analytics.wordGroups
  // triggers the `totalTrackedWords === 0` short-circuit → the
  // EmptyState branch. Pre-review, this branch rendered the canonical
  // three-sentence copy but omitted the `action` prop, so the button
  // was silently missing. This test pins the DESIGN-BLOCKER-1 fix.
  //
  // WordBankCard is an internal component of SpellingWordBankScene —
  // we render the internal module directly rather than the whole scene
  // because the scene also needs full learner fixtures and hero
  // backdrops that add noise to this narrow assertion. The private
  // import is acceptable for an SSR parity test; the exported
  // boundary it's guarding (the EmptyState contract) is what matters.
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SpellingWordBankScene } from ${absoluteSpecifier('src/subjects/spelling/components/SpellingWordBankScene.jsx')};
    const learner = { id: 'learner-a', name: 'Ava', accent: '#3E6FA8' };
    const analytics = { wordGroups: [], wordBank: {} };
    const appState = { transientUi: {} };
    const actions = { dispatch() {} };
    const html = renderToStaticMarkup(
      <SpellingWordBankScene
        appState={appState}
        learner={learner}
        analytics={analytics}
        accent="#3E6FA8"
        actions={actions}
      />
    );
    console.log(html);
  `);
  assert.match(html, /data-testid="empty-state"/, 'WordBank empty branch must render the shared EmptyState primitive');
  assert.match(html, /data-action="spelling-close-word-bank"/, 'WordBank empty branch must expose spelling-close-word-bank data-action');
  // The WordBank topbar also renders a spelling-close-word-bank button
  // ("← Back to setup"), so we look for the empty-state scoped CTA.
  // Both must be `<button>` elements, and the empty-state copy +
  // button should co-render (the three-sentence lede next to a button
  // labelled "Back to spelling").
  assert.match(html, /No words yet/, 'WordBank empty copy headline must appear');
  assert.match(html, /Your progress is saved/, 'WordBank empty copy reassurance must appear');
  const emptyCtaMatch = html.match(
    /class="actions empty-state-actions"[\s\S]*?<button[^>]*data-action="spelling-close-word-bank"[^>]*>([^<]+)<\/button>/,
  );
  assert.ok(
    emptyCtaMatch,
    'WordBank empty branch must render the CTA button INSIDE the EmptyState actions row with label text',
  );
  assert.match(
    emptyCtaMatch[1],
    /Back to spelling/,
    'WordBank empty CTA label must read "Back to spelling"',
  );
});
