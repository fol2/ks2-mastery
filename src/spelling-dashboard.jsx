// Pre-session dashboard for spelling. Configures the engine inputs (mode,
// year filter, round length, show-cloze, audio engine) and kicks off a
// session. All values feed the engine verbatim — the dashboard does not
// amend any scientific decisions.

function loadSpellingPrefs(profileId) {
  try {
    var raw = localStorage.getItem('ks2-spell-prefs-' + (profileId || 'default'));
    var parsed = raw ? JSON.parse(raw) : {};
    return {
      yearFilter: parsed.yearFilter || 'all',
      roundLength: parsed.roundLength || '20',
      showCloze: typeof parsed.showCloze === 'boolean' ? parsed.showCloze : true,
      autoSpeak: typeof parsed.autoSpeak === 'boolean' ? parsed.autoSpeak : true,
    };
  } catch (err) {
    return { yearFilter: 'all', roundLength: '20', showCloze: true, autoSpeak: true };
  }
}

function saveSpellingPrefs(profileId, prefs) {
  try {
    localStorage.setItem('ks2-spell-prefs-' + (profileId || 'default'), JSON.stringify(prefs));
  } catch (err) { /* ignore */ }
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
  const Engine = window.SpellingEngine;
  const profileId = (profile && profile.id) || 'default';

  const [mode, setMode] = React.useState('smart');
  const [prefs, setPrefs] = React.useState(() => loadSpellingPrefs(profileId));
  const [stats, setStats] = React.useState(() => Engine.lifetimeStats(profileId, prefs.yearFilter));
  const [startError, setStartError] = React.useState('');

  // Recompute stats whenever the year filter changes, on profile change, or
  // after a session ends (parent re-mounts the dashboard).
  React.useEffect(() => {
    setStats(Engine.lifetimeStats(profileId, prefs.yearFilter));
  }, [profileId, prefs.yearFilter]);

  React.useEffect(() => {
    saveSpellingPrefs(profileId, prefs);
  }, [profileId, prefs]);

  function updatePref(key, value) {
    setPrefs(prev => ({ ...prev, [key]: value }));
  }

  function handleStart() {
    setStartError('');
    const length = prefs.roundLength === 'all' ? Infinity
      : (mode === 'test' ? 20 : Number(prefs.roundLength) || 20);
    const result = Engine.createSession({
      mode: mode,
      yearFilter: prefs.yearFilter,
      length: length,
      profileId: profileId,
    });
    if (!result.ok) {
      setStartError(result.reason || 'Could not start a session.');
      return;
    }
    onStart(result.session, {
      fallbackToSmart: result.fallback,
      showCloze: prefs.showCloze,
      autoSpeak: prefs.autoSpeak,
    });
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
            onClick={handleStart}
          >
            {modeStartLabel(mode)}
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
