import React, { useState } from 'react';

const SOCIAL_PROVIDERS = ['google', 'facebook', 'x', 'apple'];

function providerLabel(provider) {
  return provider === 'x' ? 'X' : provider[0].toUpperCase() + provider.slice(1);
}

export function AuthSurface({ initialMode = 'login', initialError = '', onSubmit, onSocialStart, onDemoStart }) {
  const [mode, setMode] = useState(initialMode === 'register' ? 'register' : 'login');
  const [error, setError] = useState(initialError || '');
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  async function submit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await onSubmit?.({
        mode,
        email: formData.get('email'),
        password: formData.get('password'),
      });
    } catch (submitError) {
      setError(submitError?.message || 'Sign-in failed.');
      setBusy(false);
    }
  }

  async function startProvider(provider) {
    setBusy(true);
    setError('');
    try {
      await onSocialStart?.(provider);
    } catch (providerError) {
      setError(providerError?.message || 'Could not start social sign-in.');
      setBusy(false);
    }
  }

  async function startDemo() {
    setBusy(true);
    setError('');
    try {
      await onDemoStart?.();
    } catch (demoError) {
      setError(demoError?.message || 'Could not start the demo.');
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel card">
        <div className="eyebrow">KS2 Mastery</div>
        <h1 className="title">{isRegister ? 'Create your parent account' : 'Sign in to continue'}</h1>
        <p className="subtitle">Your learner profiles and spelling progress sync through the KS2 Mastery cloud backend.</p>
        {error && (
          <div className="feedback bad" role="alert" aria-live="polite" style={{ marginTop: 16 }}>
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
          <button className="btn primary lg" style={{ background: '#3E6FA8' }} type="submit" disabled={busy}>
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
