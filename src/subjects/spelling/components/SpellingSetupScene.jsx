import React from 'react';
import { useMonsterVisualConfig } from '../../../platform/game/MonsterVisualConfigContext.jsx';
import { SpellingHeroBackdrop } from './SpellingHeroBackdrop.jsx';
import { ArrowRightIcon, CheckIcon } from './spelling-icons.jsx';
import { useSetupHeroContrast } from './useSetupHeroContrast.js';
import { BOSS_DEFAULT_ROUND_LENGTH } from '../service-contract.js';
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
  const wobblingDueCount = Math.max(0, Number(postMastery?.wobblingDueCount) || 0);
  const nonWobblingDueCount = Math.max(0, Number(postMastery?.nonWobblingDueCount) || 0);
  // Fallback for legacy callers (e.g. tests injecting a pre-U1 postMastery
  // shape): if the decomposed counts are missing, fall back to the single
  // `wobblingCount` so the ribbon still renders something sensible.
  const wobblingCount = Math.max(0, Number(postMastery?.wobblingCount) || 0);
  const today = Number.isFinite(Number(postMastery?.todayDay)) ? Math.floor(Number(postMastery.todayDay)) : 0;
  const nextDue = Number.isFinite(Number(postMastery?.nextGuardianDueDay)) ? Math.floor(Number(postMastery.nextGuardianDueDay)) : null;
  const nextDueDelta = nextDue == null ? null : nextDue - today;

  const items = [];
  if (Number.isFinite(secureCount) && secureCount > 0) {
    items.push({ label: 'Words secured', value: String(secureCount) });
  }
  // U1: decomposed "N urgent + M patrol" when a wobbling/due mix exists.
  if (wobblingDueCount > 0 && nonWobblingDueCount > 0) {
    items.push({ label: 'Urgent checks', value: String(wobblingDueCount), accent: 'wobbling' });
    items.push({ label: 'Patrol words', value: String(nonWobblingDueCount), accent: 'due' });
  } else {
    items.push({
      label: 'Due today',
      value: String(dueCount),
      accent: dueCount > 0 ? 'due' : null,
    });
    if (wobblingCount > 0 && wobblingDueCount === 0) {
      items.push({ label: 'Wobbling', value: String(wobblingCount), accent: 'wobbling' });
    }
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

// P2 U1: admin / ops only affordance. When the learner's post-mega gate
// is closed, adult operators need a one-click path into the Admin hub's
// post-mega debug panel to see *why*. Child (`learner`) and parent
// (`parent`) roles render absolutely nothing — the link is gated on the
// platform role set. Keeping the whitelist explicit (not a generic
// "non-learner" check) guards against future roles slipping past the
// check; a brand-new role (e.g. 'demo') will render the link only after
// an explicit code change here, matching the P2 plan's §U1 ICO posture.
const POST_MASTERY_DEBUG_ROLES = new Set(['admin', 'ops']);

function adultCanSeePostMasteryDebug(platformRole) {
  return POST_MASTERY_DEBUG_ROLES.has(String(platformRole || ''));
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
  // P2 U1: threaded through from `SpellingPracticeSurface` -> `session.platformRole`.
  // Defaults to empty string so a prop-less caller (tests, legacy shells)
  // renders the child-safe view with the link absent.
  platformRole = '',
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
  // P2 U2: dashboard gate migrates from live `allWordsMega` to the sticky
  // `postMegaDashboardAvailable` (sticky-or-live). A learner who graduated
  // under release N-1 and now sees 3 new core words from release N still
  // lands on the post-Mega dashboard rather than getting kicked back into
  // the legacy Smart Review setup. Fallback to `allWordsMega` keeps
  // pre-U2 callers stable for one release.
  const isPostMega = Boolean(
    postMastery?.postMegaDashboardAvailable
    ?? postMastery?.allWordsMega,
  );
  const contentClasses = ['setup-content'];
  if (isPostMega) contentClasses.push('setup-content--post-mega');

  // P2 U1: admin / ops adults see a "Why is Guardian locked?" diagnostic
  // link right below the setup hero when Guardian Mission is NOT unlocked
  // (i.e. `isPostMega === false`). Child / parent surfaces get `platformRole`
  // empty (defaulted) or === 'parent' and the link never renders. Routed
  // to the admin hub where the post-mega debug panel explains the counts.
  const showPostMasteryDebugLink = adultCanSeePostMasteryDebug(platformRole) && !isPostMega;

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
          {showPostMasteryDebugLink ? (
            <p className="small muted post-mastery-debug-link" data-adult-debug="post-mastery">
              <button
                type="button"
                className="btn ghost"
                data-action="open-admin-hub"
                onClick={(event) => renderAction(actions, event, 'open-admin-hub')}
              >
                Why is Guardian locked?
              </button>
              <span className="small muted" style={{ marginLeft: 8 }}>
                Adult-only diagnostic. Opens the Admin / Operations hub post-mega debug panel.
              </span>
            </p>
          ) : null}
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
  // U10: Boss Dictation is the second active post-Mega surface. Pull it out
  // of POST_MEGA_MODE_CARDS by id rather than by index so future reorderings
  // don't silently pick up the wrong card.
  const bossCard = POST_MEGA_MODE_CARDS.find((mode) => mode.id === 'boss-dictation');
  const placeholderCards = POST_MEGA_MODE_CARDS.filter((mode) => mode.id !== 'guardian' && mode.id !== 'boss-dictation');
  // Boss active-state gate. Boss requires genuine `allWordsMegaNow === true`
  // (not sticky). A learner in the "graduated but content-added" state has
  // `postMegaDashboardAvailable === true` but `allWordsMegaNow === false`,
  // and Boss must NOT be offerable because the Boss pool would include only
  // the words that ARE currently Mega — not the handful of new-arrival core
  // slugs still at stage < 4. Falling back through `allWordsMega` (the
  // legacy alias) keeps pre-U2 callers stable.
  const bossActive = Boolean(
    postMastery?.allWordsMegaNow
    ?? postMastery?.allWordsMega,
  );
  const newCoreWordsSinceGraduation = Math.max(
    0,
    Number(postMastery?.newCoreWordsSinceGraduation) || 0,
  );
  const bossDescription = bossCard?.desc || '';
  const bossBadge = 'BOSS READY';
  // U1: branch copy + gating on `guardianMissionState`. Fall back to the
  // legacy `guardianDueCount > 0` signal when the read-model has not yet
  // populated the new scalars so remote-sync and any pre-U1 caller remain
  // stable.
  const missionState = typeof postMastery?.guardianMissionState === 'string'
    ? postMastery.guardianMissionState
    : null;
  const dueCount = Math.max(0, Number(postMastery?.guardianDueCount) || 0);
  const wobblingCount = Math.max(0, Number(postMastery?.wobblingCount) || 0);
  const wobblingDueCount = Math.max(0, Number(postMastery?.wobblingDueCount) || 0);
  const nonWobblingDueCount = Math.max(0, Number(postMastery?.nonWobblingDueCount) || 0);
  const unguardedMegaCount = Math.max(0, Number(postMastery?.unguardedMegaCount) || 0);
  const today = Number.isFinite(Number(postMastery?.todayDay)) ? Math.floor(Number(postMastery.todayDay)) : 0;
  const nextDue = Number.isFinite(Number(postMastery?.nextGuardianDueDay)) ? Math.floor(Number(postMastery.nextGuardianDueDay)) : null;
  const nextDueDelta = nextDue == null ? null : Math.max(0, nextDue - today);
  const secureCount = Number(stats?.secure) || 0;

  // `guardianMissionAvailable` is the single Begin-button gate. Legacy
  // fallback: `guardianDueCount > 0` keeps old tests green if a caller passes
  // a postMastery object without the new scalars.
  const availableFromState = typeof postMastery?.guardianMissionAvailable === 'boolean'
    ? postMastery.guardianMissionAvailable
    : dueCount > 0;
  const guardianActive = availableFromState;

  const nextDueLabel = nextDueDelta == null
    ? 'soon'
    : nextDueDelta <= 0 ? 'today' : nextDueDelta === 1 ? 'tomorrow' : `in ${nextDueDelta} days`;

  // Copy ladder — branches on the canonical U1 state when present, falls
  // back to the pre-U1 counts otherwise.
  let guardianDescription;
  let missionBadge;
  if (missionState === 'first-patrol') {
    const remaining = Math.max(1, unguardedMegaCount);
    guardianDescription = `First Guardian patrol ready — ${remaining} word${remaining === 1 ? '' : 's'} from your Word Vault.`;
    missionBadge = 'FIRST PATROL';
  } else if (missionState === 'wobbling') {
    if (wobblingDueCount > 0 && nonWobblingDueCount > 0) {
      guardianDescription = `${wobblingDueCount} urgent check${wobblingDueCount === 1 ? '' : 's'} + ${nonWobblingDueCount} patrol word${nonWobblingDueCount === 1 ? '' : 's'}.`;
    } else {
      guardianDescription = `${wobblingDueCount || dueCount} wobbling word${(wobblingDueCount || dueCount) === 1 ? '' : 's'} need a Guardian check today.`;
    }
    missionBadge = 'URGENT';
  } else if (missionState === 'due') {
    guardianDescription = `${dueCount} word${dueCount === 1 ? '' : 's'} ready for their Guardian check.`;
    missionBadge = 'ACTIVE DUTY';
  } else if (missionState === 'optional-patrol') {
    guardianDescription = 'No urgent duties. Optional patrol available to keep the Vault warm.';
    missionBadge = 'OPTIONAL PATROL';
  } else if (missionState === 'rested') {
    guardianDescription = `All guardians rested. Next check ${nextDueLabel}.`;
    missionBadge = 'ALL RESTED';
  } else if (missionState === 'locked') {
    // Defensive: 'locked' means allWordsMega is false, so PostMegaSetupContent
    // should not be rendered. If a caller hits this branch anyway, render a
    // sensible fallback rather than crashing.
    guardianDescription = 'Guardian Mission unlocks once every core word is secure.';
    missionBadge = 'LOCKED';
  } else if (guardianActive) {
    // Pre-U1 fallback: compose copy from the legacy counts.
    guardianDescription = wobblingCount > 0
      ? `${dueCount} word${dueCount === 1 ? '' : 's'} need a check today — ${wobblingCount} wobbling.`
      : `${dueCount} word${dueCount === 1 ? '' : 's'} ready for their Guardian check.`;
    missionBadge = 'ACTIVE DUTY';
  } else {
    // Pre-U1 fallback: no due, legacy rested copy.
    guardianDescription = 'All guardians rested — return tomorrow to patrol the Vault again.';
    missionBadge = 'ALL RESTED';
  }

  const beginDisabled = startDisabled || runtimeReadOnly || !guardianActive;
  const beginText = pendingCommand === 'start-session'
    ? 'Starting...'
    : pendingCommand === 'save-prefs'
      ? 'Saving...'
      : 'Begin Guardian Mission';
  // U10: Boss Begin button shares the same pending-command gating as the
  // Guardian Begin — both go through `spelling-shortcut-start` and both
  // collide on the same `start-session` pending slot. Sharing `beginText`'s
  // "Starting..." branch would conflate which button is spinning, so Boss
  // owns its own label but reuses the same disable predicate.
  const bossBeginDisabled = startDisabled || runtimeReadOnly || !bossActive;
  const bossBeginText = pendingCommand === 'start-session'
    ? 'Starting...'
    : pendingCommand === 'save-prefs'
      ? 'Saving...'
      : 'Begin Boss Dictation';

  function handleBegin(event) {
    if (beginDisabled) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return;
    }
    renderAction(actions, event, 'spelling-shortcut-start', { mode: 'guardian' });
  }

  function handleBossBegin(event) {
    if (bossBeginDisabled) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return;
    }
    // The service normalises `length` against BOSS_MIN/MAX; the explicit
    // payload here matches the plan's Alt+5 spec (`length: BOSS_DEFAULT_ROUND_LENGTH`)
    // without reaching back into the view-model for the constant. Keeping
    // the length explicit at the dispatch site makes the begin-button
    // contract self-documenting for a future reader.
    renderAction(actions, event, 'spelling-shortcut-start', { mode: 'boss', length: BOSS_DEFAULT_ROUND_LENGTH });
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
      {newCoreWordsSinceGraduation > 0 ? (
        <p
          className="post-mega-new-arrivals"
          data-test-id="post-mega-new-arrivals"
          role="status"
        >
          {newCoreWordsSinceGraduation} new core word{newCoreWordsSinceGraduation === 1 ? ' has' : 's have'} arrived since graduation. Add {newCoreWordsSinceGraduation === 1 ? 'it' : 'them'} to the Vault when ready.
        </p>
      ) : null}
      <div
        className="mode-row mode-row-post-mega"
        data-variant={guardianActive ? 'active' : 'rested'}
        data-mission-state={missionState || undefined}
      >
        <PostMegaModeCard
          mode={guardianCard}
          variant={guardianActive ? 'active' : 'rested'}
          description={guardianDescription}
          badge={missionBadge}
          textTone={heroContrast.contrast.cards?.[0] || heroContrast.contrast.shell}
          active={guardianActive}
          disabled={!guardianActive}
        />
        {/* U10: Boss Dictation active card. The variant matches Guardian's
            active/rested split — `active` when `allWordsMega === true`
            (always true inside PostMegaSetupContent), `rested` otherwise. We
            pass the Boss description straight from POST_MEGA_MODE_CARDS so a
            future copy tweak is a one-line change in the view-model, and keep
            the badge in this file so a future variant (e.g. "RECENT SCORE
            9/10") can render conditionally without touching the view-model
            frozen array. */}
        {bossCard ? (
          <PostMegaModeCard
            mode={bossCard}
            variant={bossActive ? 'active' : 'rested'}
            description={bossDescription}
            badge={bossActive ? bossBadge : null}
            textTone={heroContrast.contrast.cards?.[1] || heroContrast.contrast.shell}
            active={bossActive}
            disabled={!bossActive}
          />
        ) : null}
        {placeholderCards.map((mode, index) => (
          <PostMegaModeCard
            mode={mode}
            variant="placeholder"
            // Roadmap index bumps to 2 / 3 because Guardian (#0) and Boss
            // (#1) occupy slots 0 and 1; the "Next 03" / "Next 04" chips on
            // the placeholders communicate the P2 roadmap position.
            index={index + 2}
            textTone={heroContrast.contrast.cards?.[index + 2] || heroContrast.contrast.shell}
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
        {/* U10: Boss Begin row. Mirrors the Guardian begin-row structure —
            hint chip + primary CTA — but dispatches `spelling-shortcut-start`
            with `{ mode: 'boss', length: BOSS_DEFAULT_ROUND_LENGTH }`. The
            Alt+5 hint is aria-hidden when Boss is inactive so screen readers
            don't announce a shortcut that won't work; the begin button
            itself stays disabled with a conservative CTA label. */}
        {bossCard ? (
          <>
            <div className="post-mega-begin-hint" aria-hidden={bossActive ? undefined : 'true'}>
              <kbd>Alt</kbd>
              <span className="post-mega-begin-hint-join">+</span>
              <kbd>5</kbd>
              <span className="post-mega-begin-hint-label">quick-start Boss Dictation</span>
            </div>
            <button
              type="button"
              className="btn primary xl"
              style={{ '--btn-accent': accent }}
              data-action="spelling-shortcut-start"
              data-mode="boss"
              disabled={bossBeginDisabled}
              onClick={handleBossBegin}
              aria-label={bossCard.ariaLabel || 'Begin Boss Dictation'}
            >
              {bossBeginText} <ArrowRightIcon />
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}
