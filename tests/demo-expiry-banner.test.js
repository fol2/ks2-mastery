// SH2-U3: parser-level coverage for the demo-expiry banner + AuthSurface
// branching + input-preservation contract across the three subject session
// scenes.
//
// This file is the first line of defence behind the adversarial reviewer.
// If any of these tests fail, the bespoke demo-expiry UX has drifted away
// from its spec (S-04 copy neutrality, S-05 capability-class language) or
// the input-preservation invariant has regressed.
//
// node --test cannot consume `.jsx` imports directly, so the react-render
// assertions bundle a one-off SSR entry through esbuild (the same pattern
// used by `tests/react-auth-boot.test.js` via `tests/helpers/react-render.js`).
// Source-level assertions (S-04 / S-05 grep, input-preservation key check)
// are direct `fs` reads — no bundle needed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The worktree lives under `.claude/worktrees/<agent>/...` but
// `node_modules/` is a parent sibling. Climb upward looking for a
// `node_modules` directory so the bundler can resolve `react` wherever the
// worktree has been checked out (fresh worktrees may not yet have their own
// install).
function findNearestNodeModules(startDir) {
  let current = startDir;
  for (let index = 0; index < 12; index += 1) {
    const candidate = path.join(current, 'node_modules');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function nodePaths() {
  return [
    path.join(ROOT_DIR, 'node_modules'),
    findNearestNodeModules(ROOT_DIR),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-demo-expiry-'));
  const entryPath = path.join(tmpDir, 'entry.jsx');
  const bundlePath = path.join(tmpDir, 'entry.cjs');
  try {
    await writeFile(entryPath, entrySource);
    await build({
      absWorkingDir: ROOT_DIR,
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
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function abs(rel) {
  return path.join(ROOT_DIR, rel);
}

async function renderBanner() {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { DemoExpiryBanner } from ${JSON.stringify(abs('src/surfaces/auth/DemoExpiryBanner.jsx'))};
    const html = renderToStaticMarkup(
      <DemoExpiryBanner onStartDemo={async () => {}} />
    );
    console.log(html);
  `);
}

async function renderAuthSurface(initialError) {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AuthSurface } from ${JSON.stringify(abs('src/surfaces/auth/AuthSurface.jsx'))};
    const html = renderToStaticMarkup(
      <AuthSurface
        initialError={${JSON.stringify(initialError)}}
        onSubmit={async () => {}}
        onSocialStart={async () => {}}
        onDemoStart={async () => {}}
      />
    );
    console.log(html);
  `);
}

async function renderReadOnlyLearnerNotice({ writable = false, learnerName = 'Ava', writableLearner = null } = {}) {
  return renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ReadOnlyLearnerNotice } from ${JSON.stringify(abs('src/surfaces/hubs/ReadOnlyLearnerNotice.jsx'))};
    const html = renderToStaticMarkup(
      <ReadOnlyLearnerNotice
        access={${JSON.stringify({ writable, learnerName })}}
        writableLearner={${JSON.stringify(writableLearner)}}
      />
    );
    console.log(html);
  `);
}

// ---------------------------------------------------------------------------
// DemoExpiryBanner: copy, CTAs, S-04 account-existence-neutral guarantees.
// ---------------------------------------------------------------------------

test('DemoExpiryBanner renders the finished-demo headline + both CTAs', async () => {
  const html = await renderBanner();
  assert.match(html, /Demo session finished/);
  assert.match(html, /Sign in or start a new demo to keep practising\./);
  assert.match(html, /data-action="demo-expiry-sign-in"/);
  assert.match(html, /data-action="demo-expiry-start-demo"/);
  assert.match(html, /data-testid="demo-expiry-banner"/);
});

test('DemoExpiryBanner copy is account-existence-neutral (S-04 tokens forbidden)', async () => {
  // Grep-the-file guard: the adversarial reviewer runs the same check. We
  // guard the literal JSX source rather than the rendered HTML so the test
  // is immune to any future dev-mode-only strings the reviewer grep
  // ignores (e.g. comments rendered by mistake).
  const source = await readFile(
    abs('src/surfaces/auth/DemoExpiryBanner.jsx'),
    'utf8',
  );
  // Strip block + line comments: the S-04 rule talks about USER-FACING copy.
  // The banner's documentation block names the forbidden tokens so the
  // rule is self-describing; we scan the non-comment body.
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments.replace(/^\s*\/\/.*$/gm, '');

  const forbiddenTokens = [
    /\bweek\b/i,
    /\bsaved\b/i,
    /account exists/i,
    /demo saved for/i,
    /retention/i,
    /forever/i,
  ];
  for (const pattern of forbiddenTokens) {
    assert.equal(
      pattern.test(withoutLineComments),
      false,
      `S-04 violation: DemoExpiryBanner body must not contain ${pattern}`,
    );
  }
});

test('DemoExpiryBanner rendered markup avoids S-04 forbidden tokens', async () => {
  const html = await renderBanner();
  // Tokens that must NEVER appear in the visible markup a credential-less
  // observer could screenshot. These include every retention / account-
  // existence signal from the S-04 spec.
  const forbidden = ['week', 'saved', 'forever', 'retention', 'account exists'];
  for (const token of forbidden) {
    assert.equal(
      html.toLowerCase().includes(token),
      false,
      `S-04 violation: rendered DemoExpiryBanner must not contain "${token}"`,
    );
  }
  // And must NOT leak raw 401 / unauthorised protocol detail to the learner.
  assert.equal(html.includes('401'), false, 'Raw HTTP status must not leak to the banner.');
  assert.equal(html.toLowerCase().includes('unauthorized'), false, 'Raw unauthorised copy must not leak.');
});

test('DemoExpiryBanner has two neutral CTAs: "Sign in" and "Start new demo"', async () => {
  const html = await renderBanner();
  assert.match(html, />Sign in</);
  assert.match(html, />Start new demo</);
});

// ---------------------------------------------------------------------------
// AuthSurface: branches to DemoExpiryBanner when initialError.code matches.
// ---------------------------------------------------------------------------

test('AuthSurface branches to DemoExpiryBanner on code=demo_session_expired', async () => {
  const html = await renderAuthSurface({ code: 'demo_session_expired', message: 'Demo expired.' });
  // The banner is rendered
  assert.match(html, /data-testid="demo-expiry-banner"/);
  assert.match(html, /Demo session finished/);
  // The generic "Sign in to continue" title must NOT appear
  assert.equal(html.includes('Sign in to continue'), false, 'AuthSurface must not double-render the generic panel.');
  // And the Email / Password inputs of the generic panel must NOT render
  assert.equal(html.includes('name="email"'), false);
  assert.equal(html.includes('name="password"'), false);
});

test('AuthSurface generic 401 (code=unauthenticated) renders the standard sign-in panel', async () => {
  const html = await renderAuthSurface({ code: 'unauthenticated', message: '' });
  assert.match(html, /Sign in to continue/);
  assert.match(html, /name="email"/);
  assert.equal(html.includes('data-testid="demo-expiry-banner"'), false);
});

test('AuthSurface legacy string initialError keeps current behaviour (back-compat)', async () => {
  // tests/react-auth-boot.test.js relies on initialError="expired" rendering
  // the standard panel. This pin protects that contract.
  const html = await renderAuthSurface('expired');
  assert.match(html, /Sign in to continue/);
  assert.match(html, /expired/);
  assert.equal(html.includes('data-testid="demo-expiry-banner"'), false);
});

// ---------------------------------------------------------------------------
// ReadOnlyLearnerNotice: S-05 capability-class language, no feature names.
// ---------------------------------------------------------------------------

test('ReadOnlyLearnerNotice renders capability-class copy, not feature names', async () => {
  const html = await renderReadOnlyLearnerNotice({
    writable: false,
    learnerName: 'Ava',
    writableLearner: { name: 'Ben' },
  });
  // Capability-class language that MUST appear
  assert.match(html, /Some settings are managed by account administrators/);
  assert.match(html, /data-testid="read-only-learner-notice"/);

  // Forbidden feature-name enumerations (S-05 adversarial grep targets)
  const forbidden = [
    'admin settings',
    'TTS configuration',
    'word-bank configuration',
    'monster config',
    'tts configuration',
  ];
  for (const token of forbidden) {
    assert.equal(
      html.toLowerCase().includes(token.toLowerCase()),
      false,
      `S-05 violation: ReadOnlyLearnerNotice must not enumerate "${token}"`,
    );
  }
});

test('ReadOnlyLearnerNotice source file is free of admin-only feature enumerations (S-05 grep)', async () => {
  const source = await readFile(
    abs('src/surfaces/hubs/ReadOnlyLearnerNotice.jsx'),
    'utf8',
  );
  // Strip comments — the rule documentation names the forbidden tokens in
  // a block comment so it is clear what S-05 bans; the user-facing body
  // must not.
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments.replace(/^\s*\/\/.*$/gm, '');

  const forbidden = [
    /admin settings/i,
    /TTS configuration/i,
    /word-bank configuration/i,
    /monster config/i,
  ];
  for (const pattern of forbidden) {
    assert.equal(
      pattern.test(withoutLineComments),
      false,
      `S-05 violation: ReadOnlyLearnerNotice body must not enumerate ${pattern}`,
    );
  }
});

test('ReadOnlyLearnerNotice stays null when access is writable', async () => {
  const html = await renderReadOnlyLearnerNotice({ writable: true, learnerName: 'Ava' });
  assert.equal(html.trim(), '');
});

// ---------------------------------------------------------------------------
// Input preservation contract: the subject session scenes keep the
// `<input>` / `<form>` React key stable with respect to `pendingCommand`.
// A mid-type 401 clears `pendingCommand`; if the key were influenced by
// `pendingCommand`, the input would unmount and the learner's answer would
// be wiped. We prove the invariant by parsing the JSX source and asserting
// that `pendingCommand` is never referenced inside the `inputKey` or `key=`
// expressions for the typed-answer nodes.
// ---------------------------------------------------------------------------

test('input-preservation: SpellingSessionScene inputKey excludes pendingCommand', async () => {
  const source = await readFile(
    abs('src/subjects/spelling/components/SpellingSessionScene.jsx'),
    'utf8',
  );
  const inputKeyMatch = source.match(/const inputKey = \[([\s\S]*?)\]\.join/);
  assert.ok(inputKeyMatch, 'SpellingSessionScene must define `const inputKey = [...]`');
  assert.equal(
    /pendingCommand/i.test(inputKeyMatch[1]),
    false,
    'SH2-U3 invariant: inputKey must not depend on pendingCommand.',
  );
  assert.equal(
    /\bpending\b/.test(inputKeyMatch[1]),
    false,
    'SH2-U3 invariant: inputKey must not depend on the derived `pending` flag.',
  );
});

test('input-preservation: GrammarSessionScene answer-form key excludes pendingCommand', async () => {
  const source = await readFile(
    abs('src/subjects/grammar/components/GrammarSessionScene.jsx'),
    'utf8',
  );
  // Find the `<form ... key={...}` block for the grammar answer form.
  const match = source.match(/<form[\s\S]*?className="grammar-answer-form"[\s\S]*?key=\{([^}]+)\}/);
  assert.ok(match, 'GrammarSessionScene must define the answer-form key.');
  assert.equal(
    /pendingCommand/i.test(match[1]),
    false,
    'SH2-U3 invariant: grammar answer-form key must not depend on pendingCommand.',
  );
});

test('input-preservation: PunctuationSessionScene ChoiceItem/TextItem keys exclude pendingCommand', async () => {
  const source = await readFile(
    abs('src/subjects/punctuation/components/PunctuationSessionScene.jsx'),
    'utf8',
  );
  const choiceKey = source.match(/<ChoiceItem[\s\S]*?key=\{([^}]+)\}/);
  const textKey = source.match(/<TextItem[\s\S]*?key=\{([^}]+)\}/);
  assert.ok(choiceKey, 'PunctuationSessionScene must define ChoiceItem key.');
  assert.ok(textKey, 'PunctuationSessionScene must define TextItem key.');
  assert.equal(
    /pendingCommand/i.test(choiceKey[1]),
    false,
    'SH2-U3 invariant: punctuation ChoiceItem key must not depend on pendingCommand.',
  );
  assert.equal(
    /pendingCommand/i.test(textKey[1]),
    false,
    'SH2-U3 invariant: punctuation TextItem key must not depend on pendingCommand.',
  );
});

// ---------------------------------------------------------------------------
// Input preservation round-trip: render the auth surface with the expired
// code, then swap to the standard surface (code cleared) and confirm the
// banner is gone. This proves the branch is DETERMINED by `initialError.code`
// only, not by any stored submit-lock state that could leak between renders.
// ---------------------------------------------------------------------------

test('input-preservation: AuthSurface toggles cleanly between banner and standard panel', async () => {
  const banner = await renderAuthSurface({ code: 'demo_session_expired' });
  const standard = await renderAuthSurface({ code: 'unauthenticated' });
  assert.match(banner, /Demo session finished/);
  assert.equal(banner.includes('Sign in to continue'), false);
  assert.match(standard, /Sign in to continue/);
  assert.equal(standard.includes('Demo session finished'), false);
});
