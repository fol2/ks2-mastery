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

// ---------- P2 U2: Card + SectionHeader ---------- //

test('Card renders <div class="card [tone]"> with declared tone modifier and children', async () => {
  const html = await renderFixture(`
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Card } from ${absoluteSpecifier('src/platform/ui/Card.jsx')};
    const html = renderToStaticMarkup(
      <Card tone="soft"><p>Inside the card.</p></Card>
    );
    console.log(html);
  `);
  assert.match(html, /^<div class="card soft"/, 'Card must render <div class="card soft"> for tone="soft"');
  assert.match(html, /Inside the card\./, 'children must render inside the Card');
});

test('Card with no accent does NOT emit a --card-accent CSS variable', async () => {
  const html = await renderFixture(`
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Card } from ${absoluteSpecifier('src/platform/ui/Card.jsx')};
    const html = renderToStaticMarkup(<Card>plain</Card>);
    console.log(html);
  `);
  assert.doesNotMatch(html, /--card-accent/, 'Card without accent prop must not emit the --card-accent variable, keeping the CSP inline-style ledger unchanged for the common case');
  assert.doesNotMatch(html, /style=/, 'Card without accent must render no inline style at all');
});

test('Card with accent="var(--grammar-accent)" emits --card-accent variable in inline style', async () => {
  // U2 plan: only Grammar's --grammar-accent is exercised as the working
  // test case. Punctuation accent waits for U6.
  const html = await renderFixture(`
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Card } from ${absoluteSpecifier('src/platform/ui/Card.jsx')};
    const html = renderToStaticMarkup(
      <Card accent="var(--grammar-accent)">grammar-tinted</Card>
    );
    console.log(html);
  `);
  assert.match(html, /--card-accent\s*:\s*var\(--grammar-accent\)/, 'Card with accent must emit --card-accent: var(--grammar-accent)');
});

test('Card with as="article" produces <article> element while preserving .card class', async () => {
  const html = await renderFixture(`
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Card } from ${absoluteSpecifier('src/platform/ui/Card.jsx')};
    const html = renderToStaticMarkup(<Card as="article">art</Card>);
    console.log(html);
  `);
  assert.match(html, /^<article class="card"/, 'as="article" must render <article class="card">');
  assert.doesNotMatch(html, /<div /, 'no <div> wrapper should appear when as="article"');
});

test('Card forwards data-* + aria-* attributes for locator preservation', async () => {
  const html = await renderFixture(`
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Card } from ${absoluteSpecifier('src/platform/ui/Card.jsx')};
    const html = renderToStaticMarkup(
      <Card as="section" data-section="hero" aria-label="Today's lesson">
        body
      </Card>
    );
    console.log(html);
  `);
  assert.match(html, /data-section="hero"/, 'data-section must pass through');
  assert.match(html, /aria-label="Today&#x27;s lesson"/, 'aria-label must pass through');
});

test('SectionHeader renders eyebrow + title + subtitle + slots in DOM order with semantic landmarks', async () => {
  const html = await renderFixture(`
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SectionHeader } from ${absoluteSpecifier('src/platform/ui/SectionHeader.jsx')};
    import { Button } from ${absoluteSpecifier('src/platform/ui/Button.jsx')};
    const html = renderToStaticMarkup(
      <SectionHeader
        eyebrow="Today"
        title="Word Bank"
        subtitle="Words you have learned this week."
        statusChip={<span className="chip">Live</span>}
        trailingAction={<Button onClick={() => {}}>Start</Button>}
      />
    );
    console.log(html);
  `);
  // Semantic landmark: <header> wrapper.
  assert.match(html, /^<header class="section-header"/, 'SectionHeader default rendering must use <header> landmark');
  // Heading element default level is 2.
  assert.match(html, /<h2 class="section-title">Word Bank<\/h2>/, 'title must render as <h2 class="section-title">');
  // Eyebrow + subtitle classes carry over from existing app.css.
  assert.match(html, /<span class="eyebrow">Today<\/span>/);
  assert.match(html, /<p class="subtitle">Words you have learned this week\.<\/p>/);
  // DOM order: eyebrow → title → subtitle → statusChip → trailingAction.
  const eyebrowIdx = html.indexOf('eyebrow');
  const titleIdx = html.indexOf('section-title');
  const subtitleIdx = html.indexOf('subtitle');
  const statusIdx = html.indexOf('section-header-status');
  const actionIdx = html.indexOf('section-header-action');
  assert.ok(eyebrowIdx < titleIdx, 'eyebrow must precede title');
  assert.ok(titleIdx < subtitleIdx, 'title must precede subtitle');
  assert.ok(subtitleIdx < statusIdx, 'subtitle must precede statusChip');
  assert.ok(statusIdx < actionIdx, 'statusChip must precede trailingAction in DOM order');
  // Integration: trailingAction slot accepts a Button — assert Button rendered.
  // Focus visibility is a runtime concern (.btn:focus-visible CSS rule);
  // SSR cannot observe focus state, so we assert the Button child is
  // present and not stripped by the slot pass-through.
  assert.match(html, /<button[^>]*class="btn primary"[^>]*>Start<\/button>/, 'Button trailingAction must render inside the slot');
});

test('SectionHeader honours level prop and clamps invalid values', async () => {
  const html = await renderFixture(`
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SectionHeader } from ${absoluteSpecifier('src/platform/ui/SectionHeader.jsx')};
    const html = renderToStaticMarkup(
      <>
        <SectionHeader title="Page" level={1} />
        <SectionHeader title="Sub" level={3} />
        <SectionHeader title="Bogus" level={9} />
      </>
    );
    console.log(html);
  `);
  assert.match(html, /<h1 class="section-title">Page<\/h1>/, 'level=1 → <h1>');
  assert.match(html, /<h3 class="section-title">Sub<\/h3>/, 'level=3 → <h3>');
  assert.match(html, /<h6 class="section-title">Bogus<\/h6>/, 'invalid level=9 must clamp to <h6>');
});

test('SectionHeader skips empty slots cleanly (no empty <span> / <p> / status / action wrapper)', async () => {
  const html = await renderFixture(`
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SectionHeader } from ${absoluteSpecifier('src/platform/ui/SectionHeader.jsx')};
    const html = renderToStaticMarkup(<SectionHeader title="Just a title" />);
    console.log(html);
  `);
  assert.match(html, /<h2 class="section-title">Just a title<\/h2>/);
  assert.doesNotMatch(html, /class="eyebrow"/, 'no eyebrow span when prop is omitted');
  assert.doesNotMatch(html, /class="subtitle"/, 'no subtitle paragraph when prop is omitted');
  assert.doesNotMatch(html, /section-header-status/, 'no status wrapper when statusChip is omitted');
  assert.doesNotMatch(html, /section-header-action/, 'no action wrapper when trailingAction is omitted');
});

test('SubjectRuntimeFallback renders ErrorCard inside the Card wrapper without changing accessibility tree', async () => {
  // Integration check: the U2 migration of SubjectRuntimeFallback must
  // continue to surface (a) the `.card.border-top.subject-runtime-fallback`
  // class string for any scoped CSS hooks, (b) the inner ErrorCard's
  // role="alert" + data-error-code, and (c) the diagnostic footer text.
  const html = await renderFixture(`
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SubjectRuntimeFallback } from ${absoluteSpecifier('src/surfaces/subject/SubjectRuntimeFallback.jsx')};
    const html = renderToStaticMarkup(
      <SubjectRuntimeFallback
        subject={{ name: 'Grammar', accent: '#3E6FA8' }}
        runtimeEntry={{ phase: 'render', methodName: 'renderPractice', message: 'Crashed.' }}
        activeTab="practice"
        onRetry={() => {}}
      />
    );
    console.log(html);
  `);
  // Card preserves the legacy class string + element type.
  assert.match(html, /<section class="card error border-top subject-runtime-fallback"/, 'SubjectRuntimeFallback must wrap in <section class="card error border-top subject-runtime-fallback">');
  // Inner ErrorCard preserves its alert affordance.
  assert.match(html, /role="alert"/, 'inner ErrorCard must keep role="alert" for AT');
  assert.match(html, /data-error-code="renderPractice"/, 'inner ErrorCard must keep data-error-code');
  // Diagnostic footer remains visible to operators.
  assert.match(html, /Failure point: renderPractice/);
});
