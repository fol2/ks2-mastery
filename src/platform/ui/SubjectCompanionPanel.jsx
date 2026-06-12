/* Platform SubjectCompanionPanel primitive (P3 U5).
 *
 * Display-only panel: monsters list, stats (dl/dt/dd), next-focus text.
 * Props: subjectId, head (ReactNode), monsters [{name, discovered}],
 * monsterVisuals [{id, visual: {style, imageProps}, isEgg}] (rich meadow mode),
 * meadowEmpty (string), stats [{label, value, tone?}],
 * nextFocus (string), emptyState (string). Stateless (R10): no store, no mastery writes.
 */
import { SectionHeader } from './SectionHeader.jsx';
import { applyMonsterImageFallback } from '../game/render/image-fallback.js';

export function SubjectCompanionPanel({
  subjectId,
  head = null,
  monsters = [],
  monsterVisuals = [],
  meadowEmpty = '',
  stats = [],
  nextFocus = '',
  emptyState = 'Nothing to show yet.',
  visible = false,
}) {
  const hasContent = head || monsterVisuals.length > 0 || meadowEmpty || monsters.length > 0 || stats.length > 0;
  if (!hasContent) {
    return (
      <aside className="companion-panel" data-subject={subjectId || 'unknown'} data-testid="companion-panel" hidden={!visible}>
        <p className="companion-panel-empty">{emptyState}</p>
      </aside>
    );
  }
  return (
    <aside className="companion-panel" data-subject={subjectId || 'unknown'} data-testid="companion-panel" hidden={!visible}>
      {head ? <div className="ss-head">{head}</div> : null}
      {/* Monster meadow — rich visuals when available, text glyphs fallback */}
      {monsterVisuals.length > 0 ? (
        <section className="companion-panel-monsters">
          <div className="ss-meadow" aria-label={`${monsterVisuals.length} caught monster${monsterVisuals.length === 1 ? '' : 's'}`}>
            {monsterVisuals.map((m) => (
              <div className={`ss-meadow-cell${m.isEgg ? ' egg' : ''}`} key={m.id}>
                <span className="ss-meadow-visual" style={m.visual.style}>
                  <img className="ss-meadow-art" alt="" {...m.visual.imageProps} onError={applyMonsterImageFallback} />
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : meadowEmpty ? (
        <div className="ss-meadow-empty small muted">{meadowEmpty}</div>
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

      {/* Stats grid — uses ss-stat-grid classes for design consistency */}
      {stats.length > 0 ? (
        <div className="ss-stat-grid">
          {stats.map((s) => (
            <div className={`ss-stat${s.tone ? ` ss-stat--${s.tone}` : ''}`} key={s.label}>
              <div className="ss-stat-label">{s.label}</div>
              <div className="ss-stat-value">{s.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {nextFocus ? <p className="companion-panel-focus">{nextFocus}</p> : null}
    </aside>
  );
}
