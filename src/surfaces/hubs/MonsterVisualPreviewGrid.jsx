import React from 'react';
import {
  MONSTER_VISUAL_CONTEXTS,
  resolveMonsterVisual,
} from '../../platform/game/monster-visual-config.js';
import { MonsterRender } from '../../platform/game/render/MonsterRender.jsx';
import { MonsterEffectConfigProvider } from '../../platform/game/MonsterEffectConfigContext.jsx';
import { CELEBRATION_KINDS } from './monster-effect-celebration-helpers.js';

function contextLabel(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function previewStyle(visual) {
  const x = Number(visual.offsetX) || 0;
  const y = Number(visual.offsetY) || 0;
  const scale = Number(visual.scale) || 1;
  const faceSign = Number(visual.faceSign) || 1;
  const opacity = Number.isFinite(Number(visual.opacity)) ? Number(visual.opacity) : 1;
  const filter = visual.filter && visual.filter !== 'none' ? visual.filter : 'none';
  return {
    transform: `translate(${x}px, ${y}px) scaleX(${faceSign}) scale(${scale})`,
    opacity,
    filter,
  };
}

function buildMonsterPropForRender({ asset, visual }) {
  if (!asset || !visual) return null;
  // MonsterRender expects a flattened monster shape; we feed it the same
  // src/srcSet the visual resolver computed plus the identity fields the
  // effect bindings + composeEffects() use as keys.
  return {
    id: asset.monsterId,
    branch: asset.branch,
    stage: asset.stage,
    species: asset.monsterId,
    variant: asset.branch,
    displayState: asset.stage === 0 ? 'egg' : 'monster',
    img: visual.src,
    srcSet: visual.srcSet,
    imageAlt: '',
  };
}

export function MonsterVisualPreviewGrid({
  asset,
  draft,
  effectDraft = null,
  selectedContext = 'meadow',
  onSelectContext = () => {},
} = {}) {
  if (!asset || !draft) return null;

  const monsterRenderTiles = MONSTER_VISUAL_CONTEXTS.map((context) => {
    const visual = resolveMonsterVisual({
      monsterId: asset.monsterId,
      branch: asset.branch,
      stage: asset.stage,
      context,
      config: draft,
      preferredSize: 320,
    });
    const monster = buildMonsterPropForRender({ asset, visual });
    const reviewed = draft.assets?.[asset.key]?.review?.contexts?.[context]?.reviewed === true;
    const active = selectedContext === context;
    return (
      <button
        className={`monster-visual-preview ${active ? 'active' : ''}`}
        type="button"
        onClick={() => onSelectContext(context)}
        key={context}
      >
        <span className="monster-visual-preview-meta">
          <span>{contextLabel(context)}</span>
          <span className={`chip ${reviewed ? 'good' : 'warn'}`}>{reviewed ? 'Reviewed' : 'Needs review'}</span>
        </span>
        <span className={`monster-visual-frame monster-visual-frame-${context}`}>
          <span
            className="monster-visual-shadow"
            style={{
              transform: `translate(${Number(visual.shadowX) || 0}px, ${Number(visual.shadowY) || 0}px) scale(${Number(visual.shadowScale) || 1})`,
              opacity: Number.isFinite(Number(visual.shadowOpacity)) ? Number(visual.shadowOpacity) : 1,
            }}
          />
          {monster ? (
            <MonsterRender
              monster={monster}
              context={context}
              sizes="120px"
              extraStyle={previewStyle(visual)}
            />
          ) : (
            <img
              alt=""
              className="monster-visual-preview-img"
              src={visual.src}
              srcSet={visual.srcSet}
              sizes="120px"
              style={previewStyle(visual)}
            />
          )}
        </span>
        <span className="small muted">{visual.path || 'none'} / {visual.motionProfile || 'still'}</span>
      </button>
    );
  });

  // Celebration tiles: one per kind. We render a stripped-down preview that
  // mirrors the celebration shell's structural choices (modifier class +
  // shine/particles flags) without actually mounting the full layer — full
  // CelebrationLayer requires a store + queue, which would conflate authoring
  // with runtime queue state. Authors get a quick visual confirmation here;
  // the live runtime is the source of truth for animation timing.
  const tunables = effectDraft?.celebrationTunables?.[asset.key] || {};
  const celebrationTiles = CELEBRATION_KINDS.map((kind) => {
    const tunable = tunables[kind] || { showParticles: false, showShine: false, modifierClass: '' };
    const modifier = typeof tunable.modifierClass === 'string' && tunable.modifierClass.length > 0
      ? ` celebration-shell--${tunable.modifierClass}`
      : '';
    return (
      <div className={`monster-effect-celebration-preview${modifier}`} key={kind}>
        <span className="monster-visual-preview-meta">
          <span>Celebration: {kind}</span>
        </span>
        <div className="small muted" style={{ marginTop: 6 }}>
          {tunable.showParticles ? 'Particles on' : 'Particles off'}
          {' · '}
          {tunable.showShine ? 'Shine on' : 'Shine off'}
          {tunable.modifierClass ? ` · ${tunable.modifierClass}` : ''}
        </div>
      </div>
    );
  });

  return (
    <MonsterEffectConfigProvider value={effectDraft || null}>
      <div className="monster-visual-preview-grid">
        {monsterRenderTiles}
      </div>
      <div className="monster-visual-celebration-grid">
        {celebrationTiles}
      </div>
    </MonsterEffectConfigProvider>
  );
}
