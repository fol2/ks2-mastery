/* Platform SubjectCompanionPanel primitive (P3 U5).
 *
 * A lightweight companion info-panel for setup scenes. Renders learner
 * stats, next-focus guidance, and monster names (text-only — no images
 * to keep bundle weight minimal).
 *
 * Props:
 *   subjectId: string — 'spelling' | 'punctuation' | 'grammar'
 *   learnerName?: string — the child's display name
 *   monsters?: Array<{ id, name }> — active monsters (text-only)
 *   stats?: Array<{ label, value, tone? }> — key metrics as dl/dt/dd
 *   nextFocus?: string — guidance text for what to work on next
 *   emptyState?: string — message when monsters is empty
 *
 * Contract:
 *   - Display-only: NO mastery mutation, no store imports.
 *   - Uses SectionHeader for panel section headings.
 *   - Unknown subjectId renders emptyState without crash.
 */
import { SectionHeader } from './SectionHeader.jsx';

const KNOWN_SUBJECTS = new Set(['spelling', 'punctuation', 'grammar']);

export function SubjectCompanionPanel({
  subjectId,
  learnerName = '',
  monsters = [],
  stats = [],
  nextFocus = '',
  emptyState = 'No data available yet.',
}) {
  if (!KNOWN_SUBJECTS.has(subjectId)) {
    return (
      <aside className="companion-panel companion-panel--unknown" data-subject={subjectId || 'none'}>
        <p className="companion-panel-empty">{emptyState}</p>
      </aside>
    );
  }

  const hasMonsters = Array.isArray(monsters) && monsters.length > 0;

  return (
    <aside className="companion-panel" data-subject={subjectId}>
      <SectionHeader
        eyebrow={subjectId}
        title={learnerName ? `${learnerName}'s companion` : 'Your companion'}
        level={3}
      />
      {stats.length > 0 ? (
        <dl className="companion-panel-stats">
          {stats.map((s) => (
            <div className="companion-panel-stat" key={s.label} data-tone={s.tone || undefined}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {nextFocus ? <p className="companion-panel-focus">{nextFocus}</p> : null}
      {hasMonsters ? (
        <ul className="companion-panel-monsters">
          {monsters.map((m) => <li key={m.id}>{m.name}</li>)}
        </ul>
      ) : (
        <p className="companion-panel-empty">{emptyState}</p>
      )}
    </aside>
  );
}
