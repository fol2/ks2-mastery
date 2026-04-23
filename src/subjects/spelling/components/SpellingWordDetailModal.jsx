import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightIcon, SpeakerIcon, SpeakerSlowIcon } from './spelling-icons.jsx';
import { Cloze, spellingAnswerInputProps } from './SpellingCommon.jsx';
import {
  buildDrillCloze,
  renderAction,
  renderFormAction,
  spellingPoolContextLabel,
} from './spelling-view-model.js';

function ExplainBody({ word }) {
  const sentence = (word.sentence || '').replace(/________/g, word.word);
  const variants = Array.isArray(word.variants) ? word.variants.filter((variant) => variant?.word) : [];
  return (
    <div className="wb-modal-body">
      <div className="wb-modal-section">
        <p className="wb-modal-section-label">What it means</p>
        {word.explanation
          ? <p className="wb-modal-def">{word.explanation}</p>
          : <p className="wb-modal-def">No meaning note on file for this word yet.</p>}
      </div>
      <div className="wb-modal-section">
        <p className="wb-modal-section-label">Example sentence</p>
        {sentence
          ? <blockquote className="wb-modal-sample">{sentence}</blockquote>
          : <p className="wb-modal-def">No example sentence on file for this word yet.</p>}
      </div>
      {variants.length ? (
        <div className="wb-modal-section">
          <p className="wb-modal-section-label">Word-family variants</p>
          <div className="wb-variant-list">
            {variants.map((variant) => {
              const variantSentence = (variant.sentence || '').replace(/________/g, variant.word);
              return (
                <div className="wb-variant-row" key={variant.word}>
                  <strong className="wb-variant-word">{variant.word}</strong>
                  {variant.explanation ? <p className="wb-modal-def">{variant.explanation}</p> : null}
                  {variantSentence ? <blockquote className="wb-modal-sample">{variantSentence}</blockquote> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DrillBody({ word, typed, result, accent, actions }) {
  const [draftTyped, setDraftTyped] = React.useState(typed || '');
  const [draftResult, setDraftResult] = React.useState(result);
  const sentence = word.sentence || '';
  const drillCloze = sentence ? buildDrillCloze(sentence, word) : '';
  React.useEffect(() => {
    setDraftTyped(typed || '');
    setDraftResult(result);
  }, [result, typed, word.slug]);
  const showFeedback = draftResult === 'correct' || draftResult === 'incorrect';
  const feedbackTone = draftResult === 'correct' ? 'good' : 'warn';
  const inputState = draftResult === 'correct' ? 'is-correct' : draftResult === 'incorrect' ? 'is-wrong' : '';

  return (
    <div className="wb-modal-body">
      <div className="wb-modal-section">
        <p className="wb-modal-section-label">{sentence ? 'Listen to the sentence, then type the missing word' : 'Listen to the word, then type it'}</p>
        {sentence ? (
          <p className="wb-drill-sentence">
            <Cloze sentence={drillCloze} answer={word.word} revealAnswer={draftResult === 'correct'} />
          </p>
        ) : null}
      </div>
      <div className="wb-drill-audio">
        <button
          type="button"
          className="wb-drill-audio-btn"
          data-action="spelling-word-bank-drill-replay"
          data-slug={word.slug}
          aria-label="Replay the word"
          onClick={(event) => renderAction(actions, event, 'spelling-word-bank-drill-replay', { slug: word.slug })}
        >
          <SpeakerIcon />
          <span className="wb-drill-audio-label">Replay</span>
        </button>
        <button
          type="button"
          className="wb-drill-audio-btn slow"
          data-action="spelling-word-bank-drill-replay-slow"
          data-slug={word.slug}
          aria-label="Replay slowly"
          onClick={(event) => renderAction(actions, event, 'spelling-word-bank-drill-replay-slow', { slug: word.slug })}
        >
          <SpeakerSlowIcon />
          <span className="wb-drill-audio-label">Slowly</span>
        </button>
      </div>
      <form
        className="wb-drill-form"
        data-action="spelling-word-bank-drill-submit"
        data-slug={word.slug}
        onSubmit={(event) => renderFormAction(actions, event, 'spelling-word-bank-drill-submit', { slug: word.slug })}
      >
        <input
          type="text"
          name="typed"
          className={`wb-drill-input ${inputState}`.trim()}
          {...spellingAnswerInputProps}
          placeholder="Type the word…"
          value={draftTyped}
          data-autofocus="true"
          data-action="spelling-word-bank-drill-input"
          aria-label="Type the drill word"
          disabled={draftResult === 'correct'}
          onChange={(event) => {
            setDraftTyped(event.currentTarget.value.slice(0, 80));
            if (draftResult !== 'correct') setDraftResult(null);
          }}
        />
        <button type="submit" className="btn primary" style={{ '--btn-accent': accent }} disabled={draftResult === 'correct'}>
          Check <ArrowRightIcon />
        </button>
      </form>
      {showFeedback ? (
        <div className={`wb-drill-feedback ${feedbackTone}`} role="status">
          <span className="wb-drill-feedback-icon" aria-hidden="true">{draftResult === 'correct' ? '✓' : '!'}</span>
          <div>
            {draftResult === 'correct'
              ? <><b>Nice — "{word.word}" is spot on.</b> Browse on, or try another word.</>
              : <><b>Close — the word is "{word.word}".</b> Listen again and have another go.</>}
          </div>
        </div>
      ) : null}
      <div className="wb-modal-actions">
        {draftResult ? (
          <>
            <button
              type="button"
              className="btn ghost"
              data-action="spelling-word-detail-mode"
              data-value="explain"
              data-slug={word.slug}
              onClick={(event) => renderAction(actions, event, 'spelling-word-detail-mode', { value: 'explain', slug: word.slug })}
            >
              Back to explainer
            </button>
            <button
              type="button"
              className={draftResult === 'correct' ? 'btn primary' : 'btn ghost'}
              style={draftResult === 'correct' ? { '--btn-accent': accent } : undefined}
              data-action="spelling-word-bank-drill-try-again"
              data-slug={word.slug}
              onClick={(event) => renderAction(actions, event, 'spelling-word-bank-drill-try-again', { slug: word.slug })}
            >
              Try again {draftResult === 'correct' ? <ArrowRightIcon /> : null}
            </button>
          </>
        ) : null}
      </div>
      <p className="wb-modal-note">Drilling here never writes to the scheduler — it's a free practice tool.</p>
    </div>
  );
}

export function SpellingWordDetailModal({ word, mode = 'explain', typed = '', result = null, accent, actions }) {
  if (!word) return null;
  const safeMode = mode === 'drill' ? 'drill' : 'explain';
  const closeFromScrim = (event) => {
    if (event.target?.closest?.('.wb-modal')) return;
    renderAction(actions, event, 'spelling-word-detail-close');
  };

  const modal = (
    <div className="wb-modal-scrim" role="dialog" aria-modal="true" aria-labelledby="wb-modal-word" onClick={closeFromScrim}>
      <div className="wb-modal-backdrop" tabIndex="-1" aria-hidden="true" />
      <div className="wb-modal" data-slug={word.slug}>
        <header className="wb-modal-head">
          <div className="wb-modal-head-main">
            {safeMode === 'drill' ? (
              <span className="wb-modal-speaker muted" aria-hidden="true"><SpeakerIcon /></span>
            ) : (
              <button
                type="button"
                className="wb-modal-speaker"
                data-action="spelling-word-bank-word-replay"
                data-slug={word.slug}
                aria-label="Replay the word"
                onClick={(event) => renderAction(actions, event, 'spelling-word-bank-word-replay', { slug: word.slug })}
              >
                <SpeakerIcon />
              </button>
            )}
            <div>
              <p className="wb-modal-eyebrow">{spellingPoolContextLabel(word)}</p>
              {safeMode === 'drill'
                ? <h2 id="wb-modal-word" className="wb-modal-word wb-modal-word-prompt">Listen, then spell the missing word.</h2>
                : <h2 id="wb-modal-word" className="wb-modal-word">{word.word}</h2>}
            </div>
          </div>
          <button
            type="button"
            className="wb-modal-close"
            data-action="spelling-word-detail-close"
            aria-label="Close"
            onClick={(event) => renderAction(actions, event, 'spelling-word-detail-close')}
          >
            ×
          </button>
        </header>
        <div className="wb-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`wb-modal-tab${safeMode === 'explain' ? ' on' : ''}`}
            aria-selected={safeMode === 'explain' ? 'true' : 'false'}
            data-action="spelling-word-detail-mode"
            data-value="explain"
            data-slug={word.slug}
            onClick={(event) => renderAction(actions, event, 'spelling-word-detail-mode', { value: 'explain', slug: word.slug })}
          >
            Explain
          </button>
          <button
            type="button"
            role="tab"
            className={`wb-modal-tab${safeMode === 'drill' ? ' on' : ''}`}
            aria-selected={safeMode === 'drill' ? 'true' : 'false'}
            data-action="spelling-word-detail-mode"
            data-value="drill"
            data-slug={word.slug}
            onClick={(event) => renderAction(actions, event, 'spelling-word-detail-mode', { value: 'drill', slug: word.slug })}
          >
            Drill
          </button>
        </div>
        {safeMode === 'drill'
          ? <DrillBody word={word} typed={typed} result={result} accent={accent} actions={actions} />
          : <ExplainBody word={word} />}
      </div>
    </div>
  );

  if (typeof document === 'undefined' || !document.body) return modal;
  return createPortal(modal, document.body);
}
