
/**
 * HeroCampConfirmation — calm confirmation dialog for Hero Camp actions.
 *
 * Shows cost, balance after, and two calm buttons (confirm / cancel).
 * No urgency, no pressure, no countdown. Clear language for ages 7-11.
 *
 * Props:
 *   visible       — boolean, whether to show the dialog
 *   heading       — e.g. "Use 150 Hero Coins to invite Glossbloom?"
 *   balanceAfter  — e.g. "Your balance will be 350 Hero Coins."
 *   actionLabel   — e.g. "invite" or "grow"
 *   onConfirm     — () => void
 *   onCancel      — () => void
 */
export function HeroCampConfirmation({
  visible,
  heading,
  balanceAfter,
  actionLabel,
  onConfirm,
  onCancel,
}) {
  if (!visible) return null;

  const confirmText = actionLabel
    ? `Yes, ${actionLabel}`
    : 'Yes';

  return (
    <div
      className="hero-camp-confirmation"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hero-camp-confirmation-heading"
      data-hero-camp-confirmation
    >
      <div className="hero-camp-confirmation__backdrop" aria-hidden="true" />
      <div className="hero-camp-confirmation__panel">
        <h2
          id="hero-camp-confirmation-heading"
          className="hero-camp-confirmation__heading"
        >
          {heading}
        </h2>
        <p className="hero-camp-confirmation__balance-after">
          {balanceAfter}
        </p>
        <div className="hero-camp-confirmation__actions">
          <button
            type="button"
            className="btn primary hero-camp-confirmation__confirm"
            onClick={onConfirm}
            aria-label={confirmText}
          >
            {confirmText}
          </button>
          <button
            type="button"
            className="btn ghost hero-camp-confirmation__cancel"
            onClick={onCancel}
            aria-label="Not now"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
