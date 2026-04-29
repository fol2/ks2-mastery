import React from 'react';

/* Subject-agnostic "More practice" disclosure inside a Setup scene.
 *
 * Currently used only by Grammar (the only subject that splits its
 * mode catalogue between a primary 3-card row and a longer secondary
 * tail). Refactored ahead of need so when Spelling or Punctuation
 * eventually adds a similar tail of optional drills, the disclosure
 * shell + grid layout already exists at the platform layer.
 *
 * Contract:
 *   * `summary` — the accordion eyebrow (default: "More practice").
 *   * `cards` — array of card definitions; opaque to the disclosure.
 *   * `renderCard(card, index)` — caller-supplied factory because
 *     each subject's secondary card carries its own dispatch contract
 *     (Grammar's "Writing Try" dispatches `grammar-open-transfer`,
 *     other secondary cards dispatch `grammar-set-mode`). Returning a
 *     render function from the caller keeps the disclosure shell free
 *     of subject knowledge.
 *   * `disclosureClassName` / `gridClassName` — subject-namespaced
 *     class hooks the caller can override; default to the
 *     `.setup-more-practice` / `.setup-more-practice-grid` shared
 *     rhythm so a subject can adopt the platform CSS unchanged or
 *     extend with its own brand colour by appending its own class.
 *   * `defaultOpen` — `true` to render the `<details>` open on first
 *     paint. Defaults to `false` so the surface stays decision-light
 *     until the learner opts in.
 */
export function SetupMorePractice({
  summary = 'More practice',
  cards,
  renderCard,
  disclosureClassName = 'setup-more-practice',
  gridClassName = 'setup-more-practice-grid',
  defaultOpen = false,
}) {
  const safeCards = Array.isArray(cards) ? cards : [];
  if (!safeCards.length || typeof renderCard !== 'function') return null;
  return (
    <details className={disclosureClassName} {...(defaultOpen ? { open: true } : {})}>
      <summary>{summary}</summary>
      <div className={gridClassName}>
        {safeCards.map((card, index) => renderCard(card, index))}
      </div>
    </details>
  );
}
