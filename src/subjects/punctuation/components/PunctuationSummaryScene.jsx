// Phase 3 U4 — Punctuation Summary scene.
//
// Replaces the monolith's `SummaryView` with a standalone component. Summary
// now reads as:
//
//   - Bellstorm summary hero (eyebrow "Summary" + child headline).
//   - Score chip row: Answered / Correct / Accuracy (3 chips).
//   - Wobbly chips: `summary.focus` skillIds mapped through
//     `PUNCTUATION_CLIENT_SKILLS` to produce child labels like
//     "Speech punctuation needs another go" — NEVER raw skill ids.
//   - Active-only monster progress strip: iterate
//     `ACTIVE_PUNCTUATION_MONSTER_IDS` over `progressForPunctuationMonster`.
//     Reserved monsters (Colisk / Hyphang / Carillon) are never rendered.
//   - GPS summary (Phase 2 contract preserved): short review cards when
//     `summary.gps?.reviewItems` exists. `misconceptionTags` pipe through
//     `punctuationChildMisconceptionLabel`; null-mapped tags hide rather
//     than surfacing raw dotted ids.
//   - 4 next-action buttons (Practise wobbly / Open Map / Start again /
//     Back to dashboard).
//   - Secondary "Grown-up view" link. Action is a future Parent Hub hook —
//     today the button carries `data-action="punctuation-open-adult-view"`
//     and is a no-op at the dispatch layer until the Admin / Parent surface
//     lands.
//
// Every mutation control threads `composeIsDisabled(ui)` — the 4 primary
// buttons and the Grown-up link disable as a single bundle whenever
// availability flips to degraded / unavailable, a command is in flight, or
// the runtime is read-only (plan R11).
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
  punctuationChildMisconceptionLabel,
  punctuationMonsterDisplayName,
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

// Reward state lives under `ui.rewards?.monsters?.punctuation`. Fall back to
// an empty object so `progressForPunctuationMonster` can still return a safe
// stage 0 progress shape for fresh learners.
function rewardStateForPunctuation(ui) {
  const rewards = ui && typeof ui === 'object' && !Array.isArray(ui) ? ui.rewards : null;
  if (!rewards || typeof rewards !== 'object' || Array.isArray(rewards)) return {};
  const monsters = rewards.monsters;
  if (!monsters || typeof monsters !== 'object' || Array.isArray(monsters)) return {};
  const punctuationState = monsters.punctuation;
  if (!punctuationState || typeof punctuationState !== 'object' || Array.isArray(punctuationState)) return {};
  return punctuationState;
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
function WobblyChipRow({ focus }) {
  const ids = Array.isArray(focus) ? focus.filter((id) => typeof id === 'string' && id) : [];
  if (!ids.length) return null;
  const chips = [];
  for (const skillId of ids) {
    const name = summaryFocusSkillLabel(skillId);
    if (!name) continue;
    chips.push({ id: skillId, label: `${name} needs another go` });
  }
  if (!chips.length) return null;
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
function MonsterProgressStrip({ ui }) {
  const rewardState = rewardStateForPunctuation(ui);
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
  const isDisabled = composeIsDisabled(ui);
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
        disabled={isDisabled}
        data-action="punctuation-back"
        onClick={() => actions.dispatch('punctuation-back')}
      >
        Back to dashboard
      </button>
    </div>
  );
}

// --- Grown-up view link ----------------------------------------------------

// Future Parent Hub hook (origin R34 / plan Q§"Grown-up view"). The action
// is NOT yet wired at the dispatch layer; rendering carries the data-action
// so an adult surface can listen later without the Summary scene needing a
// follow-up PR. Threads `composeIsDisabled(ui)` so the link visibly pauses
// alongside the primary buttons (plan R11).
function GrownUpViewLink({ ui, actions }) {
  const isDisabled = composeIsDisabled(ui);
  return (
    <div
      className="punctuation-summary-grown-up small muted"
      style={{ marginTop: 12 }}
    >
      <button
        type="button"
        className="btn ghost small"
        disabled={isDisabled}
        data-action="punctuation-open-adult-view"
        onClick={() => actions.dispatch('punctuation-open-adult-view')}
      >
        Grown-up view
      </button>
    </div>
  );
}

// --- Scene -----------------------------------------------------------------

export function PunctuationSummaryScene({ ui = {}, actions = { dispatch() {} } }) {
  const summary = ui && typeof ui === 'object' && !Array.isArray(ui) ? (ui.summary || {}) : {};
  const scene = bellstormSceneForPhase('summary');
  const headline = typeof summary.label === 'string' && summary.label
    ? summary.label
    : 'Punctuation session summary';
  const subtitle = typeof summary.message === 'string' && summary.message
    ? summary.message
    : 'Session complete.';
  return (
    <section
      className="card border-top punctuation-surface"
      data-punctuation-summary
      style={{ borderTopColor: '#2E8479' }}
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
      <MonsterProgressStrip ui={ui} />
      <GpsReviewBlock gps={summary.gps} />
      <NextActionRow ui={ui} actions={actions} />
      <GrownUpViewLink ui={ui} actions={actions} />
    </section>
  );
}
