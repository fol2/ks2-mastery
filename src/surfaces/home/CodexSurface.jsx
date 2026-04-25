import React, { useEffect, useMemo, useState } from 'react';
import { TopNav } from '../shell/TopNav.jsx';
import { CodexCreatureLightbox } from './CodexCreatureLightbox.jsx';
import { CodexHero } from './CodexHero.jsx';
import { CodexSubjectSection } from './CodexSubjectSection.jsx';
import {
  buildCodexEntries,
  buildCodexSubjectGroups,
  formatSubjectList,
  pickFeaturedCodexEntry,
  randomHeroBackground,
  subjectName,
} from './data.js';
import { codexTotals } from './codex-view-model.js';

export function CodexSurface({ model, actions }) {
  const [previewEntry, setPreviewEntry] = useState(null);
  const heroBg = useMemo(() => randomHeroBackground(), [model.learner?.id]);
  const entries = useMemo(() => buildCodexEntries(model.monsterSummary || []), [model.monsterSummary]);
  const subjectGroups = useMemo(() => buildCodexSubjectGroups(entries), [entries]);
  const presentSubjectIds = useMemo(
    () => subjectGroups.map((group) => group.subjectId),
    [subjectGroups],
  );
  const presentSubjects = useMemo(
    () => subjectGroups.map((group) => group.subjectName),
    [subjectGroups],
  );
  const totals = useMemo(() => codexTotals(entries), [entries]);
  const featured = useMemo(() => pickFeaturedCodexEntry(entries), [entries]);
  const primaryPracticeSubjectId = featured?.subjectId || 'spelling';
  const openPractice = (subjectId = primaryPracticeSubjectId) => actions.openSubject(subjectId || 'spelling');
  const primaryPracticeLabel = `${subjectName(primaryPracticeSubjectId)} practice →`;

  useEffect(() => {
    if (!previewEntry) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setPreviewEntry(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [previewEntry]);

  return (
    <div className="app-shell">
      <TopNav
        theme={model.theme}
        onToggleTheme={actions.toggleTheme}
        learners={model.learnerOptions || []}
        selectedLearnerId={model.learner?.id || ''}
        learnerLabel={model.learnerLabel || ''}
        signedInAs={model.signedInAs}
        onNavigateHome={actions.navigateHome}
        onSelectLearner={actions.selectLearner}
        onOpenProfileSettings={actions.openProfileSettings}
        onLogout={actions.logout}
        persistenceMode={model.persistence?.mode || 'local-only'}
        persistenceLabel={model.persistence?.label || ''}
      />

      <main className="codex-page">
        <CodexHero
          featured={featured}
          heroBg={heroBg}
          presentSubjectIds={presentSubjectIds}
          learnerName={model.learner?.name || ''}
          onNavigateHome={actions.navigateHome}
          onPreviewCreature={setPreviewEntry}
          totals={totals}
        />

        <div className="home-section-head codex-section-head">
          <div>
            <h2 className="section-title">Monster roster</h2>
            <p className="codex-section-note">
              {describeRosterNote(presentSubjects)}
            </p>
          </div>
          <button type="button" className="home-section-link" onClick={() => openPractice(primaryPracticeSubjectId)}>
            {primaryPracticeLabel}
          </button>
        </div>

        <div className="codex-subject-stack">
          {subjectGroups.map((group) => (
            <CodexSubjectSection
              key={group.subjectId}
              group={group}
              onPractice={openPractice}
              onPreview={setPreviewEntry}
            />
          ))}
        </div>
      </main>

      {previewEntry && (
        <CodexCreatureLightbox entry={previewEntry} onClose={() => setPreviewEntry(null)} />
      )}
    </div>
  );
}

function describeRosterNote(presentSubjects) {
  if (!presentSubjects.length) {
    return 'Each creature reflects a different strand of learning progress.';
  }
  if (presentSubjects.length === 1) {
    return `Each creature reflects a different part of English ${presentSubjects[0]} progress.`;
  }
  return `Each creature reflects a different part of ${formatSubjectList(presentSubjects)} progress.`;
}
