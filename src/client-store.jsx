const KS2App = (() => {
  const listeners = new Set();
  let state = {
    booting: true,
    auth: {
      signedIn: false,
      user: null,
      providers: {
        google: false,
        facebook: false,
        instagram: false,
        x: false,
        apple: false,
        email: true,
      },
    },
    billing: {
      planCode: 'free',
      status: 'active',
      paywallEnabled: false,
    },
    children: [],
    selectedChild: null,
    spelling: {
      stats: { all: null, y3_4: null, y5_6: null },
      prefs: { yearFilter: 'all', roundLength: '20', showCloze: true, autoSpeak: true },
    },
    monsters: {},
    lastError: '',
  };

  function emit() {
    listeners.forEach((fn) => {
      try { fn(state); } catch (err) {}
    });
  }

  function setState(patch) {
    state = { ...state, ...patch };
    emit();
  }

  async function requestJson(url, options) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(options && options.headers ? options.headers : {}),
      },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || data.error || 'Request failed.');
    }
    return data;
  }

  function applyBootstrap(payload) {
    setState({
      booting: false,
      auth: payload.auth || state.auth,
      billing: payload.billing || state.billing,
      children: Array.isArray(payload.children) ? payload.children : [],
      selectedChild: payload.selectedChild || null,
      spelling: payload.spelling || state.spelling,
      monsters: payload.monsters || {},
      lastError: '',
    });
    return payload;
  }

  async function bootstrap() {
    setState({ booting: true, lastError: '' });
    try {
      const payload = await requestJson('/api/bootstrap');
      return applyBootstrap(payload);
    } catch (error) {
      setState({ booting: false, lastError: error.message || 'Could not load the app.' });
      throw error;
    }
  }

  async function register(email, password) {
    const payload = await requestJson('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return applyBootstrap(payload);
  }

  async function login(email, password) {
    const payload = await requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return applyBootstrap(payload);
  }

  async function logout() {
    await requestJson('/api/auth/logout', { method: 'POST', body: '{}' });
    return bootstrap();
  }

  async function createChild(profile) {
    const payload = await requestJson('/api/children', {
      method: 'POST',
      body: JSON.stringify(profile),
    });
    return applyBootstrap(payload);
  }

  async function updateChild(childId, profile) {
    const payload = await requestJson(`/api/children/${encodeURIComponent(childId)}`, {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
    return applyBootstrap(payload);
  }

  async function selectChild(childId) {
    const payload = await requestJson(`/api/children/${encodeURIComponent(childId)}/select`, {
      method: 'POST',
      body: '{}',
    });
    return applyBootstrap(payload);
  }

  async function saveSpellingPrefs(prefs) {
    const payload = await requestJson('/api/spelling/prefs', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    });
    return applyBootstrap(payload);
  }

  function setSpellingData(patch) {
    setState({
      spelling: patch.spelling || state.spelling,
      monsters: patch.monsters || state.monsters,
    });
  }

  return {
    getState() { return state; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    bootstrap,
    login,
    register,
    logout,
    createChild,
    updateChild,
    selectChild,
    saveSpellingPrefs,
    setSpellingData,
    requestJson,
  };
})();

window.KS2App = KS2App;

window.MonsterEngine = {
  getState() {
    const monsters = KS2App.getState().monsters || {};
    return Object.fromEntries(
      Object.entries(monsters).map(([monsterId, progress]) => [
        monsterId,
        {
          mastered: progress.masteredList || [],
          caught: progress.caught,
        },
      ]),
    );
  },
  getMonsterProgress(profileId, monsterId) {
    const monsters = KS2App.getState().monsters || {};
    return monsters[monsterId] || {
      mastered: 0,
      stage: 0,
      level: 0,
      caught: false,
      masteredList: [],
    };
  },
  recordMastery() {
    return null;
  },
  resetAll() {},
};

function LoadingScreen({ message }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: TOKENS.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      fontFamily: TOKENS.fontSans,
    }}>
      <Panel style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: TOKENS.muted,
          }}>KS2 Mastery</div>
          <h1 style={{
            margin: 0,
            fontFamily: TOKENS.fontSerif,
            fontWeight: 800,
            fontSize: 30,
            color: TOKENS.ink,
            letterSpacing: '-0.02em',
          }}>Loading your study space</h1>
          <div style={{ color: TOKENS.ink2, fontSize: 15 }}>
            {message || 'Just a moment while we load the latest progress.'}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = React.useState('login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(window.KS2App.getState().lastError || '');
  const appState = window.KS2App.getState();
  const providers = appState.auth.providers || {};

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('authError');
    if (!authError) return;
    setError(authError);
    params.delete('authError');
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'register') await window.KS2App.register(email, password);
      else await window.KS2App.login(email, password);
    } catch (err) {
      setError(err.message || 'Could not sign you in.');
    } finally {
      setBusy(false);
    }
  }

  const socialButtons = [
    { id: 'google', label: 'Sign in with Google', available: providers.google, recommended: true },
    { id: 'facebook', label: 'Sign in with Facebook', available: providers.facebook },
    {
      id: 'instagram',
      label: 'Sign in with Instagram',
      available: providers.instagram,
      note: 'Professional account login only.',
    },
    { id: 'x', label: 'Sign in with X', available: providers.x },
    { id: 'apple', label: 'Sign in with Apple', available: providers.apple },
  ];

  function startProvider(providerId) {
    window.location.assign(`/api/auth/${encodeURIComponent(providerId)}/start`);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: TOKENS.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      fontFamily: TOKENS.fontSans,
    }}>
      <div style={{ width: '100%', maxWidth: 540 }}>
        <Panel padded={false} style={{ overflow: 'hidden' }}>
          <div style={{
            padding: '26px 30px 18px',
            background: TOKENS.panelSoft,
            borderBottom: `1px solid ${TOKENS.line}`,
          }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: TOKENS.muted,
              marginBottom: 8,
            }}>Private web app</div>
            <h1 style={{
              margin: 0,
              fontFamily: TOKENS.fontSerif,
              fontWeight: 800,
              fontSize: 32,
              letterSpacing: '-0.02em',
              color: TOKENS.ink,
            }}>Sign in to KS2 Mastery</h1>
            <p style={{ margin: '10px 0 0', color: TOKENS.ink2, fontSize: 15, lineHeight: 1.5 }}>
              The learning engine now runs server-side, so progress and child data stay inside the web app.
            </p>
          </div>

          <div style={{ padding: '22px 30px 30px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              {socialButtons.map((provider) => (
                <div key={provider.id} style={{ width: '100%', maxWidth: 380 }}>
                  <button
                    type="button"
                    onClick={() => provider.available && startProvider(provider.id)}
                    disabled={!provider.available}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      padding: '14px 20px',
                      borderRadius: 999,
                      border: `1.5px solid ${provider.available ? '#B7C0CC' : TOKENS.lineSoft}`,
                      background: '#FFFFFF',
                      color: TOKENS.ink,
                      cursor: provider.available ? 'pointer' : 'not-allowed',
                      fontFamily: TOKENS.fontSans,
                      fontSize: 15,
                      fontWeight: 700,
                      opacity: provider.available ? 1 : 0.62,
                      boxShadow: provider.available ? '0 1px 0 rgba(17, 24, 39, 0.04)' : 'none',
                    }}
                  >
                    <span style={{
                      width: 32,
                      height: 32,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <ProviderBadge providerId={provider.id} />
                    </span>
                    <span>{provider.label}</span>
                  </button>
                  {!provider.available && (
                    <div style={{ padding: '6px 18px 0 50px', fontSize: 11.5, color: TOKENS.muted }}>
                      {provider.note || (provider.recommended
                        ? 'Recommended provider wire pending credentials.'
                        : 'Provider wire pending credentials.')}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: TOKENS.line }} />
              <span style={{ fontSize: 12, color: TOKENS.muted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Or use email
              </span>
              <div style={{ flex: 1, height: 1, background: TOKENS.line }} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {[
                ['login', 'Sign in'],
                ['register', 'Create account'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  style={{
                    padding: '9px 14px',
                    borderRadius: 999,
                    border: `1px solid ${mode === value ? TOKENS.ink : TOKENS.line}`,
                    background: mode === value ? TOKENS.ink : TOKENS.panel,
                    color: mode === value ? '#fff' : TOKENS.ink2,
                    cursor: 'pointer',
                    fontFamily: TOKENS.fontSans,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Email address">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  style={authFieldStyle}
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  style={authFieldStyle}
                />
              </Field>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12.5, color: TOKENS.muted }}>
                  One adult account can manage up to four child profiles.
                </div>
                <Btn type="submit" variant="primary" iconRight="next" disabled={busy}>
                  {busy ? 'Working…' : mode === 'register' ? 'Create account' : 'Sign in'}
                </Btn>
              </div>
            </form>

            {error && <Chip tone="bad">{error}</Chip>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

const authFieldStyle = {
  padding: '12px 14px',
  border: `2px solid ${TOKENS.line}`,
  borderRadius: 12,
  fontSize: 15,
  color: TOKENS.ink,
  background: TOKENS.panel,
  width: '100%',
};

function ProviderBadge({ providerId }) {
  const palette = {
    google: { bg: '#FFFFFF', border: '#DADCE0', fg: '#4285F4', label: 'G' },
    facebook: { bg: '#1877F2', border: '#1877F2', fg: '#FFFFFF', label: 'f' },
    instagram: { bg: '#E1306C', border: '#E1306C', fg: '#FFFFFF', label: 'ig' },
    x: { bg: '#111111', border: '#111111', fg: '#FFFFFF', label: 'X' },
    apple: { bg: '#111111', border: '#111111', fg: '#FFFFFF', label: 'A' },
  };
  const token = palette[providerId] || { bg: TOKENS.panelSoft, border: TOKENS.line, fg: TOKENS.ink, label: '?' };
  return (
    <span style={{
      width: 28,
      height: 28,
      borderRadius: providerId === 'facebook' || providerId === 'instagram' ? 8 : 999,
      border: `1px solid ${token.border}`,
      background: token.bg,
      color: token.fg,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: TOKENS.fontSans,
      fontSize: providerId === 'instagram' ? 11 : 17,
      fontWeight: 800,
      lineHeight: 1,
      textTransform: providerId === 'facebook' ? 'none' : 'uppercase',
    }}>
      {token.label}
    </span>
  );
}

Object.assign(window, { KS2App, LoadingScreen, AuthScreen });
