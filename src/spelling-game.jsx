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
  const Engine = window.SpellingEngine;
  const TTS = window.KS2_TTS;
  const MonsterEngine = window.MonsterEngine;
  const profileId = (profile && profile.id) || 'default';

  // The engine mutates the session object in place, so we keep it in a ref.
  const sessionRef = React.useRef(initialSession);

  const [cardState, setCardState] = React.useState(() => {
    const advance = Engine.advanceCard(sessionRef.current, profileId);
    return {
      done: advance.done,
      slug: advance.slug,
      word: advance.word,
      prompt: advance.prompt,
      phase: sessionRef.current.phase,
    };
  });
  const [typed, setTyped] = React.useState('');
  const [feedback, setFeedback] = React.useState(null);
  const [locked, setLocked] = React.useState(false);
  const inputRef = React.useRef(null);
  const advanceTimerRef = React.useRef(null);

  const showCloze = sessionOpts && sessionOpts.showCloze !== false;
  const autoSpeak = sessionOpts && sessionOpts.autoSpeak !== false;
  const session = sessionRef.current;

  // Auto-speak whenever a new card arrives. Also warm up the next card's
  // audio so remote TTS is ready by the time we get there.
  React.useEffect(() => {
    if (!cardState.word || cardState.done) return;
    inputRef.current && inputRef.current.focus();
    if (!autoSpeak || !TTS || !TTS.isReady || !TTS.isReady()) return;
    const timer = window.setTimeout(() => {
      TTS.speak({ word: cardState.word, sentence: cardState.prompt.sentence });
      const nextSlug = session.queue[0];
      if (nextSlug) {
        TTS.warmup({
          word: Engine.wordBySlug(nextSlug),
          sentence: Engine.peekPromptSentence(session, nextSlug),
        });
      }
    }, 120);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardState.slug, cardState.phase, autoSpeak]);

  React.useEffect(() => () => {
    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    if (TTS && TTS.stop) TTS.stop();
  }, []);

  function playAudio(slow) {
    if (!cardState.word || !TTS) return;
    TTS.speak({
      word: cardState.word,
      sentence: cardState.prompt.sentence,
      slow: Boolean(slow),
    });
  }

  function advance(delayMs) {
    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = window.setTimeout(() => {
      const next = Engine.advanceCard(session, profileId);
      if (next.done) {
        const summary = Engine.finalise(session);
        onEnd && onEnd(summary);
        return;
      }
      setCardState({
        done: false,
        slug: next.slug,
        word: next.word,
        prompt: next.prompt,
        phase: session.phase,
      });
      setTyped('');
      setFeedback(null);
      setLocked(false);
    }, delayMs != null ? delayMs : 500);
  }

  function emitMonsterIfNeeded(outcome) {
    if (!outcome || !outcome.justMastered || !MonsterEngine || !onMonsterEvent) return;
    const monsterId = Engine.monsterForWord(cardState.word);
    const event = MonsterEngine.recordMastery(profileId, monsterId, cardState.word.slug);
    if (event) onMonsterEvent(event);
  }

  function applyResult(result, opts) {
    if (!result) return;
    if (result.empty) return;

    setFeedback(result.feedback || null);
    emitMonsterIfNeeded(result.outcome);

    if (result.nextAction === 'advance') {
      setLocked(true);
      advance(opts && opts.delayMs);
      return;
    }

    // retype → same word, new phase, clear input, refocus.
    setCardState(prev => ({ ...prev, phase: session.phase }));
    setTyped('');
    setLocked(false);
    window.setTimeout(() => { inputRef.current && inputRef.current.focus(); }, 0);

    // After a wrong submit in question phase the legacy plays slow audio.
    if (result.phase === 'retry' && autoSpeak && TTS && TTS.isReady && TTS.isReady()) {
      window.setTimeout(() => {
        TTS.speak({ word: cardState.word, sentence: cardState.prompt.sentence, slow: true });
      }, 140);
    }
  }

  function handleSubmit(event) {
    if (event) event.preventDefault();
    if (locked || !cardState.word) return;
    const isTest = session.type === 'test';
    const result = isTest
      ? Engine.submitTest(session, profileId, typed)
      : Engine.submitLearning(session, profileId, typed);
    applyResult(result, { delayMs: isTest ? 320 : 500 });
  }

  function handleSkip() {
    if (locked || session.type === 'test' || session.phase !== 'question') return;
    Engine.skipCurrent(session);
    setFeedback({
      kind: 'info',
      headline: 'Skipped for now.',
      body: 'This word will come back again later in the round.',
    });
    setLocked(true);
    advance(280);
  }

  function handleEnd() {
    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    if (TTS && TTS.stop) TTS.stop();
    const summary = Engine.finalise(session);
    onEnd && onEnd(summary);
  }

  if (cardState.done || !cardState.word) return null;

  const accent = (subject && subject.accent) || TOKENS.ink;
  const accentTint = (subject && subject.accentTint) || TOKENS.lineSoft;

  const total = session.uniqueWords.length;
  const progressValue = session.type === 'test'
    ? session.results.length
    : Object.values(session.status).filter(info => info.done).length;
  const checked = session.type === 'test'
    ? session.results.length
    : Object.values(session.status).filter(info => info.attempts > 0).length;
  const wrongCount = session.type === 'test'
    ? session.results.filter(r => !r.correct).length
    : Object.values(session.status).filter(info => info.hadWrong).length;
  const progressLabel = session.type === 'test'
    ? `${Math.min(session.results.length + 1, total)} of ${total} test words`
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
  const stageLabel = Engine.stageLabel(Engine.getProgress(profileId, cardState.slug).stage);

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
            <Chip tone="neutral">{cardState.word.yearLabel}</Chip>
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
              ? cardState.prompt.cloze
              : 'Use the audio buttons to hear the word and sentence.'}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={placeholder}
              readOnly={locked}
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
                outline: 'none',
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
                  disabled={locked}
                >
                  {submitLabel}
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
