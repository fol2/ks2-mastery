import React from 'react';
import { ArrowRightIcon, CheckIcon } from './spelling-icons.jsx';
import { AnimatedPromptCard, PathProgress, Ribbon } from './SpellingCommon.jsx';
import { SpellingHeroBackdrop } from './SpellingHeroBackdrop.jsx';
import {
  guardianSummaryCards,
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
          <span className="path-count">{isGuardianSummary ? 'Guardian round complete' : 'Round complete'}</span>
        </header>

        <AnimatedPromptCard
          className={`summary-card${isGuardianSummary ? ' summary-card--guardian' : ''}`}
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

          {summary.mistakes.length ? (
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
