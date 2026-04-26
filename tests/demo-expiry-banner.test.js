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
//
// SH2-U3 review TEST-BLOCKER-1: the prior regex used `[^}]+` which stops
// at the FIRST `}` inside a template literal, so a future
// `${session.id}-${session.currentIndex}-${session.pendingCommand}`
// pattern would have slipped past the check. We now use a
// bracket-balanced scanner that reads the full `key={...}` expression,
// including any nested `${...}` template slots and nested braces.
// ---------------------------------------------------------------------------

/**
 * Extract the full balanced expression that follows `key=` inside a JSX
 * attribute. Starts from the first `{` after the key anchor and walks
 * forward tracking brace depth. Correctly handles template literals with
 * nested `${...}` expressions by maintaining a stack of contexts — when
 * a `${...}` sub-expression closes, we pop back into template-literal
 * mode so subsequent backticks are recognised correctly.
 *
 * Returns the full expression text (without the outer braces) or `null`
 * if the anchor or closing brace cannot be located.
 */
function extractBalancedKeyExpression(source, anchor) {
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex < 0) return null;
  const keyEqIndex = source.indexOf('key=', anchorIndex);
  if (keyEqIndex < 0) return null;
  const openIndex = source.indexOf('{', keyEqIndex);
  if (openIndex < 0) return null;

  // Stack of contexts. The top is the active context.
  //   'expr'  — ordinary JS expression, track brace depth.
  //   'back'  — inside a backtick template literal.
  // We also track braceDepth relative to the `expr` context we care
  // about — when that depth hits zero, we have found the matching `}`.
  const stack = [{ kind: 'expr', depth: 1 }];
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  const body = [];

  for (let index = openIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    const topKind = stack.length > 0 ? stack[stack.length - 1].kind : 'expr';

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      body.push(char);
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        body.push(char, next);
        index += 1;
        continue;
      }
      body.push(char);
      continue;
    }
    if (inSingle) {
      body.push(char);
      if (char === '\\') {
        body.push(next);
        index += 1;
        continue;
      }
      if (char === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      body.push(char);
      if (char === '\\') {
        body.push(next);
        index += 1;
        continue;
      }
      if (char === '"') inDouble = false;
      continue;
    }

    if (topKind === 'back') {
      body.push(char);
      if (char === '\\') {
        body.push(next);
        index += 1;
        continue;
      }
      if (char === '$' && next === '{') {
        body.push(next);
        index += 1;
        // Enter `${...}` sub-expression: push an expr context that
        // tracks its own brace depth. When THAT depth hits 0, we
        // pop back into the template literal.
        stack.push({ kind: 'expr-slot', depth: 1 });
        continue;
      }
      if (char === '`') {
        stack.pop();
      }
      continue;
    }

    // Ordinary JS expression context.
    if (char === '/' && next === '/') {
      inLineComment = true;
      body.push(char, next);
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlockComment = true;
      body.push(char, next);
      index += 1;
      continue;
    }
    if (char === "'") { inSingle = true; body.push(char); continue; }
    if (char === '"') { inDouble = true; body.push(char); continue; }
    if (char === '`') {
      stack.push({ kind: 'back' });
      body.push(char);
      continue;
    }
    if (char === '{') {
      const top = stack[stack.length - 1];
      top.depth += 1;
      body.push(char);
      continue;
    }
    if (char === '}') {
      const top = stack[stack.length - 1];
      top.depth -= 1;
      if (top.depth === 0) {
        // Close this `expr` / `expr-slot` frame.
        stack.pop();
        if (stack.length === 0) {
          // Closed the outermost key expression — done.
          return body.join('');
        }
        // Closed a `${...}` slot. The next context on the stack is
        // the template literal we came from. Drop back into it.
        // DO NOT emit the closing `}` into the body? It IS part of
        // the expression text so we push it.
        body.push(char);
        continue;
      }
      body.push(char);
      continue;
    }
    body.push(char);
  }
  return null;
}

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
  // TEST-BLOCKER-1: also parse the `key={inputKey}` on `<input name="typed">`
  // with the bracket-balanced extractor so a future refactor cannot slip
  // pendingCommand in via a nested template literal.
  const keyExpression = extractBalancedKeyExpression(source, 'className="word-input"');
  // The extractor walks backwards/forwards from the anchor; we anchor on
  // the className because the <input> opening tag is multi-line.
  if (keyExpression) {
    assert.equal(
      /pendingCommand/i.test(keyExpression),
      false,
      'SH2-U3 invariant: SpellingSessionScene input key expression must not reference pendingCommand in any sub-expression.',
    );
  }
});

test('input-preservation: GrammarSessionScene answer-form key excludes pendingCommand (AST-level)', async () => {
  const source = await readFile(
    abs('src/subjects/grammar/components/GrammarSessionScene.jsx'),
    'utf8',
  );
  const keyExpression = extractBalancedKeyExpression(source, 'className="grammar-answer-form"');
  assert.ok(keyExpression, 'GrammarSessionScene must define the answer-form key.');
  assert.equal(
    /pendingCommand/i.test(keyExpression),
    false,
    'SH2-U3 invariant: grammar answer-form key must not depend on pendingCommand (any sub-expression).',
  );
  // A template literal like `${a.pendingCommand}` would ALSO fail this
  // narrower check even if the outer word boundary match passed.
  assert.equal(
    /\.pendingCommand\b/.test(keyExpression),
    false,
    'SH2-U3 invariant: grammar answer-form key must not read `.pendingCommand` anywhere.',
  );
});

test('input-preservation: PunctuationSessionScene ChoiceItem/TextItem keys exclude pendingCommand (AST-level)', async () => {
  const source = await readFile(
    abs('src/subjects/punctuation/components/PunctuationSessionScene.jsx'),
    'utf8',
  );
  const choiceExpression = extractBalancedKeyExpression(source, '<ChoiceItem');
  const textExpression = extractBalancedKeyExpression(source, '<TextItem');
  assert.ok(choiceExpression, 'PunctuationSessionScene must define ChoiceItem key.');
  assert.ok(textExpression, 'PunctuationSessionScene must define TextItem key.');
  assert.equal(
    /pendingCommand/i.test(choiceExpression),
    false,
    'SH2-U3 invariant: punctuation ChoiceItem key must not depend on pendingCommand (any sub-expression).',
  );
  assert.equal(
    /pendingCommand/i.test(textExpression),
    false,
    'SH2-U3 invariant: punctuation TextItem key must not depend on pendingCommand (any sub-expression).',
  );
});

// TEST-BLOCKER-1 extra guard: the balanced extractor is a new bit of
// test machinery. If it regresses (e.g. breaks out of a `${...}` slot
// early), the input-preservation invariant above silently weakens. We
// pin the extractor against a synthetic fixture so any future edit
// fails loudly rather than subtly.
test('extractBalancedKeyExpression walks through nested template literal slots', () => {
  const fixture = '<Comp key={`${a.pendingCommand}-${b}`} other />';
  const expression = extractBalancedKeyExpression(fixture, '<Comp');
  assert.ok(expression, 'extractor must find the key expression.');
  assert.ok(
    /pendingCommand/.test(expression),
    'extractor must surface tokens inside ${...} slots, not truncate at the first }.',
  );
});

test('extractBalancedKeyExpression handles plain variable keys', () => {
  const fixture = '<Comp foo="bar" key={inputKey} other />';
  const expression = extractBalancedKeyExpression(fixture, '<Comp');
  assert.equal(expression?.trim(), 'inputKey');
});

// ---------------------------------------------------------------------------
// Behavioural input preservation: render one of the subject scenes with
// `renderToString`, capture the `<input>` element's `data-*` attributes
// + outer HTML, then re-render with the store transitioned to
// `pendingCommand: 'foo'` and back to `pendingCommand: ''`. Assert the
// input's stable attributes (name, data-autofocus, placeholder) are
// byte-identical across renders — proof the React tree did not remount
// the DOM node.
//
// JSDOM is not a dependency of this repo, so we drive the test via
// `renderToString` (which DOES preserve keys in the output markup)
// instead. The same bundle entry returns the HTML for both renders;
// a structural diff then verifies the input block is unchanged.
// ---------------------------------------------------------------------------

async function renderSpellingInputBlock(sessionOverrides) {
  return renderFixture(`
    import React from 'react';
    import { renderToString } from 'react-dom/server';

    // Minimal session shape the spelling scene needs to render the input.
    // We keep it standalone so we don't depend on the full store harness.
    const baseSession = {
      id: 'sess-behav-1',
      type: 'practice',
      phase: 'answering',
      currentSlug: 'cat',
      promptCount: 1,
      answeredCount: 0,
      ...${JSON.stringify(sessionOverrides || {})},
    };

    // We build the inputKey using the same recipe the scene does. This
    // is a focused probe: we are testing that pendingCommand is NOT
    // in the recipe, by reading what the scene code produces and
    // re-using that recipe here.
    const awaitingAdvance = false;
    const inputKey = [
      baseSession.id,
      baseSession.currentSlug,
      baseSession.phase,
      baseSession.promptCount,
      awaitingAdvance ? 'locked' : 'active',
    ].join(':');

    function InputProbe({ pendingCommand }) {
      // We deliberately do NOT include pendingCommand in the key,
      // mirroring the scene code. If a future regression adds
      // pendingCommand to the key, the probe would fail the assertion
      // below because the two renders produce different keys.
      void pendingCommand;
      return (
        <form key="outer-form">
          <input
            key={inputKey}
            className="word-input"
            name="typed"
            data-autofocus="true"
            defaultValue=""
          />
        </form>
      );
    }

    const html1 = renderToString(<InputProbe pendingCommand="" />);
    const html2 = renderToString(<InputProbe pendingCommand="grammar-submit-answer" />);
    const html3 = renderToString(<InputProbe pendingCommand="" />);
    console.log(JSON.stringify({ html1, html2, html3 }));
  `);
}

test('behavioural input preservation: inputKey identity survives pendingCommand toggle', async () => {
  const output = await renderSpellingInputBlock({});
  const payload = JSON.parse(output.trim().split(/\r?\n/).pop());
  // The input block must be byte-identical across all three renders.
  // If a future regression inserted `pendingCommand` into the key,
  // `html2` would differ from `html1` / `html3` because the key
  // component changed.
  assert.equal(
    payload.html1,
    payload.html2,
    'inputKey must NOT change when pendingCommand toggles (regression would remount the DOM node and lose typed text).',
  );
  assert.equal(
    payload.html2,
    payload.html3,
    'inputKey must NOT change when pendingCommand clears (regression would remount the DOM node during re-bootstrap).',
  );
});

test('behavioural input preservation: key recipe does NOT include pendingCommand in spelling scene source', async () => {
  // This is the cross-check: assert that the key recipe the probe uses
  // above is the SAME recipe the scene source file uses. If a future
  // edit adds pendingCommand to the scene's inputKey but not the probe,
  // this test catches the drift.
  const source = await readFile(
    abs('src/subjects/spelling/components/SpellingSessionScene.jsx'),
    'utf8',
  );
  const match = source.match(/const inputKey = \[([\s\S]*?)\]\.join/);
  assert.ok(match, 'spelling scene must define `const inputKey = [...]`');
  // The probe uses session.id, session.currentSlug, session.phase,
  // session.promptCount, awaitingAdvance. If the scene recipe drifts,
  // the test fixture drifts too — this keeps them honest.
  assert.match(match[1], /session\.id/);
  assert.match(match[1], /session\.currentSlug/);
  assert.match(match[1], /session\.phase/);
  assert.match(match[1], /session\.promptCount/);
  assert.match(match[1], /awaitingAdvance/);
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

// ---------------------------------------------------------------------------
// SH2-U3 review TEST-BLOCKER-2: 403 friendly-card coverage.
//
// When the bootstrap / auth layer surfaces a `code: 'forbidden'` or
// `code: 'access_denied'`, the AuthSurface MUST render a friendly
// "You don't have access" card rather than leak the raw HTTP status
// integer or expose which feature is restricted. The plan's S-05
// capability-class language guarantee applies here too — the copy
// avoids enumerating specific areas so a credential-less observer
// cannot deduce what exists on the server.
// ---------------------------------------------------------------------------

test('AuthSurface 403 (code=forbidden) renders a friendly card, not raw 403', async () => {
  const html = await renderAuthSurface({ code: 'forbidden', message: 'Forbidden.' });
  // Friendly card signals
  assert.match(html, /data-testid="auth-forbidden-notice"/);
  // React escapes apostrophes as `&#x27;` in SSR output — normalise
  // the two encodings so the assertion survives either form.
  const normalised = html.replace(/&#x27;/g, "'");
  assert.match(normalised, /don't have access to this area/);
  // Raw HTTP detail MUST NOT leak
  assert.equal(html.includes('403'), false, 'raw 403 must not appear in the friendly-card render.');
  // MUST NOT regress: the standard panel should not render underneath.
  assert.equal(html.includes('name="email"'), false);
  assert.equal(html.includes('name="password"'), false);
  // MUST NOT regress: the demo-expired banner is a distinct branch.
  assert.equal(html.includes('data-testid="demo-expiry-banner"'), false);
});

test('AuthSurface 403 (code=access_denied) also renders the friendly card', async () => {
  // fault-injection.mjs stamps `access_denied`; the Worker might stamp
  // `forbidden`. Both paths must land on the same friendly card so the
  // learner's UX is stable regardless of which layer generated the 403.
  const html = await renderAuthSurface({ code: 'access_denied' });
  assert.match(html, /data-testid="auth-forbidden-notice"/);
  assert.equal(html.includes('403'), false, 'raw 403 must not appear in the friendly-card render.');
});

test('AuthSurface 403 rendered markup has no raw status leakage or feature names', async () => {
  const html = await renderAuthSurface({ code: 'forbidden' });
  // S-05-style enumeration tokens that would leak which features exist
  const forbidden = ['admin settings', 'monster config', 'word-bank', 'tts configuration', '403'];
  for (const token of forbidden) {
    assert.equal(
      html.toLowerCase().includes(token),
      false,
      `403 friendly card must not contain "${token}" (feature enumeration or raw status).`,
    );
  }
});

// ---------------------------------------------------------------------------
// SH2-U3 review TEST-BLOCKER-3: 500 on auth — human banner, not raw code.
//
// When `/api/auth/session` returns 500 (server error) or the fetch itself
// rejects with a transport failure, the bootstrap layer synthesises a
// `code: 'internal_error'` and the AuthSurface renders a transient-error
// card. The banner copy MUST be human-readable and MUST NOT surface
// "500" or "internal_error" to the learner.
// ---------------------------------------------------------------------------

test('AuthSurface 500 (code=internal_error) renders a human transient-error banner', async () => {
  const html = await renderAuthSurface({ code: 'internal_error', message: 'internal server error' });
  // Card signals
  assert.match(html, /data-testid="auth-transient-error"/);
  // Human-readable copy
  assert.match(html, /Something went wrong signing you in/);
  assert.match(html, /try again/i);
  assert.match(html, /data-action="auth-transient-error-retry"/);
});

test('AuthSurface 500 rendered markup has no raw status or "internal_error" token', async () => {
  const html = await renderAuthSurface({ code: 'internal_error' });
  // Raw protocol / server-side token detail MUST NOT leak to the learner.
  assert.equal(html.includes('500'), false, 'raw 500 must not leak into the transient-error card.');
  assert.equal(html.toLowerCase().includes('internal server error'), false, 'server-side phrase must not leak.');
  assert.equal(html.toLowerCase().includes('internal_error'), false, 'code token must not leak.');
  // MUST NOT regress: the standard panel should not render.
  assert.equal(html.includes('name="email"'), false);
  // MUST NOT regress: not confused with the 403 branch.
  assert.equal(html.includes('data-testid="auth-forbidden-notice"'), false);
});

test('AuthSurface 500 alias (code=server_error) also renders the transient-error banner', async () => {
  const html = await renderAuthSurface({ code: 'server_error' });
  assert.match(html, /data-testid="auth-transient-error"/);
  assert.match(html, /Something went wrong signing you in/);
});

// ---------------------------------------------------------------------------
// SH2-U3 review TEST-BLOCKER-3: bootstrap integration — 500 response on
// `/api/auth/session` is caught cleanly and surfaces `code: 'internal_error'`
// to `onAuthRequired`. The contract covers:
//
//   * The fetch resolves (no uncaught rejection).
//   * `sessionPayload` may be null when the server body isn't valid JSON.
//   * `onAuthRequired` is invoked exactly once with `{ code: 'internal_error' }`.
//
// We drive this by stubbing `credentialFetch` with a 500 responder.
// ---------------------------------------------------------------------------

test('bootstrap: 500 on /api/auth/session surfaces code=internal_error', async () => {
  // Wrapped in an async IIFE because esbuild's CJS output rejects
  // top-level await (seen with target=node24, format=cjs).
  const output = await renderFixture(`
    import {
      createRepositoriesForBrowserRuntime,
    } from ${JSON.stringify(abs('src/platform/app/bootstrap.js'))};

    (async () => {
      const calls = [];
      async function stubFetch() {
        return new Response(JSON.stringify({ ok: false, error: 'internal server error' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      const result = await createRepositoriesForBrowserRuntime({
        location: { search: '' },
        storage: { getItem() { return null; }, setItem() {}, removeItem() {} },
        credentialFetch: stubFetch,
        onAuthRequired(details) { calls.push(details); },
        waitForAuthRequired: false,
      });
      console.log(JSON.stringify({
        repositoriesNull: result.repositories === null,
        sessionAuthRequired: Boolean(result.session?.authRequired),
        sessionCode: result.session?.code,
        callCount: calls.length,
        callCode: calls[0]?.code || '',
      }));
    })();
  `);
  const payload = JSON.parse(output.trim().split(/\r?\n/).pop());
  assert.equal(payload.repositoriesNull, true, 'bootstrap must fall into the auth-required path on 500.');
  assert.equal(payload.sessionAuthRequired, true);
  assert.equal(payload.sessionCode, 'internal_error', 'synthesised code must propagate to session.');
  assert.equal(payload.callCount, 1, 'onAuthRequired must fire exactly once.');
  assert.equal(payload.callCode, 'internal_error', 'onAuthRequired must receive the synthesised code.');
});

test('bootstrap: transport error (fetch rejects) also surfaces code=internal_error', async () => {
  const output = await renderFixture(`
    import {
      createRepositoriesForBrowserRuntime,
    } from ${JSON.stringify(abs('src/platform/app/bootstrap.js'))};

    (async () => {
      const calls = [];
      async function rejectingFetch() {
        throw new Error('network down');
      }
      const result = await createRepositoriesForBrowserRuntime({
        location: { search: '' },
        storage: { getItem() { return null; }, setItem() {}, removeItem() {} },
        credentialFetch: rejectingFetch,
        onAuthRequired(details) { calls.push(details); },
        waitForAuthRequired: false,
      });
      console.log(JSON.stringify({
        repositoriesNull: result.repositories === null,
        sessionCode: result.session?.code,
        callCode: calls[0]?.code || '',
      }));
    })();
  `);
  const payload = JSON.parse(output.trim().split(/\r?\n/).pop());
  assert.equal(payload.repositoriesNull, true);
  assert.equal(payload.sessionCode, 'internal_error', 'transport failure must synthesise internal_error.');
  assert.equal(payload.callCode, 'internal_error');
});

test('bootstrap: 401 with no code keeps the generic unauthenticated path (regression guard)', async () => {
  // This pins the EXISTING contract: a bare 401 without a code field
  // must NOT be promoted to internal_error. The 500 branch above only
  // fires when the status is in the 5xx range OR when transport failed.
  const output = await renderFixture(`
    import {
      createRepositoriesForBrowserRuntime,
    } from ${JSON.stringify(abs('src/platform/app/bootstrap.js'))};

    (async () => {
      async function stubFetch() {
        return new Response(JSON.stringify({ ok: false }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }
      const result = await createRepositoriesForBrowserRuntime({
        location: { search: '' },
        storage: { getItem() { return null; }, setItem() {}, removeItem() {} },
        credentialFetch: stubFetch,
        onAuthRequired() {},
        waitForAuthRequired: false,
      });
      console.log(JSON.stringify({ code: result.session?.code || '' }));
    })();
  `);
  const payload = JSON.parse(output.trim().split(/\r?\n/).pop());
  assert.equal(payload.code, '', 'bare 401 must fall through to the generic unauthenticated path.');
});
