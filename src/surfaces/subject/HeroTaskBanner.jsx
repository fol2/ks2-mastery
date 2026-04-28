import React from 'react';
import {
  HERO_INTENT_LABELS,
  HERO_PROGRESS_COPY,
} from '../../../shared/hero/hero-copy.js';

/**
 * HeroTaskBanner -- quiet subject-surface banner shown when the current
 * practice round was launched as part of a Hero Quest.
 *
 * Props:
 *   lastLaunch    -- heroUi.lastLaunch (set by applyHeroLaunchResponse in U4)
 *   subjectName   -- the routed subject's display name
 *   taskCompleted -- true when the Hero task has been marked complete
 *
 * CRITICAL: the banner reads from heroUi.lastLaunch, NOT from
 * session.heroContext (which is stripped by every subject's safeSession).
 *
 * Renders:
 *   - "Hero Quest task: {subjectName} -- {intent label}"
 *   - "This round is part of today's Hero Quest."
 *   - Post-completion: "Hero task complete. Return to your Hero Quest for
 *     the next round."
 *
 * Does NOT render: coins, completion progress, "reward waiting",
 * task checkboxes, pressure copy, or any economy vocabulary.
 */
export function HeroTaskBanner({ lastLaunch, subjectName, taskCompleted }) {
  if (!lastLaunch && !taskCompleted) return null;

  if (taskCompleted) {
    return (
      <div className="hero-task-banner hero-task-banner--complete" data-hero-task-banner aria-live="polite">
        <p className="hero-task-banner__complete">
          {HERO_PROGRESS_COPY.bannerComplete}
        </p>
      </div>
    );
  }

  if (!lastLaunch || !lastLaunch.subjectId) return null;

  const intentLabel = HERO_INTENT_LABELS[lastLaunch.intent] || 'Hero task';

  return (
    <div className="hero-task-banner" data-hero-task-banner>
      <p className="hero-task-banner__label">
        Hero Quest task: {subjectName} — {intentLabel}
      </p>
      <p className="hero-task-banner__detail">
        This round is part of today&apos;s Hero Quest.
      </p>
    </div>
  );
}
