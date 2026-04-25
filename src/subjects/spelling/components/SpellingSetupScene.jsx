import React from 'react';
import { useMonsterVisualConfig } from '../../../platform/game/MonsterVisualConfigContext.jsx';
import { SpellingHeroBackdrop } from './SpellingHeroBackdrop.jsx';
import { ArrowRightIcon, CheckIcon } from './spelling-icons.jsx';
import { useSetupHeroContrast } from './useSetupHeroContrast.js';
import {
  MODE_CARDS,
  POST_MEGA_MODE_CARDS,
  ROUND_LENGTH_OPTIONS,
  YEAR_FILTER_OPTIONS,
  beginLabel,
  heroBgForSetup,
  heroBgStyle,
  heroToneForBg,
  monsterImageVisual,
  renderAction,
} from './spelling-view-model.js';

function ModeCard({ mode, selected, disabled = false, description, badge, actions, textTone = 'dark' }) {
  const desc = description != null ? description : mode.desc;
  const classes = ['mode-card'];
  if (selected && !disabled) classes.push('selected');
  if (disabled) classes.push('is-disabled');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-text-tone={textTone}
      data-action="spelling-set-mode"
      value={mode.id}
      aria-pressed={selected && !disabled ? 'true' : 'false'}
      disabled={disabled}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={(event) => renderAction(actions, event, 'spelling-set-mode', { value: mode.id })}
    >
      <div className="mc-top">
        <div className="mc-icon"><img src={mode.iconSrc} alt="" loading="eager" decoding="async" /></div>
        <span className={`mc-badge${badge ? '' : ' is-placeholder'}`}>{badge || 'NONE YET'}</span>
      </div>
      <h4>{mode.title}</h4>
      <p>{desc}</p>
    </button>
  );
}

/* Post-Mega cards render a typographic glyph instead of a webp asset — we
 * have not drawn Guardian / Boss / Detective / Story art yet, and shipping
 * a generic spotlight icon would cheapen the graduation moment. The glyph
 * sits inside the same mc-icon frame so the card silhouette stays identical
 * to the legacy MODE_CARDS rhythm. */
function ModeCardGlyph({ glyph }) {
  return (
    <div className="mc-icon mc-icon-glyph" aria-hidden="true">
      <span className="mc-glyph">{glyph}</span>
    </div>
  );
}

function PostMegaModeCard({
  mode,
  variant,
  description,
  badge,
  index,
  textTone = 'dark',
  disabled = false,
  active = false,
}) {
  const classes = ['mode-card', 'mode-card-post'];
  if (variant) classes.push(`mode-card-post--${variant}`);
  if (disabled) classes.push('is-disabled');
  if (active) classes.push('is-active-duty');
  const roadmapNumber = typeof index === 'number' ? String(index + 1).padStart(2, '0') : null;
  return (
    <div
      className={classes.join(' ')}
      data-text-tone={textTone}
      data-mode-id={mode.id}
      aria-disabled={disabled ? 'true' : undefined}
    >
      <div className="mc-top">
        <ModeCardGlyph glyph={mode.glyph || mode.title?.[0] || '·'} />
        {badge ? (
          <span className={`mc-badge mc-badge-post${variant ? ` mc-badge-post--${variant}` : ''}`}>{badge}</span>
        ) : roadmapNumber ? (
          <span className="mc-badge mc-badge-post mc-badge-roadmap">
            <span className="mc-badge-roadmap-label">Next</span>
            <span className="mc-badge-roadmap-index">{roadmapNumber}</span>
          </span>
        ) : null}
      </div>
      <h4>{mode.title}</h4>
      <p>{description != null ? description : mode.desc}</p>
      {/* The Guardian card intentionally does NOT host an inline Begin button
       * — a single primary CTA lives in the setup-begin-row below so there
       * is one clear "start now" affordance per scene. In the rested state
       * we surface a static "Rested" chip instead. */}
      {variant === 'rested' ? (
        <span className="mode-card-post-status" role="status">Rested</span>
      ) : null}
    </div>
  );
}

function GraduationStatRibbon({ postMastery, secureCount }) {
  const dueCount = Math.max(0, Number(postMastery?.guardianDueCount) || 0);
  const wobblingCount = Math.max(0, Number(postMastery?.wobblingCount) || 0);
  const today = Number.isFinite(Number(postMastery?.todayDay)) ? Math.floor(Number(postMastery.todayDay)) : 0;
  const nextDue = Number.isFinite(Number(postMastery?.nextGuardianDueDay)) ? Math.floor(Number(postMastery.nextGuardianDueDay)) : null;
  const nextDueDelta = nextDue == null ? null : nextDue - today;

  const items = [];
  if (Number.isFinite(secureCount) && secureCount > 0) {
    items.push({ label: 'Words secured', value: String(secureCount) });
  }
  items.push({
    label: 'Due today',
    value: String(dueCount),
    accent: dueCount > 0 ? 'due' : null,
  });
  if (wobblingCount > 0) {
    items.push({ label: 'Wobbling', value: String(wobblingCount), accent: 'wobbling' });
  }
  if (nextDueDelta !== null && dueCount === 0) {
    items.push({
      label: 'Next check',
      value: nextDueDelta <= 0 ? 'today' : nextDueDelta === 1 ? 'tomorrow' : `in ${nextDueDelta} days`,
    });
  }

  return (
    <dl className="post-mega-stat-ribbon" aria-label="Guardian duty overview">
      {items.map((item) => (
        <div
          className={`post-mega-stat${item.accent ? ` post-mega-stat--${item.accent}` : ''}`}
          key={item.label}
        >
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LengthPicker({ prefs, actions, disabled = false }) {
  const selectedValue = String(prefs.roundLength || '10');
  const selectedIndex = Math.max(0, ROUND_LENGTH_OPTIONS.indexOf(selectedValue));
  return (
    <div className="length-control">
      <div
        className="length-picker"
        role="radiogroup"
        aria-label="Round length"
        style={{ '--option-count': String(ROUND_LENGTH_OPTIONS.length), '--selected-index': String(selectedIndex) }}
      >
        <span className="length-slider" aria-hidden="true" />
        {ROUND_LENGTH_OPTIONS.map((value) => {
          const selected = selectedValue === value;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={selected ? 'true' : 'false'}
              className={`length-option${selected ? ' selected' : ''}`}
              data-action="spelling-set-pref"
              data-pref="roundLength"
              value={value}
              disabled={disabled}
              key={value}
              onClick={(event) => renderAction(actions, event, 'spelling-set-pref', { pref: 'roundLength', value })}
            >
              <span>{value}</span>
            </button>
          );
        })}
      </div>
      <span className="length-unit">words</span>
    </div>
  );
}

function YearPicker({ prefs, actions, disabled = false }) {
  const selectedValue = prefs.yearFilter || 'core';
  const selectedIndex = Math.max(0, YEAR_FILTER_OPTIONS.findIndex((option) => option.value === selectedValue));
  return (
    <div
      className="length-picker"
      role="radiogroup"
      aria-label="Spelling pool"
      style={{ '--option-count': String(YEAR_FILTER_OPTIONS.length), '--selected-index': String(selectedIndex) }}
    >
      <span className="length-slider" aria-hidden="true" />
      {YEAR_FILTER_OPTIONS.map(({ value, label }) => {
        const selected = selectedValue === value;
        return (
          <button
            type="button"
            role="radio"
            aria-checked={selected ? 'true' : 'false'}
            className={`length-option${selected ? ' selected' : ''}`}
            data-action="spelling-set-pref"
            data-pref="yearFilter"
            value={value}
            disabled={disabled}
            key={value}
            onClick={(event) => renderAction(actions, event, 'spelling-set-pref', { pref: 'yearFilter', value })}
          >
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ToggleChip({ pref, checked, label, actions, disabled = false }) {
  return (
    <button
      type="button"
      className={`toggle-chip${checked ? ' on' : ''}`}
      aria-pressed={checked ? 'true' : 'false'}
      data-action="spelling-toggle-pref"
      data-pref={pref}
      disabled={disabled}
      onClick={(event) => renderAction(actions, event, 'spelling-toggle-pref', { pref })}
    >
      <span className="box" aria-hidden="true">{checked ? <CheckIcon /> : null}</span>
      {label}
    </button>
  );
}

export function SetupMeadow({ codex }) {
  const monsterVisualConfig = useMonsterVisualConfig();
  const caught = (Array.isArray(codex) ? codex : []).filter((entry) => entry?.progress?.caught);
  const shown = caught.slice(0, 4);
  if (!shown.length) {
    return <div className="ss-meadow-empty small muted">Catch your first monster to populate this meadow.</div>;
  }
  return (
    <div className="ss-meadow" aria-label={`${shown.length} caught monster${shown.length === 1 ? '' : 's'}`}>
      {shown.map(({ monster, progress }) => {
        const visual = monsterImageVisual(monster, progress, monsterVisualConfig?.config);
        return (
          <div className={`ss-meadow-cell${progress.stage === 0 ? ' egg' : ''}`} key={monster.id}>
            <span className="ss-meadow-visual" style={visual.style}>
              <img className="ss-meadow-art" alt="" {...visual.imageProps} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SetupStatGrid({ stats }) {
  const cells = [
    { label: 'Total spellings', value: stats.total },
    { label: 'Secure', value: stats.secure },
    { label: 'Due today', value: stats.due, warn: true },
    { label: 'Weak spots', value: stats.trouble },
    { label: 'Unseen', value: stats.fresh },
    { label: 'Accuracy', value: stats.accuracy == null ? '—' : `${stats.accuracy}%` },
  ];
  return (
    <div className="ss-stat-grid">
      {cells.map((cell) => (
        <div className="ss-stat" key={cell.label}>
          <div className="ss-stat-label">{cell.label}</div>
          <div className="ss-stat-value" style={cell.warn ? { color: 'var(--warn-strong)' } : undefined}>{cell.value}</div>
        </div>
      ))}
    </div>
  );
}

export function SpellingSetupScene({
  learner,
  service,
  repositories,
  subject,
  prefs,
  ui,
  codex,
  accent,
  actions,
  postMastery,
  setupHeroTone = '',
  previousHeroBg = '',
  runtimeReadOnly = false,
}) {
  const statsFilter = prefs.mode === 'test' ? 'core' : prefs.yearFilter;
  const stats = service.getStats(learner.id, statsFilter);
  const heroBg = heroBgForSetup(learner.id, prefs, { tone: setupHeroTone });
  const mergedHeroStyle = { ...heroBgStyle(heroBg) };
  const heroContrast = useSetupHeroContrast(heroBg, prefs.mode);
  const heroTone = heroContrast.contrast.tone || heroToneForBg(heroBg);
  const setupClasses = ['setup-main'];
  const pendingCommand = ui?.pendingCommand || '';
  const preferenceControlsDisabled = runtimeReadOnly || Boolean(pendingCommand && pendingCommand !== 'save-prefs');
  const startDisabled = runtimeReadOnly || Boolean(pendingCommand);
  if (heroContrast.contrast.shell === 'light') setupClasses.push('hero-dark');
  const isPostMega = Boolean(postMastery?.allWordsMega);
  const contentClasses = ['setup-content'];
  if (isPostMega) contentClasses.push('setup-content--post-mega');

  return (
    <div className="setup-grid" style={{ gridColumn: '1/-1' }}>
      <section
        className={setupClasses.join(' ')}
        data-react-hero-contrast="true"
        data-hero-tone={heroTone || undefined}
        data-controls-tone={heroContrast.contrast.controls}
        data-post-mega={isPostMega ? 'true' : undefined}
        ref={heroContrast.ref}
        style={mergedHeroStyle}
      >
        <SpellingHeroBackdrop url={heroBg} previousUrl={previousHeroBg} />
        <div className={contentClasses.join(' ')}>
          {isPostMega ? (
            <PostMegaSetupContent
              prefs={prefs}
              accent={accent}
              actions={actions}
              postMastery={postMastery}
              stats={stats}
              heroContrast={heroContrast}
              pendingCommand={pendingCommand}
              startDisabled={startDisabled}
              runtimeReadOnly={runtimeReadOnly}
            />
          ) : (
            <LegacySetupContent
              prefs={prefs}
              accent={accent}
              actions={actions}
              stats={stats}
              heroContrast={heroContrast}
              pendingCommand={pendingCommand}
              preferenceControlsDisabled={preferenceControlsDisabled}
              startDisabled={startDisabled}
            />
          )}
        </div>
      </section>

      <aside className="setup-side">
        <div className="ss-card">
          <div className="ss-head">
            <p className="eyebrow">Where you stand</p>
            <button
              type="button"
              className="ss-codex-link"
              data-action="open-codex"
              aria-label="Open the full codex"
              onClick={(event) => renderAction(actions, event, 'open-codex')}
            >
              Open codex →
            </button>
          </div>
          <SetupMeadow codex={codex} repositories={repositories} />
          <SetupStatGrid stats={stats} />
          <button
            type="button"
            className="ss-bank-link"
            data-action="spelling-open-word-bank"
            onClick={(event) => renderAction(actions, event, 'spelling-open-word-bank')}
          >
            <span className="ss-bank-link-body">
              <span className="ss-bank-link-head">Browse the word bank</span>
              <span className="ss-bank-link-sub">Every word {learner.name} is learning, with progress and difficulty.</span>
            </span>
            <span className="ss-bank-link-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </aside>
    </div>
  );
}

function LegacySetupContent({
  prefs,
  accent,
  actions,
  stats,
  heroContrast,
  pendingCommand,
  preferenceControlsDisabled,
  startDisabled,
}) {
  const begin = beginLabel(prefs);
  const hideTweaks = prefs.mode === 'test';
  const tweakClass = `tweak-row${hideTweaks ? ' is-placeholder' : ''}`;
  const tweakAria = hideTweaks ? { 'aria-hidden': 'true' } : {};
  const showExtraFamilyOption = !hideTweaks && prefs.yearFilter === 'extra';
  const beginText = pendingCommand === 'start-session'
    ? 'Starting...'
    : pendingCommand === 'save-prefs'
      ? 'Saving...'
      : begin;

  return (
    <>
      <p className="eyebrow">Round setup</p>
      <h1 className="title">Choose today’s journey.</h1>
      <p className="lede">Smart Review mixes what’s due, what wobbled last time, and one or two new words. You can go straight to trouble drills or SATs rehearsal if you’d rather.</p>
      <div className="mode-row">
        {MODE_CARDS.map((mode, index) => (
          mode.id === 'trouble' && !stats.trouble
            ? (
              <ModeCard
                mode={mode}
                selected={prefs.mode === mode.id}
                disabled
                description="No trouble words yet. Try a round first."
                badge="NONE YET"
                actions={actions}
                textTone={heroContrast.contrast.cards[index] || heroContrast.contrast.shell}
                key={mode.id}
              />
            )
            : (
              <ModeCard
                mode={mode}
                selected={prefs.mode === mode.id}
                disabled={preferenceControlsDisabled}
                actions={actions}
                textTone={heroContrast.contrast.cards[index] || heroContrast.contrast.shell}
                key={mode.id}
              />
            )
        ))}
      </div>
      <div className="setup-control-stack">
        <div className={tweakClass} {...tweakAria}>
          <span className="tool-label">Round length</span>
          <LengthPicker prefs={prefs} actions={actions} disabled={hideTweaks || preferenceControlsDisabled} />
        </div>
        <div className={tweakClass} {...tweakAria}>
          <span className="tool-label">Pool</span>
          <YearPicker prefs={prefs} actions={actions} disabled={hideTweaks || preferenceControlsDisabled} />
        </div>
        <div className="tweak-row">
          <span className="tool-label">Options</span>
          <ToggleChip pref="showCloze" checked={Boolean(prefs.showCloze)} label="Show sentence" actions={actions} disabled={preferenceControlsDisabled} />
          <ToggleChip pref="autoSpeak" checked={Boolean(prefs.autoSpeak)} label="Auto-play audio" actions={actions} disabled={preferenceControlsDisabled} />
          {showExtraFamilyOption ? (
            <ToggleChip pref="extraWordFamilies" checked={Boolean(prefs.extraWordFamilies)} label="Word-family variants" actions={actions} disabled={preferenceControlsDisabled} />
          ) : <span className="toggle-chip option-placeholder" aria-hidden="true" />}
        </div>
      </div>
      <div className="setup-begin-row">
        <button
          type="button"
          className="btn primary xl"
          style={{ '--btn-accent': accent }}
          data-action="spelling-start"
          disabled={startDisabled}
          onClick={(event) => renderAction(actions, event, 'spelling-start')}
        >
          {beginText} <ArrowRightIcon />
        </button>
      </div>
    </>
  );
}

/* Post-Mega dashboard content. The whole of Setup-main shares the existing
 * hero backdrop / controls-tone tokens, but the lede, mode row, and begin
 * button are reshaped around Guardian Mission as the only active path.
 *
 * Visual intent (design notes):
 *  - Lede is declarative ("The Word Vault is yours.") rather than a cheer.
 *  - Stats ribbon reads as a duty roster, not a victory lap.
 *  - Guardian card has a distinct "ACTIVE DUTY" badge + CTA baked into the
 *    card footer — this is the primary path, so its affordance lives where
 *    the eye goes after the title.
 *  - Disabled placeholder cards show a subtle roadmap index (Next 02 / 03 /
 *    04) rather than a greyed-out "Coming soon" shield, so kids read the
 *    card as "next in the journey" rather than "empty". */
function PostMegaSetupContent({
  prefs,
  accent,
  actions,
  postMastery,
  stats,
  heroContrast,
  pendingCommand,
  startDisabled,
  runtimeReadOnly,
}) {
  const guardianCard = POST_MEGA_MODE_CARDS.find((mode) => mode.id === 'guardian') || POST_MEGA_MODE_CARDS[0];
  const otherCards = POST_MEGA_MODE_CARDS.filter((mode) => mode.id !== 'guardian');
  const dueCount = Math.max(0, Number(postMastery?.guardianDueCount) || 0);
  const wobblingCount = Math.max(0, Number(postMastery?.wobblingCount) || 0);
  const guardianActive = dueCount > 0;
  const secureCount = Number(stats?.secure) || 0;
  const guardianDescription = guardianActive
    ? wobblingCount > 0
      ? `${dueCount} word${dueCount === 1 ? '' : 's'} need a check today — ${wobblingCount} wobbling.`
      : `${dueCount} word${dueCount === 1 ? '' : 's'} ready for their Guardian check.`
    : 'All guardians rested — return tomorrow to patrol the Vault again.';
  const missionBadge = guardianActive ? 'ACTIVE DUTY' : 'ALL RESTED';
  const beginDisabled = startDisabled || runtimeReadOnly || !guardianActive;
  const beginText = pendingCommand === 'start-session'
    ? 'Starting...'
    : pendingCommand === 'save-prefs'
      ? 'Saving...'
      : 'Begin Guardian Mission';

  function handleBegin(event) {
    if (beginDisabled) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return;
    }
    renderAction(actions, event, 'spelling-shortcut-start', { mode: 'guardian' });
  }

  return (
    <>
      <p className="eyebrow post-mega-eyebrow">Graduated · Spelling Guardian</p>
      <h1 className="title post-mega-title">The Word Vault is yours.</h1>
      <p className="lede post-mega-lede">
        Every core word is secure. Your job now is to keep the Vault strong — short daily checks on
        words you already own. Smart Review, Trouble Drill, and the SATs Test have done their work.
      </p>
      <GraduationStatRibbon postMastery={postMastery} secureCount={secureCount} />
      <div className="mode-row mode-row-post-mega" data-variant={guardianActive ? 'active' : 'rested'}>
        <PostMegaModeCard
          mode={guardianCard}
          variant={guardianActive ? 'active' : 'rested'}
          description={guardianDescription}
          badge={missionBadge}
          textTone={heroContrast.contrast.cards?.[0] || heroContrast.contrast.shell}
          active={guardianActive}
          disabled={!guardianActive}
        />
        {otherCards.map((mode, index) => (
          <PostMegaModeCard
            mode={mode}
            variant="placeholder"
            index={index + 1}
            textTone={heroContrast.contrast.cards?.[index + 1] || heroContrast.contrast.shell}
            disabled
            key={mode.id}
          />
        ))}
      </div>
      <div className="setup-begin-row post-mega-begin-row">
        <div className="post-mega-begin-hint" aria-hidden={guardianActive ? undefined : 'true'}>
          <kbd>Alt</kbd>
          <span className="post-mega-begin-hint-join">+</span>
          <kbd>4</kbd>
          <span className="post-mega-begin-hint-label">quick-start Guardian Mission</span>
        </div>
        <button
          type="button"
          className="btn primary xl"
          style={{ '--btn-accent': accent }}
          data-action="spelling-shortcut-start"
          data-mode="guardian"
          disabled={beginDisabled}
          onClick={handleBegin}
        >
          {beginText} <ArrowRightIcon />
        </button>
      </div>
    </>
  );
}
