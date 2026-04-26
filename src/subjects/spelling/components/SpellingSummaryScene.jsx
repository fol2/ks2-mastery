import React from 'react';
import { ArrowRightIcon, CheckIcon } from './spelling-icons.jsx';
import { AnimatedPromptCard, PathProgress, Ribbon } from './SpellingCommon.jsx';
import { SpellingHeroBackdrop } from './SpellingHeroBackdrop.jsx';
import {
  guardianPracticeActionLabel,
  guardianSummaryCards,
  guardianSummaryCopy,
  heroBgForSession,
  heroBgStyle,
  renderAction,
  summaryHeadline,
  summaryRibbonSub,
} from './spelling-view-model.js';

function SummaryStatGrid({ cards = [] }) {
  return (
    <div className="summary-stats">
      {cards.map((card) => (
        <div className="summary-stat" key={`${card.label}-${card.value}`}>
          <div className="v">{card.value}</div>
          <div className="l">{card.label}</div>
        </div>
      ))}
    </div>
  );
}

// Guardian-specific summary band. Rendered only when `summary.mode === 'guardian'`.
// Visually separated from the regular stat grid by a thin divider + a quiet
// eyebrow so the block reads as "here's the Vault status" rather than just
// "three more metrics". The shape mirrors `SummaryStatGrid` so the cards
// slot into the same responsive grid, but the wrapper class drives its own
// accent treatment without leaking into the legacy shell.
function SummaryGuardianBand({ cards = [] }) {
  if (!cards.length) return null;
  return (
    <section className="summary-guardian-band" aria-label="Vault status">
      <header className="summary-guardian-head">
        <span className="summary-guardian-eyebrow">Vault status</span>
        <span className="summary-guardian-sub" aria-hidden="true">Words you kept alive today</span>
      </header>
      <div className="summary-stats summary-stats--guardian">
        {cards.map((card) => (
          <div className={`summary-stat summary-stat--guardian summary-stat--${card.id}`} key={card.id}>
            <div className="v">{card.value}</div>
            <div className="l">{card.label}</div>
            {card.sub ? <div className="s">{card.sub}</div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

// U10: Boss-specific summary score line. The plan's R13 spec nails this copy
// format exactly — "Boss score: N/M Mega words landed" — and we keep it in
// the scene so a product tweak is a single-file change. The band borrows
// Guardian's `summary-guardian-band` shape (eyebrow + score line) but swaps
// the Vault framing for Boss-specific copy that reinforces the
// Mega-never-revoked invariant the service already baked into
// `summary.message`.
function SummaryBossBand({ summary }) {
  if (!summary) return null;
  const totalWords = Math.max(1, Number(summary.totalWords) || 1);
  const correct = Math.max(0, Math.min(totalWords, Number(summary.correct) || 0));
  return (
    <section className="summary-guardian-band summary-boss-band" aria-label="Boss tally">
      <header className="summary-guardian-head">
        <span className="summary-guardian-eyebrow">Boss tally</span>
        <span className="summary-guardian-sub" aria-hidden="true">Your Mega words stayed Mega</span>
      </header>
      <p className="summary-boss-score">
        Boss score: {correct}/{totalWords} Mega words landed
      </p>
    </section>
  );
}

// U10: Read-only miss-list for Boss summaries. Boss is a test-mode round —
// no retry, no drill-all, no per-word practice. The scene surfaces the
// missed words as static chips so the child can see what slipped, paired
// with a short reassurance that Mega status stays intact. The rendered
// chips deliberately carry no `data-action` attribute, so a future bulk
// regex ("any button that dispatches drill-all") cannot accidentally
// re-introduce drill routing on a Boss summary. The negative regression
// assertions in `tests/spelling-boss.test.js` lock this in.
function SummaryBossMissList({ mistakes = [] }) {
  if (!mistakes.length) return null;
  return (
    <div className="summary-drill summary-drill--boss">
      <div className="summary-drill-head">
        <h4>Words that slipped today</h4>
        <span className="small muted">These stay Mega. Give them a quieter look another day.</span>
      </div>
      <div className="summary-drill-chips">
        {mistakes.map((word) => (
          <span className="fchip fchip--static" key={word.slug}>{word.word}</span>
        ))}
      </div>
    </div>
  );
}

export function SpellingSummaryScene({ learner, ui, accent, actions, postMastery = null, previousHeroBg = '', runtimeReadOnly = false }) {
  const summary = ui.summary;
  if (!summary) return null;
  const pendingCommand = ui.pendingCommand || '';
  const pending = Boolean(pendingCommand);
  const progressTotal = Math.max(1, summary.totalWords || 1);
  const heroBg = heroBgForSession(learner.id, {
    mode: summary.mode,
    progress: { done: progressTotal, total: progressTotal },
  }, { complete: true });
  const toneGood = !summary.mistakes.length;
  const isGuardianSummary = summary.mode === 'guardian';
  // U10: Boss rounds render a dedicated summary branch — no drill-all, no
  // per-word chips, no retry CTAs. The service already rewrites
  // `summary.message` and the "Needs more work" card sub for Boss mode so
  // the stat grid reads correctly; the scene-level branch adds the score
  // line band + read-only miss list alongside that.
  const isBossSummary = summary.mode === 'boss';
  // When we exit a Guardian round the postMastery snapshot reflects the
  // post-advance state — so `nextGuardianDueDay` already tells us when the
  // learner should return. If postMastery is unavailable (e.g. SSR before
  // storage hydrates) we degrade to "—" rather than crashing.
  const guardianCards = isGuardianSummary
    ? guardianSummaryCards({
        summary,
        nextGuardianDueDay: postMastery?.nextGuardianDueDay ?? null,
        todayDay: postMastery?.todayDay ?? null,
      })
    : [];

  return (
    <div className="spelling-in-session summary-shell" style={{ gridColumn: '1/-1', ...heroBgStyle(heroBg) }}>
      <SpellingHeroBackdrop url={heroBg} previousUrl={previousHeroBg} />
      <div className="session summary">
        <header className="session-head">
          <PathProgress done={progressTotal} current={progressTotal} total={progressTotal} />
          <span className="path-count">
            {isGuardianSummary
              ? 'Guardian round complete'
              : isBossSummary
                ? 'Boss round complete'
                : 'Round complete'}
          </span>
        </header>

        <AnimatedPromptCard
          className={`summary-card${isGuardianSummary ? ' summary-card--guardian' : ''}${isBossSummary ? ' summary-card--boss' : ''}`}
          innerClassName="summary-card-inner"
        >
          <h3 className="summary-title sr-only">Session summary</h3>
          <Ribbon
            tone={toneGood ? 'good' : 'warn'}
            icon={toneGood ? <CheckIcon /> : '!'}
            headline={summaryHeadline(summary)}
            sub={summaryRibbonSub(summary)}
          />

          <SummaryStatGrid cards={summary.cards} />

          {isGuardianSummary ? <SummaryGuardianBand cards={guardianCards} /> : null}
          {isBossSummary ? <SummaryBossBand summary={summary} /> : null}

          {isBossSummary ? (
            <SummaryBossMissList mistakes={summary.mistakes} />
          ) : summary.mistakes.length ? (
            isGuardianSummary ? (
              // U3: Guardian summaries replace the legacy "Drill all" + per-word
              // "Drill" chip cluster with a single Practice button. The
              // dispatched action is still `spelling-drill-all` (the module
              // handler branches on `ui.summary.mode === 'guardian'` to force
              // `practiceOnly: true`); hiding the per-word chips stops a child
              // from starting a single-word drill that would bypass the
              // Guardian-origin practiceOnly gating.
              //
              // Copy sourced from `guardianPracticeActionLabel()` +
              // `guardianSummaryCopy()` — see view-model notes on the
              // identity-separation rationale. Every string here lives in one
              // place, so a rename is a one-file change across scene, test
              // fixtures, and telemetry.
              <div className="summary-drill summary-drill--guardian">
                <div className="summary-drill-head">
                  <h4>Words that wobbled today</h4>
                  <span className="small muted">{guardianSummaryCopy()}</span>
                </div>
                <div className="summary-drill-chips">
                  {summary.mistakes.map((word) => (
                    <span className="fchip fchip--static" key={word.slug}>{word.word}</span>
                  ))}
                  <button
                    type="button"
                    className="btn primary sm"
                    data-action="spelling-drill-all"
                    disabled={runtimeReadOnly || pending}
                    onClick={(event) => renderAction(actions, event, 'spelling-drill-all')}
                  >
                    {guardianPracticeActionLabel()} <ArrowRightIcon />
                  </button>
                </div>
              </div>
            ) : (
              <div className="summary-drill">
                <div className="summary-drill-head">
                  <h4>Words that need another go</h4>
                  <span className="small muted">A quick drill cycles each of these again before you close the round.</span>
                </div>
                <div className="summary-drill-chips">
                  {summary.mistakes.map((word) => (
                    <button
                      type="button"
                      className="fchip"
                      data-action="spelling-drill-single"
                      data-slug={word.slug}
                      key={word.slug}
                      disabled={runtimeReadOnly || pending}
                      onClick={(event) => renderAction(actions, event, 'spelling-drill-single', { slug: word.slug })}
                    >
                      {word.word}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn primary sm"
                    data-action="spelling-drill-all"
                    disabled={runtimeReadOnly || pending}
                    onClick={(event) => renderAction(actions, event, 'spelling-drill-all')}
                  >
                    Drill all {summary.mistakes.length} <ArrowRightIcon />
                  </button>
                </div>
              </div>
            )
          ) : null}

          <div className="summary-actions">
            <button
              type="button"
              className="btn ghost lg"
              data-action="spelling-back"
              onClick={(event) => renderAction(actions, event, 'spelling-back')}
            >
              Back to dashboard
            </button>
            <button
              type="button"
              className="btn primary lg"
              style={{ '--btn-accent': accent }}
              data-action="spelling-start-again"
              disabled={runtimeReadOnly || pending}
              onClick={(event) => renderAction(actions, event, 'spelling-start-again')}
            >
              {pendingCommand === 'start-session' ? 'Starting...' : 'Start another round'} <ArrowRightIcon />
            </button>
            <button
              type="button"
              className="summary-bank-link"
              data-action="spelling-open-word-bank"
              onClick={(event) => renderAction(actions, event, 'spelling-open-word-bank')}
            >
              Open word bank <ArrowRightIcon />
            </button>
          </div>
        </AnimatedPromptCard>
      </div>
    </div>
  );
}
