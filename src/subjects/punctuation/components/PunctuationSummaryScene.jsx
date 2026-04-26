// Phase 3 U4 — Punctuation Summary scene.
//
// Replaces the monolith's `SummaryView` with a standalone component. Summary
// now reads as:
//
//   - Bellstorm summary hero (eyebrow "Summary" + celebratory headline via
//     `punctuationSummaryHeadline(summary)` — accuracy-bucketed child copy
//     replaces the clinical `summary.label` default).
//   - Score chip row: Answered / Correct / Accuracy (3 chips).
//   - Wobbly chips: `summary.focus` skillIds mapped through
//     `PUNCTUATION_CLIENT_SKILLS` to produce child labels like
//     "Speech punctuation needs another go" — NEVER raw skill ids. An empty
//     focus array renders a single positive chip ("Everything was secure
//     this round!") rather than dead whitespace.
//   - Active-only monster progress strip: iterate
//     `ACTIVE_PUNCTUATION_MONSTER_IDS` over `progressForPunctuationMonster`
//     against the flat `ui.rewardState` path (the same path MapScene reads,
//     and the path the Grammar surface already wires). Reserved monsters
//     (Colisk / Hyphang / Carillon) are never rendered.
//   - GPS summary (Phase 2 contract preserved): short review cards when
//     `summary.gps?.reviewItems` exists. `misconceptionTags` pipe through
//     `punctuationChildMisconceptionLabel`; null-mapped tags hide rather
//     than surfacing raw dotted ids.
//   - 4 next-action buttons (Practise wobbly / Open Map / Start again /
//     Back to dashboard).
//
// Every mutation control threads `composeIsDisabled(ui)` — the 4 primary
// buttons disable as a single bundle whenever availability flips to
// degraded / unavailable, a command is in flight, or the runtime is
// read-only (plan R11).
//
// SSR blind spots (learning #6): pointer-capture, focus, and scroll-into-view
// are NOT observable via node:test + SSR. Every feature that claims a
// behavioural guarantee comes with a paired state-level or DOM-match
// assertion (learning #7).

import React from 'react';

import {
  ACTIVE_PUNCTUATION_MONSTER_IDS,
  bellstormSceneForPhase,
  composeIsDisabled,
  composeIsNavigationDisabled,
  punctuationChildMisconceptionLabel,
  punctuationMonsterDisplayName,
  punctuationSummaryHeadline,
} from './punctuation-view-model.js';
import { PUNCTUATION_CLIENT_SKILLS } from '../read-model.js';
import { progressForPunctuationMonster } from '../../../platform/game/mastery/index.js';

// --- Local helpers ---------------------------------------------------------

// Lookup skill name for a summary focus id. Scanning the frozen
// `PUNCTUATION_CLIENT_SKILLS` manifest keeps the Map and Summary scenes
// reading the same canonical names. Unknown ids return `null` so the chip
// is skipped rather than surfacing the raw dotted id (plan R15 / U10 sweep).
const CLIENT_SKILL_NAMES_BY_ID = new Map(
  PUNCTUATION_CLIENT_SKILLS.map((skill) => [skill.id, skill.name]),
);

function summaryFocusSkillLabel(skillId) {
  if (typeof skillId !== 'string' || !skillId) return null;
  const name = CLIENT_SKILL_NAMES_BY_ID.get(skillId);
  return typeof name === 'string' && name ? name : null;
}

function newlineTextStyle(value) {
  return String(value || '').includes('\n') ? { whiteSpace: 'pre-wrap' } : undefined;
}

// U4 follower (HIGH 1 — monster strip dead path): reward state lives at the
// flat `ui.rewardState` path, the same path `PunctuationMapScene` reads and
// that `GrammarPracticeSurface` resolves before passing to the summary scene
// as a prop. The pre-fix shape (`ui.rewards.monsters.punctuation`) was only
// ever set by fixtures — no production write path populated it, so every
// real learner saw "Stage 0 of 4" across all four monsters regardless of
// their actual progress. The surface now accepts a resolved `rewardState`
// prop (Grammar precedent); this helper falls back to `ui.rewardState` and
// finally to an empty object so `progressForPunctuationMonster` can still
// return a safe stage 0 shape for fresh learners.
function rewardStateForPunctuation(ui, propRewardState) {
  if (propRewardState && typeof propRewardState === 'object' && !Array.isArray(propRewardState)) {
    return propRewardState;
  }
  const fromUi = ui && typeof ui === 'object' && !Array.isArray(ui) ? ui.rewardState : null;
  if (fromUi && typeof fromUi === 'object' && !Array.isArray(fromUi)) return fromUi;
  return {};
}

// --- Score chips -----------------------------------------------------------

function ScoreChipRow({ summary }) {
  const total = Number(summary?.total) || 0;
  const correct = Number(summary?.correct) || 0;
  const accuracy = Number(summary?.accuracy) || 0;
  return (
    <div className="stat-grid punctuation-summary-score" style={{ marginTop: 16 }}>
      <div className="stat">
        <div className="stat-label">Answered</div>
        <div className="stat-value">{total}</div>
        <div className="stat-sub">This session</div>
      </div>
      <div className="stat">
        <div className="stat-label">Correct</div>
        <div className="stat-value">{correct}</div>
        <div className="stat-sub">Clean attempts</div>
      </div>
      <div className="stat">
        <div className="stat-label">Accuracy</div>
        <div className="stat-value">{accuracy}%</div>
        <div className="stat-sub">Session score</div>
      </div>
    </div>
  );
}

// --- Wobbly chips ----------------------------------------------------------

// `summary.focus` is an array of skill ids from `sessionFocus` in
// `shared/punctuation/service.js`. The scene maps each id to its child name
// via `PUNCTUATION_CLIENT_SKILLS`, then wraps the name in the "needs another
// go" nudge copy. Unknown ids are silently dropped (the safe default per
// learning #9 — better an empty chip row than a leaked raw id).
//
// U4 follower (design-lens MEDIUM 4): when there are no wobbly skills
// (either because `summary.focus` is empty, or every id mapped to null),
// render a positive "Everything was secure this round!" chip so the slot
// still communicates round outcome rather than rendering as empty space.
function WobblyChipRow({ focus }) {
  const ids = Array.isArray(focus) ? focus.filter((id) => typeof id === 'string' && id) : [];
  const chips = [];
  for (const skillId of ids) {
    const name = summaryFocusSkillLabel(skillId);
    if (!name) continue;
    chips.push({ id: skillId, label: `${name} needs another go` });
  }
  if (!chips.length) {
    return (
      <div
        className="chip-row punctuation-summary-wobbly punctuation-summary-wobbly--empty"
        role="group"
        aria-label="Round outcome"
        style={{ marginTop: 14 }}
      >
        <span className="chip good" data-punctuation-summary-wobbly-empty>
          Everything was secure this round!
        </span>
      </div>
    );
  }
  return (
    <div
      className="chip-row punctuation-summary-wobbly"
      role="group"
      aria-label="Skills that need another go"
      style={{ marginTop: 14 }}
    >
      {chips.map((chip) => (
        <span className="chip warn" key={`wobbly-${chip.id}`} data-skill-id={chip.id}>
          {chip.label}
        </span>
      ))}
    </div>
  );
}

// --- Active monster progress strip -----------------------------------------

// Iterates the frozen `ACTIVE_PUNCTUATION_MONSTER_IDS` roster only —
// reserved monsters (Colisk / Hyphang / Carillon) never surface here even
// if the reward state contains them (plan R10 / learning #5). Progress is
// rendered as 5 stage dots (0–4) per monster so the strip keeps its shape
// across fresh learners and secure releases.
function MonsterProgressStrip({ ui, rewardState: propRewardState }) {
  const rewardState = rewardStateForPunctuation(ui, propRewardState);
  return (
    <div
      className="punctuation-summary-monsters"
      role="group"
      aria-label="Punctuation monster progress"
      style={{ marginTop: 16 }}
    >
      {ACTIVE_PUNCTUATION_MONSTER_IDS.map((monsterId) => {
        const progress = progressForPunctuationMonster(rewardState, monsterId);
        const stage = Math.max(0, Math.min(4, Number(progress?.stage) || 0));
        const name = punctuationMonsterDisplayName(monsterId);
        return (
          <div
            className="punctuation-summary-monster"
            data-monster-id={monsterId}
            key={`monster-${monsterId}`}
          >
            <div className="punctuation-summary-monster-name">{name}</div>
            <div
              className="punctuation-summary-monster-dots"
              aria-label={`${name} stage ${stage} of 4`}
            >
              {[0, 1, 2, 3].map((index) => (
                <span
                  key={`dot-${monsterId}-${index}`}
                  className={`punctuation-summary-monster-dot${index < stage ? ' on' : ''}`}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="punctuation-summary-monster-stage small muted">
              Stage {stage} of 4
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- GPS review cards (Phase 2 contract preserved) -------------------------

// Renders the `summary.gps.reviewItems` cards when present. The recommended
// next action uses `summary.gps.recommendedLabel` (child copy) — NEVER the
// raw `recommendedMode` id. `misconceptionTags` pipe through
// `punctuationChildMisconceptionLabel`; tags with no mapped child label are
// silently dropped so the chip row stays empty rather than leaking dotted
// ids (plan R15).
function GpsReviewBlock({ gps }) {
  const reviewItems = Array.isArray(gps?.reviewItems) ? gps.reviewItems : [];
  if (!reviewItems.length) return null;
  const recommendedLabel = typeof gps?.recommendedLabel === 'string' && gps.recommendedLabel
    ? gps.recommendedLabel
    : 'Smart review';
  return (
    <div className="callout punctuation-gps-review" style={{ marginTop: 16 }}>
      <strong>GPS review</strong>
      <div className="small muted" style={{ marginTop: 6 }}>
        Next up: {recommendedLabel}
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {reviewItems.map((entry) => {
          const tags = Array.isArray(entry.misconceptionTags) ? entry.misconceptionTags : [];
          // Map raw dotted tags to child labels and dedupe — a single GPS
          // item that trips two sub-tags within the same facet should read
          // as one chip, not two identical labels.
          const tagLabels = [];
          const seenLabels = new Set();
          for (const tag of tags) {
            const label = punctuationChildMisconceptionLabel(tag);
            if (!label || seenLabels.has(label)) continue;
            seenLabels.add(label);
            tagLabels.push({ id: tag, label });
          }
          return (
            <div
              key={`${entry.index}-${entry.itemId}`}
              className={`feedback ${entry.correct ? 'good' : 'warn'}`}
            >
              <strong>{entry.index}. {entry.correct ? 'Correct' : 'Review'}</strong>
              <div style={{ marginTop: 6 }}>{entry.prompt}</div>
              {entry.attemptedAnswer ? (
                <div className="small" style={{ marginTop: 6 }}>
                  Answer: {entry.attemptedAnswer}
                </div>
              ) : null}
              {entry.displayCorrection ? (
                <div
                  className="small"
                  style={{ marginTop: 6, ...newlineTextStyle(entry.displayCorrection) }}
                >
                  Model: {entry.displayCorrection}
                </div>
              ) : null}
              {tagLabels.length ? (
                <div className="chip-row" style={{ marginTop: 8 }}>
                  {tagLabels.map((tag) => (
                    <span
                      className="chip warn"
                      key={`${entry.itemId}-${tag.id}`}
                    >
                      {tag.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Next-action buttons ---------------------------------------------------

function NextActionRow({ ui, actions }) {
  // Phase 4 U6: mutation controls keep `composeIsDisabled` — they pause while
  // a command is in flight or the runtime is degraded / unavailable / read-
  // only. Navigation ("Back to dashboard") threads the sibling
  // `composeIsNavigationDisabled` so a stalled `pendingCommand` or a
  // degraded runtime never traps the child on the Summary scene (plan R7 /
  // AE7). The ghost-button divergence is the canonical example the Map
  // top-bar and Skill Detail close mirror.
  const isDisabled = composeIsDisabled(ui);
  const isNavigationDisabled = composeIsNavigationDisabled(ui);
  return (
    <div className="actions punctuation-summary-actions" style={{ marginTop: 16 }}>
      <button
        className="btn primary"
        type="button"
        disabled={isDisabled}
        data-action="punctuation-start"
        data-value="weak"
        onClick={() => actions.dispatch('punctuation-start', { mode: 'weak' })}
      >
        Practise wobbly spots
      </button>
      <button
        className="btn secondary"
        type="button"
        disabled={isDisabled}
        data-action="punctuation-open-map"
        onClick={() => actions.dispatch('punctuation-open-map')}
      >
        Open Punctuation Map
      </button>
      <button
        className="btn secondary"
        type="button"
        disabled={isDisabled}
        data-action="punctuation-start-again"
        data-punctuation-start-again
        onClick={() => actions.dispatch('punctuation-start-again')}
      >
        Start again
      </button>
      <button
        className="btn ghost"
        type="button"
        disabled={isNavigationDisabled}
        data-action="punctuation-back"
        onClick={() => actions.dispatch('punctuation-back')}
      >
        Back to dashboard
      </button>
    </div>
  );
}

// --- Scene -----------------------------------------------------------------

// U4 follower (adversarial MEDIUM 1): the Grown-up view placeholder button
// was dispatching a `punctuation-open-adult-view` action with no handler —
// a child tap produced a silent no-op. The plan allowed a placeholder, but
// the reviewer-consensus rule is "don't ship dead UX". Parent Hub will add
// this surface when the adult view ships (PR body notes the deferral); the
// Summary scene renders no Grown-up affordance today.

export function PunctuationSummaryScene({
  ui = {},
  actions = { dispatch() {} },
  rewardState = null,
}) {
  const summary = ui && typeof ui === 'object' && !Array.isArray(ui) ? (ui.summary || {}) : {};
  const scene = bellstormSceneForPhase('summary');
  // Accuracy-bucketed celebration copy (design-lens HIGH 2). The helper
  // returns null when `summary.accuracy` is missing / malformed; the label
  // fallback keeps the hero filled even for degenerate payloads.
  const tonalHeadline = punctuationSummaryHeadline(summary);
  const headline = typeof tonalHeadline === 'string' && tonalHeadline
    ? tonalHeadline
    : (typeof summary.label === 'string' && summary.label
      ? summary.label
      : 'Punctuation session summary');
  const subtitle = typeof summary.message === 'string' && summary.message
    ? summary.message
    : 'Session complete.';
  return (
    <section
      className="card border-top punctuation-surface"
      data-punctuation-summary
      // U4 follower (design-lens MEDIUM 5): borderTopColor now matches the
      // canonical Punctuation accent `#B8873F` (Bellstorm gold) rather than
      // the stray `#2E8479` teal. Aligns with `PunctuationPracticeSurface`
      // and the module's `accent` field.
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
          <div className="eyebrow">Summary</div>
          <h2 className="section-title">{headline}</h2>
          <p className="subtitle">{subtitle}</p>
        </div>
      </div>
      <ScoreChipRow summary={summary} />
      <WobblyChipRow focus={summary.focus} />
      <MonsterProgressStrip ui={ui} rewardState={rewardState} />
      <GpsReviewBlock gps={summary.gps} />
      <NextActionRow ui={ui} actions={actions} />
    </section>
  );
}
