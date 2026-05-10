import { Button } from '../../platform/ui/Button.jsx';
import { EmptyState } from '../../platform/ui/EmptyState.jsx';
import { buildHeroCampModel } from '../../platform/hero/hero-camp-model.js';
import { HeroCampPanel } from './HeroCampPanel.jsx';

export function HeroCampSurface({ model, actions }) {
  const readModel = model?.heroReadModel || null;
  const campModel = buildHeroCampModel(readModel);
  const campEnabled = campModel.campEnabled === true;

  return (
    <main className="hero-camp-page" data-hero-camp-page>
      <section className="hero-camp-page__masthead" aria-labelledby="hero-camp-page-title">
        <div>
          <p className="eyebrow">Hero Camp</p>
          <h1 className="hero-camp-page__title" id="hero-camp-page-title">Hero Camp</h1>
        </div>
        <Button
          variant="ghost"
          dataAction="hero-camp-back-dashboard"
          onClick={actions.navigateHome}
        >
          Back to dashboard
        </Button>
      </section>

      {campEnabled ? (
        <HeroCampPanel
          readModel={readModel}
          heroClient={model.heroClient}
          learnerId={model.learner?.id}
          onRefresh={actions.refreshHeroQuest}
        />
      ) : (
        <section className="hero-camp-page__empty" data-hero-camp-empty>
          <EmptyState
            title="Hero Camp is quiet right now"
            body="Your Hero Quest is waiting on the dashboard."
          />
        </section>
      )}
    </main>
  );
}
