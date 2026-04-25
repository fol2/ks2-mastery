// Phase 3 U5 — Punctuation Map scene.
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
//     `skillRows` when available (ui.analytics.skillRows), falling back
//     to every skill reading as `'new'` for fresh learners.
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
  PUNCTUATION_MAP_MONSTER_FILTER_IDS,
  PUNCTUATION_MAP_STATUS_FILTER_IDS,
  bellstormSceneForPhase,
  buildPunctuationMapModel,
  composeIsDisabled,
  punctuationChildStatusLabel,
  punctuationMonsterDisplayName,
  punctuationSkillRuleOneLiner,
} from './punctuation-view-model.js';
import { PUNCTUATION_CLIENT_SKILLS } from '../read-model.js';

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

// Normalise `mapUi` for render — accepts undefined (default shape) or a
// partial object. Mirrors `normalisePunctuationMapUi` in service-contract
// but operates on the shape actually threaded into the scene (the caller
// has already run the normaliser when the Map phase opened; this is a
// defence against a hand-rolled fixture that omits the field).
function mapUiFromState(ui) {
  const raw = ui && typeof ui === 'object' && !Array.isArray(ui) ? ui.mapUi : null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { statusFilter: 'all', monsterFilter: 'all', detailOpenSkillId: null, detailTab: 'learn' };
  }
  const statusFilter = typeof raw.statusFilter === 'string'
    && PUNCTUATION_MAP_STATUS_FILTER_IDS.includes(raw.statusFilter)
    ? raw.statusFilter
    : 'all';
  const monsterFilter = typeof raw.monsterFilter === 'string'
    && PUNCTUATION_MAP_MONSTER_FILTER_IDS.includes(raw.monsterFilter)
    ? raw.monsterFilter
    : 'all';
  return {
    statusFilter,
    monsterFilter,
    detailOpenSkillId: typeof raw.detailOpenSkillId === 'string' && raw.detailOpenSkillId
      ? raw.detailOpenSkillId
      : null,
    detailTab: raw.detailTab === 'practise' ? 'practise' : 'learn',
  };
}

// Build the 14 skill-row inputs for `buildPunctuationMapModel`. When the
// Worker-projected analytics snapshot carries `skillRows`, we enrich each
// row with the client-held name / clusterId (so a rogue payload can't
// substitute adult copy). Fresh learners or degraded runtimes fall back to
// "status: 'new'" across every skill, which keeps the Map populated and
// browsable while the analytics snapshot is empty.
function assembleSkillRows(ui) {
  const analytics = ui && typeof ui === 'object' && !Array.isArray(ui) ? ui.analytics : null;
  const snapshotRows = analytics && Array.isArray(analytics.skillRows) ? analytics.skillRows : [];
  const snapshotById = new Map();
  for (const row of snapshotRows) {
    if (row && typeof row === 'object' && !Array.isArray(row) && typeof row.skillId === 'string') {
      snapshotById.set(row.skillId, row);
    }
  }
  return PUNCTUATION_CLIENT_SKILLS.map((skill) => {
    const snap = snapshotById.get(skill.id) || null;
    const rawStatus = snap && typeof snap.status === 'string' ? snap.status : 'new';
    return {
      skillId: skill.id,
      name: skill.name,
      clusterId: skill.clusterId,
      status: rawStatus,
      attempts: Number(snap?.attempts) || 0,
      accuracy: Number.isFinite(Number(snap?.accuracy)) ? Number(snap.accuracy) : null,
      mastery: Number(snap?.mastery) || 0,
      dueAt: Number(snap?.dueAt) || 0,
    };
  });
}

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
  return (
    <article className="punctuation-map-skill-card" data-skill-id={skill.skillId}>
      <header className="punctuation-map-skill-card-head">
        <h4>{skill.name}</h4>
        <span className={`chip punctuation-map-skill-status punctuation-map-skill-status--${skill.status}`}>
          {skill.statusLabel}
        </span>
      </header>
      <p className="punctuation-map-skill-rule">{punctuationSkillRuleOneLiner(skill.skillId)}</p>
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

function MonsterGroup({ monster, statusFilter, disabled, actions }) {
  const filteredSkills = statusFilter === 'all'
    ? monster.skills
    : monster.skills.filter((skill) => skill.status === statusFilter);
  return (
    <section
      className="punctuation-map-monster-group"
      aria-label={`${monster.name} skills`}
      data-monster-id={monster.monsterId}
    >
      <header className="punctuation-map-monster-group-head">
        <h3>{monster.name}</h3>
        <p className="muted">
          {monster.skills.length} skill{monster.skills.length === 1 ? '' : 's'} · {monster.mastered} mastered
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
  const disabled = composeIsDisabled(ui);
  const mapUi = mapUiFromState(ui);
  const rewardState = ui && typeof ui === 'object' && !Array.isArray(ui) && ui.rewardState
    && typeof ui.rewardState === 'object' && !Array.isArray(ui.rewardState)
    ? ui.rewardState
    : {};
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

  return (
    <section
      className="card border-top punctuation-surface punctuation-map-scene"
      data-punctuation-map
      data-punctuation-phase="map"
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
          <h2 className="section-title">Punctuation Map</h2>
          <p className="subtitle">
            The 14 Punctuation skills, grouped by monster. Tap a skill to see the rule or start a short round.
          </p>
        </div>
      </div>

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

      <div className="punctuation-map-body" data-punctuation-map-body>
        {visibleMonsters.length
          ? visibleMonsters.map((monster) => (
            <MonsterGroup
              key={monster.monsterId}
              monster={monster}
              statusFilter={mapUi.statusFilter}
              disabled={disabled}
              actions={actions}
            />
          ))
          : <div className="punctuation-map-empty muted">No matching skills yet.</div>}
      </div>

      <div className="actions" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="btn secondary"
          disabled={disabled}
          data-action="punctuation-close-map"
          onClick={() => actions.dispatch('punctuation-close-map')}
        >
          Back to dashboard
        </button>
      </div>

      {ACTIVE_PUNCTUATION_MONSTER_IDS.length !== 4 ? (
        // Defensive assertion — if the active roster ever changes shape the
        // Map's four-section layout breaks. Rendered as hidden metadata so a
        // regression shows up in the DOM tree tests without blowing up the
        // learner experience.
        <div hidden data-punctuation-map-roster-drift="true" />
      ) : null}
    </section>
  );
}
