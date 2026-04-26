import React from 'react';
import { useSubmitLock } from '../../../platform/react/use-submit-lock.js';
import {
  spellingSessionContextNote,
  spellingSessionInfoChips,
  spellingSessionInputPlaceholder,
  spellingSessionSkipLabel,
  spellingSessionSubmitLabel,
  spellingSessionVoiceNote,
} from '../session-ui.js';
import {
  SPELLING_DURABLE_PERSISTENCE_WARNING_COPY,
} from '../service-contract.js';
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

export function SpellingSessionScene({
  learner,
  service,
  ui,
  accent,
  actions,
  previousHeroBg = '',
  runtimeReadOnly = false,
  // P2 U9: durable persistence-warning sibling threaded from
  // `buildSpellingContext`. When non-null AND `!acknowledged` the banner
  // renders across sessions; the "I understand" button dispatches
  // `spelling-acknowledge-persistence-warning` which sets
  // `acknowledged: true` on the persisted record (data is retained for
  // audit). A subsequent new failure overwrites `acknowledged: false` and
  // re-surfaces the banner.
  persistenceWarning = null,
}) {
  const prefs = service.getPrefs(learner.id);
  const session = ui.session;
  const card = session?.currentCard;
  if (!session || !card) {
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

  // U5 / R5: Guardian sessions never surface the cloze hint even when the
  // learner's `prefs.showCloze` is true. The hint is a scaffolding
  // affordance for learning — Guardian is a retrieval check on Mega words
  // that already live in the Vault, so a hint would leak the very answer
  // the round is supposed to prove. `session.type === 'test'` already
  // covers SATs Test (and Boss via its `type: 'test'` override in U9), so
  // the only new branch here is `session.mode === 'guardian'`.
  const showCloze = prefs.showCloze && session.type !== 'test' && session.mode !== 'guardian';
  const awaitingAdvance = Boolean(ui.awaitingAdvance);
  const pendingCommand = ui.pendingCommand || '';
  const pending = Boolean(pendingCommand);
  // SH2-U1: JSX-layer belt-and-braces for non-destructive action buttons.
  // Submit is already guarded by `pendingCommand` (and adapter-layer
  // pendingKeys); the hook sits ON TOP of that so a fast double-click or
  // mobile double-tap on Continue / Skip gets early-returned BEFORE the
  // adapter round-trips `pendingCommand` back to the JSX. The hook is
  // NOT applied to End-round-early: that path routes through
  // `globalThis.confirm()` and is covered by the destructive-action
  // confirm contract test.
  const submitLock = useSubmitLock();
  const submitLabel = spellingSessionSubmitLabel(session, awaitingAdvance);
  const effectiveSubmitLabel = pendingCommand === 'submit-answer' ? 'Checking...' : submitLabel;
  const inputPlaceholder = spellingSessionInputPlaceholder(session);
  const contextNote = spellingSessionContextNote(session);
  const voiceNote = spellingSessionVoiceNote();
  const skipLabel = spellingSessionSkipLabel(session);
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
  // SH2-U3 input preservation contract: `pendingCommand` is DELIBERATELY
  // absent from this key. When a 401 mid-command clears `pendingCommand`
  // (via the auth-required path or SH2-U2's `sanitiseUiOnRehydrate`), the
  // React tree keeps the same `key` for this scene's `<input name="typed">`,
  // so the uncontrolled input DOM node is retained and its typed value
  // survives the re-bootstrap. Adding `pendingCommand` or any auth-derived
  // state here would regress the contract enforced by
  // `tests/demo-expiry-banner.test.js::input-preservation`.
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

  // P2 U9: storage-failure warning surface migrated from the session-scoped
  // `feedback.persistenceWarning` to the durable `data.persistenceWarning`
  // sibling. The service writes `{ reason, occurredAt, acknowledged: false }`
  // on any `saveJson` failure via `PersistenceSetItemError`; the banner
  // renders until the learner clicks "I understand" (dispatches
  // `spelling-acknowledge-persistence-warning`, sets `acknowledged: true`).
  // Mega is never demoted on any failure path.
  //
  // Accepted the P1.5 U8 gap: the previous session-scoped warning died on
  // tab close. The durable sibling now survives, so a learner who closes
  // the tab mid-failure still sees the banner on their next visit.
  //
  // Review fix: banner copy is sourced from
  // `SPELLING_DURABLE_PERSISTENCE_WARNING_COPY` in service-contract.js so a
  // single edit updates every site. The reason key is the enum from
  // `SPELLING_PERSISTENCE_WARNING_REASON` — the durable-record normaliser
  // guarantees the reason is one of the allow-listed values, so the copy
  // map always resolves.
  // Reviewer-feedback fix (PR #279 LOW): the previous ternary had identical
  // branches — a dead-code placeholder for when future reasons are added.
  // Use a forward-compatible lookup so adding a new reason is just a key in
  // `SPELLING_DURABLE_PERSISTENCE_WARNING_COPY` plus (optionally) the enum;
  // no edit to the scenes is required. Fall back to STORAGE_SAVE_FAILED
  // copy if the reason is absent from the map (defensive: the normaliser
  // guarantees the reason is allow-listed but we keep the fallback so a
  // future map-edit mistake does not blank the banner).
  const showPersistenceBanner = persistenceWarning && !persistenceWarning.acknowledged;
  const persistenceWarningCopy = showPersistenceBanner
    ? (SPELLING_DURABLE_PERSISTENCE_WARNING_COPY[persistenceWarning.reason]
      ?? SPELLING_DURABLE_PERSISTENCE_WARNING_COPY.STORAGE_SAVE_FAILED)
    : '';

  return (
    <div className={sessionClasses.join(' ')} style={{ gridColumn: '1/-1', ...heroBgStyle(heroBg) }}>
      <SpellingHeroBackdrop url={heroBg} previousUrl={previousHeroBg} />
      <div className="session">
        <header className="session-head">
          <PathProgress done={pathDone} current={pathCurrent} total={progressTotal} />
          <span className="path-count">Word {progressCurrent} of {progressTotal}</span>
        </header>

        {showPersistenceBanner ? (
          <div
            className="spelling-persistence-warning"
            role="status"
            aria-live="polite"
            data-testid="spelling-persistence-warning"
          >
            <span className="spelling-persistence-warning-text">{persistenceWarningCopy}</span>
            <button
              type="button"
              className="spelling-persistence-warning-ack"
              data-action="spelling-acknowledge-persistence-warning"
              onClick={(event) => renderAction(actions, event, 'spelling-acknowledge-persistence-warning')}
            >
              I understand
            </button>
          </div>
        ) : null}

        <AnimatedPromptCard heightKey={questionLayoutKey} lockHeightToKey>
          {infoChips.length ? (
            <div className="info-chip-row">
              {infoChips.map((value) => <span className="chip" key={value}>{value}</span>)}
            </div>
          ) : null}
          <div className="prompt-instr">{promptInstr}</div>
          {showCloze ? (
            <Cloze sentence={card.prompt?.cloze} answer={ui.feedback?.answer || ''} revealAnswer={showingCorrection} />
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
                disabled={awaitingAdvance || runtimeReadOnly || pending}
              />
            </div>
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
            <div className="action-row">
              <button className="btn primary lg" style={{ '--btn-accent': accent }} type="submit" disabled={awaitingAdvance || runtimeReadOnly || pending}>
                {effectiveSubmitLabel}{awaitingAdvance || pending ? null : <> <ArrowRightIcon /></>}
              </button>
              {awaitingAdvance ? (
                <button
                  className="btn good lg"
                  type="button"
                  data-action="spelling-continue"
                  disabled={runtimeReadOnly || pending || submitLock.locked}
                  onClick={(event) => {
                    // SH2-U1: the hook's `run()` flips `pendingRef.current`
                    // synchronously before awaiting, so a second click fired
                    // in the same microtask tick returns `undefined` without
                    // invoking `renderAction` a second time. `renderAction`
                    // runs inside `run(fn)` so the synchronous side effects
                    // (event.preventDefault, action dispatch, flow-transition
                    // start) still observe the live React synthetic event.
                    submitLock.run(async () => renderAction(actions, event, 'spelling-continue', {
                      flowTransition: isCompletingRound,
                    }));
                  }}
                >
                  Continue <ArrowRightIcon />
                </button>
              ) : null}
              {session.type !== 'test' && !awaitingAdvance && session.phase === 'question' ? (
                <button
                  className="btn ghost lg"
                  type="button"
                  data-action="spelling-skip"
                  disabled={runtimeReadOnly || pending || submitLock.locked}
                  onClick={(event) => {
                    submitLock.run(async () => renderAction(actions, event, 'spelling-skip'));
                  }}
                >
                  {skipLabel}
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
