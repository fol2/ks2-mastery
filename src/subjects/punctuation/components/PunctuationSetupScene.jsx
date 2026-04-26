// Phase 3 U2 — Punctuation Setup scene (child dashboard).
//
// Replaces the Phase 2 `SetupView`'s 10-button mode grid with a Hero +
// Today cards + three primary journey cards (Smart Review / Wobbly Spots
// / GPS Check) + one "Open Punctuation Map" secondary card + compact
// round-length toggle (4 / 8 / 12) + active-monster strip. Reserved
// monsters (Colisk / Hyphang / Carillon) are NEVER rendered — the
// iterator is `ACTIVE_PUNCTUATION_MONSTER_IDS` full stop (plan R10 /
// learning #5).
//
// Mode display: `aria-pressed` on the primary cards is driven by
// `punctuationPrimaryModeFromPrefs(prefs)`, which collapses the 6
// Phase 2 cluster modes (endmarks / apostrophe / speech / comma_flow /
// boundary / structure) AND `guided` to `'smart'` for display. That
// normaliser is display-only — stored prefs still carry the stale
// value until the one-shot migration below persists the collapse.
//
// Stale-prefs migration (R1, plan line 408): on first render, if the
// stored `prefs.mode` is one of the 6 cluster values or `'guided'`, the
// scene dispatches `punctuation-set-mode` with `{ value: 'smart' }` to
// migrate the stored value once. Two gates combine to guarantee exactly
// one dispatch per session:
//   - A `useRef` gate protects the same component instance from
//     re-dispatching across React-level re-renders (including React 18
//     strict-mode's double-invoke).
//   - A store-level `ui.prefsMigrated` latch (set by the module's
//     `punctuation-set-mode` handler) protects against component
//     tear-down + rebuild — SSR renders produce fresh trees each time,
//     so the useRef gate alone would re-fire on every server-side
//     render.
// Without this migration, `punctuation-start-again` (dispatched from
// Summary) would silently start a cluster-focus session the learner
// can no longer configure.
//
// Every mutation control threads `composeIsDisabled(ui)` so the
// dashboard pauses visually whenever a command is in flight, the
// runtime is degraded/unavailable, or the platform has flipped the
// subject read-only (plan R11 — the same signal wired through Map,
// Session, Feedback, and Summary scenes).

import React, { useMemo, useRef } from 'react';

import {
  ACTIVE_PUNCTUATION_MONSTER_IDS,
  PUNCTUATION_DASHBOARD_HERO,
  PUNCTUATION_PRIMARY_MODE_CARDS,
  PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS,
  bellstormSceneForPhase,
  buildPunctuationDashboardModel,
  composeIsDisabled,
  punctuationMonsterDisplayName,
  punctuationPrimaryModeFromPrefs,
} from './punctuation-view-model.js';
import { progressForPunctuationMonster } from '../../../platform/game/mastery/punctuation.js';

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

// Compact three-option toggle for the Setup scene. Default 4 (per plan);
// 8 and 12 are the other two stops. Mirrors the Spelling LengthPicker's
// radiogroup shape so screen readers land on the same familiar control.
// Shared as `PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS` from the view-model so
// the module's `punctuation-set-round-length` handler can validate against
// the same narrow enum (adv-234-001).

function TodayCard({ card }) {
  return (
    <div className="punctuation-today-card" data-today-id={card.id}>
      <div className="punctuation-today-label">{card.label}</div>
      <div className="punctuation-today-value">{card.value}</div>
      <div className="punctuation-today-detail">{card.detail}</div>
    </div>
  );
}

// Exported so `tests/react-punctuation-scene.test.js` can exercise the real
// onClick closure directly (calling the component as a plain function and
// invoking the returned element's `props.onClick`). The Phase 3 SSR harness
// could only grep the rendered HTML, so a regression that swapped the click
// dispatch target (`punctuation-start` → `punctuation-set-mode`) slipped
// through. The click-through test below that export is U1's guard.
//
// U1 (Phase 4, R1): primary cards are ACTION buttons, not radio buttons.
// Tapping one starts a session immediately via `punctuation-start` with
// `{ mode, roundLength }` — NOT `punctuation-set-mode` (which is a
// preference-save no-op from Setup's perspective). `aria-pressed` is
// intentionally omitted for the same reason: no "selected" state to
// announce, because the click fires a session rather than toggling a
// preference. The only remaining caller of `punctuation-set-mode` from
// this scene is the one-shot stale-prefs migration (lines 251-270).
export function PrimaryModeCard({ card, selected, disabled, roundLength, actions }) {
  const classes = ['punctuation-primary-mode'];
  if (selected) classes.push('selected');
  if (disabled) classes.push('is-disabled');
  if (card.badge) classes.push('is-recommended');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-mode-id={card.id}
      data-action="punctuation-start"
      data-value={card.id}
      disabled={disabled}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={() => {
        if (disabled) return;
        actions.dispatch('punctuation-start', { mode: card.id, roundLength });
      }}
    >
      {card.badge ? <span className="punctuation-primary-mode-eyebrow">{card.badge}</span> : null}
      <h4 className="punctuation-primary-mode-title">{card.label}</h4>
      <p className="punctuation-primary-mode-desc">{card.description}</p>
    </button>
  );
}

function OpenMapCard({ disabled, actions }) {
  const classes = ['punctuation-secondary-mode'];
  if (disabled) classes.push('is-disabled');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-action="punctuation-open-map"
      disabled={disabled}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={() => {
        if (disabled) return;
        actions.dispatch('punctuation-open-map');
      }}
    >
      <h4 className="punctuation-secondary-mode-title">Open Punctuation Map</h4>
      <p className="punctuation-secondary-mode-desc">
        Browse the 14 skills by monster and status.
      </p>
    </button>
  );
}

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

function ActiveMonsterStrip({ rewardState }) {
  // Iterate `ACTIVE_PUNCTUATION_MONSTER_IDS` only — reserved monsters
  // (colisk / hyphang / carillon) never surface even if the reward
  // state carries entries for them (plan R10).
  return (
    <div className="punctuation-active-monsters" aria-label="Active monsters">
      {ACTIVE_PUNCTUATION_MONSTER_IDS.map((monsterId) => {
        const progress = progressForPunctuationMonster(rewardState, monsterId);
        return (
          <div
            className="punctuation-active-monster"
            data-monster-id={monsterId}
            key={monsterId}
          >
            <div className="punctuation-active-monster-name">
              {punctuationMonsterDisplayName(monsterId)}
            </div>
            <div className="punctuation-active-monster-progress muted">
              {`${progress.mastered}/${progress.publishedTotal} secure`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function selectedRoundLength(prefs) {
  const raw = prefs && typeof prefs === 'object' && !Array.isArray(prefs)
    ? prefs.roundLength
    : null;
  const candidate = typeof raw === 'string' && raw ? raw : '4';
  return PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS.includes(candidate) ? candidate : '4';
}

export function PunctuationSetupScene({ ui, actions, prefs, stats, learner, rewardState }) {
  const scene = bellstormSceneForPhase('setup');
  const disabled = composeIsDisabled(ui);

  // Display-only collapse of legacy cluster / `guided` prefs to `'smart'`.
  // Stored value stays untouched until the migration effect below
  // persists the collapse via dispatch.
  const primaryMode = useMemo(() => punctuationPrimaryModeFromPrefs(prefs), [prefs]);
  const dashboard = useMemo(
    () => buildPunctuationDashboardModel(stats, { prefs }, rewardState),
    [stats, prefs, rewardState],
  );

  // One-shot stale-prefs migration. Three gates combine to guarantee
  // exactly one dispatch per session:
  //
  //   1. `migratedRef` — React-level gate. Persists across every
  //      re-render of the same component instance (including React
  //      18's strict-mode double-invoke) so a client-side re-render
  //      never fires the dispatch twice.
  //   2. `ui.prefsMigrated` — store-level gate. Survives component
  //      tear-down and rebuild (SSR renders produce fresh trees each
  //      time; `migratedRef` alone would re-fire on every SSR call).
  //      Latched CLIENT-SIDE below via `actions.updateSubjectUi` BEFORE
  //      the dispatch fires — see adv-234 HIGH 1 for the detail. The
  //      module's `punctuation-set-mode` handler also sets this latch
  //      as part of its store update, but in production the dispatch
  //      routes through `handleRemotePunctuationAction` → the Worker
  //      `save-prefs` command, which returns true and short-circuits
  //      the fall-through to `handleSubjectAction` → module handler.
  //      Landing the latch here keeps both the harness (module-handler
  //      path) and production (Worker-command path) in lock-step.
  //   3. Reload-from-repositories after the Worker response rehydrates
  //      `prefs.mode` to 'smart' — so even if the client-side latch is
  //      somehow lost, the next render's `legacyCluster` check is
  //      false.
  //
  // The check runs synchronously in the component body rather than
  // an effect — `renderToStaticMarkup` does not execute effects, so a
  // useEffect-based migration would never fire server-side. Dispatch
  // to the store is safe during render because it goes to the app
  // store (not component state) and the guards above prevent a
  // re-entrant loop.
  //
  // `legacyCluster` is computed from the raw stored mode, not the
  // display collapse, so a reverted state is detected only the first
  // time before `prefsMigrated` latches.
  const migratedRef = useRef(false);
  const prefsMigrated = Boolean(ui && typeof ui === 'object' && !Array.isArray(ui) && ui.prefsMigrated);
  const storedMode = prefs && typeof prefs === 'object' && !Array.isArray(prefs)
    ? prefs.mode
    : null;
  const legacyCluster = typeof storedMode === 'string' && LEGACY_PUNCTUATION_MODE_IDS.has(storedMode);
  if (legacyCluster && !migratedRef.current && !prefsMigrated) {
    migratedRef.current = true;
    // adv-234 HIGH 1: latch the store-level gate BEFORE dispatching so the
    // production Worker-command path (which never falls through to the
    // module handler) still gets the `prefsMigrated: true` store update.
    // `updateSubjectUi` is exposed on `actions` by both the production
    // `buildSurfaceActions` in main.js and the tests/helpers/react-app-ssr
    // renderer. Safe to call during render — it is a plain store merge,
    // not a dispatch through `handleSubjectAction`, so no re-entrant loop.
    if (typeof actions.updateSubjectUi === 'function') {
      actions.updateSubjectUi('punctuation', { prefsMigrated: true });
    }
    actions.dispatch('punctuation-set-mode', { value: 'smart' });
  }

  const selectedLengthValue = selectedRoundLength(prefs);
  const learnerName = learner && typeof learner === 'object' && !Array.isArray(learner)
    && typeof learner.name === 'string' && learner.name.trim()
    ? learner.name.trim()
    : '';

  return (
    <section
      className="card border-top punctuation-surface punctuation-setup-scene"
      data-punctuation-phase="setup"
      style={{ borderTopColor: '#B8873F' }}
    >
      <div className="punctuation-hero">
        <img
          src={scene.src}
          srcSet={scene.srcSet}
          sizes="(max-width: 980px) 100vw, 960px"
          alt=""
          aria-hidden="true"
        />
        <div>
          <div className="eyebrow">{PUNCTUATION_DASHBOARD_HERO.eyebrow}</div>
          <h2 className="section-title">{PUNCTUATION_DASHBOARD_HERO.headline}</h2>
          <p className="subtitle">{PUNCTUATION_DASHBOARD_HERO.subtitle}</p>
          {learnerName ? (
            <p className="punctuation-hero-welcome">
              {`Hi ${learnerName} — ready for a short round?`}
            </p>
          ) : null}
        </div>
      </div>

      <section className="punctuation-today" aria-label="Today at a glance">
        {dashboard.isEmpty ? (
          <div className="punctuation-today-empty" data-testid="punctuation-today-empty">
            Start your first round to see your scores here.
          </div>
        ) : (
          <div className="punctuation-today-grid">
            {dashboard.todayCards.map((card) => (
              <TodayCard card={card} key={card.id} />
            ))}
          </div>
        )}
      </section>

      <section className="punctuation-primary-modes" aria-label="Choose a round">
        <div className="punctuation-primary-grid">
          {PUNCTUATION_PRIMARY_MODE_CARDS.map((card) => (
            <PrimaryModeCard
              card={card}
              selected={card.id === primaryMode}
              disabled={disabled}
              roundLength={selectedLengthValue}
              actions={actions}
              key={card.id}
            />
          ))}
        </div>

        <div className="punctuation-secondary-grid">
          <OpenMapCard disabled={disabled} actions={actions} />
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

      <section className="punctuation-monsters-section" aria-label="Your monsters">
        <h3 className="punctuation-monsters-heading">Your monsters</h3>
        <ActiveMonsterStrip rewardState={rewardState} />
      </section>
    </section>
  );
}
