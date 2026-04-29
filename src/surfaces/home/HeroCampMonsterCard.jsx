import React from 'react';
import { getHeroMonsterAssetSrc } from '../../platform/hero/hero-monster-assets.js';

/**
 * HeroCampMonsterCard — individual monster card within Hero Camp.
 *
 * Calm, playful design for ages 7-11. No shop/deal/loot language.
 * Accessible: all buttons have aria-labels, keyboard focusable.
 *
 * Props:
 *   monster      — monster view model from buildHeroCampModel
 *   balance      — current Hero Coins balance
 *   onInvite     — (monsterId, branch) => void
 *   onGrow       — (monsterId, targetStage) => void
 */
export function HeroCampMonsterCard({ monster, balance, onInvite, onGrow }) {
  if (!monster) return null;

  const fullyGrown = monster.fullyGrown === true;
  const owned = monster.owned === true;

  // Determine CTA state
  let ctaText = '';
  let ctaDisabled = false;
  let ctaAction = null;

  if (fullyGrown) {
    ctaText = 'Fully grown';
  } else if (!owned) {
    const cost = monster.inviteCost || 0;
    ctaText = `Invite — ${cost} Hero Coins`;
    ctaDisabled = balance < cost;
    ctaAction = () => onInvite?.(monster.monsterId, monster.defaultBranch || 'b1');
  } else {
    const cost = monster.nextGrowCost || 0;
    ctaText = `Grow — ${cost} Hero Coins`;
    ctaDisabled = balance < cost;
    ctaAction = () => onGrow?.(monster.monsterId, monster.nextStage);
  }

  // Stage indicator (dots)
  const maxStage = monster.maxStage || 4;
  const currentStage = monster.stage || 0;

  // Monster image asset
  const assetSrc = getHeroMonsterAssetSrc(
    monster.sourceAssetMonsterId || monster.monsterId,
    currentStage,
    monster.branch,
  );

  return (
    <div
      className="hero-camp-monster-card"
      data-monster-id={monster.monsterId}
      data-owned={owned ? 'true' : 'false'}
      data-fully-grown={fullyGrown ? 'true' : 'false'}
    >
      {/* Monster image */}
      <div className="hero-camp-monster-card__image-container">
        <img
          className="hero-camp-monster-card__image"
          src={assetSrc.src}
          srcSet={assetSrc.srcSet}
          sizes="(max-width: 480px) 160px, 240px"
          alt={`${monster.displayName}${owned ? `, stage ${currentStage}` : ''}`}
          loading="lazy"
          onError={(e) => { e.currentTarget.src = assetSrc.fallback; }}
        />
      </div>

      <div className="hero-camp-monster-card__header">
        <h3 className="hero-camp-monster-card__name">{monster.displayName}</h3>
        {/* Branch field retained in state for future expansion but never exposed to child */}
      </div>

      <p className="hero-camp-monster-card__blurb">{monster.childBlurb}</p>

      {owned && (
        <div className="hero-camp-monster-card__stage" aria-label={`Stage ${currentStage} of ${maxStage}`}>
          {Array.from({ length: maxStage }, (_, i) => (
            <span
              key={i}
              className={`hero-camp-monster-card__stage-dot${i < currentStage ? ' hero-camp-monster-card__stage-dot--filled' : ''}`}
              aria-hidden="true"
            />
          ))}
          <span className="hero-camp-monster-card__stage-label">
            {fullyGrown ? 'Fully grown' : `Stage ${currentStage}`}
          </span>
        </div>
      )}

      {!owned && (
        <div className="hero-camp-monster-card__stage" aria-label="Not yet invited">
          <span className="hero-camp-monster-card__stage-label">Not yet invited</span>
        </div>
      )}

      <div className="hero-camp-monster-card__cta">
        {fullyGrown ? (
          <span className="hero-camp-monster-card__fully-grown" aria-label="Fully grown">
            Fully grown
          </span>
        ) : (
          <button
            type="button"
            className={`btn hero-camp-monster-card__action${ctaDisabled ? ' hero-camp-monster-card__action--disabled' : ''}`}
            disabled={ctaDisabled}
            onClick={ctaAction}
            aria-label={ctaText}
          >
            {ctaText}
          </button>
        )}
        {ctaDisabled && !fullyGrown && (
          <p className="hero-camp-monster-card__insufficient" aria-live="polite">
            Save more Hero Coins by completing Hero Quests.
          </p>
        )}
      </div>
    </div>
  );
}
