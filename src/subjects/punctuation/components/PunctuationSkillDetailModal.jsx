// Phase 3 U6 — Punctuation Skill Detail modal.
//
// Opens on top of the Punctuation Map scene whenever `mapUi.detailOpenSkillId`
// is a published skill id. Two tabs — Learn and Practise — consume the
// U5-landed `mapUi.detailTab` state. The modal renders EXACTLY 3 pedagogy
// fields per skill:
//
//   1. `rule`          (always — the child-facing rule statement)
//   2. `contrastBad`   (always — the common mix-up)
//   3. `workedGood` OR `contrastGood` (chosen via
//      `PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE`, default `workedGood`;
//      `comma_clarity` overrides to `workedGood` — plan Key Technical
//      Decisions, adv-219-005 deepening)
//
// Other fields from `PUNCTUATION_SKILLS` (workedBad, phase, prereq, published)
// never ship — the component imports only the 3-field `PUNCTUATION_SKILL_MODAL_CONTENT`
// client mirror from `punctuation-view-model.js`, so the modal payload is
// structurally incapable of leaking an accepted answer, validator, generator,
// rubric, or any other forbidden read-model key (plan R13).
//
// "Practise this" dispatch contract (plan R3 + review-follower adv-231-003):
// the button dispatches `punctuation-start` FIRST with
// `{ mode: 'guided', guidedSkillId: <skillId>, roundLength: '4' }` and then
// `punctuation-skill-detail-close`. If `punctuation-start` throws
// `punctuation_content_unavailable` the runtime fallback replaces the scene;
// inverting the order ensures that, on success, the Modal unmounts naturally
// alongside the Map scene, and on failure the Modal stays mounted so the
// learner keeps their context instead of being stranded on a runtime
// fallback view. Cluster mode (e.g. `mode: 'speech', skillId: 'speech'`)
// would silently drop the skill-pin because `guidedSkillId` is only honoured
// when `prefs.mode === 'guided'`.
//
// Multi-skill paragraph caveat (plan R2): some skills participate in
// `PUNCTUATION_ITEMS` entries whose `skillIds.length > 1`. For those, the
// Practise tab renders a softened footnote — "You might see one or two
// other punctuation skills too — that's normal!" — so a Guided-focus learner
// isn't surprised by a multi-skill paragraph repair.
// `punctuationSkillHasMultiSkillItems` returns the set membership from the
// client-safe mirror.
//
// Accessibility (review-follower HIGH 2 + HIGH 3):
// - The inner `.punctuation-skill-modal` card carries `role="dialog"`,
//   `aria-modal="true"`, and `aria-labelledby` pointing at the scoped
//   (per-skill) title id. The scrim remains a click-absorber with
//   `aria-hidden="true"` — screen-reader users land on the dialog itself.
// - The Close button carries `data-autofocus="true"` for the platform's
//   autofocus wiring (`src/main.js` scopes the selector to
//   `.wb-modal-scrim` only, so a `useEffect` + ref fallback focuses the
//   Close button in every other mount path — dialog semantics land on
//   open without the learner having to click first).
// - Esc + Close button + scrim click all dispatch
//   `punctuation-skill-detail-close`.

import React, { useEffect, useRef } from 'react';

import {
  PUNCTUATION_MAP_DETAIL_TAB_IDS,
  PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE,
  composeIsDisabled,
  composeIsNavigationDisabled,
  punctuationSkillHasMultiSkillItems,
  punctuationSkillModalContent,
  punctuationSkillModalPreferredExample,
} from './punctuation-view-model.js';
import { PUNCTUATION_CLIENT_SKILLS } from '../read-model.js';

// Keep the exported tab ids alias available for downstream consumers without
// forcing them through the service-contract re-export chain.
export { PUNCTUATION_MAP_DETAIL_TAB_IDS };
export { PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE };

function skillNameFor(skillId) {
  const entry = PUNCTUATION_CLIENT_SKILLS.find((skill) => skill.id === skillId);
  return entry?.name || skillId;
}

function LearnBody({ skillId, content, preferredExample }) {
  const exampleText = preferredExample === 'contrastGood'
    ? content.contrastGood
    : content.workedGood;
  const exampleLabel = preferredExample === 'contrastGood'
    ? 'Strong example'
    : 'Worked example';
  return (
    <div className="punctuation-skill-modal-body" data-punctuation-skill-modal-body="learn">
      <section className="punctuation-skill-modal-section">
        <h3 className="punctuation-skill-modal-section-label">The rule</h3>
        <p className="punctuation-skill-modal-rule">{content.rule}</p>
      </section>
      <section className="punctuation-skill-modal-section">
        <h3 className="punctuation-skill-modal-section-label">{exampleLabel}</h3>
        <blockquote
          className="punctuation-skill-modal-example"
          data-punctuation-skill-modal-example-kind={preferredExample}
        >
          {exampleText}
        </blockquote>
      </section>
      <section className="punctuation-skill-modal-section">
        <h3 className="punctuation-skill-modal-section-label">Common mix-up</h3>
        <blockquote className="punctuation-skill-modal-contrast-bad">
          {content.contrastBad}
        </blockquote>
      </section>
    </div>
  );
}

function PractiseBody({ skillId, skillName, disabled, actions }) {
  const multiSkill = punctuationSkillHasMultiSkillItems(skillId);
  return (
    <div className="punctuation-skill-modal-body" data-punctuation-skill-modal-body="practise">
      <p className="punctuation-skill-modal-practise-copy">
        A short focused round on <strong>{skillName}</strong>. We pick four questions for you — answer at your own pace.
      </p>
      {multiSkill ? (
        <p
          className="punctuation-skill-modal-multi-skill-note muted"
          data-punctuation-skill-modal-multi-skill-note="true"
        >
          You might see one or two other punctuation skills too — that's normal!
        </p>
      ) : null}
      <div className="punctuation-skill-modal-actions actions">
        <button
          type="button"
          className="btn primary"
          disabled={disabled}
          data-action="punctuation-start"
          data-punctuation-start-skill
          data-skill-id={skillId}
          onClick={() => {
            // Review-follower adv-231-003: dispatch start FIRST, then close.
            // If `punctuation-start` throws (e.g. `punctuation_content_unavailable`)
            // the runtime fallback replaces the scene and the Modal would be
            // gone before the learner could retry. Dispatching start first
            // means: on success, the Modal unmounts naturally when the phase
            // transitions to `active-item` (Map scene also unmounts); on
            // failure, the Modal stays open so the learner keeps context.
            actions.dispatch('punctuation-start', {
              mode: 'guided',
              guidedSkillId: skillId,
              roundLength: '4',
            });
            actions.dispatch('punctuation-skill-detail-close');
          }}
        >
          Practise this
        </button>
      </div>
    </div>
  );
}

export function PunctuationSkillDetailModal({ skillId, detailTab = 'learn', ui, actions }) {
  // Hooks must run before any early return so React sees the same order on
  // every render — useRef is safe to call even when we ultimately return
  // null below.
  const closeButtonRef = useRef(null);
  // Runtime autofocus fallback. The platform's `[data-autofocus="true"]`
  // handler in `src/main.js` is scoped to `.wb-modal-scrim` (Spelling) so
  // it does not reach this Punctuation modal. Focusing the Close button on
  // mount hands screen-reader users the dialog announcement + a keyboard-
  // actionable control on open. SSR tests assert on the `data-autofocus`
  // attribute; this effect is the browser-only companion.
  useEffect(() => {
    if (!skillId) return undefined;
    const button = closeButtonRef.current;
    if (button && typeof button.focus === 'function') {
      try {
        button.focus();
      } catch {
        /* non-focusable platforms fall through */
      }
    }
    return undefined;
  }, [skillId]);

  if (typeof skillId !== 'string' || !skillId) return null;
  const content = punctuationSkillModalContent(skillId);
  if (!content) return null;
  // Phase 4 U6: `disabled` threads through the Practise this mutation
  // control (unchanged). `navigationDisabled` governs the modal close
  // button so a stalled command or degraded availability never traps the
  // learner inside the modal (plan R7). Mirrors the Summary + Map top-bar
  // pattern; both helpers flow from the same `ui` shape.
  const disabled = composeIsDisabled(ui);
  const navigationDisabled = composeIsNavigationDisabled(ui);
  const preferredExample = punctuationSkillModalPreferredExample(skillId);
  const safeTab = detailTab === 'practise' ? 'practise' : 'learn';
  const skillName = skillNameFor(skillId);
  // Review-follower LOW: scope the title id per-skill so the DOM cannot
  // ever contain two elements with id `punctuation-skill-detail-title` —
  // e.g. when tests render back-to-back with different skills.
  const titleId = `punctuation-skill-detail-title-${skillId}`;

  const closeFromScrim = (event) => {
    // Only dismiss when the click landed on the scrim itself, not a child
    // modal element — guards against accidental close when a learner taps
    // a button or tab inside the modal.
    if (event.target?.closest?.('.punctuation-skill-modal')) return;
    actions.dispatch('punctuation-skill-detail-close');
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      actions.dispatch('punctuation-skill-detail-close');
    }
  };

  return (
    <div
      className="punctuation-skill-modal-scrim"
      data-punctuation-skill-modal
      data-skill-id={skillId}
      data-detail-tab={safeTab}
      onClick={closeFromScrim}
      onKeyDown={handleKeyDown}
    >
      {/* Scrim has no ARIA role — it is a click-absorber + visual overlay
          only. Dialog semantics live on the inner card below so screen-
          reader users land on the dialog landmark itself. `aria-hidden`
          is intentionally NOT set on the scrim: React would propagate it
          to the inner dialog subtree and hide the whole modal from AT. */}
      <div className="punctuation-skill-modal-backdrop" aria-hidden="true" />
      <div
        className="punctuation-skill-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-skill-id={skillId}
      >
        <header className="punctuation-skill-modal-head">
          <div>
            <p className="punctuation-skill-modal-eyebrow">Punctuation skill</p>
            <h2 id={titleId} className="punctuation-skill-modal-title">{skillName}</h2>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            className="punctuation-skill-modal-close"
            disabled={navigationDisabled}
            aria-disabled={navigationDisabled ? 'true' : 'false'}
            data-action="punctuation-skill-detail-close"
            data-autofocus="true"
            aria-label="Close skill detail"
            onClick={() => actions.dispatch('punctuation-skill-detail-close')}
          >
            ×
          </button>
        </header>
        <div className="punctuation-skill-modal-tabs" role="tablist" aria-label="Skill detail tabs">
          <button
            type="button"
            role="tab"
            className={`punctuation-skill-modal-tab${safeTab === 'learn' ? ' on' : ''}`}
            aria-selected={safeTab === 'learn' ? 'true' : 'false'}
            data-action="punctuation-skill-detail-tab"
            data-value="learn"
            onClick={() => actions.dispatch('punctuation-skill-detail-tab', { value: 'learn' })}
          >
            Learn
          </button>
          <button
            type="button"
            role="tab"
            className={`punctuation-skill-modal-tab${safeTab === 'practise' ? ' on' : ''}`}
            aria-selected={safeTab === 'practise' ? 'true' : 'false'}
            data-action="punctuation-skill-detail-tab"
            data-value="practise"
            onClick={() => actions.dispatch('punctuation-skill-detail-tab', { value: 'practise' })}
          >
            Practise
          </button>
        </div>
        {safeTab === 'practise'
          ? (
            <PractiseBody
              skillId={skillId}
              skillName={skillName}
              disabled={disabled}
              actions={actions}
            />
          )
          : (
            <LearnBody
              skillId={skillId}
              content={content}
              preferredExample={preferredExample}
            />
          )}
      </div>
    </div>
  );
}
