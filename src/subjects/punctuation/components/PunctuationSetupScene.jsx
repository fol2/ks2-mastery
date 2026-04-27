// Phase 5 U7 — Punctuation mission dashboard.
//
// Replaces the Phase 3 U2 three-card button wall with a mission dashboard
// modelled on the Spelling Setup's hero + side-panel pattern, adapted for
// Bellstorm Coast. Layout:
//
//   Hero: Bellstorm Coast backdrop + headline + primary CTA
//   Progress row: Due today | Wobbly | Stars earned (compact)
//   Monster row: 4 active monsters with star meters (X / 100 Stars)
//     and stage labels (Not caught / Egg Found / Hatch / Evolve / Strong / Mega)
//   Map link: "Open Punctuation Map"
//   Secondary drawer: Wobbly Spots | GPS Check | Round length toggle
//
// R7: Single primary CTA above the fold — Smart Review default, Wobbly if
//     weaknesses exist, Continue if active session.
// R8: Invariant skeleton — fresh learner and post-session render the SAME
//     layout with different content only (no structural divergence).
// R9: Star meters per monster from starView (U4 wired).
//
// Every major section carries a `data-section` landmark for journey spec
// testing (U9). The primary CTA carries `data-punctuation-cta`.

import React, { useMemo, useRef } from 'react';

import {
  ACTIVE_PUNCTUATION_MONSTER_IDS,
  PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS,
  bellstormSceneForPhase,
  buildPunctuationDashboardModel,
  composeIsDisabled,
  punctuationMonsterDisplayName,
  punctuationStageLabel,
} from './punctuation-view-model.js';
import { emitPunctuationEvent } from '../telemetry.js';

// The 6 Phase 2 cluster mode ids + `guided` — the set that triggers the
// one-shot stored-prefs migration. Local to this scene because the
// migration is a Setup-specific concern; the view-model exposes the
// display collapse (`punctuationPrimaryModeFromPrefs`) separately.
const LEGACY_PUNCTUATION_MODE_IDS = Object.freeze(new Set([
  'endmarks',
  'apostrophe',
  'speech',
  'comma_flow',
  'boundary',
  'structure',
  'guided',
]));

// --- CTA resolution --------------------------------------------------------
//
// R7: the primary CTA above the fold resolves to one of three labels:
//   - "Continue your round" when an active session exists
//   - "Tackle wobbly spots" when weaknesses exist (weak > 0) and no session
//   - "Start today's round" as the default smart-review entry
// The dispatch mode follows the same ladder: continue → weak → smart.

function resolvePrimaryCta(stats, ui) {
  const hasActiveSession = Boolean(
    ui && typeof ui === 'object' && !Array.isArray(ui) && ui.session && ui.session.id,
  );
  if (hasActiveSession) {
    return { label: 'Continue your round', mode: 'continue' };
  }
  const weakCount = Number(stats?.weak) || 0;
  if (weakCount > 0) {
    return { label: 'Tackle wobbly spots', mode: 'weak' };
  }
  return { label: "Start today's round", mode: 'smart' };
}

// --- Fresh learner CTA override -------------------------------------------
// A fresh learner (zero attempts, zero secure, zero due) gets a warmer
// invitation instead of the default "Start today's round".
function freshLearnerCtaLabel(isEmpty) {
  return isEmpty ? 'Find your first punctuation egg' : null;
}

function selectedRoundLength(prefs) {
  const raw = prefs && typeof prefs === 'object' && !Array.isArray(prefs)
    ? prefs.roundLength
    : null;
  const candidate = typeof raw === 'string' && raw ? raw : '4';
  return PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS.includes(candidate) ? candidate : '4';
}

// --- Legacy PrimaryModeCard export (backward compat) -----------------------
// Phase 5 U7 replaces the three primary mode cards with a single CTA +
// secondary drawer. The `PrimaryModeCard` component is no longer rendered
// in the mission dashboard, but it is exported so the U1 click-through
// tests in `tests/react-punctuation-scene.test.js` and the standalone
// renderer in `tests/helpers/punctuation-scene-render.js` keep working.
// These tests exercise the component's onClick closure in isolation and
// are structurally valid even though the component is off the render tree.
export function PrimaryModeCard({ card, selected, disabled: isDisabled, roundLength, actions }) {
  const classes = ['punctuation-primary-mode'];
  if (selected) classes.push('selected');
  if (isDisabled) classes.push('is-disabled');
  if (card.badge) classes.push('is-recommended');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-mode-id={card.id}
      data-action="punctuation-start"
      data-value={card.id}
      data-round-length={roundLength}
      disabled={isDisabled}
      aria-disabled={isDisabled ? 'true' : undefined}
      onClick={() => {
        if (isDisabled) return;
        actions.dispatch('punctuation-start', { mode: card.id, roundLength });
      }}
    >
      {card.badge ? <span className="punctuation-primary-mode-eyebrow">{card.badge}</span> : null}
      <h4 className="punctuation-primary-mode-title">{card.label}</h4>
      <p className="punctuation-primary-mode-desc">{card.description}</p>
    </button>
  );
}

// --- Sub-components --------------------------------------------------------

function RoundLengthToggle({ selectedValue, disabled, actions }) {
  return (
    <div
      className="punctuation-length-toggle"
      role="radiogroup"
      aria-label="Round length"
    >
      {PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS.map((value) => {
        const selected = selectedValue === value;
        return (
          <button
            type="button"
            role="radio"
            aria-checked={selected ? 'true' : 'false'}
            className={`punctuation-length-option${selected ? ' selected' : ''}`}
            data-action="punctuation-set-round-length"
            data-value={value}
            disabled={disabled}
            key={value}
            onClick={() => {
              if (disabled) return;
              actions.dispatch('punctuation-set-round-length', { value });
            }}
          >
            <span>{value}</span>
          </button>
        );
      })}
    </div>
  );
}

function MonsterStarMeter({ monster }) {
  const cap = monster.id === 'quoral' ? 100 : 100;
  const starsLabel = monster.id === 'quoral' ? 'Grand Stars' : 'Stars';
  // U3 (Phase 6): use monotonic displayStars / displayStage so a monster
  // never appears to de-evolve after evidence lapse.
  const stars = monster.displayStars ?? monster.totalStars;
  const stage = monster.displayStage ?? monster.starDerivedStage;
  const pct = Math.min(100, Math.max(0, Math.round((stars / cap) * 100)));
  const stageText = punctuationStageLabel(stage, stars);

  return (
    <div className="punctuation-monster-meter" data-monster-id={monster.id}>
      <div className="punctuation-monster-meter-name">{monster.name}</div>
      <div className="punctuation-monster-meter-stage">{stageText}</div>
      <div className="punctuation-monster-meter-bar" aria-hidden="true">
        <div
          className="punctuation-monster-meter-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="punctuation-monster-meter-count">
        {`${stars} / ${cap} ${starsLabel}`}
      </div>
    </div>
  );
}

function SecondaryModeButton({ label, mode, roundLength, disabled, actions }) {
  const classes = ['punctuation-secondary-action'];
  if (disabled) classes.push('is-disabled');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-action="punctuation-start"
      data-value={mode}
      data-round-length={roundLength}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        actions.dispatch('punctuation-start', { mode, roundLength });
      }}
    >
      {label}
    </button>
  );
}

// --- Main scene ------------------------------------------------------------

export function PunctuationSetupScene({ ui, actions, prefs, stats, learner, rewardState }) {
  const scene = bellstormSceneForPhase('setup');
  const disabled = composeIsDisabled(ui);

  // U4: thread starView from ui into the dashboard model builder.
  // The read-model populates ui.starView on the Worker round-trip;
  // fresh learners have no starView — null is safe (builder handles it).
  const starView = ui && typeof ui === 'object' && !Array.isArray(ui)
    ? ui.starView || null
    : null;

  const dashboard = useMemo(
    () => buildPunctuationDashboardModel(stats, { prefs }, rewardState, starView),
    [stats, prefs, rewardState, starView],
  );

  // One-shot stale-prefs migration (unchanged from Phase 3 U2).
  const migratedRef = useRef(false);
  const prefsMigrated = Boolean(ui && typeof ui === 'object' && !Array.isArray(ui) && ui.prefsMigrated);
  const storedMode = prefs && typeof prefs === 'object' && !Array.isArray(prefs)
    ? prefs.mode
    : null;
  const legacyCluster = typeof storedMode === 'string' && LEGACY_PUNCTUATION_MODE_IDS.has(storedMode);
  if (legacyCluster && !migratedRef.current && !prefsMigrated) {
    migratedRef.current = true;
    if (typeof actions.updateSubjectUi === 'function') {
      actions.updateSubjectUi('punctuation', { prefsMigrated: true });
    }
    actions.dispatch('punctuation-set-mode', { value: 'smart' });
  }

  // Phase 4 U4 telemetry smoke — Setup mount.
  const cardOpenedRef = useRef(false);
  if (!cardOpenedRef.current) {
    cardOpenedRef.current = true;
    emitPunctuationEvent('card-opened', { cardId: 'smart' }, {
      actions,
      learnerId: learner && typeof learner === 'object' ? learner.id : null,
    });
  }

  const selectedLengthValue = selectedRoundLength(prefs);

  // CTA resolution
  const cta = resolvePrimaryCta(stats, ui);
  const freshLabel = freshLearnerCtaLabel(dashboard.isEmpty);
  const ctaLabel = freshLabel || cta.label;
  const ctaMode = cta.mode;

  // Progress row values
  const dueCount = Number(stats?.due) || 0;
  const weakCount = Number(stats?.weak) || 0;
  // U3 review follow-up (HIGH 1): use displayStars (monotonic) for the
  // aggregate, matching MonsterStarMeter which already reads displayStars.
  // Prior code used raw totalStars, causing a mismatch between the
  // progress-row aggregate and the individual meter values after evidence
  // lapse.
  const totalStarsEarned = dashboard.activeMonsters.reduce(
    (sum, m) => sum + (m.displayStars ?? m.totalStars ?? 0), 0,
  );

  const learnerName = learner && typeof learner === 'object' && !Array.isArray(learner)
    && typeof learner.name === 'string' && learner.name.trim()
    ? learner.name.trim()
    : '';

  function handlePrimaryCta() {
    if (disabled) return;
    if (ctaMode === 'continue') {
      actions.dispatch('punctuation-continue');
      return;
    }
    actions.dispatch('punctuation-start', { mode: ctaMode, roundLength: selectedLengthValue });
  }

  return (
    <section
      className="card border-top punctuation-surface punctuation-setup-scene punctuation-mission-dashboard"
      data-punctuation-phase="setup"
      style={{ borderTopColor: '#B8873F' }}
    >
      {/* Hero area — Bellstorm Coast backdrop + headline + primary CTA */}
      <div className="punctuation-dashboard-hero" data-section="hero">
        <img
          src={scene.src}
          srcSet={scene.srcSet}
          sizes="(max-width: 980px) 100vw, 960px"
          alt=""
          aria-hidden="true"
        />
        <div className="punctuation-dashboard-hero-content">
          <div className="eyebrow">Bellstorm Coast</div>
          <h2 className="section-title">Today's punctuation mission</h2>
          {learnerName ? (
            <p className="punctuation-hero-welcome">
              {`Hi ${learnerName} — ready for a short round?`}
            </p>
          ) : null}
          <div className="punctuation-dashboard-cta-row">
            <button
              type="button"
              className="btn primary xl"
              style={{ '--btn-accent': '#B8873F' }}
              data-punctuation-cta
              data-action={ctaMode === 'continue' ? 'punctuation-continue' : 'punctuation-start'}
              disabled={disabled}
              onClick={handlePrimaryCta}
            >
              {ctaLabel}
            </button>
          </div>
        </div>
      </div>

      {/* Progress row — compact stats strip */}
      <section className="punctuation-progress-row" data-section="progress-row" aria-label="Today at a glance">
        <dl className="punctuation-progress-strip">
          <div className="punctuation-progress-item">
            <dt>Due today</dt>
            <dd>{dueCount}</dd>
          </div>
          <div className="punctuation-progress-item">
            <dt>Wobbly</dt>
            <dd>{weakCount}</dd>
          </div>
          <div className="punctuation-progress-item">
            <dt>Stars earned</dt>
            <dd>{totalStarsEarned}</dd>
          </div>
        </dl>
      </section>

      {/* Monster row — 4 active monsters with star meters */}
      <section className="punctuation-monster-row" data-section="monster-row" aria-label="Your monsters">
        {dashboard.activeMonsters.map((monster) => (
          <MonsterStarMeter monster={monster} key={monster.id} />
        ))}
      </section>

      {/* Map link */}
      <div data-section="map-link">
        <button
          type="button"
          className="punctuation-map-link"
          data-action="punctuation-open-map"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            actions.dispatch('punctuation-open-map');
          }}
        >
          Open Punctuation Map
        </button>
      </div>

      {/* Secondary practice drawer */}
      <section className="punctuation-secondary-drawer" data-section="secondary" aria-label="More practice options">
        <div className="punctuation-secondary-modes">
          <SecondaryModeButton
            label="Wobbly Spots"
            mode="weak"
            roundLength={selectedLengthValue}
            disabled={disabled}
            actions={actions}
          />
          <SecondaryModeButton
            label="GPS Check"
            mode="gps"
            roundLength={selectedLengthValue}
            disabled={disabled}
            actions={actions}
          />
        </div>
        <div className="punctuation-round-controls">
          <span className="punctuation-round-label">Round length</span>
          <RoundLengthToggle
            selectedValue={selectedLengthValue}
            disabled={disabled}
            actions={actions}
          />
        </div>
      </section>
    </section>
  );
}
