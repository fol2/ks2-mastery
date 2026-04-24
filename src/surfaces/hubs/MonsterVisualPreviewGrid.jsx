import React from 'react';
import {
  MONSTER_VISUAL_CONTEXTS,
  resolveMonsterVisual,
} from '../../platform/game/monster-visual-config.js';

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

export function MonsterVisualPreviewGrid({
  asset,
  draft,
  selectedContext = 'meadow',
  onSelectContext = () => {},
} = {}) {
  if (!asset || !draft) return null;

  return (
    <div className="monster-visual-preview-grid">
      {MONSTER_VISUAL_CONTEXTS.map((context) => {
        const visual = resolveMonsterVisual({
          monsterId: asset.monsterId,
          branch: asset.branch,
          stage: asset.stage,
          context,
          config: draft,
          preferredSize: 320,
        });
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
              <img
                alt=""
                className="monster-visual-preview-img"
                src={visual.src}
                srcSet={visual.srcSet}
                sizes="120px"
                style={previewStyle(visual)}
              />
            </span>
            <span className="small muted">{visual.path || 'none'} / {visual.motionProfile || 'still'}</span>
          </button>
        );
      })}
    </div>
  );
}

