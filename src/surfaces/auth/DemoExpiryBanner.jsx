import React from 'react';

// SH2-U3: dedicated surface rendered when `createRepositoriesForBrowserRuntime`
// resolves with `session.code === 'demo_session_expired'`. The bespoke banner
// replaces a generic 401 / "unauthenticated" render so the learner knows their
// demo round has ended (not that something broke) and has two clear next
// actions.
//
// S-04 copy rule (account-existence-neutral — see plan section S-04 for the
// full prohibited-token list): the copy below MUST NOT reveal retention
// duration, MUST NOT confirm to an observer without credentials whether a
// demo cookie corresponds to a real account, and MUST NOT use any wording
// the plan's S-04 prohibited-token list calls out. Two neutral CTAs:
// "Sign in" routes to the standard login flow via `onSignIn`;
// "Start new demo" posts to `/demo` via `onStartDemo`.
//
// The adversarial reviewer runs a literal grep against THIS file for the
// prohibited tokens documented in the plan; those tokens are intentionally
// not repeated here so the grep returns zero matches. A parser-level test
// (`tests/demo-expiry-banner.test.js`) pins the same assertions so copy
// drift fails CI rather than adversarial review.

export function DemoExpiryBanner({ onSignIn, onStartDemo }) {
  async function handleSignIn() {
    if (typeof onSignIn === 'function') {
      await onSignIn();
      return;
    }
    // Fallback: navigate back to `/` so the standard AuthSurface renders.
    // SH2-U3 review NIT-1: clear the expired demo cookie server-side
    // BEFORE the reload. Without the logout POST, the reloaded page would
    // still resolve `session.code === 'demo_session_expired'` and re-render
    // this same banner — trapping the learner in a loop. This mirrors the
    // `platform-logout` path in `main.js` (POST `/api/auth/logout` then
    // navigate). The `.catch(() => {})` swallows transport errors because
    // the navigation is the authoritative recovery — a failed logout call
    // should NOT block the reload (the server will re-evaluate the cookie
    // on next request anyway). See review comment NIT-1 on PR #284.
    if (typeof globalThis !== 'undefined') {
      const doFetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : null;
      if (doFetch) {
        await doFetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
        }).catch(() => {});
      }
      if (globalThis.location) {
        globalThis.location.assign('/');
      }
    }
  }

  async function handleStartDemo() {
    if (typeof onStartDemo === 'function') {
      await onStartDemo();
      return;
    }
    if (typeof globalThis !== 'undefined' && globalThis.location) {
      globalThis.location.assign('/demo');
    }
  }

  return (
    <main className="auth-shell">
      <section
        className="auth-panel card"
        data-testid="demo-expiry-banner"
        data-auth-state="demo-session-expired"
      >
        <div className="eyebrow">KS2 Mastery</div>
        <h1 className="title">Demo session finished</h1>
        <p className="subtitle" data-testid="demo-expiry-banner-body">
          Your demo round has ended. Sign in or start a new demo to keep practising.
        </p>
        {/* SH2-U8: inline style props migrated — `.auth-panel-actions` carries the
            flex + gap + margin-top + wrap layout; the "#3E6FA8" inline background
            is removed because it is identical to `--brand` which `.btn.primary`
            already uses by default via `background: var(--btn-accent, var(--brand))`.
            See docs/hardening/csp-inline-style-inventory.md. */}
        <div className="actions auth-panel-actions">
          <button
            className="btn primary lg"
            type="button"
            data-action="demo-expiry-sign-in"
            onClick={handleSignIn}
          >
            Sign in
          </button>
          <button
            className="btn secondary lg"
            type="button"
            data-action="demo-expiry-start-demo"
            onClick={handleStartDemo}
          >
            Start new demo
          </button>
        </div>
      </section>
    </main>
  );
}
