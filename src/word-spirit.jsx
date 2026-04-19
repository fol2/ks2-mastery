// Word Spirit UI surfaces — consumed by Collection, Sanctuary, combat
// catch ceremony, and the flashcard retrieval dialog.
//
// State model (pushed by the caller; no internal mastery lookup):
//   WILD       — word never encountered → `?` placeholder card.
//   SILHOUETTE — word seen but not yet secured → silhouette + faint
//                outline of the word peeking through (R7).
//   CAUGHT     — word secured → full art + word + sentence + audio
//                button, opens the flashcard dialog on tap (R5).
//
// WordSpiritDetailDialog is the flashcard retrieval affordance (R5):
// opens hidden-by-default, audio plays as prompt, user taps Reveal
// to see the word. Reveal state resets on every open so the user
// must recall first each time. The study engine remains the sole
// review scheduler — this is retrieval *practice*, not a review queue.

function WordSpiritFrameBody({ accent, accentTint, size, children }) {
  // Inner tinted panel that holds the art. Extracted because the
  // clickable vs. non-clickable wrappers below need to share the
  // same visual box without nesting buttons.
  return (
    <div style={{
      width: size, height: size,
      background: accentTint || window.TOKENS.panelSoft,
      borderRadius: window.TOKENS.radiusSm,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>{children}</div>
  );
}

function WordSpiritFrame({
  accent, accentTint, size, onClick, ariaLabel, children,
}) {
  // Frame is a div with role="button" rather than a real <button>
  // because callers (caught card) render nested interactive elements
  // for audio playback. Nesting <button> inside <button> is invalid.
  const canClick = typeof onClick === 'function';
  const handleKey = canClick ? (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  } : undefined;
  return (
    <div
      role={canClick ? 'button' : undefined}
      tabIndex={canClick ? 0 : undefined}
      aria-label={ariaLabel}
      onClick={canClick ? onClick : undefined}
      onKeyDown={handleKey}
      style={{
        padding: 10,
        background: window.TOKENS.panel,
        border: `1px solid ${window.TOKENS.line}`,
        borderTop: `3px solid ${accent || window.TOKENS.ink}`,
        borderRadius: window.TOKENS.radiusSm,
        boxShadow: window.TOKENS.shadow,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        cursor: canClick ? 'pointer' : 'default',
        fontFamily: window.TOKENS.fontSans,
        outline: 'none',
      }}
    >
      <WordSpiritFrameBody accent={accent} accentTint={accentTint} size={size}>
        {children}
      </WordSpiritFrameBody>
    </div>
  );
}

function spiritSubject(subjectId) {
  const subjects = window.SUBJECTS || {};
  return subjects[subjectId] || {};
}

function WordSpiritCaption({ word, slug }) {
  return (
    <div style={{
      fontFamily: window.TOKENS.fontSerif,
      fontSize: 14, fontWeight: 700,
      color: window.TOKENS.ink, textAlign: 'center', lineHeight: 1.2,
    }}>{word || slug}</div>
  );
}

function WordSpiritSubCaption({ children }) {
  return (
    <div style={{
      fontFamily: window.TOKENS.fontSans,
      fontSize: 11, fontWeight: 700,
      color: window.TOKENS.muted, textTransform: 'uppercase',
      letterSpacing: '0.06em', textAlign: 'center',
    }}>{children}</div>
  );
}

function WordSpiritAudioPill({ subjectId, label, onPlayAudio }) {
  // Real <button> so keyboard users can activate the audio
  // independently of the card's own tap target. Stops propagation so
  // the enclosing frame's onClick does not also fire.
  const s = spiritSubject(subjectId);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        if (typeof onPlayAudio === 'function') onPlayAudio();
      }}
      aria-label={`Play ${label}`}
      style={{
        marginTop: 2, padding: '4px 10px',
        background: 'transparent',
        color: s.accent || window.TOKENS.ink,
        border: `1px solid ${s.accentSoft || window.TOKENS.line}`,
        borderRadius: 999,
        fontFamily: window.TOKENS.fontSans,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
        cursor: 'pointer',
      }}
    >▶ LISTEN</button>
  );
}

function WordSpiritCard({
  slug, word, sentence, subjectId, size = 72, onClick, onPlayAudio,
}) {
  const s = spiritSubject(subjectId);
  const label = word || slug;
  return (
    <WordSpiritFrame
      accent={s.accent} accentTint={s.accentTint} size={size}
      onClick={onClick}
      ariaLabel={`${label} word spirit — tap to open flashcard`}
    >
      <window.WordSpiritArt slug={slug} subjectId={subjectId} size={size - 16} caught silhouette={false}/>
      <WordSpiritCaption word={word} slug={slug}/>
      {sentence && (
        <div style={{
          fontFamily: window.TOKENS.fontSerif,
          fontSize: 12, color: window.TOKENS.ink2,
          textAlign: 'center', lineHeight: 1.35, maxWidth: size + 40,
        }}>{sentence}</div>
      )}
      {typeof onPlayAudio === 'function' && (
        <WordSpiritAudioPill subjectId={subjectId} label={label} onPlayAudio={onPlayAudio}/>
      )}
    </WordSpiritFrame>
  );
}

function WordSpiritSilhouette({
  slug, word, subjectId, size = 72, onClick,
}) {
  // Silhouette + faint word outline satisfies R7 ("uncaught spirits
  // appear as silhouettes with a faint outline of the word"). The
  // overlay is absolutely positioned over the art so the outline is
  // visible through the darkened shape without muddying the edges.
  const s = spiritSubject(subjectId);
  const label = word || slug;
  return (
    <WordSpiritFrame
      accent={s.accent} accentTint={s.accentTint} size={size}
      onClick={onClick}
      ariaLabel={`${label} — not yet secured`}
    >
      <div style={{ position: 'relative', width: size - 16, height: size - 16 }}>
        <window.WordSpiritArt slug={slug} subjectId={subjectId} size={size - 16} silhouette caught={false}/>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: window.TOKENS.fontSerif,
          fontSize: Math.max(10, Math.round((size - 16) / 6)),
          fontWeight: 700, color: window.TOKENS.ink,
          opacity: 0.22, letterSpacing: '0.04em',
          textTransform: 'lowercase',
          pointerEvents: 'none',
        }}>{label}</div>
      </div>
      <WordSpiritSubCaption>Not yet secured</WordSpiritSubCaption>
    </WordSpiritFrame>
  );
}

function WordSpiritWild({ subjectId, size = 72, onClick }) {
  // Unseen — no slug yet bound to this grid slot. Rendered so the
  // Collection grid keeps a visual anchor per slot; caller supplies
  // the slot identity (e.g. pool index) if it wants keying.
  const s = spiritSubject(subjectId);
  return (
    <WordSpiritFrame
      accent={s.accent} accentTint={s.accentTint} size={size}
      onClick={onClick}
      ariaLabel="Unseen word — not yet encountered"
    >
      <div style={{
        width: size - 16, height: size - 16, borderRadius: '50%',
        background: window.TOKENS.lineSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: window.TOKENS.fontSerif, fontSize: Math.round((size - 16) / 2.5),
        fontWeight: 800, color: window.TOKENS.muted,
      }}>?</div>
      <WordSpiritSubCaption>Unseen</WordSpiritSubCaption>
    </WordSpiritFrame>
  );
}

function WordSpiritDetailDialog({
  open, slug, word, sentence, subjectId, onClose, onPlayAudio,
}) {
  // Reveal state lives here only; per R5 it must NOT persist between
  // opens. The effect resets on every transition to `open: true` (or
  // when the slug changes while open) so each flashcard session
  // starts with the word hidden.
  const [revealed, setRevealed] = React.useState(false);
  React.useEffect(() => {
    if (open) setRevealed(false);
  }, [open, slug]);

  if (!open || !slug) return null;

  const s = spiritSubject(subjectId);
  const label = word || slug;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label} flashcard`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(20,28,40,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(360px, 92vw)',
          background: window.TOKENS.panel,
          border: `1px solid ${window.TOKENS.line}`,
          borderTop: `4px solid ${s.accent || window.TOKENS.ink}`,
          borderRadius: window.TOKENS.radius,
          boxShadow: window.TOKENS.shadowLg,
          padding: '22px 22px 18px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
          fontFamily: window.TOKENS.fontSans,
        }}
      >
        <window.WordSpiritArt
          slug={slug} subjectId={subjectId} size={140}
          caught={revealed} silhouette={!revealed}
        />
        <div style={{
          fontFamily: window.TOKENS.fontSerif,
          fontSize: 24, fontWeight: 800,
          color: window.TOKENS.ink,
          minHeight: 30,
          letterSpacing: revealed ? '-0.01em' : '0.3em',
        }}>{revealed ? label : '• • • •'}</div>

        {revealed && sentence && (
          <div style={{
            fontSize: 14, color: window.TOKENS.ink2, textAlign: 'center',
            lineHeight: 1.5, fontFamily: window.TOKENS.fontSerif,
          }}>{sentence}</div>
        )}

        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          {typeof onPlayAudio === 'function' && (
            <button
              type="button"
              onClick={onPlayAudio}
              style={{
                flex: 1, padding: '10px 14px',
                background: window.TOKENS.panel,
                color: s.accent || window.TOKENS.ink,
                border: `2px solid ${s.accent || window.TOKENS.ink}`,
                borderRadius: window.TOKENS.radiusSm,
                fontFamily: window.TOKENS.fontSans, fontWeight: 700, fontSize: 14,
                cursor: 'pointer',
              }}
            >▶ Play word</button>
          )}
          {!revealed ? (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              style={{
                flex: 1, padding: '10px 14px',
                background: s.accent || window.TOKENS.ink, color: '#fff',
                border: 'none',
                borderRadius: window.TOKENS.radiusSm,
                fontFamily: window.TOKENS.fontSans, fontWeight: 700, fontSize: 14,
                cursor: 'pointer',
              }}
            >Reveal</button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: '10px 14px',
                background: 'transparent', color: window.TOKENS.ink2,
                border: `1px solid ${window.TOKENS.line}`,
                borderRadius: window.TOKENS.radiusSm,
                fontFamily: window.TOKENS.fontSans, fontWeight: 700, fontSize: 14,
                cursor: 'pointer',
              }}
            >Close</button>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  WordSpiritCard,
  WordSpiritSilhouette,
  WordSpiritWild,
  WordSpiritDetailDialog,
});
