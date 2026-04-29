// U1 (refactor ui-consolidation): platform `LengthPicker` characterisation
// tests.
//
// The component lives at `src/platform/ui/LengthPicker.jsx`. Grammar
// setup, Spelling round-length, and Spelling year-filter all consume it;
// Punctuation (U4) will consume it next. The DOM + class rhythm MUST
// stay byte-identical to the prior inline Grammar `RoundLengthPicker`
// and Spelling `LengthPicker` / `YearPicker` so every `.length-picker`
// / `.length-option` / `data-action` / `data-pref` / `data-value` test
// locator still resolves.
//
// Test harness: bundles a small probe entry through esbuild, invokes
// `renderToStaticMarkup` in a child Node process, and asserts on the
// emitted HTML. Pattern mirrors `tests/react-use-submit-lock.test.js`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const componentSpec = path.join(rootDir, 'src/platform/ui/LengthPicker.jsx');

function nodePaths() {
  return [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

function normaliseLineEndings(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

async function runFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-length-picker-'));
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
    const output = execFileSync(process.execPath, [bundlePath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return normaliseLineEndings(output).replace(/\n+$/, '');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function renderHeader(spec) {
  return `
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { LengthPicker } = require(${JSON.stringify(spec)});
  `;
}

// ---------------------------------------------------------------
// Happy path: string options + unit wrapper (Grammar shape).
// ---------------------------------------------------------------

test('LengthPicker: renders 5 string options with --option-count and --selected-index (Grammar shape)', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(LengthPicker, {
      options: ['3', '5', '8', '10', '15'],
      selectedValue: '8',
      onChange: () => {},
      ariaLabel: 'Round length',
      unit: 'questions',
      actionName: 'grammar-set-round-length',
      prefKey: 'roundLength',
    });
    console.log(renderToStaticMarkup(tree));
  `);
  // Outer .length-control wrapper is present because `unit` is supplied.
  assert.match(html, /^<div class="length-control">/);
  // Inner radiogroup carries the two CSS vars with selected-index for "8" (index 2).
  assert.match(html, /<div class="length-picker" role="radiogroup" aria-label="Round length" style="--option-count:5;--selected-index:2">/);
  // Slider span is rendered.
  assert.match(html, /<span class="length-slider" aria-hidden="true"><\/span>/);
  // Every option renders with the pinned attribute order
  // (data-action / data-pref BEFORE value / disabled) — characterisation.
  assert.match(html, /<button type="button" role="radio" aria-checked="false" class="length-option" data-action="grammar-set-round-length" data-pref="roundLength" value="3"><span>3<\/span><\/button>/);
  assert.match(html, /<button type="button" role="radio" aria-checked="true" class="length-option selected" data-action="grammar-set-round-length" data-pref="roundLength" value="8"><span>8<\/span><\/button>/);
  // Unit span is rendered inside the control wrapper.
  assert.match(html, /<span class="length-unit">questions<\/span><\/div>$/);
});

// ---------------------------------------------------------------
// Happy path: renders without unit (Spelling year-filter shape).
// ---------------------------------------------------------------

test('LengthPicker: without `unit` renders the bare .length-picker (Spelling year-filter shape)', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const YEAR_FILTER_OPTIONS = [
      { value: 'core', label: 'Core' },
      { value: 'y3-4', label: 'Y3-4' },
      { value: 'y5-6', label: 'Y5-6' },
      { value: 'extra', label: 'Extra' },
    ];
    const tree = React.createElement(LengthPicker, {
      options: YEAR_FILTER_OPTIONS,
      selectedValue: 'core',
      onChange: () => {},
      ariaLabel: 'Spelling pool',
      actionName: 'spelling-set-pref',
      prefKey: 'yearFilter',
    });
    console.log(renderToStaticMarkup(tree));
  `);
  // No .length-control wrapper, no .length-unit span.
  assert.doesNotMatch(html, /length-control/);
  assert.doesNotMatch(html, /length-unit/);
  // Outer element is the .length-picker radiogroup directly.
  assert.match(html, /^<div class="length-picker" role="radiogroup" aria-label="Spelling pool" style="--option-count:4;--selected-index:0">/);
  // Label text uses `label`; value attribute uses `value`.
  assert.match(html, /<button[^>]*data-action="spelling-set-pref" data-pref="yearFilter" value="y3-4"><span>Y3-4<\/span><\/button>/);
  assert.match(html, /<button[^>]*value="core"[^>]*><span>Core<\/span>/);
});

// ---------------------------------------------------------------
// Edge case: zero-length options array.
// ---------------------------------------------------------------

test('LengthPicker: zero-length options renders an empty radiogroup with --option-count:0', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(LengthPicker, {
      options: [],
      selectedValue: '',
      onChange: () => {},
      ariaLabel: 'empty',
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /<div class="length-picker" role="radiogroup" aria-label="empty" style="--option-count:0;--selected-index:0">/);
  assert.doesNotMatch(html, /class="length-option/);
});

// ---------------------------------------------------------------
// Edge case: selectedValue not in options → index 0.
// ---------------------------------------------------------------

test('LengthPicker: selectedValue absent from options falls back to selected-index 0 (matches legacy Grammar/Spelling inline behaviour)', async () => {
  // The legacy Grammar `RoundLengthPicker` and Spelling `LengthPicker`
  // computed `selectedIndex = Math.max(0, options.indexOf(...))`, which
  // clamps to 0 when the value is not found, BUT they also computed
  // `selected = selectedValue === value` independently — so the slider
  // visually sits on index 0 while NO option actually carries the
  // `selected` class (aria-checked="true"). The platform component
  // preserves that behaviour so the DOM stays byte-identical.
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(LengthPicker, {
      options: ['10', '20', '40'],
      selectedValue: '999',
      onChange: () => {},
      ariaLabel: 'Round length',
      unit: 'words',
    });
    console.log(renderToStaticMarkup(tree));
  `);
  // Slider is pinned to index 0 via CSS var.
  assert.match(html, /style="--option-count:3;--selected-index:0"/);
  // No option carries `selected`.
  assert.doesNotMatch(html, /class="length-option selected"/);
  // All three options are aria-checked="false".
  const checkedFalse = html.match(/aria-checked="false"/g) || [];
  assert.equal(checkedFalse.length, 3);
});

// ---------------------------------------------------------------
// Edge case: disabled=true emits disabled="" on every button.
// ---------------------------------------------------------------

test('LengthPicker: disabled=true disables every option button', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(LengthPicker, {
      options: ['3', '5'],
      selectedValue: '3',
      onChange: () => {},
      disabled: true,
      ariaLabel: 'Round length',
    });
    console.log(renderToStaticMarkup(tree));
  `);
  // Both buttons carry disabled="". SSR renders boolean true as disabled="".
  const matches = html.match(/<button[^>]*disabled=""[^>]*>/g) || [];
  assert.equal(matches.length, 2, 'both option buttons should be disabled');
});

// ---------------------------------------------------------------
// Accessibility: role=radiogroup + role=radio + aria-checked + ariaLabel.
// ---------------------------------------------------------------

test('LengthPicker: accessibility — role="radiogroup" on picker, role="radio" + aria-checked per option, ariaLabel threaded', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(LengthPicker, {
      options: ['10', '20', '40'],
      selectedValue: '20',
      onChange: () => {},
      ariaLabel: 'My pool',
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /role="radiogroup"/);
  assert.match(html, /aria-label="My pool"/);
  // Three buttons with role="radio".
  const radioMatches = html.match(/role="radio"/g) || [];
  assert.equal(radioMatches.length, 3);
  // Exactly one aria-checked="true" (the selected option).
  const checkedTrue = html.match(/aria-checked="true"/g) || [];
  assert.equal(checkedTrue.length, 1);
  const checkedFalse = html.match(/aria-checked="false"/g) || [];
  assert.equal(checkedFalse.length, 2);
});

// ---------------------------------------------------------------
// actionName + prefKey emit data-action and data-pref.
// ---------------------------------------------------------------

test('LengthPicker: actionName + prefKey emit data-action and data-pref on every option', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(LengthPicker, {
      options: ['a', 'b'],
      selectedValue: 'a',
      onChange: () => {},
      actionName: 'grammar-set-round-length',
      prefKey: 'roundLength',
    });
    console.log(renderToStaticMarkup(tree));
  `);
  const actionMatches = html.match(/data-action="grammar-set-round-length"/g) || [];
  assert.equal(actionMatches.length, 2);
  const prefMatches = html.match(/data-pref="roundLength"/g) || [];
  assert.equal(prefMatches.length, 2);
  // No data-value in this shape.
  assert.doesNotMatch(html, /data-value=/);
});

// ---------------------------------------------------------------
// valueAttr=true emits data-value per option (Punctuation parity).
// ---------------------------------------------------------------

test('LengthPicker: valueAttr=true emits data-value on every option (Punctuation parity)', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(LengthPicker, {
      options: ['5', '10', '15'],
      selectedValue: '10',
      onChange: () => {},
      actionName: 'punctuation-set-round-length',
      valueAttr: true,
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.match(html, /data-value="5"/);
  assert.match(html, /data-value="10"/);
  assert.match(html, /data-value="15"/);
  // prefKey omitted -> no data-pref.
  assert.doesNotMatch(html, /data-pref=/);
});

// ---------------------------------------------------------------
// Omitting all three opt-in props emits none of them.
// ---------------------------------------------------------------

test('LengthPicker: omitting actionName/prefKey/valueAttr emits no data-* attributes on options', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(LengthPicker, {
      options: ['1', '2'],
      selectedValue: '1',
      onChange: () => {},
    });
    console.log(renderToStaticMarkup(tree));
  `);
  assert.doesNotMatch(html, /data-action=/);
  assert.doesNotMatch(html, /data-pref=/);
  assert.doesNotMatch(html, /data-value=/);
  // role + aria-checked still present.
  assert.match(html, /role="radio"/);
  assert.match(html, /aria-checked="/);
});

// ---------------------------------------------------------------
// {value,label} options: visible text uses label, value uses value.
// ---------------------------------------------------------------

test('LengthPicker: {value,label} options render label text while value attribute + compare use value', async () => {
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(LengthPicker, {
      options: [
        { value: 'y3-4', label: 'Y3-4' },
        { value: 'extra', label: 'Extra' },
      ],
      selectedValue: 'extra',
      onChange: () => {},
    });
    console.log(renderToStaticMarkup(tree));
  `);
  // Label text inside <span>.
  assert.match(html, /<span>Y3-4<\/span>/);
  assert.match(html, /<span>Extra<\/span>/);
  // Button value attribute uses `value`, not `label`.
  assert.match(html, /value="y3-4"/);
  assert.match(html, /value="extra"/);
  // selectedValue='extra' matches on `value` — the Extra option is
  // the one that carries `selected`, not Y3-4.
  assert.match(html, /<button[^>]*aria-checked="true" class="length-option selected"[^>]*value="extra"/);
  assert.doesNotMatch(html, /class="length-option selected"[^>]*value="y3-4"/);
});

// ---------------------------------------------------------------
// Click behaviour: onChange receives (value, event); disabled blocks.
// ---------------------------------------------------------------
//
// React's synthetic event system needs a real DOM to wire up listeners,
// which we do not have under node:test (no jsdom in devDeps). We drive
// the onChange contract instead by walking React's element tree,
// inspecting the `onClick` closure the component attaches to each
// `.length-option` button, and invoking it with a fake event. This
// proves (a) onChange receives the option's `value` (not `label`) and
// (b) the event argument is passed through, which is the contract
// Spelling's `renderAction` relies on for preventDefault /
// stopPropagation. A unit-level "disabled buttons do not fire" test is
// enforced by React at runtime (the DOM `disabled` attribute blocks
// clicks natively); we assert the SSR `disabled=""` presence instead.

test('LengthPicker: onChange receives the option value (not the label) and forwards the click event', async () => {
  const output = await runFixture(`
    const React = require('react');
    const { LengthPicker } = require(${JSON.stringify(componentSpec)});

    function findOptionHandlers(root) {
      // Depth-first walk the React element tree, returning every
      // onClick handler attached to a <button class="length-option ...">
      // in render order. LengthPicker is a function component, so we
      // call it directly to get the root element it returns, then walk
      // the returned plain-object tree.
      const out = [];
      function visit(node) {
        if (!node) return;
        if (Array.isArray(node)) { node.forEach(visit); return; }
        if (typeof node !== 'object') return;
        const { type, props } = node;
        if (props) {
          if (type === 'button' && typeof props.className === 'string'
              && props.className.split(' ').includes('length-option')) {
            out.push({ value: props.value, disabled: Boolean(props.disabled), onClick: props.onClick });
          }
          if (props.children) visit(props.children);
        }
      }
      visit(root);
      return out;
    }

    // Case 1: string options — clicking option index 1 (value '5')
    // dispatches onChange('5', event).
    const capturedString = [];
    const propsA = {
      options: ['3', '5', '8'],
      selectedValue: '3',
      onChange: (value, event) => {
        capturedString.push({
          value,
          hasEvent: Boolean(event),
          preventDefaultCalled: false,
          stopPropagationCalled: false,
        });
        if (event) {
          if (typeof event.preventDefault === 'function') {
            event.preventDefault();
            capturedString[capturedString.length - 1].preventDefaultCalled = true;
          }
          if (typeof event.stopPropagation === 'function') {
            event.stopPropagation();
            capturedString[capturedString.length - 1].stopPropagationCalled = true;
          }
        }
      },
    };
    const treeA = LengthPicker(propsA);
    const handlersA = findOptionHandlers(treeA);
    // Exactly three option buttons rendered.
    console.log('string-count=' + handlersA.length);
    console.log('string-values=' + handlersA.map((h) => h.value).join(','));
    // Fire the click on option index 1 with a fake synthetic event.
    const fakeEventA = {
      type: 'click',
      preventDefault() {},
      stopPropagation() {},
    };
    handlersA[1].onClick(fakeEventA);
    console.log('string-onchange-value=' + capturedString[0].value);
    console.log('string-has-event=' + capturedString[0].hasEvent);
    console.log('string-pd=' + capturedString[0].preventDefaultCalled);
    console.log('string-sp=' + capturedString[0].stopPropagationCalled);

    // Case 2: {value,label} options — clicking the Extra option passes
    // onChange('extra', ...) because internal compare uses .value.
    const capturedLabel = [];
    const treeB = LengthPicker({
      options: [{ value: 'y3-4', label: 'Y3-4' }, { value: 'extra', label: 'Extra' }],
      selectedValue: 'y3-4',
      onChange: (value) => { capturedLabel.push(value); },
    });
    const handlersB = findOptionHandlers(treeB);
    handlersB[1].onClick({ type: 'click' });
    console.log('label-onchange-value=' + capturedLabel[0]);
  `);
  assert.match(output, /string-count=3/);
  assert.match(output, /string-values=3,5,8/);
  assert.match(output, /string-onchange-value=5/);
  assert.match(output, /string-has-event=true/);
  assert.match(output, /string-pd=true/);
  assert.match(output, /string-sp=true/);
  // Label-shape: onChange receives the `value` field, not the `label` text.
  assert.match(output, /label-onchange-value=extra/);
});

test('LengthPicker: disabled=true renders disabled="" on every option button (SSR parity)', async () => {
  // Under SSR disabled buttons do not dispatch click events at all —
  // React just serialises the `disabled=""` attribute and the browser
  // blocks the native click. The SSR string is the observable we can
  // pin under node:test without a DOM emulator.
  const html = await runFixture(`
    ${renderHeader(componentSpec)}
    const tree = React.createElement(LengthPicker, {
      options: ['3', '5', '8'],
      selectedValue: '3',
      onChange: () => {},
      disabled: true,
    });
    console.log(renderToStaticMarkup(tree));
  `);
  const disabledMatches = html.match(/<button[^>]*disabled=""[^>]*>/g) || [];
  assert.equal(disabledMatches.length, 3, 'every option button should carry disabled=""');
});
