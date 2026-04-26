import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// SH2-U5: parser-level + SSR contract tests for the three shared state
// primitives. We render each primitive through
// `renderToStaticMarkup` exactly as production does (one-shot entry
// script + esbuild bundle + `execFileSync`), then assert on the rendered
// HTML. CSS invariants (reduced-motion carve-out, mobile-360 padding
// clamp) are parser-level — read `styles/app.css` as text and regex.
//
// Test surface:
//   1. EmptyState — title + body + CTA wiring, role=status, optional action.
//   2. LoadingSkeleton — row count default + clamp, prefers-reduced-motion
//      carve-out cancels the animation.
//   3. ErrorCard — `code` never appears in visible copy, `data-error-code`
//      attribute present, optional onRetry button.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_PATH = path.join(rootDir, 'styles', 'app.css');

function nodePaths() {
  return [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-ui-primitive-'));
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

function extractRuleBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ruleRegex = new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{`, 'g');
  const match = ruleRegex.exec(source);
  if (!match) return null;
  const braceOpen = source.indexOf('{', match.index);
  if (braceOpen === -1) return null;
  let depth = 1;
  let i = braceOpen + 1;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  return source.slice(braceOpen + 1, i - 1);
}

// ---------- EmptyState ---------- //

test('EmptyState renders role=status + title + body + CTA when action provided', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { EmptyState } from ${absoluteSpecifier('src/platform/ui/EmptyState.jsx')};
    const html = renderToStaticMarkup(
      <EmptyState
        title="No words yet"
        body="No words yet. Your progress is saved. Play a spelling round to add your first word."
        action={{ label: 'Start spelling', onClick: () => {}, dataAction: 'empty-state-start-spelling' }}
      />
    );
    console.log(html);
  `);
  assert.match(html, /role="status"/, 'EmptyState must render role="status" for AT announcement');
  assert.match(html, /aria-live="polite"/, 'EmptyState must use polite live region');
  assert.match(html, /No words yet/, 'EmptyState renders the title');
  assert.match(html, /Play a spelling round to add your first word/, 'EmptyState renders the body');
  assert.match(html, /<button[^>]*class="btn secondary"[^>]*>Start spelling<\/button>/, 'EmptyState renders the CTA button');
  assert.match(html, /data-action="empty-state-start-spelling"/, 'EmptyState forwards the dataAction');
  assert.match(html, /data-testid="empty-state"/, 'EmptyState carries the stable testid');
});

test('EmptyState omits the action row when no action prop is supplied but still announces', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { EmptyState } from ${absoluteSpecifier('src/platform/ui/EmptyState.jsx')};
    const html = renderToStaticMarkup(
      <EmptyState title="Nothing to show" body="Progress is safe." />
    );
    console.log(html);
  `);
  assert.match(html, /role="status"/, 'EmptyState still announces when action is absent');
  assert.match(html, /Nothing to show/);
  assert.match(html, /Progress is safe\./);
  assert.doesNotMatch(html, /empty-state-actions/, 'EmptyState must not render the .actions row when no action is supplied');
  assert.doesNotMatch(html, /<button/, 'EmptyState must not render any button when no action is supplied');
});

test('EmptyState does NOT render an icon with text content visible to AT (icon is aria-hidden)', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { EmptyState } from ${absoluteSpecifier('src/platform/ui/EmptyState.jsx')};
    const html = renderToStaticMarkup(<EmptyState title="t" body="b" />);
    console.log(html);
  `);
  // The icon slot is marked aria-hidden so screen readers don't announce
  // the decorative glyph alongside the copy. If the icon ever becomes
  // load-bearing (e.g. status-only glyph), the primitive should accept an
  // explicit label — don't silently drop the hidden flag.
  assert.match(html, /<span class="empty-state-icon" aria-hidden="true"/, 'icon slot must be aria-hidden decorative');
});

// ---------- LoadingSkeleton ---------- //

test('LoadingSkeleton renders 3 rows by default', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { LoadingSkeleton } from ${absoluteSpecifier('src/platform/ui/LoadingSkeleton.jsx')};
    const html = renderToStaticMarkup(<LoadingSkeleton />);
    console.log(html);
  `);
  const rowMatches = html.match(/loading-skeleton-row/g) || [];
  assert.equal(rowMatches.length, 3, 'default rows should be 3');
  assert.match(html, /role="status"/, 'LoadingSkeleton announces loading politely');
  assert.match(html, /aria-label="Loading"/);
  assert.match(html, /Loading…/, 'sr-only text for screen readers');
});

test('LoadingSkeleton honours an explicit rows count', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { LoadingSkeleton } from ${absoluteSpecifier('src/platform/ui/LoadingSkeleton.jsx')};
    const html = renderToStaticMarkup(<LoadingSkeleton rows={5} />);
    console.log(html);
  `);
  const rowMatches = html.match(/loading-skeleton-row/g) || [];
  assert.equal(rowMatches.length, 5, 'rows=5 should render 5 rows');
});

test('LoadingSkeleton clamps nonsense rows back to the default', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { LoadingSkeleton } from ${absoluteSpecifier('src/platform/ui/LoadingSkeleton.jsx')};
    const html = renderToStaticMarkup(<LoadingSkeleton rows="junk" />);
    console.log(html);
  `);
  const rowMatches = html.match(/loading-skeleton-row/g) || [];
  assert.equal(rowMatches.length, 3, 'non-numeric rows should fall back to 3');
});

test('LoadingSkeleton shimmer respects prefers-reduced-motion (CSS carve-out cancels the animation)', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  const reducedMotionBlocks = css.match(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];
  assert.ok(reducedMotionBlocks.length > 0, 'app.css must declare at least one reduced-motion block');
  const skeletonOverride = reducedMotionBlocks.find((block) => /\.loading-skeleton-row\b/.test(block));
  assert.ok(
    skeletonOverride,
    'A reduced-motion block must override .loading-skeleton-row. Without this, learners who asked motion to stop still see the 1.4s shimmer pulse on every placeholder.',
  );
  assert.match(
    skeletonOverride,
    /\.loading-skeleton-row\b[^{]*\{[^}]*animation\s*:\s*none/,
    'the reduced-motion override must set `animation: none` — shortening the duration is not enough',
  );
});

test('LoadingSkeleton shimmer keyframes animate only background-position (compositor-cheap)', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  // The shimmer keyframes are named `loading-skeleton-shimmer` and should
  // animate only the gradient's background-position (cheap, compositor-
  // only). No width/height/top/left animation — those would trigger
  // per-frame layout for every placeholder, which becomes noticeable as
  // soon as two or three skeletons stack on a panel.
  const marker = '@keyframes loading-skeleton-shimmer';
  const start = css.indexOf(marker);
  assert.ok(start >= 0, 'expected @keyframes loading-skeleton-shimmer in app.css');
  const braceOpen = css.indexOf('{', start);
  let depth = 1;
  let i = braceOpen + 1;
  while (i < css.length && depth > 0) {
    const ch = css[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  const block = css.slice(braceOpen + 1, i - 1);
  const props = new Set();
  const re = /(?:^|[{;\s])\s*([a-z-]+)\s*:/g;
  let m;
  while ((m = re.exec(block)) !== null) props.add(m[1]);
  const forbidden = [...props].filter((p) => !['background-position'].includes(p));
  assert.deepEqual(forbidden, [], `loading-skeleton-shimmer should animate only background-position. Found: ${JSON.stringify(forbidden)}`);
});

// ---------- ErrorCard ---------- //

test('ErrorCard renders title + body + retry button when onRetry is provided', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ErrorCard } from ${absoluteSpecifier('src/platform/ui/ErrorCard.jsx')};
    const html = renderToStaticMarkup(
      <ErrorCard
        title="Couldn't load"
        body="We'll keep the last saved progress visible. Retry to fetch the latest."
        onRetry={() => {}}
        code="remote_error_503"
      />
    );
    console.log(html);
  `);
  assert.match(html, /role="alert"/, 'ErrorCard must use role=alert so AT announces the failure');
  assert.match(html, /aria-live="polite"/, 'polite announcement so mid-session keystrokes are not interrupted');
  assert.match(html, /Couldn&#x27;t load/);
  assert.match(html, /We&#x27;ll keep the last saved progress visible/);
  assert.match(html, /<button[^>]*class="btn secondary"[^>]*>Try again<\/button>/, 'retry button defaults to "Try again"');
  assert.match(html, /data-error-code="remote_error_503"/, '`code` must be surfaced ONLY as data-error-code');
});

test('ErrorCard never renders `code` in visible copy — belt-and-braces for SH2-U12 oracle', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ErrorCard } from ${absoluteSpecifier('src/platform/ui/ErrorCard.jsx')};
    const html = renderToStaticMarkup(
      <ErrorCard
        title="Temporary network blip"
        body="Progress is saved locally."
        code="CRITICAL_DB_FAIL_ABCD1234"
      />
    );
    console.log(html);
  `);
  // The raw code token must only live on the data attribute — never in
  // the text the learner reads. Strip the data attribute and assert.
  const stripped = html.replace(/data-error-code="[^"]*"/g, '');
  assert.doesNotMatch(stripped, /CRITICAL_DB_FAIL_ABCD1234/, 'visible copy must not leak the raw error code');
});

test('ErrorCard omits the retry button when onRetry is absent', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ErrorCard } from ${absoluteSpecifier('src/platform/ui/ErrorCard.jsx')};
    const html = renderToStaticMarkup(<ErrorCard title="Oh" body="Safe." />);
    console.log(html);
  `);
  assert.doesNotMatch(html, /<button/, 'ErrorCard without onRetry must not render a dead button');
  assert.doesNotMatch(html, /error-card-actions/);
});

test('ErrorCard accepts a custom retryLabel', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ErrorCard } from ${absoluteSpecifier('src/platform/ui/ErrorCard.jsx')};
    const html = renderToStaticMarkup(
      <ErrorCard title="x" body="y" onRetry={() => {}} retryLabel="Retry sync" />
    );
    console.log(html);
  `);
  assert.match(html, /Retry sync/);
});

// ---------- Mobile-360 overflow contract ---------- //

test('All three primitives declare box-sizing: border-box + max-width: 100% to stay within mobile-360 viewport', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  for (const selector of ['.empty-state', '.loading-skeleton', '.error-card']) {
    const block = extractRuleBlock(css, selector);
    assert.ok(block !== null, `expected ${selector} rule in app.css`);
    assert.match(block, /box-sizing\s*:\s*border-box/, `${selector} must declare box-sizing: border-box so padding does not push the panel past the viewport on mobile-360`);
    assert.match(block, /max-width\s*:\s*100%/, `${selector} must declare max-width: 100% so the primitive stays inside its parent column on narrow screens`);
  }
});

test('Primitives keep padding sane at mobile-360 (≤ 380px viewport clamp block present)', () => {
  const css = readFileSync(CSS_PATH, 'utf8');
  // Each primitive has a narrow-viewport media block that shrinks the
  // padding so a 360px-wide viewport doesn't consume half the panel on
  // padding alone. The rule shape is not dictated here — just the
  // presence of at least one `.empty-state { padding: ... }` override
  // inside a `@media (max-width: 380px)` block.
  const narrowBlocks = css.match(/@media\s*\(\s*max-width\s*:\s*380px\s*\)\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];
  assert.ok(narrowBlocks.length > 0, 'expected at least one @media (max-width: 380px) block');
  const emptyBlockPresent = narrowBlocks.some((block) => /\.empty-state\s*\{[^}]*padding/.test(block));
  const loadingBlockPresent = narrowBlocks.some((block) => /\.loading-skeleton\s*\{[^}]*padding/.test(block));
  const errorBlockPresent = narrowBlocks.some((block) => /\.error-card\s*\{[^}]*padding/.test(block));
  assert.ok(emptyBlockPresent, '.empty-state must have a narrow-viewport padding override so mobile-360 stays breathable');
  assert.ok(loadingBlockPresent, '.loading-skeleton must have a narrow-viewport padding override');
  assert.ok(errorBlockPresent, '.error-card must have a narrow-viewport padding override');
});
