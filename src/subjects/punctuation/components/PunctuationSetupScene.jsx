// Phase 5 U7 — Punctuation mission dashboard.
//
// Replaces the Phase 3 U2 three-card button wall with a mission dashboard
// modelled on the Spelling Setup's hero + side-panel pattern, adapted for
// Bellstorm Coast. Layout:
//
//   Hero: Bellstorm Coast backdrop + headline + shared mode-card row
//   Progress row: Due today | Wobbly | Grand Stars (compact)
//   Controls: Round length + display options in the shared tweak-row rhythm
//   Primary CTA: Right-aligned begin button using the shared setup-begin row
//   Map link: "Open Punctuation Map"
//
// R7: Single primary CTA — mode cards choose Smart Review, Wobbly Spots, or
//     GPS Check; the bottom begin button is the only Setup start action.
// R8: Invariant skeleton — fresh learner and post-session render the SAME
//     layout with different content only (no structural divergence).
// R9: Star meters per monster from starView (U4 wired).
//
// Every major section carries a `data-section` landmark for journey spec
// testing (U9). The primary CTA carries `data-punctuation-cta`.
//
// U4 (refactor ui-consolidation): the mission dashboard is wrapped in the
// shared `.setup-grid` / `.setup-main` / `.setup-content` rhythm with a
// right-hand sidebar (SetupSidePanel). The Bellstorm backdrop now paints via the
// platform `HeroBackdrop` (cross-fade + pan) instead of a static `<img
// srcSet>`, the round-length toggle is the platform `LengthPicker`, and
// contrast tokens flow through `useSetupHeroContrast` so future darker
// Bellstorm variants auto-tone. Every pre-existing `data-section` /
// `data-punctuation-*` attribute is preserved in its original node; only
// the surrounding chrome moves.

import { useEffect, useMemo, useRef } from 'react';

import {
  ACTIVE_PUNCTUATION_MONSTER_IDS,
  PUNCTUATION_PRIMARY_MODE_CARDS,
  PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS,
  buildPunctuationDashboardModel,
  composeIsDisabled,
  punctuationPrimaryModeFromPrefs,
  punctuationMonsterDisplayName,
  punctuationMonsterImageVisual,
  punctuationStageLabel,
} from './punctuation-view-model.js';
import { useMonsterVisualConfig } from '../../../platform/game/MonsterVisualConfigContext.jsx';
import {
  bellstormSceneForPhase,
  heroContrastProfileForPunctuationBg,
} from './punctuation-hero-bg.js';
import { emitPunctuationEvent } from '../telemetry.js';
import { DEFAULT_PUNCTUATION_PREFS } from '../service-contract.js';
import { HeroBackdrop } from '../../../platform/ui/HeroBackdrop.jsx';
import { useSetupHeroContrast } from '../../../platform/ui/useSetupHeroContrast.js';
import { HeroWelcome } from '../../../platform/ui/HeroWelcome.jsx';
import { LengthPicker } from '../../../platform/ui/LengthPicker.jsx';
import { Button } from '../../../platform/ui/Button.jsx';
import { ProgressMeter } from '../../../platform/ui/ProgressMeter.jsx';
import { StatCard } from '../../../platform/ui/StatCard.jsx';
import { SubjectCompanionPanel } from '../../../platform/ui/SubjectCompanionPanel.jsx';
import { SetupSidePanel } from '../../../platform/ui/SetupSidePanel.jsx';
import { PracticeStage } from '../../../platform/ui/PracticeStage.jsx';

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
  const defaultLength = DEFAULT_PUNCTUATION_PREFS.roundLength;
  const candidate = typeof raw === 'string' && raw ? raw : defaultLength;
  if (PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS.includes(candidate)) return candidate;
  return PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS.includes(defaultLength) ? defaultLength : '4';
}

export function resolvePunctuationSetupBeginCommand({ ctaMode, selectedMode, roundLength }) {
  if (ctaMode === 'continue') {
    return { action: 'punctuation-continue', data: undefined };
  }
  return {
    action: 'punctuation-start',
    data: {
      mode: selectedMode || 'smart',
      roundLength,
    },
  };
}

// --- Legacy PrimaryModeCard export (backward compat) -----------------------
// The card is exported so the U1 click-through tests in
// `tests/react-punctuation-scene.test.js` and the standalone renderer in
// `tests/helpers/punctuation-scene-render.js` can exercise the mode-selection
// closure independently from the full setup scene.
export function PrimaryModeCard({ card, selected, disabled: isDisabled, roundLength, actions, textTone = 'light' }) {
  const classes = ['punctuation-primary-mode', 'mode-card'];
  if (selected && !isDisabled) classes.push('selected');
  if (isDisabled) classes.push('is-disabled');
  if (card.badge) classes.push('is-recommended');
  const glyph = card.id === 'gps' ? '?' : card.id === 'weak' ? '!' : '.';
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-mode-id={card.id}
      data-action="punctuation-set-mode"
      data-value={card.id}
      data-round-length={roundLength}
      data-text-tone={textTone}
      aria-pressed={selected && !isDisabled ? 'true' : 'false'}
      disabled={isDisabled}
      aria-disabled={isDisabled ? 'true' : undefined}
      onClick={() => {
        if (isDisabled) return;
        actions.dispatch('punctuation-set-mode', { value: card.id });
      }}
    >
      <div className="mc-top">
        <span className="mc-icon mc-icon-glyph" aria-hidden="true">
          <span className="mc-glyph">{glyph}</span>
        </span>
        {card.badge ? (
          <span className="mc-badge recommended">{card.badge}</span>
        ) : (
          <span className="mc-badge-spacer" aria-hidden="true" />
        )}
      </div>
      <h4 className="punctuation-primary-mode-title">{card.label}</h4>
      <p className="punctuation-primary-mode-desc">{card.description}</p>
    </button>
  );
}

// --- Sub-components --------------------------------------------------------

function MonsterStarMeter({ monster }) {
  const cap = 100;
  const starsLabel = monster.id === 'quoral' ? 'Grand Stars' : 'Stars';
  // U3 (Phase 6): use monotonic displayStars / displayStage so a monster
  // never appears to de-evolve after evidence lapse.
  const stars = monster.displayStars ?? monster.totalStars;
  const stage = monster.displayStage ?? monster.starDerivedStage;
  const displayState = monster.displayState || (stars > 0 ? 'egg-found' : 'not-found');
  const pct = Math.min(100, Math.max(0, Math.round((stars / cap) * 100)));
  const stageText = punctuationStageLabel(stage, stars);

  // U3 (P2 refactor-ui): the bespoke `.punctuation-monster-meter-bar`
  // wrapper kept the old class name for the `data-display-state="not-found"`
  // greyscale rule (`styles/app.css:10600`) which selects the descendant
  // fill. The shared `ProgressMeter` primitive now renders the bar; the
  // accent token defaults to `var(--subject-accent)` (with `--brand`
  // fallback in the primitive's CSS rule) — the dedicated
  // `--punctuation-accent` token lands in U6.
  return (
    <div className="punctuation-monster-meter" data-monster-id={monster.id} data-display-state={displayState}>
      <div className="punctuation-monster-meter-name">{monster.name}</div>
      <div className="punctuation-monster-meter-stage">{stageText}</div>
      <ProgressMeter
        value={pct}
        label={`${monster.name} progress`}
        className="punctuation-monster-meter-bar"
      />
      <div className="punctuation-monster-meter-count">
        {`${stars} / ${cap} ${starsLabel}`}
      </div>
    </div>
  );
}

function CheckIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l6 6 10-14" />
    </svg>
  );
}

function ToggleChip({ pref, checked, label, actions, disabled = false }) {
  return (
    <button
      type="button"
      className={`toggle-chip${checked ? ' on' : ''}`}
      aria-pressed={checked ? 'true' : 'false'}
      data-action="punctuation-toggle-pref"
      data-pref={pref}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        actions.dispatch('punctuation-toggle-pref', { pref });
      }}
    >
      <span className="box" aria-hidden="true">{checked ? <CheckIcon /> : null}</span>
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

  // U4 (refactor ui-consolidation): hero backdrop contrast probe. Mode
  // argument is the constant string `'setup'` because Punctuation has no
  // tone / mode axis affecting the backdrop palette — the hook's mode-keyed
  // memo reduces to a no-op by design. We pass it as a literal so the
  // dependency array stays stable across renders. Card selectors cover the
  // shared mode-card row; control selectors cover the round-length row and
  // display options so their tone adapts alongside the cards.
  const heroContrast = useSetupHeroContrast(scene.src, 'setup', {
    staticContrastForBg: heroContrastProfileForPunctuationBg,
    cardSelector: '.punctuation-primary-mode',
    controlSelectors: ['.tool-label', '.length-unit', '.toggle-chip'],
    observeSelectors: [
      '.tool-label',
      '.length-unit',
      '.toggle-chip',
      '.punctuation-primary-mode',
      '.punctuation-monster-meter-name',
    ],
  });

  // One-shot stale-prefs migration (unchanged from Phase 3 U2).
  // P7-U2: moved from render body to useEffect for concurrent-mode safety.
  const migratedRef = useRef(false);
  const prefsMigrated = Boolean(ui && typeof ui === 'object' && !Array.isArray(ui) && ui.prefsMigrated);
  const storedMode = prefs && typeof prefs === 'object' && !Array.isArray(prefs)
    ? prefs.mode
    : null;
  const legacyCluster = typeof storedMode === 'string' && LEGACY_PUNCTUATION_MODE_IDS.has(storedMode);
  useEffect(() => {
    if (legacyCluster && !migratedRef.current && !prefsMigrated) {
      migratedRef.current = true;
      if (typeof actions.updateSubjectUi === 'function') {
        actions.updateSubjectUi('punctuation', { prefsMigrated: true });
      }
      actions.dispatch('punctuation-set-mode', { value: 'smart' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 4 U4 telemetry smoke — Setup mount.
  // P7-U2: moved from render body to useEffect for concurrent-mode safety.
  const cardOpenedRef = useRef(false);
  useEffect(() => {
    if (!cardOpenedRef.current) {
      cardOpenedRef.current = true;
      emitPunctuationEvent('card-opened', { cardId: 'smart' }, {
        actions,
        learnerId: learner && typeof learner === 'object' ? learner.id : null,
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedLengthValue = selectedRoundLength(prefs);

  // CTA resolution
  const cta = resolvePrimaryCta(stats, ui);
  const selectedMode = punctuationPrimaryModeFromPrefs(prefs);
  const freshLabel = freshLearnerCtaLabel(dashboard.isEmpty);
  const selectedCardLabel = PUNCTUATION_PRIMARY_MODE_CARDS.find((card) => card.id === selectedMode)?.label
    || 'Smart Review';
  const startLabel = selectedMode === 'weak'
    ? 'Tackle wobbly spots'
    : selectedMode === 'gps'
      ? 'Start GPS Check'
      : "Start today's round";
  const ctaLabel = cta.mode === 'continue'
    ? cta.label
    : freshLabel || startLabel || `Start ${selectedCardLabel}`;
  const ctaMode = cta.mode;

  // Progress row values
  const dueCount = Number(stats?.due) || 0;
  const weakCount = Number(stats?.weak) || 0;
  // P7-U7: replaced the ambiguous "Stars earned" aggregate (which summed
  // direct monster Stars + Grand Stars into one confusing number) with
  // Quoral's Grand Stars — the cross-monster overall progress metric.
  // Individual monster meters already show per-monster Star totals, so
  // the aggregate was redundant. Grand Stars is the only metric that
  // represents whole-subject progress without double-counting.
  const grandStars = dashboard.grandStars;

  const learnerName = learner && typeof learner === 'object' && !Array.isArray(learner)
    && typeof learner.name === 'string' && learner.name.trim()
    ? learner.name.trim()
    : '';

  const monsterVisualConfig = useMonsterVisualConfig();
  const panelMonsterVisuals = dashboard.activeMonsters
    .filter((m) => (m.displayStars ?? m.totalStars) > 0)
    .slice(0, 4)
    .map((m) => ({
      id: m.id,
      visual: punctuationMonsterImageVisual(m.id, m.displayStage ?? m.starDerivedStage, monsterVisualConfig?.config),
      isEgg: (m.displayStage ?? m.starDerivedStage) === 0,
    }));

  function handlePrimaryCta() {
    if (disabled) return;
    const command = resolvePunctuationSetupBeginCommand({
      ctaMode,
      selectedMode,
      roundLength: selectedLengthValue,
    });
    actions.dispatch(command.action, command.data);
  }

  // U4: `.setup-main` needs a `.hero-dark` class when the shell probe
  // reports a light tone, mirroring Grammar/Spelling. Tone is always the
  // empty string for Punctuation (no tone axis — see punctuation-hero-bg.js
  // comment) but the shell/controls keys still flow through the hook.
  const setupClasses = ['setup-main', 'punctuation-setup-main'];
  if (heroContrast.contrast.shell === 'light') setupClasses.push('hero-dark');

  return (
    <PracticeStage subjectId="punctuation" scene="setup" backdrop="punctuation-map" motion="calm">
    <section
      className="punctuation-surface punctuation-setup-scene punctuation-mission-dashboard"
      data-punctuation-phase="setup"
    >
      <div className="setup-grid">
        <section
          className={setupClasses.join(' ')}
          data-hero-tone={heroContrast.contrast.tone || undefined}
          data-controls-tone={heroContrast.contrast.controls}
          ref={heroContrast.ref}
          aria-label="Today's punctuation mission"
        >
          <HeroBackdrop url={scene.src} extraBackdropClassName="punctuation-hero-backdrop" />

          {/* Content stacks vertically inside the setup-main shell. The
           * `data-section="hero"` landmark moves ONTO the content wrapper
           * because `HeroBackdrop` now paints the background and carries
           * no semantics of its own. The rest of the dashboard (mode
           * cards, progress row, controls, begin row, map link) stays in
           * the same stacked order inside `.setup-content`. */}
          <div className="setup-content" data-section="hero">
            <div className="eyebrow">Bellstorm Coast</div>
            <h2 className="section-title">Today's punctuation mission</h2>
            <HeroWelcome name={learnerName} className="punctuation-hero-welcome" />

            <div className="mode-row punctuation-mode-row" data-section="secondary" aria-label="Practice options">
              {PUNCTUATION_PRIMARY_MODE_CARDS.map((card, index) => (
                <PrimaryModeCard
                  card={card}
                  selected={card.id === selectedMode}
                  disabled={disabled}
                  roundLength={selectedLengthValue}
                  actions={actions}
                  textTone={heroContrast.contrast.cards?.[index] || heroContrast.contrast.shell}
                  key={card.id}
                />
              ))}
            </div>

            {/* Progress row — compact stats strip. Each metric renders as a
             * shared StatCard primitive so the dt/dd label-value pairing
             * announces consistently. The legacy
             * `.punctuation-progress-strip` / `.punctuation-progress-item`
             * classes stay on the wrapper + each card so the existing
             * spacing rules (`styles/app.css:10554`) survive byte-identical;
             * the StatCard primitive's own `.stat-card` rule is a thin
             * baseline-aligned row that inherits these. */}
            <section className="punctuation-progress-row" data-section="progress-row" aria-label="Today at a glance">
              <div className="punctuation-progress-strip">
                <StatCard
                  label="Due today"
                  value={dueCount}
                  className="punctuation-progress-item"
                />
                <StatCard
                  label="Wobbly"
                  value={weakCount}
                  className="punctuation-progress-item"
                />
                <StatCard
                  label="Grand Stars"
                  value={grandStars}
                  className="punctuation-progress-item"
                  data-metric="grand-stars"
                />
              </div>
            </section>

            <div className="setup-control-stack punctuation-control-stack">
              <div className="tweak-row punctuation-round-controls">
                <span className="tool-label punctuation-round-label">Round length</span>
                <LengthPicker
                  options={PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS}
                  selectedValue={selectedLengthValue}
                  onChange={(value) => actions.dispatch('punctuation-set-round-length', { value })}
                  disabled={disabled}
                  ariaLabel="Round length"
                  actionName="punctuation-set-round-length"
                  includeDataValue={true}
                />
                <span className="length-unit">questions</span>
              </div>
              <div
                className="tweak-row punctuation-round-controls punctuation-display-options"
                role="group"
                aria-labelledby="punctuation-display-options-label"
              >
                <span id="punctuation-display-options-label" className="tool-label punctuation-round-label">Options</span>
                <ToggleChip
                  pref="showFadedGuidance"
                  checked={prefs?.showFadedGuidance !== false}
                  label="Faded guidance"
                  actions={actions}
                  disabled={disabled}
                />
                <ToggleChip
                  pref="showNonScoredBanner"
                  checked={prefs?.showNonScoredBanner !== false}
                  label="Non-scored banner"
                  actions={actions}
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="setup-begin-row punctuation-start-row">
              {/* Stable journey-spec selector: Button emits data-action="punctuation-start" for fresh mode starts. */}
              <Button
                size="xl"
                data-punctuation-cta=""
                data-round-length={ctaMode === 'continue' ? undefined : selectedLengthValue}
                dataAction={ctaMode === 'continue' ? 'punctuation-continue' : 'punctuation-start'}
                disabled={disabled}
                onClick={handlePrimaryCta}
              >
                {ctaLabel}
              </Button>
            </div>
          </div>
        </section>

        <SetupSidePanel
          asideClassName="punctuation-setup-sidebar"
          cardClassName="punctuation-setup-sidebar-card"
          ariaLabel="Your monsters"
          body={(
            <SubjectCompanionPanel
              subjectId="punctuation"
              visible
              head={(
                <>
                  <p className="eyebrow">Your monsters</p>
                  <button
                    type="button"
                    className="ss-codex-link"
                    data-action="open-codex"
                    aria-label="Open the full codex"
                    onClick={() => actions.dispatch('open-codex')}
                  >
                    Open codex →
                  </button>
                </>
              )}
              monsterVisuals={panelMonsterVisuals}
              meadowEmpty="Start practising to discover your first egg."
              stats={[
                { label: 'Due today', value: String(dueCount), tone: dueCount > 0 ? 'warn' : undefined },
                { label: 'Wobbly', value: String(weakCount) },
                { label: 'Grand Stars', value: String(grandStars) },
              ]}
              nextFocus={weakCount > 0 ? 'Wobbly spots need practice' : ''}
            />
          )}
          footer={(
            <button
              type="button"
              className="ss-bank-link punctuation-setup-sidebar-map-link"
              data-action="punctuation-open-map"
              data-section="map-link"
              onClick={() => {
                if (disabled) return;
                actions.dispatch('punctuation-open-map');
              }}
              disabled={disabled}
            >
              <span className="ss-bank-link-body">
                <span className="ss-bank-link-head">Open Punctuation Map</span>
                <span className="ss-bank-link-sub">Explore all monsters and their habitats.</span>
              </span>
              <span className="ss-bank-link-arrow" aria-hidden="true">→</span>
            </button>
          )}
        />
      </div>
    </section>
    </PracticeStage>
  );
}
