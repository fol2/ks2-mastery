import React from 'react';
import { formatTimestamp, isBlocked } from './hub-utils.js';

// U8 (P4): Learner support / diagnostics panel — extracted from
// AdminDebuggingSection.jsx. Self-contained; no PanelHeader dependency
// (the panel renders its own eyebrow/heading structure).

export function LearnerSupportPanel({ model, appState, accessContext, actions }) {
  const selectedDiagnostics = model.learnerSupport?.selectedDiagnostics || null;
  const accessibleLearners = Array.isArray(model.learnerSupport?.accessibleLearners) ? model.learnerSupport.accessibleLearners : [];
  const selectedLearnerId = model.learnerSupport?.selectedLearnerId || selectedDiagnostics?.learnerId || '';
  const classroomSummaryDegraded = appState?.persistence?.breakersDegraded?.classroomSummary === true;
  const selectedGrammarEvidence = selectedDiagnostics?.grammarEvidence || {};
  const selectedPunctuationEvidence = selectedDiagnostics?.punctuationEvidence || {};
  const selectedPunctuationRelease = selectedPunctuationEvidence.releaseDiagnostics
    || model.learnerSupport?.punctuationReleaseDiagnostics
    || {};

  return (
    <article className="card" data-admin-hub-panel="classroom-summary" style={{ marginBottom: 20 }}>
      <div className="eyebrow">Learner support / diagnostics</div>
      <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Readable learners</h3>
      {classroomSummaryDegraded ? (
        <div className="feedback warn" data-admin-hub-degraded="classroom-summary">
          <strong>Classroom summary temporarily unavailable</strong>
          <div style={{ marginTop: 8 }}>
            Per-learner Grammar and Punctuation summary stats are taking too long to load. The learner list remains available below — use Select to drill into an individual learner. Practice is unaffected.
          </div>
        </div>
      ) : null}
      {accessibleLearners.length ? accessibleLearners.map((entry) => (
        <div className="skill-row" key={entry.learnerId}>
          <div>
            <strong>{entry.learnerName}</strong>
            <div className="small muted">{entry.yearGroup} · {entry.membershipRoleLabel} · {entry.accessModeLabel || (entry.writable ? 'Writable learner' : 'Read-only learner')}</div>
          </div>
          {classroomSummaryDegraded ? null : (
            <>
              <div className="small muted">Focus: {entry.currentFocus?.label || '—'}</div>
              <div>{String(entry.overview?.dueWords ?? 0)} due</div>
              <div className="small muted">
                Grammar: {String(entry.grammarEvidence?.progressSnapshot?.dueConcepts ?? entry.overview?.dueGrammarConcepts ?? 0)} due / {String(entry.grammarEvidence?.progressSnapshot?.weakConcepts ?? entry.overview?.weakGrammarConcepts ?? 0)} weak
              </div>
              <div className="small muted">
                Punctuation: {String(entry.punctuationEvidence?.progressSnapshot?.dueItems ?? entry.overview?.duePunctuationItems ?? 0)} due / {String(entry.punctuationEvidence?.progressSnapshot?.weakItems ?? entry.overview?.weakPunctuationItems ?? 0)} weak
              </div>
            </>
          )}
          <div><button className="btn ghost" type="button" onClick={() => actions.dispatch('adult-surface-learner-select', { value: entry.learnerId })}>Select</button></div>
        </div>
      )) : <p className="small muted">No learner diagnostics are accessible from this account scope yet.</p>}
      {selectedDiagnostics && (
        <div className="callout" style={{ marginTop: 16 }}>
          <strong>{selectedDiagnostics.learnerName}</strong>
          <div style={{ marginTop: 8 }}>
            Secure: {String(selectedDiagnostics.overview?.secureWords ?? 0)} · Due: {String(selectedDiagnostics.overview?.dueWords ?? 0)} · Trouble: {String(selectedDiagnostics.overview?.troubleWords ?? 0)}
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Grammar diagnostics</strong>: secured {String(selectedGrammarEvidence.progressSnapshot?.securedConcepts ?? selectedDiagnostics.overview?.secureGrammarConcepts ?? 0)} · due {String(selectedGrammarEvidence.progressSnapshot?.dueConcepts ?? selectedDiagnostics.overview?.dueGrammarConcepts ?? 0)} · weak {String(selectedGrammarEvidence.progressSnapshot?.weakConcepts ?? selectedDiagnostics.overview?.weakGrammarConcepts ?? 0)}
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Punctuation diagnostics</strong>: secured {String(selectedPunctuationEvidence.progressSnapshot?.securedRewardUnits ?? selectedDiagnostics.overview?.securePunctuationUnits ?? 0)} · due {String(selectedPunctuationEvidence.progressSnapshot?.dueItems ?? selectedDiagnostics.overview?.duePunctuationItems ?? 0)} · weak {String(selectedPunctuationEvidence.progressSnapshot?.weakItems ?? selectedDiagnostics.overview?.weakPunctuationItems ?? 0)}
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>
            Punctuation release: {selectedPunctuationRelease.releaseId || 'unknown'} · tracked units {String(selectedPunctuationRelease.trackedRewardUnitCount ?? 0)} · sessions {String(selectedPunctuationRelease.sessionCount ?? 0)} · weak patterns {String(selectedPunctuationRelease.weakPatternCount ?? 0)} · exposure {selectedPunctuationRelease.productionExposureStatus || 'unknown'}
          </div>
          {selectedGrammarEvidence.questionTypeSummary?.[0] ? (
            <div className="small muted" style={{ marginTop: 8 }}>
              Question-type focus: {selectedGrammarEvidence.questionTypeSummary[0].label || selectedGrammarEvidence.questionTypeSummary[0].id}
            </div>
          ) : null}
          {selectedPunctuationEvidence.weakestFacets?.[0] ? (
            <div className="small muted" style={{ marginTop: 8 }}>
              Punctuation focus: {selectedPunctuationEvidence.weakestFacets[0].label || selectedPunctuationEvidence.weakestFacets[0].id}
            </div>
          ) : null}
          <div className="small muted" style={{ marginTop: 8 }}>{selectedDiagnostics.currentFocus?.detail || 'No current focus surfaced.'}</div>
        </div>
      )}
      <div className="actions" style={{ marginTop: 16 }}>
        {(model.learnerSupport.entryPoints || []).map((entry) => (
          <button
            className="btn secondary"
            type="button"
            disabled={isBlocked(entry.action, accessContext)}
            onClick={() => actions.dispatch(entry.action, { subjectId: entry.subjectId, tab: entry.tab })}
            key={`${entry.action}-${entry.label}`}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </article>
  );
}
