/* Platform SessionSummaryFrame primitive (P3 U6).
 *
 * Shared summary engine adopted by all three ready subjects (Spelling,
 * Punctuation, Grammar). Presents session outcomes — highlights,
 * misconceptions, progress deltas, and next-action affordances — without
 * claiming unearned mastery.
 *
 * Design contract:
 *   - Display-only: NO mastery mutation, NO reward changes, NO star
 *     writes. progressDelta renders what the result model already
 *     computed — the frame never derives or inflates progress.
 *   - Exactly one primary action per render (enforced by prop shape).
 *   - SectionHeader adoption for "What went well" / "Try again" sections.
 *   - Empty misconceptions array → section hidden entirely.
 *   - Empty progressDelta array → no progress section rendered.
 *   - Forbidden copy patterns never appear in frame-authored text.
 *
 * Props:
 *   subjectId        — string: 'spelling' | 'punctuation' | 'grammar'
 *   outcome          — string: 'secure' | 'improving' | 'needs-practice' | 'review-complete'
 *   title            — string: session headline
 *   highlights       — array of strings: what went well
 *   misconceptions   — array of strings: areas to revisit (hidden if empty)
 *   progressDelta    — array of {label, from, to}: progress change indicators
 *   nextPrimaryAction — object: {label, dataAction, onClick}
 *   secondaryActions — array of {label, dataAction, variant, onClick}
 *
 * Slot composition:
 *   - Uses SectionHeader for section headings (3-adopter gate contribution).
 *   - Uses Button for primary action.
 *   - Uses ActionRow for action layout.
 */
import { SectionHeader } from './SectionHeader.jsx';
import { Button } from './Button.jsx';
import { ActionRow } from './ActionRow.jsx';

const OUTCOME_LABELS = {
  'secure': 'Secure',
  'improving': 'Improving',
  'needs-practice': 'Needs practice',
  'review-complete': 'Review complete',
};

export function SessionSummaryFrame({
  subjectId,
  outcome,
  title,
  highlights = [],
  misconceptions = [],
  progressDelta = [],
  nextPrimaryAction,
  secondaryActions = [],
}) {
  const outcomeLabel = OUTCOME_LABELS[outcome] || outcome || '';
  const hasHighlights = Array.isArray(highlights) && highlights.length > 0;
  const hasMisconceptions = Array.isArray(misconceptions) && misconceptions.length > 0;
  const hasProgress = Array.isArray(progressDelta) && progressDelta.length > 0;

  const primaryButton = nextPrimaryAction ? (
    <Button
      variant="primary"
      dataAction={nextPrimaryAction.dataAction}
      onClick={nextPrimaryAction.onClick}
    >
      {nextPrimaryAction.label}
    </Button>
  ) : null;

  const secondaryButtons = Array.isArray(secondaryActions)
    ? secondaryActions.map((action) => (
        <Button
          key={action.dataAction}
          variant={action.variant || 'secondary'}
          dataAction={action.dataAction}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))
    : [];

  return (
    <section
      className="session-summary-frame"
      data-session-summary-frame
      data-subject-id={subjectId}
      data-outcome={outcome}
    >
      <SectionHeader
        eyebrow={outcomeLabel}
        title={title}
        level={2}
        className="session-summary-frame-header"
      />

      {hasHighlights ? (
        <div className="session-summary-frame-highlights" data-summary-highlights>
          <SectionHeader
            title="What went well"
            level={3}
            className="session-summary-frame-section-head"
          />
          <ul className="session-summary-frame-list">
            {highlights.map((item, idx) => (
              <li key={`highlight-${idx}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasMisconceptions ? (
        <div className="session-summary-frame-misconceptions" data-summary-misconceptions>
          <SectionHeader
            title="Try again"
            level={3}
            className="session-summary-frame-section-head"
          />
          <ul className="session-summary-frame-list">
            {misconceptions.map((item, idx) => (
              <li key={`misconception-${idx}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasProgress ? (
        <div className="session-summary-frame-progress" data-summary-progress>
          <ul className="session-summary-frame-progress-list">
            {progressDelta.map((delta, idx) => (
              <li
                key={`progress-${idx}`}
                className="session-summary-frame-progress-item"
                data-progress-label={delta.label}
              >
                <span className="session-summary-frame-progress-label">{delta.label}</span>
                <span className="session-summary-frame-progress-change">
                  {delta.from} → {delta.to}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ActionRow
        primary={primaryButton}
        secondary={secondaryButtons.length === 1 ? secondaryButtons[0] : (
          secondaryButtons.length > 1 ? (
            <div className="session-summary-frame-secondary-group">
              {secondaryButtons}
            </div>
          ) : null
        )}
        align="start"
        className="session-summary-frame-actions"
        aria-label="Session next steps"
      />
    </section>
  );
}
