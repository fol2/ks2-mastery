import React from 'react';
import { ArrowRightIcon, CheckIcon } from './spelling-icons.jsx';
import { AnimatedPromptCard, PathProgress, Ribbon } from './SpellingCommon.jsx';
import { SpellingHeroBackdrop } from './SpellingHeroBackdrop.jsx';
import {
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

export function SpellingSummaryScene({ learner, ui, accent, actions, previousHeroBg = '', runtimeReadOnly = false }) {
  const summary = ui.summary;
  if (!summary) return null;
  const progressTotal = Math.max(1, summary.totalWords || 1);
  const heroBg = heroBgForSession(learner.id, {
    mode: summary.mode,
    progress: { done: progressTotal, total: progressTotal },
  }, { complete: true });
  const toneGood = !summary.mistakes.length;

  return (
    <div className="spelling-in-session summary-shell" style={{ gridColumn: '1/-1', ...heroBgStyle(heroBg) }}>
      <SpellingHeroBackdrop url={heroBg} previousUrl={previousHeroBg} />
      <div className="session summary">
        <header className="session-head">
          <PathProgress done={progressTotal} current={progressTotal} total={progressTotal} />
          <span className="path-count">Round complete</span>
        </header>

        <AnimatedPromptCard className="summary-card" innerClassName="summary-card-inner">
          <h3 className="summary-title sr-only">Session summary</h3>
          <Ribbon
            tone={toneGood ? 'good' : 'warn'}
            icon={toneGood ? <CheckIcon /> : '!'}
            headline={summaryHeadline(summary)}
            sub={summaryRibbonSub(summary)}
          />

          <SummaryStatGrid cards={summary.cards} />

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
                    disabled={runtimeReadOnly}
                    onClick={(event) => renderAction(actions, event, 'spelling-drill-single', { slug: word.slug })}
                  >
                    {word.word}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn primary sm"
                  data-action="spelling-drill-all"
                  disabled={runtimeReadOnly}
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
              disabled={runtimeReadOnly}
              onClick={(event) => renderAction(actions, event, 'spelling-start-again')}
            >
              Start another round <ArrowRightIcon />
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
