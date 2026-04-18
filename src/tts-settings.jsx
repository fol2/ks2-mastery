// Audio settings panel rendered inside the spelling dashboard. Reads and
// writes through window.KS2_TTS, so the game and dashboard see changes live.
//
// Visual hygiene uses the unified shell's tokens + primitives — this is a
// QoL layer on top of the legacy preview, not a new engine.

function TTSSettings({ accent }) {
  const TTS = window.KS2_TTS;
  const [config, setConfig] = React.useState(() => TTS.getConfig());
  const [elevenLabsLoading, setElevenLabsLoading] = React.useState(false);
  const [elevenLabsError, setElevenLabsError] = React.useState('');
  const [testing, setTesting] = React.useState(false);
  const [testError, setTestError] = React.useState('');
  const [quota, setQuota] = React.useState(() => TTS.geminiQuotaSummary());

  // Subscribe to TTS config changes so the panel reflects external updates.
  React.useEffect(() => {
    const unsubscribe = TTS.subscribe(() => {
      setConfig(TTS.getConfig());
      setQuota(TTS.geminiQuotaSummary());
    });
    return unsubscribe;
  }, []);

  // Kick off ElevenLabs voice fetch whenever an ElevenLabs key is present.
  React.useEffect(() => {
    if (config.provider !== 'elevenlabs' || !config.apiKey) return;
    setElevenLabsLoading(true);
    setElevenLabsError('');
    TTS.ensureElevenLabsVoices()
      .then(() => { setConfig(TTS.getConfig()); })
      .catch((err) => { setElevenLabsError(TTS.providerErrorText('elevenlabs', err)); })
      .finally(() => setElevenLabsLoading(false));
  }, [config.provider, config.apiKey]);

  const providers = TTS.providers();
  const voiceOptions = TTS.voiceOptions(config.provider);
  const modelOptions = TTS.modelOptions(config.provider);
  const needsKey = TTS.providerNeedsApiKey(config.provider);
  const showBackup = config.provider === 'gemini';
  const showModel = config.provider === 'elevenlabs'; // other providers have a single model

  function handleEngine(provider) { TTS.setEngine(provider); }
  function handleVoice(value) { TTS.setVoice(config.provider, value); }
  function handleModel(value) { TTS.setModel(config.provider, value); }
  function handleKey(value) { TTS.setApiKey(config.provider, value); }
  function handleBackup(value) { TTS.setGeminiBackupApiKey(value); }
  function handleRate(value) { TTS.setRate(Number(value)); }

  async function handleTest() {
    if (testing) return;
    setTesting(true);
    setTestError('');
    try {
      await TTS.speak({
        word: { word: 'test' },
        sentence: 'This is a spelling dictation test.',
      });
    } catch (err) {
      setTestError(TTS.providerErrorText(config.provider, err));
    } finally {
      setTesting(false);
      setQuota(TTS.geminiQuotaSummary());
    }
  }

  const ready = TTS.isReady();
  const statusLabel = ready ? TTS.readyLabel() : (TTS.readyLabel() + ' Voice will still be generated offline if your browser supports it.');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Engine selector — chip row */}
      <div>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: TOKENS.muted, marginBottom: 6,
        }}>Voice engine</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {providers.map((id) => {
            const active = id === config.provider;
            return (
              <button
                key={id}
                onClick={() => handleEngine(id)}
                style={{
                  padding: '8px 14px', fontSize: 13, fontWeight: 700,
                  fontFamily: TOKENS.fontSans,
                  borderRadius: 999, cursor: 'pointer',
                  background: active ? (accent || TOKENS.ink) : TOKENS.panel,
                  color: active ? '#fff' : TOKENS.ink2,
                  border: `1px solid ${active ? (accent || TOKENS.ink) : TOKENS.line}`,
                  transition: 'all 0.15s ease',
                }}
              >
                {TTS.providerLabel(id)}
              </button>
            );
          })}
        </div>
      </div>

      {/* API key + backup (non-browser) */}
      {needsKey && (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: showBackup ? '1fr 1fr' : '1fr' }}>
          <Field label={`${TTS.providerLabel(config.provider)} API key`}>
            <input
              type="password"
              value={config.apiKey || ''}
              onChange={(e) => handleKey(e.target.value)}
              placeholder={`${TTS.providerLabel(config.provider)} key (saved only in this browser)`}
              autoComplete="off" autoCorrect="off" spellCheck={false}
              style={inputStyle}
            />
          </Field>
          {showBackup && (
            <Field label="Gemini backup key">
              <input
                type="password"
                value={config.geminiBackupApiKey || ''}
                onChange={(e) => handleBackup(e.target.value)}
                placeholder="Backup Gemini key (used after 429 or local cap)"
                autoComplete="off" autoCorrect="off" spellCheck={false}
                style={inputStyle}
              />
            </Field>
          )}
        </div>
      )}

      {/* Voice + model row */}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: showModel ? '2fr 1fr' : '1fr' }}>
        <Field label="Voice">
          {voiceOptions.length ? (
            <Select value={config.voice} onChange={handleVoice} options={voiceOptions} accent={accent} />
          ) : (
            <div style={mutedBox}>
              {config.provider === 'elevenlabs'
                ? (elevenLabsLoading ? 'Loading voices…' : (elevenLabsError || 'Add ElevenLabs key.'))
                : (config.provider === 'browser' ? 'No en-GB voice on this device.' : 'Add API key.')}
            </div>
          )}
        </Field>
        {showModel && (
          <Field label="Model">
            <Select
              value={config.model}
              onChange={handleModel}
              options={modelOptions.map(([value, label]) => ({ value, label }))}
              accent={accent}
            />
          </Field>
        )}
      </div>

      {/* Rate slider + test button */}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr auto', alignItems: 'end' }}>
        <Field label={`Playback rate · ${config.rate.toFixed(2)}×`}>
          <input
            type="range"
            min="0.9" max="1.25" step="0.01"
            value={config.rate}
            onChange={(e) => handleRate(e.target.value)}
            style={{ width: '100%', accentColor: accent || TOKENS.ink }}
          />
        </Field>
        <Btn
          variant="accent"
          icon="volume"
          onClick={handleTest}
          disabled={testing || !ready}
          accent={accent}
        >
          {testing ? 'Testing…' : 'Test voice'}
        </Btn>
      </div>

      {/* Status + quota chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Chip tone={ready ? 'good' : 'warn'}>{statusLabel}</Chip>
        {quota && (
          <Chip tone={quota.backoffActive ? 'bad' : 'neutral'}>
            Gemini · {quota.minuteCount}/{quota.minuteLimit} min · {quota.dayCount}/{quota.dayLimit} day
          </Chip>
        )}
        {testError && <Chip tone="bad">{testError}</Chip>}
      </div>

      {needsKey && (
        <div style={{ fontSize: 12, color: TOKENS.muted, lineHeight: 1.5 }}>
          Keys are stored on this device only. Do not paste production keys on a shared computer.
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  padding: '10px 12px',
  border: `1px solid ${TOKENS.line}`,
  borderRadius: 12,
  fontFamily: TOKENS.fontMono, fontSize: 13,
  color: TOKENS.ink,
  background: TOKENS.panel,
  minHeight: 40,
  outline: 'none',
};

const mutedBox = {
  padding: '10px 12px',
  border: `1px dashed ${TOKENS.line}`,
  borderRadius: 12,
  fontSize: 13,
  color: TOKENS.muted,
  background: TOKENS.panelSoft,
  minHeight: 40,
  display: 'flex', alignItems: 'center',
};

Object.assign(window, { TTSSettings });
