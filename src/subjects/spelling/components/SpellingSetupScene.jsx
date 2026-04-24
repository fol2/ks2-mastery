import React from 'react';
import { SpellingHeroBackdrop } from './SpellingHeroBackdrop.jsx';
import { ArrowRightIcon, CheckIcon } from './spelling-icons.jsx';
import { useSetupHeroContrast } from './useSetupHeroContrast.js';
import {
  MODE_CARDS,
  ROUND_LENGTH_OPTIONS,
  YEAR_FILTER_OPTIONS,
  beginLabel,
  heroBgForSetup,
  heroBgStyle,
  heroToneForBg,
  monsterImageProps,
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

function SetupMeadow({ codex }) {
  const caught = (Array.isArray(codex) ? codex : []).filter((entry) => entry?.progress?.caught);
  const shown = caught.slice(0, 4);
  if (!shown.length) {
    return <div className="ss-meadow-empty small muted">Catch your first monster to populate this meadow.</div>;
  }
  return (
    <div className="ss-meadow" aria-label={`${shown.length} caught monster${shown.length === 1 ? '' : 's'}`}>
      {shown.map(({ monster, progress }) => (
        <div className={`ss-meadow-cell${progress.stage === 0 ? ' egg' : ''}`} key={monster.id}>
          <img alt="" {...monsterImageProps(monster, progress)} />
        </div>
      ))}
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
  setupHeroTone = '',
  previousHeroBg = '',
  runtimeReadOnly = false,
}) {
  const statsFilter = prefs.mode === 'test' ? 'core' : prefs.yearFilter;
  const stats = service.getStats(learner.id, statsFilter);
  const begin = beginLabel(prefs);
  const heroBg = heroBgForSetup(learner.id, prefs, { tone: setupHeroTone });
  const hideTweaks = prefs.mode === 'test';
  const tweakClass = `tweak-row${hideTweaks ? ' is-placeholder' : ''}`;
  const tweakAria = hideTweaks ? { 'aria-hidden': 'true' } : {};
  const showExtraFamilyOption = !hideTweaks && prefs.yearFilter === 'extra';
  const mergedHeroStyle = { ...heroBgStyle(heroBg) };
  const heroContrast = useSetupHeroContrast(heroBg, prefs.mode);
  const heroTone = heroContrast.contrast.tone || heroToneForBg(heroBg);
  const setupClasses = ['setup-main'];
  const pendingCommand = ui?.pendingCommand || '';
  const preferenceControlsDisabled = runtimeReadOnly || Boolean(pendingCommand && pendingCommand !== 'save-prefs');
  const startDisabled = runtimeReadOnly || Boolean(pendingCommand);
  const beginText = pendingCommand === 'start-session'
    ? 'Starting...'
    : pendingCommand === 'save-prefs'
      ? 'Saving...'
      : begin;
  if (heroContrast.contrast.shell === 'light') setupClasses.push('hero-dark');

  return (
    <div className="setup-grid" style={{ gridColumn: '1/-1' }}>
      <section
        className={setupClasses.join(' ')}
        data-react-hero-contrast="true"
        data-hero-tone={heroTone || undefined}
        data-controls-tone={heroContrast.contrast.controls}
        ref={heroContrast.ref}
        style={mergedHeroStyle}
      >
        <SpellingHeroBackdrop url={heroBg} previousUrl={previousHeroBg} />
        <div className="setup-content">
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
