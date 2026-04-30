// UI Refactor P3 U3 — Session HUD (Heads-Up Display).
//
// Shared progress HUD component for all subject sessions. Renders an
// accessible ProgressMeter plus a child-safe text status line showing
// how many questions the learner has answered and how many remain.
//
// Stateless by design (R10): no store subscription, no side-effect hooks.
// The parent scene is responsible for threading the current counts from
// whatever view-model or read-model it uses.
//
// The copy style is deliberately child-safe and encouraging:
//   "You have answered 6 of 10." / "4 left in this round."
// Forbidden patterns are listed in the plan and tested by contract tests.
//
// Edge cases:
//   - totalCount=0 → safe fallback text, not NaN
//   - remainingCount clamped to >= 0
//   - progress percentage never exceeds 100%
//
// ARIA: role="progressbar" (via ProgressMeter), aria-valuenow,
// aria-valuemin, aria-valuemax, aria-label.
//
// prefers-reduced-motion: the CSS rule on `.progress-meter-fill` already
// sets `transition: none` under reduced-motion. The HUD uses no JS
// animation — the static fill is the only visual.

import { ProgressMeter } from './ProgressMeter.jsx';

/**
 * @param {{
 *   subjectId?: string,
 *   title?: string,
 *   answeredCount: number,
 *   totalCount: number,
 *   remainingCount?: number,
 *   currentIndex?: number,
 *   modeLabel?: string,
 *   supportState?: 'none'|'available'|'used'|'locked',
 *   progressLabel?: string,
 *   accent?: string,
 * }} props
 */
export function SessionHUD({
  subjectId,
  title,
  answeredCount,
  totalCount,
  remainingCount,
  currentIndex,
  modeLabel,
  supportState,
  progressLabel,
  accent,
}) {
  // Defensive normalisation — avoids NaN / Infinity / negative values.
  const safeTotal = Math.max(0, Number(totalCount) || 0);
  const safeAnswered = Math.min(safeTotal, Math.max(0, Number(answeredCount) || 0));
  const safeRemaining = typeof remainingCount === 'number'
    ? Math.max(0, remainingCount)
    : Math.max(0, safeTotal - safeAnswered);
  const safeIndex = typeof currentIndex === 'number'
    ? Math.min(safeTotal, Math.max(0, currentIndex))
    : safeAnswered;

  // Percentage clamped 0–100 (ProgressMeter also clamps internally).
  const pct = safeTotal > 0 ? Math.min(100, Math.round((safeAnswered / safeTotal) * 100)) : 0;

  // Child-safe copy. Zero-total gets a fallback that is still meaningful.
  const answeredText = safeTotal > 0
    ? `You have answered ${safeAnswered} of ${safeTotal}.`
    : 'Getting ready…';
  const remainingText = safeTotal > 0 && safeRemaining > 0
    ? `${safeRemaining} left in this round.`
    : '';

  // Accessible label for the progressbar.
  const ariaLabel = safeTotal > 0
    ? `Question progress: ${safeAnswered} of ${safeTotal} answered`
    : 'Question progress';

  return (
    <div
      className="session-hud"
      data-session-hud
      data-subject={subjectId || undefined}
      data-support-state={supportState || undefined}
    >
      {title || progressLabel ? (
        <div className="session-hud-title" data-session-hud-title>
          {title || progressLabel}
          {modeLabel ? <span className="session-hud-mode">{modeLabel}</span> : null}
        </div>
      ) : null}
      <ProgressMeter
        value={pct}
        min={0}
        max={100}
        label={ariaLabel}
        className="session-hud-meter"
      />
      <div className="session-hud-status" data-session-hud-status aria-live="polite">
        <span className="session-hud-answered">{answeredText}</span>
        {remainingText ? <span className="session-hud-remaining">{remainingText}</span> : null}
      </div>
    </div>
  );
}
