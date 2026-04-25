import React from 'react';
import { createPortal } from 'react-dom';
import {
  GRAMMAR_CLUSTER_DISPLAY_NAMES,
  grammarConceptEvidenceLine,
  grammarConceptExamples,
} from './grammar-view-model.js';

// Phase 3 U2: per-concept detail modal. Opens when the learner taps
// `See example` on a concept card. Focus management:
//   - `aria-modal="true"` + `role="dialog"` so assistive tech scopes focus.
//   - Escape key closes the modal.
//   - On close, focus returns to the triggering card via the
//     `data-focus-return-id` attribute on the modal wrapper; the JSX scene
//     reads it after close and restores focus. SSR cannot assert the runtime
//     focus motion, so this contract is a manual QA gate — the attribute is
//     the SSR-asserted shim.
//   - `createPortal` mounts the modal at `document.body` when a DOM is
//     present so it escapes the surface's layout stacking; during SSR we
//     return the JSX tree directly so `renderToString` finds it.
//
// All copy is child-facing. `Practise this` dispatches `grammar-focus-concept`
// which module.js routes into a focused practice round. `Close` dispatches
// `grammar-concept-detail-close`.

export function GrammarConceptDetailModal({ card, actions }) {
  const triggerReturnId = card?.id ? `grammar-bank-concept-card-${card.id}` : '';
  const titleId = card?.id ? `grammar-concept-detail-title-${card.id}` : 'grammar-concept-detail-title';

  React.useEffect(() => {
    if (typeof document === 'undefined' || !card?.id) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        actions?.dispatch?.('grammar-concept-detail-close');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [actions, card?.id]);

  React.useEffect(() => {
    // On unmount (close), return focus to the triggering bank card.
    return () => {
      if (typeof document === 'undefined' || !triggerReturnId) return;
      const el = document.querySelector(`[data-focus-return-id="${triggerReturnId}"]`);
      if (el && typeof el.focus === 'function') el.focus();
    };
  }, [triggerReturnId]);

  if (!card) return null;
  const examples = grammarConceptExamples(card.id);
  const evidence = grammarConceptEvidenceLine({ attempts: card.attempts, correct: card.correct });
  const clusterName = card.clusterName
    || GRAMMAR_CLUSTER_DISPLAY_NAMES[card.cluster]
    || '';

  const onScrimClick = (event) => {
    if (event.target?.closest?.('.grammar-bank-modal')) return;
    actions?.dispatch?.('grammar-concept-detail-close');
  };

  const onCloseClick = () => actions?.dispatch?.('grammar-concept-detail-close');
  const onPractiseClick = () => actions?.dispatch?.('grammar-focus-concept', { conceptId: card.id });

  const modal = (
    <div
      className="grammar-bank-modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-focus-trigger-id={triggerReturnId}
      onClick={onScrimClick}
    >
      <div className="grammar-bank-modal-backdrop" aria-hidden="true" />
      <div className="grammar-bank-modal" data-concept-id={card.id}>
        <header className="grammar-bank-modal-head">
          <div className="grammar-bank-modal-head-main">
            <p className="grammar-bank-modal-eyebrow">{clusterName ? `${clusterName} cluster` : 'Grammar concept'}</p>
            <h2 id={titleId} className="grammar-bank-modal-title">{card.name}</h2>
            <p className={`grammar-bank-modal-status tone-${card.tone}`}>{card.childLabel}</p>
          </div>
          <button
            type="button"
            className="grammar-bank-modal-close"
            data-action="grammar-concept-detail-close"
            aria-label="Close concept details"
            onClick={onCloseClick}
          >
            &times;
          </button>
        </header>
        <div className="grammar-bank-modal-body">
          <section className="grammar-bank-modal-section">
            <p className="grammar-bank-modal-section-label">What it is</p>
            <p className="grammar-bank-modal-summary">{card.summary || 'No summary available yet.'}</p>
          </section>
          <section className="grammar-bank-modal-section">
            <p className="grammar-bank-modal-section-label">Example sentences</p>
            {examples.length ? (
              <ul className="grammar-bank-modal-examples">
                {examples.map((sentence, index) => (
                  <li className="grammar-bank-modal-example" key={`${card.id}-ex-${index}`}>{sentence}</li>
                ))}
              </ul>
            ) : (
              <p className="grammar-bank-modal-empty">No examples on file for this concept yet.</p>
            )}
          </section>
          <section className="grammar-bank-modal-section">
            <p className="grammar-bank-modal-section-label">How you are doing</p>
            <p className="grammar-bank-modal-evidence">{evidence}</p>
          </section>
        </div>
        <footer className="grammar-bank-modal-actions">
          <button
            type="button"
            className="btn primary"
            data-action="grammar-focus-concept"
            data-concept-id={card.id}
            onClick={onPractiseClick}
          >
            Practise this
          </button>
          <button
            type="button"
            className="btn ghost"
            data-action="grammar-concept-detail-close"
            onClick={onCloseClick}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );

  if (typeof document === 'undefined' || !document.body) return modal;
  return createPortal(modal, document.body);
}
