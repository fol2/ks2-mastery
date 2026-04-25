// Shared chrome for transient monster celebrations. Each kind (caught,
// evolve, mega) only differs in which decorative slots are populated and
// in the eyebrow/body copy — everything else is centralised here so the
// existing `.monster-celebration-*` CSS continues to drive visuals.
//
// Sprite positioning flows through monster-visual-config (`celebrationOverlay`
// context) so per-monster offset/anchor/scale match codex tiles. Without
// this the halo stays centred but the sprite renders unaligned.

import { useMonsterVisualConfig } from '../../MonsterVisualConfigContext.jsx';
import { resolveMonsterVisual } from '../../monster-visual-config.js';
import { monsterVisualCelebrationStyle } from '../../monster-visual-style.js';

const PALETTE_DEFAULTS = Object.freeze({
  primary: '#3E6FA8',
  secondary: '#FFE9A8',
  pale: '#F8F4EA',
});

export function clampStage(value) {
  return Math.max(0, Math.min(4, Number(value) || 0));
}

export function stageName(monster, stage) {
  return Array.isArray(monster?.nameByStage) && monster.nameByStage[stage]
    ? monster.nameByStage[stage]
    : `${monster?.name || 'Monster'} stage ${stage}`;
}

function CelebrationParticles() {
  return (
    <div className="monster-celebration-parts">
      {Array.from({ length: 10 }).map((_, index) => (
        <span className="monster-celebration-part" key={index} />
      ))}
    </div>
  );
}

function CelebrationVisual({ className, stage, visual }) {
  if (!visual) return null;
  return (
    <span
      className={`monster-celebration-visual ${className}`}
      data-stage={stage}
      style={monsterVisualCelebrationStyle(visual)}
    >
      <span className="monster-celebration-shadow" />
      <img
        className={`monster-celebration-art ${className}`}
        alt=""
        src={visual.src}
        srcSet={visual.srcSet}
        sizes="min(90vw, 540px)"
      />
    </span>
  );
}

export function CelebrationShell({
  kind,
  modifierClass = '',
  monster,
  fromStage,
  toStage,
  branch,
  showParticles = false,
  showShine = false,
  showBefore = false,
  eyebrow,
  body,
  onComplete,
}) {
  const monsterVisualConfig = useMonsterVisualConfig();
  const config = monsterVisualConfig?.config;

  const className = `monster-celebration-overlay ${kind}${modifierClass ? ` ${modifierClass}` : ''}`;
  const palette = {
    primary: monster?.accent || PALETTE_DEFAULTS.primary,
    secondary: monster?.secondary || PALETTE_DEFAULTS.secondary,
    pale: monster?.pale || PALETTE_DEFAULTS.pale,
  };

  const beforeVisual = showBefore
    ? resolveMonsterVisual({
        monsterId: monster?.id,
        branch,
        stage: fromStage,
        context: 'celebrationOverlay',
        config,
        preferredSize: 640,
      })
    : null;

  const afterVisual = resolveMonsterVisual({
    monsterId: monster?.id,
    branch,
    stage: toStage,
    context: 'celebrationOverlay',
    config,
    preferredSize: 640,
  });

  return (
    <section
      className={className}
      role="dialog"
      aria-modal="true"
      aria-labelledby="monster-celebration-title"
      style={{
        '--monster-primary': palette.primary,
        '--monster-secondary': palette.secondary,
        '--monster-pale': palette.pale,
      }}
    >
      <div className="monster-celebration-stage" aria-hidden="true">
        {showParticles && <CelebrationParticles />}
        <div className="monster-celebration-halo" />
        {showShine && <div className="monster-celebration-shine" />}
        {showBefore && (
          <CelebrationVisual className="before" stage={fromStage} visual={beforeVisual} />
        )}
        <div className="monster-celebration-white" />
        <CelebrationVisual className="after" stage={toStage} visual={afterVisual} />
      </div>

      <div className="monster-celebration-card">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id="monster-celebration-title">{stageName(monster, toStage)}</h2>
        <p>{body}</p>
        <button className="btn primary lg" type="button" onClick={onComplete}>Keep going</button>
      </div>
    </section>
  );
}
