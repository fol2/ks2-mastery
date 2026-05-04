import { HeroBackdrop } from '../../../platform/ui/HeroBackdrop.jsx';
import { useSetupHeroContrast } from '../../../platform/ui/useSetupHeroContrast.js';
import { heroBgStyle } from '../../../platform/ui/hero-bg.js';
import { SetupMorePractice } from '../../../platform/ui/SetupMorePractice.jsx';
import { LengthPicker } from '../../../platform/ui/LengthPicker.jsx';
import { HeroWelcome } from '../../../platform/ui/HeroWelcome.jsx';
import { SetupSidePanel } from '../../../platform/ui/SetupSidePanel.jsx';
import {
  heroBgForGrammarSetup,
  heroContrastProfileForGrammarBg,
  heroToneForGrammarBg,
} from './grammar-hero-bg.js';
import {
  grammarMonsterAsset,
} from '../metadata.js';
import {
  GRAMMAR_DASHBOARD_HERO,
  GRAMMAR_MORE_PRACTICE_MODES,
  GRAMMAR_PRIMARY_MODE_CARDS,
  buildGrammarDashboardModel,
  grammarMonsterImageVisual,
} from './grammar-view-model.js';
import { useMonsterVisualConfig } from '../../../platform/game/MonsterVisualConfigContext.jsx';
import { EmptyState } from '../../../platform/ui/EmptyState.jsx';
import { Button } from '../../../platform/ui/Button.jsx';
import { SubjectCompanionPanel } from '../../../platform/ui/SubjectCompanionPanel.jsx';
import { PracticeStage } from '../../../platform/ui/PracticeStage.jsx';
import {
  GRAMMAR_STAR_STAGE_THRESHOLDS,
} from '../../../../shared/grammar/grammar-stars.js';

/* Aligned Grammar setup scene.
 *
 * The previous layout collapsed hero copy + mode cards + controls into
 * a bespoke `.grammar-primary-modes` panel with a static `<picture>`
 * backdrop. The aligned design uses the same `.setup-grid` /
 * `.setup-main` / `.setup-content` rhythm Spelling does, paints the
 * region artwork via the shared `HeroBackdrop` (cross-fade + slow pan),
 * and reads contrast tokens from the platform `useSetupHeroContrast`
 * hook so text colour adapts to whatever artwork is on screen.
 *
 * Outer landmark + every existing `data-*` and `.grammar-*` test hook
 * is preserved (`data-grammar-phase-root="dashboard"`,
 * `.grammar-primary-mode`, `[data-action="grammar-set-mode"]`, etc).
 *
 * Round length is now a slide-button picker (`.length-picker`) instead
 * of a `<select>`, mirroring Spelling's tweak-row pattern. */

const NORMAL_ROUND_OPTIONS = ['3', '5', '8', '10', '15'];
const MINI_TEST_ROUND_OPTIONS = ['8', '12'];
const DEEP_PRACTICE_MILESTONES = Object.freeze([
  GRAMMAR_STAR_STAGE_THRESHOLDS.egg,
  GRAMMAR_STAR_STAGE_THRESHOLDS.hatch,
  GRAMMAR_STAR_STAGE_THRESHOLDS.evolve2,
  GRAMMAR_STAR_STAGE_THRESHOLDS.evolve3,
  GRAMMAR_STAR_STAGE_THRESHOLDS.mega,
]);

function practiceDepthForSelection(mode, selectedLength) {
  const count = Number(selectedLength) || 5;
  if (mode === 'satsset') {
    return {
      id: count >= 12 ? 'mini-test-12' : 'mini-test-8',
      label: count >= 12 ? 'Mini-test · 12 questions' : 'Mini-test · 8 questions',
      startLabel: 'Start Mini Test',
    };
  }
  if (count >= 10) {
    return {
      id: 'deep-practice',
      label: `Deep practice · ${count} questions`,
      startLabel: 'Start Deep Practice',
    };
  }
  if (count === 5) {
    return {
      id: 'quick-practice',
      label: 'Quick practice · 5 questions',
      startLabel: 'Start Quick Practice',
    };
  }
  return {
    id: 'bridge-practice',
    label: `${count} question practice`,
    startLabel: 'Start Practice',
  };
}

function isNearGrammarMilestone(monsterStrip = []) {
  return (Array.isArray(monsterStrip) ? monsterStrip : []).some((entry) => {
    const stars = Number(entry?.stars);
    if (!Number.isFinite(stars) || stars < 0) return false;
    const nextMilestone = DEEP_PRACTICE_MILESTONES.find((milestone) => stars < milestone);
    return Number.isFinite(nextMilestone) && nextMilestone - stars <= 5;
  });
}

function isRepeatingEasyGrammarWork(recentAttempts = []) {
  const recentCorrect = (Array.isArray(recentAttempts) ? recentAttempts : [])
    .slice(-6)
    .filter((attempt) => {
      const result = attempt?.result || {};
      return result.correct === true && result.nonScored !== true && result.manualReviewOnly !== true;
    });
  if (recentCorrect.length < 4) return false;
  const templateCounts = new Map();
  for (const attempt of recentCorrect) {
    const templateId = typeof attempt?.templateId === 'string' ? attempt.templateId : '';
    if (!templateId) continue;
    templateCounts.set(templateId, (templateCounts.get(templateId) || 0) + 1);
  }
  return [...templateCounts.values()].some((count) => count >= 3);
}

function MonsterStripEntry({ entry }) {
  const pct = entry.starMax > 0 ? Math.round((entry.stars / entry.starMax) * 100) : 0;
  const displayState = entry.displayState || 'not-found';
  return (
    <div className="grammar-monster-entry" data-monster-id={entry.monsterId} data-display-state={displayState}>
      <img
        className="grammar-monster-entry-image"
        src={grammarMonsterAsset(entry.monsterId, 320)}
        alt=""
        aria-hidden="true"
      />
      <div className="grammar-monster-entry-info">
        <span className="grammar-monster-entry-name">{entry.name}</span>
        <span className="grammar-monster-entry-stage">{entry.stageName}</span>
        <div className="grammar-star-bar" aria-label={`${entry.stars} of ${entry.starMax} Stars`}>
          <div
            className="grammar-star-bar-fill"
            style={{ width: `${pct}%`, backgroundColor: entry.accentColor }}
          />
        </div>
        <span className="grammar-monster-entry-stars">{`${entry.stars} / ${entry.starMax} Stars`}</span>
      </div>
    </div>
  );
}

function PrimaryModeCard({ card, selected, disabled, actions, textTone = 'dark' }) {
  const featured = card.featured === true;
  // The card carries `.grammar-primary-mode` (the existing test hook +
  // brand variant) AND `.mode-card` (the shared visual identity that
  // Spelling tunes). Keep `grammar-primary-mode` FIRST in the class
  // string so existing tests pinning `class="grammar-primary-mode..."`
  // still match exactly. Both classes apply regardless of order at the
  // CSS layer.
  const classes = ['grammar-primary-mode', 'mode-card'];
  if (selected && !disabled) classes.push('selected');
  if (disabled) classes.push('is-disabled');
  if (featured) classes.push('is-recommended');
  const disabledEmpty = disabled && card.disabledWhenNoTrouble === true;
  const showBadge = featured ? card.badge || 'RECOMMENDED' : null;
  const badgeIsPlaceholder = !showBadge && disabledEmpty;
  const description = disabledEmpty && card.disabledCopy ? card.disabledCopy : card.desc;
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-mode-id={card.id}
      data-action="grammar-set-mode"
      data-featured={featured ? 'true' : 'false'}
      data-text-tone={textTone}
      aria-pressed={selected && !disabled ? 'true' : 'false'}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        actions.dispatch('grammar-set-mode', { value: card.id });
      }}
    >
      <div className="mc-top">
        <span className="mc-icon mc-icon-glyph" aria-hidden="true">
          <span className="mc-glyph">{card.title.charAt(0)}</span>
        </span>
        {showBadge ? (
          <span className={`mc-badge${featured ? ' recommended' : ''}`}>{showBadge}</span>
        ) : badgeIsPlaceholder ? (
          <span className="mc-badge is-placeholder">NONE YET</span>
        ) : (
          <span className="mc-badge-spacer" aria-hidden="true" />
        )}
      </div>
      <h4 className="grammar-primary-mode-title">{card.title}</h4>
      <p className="grammar-primary-mode-desc">{description}</p>
    </button>
  );
}

function MoreModeCard({ card, selected, disabled, actions }) {
  const classes = ['grammar-secondary-mode'];
  if (selected) classes.push('selected');
  if (disabled) classes.push('is-disabled');
  const label = typeof card.label === 'string' && card.label ? card.label : '';
  const isTransfer = card.id === 'transfer';
  const action = isTransfer ? 'grammar-open-transfer' : 'grammar-set-mode';
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-mode-id={card.id}
      data-action={action}
      aria-pressed={selected ? 'true' : 'false'}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        if (isTransfer) {
          actions.dispatch('grammar-open-transfer');
          return;
        }
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
  // U6 Phase 6: build concept nodes map + recent attempts so the dashboard
  // model reflects live evidence, not just persisted star high-water.
  const conceptNodesMap = {};
  const analyticsConcepts = Array.isArray(grammar?.analytics?.concepts) ? grammar.analytics.concepts : [];
  for (const c of analyticsConcepts) {
    if (c && typeof c === 'object' && typeof c.id === 'string') {
      conceptNodesMap[c.id] = c;
    }
  }
  const recentAttempts = Array.isArray(grammar?.analytics?.recentAttempts) ? grammar.analytics.recentAttempts : [];

  const dashboard = buildGrammarDashboardModel(grammar, learner, rewardState, conceptNodesMap, recentAttempts);
  const selectedMode = dashboard.primaryMode;
  const miniTestMode = selectedMode === 'satsset';
  const setupDisabled = runtimeReadOnly || Boolean(grammar.pendingCommand);

  const lengthOptions = miniTestMode ? MINI_TEST_ROUND_OPTIONS : NORMAL_ROUND_OPTIONS;
  const rawLength = Number(grammar.prefs?.roundLength);
  const selectedLength = miniTestMode
    ? (rawLength >= 10 ? '12' : '8')
    : (Number.isFinite(rawLength) && rawLength > 0 ? String(rawLength) : '5');
  const selectedDepth = practiceDepthForSelection(selectedMode, selectedLength);
  const { title: heroTitle, subtitle: heroSubtitle } = GRAMMAR_DASHBOARD_HERO;

  const troubleCard = (dashboard.todayCards || []).find((card) => card.id === 'trouble');
  const troubleCount = Number(troubleCard?.value || 0);

  const monsterVisualConfig = useMonsterVisualConfig();
  const panelMonsterVisuals = dashboard.monsterStrip
    .filter((entry) => entry.displayState !== 'not-found')
    .slice(0, 4)
    .map((entry) => ({
      id: entry.monsterId,
      visual: grammarMonsterImageVisual(entry.monsterId, entry.stageIndex, monsterVisualConfig?.config),
      isEgg: entry.stageIndex === 0,
    }));

  const selectedModeCard = GRAMMAR_PRIMARY_MODE_CARDS.find((card) => card.id === selectedMode);
  const selectedModeStartLabel = selectedMode === 'trouble'
    ? 'Fix Trouble Spots'
    : selectedMode === 'satsset'
      ? 'Start Mini Test'
      : selectedDepth.startLabel || `Start ${selectedModeCard?.title || 'Smart Practice'}`;
  const deepRecommendationReason = troubleCount > 0
    ? 'repair'
    : isNearGrammarMilestone(dashboard.monsterStrip)
      ? 'milestone'
      : isRepeatingEasyGrammarWork(recentAttempts)
        ? 'variety'
        : '';
  const deepRecommended = !miniTestMode && Boolean(deepRecommendationReason) && Number(selectedLength) < 10;

  // Hero backdrop URL + contrast probe. The hook reads the curated
  // per-tone profile when one is available and falls back to a runtime
  // luminance probe when the active artwork is outside the table.
  const heroBg = heroBgForGrammarSetup(learner?.id || '', { mode: selectedMode });
  const mergedHeroStyle = { ...heroBgStyle(heroBg) };
  const heroContrast = useSetupHeroContrast(heroBg, selectedMode, {
    staticContrastForBg: heroContrastProfileForGrammarBg,
    cardSelector: '.grammar-primary-mode',
    controlSelectors: ['.tool-label', '.length-unit'],
  });
  const heroTone = heroContrast.contrast.tone || heroToneForGrammarBg(heroBg);
  const setupClasses = ['setup-main', 'grammar-setup-main'];
  if (heroContrast.contrast.shell === 'light') setupClasses.push('hero-dark');

  const openConceptBank = () => actions.dispatch('grammar-open-concept-bank');

  return (
    <PracticeStage subjectId="grammar" scene="setup" backdrop="library" motion="calm">
    <section
      className="grammar-dashboard"
      aria-labelledby="grammar-dashboard-title"
      data-grammar-phase-root="dashboard"
    >
      <div className="setup-grid">
        <section
          className={setupClasses.join(' ')}
          data-react-hero-contrast="true"
          data-hero-tone={heroTone || undefined}
          data-controls-tone={heroContrast.contrast.controls}
          ref={heroContrast.ref}
          style={mergedHeroStyle}
          aria-label="Start practising"
        >
          <HeroBackdrop url={heroBg} />
          <div className="setup-content">
            <p className="eyebrow">Grammar · today</p>
            <h1 id="grammar-dashboard-title" className="title grammar-hero-title">{heroTitle}</h1>
            <p className="lede grammar-hero-subtitle">{heroSubtitle}</p>
            <HeroWelcome name={learner?.name} className="grammar-hero-welcome" />

            <div className="mode-row grammar-mode-row">
              {GRAMMAR_PRIMARY_MODE_CARDS.map((card, index) => {
                const cardDisabled = setupDisabled
                  || (card.disabledWhenNoTrouble === true && troubleCount === 0);
                return (
                  <PrimaryModeCard
                    card={card}
                    selected={card.id === selectedMode}
                    disabled={cardDisabled}
                    actions={actions}
                    textTone={heroContrast.contrast.cards[index] || heroContrast.contrast.shell}
                    key={card.id}
                  />
                );
              })}
            </div>

            <div className="setup-control-stack">
              <div className="tweak-row">
                <span className="tool-label">{miniTestMode ? 'Mini-set size' : 'Round length'}</span>
                <LengthPicker
                  options={lengthOptions}
                  selectedValue={selectedLength}
                  onChange={(value) => actions.dispatch('grammar-set-round-length', { value })}
                  disabled={setupDisabled}
                  ariaLabel={miniTestMode ? 'Mini-set size' : 'Round length'}
                  unit="questions"
                  actionName="grammar-set-round-length"
                  prefKey="roundLength"
                />
                <span className="length-unit" data-session-depth={selectedDepth.id}>{selectedDepth.label}</span>
              </div>
              {deepRecommended ? (
                <div
                  className="tool-label"
                  data-session-depth-recommendation="deep-practice"
                  data-session-depth-reason={deepRecommendationReason}
                >
                  Deep practice recommended today
                </div>
              ) : null}
            </div>

            {grammar.error ? (
              <div className="feedback bad" role="alert">
                <strong>Grammar is unavailable right now</strong>
                <div>{grammar.error}</div>
              </div>
            ) : null}

            <div className="setup-begin-row grammar-start-row">
              <Button
                size="xl"
                data-featured="true"
                disabled={setupDisabled}
                onClick={() => actions.dispatch('grammar-start')}
              >
                {grammar.pendingCommand === 'start-session'
                  ? 'Starting...'
                  : selectedModeStartLabel}
              </Button>
            </div>
          </div>
        </section>

        <SetupSidePanel
          asideClassName="grammar-setup-sidebar"
          cardClassName="grammar-setup-sidebar-card"
          ariaLabel="Where you stand"
          body={(
            <>
            {dashboard.isEmpty ? (
              <div className="grammar-today-empty" data-testid="grammar-today-empty">
                <EmptyState
                  title="No rounds yet"
                  body="No rounds yet. Progress is saved as you practise. Start your first round to see your scores here."
                />
              </div>
            ) : null}
            <SubjectCompanionPanel
              subjectId="grammar"
              visible
              head={(
                <>
                  <p className="eyebrow">Where you stand</p>
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
              meadowEmpty="Start practising to see your Grammar creatures."
              stats={[
                { label: 'Concepts', value: String(dashboard.concordiumProgress?.total ?? 0) },
                { label: 'Secure', value: String(dashboard.todayCards?.find(c => c.id === 'secure')?.value ?? 0) },
                { label: 'Trouble', value: String(troubleCount), tone: troubleCount > 0 ? 'warn' : undefined },
                { label: 'Due today', value: String(dashboard.todayCards?.find(c => c.id === 'due')?.value ?? 0), tone: (dashboard.todayCards?.find(c => c.id === 'due')?.value ?? 0) > 0 ? 'warn' : undefined },
              ]}
              nextFocus={troubleCount > 0 ? 'Trouble concepts need revision' : ''}
            />
            </>
          )}
          footer={(
            <button
              type="button"
              className="ss-bank-link grammar-setup-sidebar-bank-link"
              data-action="grammar-open-concept-bank"
              onClick={openConceptBank}
              disabled={setupDisabled}
            >
              <span className="ss-bank-link-body grammar-setup-sidebar-bank-link-body">
                <span className="ss-bank-link-head grammar-setup-sidebar-bank-link-head">Browse the Grammar Bank</span>
                <span className="ss-bank-link-sub grammar-setup-sidebar-bank-link-sub">Every concept, with progress and accuracy.</span>
              </span>
              <span className="ss-bank-link-arrow grammar-setup-sidebar-bank-link-arrow" aria-hidden="true">→</span>
            </button>
          )}
        />

        {/* "More practice" disclosure — optional, decision-light tail of
         * secondary modes (Learn / Surgery / Builder / Worked / Faded /
         * Writing Try). Lives INSIDE `.setup-grid` at row 2 column 1
         * so its width matches `.setup-main` exactly. The disclosure is
         * still detached from the panel itself (own div, opt-in
         * `<details>`) so the primary panel keeps the single CTA. */}
        <SetupMorePractice
          summary="More practice"
          disclosureClassName="setup-more-practice grammar-more-practice"
          gridClassName="setup-more-practice-grid grammar-more-practice-grid"
          cards={GRAMMAR_MORE_PRACTICE_MODES.filter(
            (m) => m.id !== 'transfer' || dashboard.writingTryAvailable,
          )}
          renderCard={(card) => (
            <MoreModeCard
              card={card}
              selected={card.id === selectedMode}
              disabled={setupDisabled}
              actions={actions}
              key={card.id}
            />
          )}
        />
      </div>
    </section>
    </PracticeStage>
  );
}
