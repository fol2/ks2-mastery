/* Platform SubjectCompanionPanel primitive (P3 U5).
 *
 * Display-only panel: monsters list, stats (dl/dt/dd), next-focus text.
 * Props: subjectId, monsters [{name, discovered}], stats [{label, value, tone?}],
 * monsterVisuals [{id, visual: {style, imageProps}, isEgg}] (rich meadow mode),
 * nextFocus (string), emptyState (string). Stateless (R10): no store, no mastery writes.
 */
import { SectionHeader } from './SectionHeader.jsx';

export function SubjectCompanionPanel({
  subjectId,
  monsters = [],
  monsterVisuals = [],
  stats = [],
  nextFocus = '',
  emptyState = 'Nothing to show yet.',
  visible = false,
}) {
  const hasContent = monsterVisuals.length > 0 || monsters.length > 0 || stats.length > 0;
  if (!hasContent) {
    return (
      <aside className="companion-panel" data-subject={subjectId || 'unknown'} data-testid="companion-panel" hidden={!visible}>
        <p className="companion-panel-empty">{emptyState}</p>
      </aside>
    );
  }
  return (
    <aside className="companion-panel" data-subject={subjectId || 'unknown'} data-testid="companion-panel" hidden={!visible}>
      {/* Monster meadow — rich visuals when available, text glyphs fallback */}
      {monsterVisuals.length > 0 ? (
        <section className="companion-panel-monsters">
          <div className="ss-meadow" aria-label={`${monsterVisuals.length} caught monster${monsterVisuals.length === 1 ? '' : 's'}`}>
            {monsterVisuals.map((m) => (
              <div className={`ss-meadow-cell${m.isEgg ? ' egg' : ''}`} key={m.id}>
                <span className="ss-meadow-visual" style={m.visual.style}>
                  <img className="ss-meadow-art" alt="" {...m.visual.imageProps} />
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : monsters.length > 0 ? (
        <section className="companion-panel-monsters">
          <SectionHeader title="Monsters" level={3} />
          <ul className="companion-panel-monster-list">
            {monsters.map((m, idx) => (
              <li key={m.name || idx} data-discovered={m.discovered ? 'true' : 'false'}>
                <span className="companion-panel-monster-glyph" aria-hidden="true">{m.name?.[0]?.toUpperCase() || '?'}</span>
                <span className="companion-panel-monster-name">{m.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Stats grid */}
      {stats.length > 0 ? (
        <section className="companion-panel-stats">
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
