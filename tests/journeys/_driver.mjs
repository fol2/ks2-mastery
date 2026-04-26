// tests/journeys/_driver.mjs
//
// Phase 4 U8 / R9 — browser-driver adapter.
//
// Goal: give each journey script a single `openDriver({ origin })` call
// that returns a uniform `{ open, click, fill, text, screenshot, eval,
// clearStorage, waitForSelector, close, name }` shape, regardless of
// whether bb-browser or agent-browser is the underlying driver.
//
// Driver priority, per `~/.claude/CLAUDE.md`:
//   1. bb-browser  — checks `bb-browser status` returns without the string
//                    "bb-browser: command not found". A daemon-not-running
//                    state is fine; the driver restarts it on first open.
//   2. agent-browser — checks `agent-browser --help` exits 0.
//   3. (Playwright intentionally NOT probed — deferred per user order.)
//
// If neither driver is available, `probeDriver()` returns `{ available:
// false, reason }` so the runner can print an actionable install message
// and exit non-zero without spawning anything.
//
// IMPORTANT: every driver invocation MUST resolve the CLI path on
// Windows. We resolve `bb-browser.cmd` / `agent-browser.cmd` at probe
// time so spawn does not fail with EINVAL on .cmd (see
// `project_windows_nodejs_pitfalls` memory — spawn .cmd EINVAL). The
// `run()` helper below enables `shell: true` only when the resolved
// path ends in `.cmd` on Windows.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const NPM_GLOBAL_BIN = path.join(
  os.homedir(),
  'AppData',
  'Roaming',
  'npm',
);

/**
 * Resolve a CLI name to its executable path on the current OS.
 *
 * On Windows we must point at `<name>.cmd` because Node's `spawn` cannot
 * execute bare `<name>` (it EINVALs on the shim). On other platforms the
 * bare name works via PATH.
 *
 * Returns null if no candidate resolves.
 */
function resolveCli(name) {
  if (process.platform !== 'win32') return name;
  const candidates = [
    path.join(NPM_GLOBAL_BIN, `${name}.cmd`),
    path.join(NPM_GLOBAL_BIN, `${name}.exe`),
    path.join(NPM_GLOBAL_BIN, name),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/**
 * Run a CLI command and collect stdout/stderr/exit.
 * Returns `{ ok, stdout, stderr, code }`.
 *
 * Windows spawn pitfall (see `project_windows_nodejs_pitfalls` memory):
 * Node's `spawn` cannot execute `.cmd` shims directly on Windows — it
 * returns EINVAL. The two supported workarounds are `shell: true` (forces
 * cmd.exe, re-introduces quoting hazards) and `execFile` via Node's own
 * path resolution. We pick a third: enable `shell: true` only when the
 * resolved path ends in `.cmd`. That keeps us away from cmd.exe on *nix,
 * preserves direct spawn for real executables on all platforms, and
 * works around the .cmd-shim EINVAL on Windows.
 */
function run(cli, args, { timeoutMs = 10_000, env = process.env } = {}) {
  return new Promise((resolve) => {
    const needsShell = process.platform === 'win32' && /\.cmd$/i.test(cli);
    // When shell: true, args with quotes / special chars must be quoted
    // ourselves. We only run with trusted arg payloads (journey specs
    // generate their own JSON.stringify'd fragments), so the quoting
    // here escapes any embedded double quotes defensively.
    const quoted = needsShell
      ? args.map((a) => `"${String(a).replace(/"/g, '\\"')}"`)
      : args;
    const cmd = needsShell ? `"${cli}"` : cli;
    const child = spawn(cmd, quoted, {
      env,
      windowsHide: true,
      shell: needsShell,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const done = (code) => {
      if (settled) return;
      settled = true;
      resolve({ ok: code === 0, stdout, stderr, code });
    };
    const killer = setTimeout(() => {
      try { child.kill(); } catch { /* noop */ }
      done(-1);
    }, timeoutMs);
    child.stdout?.on('data', (b) => { stdout += b.toString('utf-8'); });
    child.stderr?.on('data', (b) => { stderr += b.toString('utf-8'); });
    child.on('error', (err) => {
      stderr += `\n[spawn-error] ${err.message}`;
      clearTimeout(killer);
      done(-1);
    });
    child.on('close', (code) => {
      clearTimeout(killer);
      done(code ?? 0);
    });
  });
}

/**
 * Probe the drivers in priority order. Returns the first available driver
 * descriptor, or `{ available: false, reason }` if none respond.
 */
export async function probeDriver() {
  // --- bb-browser ---
  const bb = resolveCli('bb-browser');
  if (bb) {
    // `bb-browser status` is a cheap no-side-effect check. Even when the
    // daemon is not running, the CLI exits 0 with "Daemon not running";
    // only a missing binary returns non-zero.
    const status = await run(bb, ['status'], { timeoutMs: 8000 });
    if (status.ok || /not running/i.test(status.stdout + status.stderr)) {
      return { available: true, name: 'bb-browser', cli: bb };
    }
  }

  // --- agent-browser ---
  const ag = resolveCli('agent-browser');
  if (ag) {
    const help = await run(ag, ['--help'], { timeoutMs: 8000 });
    if (help.ok) {
      return { available: true, name: 'agent-browser', cli: ag };
    }
  }

  return {
    available: false,
    reason:
      'No compatible browser driver found.\n' +
      '  Install bb-browser: npm install -g bb-browser\n' +
      '  OR install agent-browser: npm install -g agent-browser\n' +
      '  (Playwright is intentionally deferred for U8.)',
  };
}

/**
 * Open a driver session bound to `origin`. The returned object exposes a
 * uniform subset of bb-browser / agent-browser commands. Callers never
 * touch `spawn` directly — every operation routes through this adapter so
 * the six journey specs stay driver-agnostic.
 *
 * Shared contract:
 *   open(url)        — navigate current tab, clearing cookies first
 *   click(selector)  — click an element matched by CSS selector
 *   fill(sel, text)  — clear + fill an input
 *   text(selector)   — read rendered textContent
 *   eval(js)         — execute JS in the page (used sparingly)
 *   screenshot(p)    — write a PNG at absolute path p
 *   clearStorage()   — clear localStorage + sessionStorage on current origin
 *   waitForSelector(sel, timeoutMs) — poll until element exists, or throw
 *   close()          — navigate to about:blank; keep daemon running
 *
 * bb-browser uses `@ref` refs resolved from `snapshot -i`. We wrap that
 * with a selector-first API by eval-ing `document.querySelector(...)`
 * which returns the element's outer HTML — the journey-level contract is
 * "selector present" or "click-by-selector", not "ref juggling".
 *
 * agent-browser natively accepts CSS selectors as positional args, so the
 * wrapper is thin.
 */
export async function openDriver({ origin, driver }) {
  if (!driver || !driver.available) {
    throw new Error(
      'openDriver: probeDriver() must succeed before calling openDriver.',
    );
  }
  if (!origin) {
    throw new Error('openDriver: { origin } is required.');
  }

  if (driver.name === 'bb-browser') {
    return createBbAdapter(driver.cli, origin);
  }
  if (driver.name === 'agent-browser') {
    return createAgAdapter(driver.cli, origin);
  }
  throw new Error(`openDriver: unknown driver ${driver.name}`);
}

// ---------------------------------------------------------------------------
// bb-browser adapter
// ---------------------------------------------------------------------------

function createBbAdapter(cli, origin) {
  const name = 'bb-browser';

  async function bb(args, opts = {}) {
    return run(cli, args, { timeoutMs: 20_000, ...opts });
  }

  // Quote-safe eval: bb-browser's `eval "<js>"` argument is passed to
  // Chrome via CDP. We keep expressions on one line and rely on
  // argv-level quoting rather than shell-level to avoid cmd.exe quoting
  // surprises on Windows. Spawn with shell:false (see run()) already
  // isolates us from cmd.exe for non-.cmd binaries.
  async function evalJs(js) {
    const res = await bb(['eval', js]);
    return res.stdout.trim();
  }

  async function waitForSelector(selector, timeoutMs = 10_000) {
    const start = Date.now();
    const poll = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? 'yes' : 'no'; })()`;
    while (Date.now() - start < timeoutMs) {
      const out = await evalJs(poll);
      if (/yes/i.test(out)) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`bb-browser waitForSelector timed out: ${selector}`);
  }

  return {
    name,
    origin,

    /**
     * Open `url` in the current tab. We navigate the existing tab rather
     * than opening a new one so the daemon stays stable across journeys.
     *
     * Cross-journey isolation: before loading `url`, we navigate the tab
     * to the SAME origin at `/` so the defensive wipe below can clear
     * localStorage / cookies for that origin without cross-origin access
     * constraints. That wipes any cookie the previous journey's `/demo`
     * path set, so every journey starts cold.
     *
     * bb-browser's `open <url>` reuses the current tab — no new-tab
     * side effect.
     */
    async open(url) {
      const target = url.startsWith('http') ? url : `${origin}${url}`;
      // Step 1: navigate to origin root to get a page context we can
      // eval against; no-op if we're already there.
      const pre = await bb(['open', `${origin}/`]);
      if (pre.ok) {
        const wipe =
          `(() => {` +
            ` try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}` +
            ` try {` +
              ` document.cookie.split(';').forEach(c => {` +
                ` const n = c.split('=')[0].trim();` +
                ` if (n) document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/';` +
              ` });` +
            ` } catch (e) {}` +
            ` return 'ok';` +
          ` })()`;
        try { await evalJs(wipe); } catch { /* eval may fail on about:blank — ignored */ }
      }
      // Step 2: navigate to the actual target URL.
      const res = await bb(['open', target]);
      if (!res.ok) {
        throw new Error(`bb-browser open failed: ${res.stderr || res.stdout}`);
      }
    },

    async click(selector) {
      await waitForSelector(selector);
      const clickJs =
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'missing'; el.click(); return 'ok'; })()`;
      const out = await evalJs(clickJs);
      if (!/ok/i.test(out)) {
        throw new Error(`bb-browser click failed for ${selector}: ${out}`);
      }
    },

    async fill(selector, text) {
      await waitForSelector(selector);
      const fillJs =
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'missing'; el.focus(); el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); return 'ok'; })()`;
      const out = await evalJs(fillJs);
      if (!/ok/i.test(out)) {
        throw new Error(`bb-browser fill failed for ${selector}: ${out}`);
      }
    },

    async text(selector) {
      await waitForSelector(selector);
      const readJs =
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.textContent : null; })()`;
      return evalJs(readJs);
    },

    async eval(js) {
      return evalJs(js);
    },

    async screenshot(filePath) {
      const res = await bb(['screenshot', filePath]);
      if (!res.ok) {
        throw new Error(`bb-browser screenshot failed: ${res.stderr || res.stdout}`);
      }
    },

    async clearStorage() {
      // Clear a broader set of auth-touching storage keys + sessionStorage
      // + cookies for the tab's origin, so artefact captures never embed
      // real dev credentials and each journey starts cold.
      const js =
        `(() => {` +
          ` try {` +
            ` const keys = ['ks2_session','oauth_token','oauth_refresh','access_token','refresh_token'];` +
            ` keys.forEach(k => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {} });` +
            ` document.cookie.split(';').forEach(c => {` +
              ` const name = c.split('=')[0].trim();` +
              ` if (!name) return;` +
              ` document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/';` +
            ` });` +
            ` return 'ok';` +
          ` } catch (e) { return 'err:' + e.message; }` +
        ` })()`;
      await evalJs(js);
    },

    waitForSelector,

    async close() {
      // Navigate to a minimal blank-ish URL so the tab releases any
      // page resources (workers, event listeners) before the next
      // journey reuses it. We avoid `tab close` because closing the
      // last tab stops the daemon's Chrome target — the daemon then
      // cannot restart because Chrome stays up but CDP is lost.
      try { await bb(['open', 'about:blank']); } catch { /* noop */ }
    },
  };
}

// ---------------------------------------------------------------------------
// agent-browser adapter
// ---------------------------------------------------------------------------

function createAgAdapter(cli, origin) {
  const name = 'agent-browser';

  async function ag(args, opts = {}) {
    return run(cli, args, { timeoutMs: 20_000, ...opts });
  }

  async function evalJs(js) {
    const res = await ag(['eval', js]);
    return res.stdout.trim();
  }

  async function waitForSelector(selector, timeoutMs = 10_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const poll = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? 'yes' : 'no'; })()`;
      const out = await evalJs(poll);
      if (/yes/i.test(out)) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`agent-browser waitForSelector timed out: ${selector}`);
  }

  return {
    name,
    origin,

    async open(url) {
      const target = url.startsWith('http') ? url : `${origin}${url}`;
      // Same cross-journey cookie wipe as the bb-browser path.
      const pre = await ag(['open', `${origin}/`]);
      if (pre.ok) {
        const wipe =
          `(() => {` +
            ` try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}` +
            ` try {` +
              ` document.cookie.split(';').forEach(c => {` +
                ` const n = c.split('=')[0].trim();` +
                ` if (n) document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/';` +
              ` });` +
            ` } catch (e) {}` +
            ` return 'ok';` +
          ` })()`;
        try { await evalJs(wipe); } catch { /* noop */ }
      }
      const res = await ag(['open', target]);
      if (!res.ok) {
        throw new Error(`agent-browser open failed: ${res.stderr || res.stdout}`);
      }
    },

    async click(selector) {
      await waitForSelector(selector);
      const res = await ag(['click', selector]);
      if (!res.ok) {
        throw new Error(`agent-browser click failed for ${selector}: ${res.stderr || res.stdout}`);
      }
    },

    async fill(selector, text) {
      await waitForSelector(selector);
      const res = await ag(['fill', selector, text]);
      if (!res.ok) {
        throw new Error(`agent-browser fill failed: ${res.stderr || res.stdout}`);
      }
    },

    async text(selector) {
      await waitForSelector(selector);
      const js = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.textContent : null; })()`;
      return evalJs(js);
    },

    async eval(js) {
      return evalJs(js);
    },

    async screenshot(filePath) {
      const res = await ag(['screenshot', filePath]);
      if (!res.ok) {
        throw new Error(`agent-browser screenshot failed: ${res.stderr || res.stdout}`);
      }
    },

    async clearStorage() {
      const js =
        `(() => { try { ['ks2_session','oauth_token','oauth_refresh','access_token','refresh_token'].forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k); }); return 'ok'; } catch (e) { return 'err:' + e.message; } })()`;
      await evalJs(js);
    },

    waitForSelector,

    async close() {
      try { await ag(['open', 'about:blank']); } catch { /* noop */ }
    },
  };
}
