// End-of-session summary for spelling. Renders the engine's finalise()
// payload and offers mistake-drill chaining. Matches legacy preview.html
// 2665-2686 (learning) and 2911-2930 (test), with unified shell styling.

function formatElapsed(ms) {
  const seconds = Math.max(0, Math.round((ms || 0) / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function SpellingSummary({ summary, subject, profile, onDrillMistakes, onNewSession }) {
  const Engine = window.SpellingEngine;
  const profileId = (profile && profile.id) || 'default';
  const mistakes = Array.isArray(summary.mistakes) ? summary.mistakes : [];
  const hasMistakes = mistakes.length > 0;

  function driillSingle(word) {
    onDrillMistakes && onDrillMistakes({ mode: 'single', words: [word] });
  }

  function drillAll() {
    if (!hasMistakes) return;
    onDrillMistakes && onDrillMistakes({ mode: 'trouble', words: mistakes });
  }

  const accent = (subject && subject.accent) || TOKENS.ink;
  const accentTint = (subject && subject.accentTint) || TOKENS.lineSoft;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Panel>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%',
            background: accentTint, color: accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name={hasMistakes ? 'target' : 'spark'} size={48} />
          </div>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: TOKENS.muted, marginBottom: 6,
            }}>
              {summary.label}
            </div>
            <h2 style={{
              margin: 0, fontFamily: TOKENS.fontSerif, fontSize: 30, fontWeight: 800,
              color: TOKENS.ink, letterSpacing: '-0.02em',
            }}>
              {summary.cards[0].value} · {summary.cards[0].label}
            </h2>
            <p style={{ margin: '8px 0 0', color: TOKENS.ink2, fontSize: 15, maxWidth: 520, lineHeight: 1.5 }}>
              {summary.message}
            </p>
            <p style={{ margin: '8px 0 0', color: TOKENS.muted, fontSize: 12.5 }}>
              Time on task: {formatElapsed(summary.elapsedMs)}
            </p>
          </div>
        </div>
      </Panel>

      <Panel eyebrow="Round stats" title="Breakdown">
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10,
        }}>
          {summary.cards.map(card => (
            <Stat key={card.label} label={card.label} value={card.value} small />
          ))}
        </div>
      </Panel>

      {hasMistakes && (
        <Panel
          eyebrow="Mistake drill"
          title="Words that need another go"
          action={
            <Btn variant="primary" accent={accent} icon="target" onClick={drillAll}>
              Drill these {mistakes.length}
            </Btn>
          }
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {mistakes.map(word => (
              <button
                key={word.slug}
                onClick={() => driillSingle(word)}
                title={`Single-word drill for ${word.word}`}
                style={{
                  padding: '6px 12px', borderRadius: 999,
                  background: TOKENS.badSoft, color: TOKENS.bad,
                  border: `1px solid #F3C4C1`,
                  fontFamily: TOKENS.fontMono, fontSize: 13, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {word.word}
                <span style={{ color: TOKENS.muted, marginLeft: 6, fontFamily: TOKENS.fontSans, fontWeight: 600 }}>
                  · {word.family}
                </span>
              </button>
            ))}
          </div>
        </Panel>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Btn variant="secondary" icon="back" onClick={onNewSession}>Back to dashboard</Btn>
        <Btn variant="primary" accent={accent} icon="play" onClick={onNewSession}>Start a new session</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { SpellingSummary });
