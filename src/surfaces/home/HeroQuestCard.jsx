import React from 'react';
import {
  HERO_CTA_TEXT,
  HERO_SUBJECT_LABELS,
  HERO_UI_REASON_LABELS,
} from '../../../shared/hero/hero-copy.js';

/**
 * HeroQuestCard — child-facing Hero Quest card for the dashboard.
 *
 * Renders the daily Hero Quest with a single primary CTA, graceful
 * fallback for each UI state, and zero economy vocabulary.
 *
 * Props:
 *   hero    — normalised model from buildHeroHomeModel
 *   actions — { startHeroQuestTask, continueHeroTask, refreshHeroQuest }
 */
export function HeroQuestCard({ hero, actions }) {
  // (a) Disabled / unavailable — return null; HomeSurface shows fallback.
  if (!hero || hero.enabled !== true) return null;

  // (b) Loading — return null so the dashboard is not blocked.
  if (hero.status === 'loading') return null;

  const isLaunching = hero.status === 'launching';
  const hasError = Boolean(hero.error);

  // (g) Stale quest / error state
  if (hasError && !hero.canStart && !hero.canContinue) {
    return (
      <div className="hero-quest-card hero-quest-card--error" data-hero-card>
        <h2 className="hero-quest-card__title">Today's Hero Quest</h2>
        <div className="hero-quest-card__error" aria-live="polite">
          <p>{hero.error === 'hero_active_session_conflict'
            ? 'Quest updated. Try again.'
            : 'Your Hero Quest refreshed. Try the next task now.'}</p>
        </div>
        <div className="hero-quest-card__cta-row">
          <button
            type="button"
            className="btn primary xl"
            onClick={() => actions.refreshHeroQuest()}
          >
            {HERO_CTA_TEXT.refresh}
          </button>
        </div>
      </div>
    );
  }

  // (d) Active Hero session — "Continue Hero task" CTA (navigation only, no POST)
  if (hero.canContinue) {
    const session = hero.activeHeroSession;
    if (!session) return null;
    const subjectName = HERO_SUBJECT_LABELS[session.subjectId] || session.subjectId;
    return (
      <div className="hero-quest-card hero-quest-card--continue" data-hero-card>
        <h2 className="hero-quest-card__title">Today's Hero Quest</h2>
        <p className="hero-quest-card__subtitle">
          You have a {subjectName} task in progress.
        </p>
        <div className="hero-quest-card__cta-row">
          <button
            type="button"
            className="btn primary xl"
            onClick={() => actions.continueHeroTask(session.subjectId)}
          >
            {HERO_CTA_TEXT.continue}
          </button>
        </div>
      </div>
    );
  }

  // (c) Ready with launchable task
  if (hero.canStart) {
    const task = hero.nextTask;
    const subjectName = HERO_SUBJECT_LABELS[task.subjectId] || task.subjectId;

    return (
      <div className="hero-quest-card hero-quest-card--ready" data-hero-card>
        <h2 className="hero-quest-card__title">Today's Hero Quest</h2>
        <p className="hero-quest-card__subtitle">
          A few strong rounds picked from your ready subjects.
        </p>

        {hero.effortPlanned > 0 && (
          <p className="hero-quest-card__effort">
            {hero.effortPlanned} effort planned
          </p>
        )}

        <div className="hero-quest-card__next-task">
          <span className="hero-quest-card__task-subject">{subjectName}</span>
          {task.childLabel && (
            <span className="hero-quest-card__task-label">{task.childLabel}</span>
          )}
          {task.childReason && (
            <p className="hero-quest-card__task-reason">{task.childReason}</p>
          )}
        </div>

        {hero.eligibleSubjects.length > 0 && (
          <div className="hero-quest-card__eligible">
            <span className="hero-quest-card__eligible-label">Ready subjects: </span>
            {hero.eligibleSubjects
              .map((id) => HERO_SUBJECT_LABELS[id] || id)
              .join(', ')}
          </div>
        )}

        {hero.lockedSubjects && hero.lockedSubjects.length > 0 && (
          <div className="hero-quest-card__locked">
            {hero.lockedSubjects
              .map((id) => HERO_SUBJECT_LABELS[id] || id)
              .join(', ')}{' '}
            coming later
          </div>
        )}

        {hasError && (
          <div className="hero-quest-card__error" aria-live="polite">
            <p>{hero.error === 'hero_active_session_conflict'
              ? 'Quest updated. Try again.'
              : 'Your Hero Quest refreshed. Try the next task now.'}</p>
          </div>
        )}

        <div className="hero-quest-card__cta-row">
          <button
            type="button"
            className="btn primary xl"
            disabled={isLaunching}
            aria-busy={isLaunching ? 'true' : undefined}
            onClick={() => actions.startHeroQuestTask(task.taskId)}
          >
            {isLaunching ? HERO_CTA_TEXT.starting : HERO_CTA_TEXT.start}
          </button>
        </div>
      </div>
    );
  }

  // (e) No launchable tasks — enabled but nothing to start or continue
  return (
    <div className="hero-quest-card hero-quest-card--empty" data-hero-card>
      <h2 className="hero-quest-card__title">Today's Hero Quest</h2>
      <p className="hero-quest-card__message">
        {HERO_UI_REASON_LABELS['no-launchable-tasks']}
      </p>
    </div>
  );
}
