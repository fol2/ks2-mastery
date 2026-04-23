import React from 'react';
import {
  spellingSessionContextNote,
  spellingSessionInfoChips,
  spellingSessionInputPlaceholder,
  spellingSessionSubmitLabel,
  spellingSessionVoiceNote,
} from '../session-ui.js';
import { ArrowRightIcon, SpeakerIcon, SpeakerSlowIcon } from './spelling-icons.jsx';
import {
  AnimatedPromptCard,
  Cloze,
  FeedbackSlot,
  PathProgress,
  spellingAnswerInputProps,
} from './SpellingCommon.jsx';
import { SpellingHeroBackdrop } from './SpellingHeroBackdrop.jsx';
import {
  SPELLING_SESSION_QUESTION_REVEAL_MS,
  shouldDelaySpellingSessionQuestionReveal,
} from '../session-timing.js';
import {
  heroBgForSession,
  heroBgStyle,
  renderAction,
  renderFormAction,
  spellingSessionProgressIndex,
} from './spelling-view-model.js';

export function SpellingSessionScene({ learner, service, ui, accent, actions, previousHeroBg = '' }) {
  const prefs = service.getPrefs(learner.id);
  const session = ui.session;
  const card = session?.currentCard;
  if (!session || !card || !card.word) {
    return (
      <section className="card" style={{ gridColumn: '1/-1' }}>
        <div className="eyebrow">No active session</div>
        <h2 className="section-title">Start a spelling round</h2>
        <button
          className="btn primary"
          type="button"
          style={{ '--btn-accent': accent }}
          data-action="spelling-back"
          onClick={(event) => renderAction(actions, event, 'spelling-back')}
        >
          Back to spelling dashboard
        </button>
      </section>
    );
  }

  const showCloze = prefs.showCloze && session.type !== 'test';
  const awaitingAdvance = Boolean(ui.awaitingAdvance);
  const submitLabel = spellingSessionSubmitLabel(session, awaitingAdvance);
  const inputPlaceholder = spellingSessionInputPlaceholder(session);
  const contextNote = spellingSessionContextNote(session);
  const voiceNote = spellingSessionVoiceNote();
  const infoChips = spellingSessionInfoChips(session);
  const progressTotal = session.progress.total;
  const done = session.progress.done;
  const progressCurrent = progressTotal <= 0
    ? 0
    : spellingSessionProgressIndex(session, { awaitingAdvance });
  const pathDone = Math.min(progressTotal, done);
  const pathCurrent = Math.min(Math.max(progressCurrent - 1, 0), progressTotal);
  const heroBg = heroBgForSession(learner.id, session, { awaitingAdvance });
  const isCompletingRound = awaitingAdvance && progressTotal > 0 && done >= progressTotal;
  const showingCorrection = session.phase === 'correction';
  const promptInstr = session.type === 'test'
    ? 'Type the word dictated by the audio.'
    : 'Spell the word you hear.';
  const inputKey = [
    session.id,
    session.currentSlug,
    session.phase,
    session.promptCount,
    awaitingAdvance ? 'locked' : 'active',
  ].join(':');
  const questionLayoutKey = [
    session.id,
    session.currentSlug,
    session.promptCount,
    session.type,
    showCloze ? 'cloze' : 'context',
  ].join(':');
  const [questionRevealed, setQuestionRevealed] = React.useState(() => !shouldDelaySpellingSessionQuestionReveal());
  React.useEffect(() => {
    if (!shouldDelaySpellingSessionQuestionReveal()) {
      setQuestionRevealed(true);
      return undefined;
    }
    setQuestionRevealed(false);
    const timer = window.setTimeout(() => setQuestionRevealed(true), SPELLING_SESSION_QUESTION_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [session.id]);
  const sessionClasses = ['spelling-in-session'];
  sessionClasses.push(questionRevealed ? 'is-question-revealed' : 'is-entering-session');

  return (
    <div className={sessionClasses.join(' ')} style={{ gridColumn: '1/-1', ...heroBgStyle(heroBg) }}>
      <SpellingHeroBackdrop url={heroBg} previousUrl={previousHeroBg} />
      <div className="session">
        <header className="session-head">
          <PathProgress done={pathDone} current={pathCurrent} total={progressTotal} />
          <span className="path-count">Word {progressCurrent} of {progressTotal}</span>
        </header>

        <AnimatedPromptCard heightKey={questionLayoutKey} lockHeightToKey>
            {infoChips.length ? (
              <div className="info-chip-row">
                {infoChips.map((value) => <span className="chip" key={value}>{value}</span>)}
              </div>
            ) : null}
            <div className="prompt-instr">{promptInstr}</div>
            {showCloze ? (
              <Cloze sentence={card.prompt?.cloze} answer={card.word.word} revealAnswer={showingCorrection} />
            ) : (
              <div className="cloze muted"><span className="blank">{'\u00a0'}</span></div>
            )}
            {!showCloze ? <p className="prompt-sentence muted">{contextNote}</p> : null}

            <form
              data-action="spelling-submit-form"
              className="session-form"
              onSubmit={(event) => renderFormAction(actions, event, 'spelling-submit-form')}
            >
              <div className="word-input-wrap">
                <input
                  key={inputKey}
                  className="word-input"
                  name="typed"
                  data-autofocus="true"
                  {...spellingAnswerInputProps}
                  placeholder={inputPlaceholder}
                  aria-label="Type the spelling"
                  disabled={awaitingAdvance}
                />
              </div>
              <div className="audio-row">
                <button
                  type="button"
                  className="btn icon lg"
                  aria-label="Replay the dictated word"
                  data-action="spelling-replay"
                  onClick={(event) => renderAction(actions, event, 'spelling-replay')}
                >
                  <SpeakerIcon />
                </button>
                <button
                  type="button"
                  className="btn icon lg"
                  aria-label="Replay slowly"
                  data-action="spelling-replay-slow"
                  onClick={(event) => renderAction(actions, event, 'spelling-replay-slow')}
                >
                  <SpeakerSlowIcon />
                </button>
              </div>
              <div className="action-row">
                <button className="btn primary lg" style={{ '--btn-accent': accent }} type="submit" disabled={awaitingAdvance}>
                  {submitLabel}{awaitingAdvance ? null : <> <ArrowRightIcon /></>}
                </button>
                {awaitingAdvance ? (
                  <button
                    className="btn good lg"
                    type="button"
                    data-action="spelling-continue"
                    onClick={(event) => renderAction(actions, event, 'spelling-continue', {
                      flowTransition: isCompletingRound,
                    })}
                  >
                    Continue <ArrowRightIcon />
                  </button>
                ) : null}
                {session.type !== 'test' && !awaitingAdvance && session.phase === 'question' ? (
                  <button
                    className="btn ghost lg"
                    type="button"
                    data-action="spelling-skip"
                    onClick={(event) => renderAction(actions, event, 'spelling-skip')}
                  >
                    Skip for now
                  </button>
                ) : null}
              </div>
            </form>

            <FeedbackSlot feedback={ui.feedback} reserveSpace />
        </AnimatedPromptCard>

        <footer className="session-footer">
          <div className="session-footer-left">
            <div className="keys-hint">
              <kbd>Esc</kbd> replay · <kbd>⇧</kbd>+<kbd>Esc</kbd> slow · <kbd>Alt</kbd>+<kbd>S</kbd> skip · <kbd>Enter</kbd> submit
            </div>
            <div className="voice-note small muted">{voiceNote}</div>
          </div>
          <div className="session-footer-right">
            <button
              className="btn sm bad"
              type="button"
              data-action="spelling-end-early"
              onClick={(event) => renderAction(actions, event, 'spelling-end-early')}
            >
              End round early
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
