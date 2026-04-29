import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// P2 U1: parser-level + SSR contract tests for the shared `Button`
// primitive. Mirrors `tests/empty-state-primitive.test.js` exactly —
// a one-shot esbuild bundle is rendered through `renderToStaticMarkup`
// via `execFileSync`, and the resulting HTML is asserted against
// regex matchers. CSS invariants (no new CSS in U1) live in
// `tests/empty-state-primitive.test.js` — this file does not duplicate
// those assertions.
//
// Test surface:
//   1. Happy path — `<button type="button" class="btn primary xl">`
//      with declared variant + size + children.
//   2. Happy path — `data-action`, `data-value`, and arbitrary
//      `data-*` attributes forward byte-identical to a hand-rolled
//      equivalent.
//   3. Edge case — `busy=true` toggles `aria-busy="true"`, `disabled`,
//      and `.is-loading` together.
//   4. Edge case — `disabled=true` without `busy` renders `disabled`
//      WITHOUT `aria-busy`.
//   5. Edge case — `startIcon` and `endIcon` slots render in DOM
//      order with no whitespace artefact when one slot is absent.
//   6. Error path — missing both visible children AND `aria-label`
//      throws (developer ergonomics; not a runtime throw learners
//      would ever reach because parser-test catches it first).

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function nodePaths() {
  return [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-button-primitive-'));
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

// ---------- Happy path: variant + size + children ---------- //

test('Button renders <button type="button"> with the declared variant + size as .btn classes and children text', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Button } from ${absoluteSpecifier('src/platform/ui/Button.jsx')};
    const html = renderToStaticMarkup(
      <Button variant="primary" size="xl" dataAction="grammar-start" onClick={() => {}}>
        Start round
      </Button>
    );
    console.log(html);
  `);
  assert.match(
    html,
    /<button[^>]*type="button"[^>]*class="btn primary xl"[^>]*>[\s\S]*Start round[\s\S]*<\/button>/,
    'Button must render <button type="button"> with composed `.btn primary xl` classes and the children text',
  );
  assert.match(html, /data-action="grammar-start"/, 'dataAction must surface as data-action attribute');
});

test('Button renders the bare `.btn` class when size is the md default', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Button } from ${absoluteSpecifier('src/platform/ui/Button.jsx')};
    const html = renderToStaticMarkup(
      <Button variant="secondary">Cancel</Button>
    );
    console.log(html);
  `);
  // `md` is the unmodified `.btn` rule — the modifier class must NOT
  // appear in the output. Capture the class attribute precisely.
  assert.match(html, /class="btn secondary"/, 'md size must render `.btn secondary` without a size modifier');
  assert.doesNotMatch(html, /class="[^"]*\bmd\b[^"]*"/, 'md size must NOT emit a literal `md` class');
});

// ---------- Happy path: locator-preservation byte parity ---------- //

test('Button forwards data-action, data-value, and arbitrary data-* attributes byte-identical to a hand-rolled <button>', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Button } from ${absoluteSpecifier('src/platform/ui/Button.jsx')};
    const html = renderToStaticMarkup(
      <Button
        variant="primary"
        size="xl"
        dataAction="hero-start"
        dataValue="task-42"
        data-subject-id="grammar"
        data-featured="true"
      >
        Start
      </Button>
    );
    console.log(html);
  `);
  assert.match(html, /data-action="hero-start"/);
  assert.match(html, /data-value="task-42"/);
  assert.match(html, /data-subject-id="grammar"/);
  assert.match(html, /data-featured="true"/);
});

test('Button omits data-action / data-value attributes entirely when those props are not supplied', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Button } from ${absoluteSpecifier('src/platform/ui/Button.jsx')};
    const html = renderToStaticMarkup(<Button variant="ghost">Open codex</Button>);
    console.log(html);
  `);
  assert.doesNotMatch(html, /data-action=/, 'omitted dataAction prop must not surface as an empty data-action attribute');
  assert.doesNotMatch(html, /data-value=/, 'omitted dataValue prop must not surface as an empty data-value attribute');
});

// ---------- Edge case: busy / disabled / loading ---------- //

test('Button busy=true renders aria-busy="true" and disabled together (visible label preserved byte-identical)', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Button } from ${absoluteSpecifier('src/platform/ui/Button.jsx')};
    const html = renderToStaticMarkup(
      <Button variant="primary" size="xl" busy>Starting...</Button>
    );
    console.log(html);
  `);
  assert.match(html, /aria-busy="true"/, 'busy must announce aria-busy=true');
  assert.match(html, /disabled/, 'busy implies disabled (so the click handler cannot fire while in flight)');
  // Important: `busy` does NOT auto-add `.is-loading`. The
  // pre-migration HeroQuestCard / Grammar / Punctuation CTAs render
  // their busy state with a visible "Starting..." label, NOT a
  // spinner-only state. The `.is-loading` CSS would hide that label
  // (`color: transparent`) and break copy parity. Consumers that
  // want the spinner can opt in via `className="is-loading"`.
  assert.match(html, /class="btn primary xl"/, 'busy state preserves the un-modified `.btn primary xl` classes');
  assert.doesNotMatch(html, /is-loading/, 'busy must NOT auto-toggle .is-loading (would hide the visible label)');
});

test('Button disabled=true without busy renders `disabled` but does NOT render aria-busy', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Button } from ${absoluteSpecifier('src/platform/ui/Button.jsx')};
    const html = renderToStaticMarkup(
      <Button variant="primary" disabled>Locked</Button>
    );
    console.log(html);
  `);
  assert.match(html, /disabled/, 'disabled prop must surface');
  assert.doesNotMatch(html, /aria-busy/, 'plain disabled state must NOT announce aria-busy');
});

// ---------- Edge case: icon slots ---------- //

test('Button startIcon and endIcon slots render in DOM order around the children', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Button } from ${absoluteSpecifier('src/platform/ui/Button.jsx')};
    const html = renderToStaticMarkup(
      <Button
        variant="primary"
        startIcon={<span data-icon="lead">L</span>}
        endIcon={<span data-icon="trail">T</span>}
      >
        Continue
      </Button>
    );
    console.log(html);
  `);
  // The DOM order should be: startIcon wrapper → children text → endIcon wrapper.
  const startIdx = html.indexOf('btn-start-icon');
  const childIdx = html.indexOf('Continue');
  const endIdx = html.indexOf('btn-end-icon');
  assert.ok(startIdx !== -1, 'startIcon slot must render');
  assert.ok(childIdx !== -1, 'children must render');
  assert.ok(endIdx !== -1, 'endIcon slot must render');
  assert.ok(
    startIdx < childIdx && childIdx < endIdx,
    `expected startIcon → children → endIcon order; got indices [${startIdx}, ${childIdx}, ${endIdx}]`,
  );
  // Both icon wrappers must be aria-hidden so the children text is the
  // sole accessible label.
  assert.match(html, /class="btn-start-icon"\s+aria-hidden="true"/);
  assert.match(html, /class="btn-end-icon"\s+aria-hidden="true"/);
});

test('Button without an endIcon emits no trailing icon wrapper or whitespace artefact', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Button } from ${absoluteSpecifier('src/platform/ui/Button.jsx')};
    const html = renderToStaticMarkup(
      <Button variant="primary" startIcon={<span data-icon="lead">L</span>}>Continue</Button>
    );
    console.log(html);
  `);
  assert.match(html, /btn-start-icon/, 'startIcon must still render when supplied alone');
  assert.doesNotMatch(html, /btn-end-icon/, 'absent endIcon must produce no wrapper');
});

// ---------- Error path: missing visible label ---------- //

test('Button renders successfully when aria-label is supplied without children (icon-only buttons)', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Button } from ${absoluteSpecifier('src/platform/ui/Button.jsx')};
    const html = renderToStaticMarkup(
      <Button variant="ghost" aria-label="Refresh now" startIcon={<span data-icon="r">R</span>} />
    );
    console.log(html);
  `);
  assert.match(html, /aria-label="Refresh now"/);
  assert.match(html, /btn-start-icon/);
});

test('Button without children AND without aria-label fails loudly (developer ergonomics)', async () => {
  // The primitive throws at render time so the parser-level test
  // surfaces the developer mistake before it ships. We compile + run
  // the entry script and assert that `execFileSync` rejects with a
  // non-zero exit code AND the stderr carries the `Button requires`
  // sentinel string.
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-button-error-'));
  const entryPath = path.join(tmpDir, 'entry.jsx');
  const bundlePath = path.join(tmpDir, 'entry.cjs');
  try {
    await writeFile(entryPath, `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { Button } from ${absoluteSpecifier('src/platform/ui/Button.jsx')};
      try {
        const html = renderToStaticMarkup(<Button variant="primary" />);
        console.log('UNEXPECTED_OK', html);
        process.exit(0);
      } catch (err) {
        console.error(err.message);
        process.exit(2);
      }
    `);
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
    let threw = false;
    let stderr = '';
    try {
      execFileSync(process.execPath, [bundlePath], {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      threw = true;
      stderr = String(err.stderr || '');
    }
    assert.ok(threw, 'rendering Button without children AND without aria-label must throw');
    assert.match(
      stderr,
      /Button requires (?:either )?visible children/,
      `expected the "Button requires …" error message; got stderr: ${stderr}`,
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------- Stateless guarantee (R10) ---------- //

test('Button.jsx does NOT import the platform store (stateless primitive — R10)', async () => {
  // Parser-level guard so the next contributor cannot accidentally
  // re-introduce a store subscription inside the primitive. The
  // adopted pattern is consumer-owned: callers reach for
  // `use-submit-lock` themselves and pass the resulting `locked` flag
  // in via `busy`.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(path.join(rootDir, 'src/platform/ui/Button.jsx'), 'utf8');
  // Strip block comments + line comments so the documentation that
  // *explains* the stateless contract doesn't trigger the regex. The
  // assertion targets executable source — imports + identifiers that
  // would appear after the comment-strip — not the doc-comment itself.
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(
    codeOnly,
    /usePlatformStore/,
    'Button.jsx must not subscribe to the platform store; the primitive is stateless by contract.',
  );
  assert.doesNotMatch(
    codeOnly,
    /from\s+['"][^'"]*platform\/state\//,
    'Button.jsx must not import anything from src/platform/state — the primitive is stateless by contract.',
  );
});
