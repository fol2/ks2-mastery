import {
  HERO_CTA_TEXT,
  HERO_PROGRESS_COPY,
  HERO_ECONOMY_COPY,
  HERO_SUBJECT_LABELS,
} from '../../../shared/hero/hero-copy.js';
import { Button } from '../../platform/ui/Button.jsx';
import { EmptyState } from '../../platform/ui/EmptyState.jsx';
import { ErrorCard } from '../../platform/ui/ErrorCard.jsx';

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

  // (p3-a) Daily complete — with optional economy acknowledgement
  if (hero.dailyStatus === 'completed') {
    return (
      <div className="hero-quest-card hero-quest-card--complete" data-hero-card>
        <h2 className="hero-quest-card__title">Today's Hero Quest</h2>
        <p className="hero-quest-card__daily-complete" aria-live="polite">
          {HERO_PROGRESS_COPY.dailyComplete}
        </p>
        {hero.showCoinsAwarded && (
          <div className="hero-quest-card__economy" aria-live="polite">
            <p className="hero-quest-card__coins-added">
              {hero.coinsAwardedToday} {HERO_ECONOMY_COPY.coinsAdded}
            </p>
            <p className="hero-quest-card__coin-balance">
              Balance: {hero.coinBalance} {HERO_ECONOMY_COPY.balanceLabel}.
            </p>
          </div>
        )}
        {!hero.showCoinsAwarded && (
          <p className="hero-quest-card__daily-complete-detail">
            {HERO_PROGRESS_COPY.dailyCompleteDetail}
          </p>
        )}
      </div>
    );
  }

  // (p3-b) Claiming state — background progress check in flight
  if (hero.claiming) {
    return (
      <div className="hero-quest-card hero-quest-card--claiming" data-hero-card>
        <h2 className="hero-quest-card__title">Today's Hero Quest</h2>
        <p className="hero-quest-card__claiming" aria-live="polite">
          {HERO_PROGRESS_COPY.claiming}
        </p>
        <div className="hero-quest-card__cta-row">
          <Button size="xl" busy>
            {HERO_PROGRESS_COPY.claiming}
          </Button>
        </div>
      </div>
    );
  }

  // (p3-c) Task just claimed — transient feedback
  if (hero.lastClaim && hero.lastClaim.status === 'claimed') {
    const totalTasks = Math.ceil((hero.effortPlanned || 0) / 6) || 1;
    const completedCount = hero.completedTaskIds?.length || 0;
    const hasMore = completedCount < totalTasks;
    return (
      <div className="hero-quest-card hero-quest-card--claimed" data-hero-card aria-live="polite">
        <h2 className="hero-quest-card__title">Today's Hero Quest</h2>
        <p className="hero-quest-card__task-complete">
          {HERO_PROGRESS_COPY.taskComplete}
        </p>
        <p className="hero-quest-card__task-complete-detail">
          {HERO_PROGRESS_COPY.taskCompleteDetail}
        </p>
        {hasMore && (
          <p className="hero-quest-card__next-ready">
            {HERO_PROGRESS_COPY.nextTaskReady}
          </p>
        )}
        {hasMore && hero.canStart && (
          <div className="hero-quest-card__cta-row">
            <Button
              size="xl"
              onClick={() => actions.startHeroQuestTask(hero.nextTask?.taskId)}
            >
              {HERO_CTA_TEXT.start}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // (g) Stale quest / error state — routed through the shared ErrorCard
  // primitive so `data-error-code="hero-quest-load"` carries telemetry +
  // the canonical retry button is consistent with other error fallbacks.
  if (hasError && !hero.canStart && !hero.canContinue) {
    return (
      <div className="hero-quest-card hero-quest-card--error" data-hero-card>
        <ErrorCard
          title="Today's Hero Quest"
          body={hero.error === 'hero_active_session_conflict'
            ? 'Quest updated. Try again.'
            : 'Your Hero Quest refreshed. Try the next task now.'}
          code="hero-quest-load"
          onRetry={() => actions.refreshHeroQuest()}
          retryLabel={HERO_CTA_TEXT.refresh}
        />
      </div>
    );
  }

  // (d) Active Hero session — "Continue Hero task" CTA (navigation only, no POST)
  if (hero.canContinue) {
    const session = hero.activeHeroSession;
    if (!session) return null;
    const subjectName = HERO_SUBJECT_LABELS[session.subjectId] || session.subjectId;
    const totalTasks = Math.ceil((hero.effortPlanned || 0) / 6) || 0;
    const completedCount = hero.completedTaskIds?.length || 0;
    return (
      <div className="hero-quest-card hero-quest-card--continue" data-hero-card>
        <h2 className="hero-quest-card__title">Today's Hero Quest</h2>
        <p className="hero-quest-card__subtitle">
          You have a {subjectName} task in progress.
        </p>
        {totalTasks > 0 && completedCount > 0 && (
          <p className="hero-quest-card__progress">
            {completedCount} of {totalTasks} tasks complete
          </p>
        )}
        <div className="hero-quest-card__cta-row">
          <Button
            size="xl"
            onClick={() => actions.continueHeroTask(session.subjectId)}
          >
            {HERO_CTA_TEXT.continue}
          </Button>
        </div>
      </div>
    );
  }

  // (c) Ready with launchable task
  if (hero.canStart) {
    const task = hero.nextTask;
    const subjectName = HERO_SUBJECT_LABELS[task.subjectId] || task.subjectId;
    const totalTasks = Math.ceil((hero.effortPlanned || 0) / 6) || 0;
    const completedCount = hero.completedTaskIds?.length || 0;

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

        {totalTasks > 0 && completedCount > 0 && (
          <p className="hero-quest-card__progress">
            {completedCount} of {totalTasks} tasks complete
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
          <Button
            size="xl"
            busy={isLaunching}
            onClick={() => actions.startHeroQuestTask(task.taskId)}
          >
            {isLaunching ? HERO_CTA_TEXT.starting : HERO_CTA_TEXT.start}
          </Button>
        </div>
      </div>
    );
  }

  // (e) No launchable tasks — enabled but nothing to start or continue.
  // Routed through the shared EmptyState primitive. Title + body keep
  // the canonical "No Hero task is ready yet" anchor + "your subjects
  // are still available below" hint that the dashboard tests pin.
  return (
    <div className="hero-quest-card hero-quest-card--empty" data-hero-card>
      <EmptyState
        title="No Hero task is ready yet"
        body="Your Hero progress is safe — your subjects are still available below."
      />
    </div>
  );
}
