/* Platform SubjectCompanionPanel primitive (P3 U5).
 *
 * Display-only panel: monsters list, stats (dl/dt/dd), next-focus text.
 * Props: subjectId, monsters [{name, discovered}], stats [{label, value, tone?}],
 * nextFocus (string), emptyState (string). Stateless (R10): no store, no mastery writes.
 */
import { SectionHeader } from './SectionHeader.jsx';

export function SubjectCompanionPanel({
  subjectId,
  monsters = [],
  stats = [],
  nextFocus = '',
  emptyState = 'Nothing to show yet.',
  visible = false,
}) {
  const hasContent = monsters.length > 0 || stats.length > 0;
  if (!hasContent) {
    return (
      <aside className="companion-panel" data-subject={subjectId || 'unknown'} data-testid="companion-panel" hidden={!visible}>
        <p className="companion-panel-empty">{emptyState}</p>
      </aside>
    );
  }
  return (
    <aside className="companion-panel" data-subject={subjectId || 'unknown'} data-testid="companion-panel" hidden={!visible}>
      {monsters.length > 0 ? (
        <section className="companion-panel-monsters">
          <SectionHeader title="Monsters" level={3} />
          <ul className="companion-panel-monster-list">
            {monsters.map((m) => (
              <li key={m.name} data-discovered={m.discovered ? 'true' : 'false'}>{m.name}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {stats.length > 0 ? (
        <section className="companion-panel-stats">
          <SectionHeader title="Stats" level={3} />
          <dl className="companion-panel-dl">
            {stats.map((s) => (
              <div key={s.label} className="companion-panel-stat" data-tone={s.tone || undefined}>
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {nextFocus ? <p className="companion-panel-focus">{nextFocus}</p> : null}
    </aside>
  );
}
