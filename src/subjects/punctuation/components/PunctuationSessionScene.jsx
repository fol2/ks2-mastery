// Phase 3 U3 — Punctuation Session scene.
//
// Replaces the monolith's `ActiveItemView` + `FeedbackView` with a single
// scene file that handles both the `active-item` and `feedback` phases. The
// consolidation mirrors Grammar's `GrammarSessionScene` and Spelling's
// `SpellingSessionScene` — one scene per Worker "session phase bundle" so
// feedback is rendered in the same DOM parent as the item, not a separate
// route.
//
// Scope:
//   - Header: `Question N of M · Skill · Mode` via
//     `punctuationSessionProgressLabel(session)` + cluster / mode labels.
//   - Prompt: item prompt + `currentItemInstruction(item)` subtitle.
//   - Input: branches on `item.inputKind` + `item.mode` via
//     `punctuationSessionInputShape(item.mode)`:
//       - `choice`                         → existing radio group (ChoiceItem).
//       - `text` + prefill:'stem'          → textarea prefilled with item.stem.
//       - `text` + prefill:'blank'+source  → source block above (non-editable
//                                             blockquote) + empty textarea.
//   - Guided teach box collapses to the rule line + a `<details>` toggle
//     that reveals the worked example + common-mistake pair. Uses
//     `punctuationSessionHelpVisibility(session, phase).showTeachBox`.
//   - GPS branch: "Save answer" submit, "Test mode: answers at the end."
//     chip row, NO feedback in `active-item` phase. Feedback phase never
//     runs in GPS (scheduler goes straight active-item → summary once the
//     round ends) but the branch is defensively coded.
//   - Feedback branch: one-line `feedback.headline` + `feedback.body`.
//     `displayCorrection` hides behind "Show model answer" `<details>`.
//     Facet chips come from `punctuationFeedbackChips(feedback.facets)` —
//     child-labelled, capped at 2, hidden behind a "Show more" toggle.
//     Raw `misconceptionTags` pipe through
//     `punctuationChildMisconceptionLabel` and hide when no child label
//     exists (never surface raw dotted IDs).
//
// Every mutation control threads `composeIsDisabled(ui)` per plan R11. The
// textarea and radio group themselves also disable when a command is in
// flight — otherwise a learner could type into a locked UI and watch their
// input vanish mid-transition.
//
// SSR blind spots (learning #6): pointer-capture, focus, scroll-into-view,
// and IME composition are NOT observable via node:test + SSR. Every
// feature that claims a behavioural guarantee comes with a paired
// state-level or DOM-match assertion (learning #7).

import React, { useState } from 'react';

import { useSubmitLock } from '../../../platform/react/use-submit-lock.js';
import {
  bellstormSceneForPhase,
  composeIsDisabled,
  currentItemInstruction,
  punctuationChildMisconceptionLabel,
  punctuationChildRegisterOverride,
  punctuationChildRegisterOverrideString,
  punctuationFeedbackChips,
  punctuationPhaseLabel,
} from './punctuation-view-model.js';
import {
  punctuationSessionHelpVisibility,
  punctuationSessionInputPlaceholder,
  punctuationSessionInputShape,
  punctuationSessionProgressLabel,
  punctuationSessionSubmitLabel,
} from '../session-ui.js';
import { PUNCTUATION_CLIENT_SKILLS } from '../read-model.js';

// --- Local helpers ---------------------------------------------------------

// Child-facing session mode label map. Kept local to this scene to avoid
// pulling the private `SESSION_MODE_LABELS` out of `read-model.js` just for
// one header; the full roster lives there and drives analytics rows. This
// copy is deliberately small (the 3 primary + guided + 6 clusters + gps).
// Unknown modes fall back to a generic "Practice" string rather than
// surfacing the raw id (plan R15 / learning #9 discipline).
const SESSION_MODE_HEADER_LABELS = Object.freeze({
  smart: 'Smart review',
  guided: 'Guided',
  weak: 'Wobbly spots',
  gps: 'GPS check',
  endmarks: 'Endmarks',
  apostrophe: 'Apostrophes',
  speech: 'Speech',
  comma_flow: 'Commas',
  boundary: 'Boundaries',
  structure: 'Structure',
});

function sessionModeHeaderLabel(mode) {
  if (typeof mode !== 'string' || !mode) return 'Practice';
  return SESSION_MODE_HEADER_LABELS[mode] || 'Practice';
}

// Lookup skill name for the header by scanning the client-safe manifest.
// Falls back to an empty string when the item carries no skillIds or the
// first id is unknown — the header collapses to `Question N of M · Mode`
// rather than surfacing a raw id.
const CLIENT_SKILL_NAMES_BY_ID = new Map(
  PUNCTUATION_CLIENT_SKILLS.map((skill) => [skill.id, skill.name]),
);

function skillHeaderName(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
  const skillIds = Array.isArray(item.skillIds) ? item.skillIds : [];
  for (const skillId of skillIds) {
    if (typeof skillId !== 'string' || !skillId) continue;
    const name = CLIENT_SKILL_NAMES_BY_ID.get(skillId);
    if (name) return name;
  }
  return '';
}

function newlineTextStyle(value) {
  return String(value || '').includes('\n') ? { whiteSpace: 'pre-wrap' } : undefined;
}

// --- Choice input branch ---------------------------------------------------

function ChoiceItem({ item, disabled, submitLabel, onSubmit }) {
  const [choiceIndex, setChoiceIndex] = useState('');
  return (
    <form
      className="punctuation-session-form"
      style={{ display: 'grid', gap: 12 }}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ choiceIndex });
      }}
    >
      <div className="choice-list" role="radiogroup" aria-label="Punctuation choices">
        {(item.options || []).map((option) => (
          <label className="choice-card" key={`${item.id}-${option.index}`}>
            <input
              type="radio"
              name="choiceIndex"
              value={option.index}
              checked={String(choiceIndex) === String(option.index)}
              disabled={disabled}
              onChange={() => setChoiceIndex(String(option.index))}
            />
            <span style={newlineTextStyle(option.text)}>{option.text}</span>
          </label>
        ))}
      </div>
      <div className="actions">
        <button
          className="btn primary"
          type="submit"
          disabled={disabled || choiceIndex === ''}
          data-punctuation-submit
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

// --- Text input branch (insert / fix / paragraph / combine / transfer) -----

// Per-item-type input shape decision table (plan §Session scene input-shape):
//
//   inputKind | mode                    | prefill   | source block | rows
//   ----------+-------------------------+-----------+--------------+-----
//   choice    | any                     | n/a       | n/a          | n/a
//   text      | insert / fix            | item.stem | none         | 4
//   text      | paragraph               | item.stem | none         | 6
//   text      | combine / transfer      | blank     | item.stem    | 4
//
// The split fixes the learning-#9 prefill bug: the previous monolith's
// `TextItem` seeded `useState(item.stem || '')` for every mode, which hands
// combine / transfer learners the source material to edit instead of the
// blank answer box they expect.
function TextItem({ item, disabled, submitLabel, shape, onSubmit }) {
  const mode = typeof item.mode === 'string' ? item.mode : '';
  const prefillStem = shape?.prefill === 'stem';
  const showSource = shape?.prefill === 'blank' && shape.showSource === true;
  const initialValue = prefillStem ? (item.stem || '') : '';
  const [typed, setTyped] = useState(initialValue);
  const rows = mode === 'paragraph' ? 6 : 4;
  const placeholder = punctuationSessionInputPlaceholder(mode);

  return (
    <form
      className="punctuation-session-form"
      style={{ display: 'grid', gap: 12 }}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ typed });
      }}
    >
      {showSource && item.stem ? (
        <>
          <blockquote
            className="punctuation-session-source"
            data-punctuation-session-source
            aria-label="Source text — read only"
            style={{ marginTop: 0, ...newlineTextStyle(item.stem) }}
          >
            {item.stem}
          </blockquote>
          <p className="small muted" data-punctuation-session-source-bridge>
            Read the text above, then write your answer below.
          </p>
        </>
      ) : null}
      <label className="field">
        <span>Your answer</span>
        <textarea
          className="input punctuation-session-input"
          name="typed"
          value={typed}
          rows={rows}
          data-autofocus="true"
          data-punctuation-session-input
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => setTyped(event.target.value)}
        />
      </label>
      <div className="actions">
        <button
          className="btn primary"
          type="submit"
          disabled={disabled}
          data-punctuation-submit
        >
          {submitLabel}
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={disabled}
          onClick={() => setTyped(initialValue)}
        >
          Reset text
        </button>
      </div>
    </form>
  );
}

// --- Collapsed guided teach box --------------------------------------------

// Plan R5: the teach box collapses to a short rule line + `<details>` toggle
// revealing the worked example + common-mistake pair. The old inline three-
// panel layout moves behind the toggle so the question card breathes.
function CollapsedTeachBox({ guided }) {
  const rawBox = guided?.teachBox;
  if (!rawBox) return null;
  // Phase 4 U7: Worker-sourced teachBox strings pass through the child-
  // register override helper at display time. The engine files
  // (`shared/punctuation/marking.js`, `shared/punctuation/generators.js`)
  // are scope-locked by the oracle replay and can still emit adult
  // grammar terms in `rule` / `prompt` / `note` strings; the override
  // rewrites them in child register before the learner ever sees them.
  const box = punctuationChildRegisterOverride(rawBox) || rawBox;
  const hasWorked = Boolean(box.workedExample?.before || box.workedExample?.after);
  const hasContrast = Boolean(box.contrastExample?.before || box.contrastExample?.after);
  if (!box.rule && !hasWorked && !hasContrast) return null;

  return (
    <aside
      className="callout punctuation-session-teach"
      data-punctuation-session-teach
      style={{ marginTop: 14 }}
    >
      {box.name ? <strong>{box.name}</strong> : null}
      {box.rule ? (
        <p
          className="punctuation-session-teach-rule"
          data-punctuation-session-teach-rule
          style={{ marginTop: box.name ? 8 : 0 }}
        >
          {box.rule}
        </p>
      ) : null}
      {hasWorked || hasContrast ? (
        <details
          className="punctuation-session-teach-details"
          data-punctuation-session-teach-details
          style={{ marginTop: 8 }}
        >
          <summary>Show example</summary>
          {hasWorked ? (
            <div className="small" style={{ marginTop: 8 }}>
              <strong>Worked example</strong>
              <div style={newlineTextStyle(box.workedExample.before)}>{box.workedExample.before}</div>
              <div style={newlineTextStyle(box.workedExample.after)}>{box.workedExample.after}</div>
            </div>
          ) : null}
          {hasContrast ? (
            <div className="small" style={{ marginTop: 8 }}>
              <strong>Common mistake</strong>
              <div style={newlineTextStyle(box.contrastExample.before)}>{box.contrastExample.before}</div>
              <div style={newlineTextStyle(box.contrastExample.after)}>{box.contrastExample.after}</div>
            </div>
          ) : null}
        </details>
      ) : null}
    </aside>
  );
}

// --- GPS "answers at the end" chip row -------------------------------------

function GpsDelayedFeedbackChips({ session }) {
  const answered = Number.isFinite(Number(session?.answeredCount)) ? Number(session.answeredCount) : 0;
  const length = Number.isFinite(Number(session?.length)) ? Number(session.length) : 0;
  return (
    <div className="chip-row" style={{ marginTop: 14 }}>
      <span className="chip">GPS check</span>
      <span className="chip punctuation-test-mode-banner" data-gps-banner>Test mode: answers at the end.</span>
      {length > 0 ? <span className="chip">{Math.min(length, answered + 1)} of {length}</span> : null}
    </div>
  );
}

// --- Active-item branch ----------------------------------------------------

function ActiveItemBranch({ ui, actions }) {
  // SH2-U1: JSX-layer guard for Skip. The primary Submit is inside
  // `ChoiceItem` / `TextItem` sub-components and already uses the
  // shared `composeIsDisabled` adapter-state gate; the hook is
  // belt-and-braces on the non-destructive Skip only. End-round-early
  // is treated as destructive per plan (see SH2-U1 "Do NOT touch
  // destructive actions" note) and is not wrapped.
  const submitLock = useSubmitLock();
  const session = ui.session || {};
  const item = session.currentItem || {};
  const isGps = session.mode === 'gps';
  const isDisabled = composeIsDisabled(ui);
  const submitLabel = punctuationSessionSubmitLabel(session);
  const progressLabel = punctuationSessionProgressLabel(session);
  const skillName = skillHeaderName(item);
  const modeLabel = sessionModeHeaderLabel(session.mode);
  const help = punctuationSessionHelpVisibility(session, 'active-item');
  const scene = bellstormSceneForPhase('active-item');
  const shape = punctuationSessionInputShape(item.mode);
  const submit = (payload) => actions.dispatch('punctuation-submit-form', payload);

  // Header line: `Question N of M · Skill · Mode`. Skill collapses when
  // the item carries no mapped skillIds (fresh / non-canonical payloads),
  // so the line never reads `"Question 1 of 4 ·  · Smart review"`.
  const headerPartsTop = [progressLabel, skillName, modeLabel].filter(Boolean);
  const headerTop = headerPartsTop.join(' · ');

  return (
    <section
      className="card border-top punctuation-surface punctuation-session-scene"
      data-punctuation-session-scene
      data-punctuation-phase="active-item"
      style={{ borderTopColor: '#B8873F' }}
    >
      <div className="punctuation-strip">
        <img
          src={scene.src}
          srcSet={scene.srcSet}
          sizes="(max-width: 980px) 100vw, 960px"
          alt=""
          aria-hidden="true"
        />
        <div>
          <div
            className="eyebrow punctuation-session-progress"
            data-punctuation-session-progress
          >
            {headerTop}
          </div>
          {/*
            Phase 4 U7: engine-sourced item prompts (e.g. "Correct the
            comma after the fronted adverbial.") pass through the child-
            register override so adult grammar terminology never reaches
            the learner.
          */}
          <h2 className="section-title">{punctuationChildRegisterOverrideString(item.prompt) || 'Punctuation practice'}</h2>
          <p className="subtitle">{currentItemInstruction(item)}</p>
        </div>
      </div>

      {isGps ? <GpsDelayedFeedbackChips session={session} /> : null}
      {help.showTeachBox ? <CollapsedTeachBox guided={session.guided} /> : null}

      {/*
       * adv-232-002 / adv-232-003: TextItem and ChoiceItem keys use
       * `session.answeredCount` as a monotonic counter so every item
       * transition forces a fresh React mount regardless of item content.
       *
       * The previous TextItem key `item.id || item.prompt || 'text-item'`
       * collided when two consecutive items shared the same prompt AND
       * carried an empty id (common for paragraph-repair + combine items
       * that cycle through the same stem shape). The collision reused the
       * existing component instance so the prior typed answer persisted
       * into the next item — exactly the learning #9 regression U3 was
       * meant to FIX.
       *
       * ChoiceItem previously had NO key at all — every consecutive
       * `choose` item reused the same instance, carrying the radio
       * selection from item N into item N+1.
       *
       * `answeredCount` increments on every submit (shared/punctuation/
       * service.js) so it is the robust per-transition counter — it does
       * not depend on item id or prompt content.
       */}
      {/* SH2-U3 input preservation contract: `pendingCommand` is
         DELIBERATELY absent from these keys. When a mid-type 401 clears
         `pendingCommand` (auth-required path or SH2-U2 rehydrate), the
         React keys tied to `session.answeredCount` stay stable so the
         uncontrolled `<input>` / `<textarea>` inside `ChoiceItem` /
         `TextItem` is retained and the learner's typed answer survives.
         Adding `pendingCommand` here would regress the contract covered
         by `tests/demo-expiry-banner.test.js::input-preservation`. */}
      <div className="punctuation-session-body" style={{ marginTop: 16 }}>
        {item.inputKind === 'choice' ? (
          <ChoiceItem
            key={`choice-item-${session.answeredCount || 0}`}
            item={item}
            disabled={isDisabled}
            submitLabel={submitLabel}
            onSubmit={submit}
          />
        ) : (
          <TextItem
            key={`text-item-${session.answeredCount || 0}`}
            item={item}
            disabled={isDisabled}
            submitLabel={submitLabel}
            shape={shape}
            onSubmit={submit}
          />
        )}
      </div>

      <div className="actions punctuation-session-secondary-actions" style={{ marginTop: 16 }}>
        <button
          className="btn ghost"
          type="button"
          disabled={isDisabled || submitLock.locked}
          data-punctuation-skip
          onClick={() => submitLock.run(async () => actions.dispatch('punctuation-skip'))}
        >
          Skip
        </button>
        <button
          className="btn ghost"
          type="button"
          disabled={isDisabled}
          data-punctuation-end-round
          onClick={() => actions.dispatch('punctuation-end-early')}
        >
          End round
        </button>
      </div>
    </section>
  );
}

// --- Feedback branch -------------------------------------------------------

// Plan R7: the feedback panel collapses to a one-line nudge + optional
// reveals. The old inline model + dotted-facet block is replaced by:
//   - `feedback.headline` (short nudge) + `feedback.body` subtitle.
//   - `<details>` → "Show model answer" revealing `feedback.displayCorrection`.
//   - `<details>` → "Show more" revealing up to 2 child-labelled facet chips
//     and any `misconceptionTags` that pass `punctuationChildMisconceptionLabel`.
function FeedbackBranch({ ui, actions }) {
  // SH2-U1: JSX-layer guard for Continue (minimal GPS + normal branches).
  // The hook instance is shared across the two Continue buttons because
  // only one branch renders at a time — a learner cannot tap a GPS
  // Continue and a post-feedback Continue in the same round.
  // End-round-early ("Finish now") is treated as destructive per plan
  // and is not wrapped.
  const submitLock = useSubmitLock();
  // Phase 4 U7: the feedback payload comes from the marking engine
  // (scope-locked by oracle replay) which can still emit adult grammar
  // terms in `headline` / `body` / `displayCorrection`. Route the whole
  // atom through the override helper so every user-visible string is
  // rewritten before the JSX references it. The helper is a no-op when
  // no override entries match.
  const feedback = punctuationChildRegisterOverride(ui.feedback) || ui.feedback || {};
  const session = ui.session || {};
  const scene = bellstormSceneForPhase('feedback');
  const isDisabled = composeIsDisabled(ui);
  const help = punctuationSessionHelpVisibility(session, 'feedback');
  const borderColor = feedback.kind === 'success' ? '#2E8479' : '#B8873F';

  // adv-232-004: the minimal-feedback branch gates on the authoritative
  // `!help.showFeedback` signal from `punctuationSessionHelpVisibility`,
  // not the literal string `session.mode === 'gps'`. `help` is the
  // single source of truth for whether the feedback panel renders in a
  // given phase — gating on it keeps the two in lock-step, so any future
  // read-model shape that flips `showFeedback: false` (today only GPS
  // mode does, but the contract is open-ended) also hides
  // `feedback.displayCorrection` rather than leaking it behind a
  // `<details>`. Behaviourally identical to the old gate today; future-
  // proof against any `session.mode` coercion / re-label (e.g. a legacy-
  // cluster mode being normalised to `'smart'` by
  // `punctuationPrimaryModeFromPrefs`).
  //
  // GPS's scheduler still skips the `feedback` phase by design (learning
  // #10). If we land here anyway, the minimal "Continue" surface fires
  // so the learner never sees per-item feedback in a GPS round.
  if (!help.showFeedback) {
    return (
      <section
        className="card border-top punctuation-surface punctuation-session-scene"
        data-punctuation-session-scene
        data-punctuation-phase="feedback"
        style={{ borderTopColor: borderColor }}
      >
        <div className="punctuation-strip">
          <img
            src={scene.src}
            srcSet={scene.srcSet}
            sizes="(max-width: 980px) 100vw, 960px"
            alt=""
            aria-hidden="true"
          />
          <div>
            <div className="eyebrow">{punctuationPhaseLabel('feedback')}</div>
            <h2 className="section-title">Saved</h2>
            <p className="subtitle">Your answer is locked in. Answers come at the end of the round.</p>
          </div>
        </div>
        <div className="actions" style={{ marginTop: 16 }}>
          <button
            className="btn primary"
            type="button"
            disabled={isDisabled || submitLock.locked}
            data-punctuation-continue
            onClick={() => submitLock.run(async () => actions.dispatch('punctuation-continue'))}
          >
            Continue
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={isDisabled}
            onClick={() => actions.dispatch('punctuation-end-early')}
          >
            Finish now
          </button>
        </div>
      </section>
    );
  }

  const facetChips = punctuationFeedbackChips(feedback.facets);
  const misconceptionLabels = Array.isArray(feedback.misconceptionTags)
    ? feedback.misconceptionTags
      .map((tag) => ({ tag, label: punctuationChildMisconceptionLabel(tag) }))
      .filter((entry) => typeof entry.label === 'string' && entry.label)
    : [];
  const hasDisplayCorrection = typeof feedback.displayCorrection === 'string' && feedback.displayCorrection;
  const hasExtras = facetChips.length > 0 || misconceptionLabels.length > 0;

  return (
    <section
      className="card border-top punctuation-surface punctuation-session-scene"
      data-punctuation-session-scene
      data-punctuation-phase="feedback"
      style={{ borderTopColor: borderColor }}
    >
      <div className="punctuation-strip">
        <img
          src={scene.src}
          srcSet={scene.srcSet}
          sizes="(max-width: 980px) 100vw, 960px"
          alt=""
          aria-hidden="true"
        />
        <div>
          <div className="eyebrow">{punctuationPhaseLabel('feedback')}</div>
          <h2 className="section-title">{feedback.headline || 'Feedback'}</h2>
          {feedback.body ? <p className="subtitle">{feedback.body}</p> : null}
        </div>
      </div>

      {hasDisplayCorrection ? (
        <details
          className="punctuation-session-feedback-model"
          data-punctuation-session-feedback-model
          style={{ marginTop: 14 }}
        >
          <summary>Show model answer</summary>
          <div
            className={`feedback ${feedback.kind === 'success' ? 'good' : 'warn'}`}
            style={{ marginTop: 8, ...newlineTextStyle(feedback.displayCorrection) }}
          >
            {feedback.displayCorrection}
          </div>
        </details>
      ) : null}

      {hasExtras ? (
        <details
          className="punctuation-session-feedback-more"
          data-punctuation-session-feedback-more
          style={{ marginTop: 14 }}
        >
          <summary>Show more</summary>
          {facetChips.length ? (
            <div className="chip-row" style={{ marginTop: 8 }}>
              {facetChips.map((chip) => (
                <span
                  key={chip.id}
                  className={`chip ${chip.ok ? 'good' : 'warn'}`}
                  data-punctuation-feedback-chip
                >
                  {chip.label}
                </span>
              ))}
            </div>
          ) : null}
          {misconceptionLabels.length ? (
            <div className="chip-row" style={{ marginTop: 8 }}>
              {misconceptionLabels.map(({ tag, label }) => (
                <span
                  key={tag}
                  className="chip warn"
                  data-punctuation-misconception-chip
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </details>
      ) : null}

      <div className="actions" style={{ marginTop: 16 }}>
        <button
          className="btn primary"
          type="button"
          disabled={isDisabled || submitLock.locked}
          data-punctuation-continue
          onClick={() => submitLock.run(async () => actions.dispatch('punctuation-continue'))}
        >
          Continue
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={isDisabled}
          onClick={() => actions.dispatch('punctuation-end-early')}
        >
          Finish now
        </button>
      </div>
    </section>
  );
}

// --- Default export --------------------------------------------------------

export function PunctuationSessionScene({ ui, actions }) {
  const phase = ui?.phase;
  if (phase === 'feedback') {
    return <FeedbackBranch ui={ui} actions={actions} />;
  }
  return <ActiveItemBranch ui={ui} actions={actions} />;
}
