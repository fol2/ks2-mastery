// Audio settings panel rendered inside the spelling dashboard.
//
// Browser speech stays local to the device. Remote providers are configured
// and authenticated server-side.

function TTSSettings({ accent }) {
  const TTS = window.KS2_TTS;
  const [config, setConfig] = React.useState(() => TTS.getConfig());
  const [elevenLabsLoading, setElevenLabsLoading] = React.useState(false);
  const [elevenLabsError, setElevenLabsError] = React.useState('');
  const [testing, setTesting] = React.useState(false);
  const [testError, setTestError] = React.useState('');

  React.useEffect(() => {
    const unsubscribe = TTS.subscribe(() => {
      setConfig(TTS.getConfig());
    });
    return unsubscribe;
  }, []);

  React.useEffect(() => {
    if (config.provider !== 'elevenlabs' || !TTS.providerAvailable('elevenlabs')) return;
    setElevenLabsLoading(true);
    setElevenLabsError('');
    TTS.ensureElevenLabsVoices()
      .then(() => { setConfig(TTS.getConfig()); })
      .catch((err) => { setElevenLabsError(TTS.providerErrorText('elevenlabs', err)); })
      .finally(() => setElevenLabsLoading(false));
  }, [config.provider]);

  const providers = TTS.providers();
  const providerAvailable = TTS.providerAvailable(config.provider);
  const voiceOptions = TTS.voiceOptions(config.provider);
  const modelOptions = TTS.modelOptions(config.provider);
  const showModel = config.provider === 'elevenlabs';
  const statusLabel = TTS.readyLabel();

  function handleEngine(provider) {
    if (!TTS.providerAvailable(provider) && provider !== 'browser') return;
    TTS.setEngine(provider);
  }

  function handleVoice(value) { TTS.setVoice(config.provider, value); }
  function handleModel(value) { TTS.setModel(config.provider, value); }
  function handleRate(value) { TTS.setRate(Number(value)); }

  async function handleTest() {
    if (testing || !providerAvailable) return;
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
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: TOKENS.muted, marginBottom: 6,
        }}>Voice engine</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {providers.map((id) => {
            const active = id === config.provider;
            const available = TTS.providerAvailable(id);
            return (
              <button
                key={id}
                onClick={() => handleEngine(id)}
                disabled={!available && id !== 'browser'}
                style={{
                  padding: '8px 14px', fontSize: 13, fontWeight: 700,
                  fontFamily: TOKENS.fontSans,
                  borderRadius: 999,
                  cursor: available || id === 'browser' ? 'pointer' : 'not-allowed',
                  background: active ? (accent || TOKENS.ink) : TOKENS.panel,
                  color: active ? '#fff' : TOKENS.ink2,
                  border: `1px solid ${active ? (accent || TOKENS.ink) : TOKENS.line}`,
                  opacity: available || id === 'browser' ? 1 : 0.55,
                  transition: 'all 0.15s ease',
                }}
              >
                {TTS.providerLabel(id)}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: showModel ? '2fr 1fr' : '1fr' }}>
        <Field label="Voice">
          {voiceOptions.length ? (
            <Select value={config.voice} onChange={handleVoice} options={voiceOptions} accent={accent} />
          ) : (
            <div style={mutedBox}>
              {config.provider === 'elevenlabs'
                ? (elevenLabsLoading ? 'Loading voices…' : (elevenLabsError || (providerAvailable ? 'No voices available yet.' : 'ElevenLabs is not configured on the server.')))
                : (config.provider === 'browser'
                  ? 'No en-GB voice on this device.'
                  : `${TTS.providerLabel(config.provider)} is not configured on the server.`)}
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
          disabled={testing || !TTS.isReady()}
          accent={accent}
        >
          {testing ? 'Testing…' : 'Test voice'}
        </Btn>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Chip tone={TTS.isReady() ? 'good' : 'warn'}>{statusLabel}</Chip>
        {testError && <Chip tone="bad">{testError}</Chip>}
      </div>

      <div style={{ fontSize: 12, color: TOKENS.muted, lineHeight: 1.5 }}>
        {config.provider === 'browser'
          ? 'Browser speech uses voices already available on this device.'
          : 'Remote speech is generated inside the web app. Provider secrets stay on the server and are never stored in this browser.'}
      </div>
    </div>
  );
}

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
