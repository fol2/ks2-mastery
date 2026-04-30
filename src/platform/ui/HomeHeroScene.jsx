/* Platform HomeHeroScene wrapper (P3 U7).
 *
 * Unifies subject cards, creature presence, and primary action into one
 * scene contract. WRAPS existing children (subject card grid) — does NOT
 * replace them. Display-only: no Hero/Camp/Coin economy copy introduced.
 *
 * Props:
 *   - learner        {object}   Learner summary (name, id)
 *   - readySubjects  {array}    Subject descriptors currently live
 *   - todayFocus     {string?}  Optional focus label for the day
 *   - creatureHighlights {array?} Decorative creature names (text-only)
 *   - primaryAction  {object}   {label, dataAction, onClick}
 *   - secondaryActions {array?} Additional action descriptors
 *   - heroQuest      {object?}  Forward-compat slot (accepted, not consumed)
 *   - children       React children (subject card grid)
 */
import { Button } from './Button.jsx';

export function HomeHeroScene({
  learner,
  readySubjects,
  todayFocus,
  creatureHighlights,
  primaryAction,
  secondaryActions,
  heroQuest, // forward-compat: accepted without changing card APIs
  children,
}) {
  return (
    <section className="home-hero-scene" data-scene="home-hero">
      {todayFocus && (
        <div className="home-hero-scene-focus" aria-live="polite">
          {todayFocus}
        </div>
      )}
      {creatureHighlights && creatureHighlights.length > 0 && (
        <div className="home-hero-scene-creatures" aria-hidden="true">
          {creatureHighlights.join(' · ')}
        </div>
      )}
      <div className="home-hero-scene-actions">
        <Button
          variant="primary"
          size="xl"
          dataAction={primaryAction.dataAction}
          onClick={primaryAction.onClick}
        >
          {primaryAction.label}
        </Button>
        {secondaryActions && secondaryActions.map((action, i) => (
          <Button
            key={action.dataAction || i}
            variant="ghost"
            size="xl"
            dataAction={action.dataAction}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ))}
      </div>
      {children}
    </section>
  );
}
