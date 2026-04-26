import React, { useMemo, useState } from 'react';
import {
  bellstormSceneForPhase,
  composeIsDisabled,
} from './punctuation-view-model.js';
import { PunctuationMapScene } from './PunctuationMapScene.jsx';
import { PunctuationSessionScene } from './PunctuationSessionScene.jsx';
import { PunctuationSetupScene } from './PunctuationSetupScene.jsx';

function learnerRecord(appState, learnerId) {
  const record = appState?.learners?.byId?.[learnerId];
  return record && typeof record === 'object' && !Array.isArray(record) ? record : null;
}

function newlineTextStyle(value) {
  return String(value || '').includes('\n') ? { whiteSpace: 'pre-wrap' } : undefined;
}

// Phase 3 U2 removed the legacy `SetupView` from this module. The
// Setup phase now delegates to `PunctuationSetupScene.jsx`, which
// renders the dashboard hero + today cards + three primary mode
// cards + Open Map secondary card + round-length toggle + active
// monster strip. See `./PunctuationSetupScene.jsx` for the current
// implementation and the one-shot stale-prefs migration.

function SummaryView({ ui, actions }) {
  const summary = ui.summary || {};
  const scene = bellstormSceneForPhase('summary');
  const gpsReview = Array.isArray(summary.gps?.reviewItems) ? summary.gps.reviewItems : [];
  return (
    <section className="card border-top punctuation-surface" data-punctuation-summary style={{ borderTopColor: '#2E8479' }}>
      <div className="punctuation-strip">
        <img src={scene.src} srcSet={scene.srcSet} sizes="(max-width: 980px) 100vw, 960px" alt="" aria-hidden="true" />
        <div>
          <div className="eyebrow">Summary</div>
          <h2 className="section-title">Punctuation session summary</h2>
          <p className="subtitle">{summary.message || 'Session complete.'}</p>
        </div>
      </div>
      <div className="stat-grid" style={{ marginTop: 16 }}>
        <div className="stat"><div className="stat-label">Answered</div><div className="stat-value">{summary.total || 0}</div><div className="stat-sub">This session</div></div>
        <div className="stat"><div className="stat-label">Correct</div><div className="stat-value">{summary.correct || 0}</div><div className="stat-sub">Clean attempts</div></div>
        <div className="stat"><div className="stat-label">Accuracy</div><div className="stat-value">{summary.accuracy || 0}%</div><div className="stat-sub">Session score</div></div>
      </div>
      {gpsReview.length ? (
        <div className="callout punctuation-gps-review" style={{ marginTop: 16 }}>
          <strong>GPS review</strong>
          <div className="small muted" style={{ marginTop: 6 }}>
            Next: {summary.gps?.recommendedLabel || 'Smart review'}
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {gpsReview.map((entry) => (
              <div key={`${entry.index}-${entry.itemId}`} className={`feedback ${entry.correct ? 'good' : 'warn'}`}>
                <strong>{entry.index}. {entry.correct ? 'Correct' : 'Review'}</strong>
                <div style={{ marginTop: 6 }}>{entry.prompt}</div>
                {entry.attemptedAnswer ? <div className="small" style={{ marginTop: 6 }}>Answer: {entry.attemptedAnswer}</div> : null}
                {entry.displayCorrection ? (
                  <div className="small" style={{ marginTop: 6, ...newlineTextStyle(entry.displayCorrection) }}>
                    Model: {entry.displayCorrection}
                  </div>
                ) : null}
                {entry.misconceptionTags?.length ? (
                  <div className="chip-row" style={{ marginTop: 8 }}>
                    {entry.misconceptionTags.map((tag) => <span className="chip warn" key={`${entry.itemId}-${tag}`}>{tag}</span>)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn primary" type="button" onClick={() => actions.dispatch('punctuation-start-again')}>Start again</button>
        <button className="btn secondary" type="button" onClick={() => actions.dispatch('punctuation-back')}>Back to dashboard</button>
      </div>
    </section>
  );
}

export function PunctuationPracticeSurface({ appState, service, actions }) {
  const learnerId = appState.learners.selectedId;
  const ui = service?.initState?.(appState.subjectUi?.punctuation, learnerId) || appState.subjectUi?.punctuation || {};
  const stats = useMemo(() => service?.getStats?.(learnerId) || ui.stats || {}, [learnerId, service, ui.stats]);
  const learner = learnerRecord(appState, learnerId);
  // U2: prefer `ui.prefs` so the display collapse stays coherent across
  // re-renders; fall back to the service read (which hits the data
  // repository) when `ui.prefs` has not yet been mirrored (e.g. first
  // Setup visit on a pre-U2 subject state). Service read is side-effect
  // free.
  const prefs = (ui && typeof ui === 'object' && !Array.isArray(ui) && ui.prefs)
    ? ui.prefs
    : (service?.getPrefs?.(learnerId) || {});
  // U2: the active monster strip reads monster reward state from
  // `ui.rewardState` (mirrors the Map scene's source). When not
  // present, default to empty so the strip renders fresh-learner
  // zeros rather than throwing.
  const rewardState = (ui && typeof ui === 'object' && !Array.isArray(ui)
    && ui.rewardState
    && typeof ui.rewardState === 'object'
    && !Array.isArray(ui.rewardState))
    ? ui.rewardState
    : {};

  // Phase 3 U3: `active-item` + `feedback` route through the consolidated
  // `PunctuationSessionScene`. Summary stays inline until U4; Map routes
  // to the U5 scene; Setup remains the default SetupView (U2 owns redesign).
  if (ui.phase === 'active-item' || ui.phase === 'feedback') {
    return <PunctuationSessionScene ui={ui} actions={actions} />;
  }
  if (ui.phase === 'summary') return <SummaryView ui={ui} actions={actions} />;
  if (ui.phase === 'map') return <PunctuationMapScene ui={ui} actions={actions} />;

  // U2: every non-session / non-map / non-unavailable / non-error phase
  // falls through to the Setup scene. The Phase 2 enum still includes
  // `'setup'`, `'unavailable'`, and `'error'`; the latter two keep
  // their Phase 2 behaviour (the parent shell handles unavailable /
  // error banners). Unknown phase strings default to Setup so a rogue
  // payload doesn't land the learner on a broken blank scene.
  return (
    <PunctuationSetupScene
      ui={ui}
      actions={actions}
      prefs={prefs}
      stats={stats}
      learner={learner}
      rewardState={rewardState}
    />
  );
}
