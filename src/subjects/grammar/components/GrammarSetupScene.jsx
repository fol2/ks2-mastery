import React from 'react';
import {
  GRAMMAR_REGION_IMAGE,
  GRAMMAR_REGION_IMAGE_SMALL,
  grammarMonsterAsset,
} from '../metadata.js';
import { normaliseGrammarSpeechRate } from '../speech.js';
import {
  GRAMMAR_DASHBOARD_HERO,
  GRAMMAR_MORE_PRACTICE_MODES,
  GRAMMAR_PRIMARY_MODE_CARDS,
  buildGrammarDashboardModel,
} from './grammar-view-model.js';
// SH2-U5: fresh-learner `dashboard.isEmpty` branch surfaces the canonical
// three-part copy through the shared primitive. The pre-U5 bespoke
// `.grammar-today-empty` div kept a single sentence and no reassurance —
// the primitive also preserves the existing `data-testid` so the
// grammar-phase3-child-copy test continues to find the anchor.
import { EmptyState } from '../../../platform/ui/EmptyState.jsx';

// Phase 3 U1: Child-facing Grammar dashboard. Every label, mode id, and
// card comes from the U8 view-model (`grammar-view-model.js`). The JSX
// layer is a layout-only component — we do not restate copy, filter ids,
// or mode ids inline. Hero copy is driven by `GRAMMAR_DASHBOARD_HERO` so
// James can swap the wording in one place after review.
//
// Structure mirrors `SpellingSetupScene.jsx`:
//   - Hero (headline + subheadline)
//   - Today cards row (Due / Trouble spots / Secure / Streak)
//   - Concordium progress (drawn from `buildGrammarDashboardModel` →
//     `concordiumProgress`)
//   - Primary mode cards (4 cards from `GRAMMAR_PRIMARY_MODE_CARDS`)
//   - Writing Try secondary entry (dispatches `grammar-open-transfer` —
//     U6b renders the scene)
//   - More practice <details> disclosure (5 cards from
//     `GRAMMAR_MORE_PRACTICE_MODES`). Closed by default.
//   - Quiet round-length + speech-rate controls.
//
// Everything the old adult-diagnostic surface said (`Worker-marked modes`,
// `Worker marked` chip, `full map`, `Full placeholder map`, `All 18
// Grammar concepts` grid) is removed. U10's fixture-driven absence test
// covers regressions.

const SPEECH_RATE_OPTIONS = Object.freeze([
  { value: 0.6, label: '0.6x slow' },
  { value: 0.8, label: '0.8x steady' },
  { value: 1, label: '1x normal' },
  { value: 1.2, label: '1.2x quicker' },
  { value: 1.4, label: '1.4x fast' },
]);

function TodayCard({ card }) {
  return (
    <div className="grammar-today-card" data-today-id={card.id}>
      <div className="grammar-today-label">{card.label}</div>
      <div className="grammar-today-value">{card.value}</div>
      <div className="grammar-today-detail">{card.detail}</div>
    </div>
  );
}

function PrimaryModeCard({ card, selected, disabled, actions }) {
  const featured = card.featured === true;
  const classes = ['grammar-primary-mode'];
  if (selected) classes.push('selected');
  if (disabled) classes.push('is-disabled');
  if (featured) classes.push('is-recommended');
  const action = card.id === 'bank' ? 'grammar-open-concept-bank' : 'grammar-set-mode';
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-mode-id={card.id}
      data-action={action}
      data-featured={featured ? 'true' : 'false'}
      aria-pressed={selected ? 'true' : 'false'}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        if (card.id === 'bank') {
          actions.dispatch('grammar-open-concept-bank');
          return;
        }
        actions.dispatch('grammar-set-mode', { value: card.id });
      }}
    >
      {featured ? <span className="grammar-primary-mode-eyebrow">Recommended</span> : null}
      <h4 className="grammar-primary-mode-title">{card.title}</h4>
      <p className="grammar-primary-mode-desc">{card.desc}</p>
    </button>
  );
}

function MoreModeCard({ card, selected, disabled, actions }) {
  const classes = ['grammar-secondary-mode'];
  if (selected) classes.push('selected');
  if (disabled) classes.push('is-disabled');
  // U5 Phase 4: Surgery and Builder cards carry a "Mixed practice" label
  // from `GRAMMAR_MORE_PRACTICE_MODES` so the dashboard surfaces the
  // child-facing truth that these modes do not honour a focused concept
  // id. Label renders under the mode title with `data-mode-label` so
  // tests and QA can scope by the mode id. The label is decorative and
  // does not change mode behaviour.
  const label = typeof card.label === 'string' && card.label ? card.label : '';
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-mode-id={card.id}
      data-action="grammar-set-mode"
      aria-pressed={selected ? 'true' : 'false'}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        actions.dispatch('grammar-set-mode', { value: card.id });
      }}
    >
      <h5 className="grammar-secondary-mode-title">{card.title}</h5>
      {label ? (
        <span className="grammar-secondary-mode-label" data-mode-label={card.id}>{label}</span>
      ) : null}
      <p className="grammar-secondary-mode-desc">{card.desc}</p>
    </button>
  );
}

export function GrammarSetupScene({ learner, grammar, rewardState, actions, runtimeReadOnly }) {
  const dashboard = buildGrammarDashboardModel(grammar, learner, rewardState);
  const selectedMode = dashboard.primaryMode;
  const miniTestMode = selectedMode === 'satsset';
  const setupDisabled = runtimeReadOnly || Boolean(grammar.pendingCommand);
  const lengthOptions = miniTestMode ? [8, 12] : [3, 5, 8, 10, 15];
  const selectedLength = miniTestMode
    ? (Number(grammar.prefs?.roundLength) >= 10 ? 12 : 8)
    : (Number(grammar.prefs?.roundLength) || 5);
  const selectedSpeechRate = normaliseGrammarSpeechRate(grammar.prefs?.speechRate);
  const { title: heroTitle, subtitle: heroSubtitle } = GRAMMAR_DASHBOARD_HERO;
  const concordium = dashboard.concordiumProgress;

  return (
    <section
      className="grammar-dashboard"
      aria-labelledby="grammar-dashboard-title"
      data-grammar-phase-root="dashboard"
    >
      <div
        className="grammar-hero"
        style={{ '--grammar-hero-bg': `url(${GRAMMAR_REGION_IMAGE})` }}
      >
        <picture aria-hidden="true">
          <source media="(max-width: 720px)" srcSet={GRAMMAR_REGION_IMAGE_SMALL} />
          <img src={GRAMMAR_REGION_IMAGE} alt="" />
        </picture>
        <div className="grammar-hero-copy">
          <h2 id="grammar-dashboard-title" className="grammar-hero-title">{heroTitle}</h2>
          <p className="grammar-hero-subtitle">{heroSubtitle}</p>
          {learner?.name ? (
            <p className="grammar-hero-welcome">Hi {learner.name} — ready for a short round?</p>
          ) : null}
        </div>
      </div>

      <section className="grammar-today" aria-label="Today at a glance">
        {dashboard.isEmpty ? (
          <div className="grammar-today-empty" data-testid="grammar-today-empty">
            <EmptyState
              title="Grammar is ready"
              body="Grammar is ready. Progress is saved as you practise. Start your first round to see your scores here."
            />
          </div>
        ) : (
          <div className="grammar-today-grid">
            {dashboard.todayCards.map((card) => (
              <TodayCard card={card} key={card.id} />
            ))}
          </div>
        )}
        <div className="grammar-concordium-progress" data-testid="grammar-concordium-progress">
          <img
            className="grammar-concordium-image"
            src={grammarMonsterAsset('concordium', 320)}
            alt=""
            aria-hidden="true"
          />
          <span className="grammar-concordium-label">Grow Concordium</span>
          <strong className="grammar-concordium-value">{`${concordium.mastered}/${concordium.total}`}</strong>
        </div>
      </section>

      <section className="grammar-primary-modes" aria-label="Choose a round">
        <div className="grammar-primary-grid">
          {GRAMMAR_PRIMARY_MODE_CARDS.map((card) => (
            <PrimaryModeCard
              card={card}
              selected={card.id !== 'bank' && card.id === selectedMode}
              disabled={setupDisabled}
              actions={actions}
              key={card.id}
            />
          ))}
        </div>

        <div className="grammar-round-controls">
          <label className="field">
            <span>{miniTestMode ? 'Mini-set size' : 'Round length'}</span>
            <select
              className="input"
              value={String(selectedLength)}
              disabled={setupDisabled}
              onChange={(event) => actions.dispatch('grammar-set-round-length', { value: event.currentTarget.value })}
            >
              {lengthOptions.map((length) => <option value={length} key={length}>{length}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Speech rate</span>
            <select
              className="input"
              value={String(selectedSpeechRate)}
              disabled={setupDisabled}
              onChange={(event) => actions.dispatch('grammar-set-speech-rate', { value: event.currentTarget.value })}
            >
              {SPEECH_RATE_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        {grammar.error ? (
          <div className="feedback bad" role="alert">
            <strong>Grammar is unavailable right now</strong>
            <div>{grammar.error}</div>
          </div>
        ) : null}

        <div className="grammar-start-row">
          <button
            className="btn primary xl"
            type="button"
            disabled={setupDisabled}
            onClick={() => actions.dispatch('grammar-start')}
          >
            {grammar.pendingCommand === 'start-session' ? 'Starting...' : 'Begin round'}
          </button>
          {dashboard.writingTryAvailable ? (
            <button
              className="btn secondary"
              type="button"
              data-action="grammar-open-transfer"
              disabled={setupDisabled}
              onClick={() => actions.dispatch('grammar-open-transfer')}
            >
              Writing Try · non-scored
            </button>
          ) : null}
        </div>
      </section>

      <details className="grammar-more-practice">
        <summary>More practice</summary>
        <div className="grammar-more-practice-grid">
          {GRAMMAR_MORE_PRACTICE_MODES.map((card) => (
            <MoreModeCard
              card={card}
              selected={card.id === selectedMode}
              disabled={setupDisabled}
              actions={actions}
              key={card.id}
            />
          ))}
        </div>
      </details>
    </section>
  );
}
