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
// "Practise this" dispatch contract (plan R3, verified against
// `shared/punctuation/service.js:1281-1283`): the button closes the modal
// FIRST, then dispatches `punctuation-start` with
// `{ mode: 'guided', guidedSkillId: <skillId>, roundLength: '4' }`. Cluster
// mode (e.g. `mode: 'speech', skillId: 'speech'`) would silently drop the
// skill-pin because `guidedSkillId` is only honoured when `prefs.mode ===
// 'guided'`.
//
// Multi-skill paragraph caveat (plan R2): some skills participate in
// `PUNCTUATION_ITEMS` entries whose `skillIds.length > 1`. For those, the
// Practise tab renders a footnote — "Some practice questions may also
// include other punctuation skills." — so a Guided-focus learner isn't
// surprised by a multi-skill paragraph repair. `punctuationSkillHasMultiSkillItems`
// returns the set membership from the client-safe mirror.
//
// Accessibility: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
// pointing at the skill-name <h2>. Close button + scrim click + Esc all
// dispatch `punctuation-skill-detail-close`. A focus trap is NOT needed in
// SSR (the harness renders once and doesn't mount an event bridge) — the
// browser-side focus trap lives on the modal root via the standard Esc /
// tab keydown handlers wired through `actions.dispatch`.

import React from 'react';

import {
  PUNCTUATION_MAP_DETAIL_TAB_IDS,
  PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE,
  composeIsDisabled,
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
          Some practice questions may also include other punctuation skills.
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
            // Close modal before dispatching start so the Map→Session
            // transition lands on a clean mapUi state (plan U6 approach).
            actions.dispatch('punctuation-skill-detail-close');
            actions.dispatch('punctuation-start', {
              mode: 'guided',
              guidedSkillId: skillId,
              roundLength: '4',
            });
          }}
        >
          Practise this
        </button>
      </div>
    </div>
  );
}

export function PunctuationSkillDetailModal({ skillId, detailTab = 'learn', ui, actions }) {
  if (typeof skillId !== 'string' || !skillId) return null;
  const content = punctuationSkillModalContent(skillId);
  if (!content) return null;
  const disabled = composeIsDisabled(ui);
  const preferredExample = punctuationSkillModalPreferredExample(skillId);
  const safeTab = detailTab === 'practise' ? 'practise' : 'learn';
  const skillName = skillNameFor(skillId);
  const titleId = 'punctuation-skill-detail-title';

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
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-punctuation-skill-modal
      data-skill-id={skillId}
      data-detail-tab={safeTab}
      onClick={closeFromScrim}
      onKeyDown={handleKeyDown}
    >
      <div className="punctuation-skill-modal-backdrop" aria-hidden="true" />
      <div className="punctuation-skill-modal" data-skill-id={skillId}>
        <header className="punctuation-skill-modal-head">
          <div>
            <p className="punctuation-skill-modal-eyebrow">Punctuation skill</p>
            <h2 id={titleId} className="punctuation-skill-modal-title">{skillName}</h2>
          </div>
          <button
            type="button"
            className="punctuation-skill-modal-close"
            data-action="punctuation-skill-detail-close"
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
