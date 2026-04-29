// Phase 3 U5 — Punctuation Map scene.
// Phase 4 U3 — `analytics.available` signal → `'unknown'` status with a
//              child-friendly helper sub-line when the Worker projection
//              fails or is missing.
//
// Browsing surface over the 14 published Punctuation skills, grouped under
// the 4 active monsters (Pealark / Claspin / Curlune / Quoral). Learners
// filter by status chip (All / New / Learning / Due / Wobbly / Secure) and
// monster chip, then tap a skill card to open the Skill Detail modal (U6)
// or jump straight into Guided focus via "Practise this".
//
// Data flow:
//   - 14 skills: imported from `PUNCTUATION_CLIENT_SKILLS` in the subject's
//     client-safe read-model module (name + clusterId per skill).
//   - Cluster → monster mapping: `PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER` in
//     the view-model — a client mirror of the Worker's canonical
//     `PUNCTUATION_CLUSTERS.monsterId`. The shared content module is
//     forbidden from the browser bundle (bundle-audit rule), so the
//     mapping is copied here and tested against the plan's fixture.
//   - Per-skill status: derived client-side from the analytics snapshot's
//     `skillRows` when `ui.analytics.available === true`. Fresh learners
//     (`'empty'`) render as `'new'`. A DEGRADED payload (`false`) renders
//     as `'unknown'` across every skill with a "We'll unlock this after
//     your next round." helper line (Phase 4 U3 / plan R4 / AE4). The
//     `analytics.available` signal is attached by the client read-model's
//     `initState` (`src/subjects/punctuation/client-read-models.js`).
//   - Active monster state: `buildPunctuationMapModel` iterates only
//     `ACTIVE_PUNCTUATION_MONSTER_IDS`, full stop — reserved monsters
//     (Colisk / Hyphang / Carillon) never surface even if the reward
//     state contains them (plan R10 / learning #5).
//
// Every mutation control threads `composeIsDisabled(ui)` — the filter chips,
// the "Practise this" button, and the "Open details" button all disable as a
// single bundle whenever availability flips to degraded / unavailable, a
// command is in flight, or the runtime is read-only (plan R11).
//
// U5 deviation note: the "Practise this" / "Open details" buttons dispatch
// `punctuation-skill-detail-open` with `{ skillId }`. The module handler for
// that action lands in U5 alongside this scene so the dispatch is a real
// state delta; U6 follows up with the modal component that consumes
// `mapUi.detailOpenSkillId` + `mapUi.detailTab`. Documented in the PR body.

import React from 'react';

import {
  ACTIVE_PUNCTUATION_MONSTER_IDS,
  PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER,
  PUNCTUATION_DASHBOARD_HERO,
  assembleSkillRows,
  bellstormSceneForPhase,
  buildPunctuationMapModel,
  composeIsDisabled,
  composeIsNavigationDisabled,
  mergeMonotonicDisplay,
  punctuationChildStatusLabel,
  punctuationChildUnknownHelperCopy,
  punctuationMonsterDisplayName,
  punctuationSkillRuleOneLiner,
  punctuationStageLabel,
} from './punctuation-view-model.js';
import {
  PUNCTUATION_MAP_MONSTER_FILTER_IDS,
  PUNCTUATION_MAP_STATUS_FILTER_IDS,
  normalisePunctuationMapUi,
} from '../service-contract.js';
import { PunctuationSkillDetailModal } from './PunctuationSkillDetailModal.jsx';
import { HeroBackdrop } from '../../../platform/ui/HeroBackdrop.jsx';

// Re-export so tests that historically imported `assembleSkillRows` from
// the scene file keep working. The canonical definition lives in the
// view-model (`.js`) so test modules can `await import(...)` it without
// paying the esbuild-bundled JSX loader cost.
export { assembleSkillRows };

// Child-facing labels for the status filter chips. `'all'` is a literal
// "All"; the other five ids reach for the shared child-copy mapping in
// `punctuationChildStatusLabel` so any future rename lands in one place.
function statusFilterLabel(id) {
  if (id === 'all') return 'All';
  return punctuationChildStatusLabel(id);
}

// Child-facing labels for the monster filter chips. `'all'` is a literal
// "All"; every other id reaches for `punctuationMonsterDisplayName` so the
// roster display-name table stays the single source of truth.
function monsterFilterLabel(id) {
  if (id === 'all') return 'All';
  return punctuationMonsterDisplayName(id);
}

// `mapUi` normalisation delegates to the service-contract's
// `normalisePunctuationMapUi` (see `../service-contract.js`). The maint-lens
// reviewer flagged the previous `mapUiFromState` helper as duplication of
// that function; importing the contract version keeps the scene rendering
// against the single source of truth and lets future changes to the shape
// (e.g. new filter ids) land once.

// `assembleSkillRows` lives in `./punctuation-view-model.js` so tests can
// import it via the `.js` loader path. Re-exported at the top of this file
// so the historical scene-scoped import stays valid.

// Phase 4 U3: module-level latch so the degraded-analytics console warning
// fires once per process-lifetime, not on every render. The Map re-renders
// on every filter / detail-state transition; without this latch the
// devtools console would flood. Resetting to `false` happens only in tests
// that explicitly re-import the module.
let analyticsUnavailableWarned = false;

function StatusFilterChips({ activeFilter, disabled, actions }) {
  return (
    <div
      className="punctuation-map-chips punctuation-map-chips--status"
      role="group"
      aria-label="Filter skills by status"
    >
      {PUNCTUATION_MAP_STATUS_FILTER_IDS.map((id) => {
        const active = id === activeFilter;
        return (
          <button
            key={id}
            type="button"
            className={`chip${active ? ' on' : ''}`}
            aria-pressed={active ? 'true' : 'false'}
            disabled={disabled}
            data-action="punctuation-map-status-filter"
            data-value={id}
            onClick={() => actions.dispatch('punctuation-map-status-filter', { value: id })}
          >
            {statusFilterLabel(id)}
          </button>
        );
      })}
    </div>
  );
}

function MonsterFilterChips({ activeFilter, disabled, actions }) {
  return (
    <div
      className="punctuation-map-chips punctuation-map-chips--monster"
      role="group"
      aria-label="Filter skills by monster"
    >
      {PUNCTUATION_MAP_MONSTER_FILTER_IDS.map((id) => {
        const active = id === activeFilter;
        return (
          <button
            key={id}
            type="button"
            className={`chip${active ? ' on' : ''}`}
            aria-pressed={active ? 'true' : 'false'}
            disabled={disabled}
            data-action="punctuation-map-monster-filter"
            data-value={id}
            onClick={() => actions.dispatch('punctuation-map-monster-filter', { value: id })}
          >
            {monsterFilterLabel(id)}
          </button>
        );
      })}
    </div>
  );
}

function SkillCard({ skill, disabled, actions }) {
  // Phase 4 U3: when analytics is degraded, every skill arrives with
  // `status: 'unknown'`. The card renders a child-friendly helper line
  // underneath the rule one-liner so a learner understands they haven't
  // done anything wrong — the system is waiting on evidence. The string
  // is routed through `punctuationChildUnknownHelperCopy()` so the copy
  // lands under the same governance as the chip label (helper sits in
  // `punctuation-view-model.js`); a future forbidden-term sweep or copy
  // tune lands in one place.
  const isUnknown = skill.status === 'unknown';
  return (
    <article className="punctuation-map-skill-card" data-skill-id={skill.skillId}>
      <header className="punctuation-map-skill-card-head">
        <h4>{skill.name}</h4>
        <span className={`chip punctuation-map-skill-status punctuation-map-skill-status--${skill.status}`}>
          {skill.statusLabel}
        </span>
      </header>
      <p className="punctuation-map-skill-rule">{punctuationSkillRuleOneLiner(skill.skillId)}</p>
      {isUnknown ? (
        <p className="punctuation-map-skill-unknown-helper muted">
          {punctuationChildUnknownHelperCopy()}
        </p>
      ) : null}
      <div className="punctuation-map-skill-actions actions">
        <button
          type="button"
          className="btn primary"
          disabled={disabled}
          data-action="punctuation-skill-detail-open"
          data-skill-id={skill.skillId}
          data-value="practise"
          onClick={() => actions.dispatch('punctuation-skill-detail-open', {
            skillId: skill.skillId,
            tab: 'practise',
          })}
        >
          Practise this
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={disabled}
          data-action="punctuation-skill-detail-open"
          data-skill-id={skill.skillId}
          data-value="learn"
          onClick={() => actions.dispatch('punctuation-skill-detail-open', {
            skillId: skill.skillId,
            tab: 'learn',
          })}
        >
          Open details
        </button>
      </div>
    </article>
  );
}

function MonsterGroup({ monster, statusFilter, disabled, actions, starView, rewardState }) {
  const filteredSkills = statusFilter === 'all'
    ? monster.skills
    : monster.skills.filter((skill) => skill.status === statusFilter);
  // Phase 5 U8: star meter in the group header replaces `X mastered`.
  // Reads from `starView.perMonster[monsterId].total` for direct monsters
  // and `starView.grand.grandStars` for the grand monster (quoral).
  const safeStarView = starView && typeof starView === 'object' && !Array.isArray(starView)
    ? starView
    : null;
  const isGrand = monster.monsterId === 'quoral';
  const perMonster = safeStarView && typeof safeStarView.perMonster === 'object'
    && !Array.isArray(safeStarView.perMonster)
    ? safeStarView.perMonster
    : {};
  const grand = safeStarView && typeof safeStarView.grand === 'object'
    && !Array.isArray(safeStarView.grand)
    ? safeStarView.grand
    : null;
  const starEntry = isGrand ? grand : perMonster[monster.monsterId];
  const totalStars = starEntry
    ? Math.max(0, Math.floor(Number(isGrand ? starEntry.grandStars : starEntry.total) || 0))
    : 0;
  const starDerivedStage = starEntry
    ? Math.max(0, Math.floor(Number(starEntry.starDerivedStage) || 0))
    : 0;
  // U3 review follow-up (MEDIUM ADV-395-2/3): use shared monotonic merge
  // helper so sanitisation is consistent with the view-model and Summary.
  const safeReward = rewardState && typeof rewardState === 'object' && !Array.isArray(rewardState) ? rewardState : {};
  const codexEntry = safeReward[monster.monsterId];
  const { displayStars, displayStage } = mergeMonotonicDisplay(totalStars, starDerivedStage, codexEntry);
  const starsLabel = isGrand ? 'Grand Stars' : 'Stars';
  const stageText = punctuationStageLabel(displayStage, displayStars);
  return (
    <section
      className="punctuation-map-monster-group"
      aria-label={`${monster.name} skills`}
      data-monster-id={monster.monsterId}
    >
      <header className="punctuation-map-monster-group-head">
        <h3>{monster.name}</h3>
        <p className="muted">
          {`${displayStars} / 100 ${starsLabel}`} · {stageText}
        </p>
      </header>
      <div className="punctuation-map-skill-grid">
        {filteredSkills.length
          ? filteredSkills.map((skill) => (
            <SkillCard
              key={skill.skillId}
              skill={skill}
              disabled={disabled}
              actions={actions}
            />
          ))
          : <div className="punctuation-map-empty muted">Nothing to show with this status yet.</div>}
      </div>
    </section>
  );
}

export function PunctuationMapScene({ ui, actions }) {
  const scene = bellstormSceneForPhase('map');
  // Phase 4 U6: `disabled` governs mutation controls (filter chips, Practise
  // this). `navigationDisabled` governs the top-bar Back affordance so a
  // stalled command / degraded availability never traps the child on the
  // Map scene (plan R7). Mutation-vs-navigation divergence mirrors
  // `PunctuationSummaryScene` (canonical example).
  const disabled = composeIsDisabled(ui);
  const navigationDisabled = composeIsNavigationDisabled(ui);
  const mapUi = normalisePunctuationMapUi(ui?.mapUi);
  const rewardState = ui && typeof ui === 'object' && !Array.isArray(ui) && ui.rewardState
    && typeof ui.rewardState === 'object' && !Array.isArray(ui.rewardState)
    ? ui.rewardState
    : {};
  // Phase 5 U8: thread starView so MonsterGroup headers can show star meters.
  const starView = ui && typeof ui === 'object' && !Array.isArray(ui) && ui.starView
    && typeof ui.starView === 'object' && !Array.isArray(ui.starView)
    ? ui.starView
    : null;
  // Phase 4 U3: surface a one-time console warning when analytics is
  // unavailable so the degraded state is discoverable during development
  // and in production devtools. Lives inside a useEffect so SSR never
  // emits the warning (and the test harness's `renderToStaticMarkup`
  // pathway stays silent). The module-level `analyticsUnavailableWarned`
  // latch bounds the warning to once per process lifetime.
  const analyticsAvailable = ui && typeof ui === 'object' && !Array.isArray(ui) && ui.analytics
    && typeof ui.analytics === 'object' && !Array.isArray(ui.analytics)
    ? ui.analytics.available
    : undefined;
  React.useEffect(() => {
    if (analyticsAvailable === false && !analyticsUnavailableWarned) {
      analyticsUnavailableWarned = true;
      // eslint-disable-next-line no-console
      console.warn('[punctuation] analytics unavailable — Map is rendering the "unknown" state');
    }
  }, [analyticsAvailable]);
  const skillRows = assembleSkillRows(ui);
  const model = buildPunctuationMapModel(
    skillRows,
    rewardState,
    PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER,
  );
  // Apply the monster filter at the group level so the four sections remain
  // in the DOM but only the selected monster's card list renders. This keeps
  // the "reserved monsters never render" guarantee intact regardless of the
  // filter value (the iterator is still `ACTIVE_PUNCTUATION_MONSTER_IDS`).
  const visibleMonsters = mapUi.monsterFilter === 'all'
    ? model.monsters
    : model.monsters.filter((monster) => monster.monsterId === mapUi.monsterFilter);

  // Live-region total across every visible monster group, post-status-filter.
  // Pairs with the `role="status"` <p> below so a screen reader announces how
  // many skills a filter combination yields. Mirrors the Grammar Concept Bank
  // "Showing N of M concepts" pattern (design-lens MEDIUM).
  const visibleSkillCount = mapUi.statusFilter === 'all'
    ? visibleMonsters.reduce((sum, monster) => sum + monster.skills.length, 0)
    : visibleMonsters.reduce(
      (sum, monster) => sum + monster.skills.filter((skill) => skill.status === mapUi.statusFilter).length,
      0,
    );
  const totalSkillCount = model.monsters.reduce((sum, monster) => sum + monster.skills.length, 0);
  const summaryText = visibleSkillCount === totalSkillCount
    ? `Showing all ${totalSkillCount} skills.`
    : `Showing ${visibleSkillCount} of ${totalSkillCount} skills.`;

  return (
    <section
      className="card border-top punctuation-surface punctuation-map-scene"
      data-punctuation-map
      data-punctuation-phase="map"
      style={{ borderTopColor: '#B8873F' }}
    >
      {/* Back button at the top, mirroring Spelling word-bank-topbar and
          Grammar grammar-bank-topbar (design-lens MEDIUM). A top-of-scene
          affordance matches the pattern learners already know from the
          sibling banks and keeps the scroll-up return path cheap. */}
      <header className="punctuation-map-topbar">
        <button
          type="button"
          className="btn ghost sm"
          disabled={navigationDisabled}
          aria-disabled={navigationDisabled ? 'true' : 'false'}
          data-action="punctuation-close-map"
          onClick={() => actions.dispatch('punctuation-close-map')}
        >
          &larr; Back to dashboard
        </button>
      </header>

      {/* U6: platform HeroBackdrop replaces the legacy static <img> inside
          `.punctuation-hero`. Same pattern as U5's Session-scene swap — the
          outer `.punctuation-map-hero` is the positioning ancestor
          (`.hero-backdrop` paints at `position: absolute; inset: 0`), while
          `.punctuation-map-hero-content` sits above via `z-index: 1`. URL
          is the phase-stable `bellstormSceneForPhase('map').src`. */}
      <section className="punctuation-map-hero" style={{ position: 'relative' }}>
        <HeroBackdrop url={scene.src} extraBackdropClassName="punctuation-hero-backdrop" />
        <div className="punctuation-map-hero-content">
          <div className="eyebrow">{PUNCTUATION_DASHBOARD_HERO.eyebrow}</div>
          <h2 className="section-title">Punctuation Map</h2>
          <p className="subtitle">
            The 14 Punctuation skills, grouped by monster. Tap a skill to see the rule or start a short round.
          </p>
        </div>
      </section>

      <div className="punctuation-map-filters">
        <StatusFilterChips
          activeFilter={mapUi.statusFilter}
          disabled={disabled}
          actions={actions}
        />
        <MonsterFilterChips
          activeFilter={mapUi.monsterFilter}
          disabled={disabled}
          actions={actions}
        />
      </div>

      {/* Live-region count of visible skills after filters apply. A screen
          reader announces the new total whenever a chip flips the filter
          state (design-lens MEDIUM). */}
      <p className="punctuation-map-summary muted" role="status">{summaryText}</p>

      <div className="punctuation-map-body" data-punctuation-map-body>
        {visibleMonsters.length
          ? visibleMonsters.map((monster) => (
            <MonsterGroup
              key={monster.monsterId}
              monster={monster}
              statusFilter={mapUi.statusFilter}
              disabled={disabled}
              actions={actions}
              starView={starView}
              rewardState={rewardState}
            />
          ))
          : <div className="punctuation-map-empty muted">No matching skills yet.</div>}
      </div>

      {ACTIVE_PUNCTUATION_MONSTER_IDS.length !== 4 ? (
        // Defensive assertion — if the active roster ever changes shape the
        // Map's four-section layout breaks. Rendered as hidden metadata so a
        // regression shows up in the DOM tree tests without blowing up the
        // learner experience.
        <div hidden data-punctuation-map-roster-drift="true" />
      ) : null}

      {/* U6 Skill Detail modal: rendered when `mapUi.detailOpenSkillId` points
          at a published Punctuation skill id. The modal consumes
          `mapUi.detailTab` for the Learn/Practise tab state and dispatches
          `punctuation-start` `{ mode: 'guided', guidedSkillId, roundLength:
          '4' }` from its "Practise this" button (plan R3). */}
      {mapUi.detailOpenSkillId ? (
        <PunctuationSkillDetailModal
          skillId={mapUi.detailOpenSkillId}
          detailTab={mapUi.detailTab}
          ui={ui}
          actions={actions}
        />
      ) : null}
    </section>
  );
}
