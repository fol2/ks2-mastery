import React, { useMemo } from 'react';
import { TopNav } from '../shell/TopNav.jsx';
import { MonsterMeadow } from './MonsterMeadow.jsx';
import { SubjectCard } from './SubjectCard.jsx';
import { HeroQuestCard } from './HeroQuestCard.jsx';
import { IconArrowRight } from './icons.jsx';
import {
  buildMeadowMonsters,
  buildSubjectCards,
  dueCopy,
  greetForHour,
  randomHeroBackground,
  selectTodaysBestRound,
} from './data.js';

export function HomeSurface({ model, actions, shellClassName = 'app-shell' }) {
  const heroBg = useMemo(() => randomHeroBackground(), [model.learner?.id]);
  const meadowSeed = useMemo(
    () => `${model.learner?.id || 'learner'}:${Math.random().toString(36).slice(2)}`,
    [model.learner?.id],
  );

  const meadowMonsters = useMemo(
    () => buildMeadowMonsters(model.monsterSummary || [], { seed: meadowSeed }),
    [model.monsterSummary, meadowSeed],
  );
  const subjectCards = useMemo(
    () => buildSubjectCards(model.subjects || [], model.dashboardStats || {}),
    [model.subjects, model.dashboardStats],
  );
  // Phase 4 U2 (R2): recommendation is computed from dashboardStats by a
  // pure helper. The returned shape drives the "Today's best round" card
  // and the primary CTA's target subject + label. When the helper returns
  // null (every subject has zero due work) we keep the pre-U2 hero copy
  // and the Spelling-first CTA so fresh learners see identical output.
  const recommendation = useMemo(
    () => selectTodaysBestRound(model.dashboardStats || {}, {
      monsterSummary: model.monsterSummary || [],
    }),
    [model.dashboardStats, model.monsterSummary],
  );

  const now = model.now || new Date();
  const greet = greetForHour(now.getHours());
  const dueTotal = model.dueTotal || 0;

  const companionName = pickCompanionName(model.monsterSummary || []);
  const ctaSubjectId = recommendation?.subjectId || 'spelling';
  const ctaLabel = recommendation
    ? `Start ${recommendation.subjectName}`
    : "Begin today's round";

  // P2 U5: Hero card renders when hero is in an active state (enabled,
  // canStart, or canContinue). When the Hero card renders, it replaces
  // the "Today's best round" recommendation block — they must not both
  // appear simultaneously.
  const hero = model.hero;
  const heroActive = hero?.enabled === true
    && hero.status !== 'loading';

  return (
    <div className={shellClassName}>
      <TopNav
        theme={model.theme}
        onToggleTheme={actions.toggleTheme}
        onNavigateHome={actions.navigateHome}
        learners={model.learnerOptions || []}
        selectedLearnerId={model.learner?.id || ''}
        learnerLabel={model.learnerLabel || ''}
        signedInAs={model.signedInAs}
        onSelectLearner={actions.selectLearner}
        onOpenProfileSettings={actions.openProfileSettings}
        onLogout={actions.logout}
        persistenceMode={model.persistence?.mode || 'local-only'}
        persistenceLabel={model.persistence?.label || ''}
        platformRole={model.session?.platformRole}
        onOpenAdmin={actions.openAdminHub}
        currentScreen="dashboard"
      />

      <div className="hero-paper" style={{ '--hero-bg': `url('${heroBg}')` }}>
        <div className="hero-art" aria-hidden="true" />
        <MonsterMeadow monsters={meadowMonsters} maxSlots={10} />
        <div className="hero-mission">
          <div className="greet">
            <b>{greet}, {model.learner?.name || 'there'}.</b>{' '}
            {companionName ? `${companionName} is ready for round ${model.roundNumber || 1}.` : 'A fresh round is waiting.'}
          </div>
          {heroActive ? (
            <HeroQuestCard hero={hero} actions={actions} />
          ) : (
            <>
              {recommendation ? (
                <>
                  <h1 className="mission">
                    Today's practice is <em>waiting.</em>
                  </h1>
                  <div className="hero-best-round" data-best-round-subject={recommendation.subjectId}>
                    <div className="hero-best-round-label">Today's best round:{' '}
                      <strong>{recommendation.subjectName}</strong>
                    </div>
                    <div className="hero-best-round-detail">
                      {recommendation.monsterCompanion
                        ? `${recommendation.monsterCompanion} has ${formatDueCount(recommendation.due)} due.`
                        : `${formatDueCount(recommendation.due)} due for you.`}
                    </div>
                  </div>
                </>
              ) : (
                <h1 className="mission">
                  Today's words are <em>waiting.</em>
                  <br />
                  {dueCopy(dueTotal)}
                </h1>
              )}
              <div className="hero-cta-row">
                <button
                  type="button"
                  className="btn primary xl"
                  data-action="open-subject"
                  data-subject-id={ctaSubjectId}
                  onClick={() => actions.openSubject(ctaSubjectId)}
                >
                  {ctaLabel} <IconArrowRight />
                </button>
                <button
                  type="button"
                  className="btn ghost xl"
                  onClick={actions.openCodex}
                >
                  Open codex
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="home-section-head">
        <h2 className="section-title">Your subjects</h2>
        {model.permissions?.canOpenParentHub && (
          <button
            type="button"
            className="home-section-link"
            onClick={actions.openParentHub}
          >
            Parent hub →
          </button>
        )}
      </div>

      <div className="subject-grid">
        {subjectCards.map((subject) => (
          <SubjectCard key={subject.id} subject={subject} onOpen={actions.openSubject} />
        ))}
      </div>
    </div>
  );
}

function pickCompanionName(summary) {
  const caught = summary.find((entry) => entry.progress?.caught && entry.progress.stage >= 1);
  if (caught) return caught.monster.nameByStage?.[caught.progress.stage] || caught.monster.name;
  return null;
}

function formatDueCount(due) {
  const n = Math.max(0, Number(due) || 0);
  if (n === 1) return '1 skill';
  return `${n} skills`;
}
