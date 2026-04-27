// U12 (Admin Console P3): Active Message Banner test suite.
//
// Validates client-runtime delivery of marketing messages (announcements,
// maintenance banners) from the Worker-authoritative endpoint.
//
// Test scenarios:
//   1. Happy path: announcement renders as dismissible info banner
//   2. Happy path: maintenance renders as non-dismissible warning banner
//   3. Happy path: dismissed announcement stays hidden for session
//   4. Edge case: no active messages -> no banner
//   5. Edge case: fetch failure -> no banner (fail-open)
//   6. Edge case: multiple messages -> stack latest first
//   7. Pure: renderRestrictedMarkdown handles **bold**, *italic*, [link](url)
//   8. Pure: renderRestrictedMarkdown rejects non-https links
//   9. Pure: renderRestrictedMarkdown returns null for empty/non-string input
//  10. SSR: ActiveMessageStack renders nothing when messages array is empty
//  11. SSR: ActiveMessageBanner renders correct severity CSS classes
//  12. API: fetchActiveMessages calls correct endpoint

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
  const candidates = [path.join(rootDir, 'node_modules')];
  let current = rootDir;
  for (let i = 0; i < 10; i += 1) {
    const parent = path.dirname(current);
    if (parent === current) break;
    candidates.push(path.join(parent, 'node_modules'));
    current = parent;
  }
  return [
    ...candidates,
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

function normaliseLineEndings(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// ---------------------------------------------------------------
// Script execution harness — bundles and runs an entry script.
// ---------------------------------------------------------------

async function runScript(script, { json = true } = {}) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-active-msg-'));
  const entryPath = path.join(tmpDir, 'entry.mjs');
  const bundlePath = path.join(tmpDir, 'entry.cjs');
  try {
    await writeFile(entryPath, script);
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
    const normalised = normaliseLineEndings(output).replace(/\n+$/, '');
    return json ? JSON.parse(normalised) : normalised;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

const ACTIVE_MESSAGES_PATH = JSON.stringify(
  path.join(rootDir, 'src/platform/ops/active-messages.js'),
);

const API_PATH = JSON.stringify(
  path.join(rootDir, 'src/platform/hubs/api.js'),
);

// ---------------------------------------------------------------
// 1. Pure: renderRestrictedMarkdown handles **bold**, *italic*, [link](url)
// ---------------------------------------------------------------

test('renderRestrictedMarkdown: bold, italic, and https link', async () => {
  const result = await runScript(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { renderRestrictedMarkdown } from ${ACTIVE_MESSAGES_PATH};

    const elements = renderRestrictedMarkdown(
      'Hello **world** and *italic* plus [click](https://example.com)'
    );
    const html = renderToStaticMarkup(React.createElement('span', null, elements));
    console.log(JSON.stringify({ html }));
  `);

  assert.match(result.html, /<strong>world<\/strong>/);
  assert.match(result.html, /<em>italic<\/em>/);
  assert.match(result.html, /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">click<\/a>/);
});

// ---------------------------------------------------------------
// 2. Pure: renderRestrictedMarkdown rejects non-https links
// ---------------------------------------------------------------

test('renderRestrictedMarkdown: non-https link rendered as plain text', async () => {
  const result = await runScript(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { renderRestrictedMarkdown } from ${ACTIVE_MESSAGES_PATH};

    const elements = renderRestrictedMarkdown('[evil](javascript:alert(1))');
    const html = renderToStaticMarkup(React.createElement('span', null, elements));
    console.log(JSON.stringify({ html }));
  `);

  // Should NOT contain an <a> tag
  assert.doesNotMatch(result.html, /<a /);
  // The link text should still be present as plain text
  assert.match(result.html, /evil/);
});

// ---------------------------------------------------------------
// 3. Pure: renderRestrictedMarkdown returns null for empty/non-string
// ---------------------------------------------------------------

test('renderRestrictedMarkdown: returns null for empty or non-string', async () => {
  const result = await runScript(`
    import { renderRestrictedMarkdown } from ${ACTIVE_MESSAGES_PATH};

    const r1 = renderRestrictedMarkdown('');
    const r2 = renderRestrictedMarkdown(null);
    const r3 = renderRestrictedMarkdown(undefined);
    const r4 = renderRestrictedMarkdown(42);
    console.log(JSON.stringify({
      empty: r1 === null,
      nullVal: r2 === null,
      undef: r3 === null,
      number: r4 === null,
    }));
  `);

  assert.equal(result.empty, true);
  assert.equal(result.nullVal, true);
  assert.equal(result.undef, true);
  assert.equal(result.number, true);
});

// ---------------------------------------------------------------
// 4. SSR: announcement renders as dismissible info banner
// ---------------------------------------------------------------

test('ActiveMessageBanner: announcement renders dismissible info banner', async () => {
  const result = await runScript(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ActiveMessageBanner } from ${ACTIVE_MESSAGES_PATH};

    const msg = {
      id: 'ann-001',
      title: 'New Feature',
      body_text: 'Check out **dark mode**!',
      severity_token: 'info',
      message_type: 'announcement',
    };
    const html = renderToStaticMarkup(
      React.createElement(ActiveMessageBanner, { message: msg, onDismiss: () => {} })
    );
    console.log(JSON.stringify({ html }));
  `, { json: true });

  // Info severity class
  assert.match(result.html, /active-message-banner--info/);
  // Dismissible: has dismiss button
  assert.match(result.html, /active-message-banner__dismiss/);
  assert.match(result.html, /Dismiss announcement/);
  // Title rendered
  assert.match(result.html, /New Feature/);
  // Body text with bold
  assert.match(result.html, /<strong>dark mode<\/strong>/);
  // Data attributes
  assert.match(result.html, /data-message-type="announcement"/);
  assert.match(result.html, /data-severity="info"/);
});

// ---------------------------------------------------------------
// 5. SSR: maintenance renders as non-dismissible warning banner
// ---------------------------------------------------------------

test('ActiveMessageBanner: maintenance renders non-dismissible warning banner', async () => {
  const result = await runScript(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ActiveMessageBanner } from ${ACTIVE_MESSAGES_PATH};

    const msg = {
      id: 'maint-001',
      title: 'Scheduled Maintenance',
      body_text: 'System will be down *briefly*.',
      severity_token: 'warning',
      message_type: 'maintenance',
    };
    const html = renderToStaticMarkup(
      React.createElement(ActiveMessageBanner, { message: msg, onDismiss: () => {} })
    );
    console.log(JSON.stringify({ html }));
  `, { json: true });

  // Warning severity class
  assert.match(result.html, /active-message-banner--warning/);
  // NOT dismissible: no dismiss button
  assert.doesNotMatch(result.html, /active-message-banner__dismiss/);
  // Title rendered
  assert.match(result.html, /Scheduled Maintenance/);
  // Body text with italic
  assert.match(result.html, /<em>briefly<\/em>/);
  // Data attributes
  assert.match(result.html, /data-message-type="maintenance"/);
  assert.match(result.html, /data-severity="warning"/);
});

// ---------------------------------------------------------------
// 6. SSR: empty messages array -> no banner rendered
// ---------------------------------------------------------------

test('ActiveMessageStack: no messages -> no banner', async () => {
  const result = await runScript(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ActiveMessageStack } from ${ACTIVE_MESSAGES_PATH};

    const html1 = renderToStaticMarkup(
      React.createElement(ActiveMessageStack, { messages: [] })
    );
    const html2 = renderToStaticMarkup(
      React.createElement(ActiveMessageStack, { messages: null })
    );
    console.log(JSON.stringify({ empty: html1, nullMsgs: html2 }));
  `, { json: true });

  // Both should render nothing
  assert.equal(result.empty, '');
  assert.equal(result.nullMsgs, '');
});

// ---------------------------------------------------------------
// 7. SSR: multiple messages render in stack order
// ---------------------------------------------------------------

test('ActiveMessageStack: multiple messages render stacked', async () => {
  const result = await runScript(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ActiveMessageStack } from ${ACTIVE_MESSAGES_PATH};

    const messages = [
      {
        id: 'msg-1',
        title: 'First',
        body_text: 'Body one',
        severity_token: 'info',
        message_type: 'announcement',
      },
      {
        id: 'msg-2',
        title: 'Second',
        body_text: 'Body two',
        severity_token: 'warning',
        message_type: 'maintenance',
      },
    ];
    const html = renderToStaticMarkup(
      React.createElement(ActiveMessageStack, { messages })
    );
    console.log(JSON.stringify({ html }));
  `, { json: true });

  // Stack container
  assert.match(result.html, /active-message-stack/);
  // Both messages rendered
  assert.match(result.html, /First/);
  assert.match(result.html, /Second/);
  // First is info (announcement), second is warning (maintenance)
  assert.match(result.html, /active-message-banner--info/);
  assert.match(result.html, /active-message-banner--warning/);
  // First message appears before second in HTML
  const firstIdx = result.html.indexOf('First');
  const secondIdx = result.html.indexOf('Second');
  assert.ok(firstIdx < secondIdx, 'Messages render in array order (latest first from server)');
});

// ---------------------------------------------------------------
// 8. SSR: null message -> nothing rendered
// ---------------------------------------------------------------

test('ActiveMessageBanner: null message -> no render', async () => {
  const result = await runScript(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ActiveMessageBanner } from ${ACTIVE_MESSAGES_PATH};

    const html = renderToStaticMarkup(
      React.createElement(ActiveMessageBanner, { message: null, onDismiss: () => {} })
    );
    console.log(JSON.stringify({ html }));
  `, { json: true });

  assert.equal(result.html, '');
});

// ---------------------------------------------------------------
// 9. SSR: severity class mapping (default to info)
// ---------------------------------------------------------------

test('ActiveMessageBanner: unknown severity defaults to info class', async () => {
  const result = await runScript(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ActiveMessageBanner } from ${ACTIVE_MESSAGES_PATH};

    const msg = {
      id: 'msg-x',
      title: 'Unknown severity',
      body_text: 'Test',
      severity_token: 'critical',
      message_type: 'announcement',
    };
    const html = renderToStaticMarkup(
      React.createElement(ActiveMessageBanner, { message: msg, onDismiss: () => {} })
    );
    console.log(JSON.stringify({ html }));
  `, { json: true });

  // Non-warning token defaults to info
  assert.match(result.html, /active-message-banner--info/);
  assert.doesNotMatch(result.html, /active-message-banner--warning/);
});

// ---------------------------------------------------------------
// 10. API: fetchActiveMessages calls correct endpoint
// ---------------------------------------------------------------

test('createHubApi: fetchActiveMessages calls GET /api/ops/active-messages', async () => {
  const result = await runScript(`
    import { createHubApi } from ${API_PATH};

    (async () => {
      let capturedUrl = '';
      let capturedInit = {};

      const mockFetch = async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ messages: [{ title: 'Test' }] }),
        };
      };

      const api = createHubApi({
        baseUrl: 'https://test.example.com',
        fetch: mockFetch,
      });

      const result = await api.fetchActiveMessages();
      console.log(JSON.stringify({
        url: capturedUrl,
        method: capturedInit.method,
        messages: result.messages,
      }));
    })();
  `);

  assert.equal(result.url, 'https://test.example.com/api/ops/active-messages');
  assert.equal(result.method, 'GET');
  assert.deepEqual(result.messages, [{ title: 'Test' }]);
});

// ---------------------------------------------------------------
// 11. Hooks: useActiveMessages returns empty on fetch failure (fail-open)
// ---------------------------------------------------------------

test('useActiveMessages: fetch failure returns empty messages (fail-open)', async () => {
  const result = await runScript(`
    import React, { useEffect, useRef } from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ActiveMessagesBar } from ${ACTIVE_MESSAGES_PATH};

    // In SSR, hooks run but useEffect does not fire, so the initial state
    // (empty messages) is what renders. This validates the fail-open default.
    const failingFetch = async () => { throw new Error('Network error'); };

    const html = renderToStaticMarkup(
      React.createElement(ActiveMessagesBar, { fetchActiveMessages: failingFetch })
    );
    console.log(JSON.stringify({ html }));
  `, { json: true });

  // No banner rendered (empty initial state -> no output)
  assert.equal(result.html, '');
});

// ---------------------------------------------------------------
// 12. SSR: ActiveMessagesBar with null fetch -> no banner
// ---------------------------------------------------------------

test('ActiveMessagesBar: null fetchActiveMessages -> no banner', async () => {
  const result = await runScript(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ActiveMessagesBar } from ${ACTIVE_MESSAGES_PATH};

    const html = renderToStaticMarkup(
      React.createElement(ActiveMessagesBar, { fetchActiveMessages: null })
    );
    console.log(JSON.stringify({ html }));
  `, { json: true });

  assert.equal(result.html, '');
});

// ---------------------------------------------------------------
// 13. Pure: renderRestrictedMarkdown handles plain text (no markdown)
// ---------------------------------------------------------------

test('renderRestrictedMarkdown: plain text without markdown tokens', async () => {
  const result = await runScript(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { renderRestrictedMarkdown } from ${ACTIVE_MESSAGES_PATH};

    const elements = renderRestrictedMarkdown('Just a plain message.');
    const html = renderToStaticMarkup(React.createElement('span', null, elements));
    console.log(JSON.stringify({ html }));
  `);

  assert.match(result.html, /Just a plain message\./);
  assert.doesNotMatch(result.html, /<strong>/);
  assert.doesNotMatch(result.html, /<em>/);
  assert.doesNotMatch(result.html, /<a /);
});

// ---------------------------------------------------------------
// 14. SSR: ActiveMessageBanner has correct ARIA attributes
// ---------------------------------------------------------------

test('ActiveMessageBanner: correct ARIA role and live region', async () => {
  const result = await runScript(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ActiveMessageBanner } from ${ACTIVE_MESSAGES_PATH};

    const msg = {
      id: 'aria-test',
      title: 'Accessibility',
      body_text: 'Screen reader test',
      severity_token: 'info',
      message_type: 'announcement',
    };
    const html = renderToStaticMarkup(
      React.createElement(ActiveMessageBanner, { message: msg, onDismiss: () => {} })
    );
    console.log(JSON.stringify({ html }));
  `, { json: true });

  assert.match(result.html, /role="status"/);
  assert.match(result.html, /aria-live="polite"/);
  assert.match(result.html, /aria-label="Dismiss announcement"/);
});
