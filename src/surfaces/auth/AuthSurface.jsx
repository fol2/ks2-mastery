import React, { useState } from 'react';
import { useSubmitLock } from '../../platform/react/use-submit-lock.js';
import { DemoExpiryBanner } from './DemoExpiryBanner.jsx';

const SOCIAL_PROVIDERS = ['google', 'facebook', 'x', 'apple'];

function providerLabel(provider) {
  return provider === 'x' ? 'X' : provider[0].toUpperCase() + provider.slice(1);
}

// SH2-U3: pull the `code` field out of `initialError` whether it arrived as a
// plain string (legacy callers: `initialError="expired"`) or as a richer object
// (`initialError={ code: 'demo_session_expired', message: 'demo expired' }`).
// Keeping the adapter here lets the caller in `main.js` evolve without forcing
// every other consumer of `AuthSurface` to change shape.
function extractAuthErrorCode(value) {
  if (!value) return '';
  if (typeof value === 'string') return '';
  if (typeof value === 'object' && typeof value.code === 'string') return value.code;
  return '';
}

function extractAuthErrorMessage(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.message === 'string') return value.message;
  return '';
}

// SH2-U3 review TEST-BLOCKER-2: a dedicated friendly-card render for the
// `code: 'forbidden'` / `code: 'access_denied'` 403 path. The copy avoids
// raw HTTP status detail ("403") and avoids enumerating which feature is
// restricted (that would regress S-05). Two CTAs mirror the demo-expired
// banner shape so the learner always has an escape hatch.
function ForbiddenNotice({ onSignIn }) {
  async function handleReturn() {
    if (typeof onSignIn === 'function') {
      await onSignIn();
      return;
    }
    if (typeof globalThis !== 'undefined' && globalThis.location) {
      globalThis.location.assign('/');
    }
  }
  return (
    <main className="auth-shell">
      <section
        className="auth-panel card"
        data-testid="auth-forbidden-notice"
        data-auth-state="forbidden"
      >
        <div className="eyebrow">KS2 Mastery</div>
        <h1 className="title">You don&apos;t have access to this area</h1>
        <p className="subtitle" data-testid="auth-forbidden-body">
          This account is not permitted to view the page you asked for. Return home to continue.
        </p>
        {/* SH2-U8: inline style props migrated to `.auth-panel-actions`; the
            `#3E6FA8` inline background is dropped in favour of `.btn.primary`'s
            default `var(--btn-accent, var(--brand))`. In LIGHT mode `--brand`
            is `#3E6FA8` (pixel-identical to the removed inline). In DARK mode
            `--brand` is `#6E9ED6` — this is an INTENTIONAL theme unification:
            the previous inline hard-locked the light hex in every theme, which
            was theme-blind. Post-U8, the button now follows theme. See
            docs/hardening/csp-inline-style-inventory.md "Dark-mode classification". */}
        <div className="actions auth-panel-actions">
          <button
            className="btn primary lg"
            type="button"
            data-action="auth-forbidden-return-home"
            onClick={handleReturn}
          >
            Return home
          </button>
        </div>
      </section>
    </main>
  );
}

// SH2-U3 review TEST-BLOCKER-3: a human-readable render for the
// `code: 'internal_error'` path (500 on /api/auth/session). Avoids
// surfacing the raw status code and gives the learner a retry affordance.
function AuthTransientErrorNotice({ onRetry }) {
  function handleRetry() {
    if (typeof onRetry === 'function') {
      onRetry();
      return;
    }
    if (typeof globalThis !== 'undefined' && globalThis.location) {
      globalThis.location.reload();
    }
  }
  return (
    <main className="auth-shell">
      <section
        className="auth-panel card"
        data-testid="auth-transient-error"
        data-auth-state="transient-error"
      >
        <div className="eyebrow">KS2 Mastery</div>
        <h1 className="title">Something went wrong signing you in</h1>
        <p className="subtitle" data-testid="auth-transient-error-body">
          We couldn&apos;t reach the sign-in service just now. Please try again in a moment.
        </p>
        {/* SH2-U8: inline style props migrated to `.auth-panel-actions`; the
            `#3E6FA8` inline background is dropped in favour of `.btn.primary`'s
            default `var(--btn-accent, var(--brand))`. Light-mode `--brand` is
            `#3E6FA8` (pixel-identical); dark-mode `--brand` is `#6E9ED6` —
            INTENTIONAL theme unification (the inline previously hard-locked
            the light hex across all themes). See
            docs/hardening/csp-inline-style-inventory.md "Dark-mode classification". */}
        <div className="actions auth-panel-actions">
          <button
            className="btn primary lg"
            type="button"
            data-action="auth-transient-error-retry"
            onClick={handleRetry}
          >
            Try again
          </button>
        </div>
      </section>
    </main>
  );
}

export function AuthSurface(props) {
  // SH2-U3: branch BEFORE any hook runs to keep React's Rules of Hooks
  // intact. The banner is a render-branch, not a submit handler, so it
  // never shares hook state with the rest of the AuthSurface. Delegating
  // to a sibling component means `useSubmitLock` (below) only runs on the
  // standard sign-in path.
  const initialErrorCode = extractAuthErrorCode(props?.initialError);
  if (initialErrorCode === 'demo_session_expired') {
    return (
      <DemoExpiryBanner
        onStartDemo={props?.onDemoStart}
        // "Sign in" falls back to navigating `/` (without the expired
        // code) so the standard panel renders. We do not need an explicit
        // onSignIn handler — the caller reloads the auth route.
      />
    );
  }
  // SH2-U3 review blocker-2: friendly 403 card. `forbidden` and
  // `access_denied` cover both the server's public token and the test
  // harness fault-injection token (see fault-injection.mjs).
  if (initialErrorCode === 'forbidden' || initialErrorCode === 'access_denied') {
    return <ForbiddenNotice onSignIn={props?.onForbiddenReturn} />;
  }
  // SH2-U3 review blocker-3: human banner for 500 on auth. The
  // `internal_error` code is what worker/src/errors.js stamps on
  // HttpError(500); the `server_error` alias covers potential future
  // shape variants.
  if (initialErrorCode === 'internal_error' || initialErrorCode === 'server_error') {
    return <AuthTransientErrorNotice onRetry={props?.onTransientRetry} />;
  }
  return <AuthSurfaceStandard {...props} />;
}

function AuthSurfaceStandard({ initialMode = 'login', initialError = '', onSubmit, onSocialStart, onDemoStart }) {
  const [mode, setMode] = useState(initialMode === 'register' ? 'register' : 'login');
  const [error, setError] = useState(extractAuthErrorMessage(initialError));
  // SH2-U1: replaces the local `busy`/`setBusy` useState — see
  // `src/platform/react/use-submit-lock.js`. The hook returns
  // `{ locked, run }`; `locked` replaces `busy` in every `disabled`
  // expression, and `run(async () => { ... })` wraps the prior
  // setBusy(true)/onSubmit/setBusy(false) block so concurrent
  // double-clicks / Enter-key repeats / mobile double-taps early-return
  // without firing a second dispatch. Error paths still surface via
  // `setError` in the caller; the hook intentionally does not own
  // error state so Auth keeps its existing `feedback bad` panel copy.
  const submitLock = useSubmitLock();
  const busy = submitLock.locked;
  const isRegister = mode === 'register';

  async function submit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError('');
    try {
      await submitLock.run(async () => {
        await onSubmit?.({
          mode,
          email: formData.get('email'),
          password: formData.get('password'),
        });
      });
    } catch (submitError) {
      setError(submitError?.message || 'Sign-in failed.');
    }
  }

  async function startProvider(provider) {
    setError('');
    try {
      await submitLock.run(async () => {
        await onSocialStart?.(provider);
      });
    } catch (providerError) {
      setError(providerError?.message || 'Could not start social sign-in.');
    }
  }

  async function startDemo() {
    setError('');
    try {
      await submitLock.run(async () => {
        await onDemoStart?.();
      });
    } catch (demoError) {
      setError(demoError?.message || 'Could not start the demo.');
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel card">
        <div className="eyebrow">KS2 Mastery</div>
        <h1 className="title">{isRegister ? 'Create your parent account' : 'Sign in to continue'}</h1>
        <p className="subtitle">
          Practise KS2 spelling, grammar and punctuation online, then save learner profiles and progress when you sign in.
        </p>
        <ul className="auth-product-summary" aria-label="KS2 Mastery practice areas">
          <li>Focused spelling practice for KS2 word confidence</li>
          <li>Grammar practice for sentence-level accuracy</li>
          <li>Punctuation practice for clearer written English</li>
        </ul>
        <nav className="auth-practice-links" aria-label="KS2 practice pages">
          <a href="/ks2-spelling-practice/">KS2 spelling practice online</a>
          <a href="/ks2-grammar-practice/">KS2 grammar practice online</a>
          <a href="/ks2-punctuation-practice/">KS2 punctuation practice online</a>
        </nav>
        {/* SH2-U8: inline style prop migrated to `.auth-standard-error` class
            (see docs/hardening/csp-inline-style-inventory.md). */}
        {error && (
          <div className="feedback bad auth-standard-error" role="alert" aria-live="polite">
            {error}
          </div>
        )}
        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" name="email" autoComplete="email" required disabled={busy} />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              className="input"
              type="password"
              name="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              minLength={8}
              required
              disabled={busy}
            />
          </label>
          {/* SH2-U8: `#3E6FA8` inline background dropped; `.btn.primary` uses
              `var(--btn-accent, var(--brand))` — pixel-identical in light mode
              (`--brand: #3E6FA8`) and INTENTIONALLY theme-aware in dark mode
              (`--brand: #6E9ED6`). The previous inline hard-locked the light
              hex across both themes. See
              docs/hardening/csp-inline-style-inventory.md "Dark-mode classification". */}
          <button className="btn primary lg" type="submit" disabled={busy}>
            {isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <div className="auth-switch">
          <button
            className="btn ghost"
            type="button"
            disabled={busy}
            onClick={() => {
              setError('');
              setMode(isRegister ? 'login' : 'register');
            }}
          >
            {isRegister ? 'Use an existing account' : 'Create a new account'}
          </button>
        </div>
        <button className="btn secondary lg" type="button" disabled={busy} onClick={startDemo}>
          Try demo
        </button>
        <div className="auth-divider"><span>Social sign-in</span></div>
        <div className="auth-social">
          {SOCIAL_PROVIDERS.map((provider) => (
            <button
              key={provider}
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={() => startProvider(provider)}
            >
              {providerLabel(provider)}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
