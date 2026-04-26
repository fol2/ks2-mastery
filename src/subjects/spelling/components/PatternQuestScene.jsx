import React from 'react';
import { useSubmitLock } from '../../../platform/react/use-submit-lock.js';
import {
  spellingSessionContextNote,
  spellingSessionFooterNote,
  spellingSessionInfoChips,
  spellingSessionInputPlaceholder,
  spellingSessionSubmitLabel,
} from '../session-ui.js';
import {
  SPELLING_PERSISTENCE_WARNING_COPY,
  SPELLING_PERSISTENCE_WARNING_REASON,
} from '../service-contract.js';
import { ArrowRightIcon, SpeakerIcon, SpeakerSlowIcon } from './spelling-icons.jsx';
import {
  AnimatedPromptCard,
  FeedbackSlot,
  spellingAnswerInputProps,
} from './SpellingCommon.jsx';
import { SpellingHeroBackdrop } from './SpellingHeroBackdrop.jsx';
import {
  heroBgForSession,
  heroBgStyle,
  renderAction,
  renderFormAction,
} from './spelling-view-model.js';

/**
 * P2 U11: Pattern Quest scene.
 *
 * Renders a single 5-card Pattern Quest round. The scene branches on
 * `session.patternQuestCard.type` to render one of:
 *   - `spell`          — audio prompt + typed answer (shared shape with
 *                        Guardian + Boss).
 *   - `classify`       — show the target word, pick the pattern from a
 *                        3-choice multiple-choice list.
 *   - `detect-error`   — show a misspelling, type the correct form. H5:
 *                        input defaults empty; typing the misspelling
 *                        back verbatim is NOT a wobble (gentle re-prompt).
 *   - `explain`        — multiple-choice "why does this word end …".
 *
 * Layout inherits the shared `.card` / `.section-title` / `.feedback`
 * styles that Guardian + Boss already use. A progress indicator shows
 * "Card X of 5 • Pattern: <title>" WITHOUT slot-machine dynamics —
 * it is a static label, never animating a roll.
 */
export function PatternQuestScene({
  learner,
  service,
  ui,
  accent,
  actions,
  previousHeroBg = '',
  runtimeReadOnly = false,
}) {
  const session = ui.session;
  const questCard = session?.patternQuestCard || null;
  if (!session || !questCard) {
    return (
      <section className="card" style={{ gridColumn: '1/-1' }}>
        <div className="eyebrow">No active Pattern Quest</div>
        <h2 className="section-title">Start a Pattern Quest</h2>
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

  const cardType = questCard.type;
  const progress = session.patternQuestProgress || { index: 0, total: 5, patternTitle: questCard.patternTitle };
  const awaitingAdvance = Boolean(ui.awaitingAdvance);
  const pendingCommand = ui.pendingCommand || '';
  const pending = Boolean(pendingCommand);
  const submitLock = useSubmitLock();
  const submitLabel = spellingSessionSubmitLabel(session, awaitingAdvance);
  const effectiveSubmitLabel = pendingCommand === 'submit-answer' ? 'Checking...' : submitLabel;
  const inputPlaceholder = spellingSessionInputPlaceholder(session);
  const contextNote = spellingSessionContextNote(session);
  const footerNote = spellingSessionFooterNote(session);
  const infoChips = spellingSessionInfoChips(session);
  const heroBg = heroBgForSession(learner.id, session, { awaitingAdvance });

  const persistenceWarning = ui.feedback?.persistenceWarning || null;
  const persistenceWarningCopy = persistenceWarning
    ? (persistenceWarning.reason === SPELLING_PERSISTENCE_WARNING_REASON.STORAGE_SAVE_FAILED
      ? SPELLING_PERSISTENCE_WARNING_COPY.STORAGE_SAVE_FAILED
      : SPELLING_PERSISTENCE_WARNING_COPY.STORAGE_SAVE_FAILED)
    : '';

  // Deterministic card-type-specific prompt copy. Lives inline rather than
  // in session-ui.js because the copy is tightly coupled to the JSX layout
  // — it gets rendered alongside the quest pattern title.
  let promptInstr = '';
  if (cardType === 'spell') {
    promptInstr = 'Spell the word you hear.';
  } else if (cardType === 'classify') {
    promptInstr = `Which pattern does this word belong to?`;
  } else if (cardType === 'detect-error') {
    promptInstr = 'Spot the mistake. Type the correct spelling.';
  } else if (cardType === 'explain') {
    promptInstr = `Why does "${questCard.word}" follow this pattern?`;
  }

  const inputKey = [
    session.id,
    progress.index,
    cardType,
    awaitingAdvance ? 'locked' : 'active',
  ].join(':');

  const isTypedCard = cardType === 'spell' || cardType === 'detect-error';
  const isChoiceCard = cardType === 'classify' || cardType === 'explain';
  const choices = Array.isArray(questCard.choices) ? questCard.choices : [];
  const showReplayRow = cardType === 'spell';

  return (
    <div className="spelling-in-session pattern-quest-scene" style={{ gridColumn: '1/-1', ...heroBgStyle(heroBg) }}>
      <SpellingHeroBackdrop url={heroBg} previousUrl={previousHeroBg} />
      <div className="session">
        <header className="session-head">
          <div className="eyebrow" data-testid="pattern-quest-progress">
            Card {Math.min(progress.total, progress.index + 1)} of {progress.total}
            <span aria-hidden="true"> · </span>
            Pattern: {progress.patternTitle || questCard.patternTitle || ''}
          </div>
        </header>

        {persistenceWarning ? (
          <div
            className="spelling-persistence-warning"
            role="status"
            aria-live="polite"
            data-testid="spelling-persistence-warning"
          >
            {persistenceWarningCopy}
          </div>
        ) : null}

        <AnimatedPromptCard heightKey={inputKey}>
          {infoChips.length ? (
            <div className="info-chip-row">
              {infoChips.map((value) => <span className="chip" key={value}>{value}</span>)}
            </div>
          ) : null}
          <div className="prompt-instr">{promptInstr}</div>
          <p className="prompt-sentence muted">{contextNote}</p>

          {cardType === 'classify' ? (
            <p className="prompt-word" data-testid="pattern-quest-target-word">{questCard.word}</p>
          ) : null}

          {cardType === 'detect-error' ? (
            <p className="prompt-misspelling" data-testid="pattern-quest-misspelling">
              Shown: <strong>{questCard.misspelling}</strong>
            </p>
          ) : null}

          <form
            data-action="spelling-submit-form"
            className="session-form"
            onSubmit={(event) => renderFormAction(actions, event, 'spelling-submit-form')}
          >
            {isTypedCard ? (
              <div className="word-input-wrap">
                <input
                  key={inputKey}
                  className="word-input"
                  name="typed"
                  data-autofocus="true"
                  {...spellingAnswerInputProps}
                  placeholder={inputPlaceholder}
                  aria-label="Type the spelling"
                  defaultValue=""
                  disabled={awaitingAdvance || runtimeReadOnly || pending}
                />
              </div>
            ) : null}

            {isChoiceCard ? (
              <fieldset className="pattern-quest-choice-group" data-testid="pattern-quest-choices">
                <legend className="visually-hidden">Choose an option</legend>
                {choices.map((choice, idx) => (
                  <label
                    className="pattern-quest-choice"
                    key={choice.id}
                    data-testid={`pattern-quest-choice-${choice.id}`}
                  >
                    <input
                      type="radio"
                      name="typed"
                      value={choice.id}
                      defaultChecked={idx === 0 && false}
                      disabled={awaitingAdvance || runtimeReadOnly || pending}
                    />
                    <span className="pattern-quest-choice-label">{choice.label}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}

            {showReplayRow ? (
              <div className="audio-row">
                <button
                  type="button"
                  className="btn icon lg"
                  aria-label="Replay the dictated word"
                  data-action="spelling-replay"
                  disabled={runtimeReadOnly}
                  onClick={(event) => renderAction(actions, event, 'spelling-replay')}
                >
                  <SpeakerIcon />
                </button>
                <button
                  type="button"
                  className="btn icon lg"
                  aria-label="Replay slowly"
                  data-action="spelling-replay-slow"
                  disabled={runtimeReadOnly}
                  onClick={(event) => renderAction(actions, event, 'spelling-replay-slow')}
                >
                  <SpeakerSlowIcon />
                </button>
              </div>
            ) : null}

            <div className="action-row">
              <button
                className="btn primary lg"
                style={{ '--btn-accent': accent }}
                type="submit"
                disabled={awaitingAdvance || runtimeReadOnly || pending}
              >
                {effectiveSubmitLabel}{awaitingAdvance || pending ? null : <> <ArrowRightIcon /></>}
              </button>
              {awaitingAdvance ? (
                <button
                  className="btn good lg"
                  type="button"
                  data-action="spelling-continue"
                  disabled={runtimeReadOnly || pending || submitLock.locked}
                  onClick={(event) => {
                    submitLock.run(async () => renderAction(actions, event, 'spelling-continue'));
                  }}
                >
                  Continue <ArrowRightIcon />
                </button>
              ) : null}
            </div>
          </form>

          <FeedbackSlot feedback={ui.feedback} reserveSpace />
        </AnimatedPromptCard>

        <footer className="session-footer">
          <div className="session-footer-left">
            <div className="voice-note small muted">{footerNote}</div>
          </div>
          <div className="session-footer-right">
            <button
              className="btn sm bad"
              type="button"
              data-action="spelling-end-early"
              disabled={runtimeReadOnly || pending}
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
