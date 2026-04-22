import React, { useMemo } from 'react';
import { TopNav } from './TopNav.jsx';
import { MonsterMeadow } from './MonsterMeadow.jsx';
import { SubjectCard } from './SubjectCard.jsx';
import { IconArrowRight } from './icons.jsx';
import {
  buildMeadowMonsters,
  buildSubjectCards,
  dueCopy,
  greetForHour,
  randomHeroBackground,
} from './data.js';

export function HomeSurface({ model, actions }) {
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

  const now = model.now || new Date();
  const greet = greetForHour(now.getHours());
  const dueTotal = model.dueTotal || 0;

  const companionName = pickCompanionName(model.monsterSummary || []);

  return (
    <div className="app-shell">
      <TopNav
        theme={model.theme}
        onToggleTheme={actions.toggleTheme}
        learners={model.learnerOptions || []}
        selectedLearnerId={model.learner?.id || ''}
        learnerLabel={model.learnerLabel || ''}
        signedInAs={model.signedInAs}
        onSelectLearner={actions.selectLearner}
        onOpenProfileSettings={actions.openProfileSettings}
        onLogout={actions.logout}
        persistenceMode={model.persistence?.mode || 'local-only'}
        persistenceLabel={model.persistence?.label || ''}
      />

      <div className="hero-paper" style={{ '--hero-bg': `url('${heroBg}')` }}>
        <div className="hero-art" aria-hidden="true" />
        <MonsterMeadow monsters={meadowMonsters} maxSlots={10} />
        <div className="hero-mission">
          <div className="greet">
            <b>{greet}, {model.learner?.name || 'there'}.</b>{' '}
            {companionName ? `${companionName} is ready for round ${model.roundNumber || 1}.` : 'A fresh round is waiting.'}
          </div>
          <h1 className="mission">
            Today's words are <em>waiting.</em>
            <br />
            {dueCopy(dueTotal)}
          </h1>
          <div className="hero-cta-row">
            <button
              type="button"
              className="btn primary xl"
              onClick={() => actions.openSubject('spelling')}
            >
              Begin today's round <IconArrowRight />
            </button>
            <button
              type="button"
              className="btn ghost xl"
              onClick={actions.openCodex}
            >
              Open codex
            </button>
          </div>
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
