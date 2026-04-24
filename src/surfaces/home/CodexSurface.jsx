import React, { useEffect, useMemo, useState } from 'react';
import { TopNav } from '../shell/TopNav.jsx';
import { CodexCard } from './CodexCard.jsx';
import { CodexCreatureLightbox } from './CodexCreatureLightbox.jsx';
import { CodexHero } from './CodexHero.jsx';
import {
  buildCodexEntries,
  pickFeaturedCodexEntry,
  randomHeroBackground,
} from './data.js';
import { codexTotals } from './codex-view-model.js';

export function CodexSurface({ model, actions }) {
  const [previewEntry, setPreviewEntry] = useState(null);
  const heroBg = useMemo(() => randomHeroBackground(), [model.learner?.id]);
  const entries = useMemo(() => buildCodexEntries(model.monsterSummary || []), [model.monsterSummary]);
  const totals = useMemo(() => codexTotals(entries), [entries]);
  const featured = useMemo(() => pickFeaturedCodexEntry(entries), [entries]);
  const openSpellingPractice = () => actions.openSubject('spelling');

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
          learnerName={model.learner?.name || ''}
          onNavigateHome={actions.navigateHome}
          onPreviewCreature={setPreviewEntry}
          totals={totals}
        />

        <div className="home-section-head codex-section-head">
          <div>
            <h2 className="section-title">Monster roster</h2>
            <p className="codex-section-note">Each creature reflects a different part of English Spelling progress.</p>
          </div>
          <button type="button" className="home-section-link" onClick={openSpellingPractice}>
            Spelling practice →
          </button>
        </div>

        <section className="codex-roster" aria-label="Monster roster">
          {entries.map((entry) => (
            <CodexCard
              key={entry.id}
              entry={entry}
              onPractice={openSpellingPractice}
              onPreview={setPreviewEntry}
            />
          ))}
        </section>
      </main>

      {previewEntry && (
        <CodexCreatureLightbox entry={previewEntry} onClose={() => setPreviewEntry(null)} />
      )}
    </div>
  );
}
