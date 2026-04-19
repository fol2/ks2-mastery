// Spelling game — production three-phase flow (question → retry → correction)
// driven by window.SpellingEngine. Renders the card, handles typing, TTS
// playback, mistake drill chaining and end-of-round transitions.
//
// The engine owns all decisions. This component is a thin UI adapter:
// the only state it adds is local input + phase-derived feedback rendering.

function SpellingGame({
  session: initialSession,
  sessionOpts,
  subject,
  profile,
  onMonsterEvent,
  onEnd,
}) {
  const TTS = window.KS2_TTS;
  const [session, setSession] = React.useState(initialSession);
  const [typed, setTyped] = React.useState('');
  const [feedback, setFeedback] = React.useState(null);
  const [locked, setLocked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef(null);
  const advanceTimerRef = React.useRef(null);

  const showCloze = sessionOpts && sessionOpts.showCloze !== false;
  const autoSpeak = sessionOpts && sessionOpts.autoSpeak !== false;
  const currentCard = session && session.currentCard;

  // Auto-speak whenever a new card arrives. Also warm up the next card's
  // audio so browser dictation feels immediate.
  React.useEffect(() => {
    if (!currentCard || !currentCard.word) return;
    inputRef.current && inputRef.current.focus();
    if (!autoSpeak || !TTS || !TTS.isReady || !TTS.isReady()) return;
    const timer = window.setTimeout(() => {
      TTS.speak({ word: currentCard.word, sentence: currentCard.prompt.sentence });
    }, 120);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCard && currentCard.slug, session && session.phase, autoSpeak]);

  React.useEffect(() => () => {
    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    if (TTS && TTS.stop) TTS.stop();
  }, []);

  function playAudio(slow) {
    if (!currentCard || !currentCard.word || !TTS) return;
    TTS.speak({
      word: currentCard.word,
      sentence: currentCard.prompt.sentence,
      slow: Boolean(slow),
    });
  }

  function advance(delayMs) {
    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = window.setTimeout(async () => {
      try {
        const next = await window.KS2Spelling.advance(session.id);
        if (next.done) {
          onEnd && onEnd(next.summary);
          return;
        }
        setSession(next.session);
        setTyped('');
        setFeedback(null);
        setLocked(false);
        setBusy(false);
      } catch (err) {
        setFeedback({
          kind: 'error',
          headline: 'Connection issue.',
          body: err.message || 'Could not load the next spelling card.',
        });
        setLocked(false);
        setBusy(false);
      }
    }, delayMs != null ? delayMs : 500);
  }

  function emitMonsterIfNeeded(event) {
    if (!event || !onMonsterEvent) return;
    onMonsterEvent({
      ...event,
      monster: window.MONSTERS && window.MONSTERS[event.monsterId],
    });
  }

  // Overlay game system contract (R2, R15.3): fire a `window` CustomEvent on
  // every graded submit so the combat skin and GameEngine can react without
  // touching engine state. Stays a no-op if nothing subscribes. Payload
  // mirrors the plan's answer:graded shape — subject, correctness, slug,
  // phase, and `done` drawn from engine output; streak is read from
  // GameEngine when it exists (Unit 2), defaulting to 0 otherwise.
  function emitAnswerGraded(payload) {
    if (!payload || !payload.result || payload.result.empty) return;
    const slug = (payload.session && payload.session.currentCard && payload.session.currentCard.slug)
      || (currentCard && currentCard.slug)
      || null;
    const previousStreak = (window.GameEngine && typeof window.GameEngine.getStreak === 'function')
      ? window.GameEngine.getStreak()
      : 0;
    const detail = {
      subjectId: 'spelling',
      correct: Boolean(payload.result.correct),
      slug,
      phase: payload.result.phase || null,
      streak: payload.result.correct ? (previousStreak + 1) : 0,
      done: Boolean(payload.result.outcome && payload.result.outcome.done),
    };
    try {
      window.dispatchEvent(new CustomEvent('answer:graded', { detail }));
    } catch { /* CustomEvent unsupported in this environment — safe to skip */ }
  }

  function applyResult(payload, opts) {
    if (!payload || !payload.result) return;
    if (payload.result.empty) return;

    setFeedback(payload.result.feedback || null);
    // Fan out every monster event the submit produced. Includes the direct
    // monster transition plus any aggregate transitions (e.g. Phaeton
    // hatching in the same submit as Glimmerbug's 10th mastery). Empty
    // array is normal and common — most submits produce no mastery event.
    const events = Array.isArray(payload.monsterEvents) ? payload.monsterEvents : [];
    for (const event of events) emitMonsterIfNeeded(event);
    emitAnswerGraded(payload);
    if (payload.session) {
      setSession((prev) => ({
        ...prev,
        ...payload.session,
        currentCard: payload.session.currentCard || (prev && prev.currentCard) || null,
      }));
    }

    if (payload.result.nextAction === 'advance') {
      setLocked(true);
      setBusy(true);
      advance(opts && opts.delayMs);
      return;
    }

    // retype → same word, new phase, clear input, refocus.
    setTyped('');
    setLocked(false);
    setBusy(false);
    window.setTimeout(() => { inputRef.current && inputRef.current.focus(); }, 0);

    // After a wrong submit in question phase the legacy plays slow audio.
    if (payload.result.phase === 'retry' && autoSpeak && TTS && TTS.isReady && TTS.isReady()) {
      window.setTimeout(() => {
        TTS.speak({ word: currentCard.word, sentence: currentCard.prompt.sentence, slow: true });
      }, 140);
    }
  }

  async function handleSubmit(event) {
    if (event) event.preventDefault();
    if (locked || busy || !currentCard || !currentCard.word) return;
    setBusy(true);
    const isTest = session.type === 'test';
    try {
      const result = await window.KS2Spelling.submit(session.id, typed);
      applyResult(result, { delayMs: isTest ? 320 : 500 });
    } catch (err) {
      setBusy(false);
      setFeedback({
        kind: 'error',
        headline: 'Could not save that answer.',
        body: err.message || 'Please try again.',
      });
    }
  }

  async function handleSkip() {
    if (locked || busy || session.type === 'test' || session.phase !== 'question') return;
    setBusy(true);
    try {
      const payload = await window.KS2Spelling.skip(session.id);
      setFeedback({
        kind: 'info',
        headline: 'Skipped for now.',
        body: 'This word will come back again later in the round.',
      });
      if (payload.session) setSession(prev => ({ ...prev, ...payload.session }));
      setLocked(true);
      advance(280);
    } catch (err) {
      setBusy(false);
      setFeedback({
        kind: 'error',
        headline: 'Could not skip this word.',
        body: err.message || 'Please try again.',
      });
    }
  }

  function handleEnd() {
    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    if (TTS && TTS.stop) TTS.stop();
    onEnd && onEnd({
      label: session.label,
      cards: [
        { label: 'Session ended early', value: '—', sub: 'No final score saved' },
        { label: 'Words checked', value: session.progress.checked, sub: 'Cards attempted before exit' },
      ],
      message: 'This session was ended early. Your saved progress up to the latest submission has been kept.',
      mistakes: [],
      elapsedMs: 0,
    });
  }

  if (!currentCard || !currentCard.word) return null;

  const accent = (subject && subject.accent) || TOKENS.ink;
  const accentTint = (subject && subject.accentTint) || TOKENS.lineSoft;

  const total = session.progress.total;
  const progressValue = session.progress.done;
  const checked = session.progress.checked;
  const wrongCount = session.progress.wrongCount;
  const progressLabel = session.type === 'test'
    ? `${Math.min(checked + 1, total)} of ${total} test words`
    : `${checked} of ${total} checked · ${progressValue} secured · ${wrongCount} need extra care`;

  const placeholder = session.type === 'test'
    ? 'Type the spelling and move on'
    : session.phase === 'retry'
      ? 'Try once more from memory'
      : session.phase === 'correction'
        ? 'Type the correct spelling once'
        : 'Type the spelling here';

  const submitLabel = session.type === 'test'
    ? 'Save and next'
    : session.phase === 'correction'
      ? 'Lock it in'
      : session.phase === 'retry'
      ? 'Try again'
      : 'Submit';

  const canSkip = session.type === 'learning' && session.phase === 'question' && !locked;
  const stageLabel = window.KS2Spelling.stageLabel(currentCard.progressStage || 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Session header */}
      <Panel padded={false} style={{ overflow: 'hidden' }}>
        <div style={{
          padding: '14px 22px', background: accentTint,
          borderBottom: `1px solid ${subject.accentSoft}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip tone="accent" style={{ accent, accentTint: '#fff' }}>{session.label}</Chip>
            <Chip tone="neutral">{currentCard.word.yearLabel}</Chip>
            <Chip tone="neutral">{stageLabel}</Chip>
            {session.fallbackToSmart && <Chip tone="warn">No trouble words yet · running Smart</Chip>}
          </div>
          <Btn variant="ghost" icon="back" size="sm" onClick={handleEnd}>End session</Btn>
        </div>
        <div style={{ padding: '12px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 12.5, color: TOKENS.muted, fontWeight: 600,
          }}>
            <span>{progressLabel}</span>
            <span>{Math.round((progressValue / Math.max(1, total)) * 100)}%</span>
          </div>
          <ProgressBar value={progressValue} max={total} accent={accent} />
        </div>
      </Panel>

      {/* Word card */}
      <Panel padded={false} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '28px 32px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn
              variant="accent"
              accent={accent}
              icon="volume"
              onClick={() => playAudio(false)}
            >
              Play word
            </Btn>
            <Btn
              variant="secondary"
              icon="volume"
              onClick={() => playAudio(true)}
            >
              Play slowly
            </Btn>
            {session.type === 'learning' && (
              <span style={{ fontSize: 12.5, color: TOKENS.muted }}>
                Family hidden during live recall.
              </span>
            )}
          </div>

          <div style={{
            padding: '18px 20px',
            background: TOKENS.panelSoft,
            border: `1px solid ${TOKENS.line}`,
            borderRadius: TOKENS.radiusSm,
            fontSize: 19, lineHeight: 1.55,
            fontFamily: TOKENS.fontSerif,
            color: TOKENS.ink,
            minHeight: 60,
          }}>
            {showCloze
              ? currentCard.prompt.cloze
              : 'Use the audio buttons to hear the word and sentence.'}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={placeholder}
              readOnly={locked || busy}
              aria-label="Type the spelling"
              autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
              style={{
                padding: '14px 16px',
                fontSize: 18,
                fontFamily: TOKENS.fontMono,
                color: TOKENS.ink,
                background: TOKENS.panel,
                border: `2px solid ${
                  feedback && feedback.kind === 'error' ? TOKENS.bad
                  : feedback && feedback.kind === 'success' ? TOKENS.good
                  : feedback && feedback.kind === 'info' ? accent
                  : TOKENS.line
                }`,
                borderRadius: TOKENS.radiusSm,
                transition: 'border-color 0.15s ease',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {canSkip && (
                  <Btn variant="ghost" icon="back" size="md" onClick={handleSkip}>Skip for now</Btn>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn
                  type="submit"
                  variant="primary"
                  accent={accent}
                  iconRight="next"
                  disabled={locked || busy}
                >
                  {busy ? 'Working…' : submitLabel}
                </Btn>
              </div>
            </div>
          </form>

          {feedback && <FeedbackBanner feedback={feedback} />}
        </div>
      </Panel>
    </div>
  );
}

function FeedbackBanner({ feedback }) {
  const palette = feedback.kind === 'success'
    ? { bg: TOKENS.goodSoft, fg: TOKENS.good, bd: '#B9E3CC' }
    : feedback.kind === 'error'
      ? { bg: TOKENS.badSoft,  fg: TOKENS.bad,  bd: '#F3C4C1' }
      : { bg: TOKENS.warnSoft, fg: TOKENS.warn, bd: '#F0D8A8' };
  return (
    <div
      role="status"
      style={{
        padding: '14px 18px',
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.bd}`,
        borderRadius: TOKENS.radiusSm,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{feedback.headline}</div>
      {feedback.answer && (
        <div style={{
          fontFamily: TOKENS.fontSerif,
          fontSize: 28,
          fontWeight: 800,
          color: TOKENS.ink,
          letterSpacing: '-0.01em',
        }}>
          {feedback.answer}
        </div>
      )}
      {feedback.body && (
        <div style={{ fontSize: 13.5, color: TOKENS.ink2, lineHeight: 1.5 }}>{feedback.body}</div>
      )}
      {feedback.footer && (
        <div style={{ fontSize: 12.5, color: TOKENS.muted, lineHeight: 1.5 }}>{feedback.footer}</div>
      )}
      {Array.isArray(feedback.familyWords) && feedback.familyWords.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {feedback.familyWords.map(w => (
            <span key={w} style={{
              padding: '3px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700,
              background: '#fff', color: TOKENS.ink2, border: `1px solid ${TOKENS.line}`,
              fontFamily: TOKENS.fontMono,
            }}>{w}</span>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { SpellingGame, FeedbackBanner });
