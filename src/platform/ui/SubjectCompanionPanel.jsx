/* Platform SubjectCompanionPanel primitive (P3 U5).
 *
 * Shared companion panel adopted by all three ready subjects (Spelling,
 * Punctuation, Grammar). Displays owned monsters, subject stats, and
 * next-focus recommendation within the setup scene without mutating any
 * mastery state.
 *
 * Design contract:
 *   - Display-only: NO ownership creation, NO monster progress mutation,
 *     NO reward changes, NO Star/Mega changes.
 *   - SectionHeader adoption for panel section headers (3-adopter gate).
 *   - Empty monsters array → emptyState fallback message.
 *   - Stats rendered with semantic dl/dt/dd (StatCard pattern).
 *   - Unknown subjectId → renders empty state without crash.
 *   - Mobile 360px: vertical stack, no horizontal overflow.
 *   - Future subjects (reading, reasoning, arithmetic) render empty state.
 *
 * Props:
 *   subjectId   — string: subject identifier
 *   learnerName — string: display name (optional)
 *   monsters    — array of {name, imageUrl, discovered}
 *   stats       — array of {label, value, tone}
 *   nextFocus   — string: next-focus recommendation text (optional)
 *   emptyState  — string: fallback message when no monsters discovered
 *
 * Slot composition:
 *   - Uses SectionHeader for section headings (3-adopter gate contribution).
 *   - Uses dl/dt/dd semantic markup for stats (StatCard pattern).
 *
 * Stateless by design (R10): no platform-store subscription.
 */
import { SectionHeader } from './SectionHeader.jsx';

export function SubjectCompanionPanel({
  subjectId,
  learnerName = '',
  monsters = [],
  stats = [],
  nextFocus = '',
  emptyState = 'No companions discovered yet.',
}) {
  const discoveredMonsters = monsters.filter((m) => m && m.discovered);
  const hasMonsters = discoveredMonsters.length > 0;

  return (
    <section
      className="subject-companion-panel"
      data-subject={subjectId || 'unknown'}
      data-testid="subject-companion-panel"
      aria-label={learnerName ? `${learnerName}'s companions` : 'Subject companions'}
    >
      <SectionHeader
        eyebrow={subjectId || 'Companion'}
        title="Your companions"
        level={3}
      />

      {hasMonsters ? (
        <div className="companion-monster-grid" aria-label={`${discoveredMonsters.length} companion${discoveredMonsters.length === 1 ? '' : 's'}`}>
          {discoveredMonsters.map((monster, index) => (
            <div
              className="companion-monster-cell"
              key={monster.name || index}
              data-monster-name={monster.name || undefined}
            >
              {monster.imageUrl ? (
                <img
                  className="companion-monster-image"
                  src={monster.imageUrl}
                  alt={monster.name ? `${monster.name} companion` : ''}
                  aria-hidden={!monster.name ? 'true' : undefined}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="companion-monster-placeholder" aria-hidden="true" />
              )}
              {monster.name ? (
                <span className="companion-monster-name">{monster.name}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="companion-empty-state" role="status" aria-live="polite">
          {emptyState}
        </p>
      )}

      {stats.length > 0 ? (
        <div className="companion-stats">
          <SectionHeader title="At a glance" level={4} />
          <dl className="companion-stats-list">
            {stats.map((stat) => (
              <div
                className={`companion-stat${stat.tone ? ` companion-stat--${stat.tone}` : ''}`}
                key={stat.label}
              >
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {nextFocus ? (
        <div className="companion-next-focus">
          <SectionHeader title="Next focus" level={4} />
          <p className="companion-next-focus-text">{nextFocus}</p>
        </div>
      ) : null}
    </section>
  );
}
