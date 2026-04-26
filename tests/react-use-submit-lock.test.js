// SH2-U1 (sys-hardening p2): useSubmitLock hook unit tests.
//
// The hook's contract lives in `src/platform/react/use-submit-lock.js`.
// These tests exercise the four scenarios the plan calls out:
//   1. Happy path: `run(fn)` once resolves + returns `fn`'s result;
//      locked transitions false → true → false.
//   2. Concurrent run while locked returns `undefined` without invoking
//      `fn` a second time.
//   3. `fn` throws: locked returns to false; error re-thrown.
//   4. `fn` returns synchronously: hook still locks for at least one
//      microtask; an immediate second call is blocked.
//
// Test harness: we drive the hook through a minimal React test-rig
// built on `esbuild` + `react-dom/server` (SSR snapshot) + exposed
// commands. React hooks cannot be called outside a component, so each
// scenario renders a probe component that exposes the hook's `run` +
// `locked` via a captured-actions bag. The probe SSRs to a fragment
// so we can read the initial render shape, then we drive subsequent
// interactions via the captured bag in the same Node process.
//
// esbuild CJS does not accept top-level await, so every fixture wraps
// its async driver in an IIFE `(async () => { ... })().catch(...)`
// block — keeps the CJS output format and surfaces any promise
// rejection as a non-zero exit via a `console.error` + `process.exit`.

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
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-submit-lock-'));
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

// ---------------------------------------------------------------
// Scenario 1: happy path — `run(fn)` resolves; locked transitions.
// ---------------------------------------------------------------

test('useSubmitLock: run(fn) once resolves to fn result and transitions locked false -> true -> false', async () => {
  const spec = path.join(rootDir, 'src/platform/react/use-submit-lock.js');
  const output = await runFixture(`
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { useSubmitLock } = require(${JSON.stringify(spec)});

    let captured = null;
    function Probe() {
      const lock = useSubmitLock();
      captured = lock;
      return React.createElement('div', { 'data-locked': String(lock.locked) });
    }

    (async () => {
      const initialHtml = renderToStaticMarkup(React.createElement(Probe));
      console.log('initial=' + initialHtml);
      // Review follow-up (correctness nit #2 + testing nit #1):
      // assert the locked-during-run contract in-flight. The hook
      // contract says locked transitions false -> true -> false,
      // but without an intra-run probe only the final false state
      // is observed, and a regression that drops setLocked(true)
      // would still pass scenario 1. Under SSR the state is not
      // re-rendered between scheduling and reading, so reading
      // captured.locked alone cannot prove the state went true.
      // Instead we assert a side-observable of the true state: a
      // nested run() while pendingRef.current === true early-returns
      // undefined. That branch is ONLY taken when the lock is held,
      // so in-run-nested=undefined proves locked==true during fn.
      let inRunNested = 'unobserved';
      const result = await captured.run(async () => {
        inRunNested = await captured.run(async () => 'should-not-run');
        return 42;
      });
      console.log('in-run-nested=' + String(inRunNested));
      console.log('result=' + result);
      console.log('post-locked=' + captured.locked);
    })().catch((err) => { console.error(err); process.exit(1); });
  `);
  assert.match(output, /initial=<div data-locked="false"><\/div>/);
  assert.match(output, /in-run-nested=undefined/);
  assert.match(output, /result=42/);
  assert.match(output, /post-locked=false/);
});

// ---------------------------------------------------------------
// Scenario 2: concurrent run while locked returns undefined.
// ---------------------------------------------------------------

test('useSubmitLock: concurrent run(fn) while locked returns undefined without invoking fn again', async () => {
  const spec = path.join(rootDir, 'src/platform/react/use-submit-lock.js');
  const output = await runFixture(`
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { useSubmitLock } = require(${JSON.stringify(spec)});

    let captured = null;
    function Probe() {
      const lock = useSubmitLock();
      captured = lock;
      return React.createElement('div');
    }

    (async () => {
      renderToStaticMarkup(React.createElement(Probe));

      let resolve;
      const pending = new Promise((r) => { resolve = r; });
      let invocations = 0;
      const first = captured.run(async () => {
        invocations += 1;
        await pending;
        return 'first';
      });
      const second = await captured.run(async () => {
        invocations += 1;
        return 'second';
      });
      console.log('second=' + String(second));
      console.log('invocations-after-second=' + invocations);
      resolve();
      const firstResult = await first;
      console.log('first=' + firstResult);
      console.log('invocations-final=' + invocations);
    })().catch((err) => { console.error(err); process.exit(1); });
  `);
  assert.match(output, /second=undefined/);
  assert.match(output, /invocations-after-second=1/);
  assert.match(output, /first=first/);
  assert.match(output, /invocations-final=1/);
});

// ---------------------------------------------------------------
// Scenario 3: fn throws — locked returns to false; error re-thrown.
// ---------------------------------------------------------------

test('useSubmitLock: run(fn) where fn throws re-throws the error and resets locked to false', async () => {
  const spec = path.join(rootDir, 'src/platform/react/use-submit-lock.js');
  const output = await runFixture(`
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { useSubmitLock } = require(${JSON.stringify(spec)});

    let captured = null;
    function Probe() {
      const lock = useSubmitLock();
      captured = lock;
      return React.createElement('div');
    }

    (async () => {
      renderToStaticMarkup(React.createElement(Probe));

      let thrown = null;
      try {
        await captured.run(async () => {
          throw new Error('boom');
        });
      } catch (err) {
        thrown = err;
      }
      console.log('thrown-message=' + (thrown && thrown.message));
      const next = await captured.run(async () => 'recovered');
      console.log('next=' + next);
    })().catch((err) => { console.error(err); process.exit(1); });
  `);
  assert.match(output, /thrown-message=boom/);
  assert.match(output, /next=recovered/);
});

// ---------------------------------------------------------------
// Scenario 4: synchronous fn — hook still locks for a microtask.
// ---------------------------------------------------------------

test('useSubmitLock: run(fn) with synchronous fn still locks for at least one microtask; subsequent immediate call is blocked', async () => {
  const spec = path.join(rootDir, 'src/platform/react/use-submit-lock.js');
  const output = await runFixture(`
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { useSubmitLock } = require(${JSON.stringify(spec)});

    let captured = null;
    function Probe() {
      const lock = useSubmitLock();
      captured = lock;
      return React.createElement('div');
    }

    (async () => {
      renderToStaticMarkup(React.createElement(Probe));

      let invocations = 0;
      const first = captured.run(() => {
        invocations += 1;
        return 'sync-value';
      });
      const secondResult = await captured.run(() => {
        invocations += 1;
        return 'should-not-run';
      });
      console.log('second=' + String(secondResult));
      console.log('invocations-after-second=' + invocations);
      const firstResult = await first;
      console.log('first=' + firstResult);
      console.log('invocations-final=' + invocations);
    })().catch((err) => { console.error(err); process.exit(1); });
  `);
  assert.match(output, /second=undefined/);
  assert.match(output, /invocations-after-second=1/);
  assert.match(output, /first=sync-value/);
  assert.match(output, /invocations-final=1/);
});
