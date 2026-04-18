// Pre-session dashboard for spelling. Configures the engine inputs (mode,
// year filter, round length, show-cloze, audio engine) and kicks off a
// session. All values feed the engine verbatim — the dashboard does not
// amend any scientific decisions.

function loadSpellingPrefs(profileId) {
  var prefs = window.KS2App?.getState()?.spelling?.prefs || {};
  return {
    yearFilter: prefs.yearFilter || 'all',
    roundLength: prefs.roundLength || '20',
    showCloze: typeof prefs.showCloze === 'boolean' ? prefs.showCloze : true,
    autoSpeak: typeof prefs.autoSpeak === 'boolean' ? prefs.autoSpeak : true,
  };
}

function saveSpellingPrefs(profileId, prefs) {
  return window.KS2Spelling.savePrefs(prefs);
}

function statsForFilter(spellingStats, yearFilter) {
  if (!spellingStats) return { total: 0, secure: 0, due: 0, fresh: 0, trouble: 0, accuracy: null };
  if (yearFilter === 'y3-4') return spellingStats.y3_4 || spellingStats.all || { total: 0 };
  if (yearFilter === 'y5-6') return spellingStats.y5_6 || spellingStats.all || { total: 0 };
  return spellingStats.all || { total: 0, secure: 0, due: 0, fresh: 0, trouble: 0, accuracy: null };
}

function modeBlurb(mode) {
  if (mode === 'smart')   return 'Weighted random mix of due, weak and new words.';
  if (mode === 'trouble') return 'Keeps pressure on weak spellings, mixed so the order feels fresh.';
  if (mode === 'test')    return 'Twenty words, one attempt each, reveal the score at the end.';
  return '';
}

function modeStartLabel(mode) {
  if (mode === 'smart')   return 'Start Smart Review';
  if (mode === 'trouble') return 'Start Trouble Drill';
  if (mode === 'test')    return 'Start SATs Test';
  return 'Start session';
}

function SpellingDashboard({ subject, profile, onStart }) {
  const profileId = (profile && profile.id) || 'default';
  const [appState, setAppState] = React.useState(() => window.KS2App.getState());

  const [mode, setMode] = React.useState('smart');
  const [prefs, setPrefs] = React.useState(() => loadSpellingPrefs(profileId));
  const [stats, setStats] = React.useState(() => statsForFilter(appState.spelling && appState.spelling.stats, prefs.yearFilter));
  const [startError, setStartError] = React.useState('');
  const [starting, setStarting] = React.useState(false);

  React.useEffect(() => {
    const unsubscribe = window.KS2App.subscribe(setAppState);
    window.KS2Spelling.dashboard().catch(() => {});
    return unsubscribe;
  }, [profileId]);

  React.useEffect(() => {
    setPrefs(loadSpellingPrefs(profileId));
  }, [appState.spelling, profileId]);

  React.useEffect(() => {
    setStats(statsForFilter(appState.spelling && appState.spelling.stats, prefs.yearFilter));
  }, [appState.spelling, prefs.yearFilter]);

  function updatePref(key, value) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    saveSpellingPrefs(profileId, next).catch(() => {});
  }

  async function handleStart() {
    setStartError('');
    setStarting(true);
    const length = prefs.roundLength === 'all' ? Infinity
      : (mode === 'test' ? 20 : Number(prefs.roundLength) || 20);
    try {
      const session = await window.KS2Spelling.startSession({
      mode: mode,
      yearFilter: prefs.yearFilter,
      length: length,
      words: [],
    });
      onStart(session, {
        fallbackToSmart: session.fallbackToSmart,
        showCloze: prefs.showCloze,
        autoSpeak: prefs.autoSpeak,
      });
    } catch (err) {
      setStartError(err.message || 'Could not start a session.');
    } finally {
      setStarting(false);
    }
  }

  const yearOptions = [
    { value: 'all',   label: 'Years 3-4 and 5-6' },
    { value: 'y3-4',  label: 'Years 3-4 only' },
    { value: 'y5-6',  label: 'Years 5-6 only' },
  ];
  const lengthOptions = [
    { value: '10',  label: '10 words' },
    { value: '20',  label: '20 words' },
    { value: '40',  label: '40 words' },
    { value: 'all', label: 'All available' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      <Panel
        eyebrow="Spelling · production demo"
        title="Dashboard"
        action={
          <Chip tone="accent" style={{ accent: subject.accent, accentTint: subject.accentTint }}>
            {profile ? profile.name : 'Learner'}
          </Chip>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <Stat label="Total spellings" value={stats.total} small />
          <Stat label="Secure" value={stats.secure} small tone="accent" accent={subject.accent} />
          <Stat label="Due today" value={stats.due} small />
          <Stat label="Weak spots" value={stats.trouble} small />
          <Stat label="Unseen" value={stats.fresh} small />
          <Stat label="Accuracy" value={stats.accuracy == null ? '—' : `${stats.accuracy}%`} small />
        </div>
      </Panel>

      <Panel eyebrow="Audio" title="Voice engine">
        <TTSSettings accent={subject.accent} />
      </Panel>

      <Panel eyebrow="Configure session" title="Round settings">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { id: 'smart',   title: 'Smart Review', hint: 'Adaptive mix (recommended)' },
            { id: 'trouble', title: 'Trouble Drill', hint: 'Focus on weak words' },
            { id: 'test',    title: 'SATs Test',    hint: '20 words, one shot each' },
          ].map(m => {
            const active = m.id === mode;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                style={{
                  textAlign: 'left', padding: '14px 16px',
                  background: active ? subject.accentTint : TOKENS.panel,
                  border: `1.5px solid ${active ? subject.accent : TOKENS.line}`,
                  borderRadius: TOKENS.radiusSm,
                  cursor: 'pointer',
                  fontFamily: TOKENS.fontSans,
                  color: TOKENS.ink,
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{
                  fontSize: 15, fontWeight: 700, color: active ? subject.accent : TOKENS.ink,
                  marginBottom: 4,
                }}>
                  {m.title}
                </div>
                <div style={{ fontSize: 12.5, color: TOKENS.muted, lineHeight: 1.45 }}>
                  {m.hint}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Year group">
            <Select
              value={prefs.yearFilter}
              onChange={(value) => updatePref('yearFilter', value)}
              options={yearOptions}
              accent={subject.accent}
            />
          </Field>
          <Field label={mode === 'test' ? 'Round length (fixed)' : 'Round length'}>
            <Select
              value={mode === 'test' ? '20' : prefs.roundLength}
              onChange={(value) => updatePref('roundLength', value)}
              options={lengthOptions}
              accent={subject.accent}
            />
          </Field>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14 }}>
          <label style={toggleStyle}>
            <input
              type="checkbox"
              checked={prefs.showCloze}
              onChange={(e) => updatePref('showCloze', e.target.checked)}
              style={{ accentColor: subject.accent }}
            />
            <span>Show sentence with blank</span>
          </label>
          <label style={toggleStyle}>
            <input
              type="checkbox"
              checked={prefs.autoSpeak}
              onChange={(e) => updatePref('autoSpeak', e.target.checked)}
              style={{ accentColor: subject.accent }}
            />
            <span>Auto-play audio on each card</span>
          </label>
        </div>

        <div style={{ fontSize: 13, color: TOKENS.muted, marginTop: 12, lineHeight: 1.5 }}>
          {modeBlurb(mode)}
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Btn
            variant="primary"
            size="lg"
            accent={subject.accent}
            icon="play"
            onClick={() => handleStart()}
            disabled={starting}
          >
            {starting ? 'Starting…' : modeStartLabel(mode)}
          </Btn>
          {startError && <Chip tone="bad">{startError}</Chip>}
        </div>
      </Panel>
    </div>
  );
}

const toggleStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  fontSize: 13.5, color: TOKENS.ink2, fontWeight: 600,
  padding: '6px 10px', borderRadius: 10,
  background: TOKENS.panelSoft,
  border: `1px solid ${TOKENS.line}`,
  cursor: 'pointer',
};

Object.assign(window, { SpellingDashboard, loadSpellingPrefs, saveSpellingPrefs });
