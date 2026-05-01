/* Platform HomeHeroScene composition (P4 U2).
 *
 * Unifies the dashboard hero panel and subject card grid into one scene
 * contract. Display-only: no Hero/Camp/Coin economy copy introduced.
 *
 * Props:
 *   - learner        {object}   Learner summary (name, id)
 *   - readySubjects  {array}    Subject descriptors currently live
 *   - todayFocus     {string?}  Optional focus label for the day
 *   - creatureHighlights {array?} Decorative creature names (text-only)
 *   - heroPanel      {ReactNode?} Full dashboard hero panel supplied by HomeSurface
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
  heroPanel,
  primaryAction,
  secondaryActions,
  heroQuest, // forward-compat: accepted without changing card APIs
  children,
}) {
  const actions = Array.isArray(secondaryActions) ? secondaryActions : [];
  const hasFallbackActions = primaryAction || actions.length > 0;

  return (
    <section className="home-hero-scene" data-scene="home-hero">
      {heroPanel || (
        <>
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
          {hasFallbackActions && (
            <div className="home-hero-scene-actions">
              {primaryAction && (
                <Button
                  variant="primary"
                  size="xl"
                  dataAction={primaryAction.dataAction}
                  onClick={primaryAction.onClick}
                >
                  {primaryAction.label}
                </Button>
              )}
              {actions.map((action, i) => (
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
          )}
        </>
      )}
      {children}
    </section>
  );
}
